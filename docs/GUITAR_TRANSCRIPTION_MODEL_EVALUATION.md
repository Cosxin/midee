# Guitar transcription model evaluation (M1 spike)

**Date:** 2026-07-21
**Status:** Complete (non-blocking research spike)
**Owner artifacts:** [`tools/guitar-model-spike/`](../tools/guitar-model-spike/) (isolated tooling, deterministic manifest/runner), this document.
**Does not touch:** root `package.json`/`package-lock.json`, `src/`, or any shipped Midee code path.

## TL;DR

None of the four candidates is "same-level" as Midee's current piano
approach (an Onsets & Velocities piano-transcription model — see
`README.md`'s Bluetooth-audio data-flow diagram — which reaches near-studio
note accuracy on a well-understood, decades-mature MIR task). For guitar:

- **Spotify Basic Pitch (TS)** is the only one of the four that is directly
  usable *today*: real license, real npm package, real ~900KB model,
  installs and builds cleanly under an isolated Vite 8 project, and was
  actually run end-to-end against 12 real GuitarSet excerpts in this spike.
  With the correct (upstream Python) inference thresholds it reaches a
  **0.750 mean onset F1 @ 50ms** but only **0.543 mean onset+offset F1**
  across the 12 real tracks measured — decent onset detection, much
  weaker sustained-note timing, and it is instrument-agnostic (not
  guitar-specialized). Good enough to prototype against, not good enough
  to treat as ground truth.
- **GAPS / high-resolution guitar transcription** (Xavier Riley et al.) is
  **not usable at all**: no public code, wrapper, or checkpoint exists.
  This is a hard blocker (verified by exhausting primary sources), not an
  environment limitation.
- **GuitarMidi-LV2** is a hobbyist LV2 plugin with real, if narrow,
  functionality (documented, self-reported low latency) but unverified on
  Raspberry Pi/ARM in this spike (no Pi hardware available) and has
  documented accuracy limitations (fixed velocity, notes above ~E5 not
  detected, major/minor chord bias).
- **FretNet** is openly-licensed (MIT) research code accompanying an
  ICASSP 2023 paper, with no released pretrained weights — remains
  research-only / unverified for direct use.

Whichever model (if any) is eventually adopted, its job is narrow: **all
four candidates output pitch/note events, not tablature or fingering** —
that pitch-only signal is exactly the shape Midee's pipeline already
consumes end-to-end for piano (`MIDI note → ergonomic mapper → LED
index`). String/fret-aware output (which only FretNet's *architecture*, not
its released artifacts, would provide) is not required for Midee's current
mapping approach.

---

## Methodology

### Deterministic 12-track GuitarSet v1.1 subset

GuitarSet v1.1 ([Xi et al. 2018, ISMIR](https://zenodo.org/records/3371780),
CC-BY-4.0) contains 360 excerpts: 6 players (`00`-`05`) × 5 styles × 3
progressions × 2 tempi × {comp, solo}. Per the spike's requirements, this
evaluation uses exactly **12 tracks: one `comp` and one `solo` excerpt per
player**.

Selection is deterministic and reproducible
(`tools/guitar-model-spike/scripts/select-subset.mjs`): the real, verified
list of all 360 `track_id`s (obtained by listing the actual `annotation.zip`
fetched from the primary Zenodo record, not guessed or reconstructed from
combinatorics — see provenance block in
`tools/guitar-model-spike/data/guitarset-track-list.json`) is grouped by
`(player, comp|solo)`, and within each 30-candidate group the track with the
**lexicographically smallest SHA-256 hash of its `track_id`** is picked.
This is independent of list order, download order, or wall-clock time, so
re-running `node scripts/select-subset.mjs` against the frozen input always
yields the same 12 tracks:

| Player | Comp | Solo |
| --- | --- | --- |
| 00 | `00_SS1-68-E_comp` | `00_BN1-129-Eb_solo` |
| 01 | `01_BN2-166-Ab_comp` | `01_Jazz1-130-D_solo` |
| 02 | `02_Rock3-148-C_comp` | `02_SS1-100-C#_solo` |
| 03 | `03_Jazz1-200-B_comp` | `03_Jazz2-110-Bb_solo` |
| 04 | `04_SS3-98-C_comp` | `04_Jazz1-200-B_solo` |
| 05 | `05_SS1-68-E_comp` | `05_Rock2-85-F_solo` |

### Data access without full-archive downloads

GuitarSet's audio archives on Zenodo are 657MB-3.6GB each. This
environment's measured network throughput was **~70-85 KB/s** (confirmed
consistently against zenodo.org, huggingface.co, and registry.npmjs.org —
a sandbox-wide cap, not host-specific), which would make a full-archive
download take ~2.5 hours. Because Zenodo's file-serving endpoint *does*
honor HTTP `Range` requests (verified: `Range: bytes=0-1000` against
`audio_mono-mic.zip` returns `206 Partial Content` /
`Content-Range: bytes 0-1000/656927981`), `tools/guitar-model-spike/scripts/remote-zip.mjs`
implements a small dependency-free partial-ZIP reader (parses the End-Of-
Central-Directory and Central Directory records via ranged reads, then
range-fetches and inflates only the requested members). This pulled just
the 12 needed `_mic.wav` files (+ 12 matching `.jams` annotation files)
totaling ~30MB, in a few minutes, instead of downloading ~700MB of audio
that would go unused.

### Real audio and ground truth used

All 12 tracks' real microphone recordings (`{track_id}_mic.wav`, 44.1kHz
16-bit PCM) and real ground-truth note annotations
(`{track_id}.jams` → merged `note_midi` observations across all 6 strings)
were fetched from the canonical Zenodo record and cached locally
(`.cache/`, gitignored, never committed). SHA-256 checksums of every
fetched file are recorded in `results/fetch-report.json`.

### Metrics

`tools/guitar-model-spike/scripts/metrics.mjs` implements mir_eval-style
note-transcription metrics:

- **Onset F1 @ 50ms**: predicted note matches a ground-truth note if MIDI
  pitch is exact and `|onset_pred - onset_gt| ≤ 50ms`.
- **Onset+offset F1**: same onset criterion, plus
  `|offset_pred - offset_gt| ≤ max(50ms, 0.2 × gt_duration)`.
- Matching is greedy nearest-onset assignment (a documented simplification
  of mir_eval's Hungarian-algorithm optimum; collisions are rare for solo
  guitar and don't materially change P/R/F1 at this scale).
- False positives / negatives, precision, recall reported alongside F1.

---

## Model 1: Spotify Basic Pitch (TypeScript) — **directly usable, validated**

- **Primary sources:** [`spotify/basic-pitch-ts`](https://github.com/spotify/basic-pitch-ts) (commit `2d498f82b61c71898edf0e8dd661b99076676c8b`, tag `v1.0.1`), npm `@spotify/basic-pitch@1.0.1`. Python sibling [`spotify/basic-pitch`](https://github.com/spotify/basic-pitch) (commit `fa5997af0a8210982619003269994a1be25eddf3`) used only to confirm upstream inference-threshold defaults.
- **License:** Apache-2.0 (both repo and npm `license` field).
- **Paper:** Bittner et al., "A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation," ICASSP 2022. Instrument-agnostic — not guitar-specialized.
- **Model weights:** shipped inside the npm package: `model.json` (174,537 bytes) + `group1-shard1of1.bin` (742,392 bytes) = **916,929 bytes (~896 KiB) total**, verified by direct inspection of the installed `node_modules/@spotify/basic-pitch/model/`.
- **Inference window:** 2-second frames, 22050 Hz mono input (resampled internally), FFT hop 256 (≈86.13 fps annotation rate), 30-frame overlap between windows.
- **Output features:** per-frame pitch/onset/contour activations converted to discrete note events (`startTimeSeconds`, `durationSeconds`, `pitchMidi`, `amplitude`, optional `pitchBends[]`) — pitch-only, no string/fret/tab information.

### Isolated Vite 8 browser build — actually run

```
tools/guitar-model-spike$ npm run build:browser-smoke
✓ 1242 modules transformed, built in 168ms
dist/index.html                    0.24 kB │ gzip:   0.18 kB
dist/assets/model-*.json         174.53 kB │ gzip:   8.41 kB
dist/assets/index-*.js         1,031.66 kB │ gzip: 256.59 kB
```

This confirms `@spotify/basic-pitch` bundles cleanly under this repo's
pinned Vite major version (`vite: "^8.0.0"` in root `package.json`). Real
gzip payload for the JS bundle (includes `@tensorflow/tfjs` + basic-pitch +
`@tonejs/midi`, all pulled in transitively) is **256.59 KB**.

**Integration finding:** the weight shard (`group1-shard1of1.bin`, 742KB)
is **not** automatically picked up by Vite's static-asset scanner — only
`model.json` was, because the shard path is referenced dynamically inside
the JSON manifest at *runtime* (by `tf.io`'s browser HTTP loader), not
through a statically-analyzable `new URL(...)` Vite can follow. A real
integration needs an explicit step (e.g. `vite-plugin-static-copy`, or
placing model files under `public/`) to ship the `.bin` shard. This is
worth flagging now — it's an easy silent-failure trap (model.json loads,
then the shard 404s at runtime) if not accounted for during any real
integration attempt.

### Node inference harness — actually run against all 12 tracks

Running full browser inference (WebGL/WASM) required a headless browser
(Playwright), whose binary downloads were not practical at this
environment's measured ~70-85 KB/s. Instead,
`scripts/basic-pitch-runner.mjs` runs the **same `@spotify/basic-pitch`
package code** via the pure-JS `@tensorflow/tfjs` **CPU** backend in plain
Node (no `@tensorflow/tfjs-node` native binary — its postinstall pulls a
~100MB+ prebuilt TensorFlow C library, also impractical at this bandwidth).
This is disclosed explicitly because it changes what the RTF number means:
the CPU JS backend is *slower* than a real browser's WebGL/WASM backend
would be, so the measured RTF below is a **conservative (pessimistic)
bound** on in-browser performance, not an optimistic one. Audio decode used
a from-scratch 16-bit PCM WAV reader + linear resampler to 22050Hz mono (no
Web Audio API / native decode dependency needed, since
`BasicPitch.evaluateModel()` accepts a plain `Float32Array` directly).

Two threshold profiles were run, because this materially changes the
result and the basic-pitch-ts README's usage example does **not** use the
same defaults as the upstream Python CLI:

| Profile | onset_threshold | frame_threshold | minimum_note_length |
| --- | --- | --- | --- |
| `ts-readme-example` (illustrative values from the JS README's usage snippet) | 0.25 | 0.25 | 5 frames (~58ms) |
| `upstream-python-defaults` (spotify/basic-pitch `predict.py` argparse defaults) | 0.5 | 0.3 | 11 frames (127.70ms) |

**Results — `upstream-python-defaults` (representative; primary numbers):**

| Track | Style | RTF | Onset F1@50ms | Onset+Offset F1 | GT notes | Pred notes | FP | FN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `00_SS1-68-E_comp` | comp | 0.602 | 0.638 | 0.319 | 189 | 306 | 148 | 31 |
| `00_BN1-129-Eb_solo` | solo | 0.607 | 0.747 | 0.578 | 71 | 95 | 33 | 9 |
| `01_BN2-166-Ab_comp` | comp | 0.626 | 0.730 | 0.430 | 260 | 233 | 53 | 80 |
| `01_Jazz1-130-D_solo` | solo | 0.616 | 0.873 | 0.718 | 68 | 74 | 12 | 6 |
| `02_Rock3-148-C_comp` | comp | 0.594 | 0.649 | 0.358 | 435 | 302 | 63 | 196 |
| `02_SS1-100-C#_solo` | solo | 0.603 | 0.871 | 0.774 | 59 | 65 | 11 | 5 |
| `03_Jazz1-200-B_comp` | comp | 0.602 | 0.647 | 0.559 | 82 | 54 | 10 | 38 |
| `03_Jazz2-110-Bb_solo` | solo | 0.613 | 0.894 | 0.854 | 99 | 100 | 11 | 10 |
| `04_SS3-98-C_comp` | comp | 0.597 | 0.619 | 0.241 | 268 | 320 | 138 | 86 |
| `04_Jazz1-200-B_solo` | solo | 0.605 | 0.769 | 0.598 | 65 | 52 | 7 | 20 |
| `05_SS1-68-E_comp` | comp | 0.594 | 0.651 | 0.261 | 143 | 293 | 151 | 1 |
| `05_Rock2-85-F_solo` | solo | 0.602 | 0.913 | 0.825 | 125 | 127 | 12 | 10 |

| Metric | Value |
| --- | --- |
| Mean onset F1 @ 50ms | **0.750** |
| Mean onset+offset F1 | **0.543** |
| Mean real-time factor | **0.605** (CPU JS backend — conservative/pessimistic bound; see note above) |
| Total false positives (onset-only) | 649 |
| Total false negatives (onset-only) | 492 |
| Peak process RSS (whole 12-track run) | ~452 MB (`452448` KB, Node v25.9.0, darwin/arm64) |

Solo tracks consistently score higher (mean onset F1 ≈ 0.84) than comp
tracks (mean onset F1 ≈ 0.66) — expected, since comping involves denser
chord voicings (more simultaneous onsets, more octave/unison collisions)
that are harder for any polyphonic transcription model, guitar-specialized
or not. The onset+offset F1 gap below onset-only F1 on every track
confirms sustained-note duration is the weaker link, not onset detection.

**Results — `ts-readme-example` (for comparison; over-permissive onsets):**

| Metric | Value |
| --- | --- |
| Mean onset F1 @ 50ms | 0.527 |
| Mean onset+offset F1 | 0.283 |
| Mean real-time factor | 0.609 |
| Total false positives (onset-only) | 3,370 |
| Total false negatives (onset-only) | 249 |

The large gap between the two profiles (mean onset F1 0.527 vs. the
upstream-defaults number above) is driven almost entirely by false
positives — the illustrative TS-README thresholds are far more permissive
than what Spotify's own Python CLI ships as default, and over-predict notes
by roughly 2-3x on these guitar excerpts. **Any future integration should
use the upstream Python defaults (or better, guitar-specific tuning) as the
starting point, not the JS README's example values.**

- **Memory:** peak process RSS (`process.resourceUsage().maxRSS`, whole
  Node process, cumulative across all 12 tracks run sequentially in one
  process) was **~452 MB** on this machine (Node v25.9.0, darwin/arm64;
  443 MB on the separate `ts-readme-example` run) — this includes tfjs's
  CPU backend + graph model + all 12 audio buffers held in the harness at
  various points, so it is an upper bound, not a steady-state
  per-inference number.
- **Package/model bytes:** model 916,929 bytes; JS bundle 1,031,668 bytes
  raw / 256,590 bytes gzip (browser build, includes tfjs).
- **Browser/Pi packaging:** Browser — confirmed buildable (see above), with
  the asset-copy caveat noted. Pi — not evaluated in this spike (Basic
  Pitch is a browser/Node package; the existing Midee Pi pipeline already
  runs "Onsets & Velocities" for piano server-side under PipeWire, and a
  guitar equivalent would follow the same server-side pattern rather than
  running in a Pi browser — genuinely untested here, flagged as future
  work, not claimed).

---

## Model 2: GAPS / High-Resolution Guitar Transcription (Xavier Riley et al.) — **blocked, no artifact exists**

- **Papers:** "High Resolution Guitar Transcription via Domain Adaptation" (Riley, Edwards, Dixon; ICASSP 2024; [arXiv:2402.15258](https://arxiv.org/abs/2402.15258)) and "GAPS: A Large and Diverse Classical Guitar Dataset and Benchmark Transcription Model" (Riley, Guo, Edwards, Dixon; ISMIR 2024; [arXiv:2408.08653](https://arxiv.org/abs/2408.08653)).
- **Dataset license (GAPS):** CC BY-NC-SA 4.0 — **non-commercial**, which alone would block direct use in a commercial product even if code/weights existed.
- **Dataset access:** [Zenodo record 13962272](https://zenodo.org/records/13962272), single file `gaps_v1_no_audio.zip` (7,022,261 bytes) — score/alignment metadata only; the underlying commercial recordings are intentionally not redistributed.

**Exhaustive primary-source search performed (2026-07-21), see
`tools/guitar-model-spike/python/gaps_probe_README.md` for the full,
reproducible list of checks:** the companion "code" repository
([`xavriley/HighResolutionGuitarTranscription`](https://github.com/xavriley/HighResolutionGuitarTranscription),
commit `c82d461c38ae951840c97095b2b47d21ba5f12e9`) is a Nerfies website
template only — no model code. The GAPS project homepage links only to the
paper and the (code-free) Zenodo data record. All 127 of the lead author's
public GitHub repositories were enumerated via the GitHub API; he has
published inference-ready repos for *other* instruments from the same
research period (saxophone: `hf_midi_transcription`, `sax_transcription`;
drums: `DrumTranscription`) but **no equivalent guitar-transcription
inference repo exists**. Hugging Face Papers and Papers-with-Code list no
linked code or model for either paper.

**Conclusion: this is a hard blocker, not a bandwidth/environment
limitation.** There is nothing to install or run regardless of network
speed, OS, or hardware — no inference was attempted because no inference
code exists publicly. Status: **UNVERIFIED / NOT AVAILABLE**, and would
additionally require a commercial license negotiation with the authors
even if it existed, given the dataset's NC license.

---

## Model 3: GuitarMidi-LV2 (Gerald Mwangi) — **research/hobbyist; Pi/ARM unverified**

- **Primary source:** [`geraldmwangi/GuitarMidi-LV2`](https://github.com/geraldmwangi/GuitarMidi-LV2), commit `153327048989bffd3b623572eb5ddd0bc261b526`, latest tagged release "Expressivity" (v2.2, 2026-06-19).
- **License:** LGPL-2.0-or-later (per `LICENSE` file header: "version 2 of the License, or (at your option) any later version").
- **Architecture (per README):** a bank of Butterworth bandpass filters (148 filtered signals: 13 frets × 6 strings + 4 harmonics/note) feeding a custom CNN + transformer model (TensorFlow/Keras-trained), producing per-string fret-probability outputs combined into a 37-note polyphonic multi-label output, mapped to MIDI note-on/off (no string/fret metadata in the output — plain MIDI, directly compatible with Midee's existing note-driven pipeline).
- **Self-reported latency (author's own measurements, hardware unspecified in the README — not independently reproduced in this spike):** "4ms for the high open e (330Hz) and 16ms for the low E (82Hz)."
- **Documented limitations (from the README, not from our testing):**
  - Velocity is not extracted from audio — all MIDI notes fire at fixed velocity 127.
  - Only notes up to E5 (12th fret, high E string) are detected — author cites training-data/storage constraints ("current nvme shortage").
  - Chord detection is biased toward major/minor chords (the dominant chord types in its training data).
  - No MIDI panic control (host-dependent).
  - Harmonic bleed can trigger 2-3 spurious harmonic notes per played note.
- **Build:** requires `git`, `cmake`, `build-essential`, `libzita-resampler-dev`, `lv2-dev` — a Linux LV2 host toolchain. **Not attempted in this spike**: this sandbox is macOS/Darwin (arm64), not Linux, and has no LV2 host or Raspberry Pi hardware to validate against. Per this spike's scope, Pi/ARM latency claims for this plugin remain **UNVERIFIED / research-only** — the only latency numbers available are the author's own, on unknown hardware, and are reported here as such rather than re-stated as fact.
- **Zynthian community context:** a Raspberry Pi 5 discussion thread exists, but it discusses a *different* plugin ("PiPitch"), not GuitarMidi-LV2 — conflating the two would misrepresent GuitarMidi-LV2's Pi readiness, so it is called out explicitly here as a non-finding.

---

## Model 4: FretNet (Cwitkowitz et al.) — **research-only, no released weights**

- **Primary source:** [`cwitkowitz/guitar-transcription-continuous`](https://github.com/cwitkowitz/guitar-transcription-continuous), commit `d481054f54184374c04b1cc27a487dc35c87f353`.
- **Paper:** "FretNet: Continuous-Valued Pitch Contour Streaming for Polyphonic Guitar Tablature Transcription," Cwitkowitz, Hirvonen, Klapuri; ICASSP 2023.
- **License:** MIT (repo metadata + `LICENSE.txt`).
- **Dependencies:** Python/PyTorch, plus the author's own `amt-tools` (MIT) and `guitar-transcription-with-inhibition` (MIT) libraries, both real, maintained, MIT-licensed repos — but **no pretrained checkpoint is published in any of the three repos** (no GitHub Releases, no linked model host). The README's own "Six-Fold Cross-Validation on GuitarSet" scripts (`experiment.py`, `evaluation.py`) require training a model from scratch to obtain any usable weights.
- **Output features:** continuous-valued pitch contours grouped by string/fret of origin — the only one of the four candidates that natively outputs guitar-specific tablature-level structure, *if* a trained checkpoint existed.
- **Status: UNVERIFIED / research-only**, per this spike's scope — no attempt was made to train a model from scratch (out of scope for a feasibility spike; GuitarSet six-fold cross-validation training is a multi-hour-to-multi-day GPU undertaking, not a local verification step).

---

## Comparison table

| | Basic Pitch (TS) | GAPS / high-res guitar | GuitarMidi-LV2 | FretNet |
| --- | --- | --- | --- | --- |
| Direct-use status | **Usable, validated** | **Blocked — no artifact** | Usable (Linux/LV2 host), Pi unverified | Research-only, no weights |
| License | Apache-2.0 | CC BY-NC-SA 4.0 (dataset); no code license (none exists) | LGPL-2.0-or-later | MIT (code); no weights to license |
| Output | Pitch-only note events (+ optional pitch bend) | N/A | Pitch-only MIDI note on/off, fixed velocity | Pitch + string/fret (architecture only) |
| Onset F1 @ 50ms (this spike, 12-track subset) | **0.750 mean** (upstream thresholds) | not run (no artifact) | not measured (no Pi/Linux host here) | not run (no weights) |
| Onset+offset F1 (this spike) | **0.543 mean** (upstream thresholds) | not run | not measured | not run |
| Real-time factor | **0.605 mean** (CPU JS backend, conservative) | n/a | author-reported 4-16ms latency, unverified hardware | n/a |
| Browser packaging | **Confirmed** (Vite 8 build succeeds; asset-copy caveat noted) | n/a | n/a (native LV2 plugin, not browser) | n/a |
| Pi packaging | Not evaluated (would mirror existing PipeWire server-side pattern) | n/a | **Unverified** on this spike's hardware | n/a |

## Conclusion

**No candidate here is "same-level" as Midee's existing piano approach.**
The piano pipeline uses a mature, purpose-built, real-time piano
transcription model (Onsets & Velocities) on a well-studied MIR task with
decades of piano-specific training data (MAESTRO, MAPS). Guitar
transcription is a comparatively young, harder MIR problem (polyphonic,
string/fret-ambiguous, far less training data), and it shows: the one
model actually validated end-to-end in this spike (Basic Pitch, instrument-
agnostic, not guitar-specialized) landed at moderate note-level F1 on real
GuitarSet audio — a reasonable prototyping baseline, not a drop-in
replacement for ground-truth MIDI.

That said, **all four candidates' relevant output (where an output exists
at all) is pitch/note-level, which is exactly what Midee's ergonomic
mapper already consumes for piano** (`MIDI note → mapper → LED index`,
per `README.md`'s data-flow diagram). No candidate requires Midee to build
new string/fret-aware mapping logic to be usable — a future guitar
integration would plug into the same MIDI-note-event interface the piano
path already uses. That makes Basic Pitch a viable *next experiment* (not
a shippable feature) for a guitar mode, while GAPS remains unobtainable,
GuitarMidi-LV2 needs real Pi/ARM validation before any latency claim can be
trusted, and FretNet needs someone to actually train it before it's
anything but a paper.

## Risks

- **Accuracy risk:** Basic Pitch's measured onset+offset F1 is
  substantially lower than onset-only F1 across every profile tested here
  — sustained-note timing (not just onset detection) is the weaker link,
  which matters for Midee's key-down/key-up LED timing model.
- **License risk:** GAPS's CC BY-NC-SA 4.0 dataset license blocks
  commercial use even if code appeared; GuitarMidi-LV2's LGPL-2.0-or-later
  has copyleft implications for a statically-linked native integration
  (dynamic linking / plugin-boundary use is the safer LGPL pattern).
  Basic Pitch (Apache-2.0) and FretNet (MIT) are commercially
  unencumbered.
- **Unverified-claims risk:** GuitarMidi-LV2's latency numbers are the
  author's own, on unspecified hardware — do not cite them as Midee-Pi
  numbers without independent Pi measurement.
- **Threshold-sensitivity risk:** as shown above, Basic Pitch's headline
  accuracy swings by roughly 2x in F1 depending on undocumented threshold
  choice — any future integration must pin and justify its thresholds
  explicitly rather than copying an illustrative README snippet.

## Reproducibility

All findings with a checkmark above were produced by the code in
`tools/guitar-model-spike/` against real, checksummed GuitarSet v1.1 data
(see `results/fetch-report.json` for per-file SHA-256s) and a real,
pinned-version npm install (`@spotify/basic-pitch@1.0.1`,
`@tensorflow/tfjs@^3.21.0`, exact resolved versions in
`tools/guitar-model-spike/package-lock.json`). See
`tools/guitar-model-spike/README.md` for exact reproduction steps.

Pinned upstream revisions:

| Project | Commit |
| --- | --- |
| spotify/basic-pitch-ts | `2d498f82b61c71898edf0e8dd661b99076676c8b` |
| spotify/basic-pitch (Python, reference only) | `fa5997af0a8210982619003269994a1be25eddf3` |
| xavriley/HighResolutionGuitarTranscription | `c82d461c38ae951840c97095b2b47d21ba5f12e9` |
| geraldmwangi/GuitarMidi-LV2 | `153327048989bffd3b623572eb5ddd0bc261b526` |
| cwitkowitz/guitar-transcription-continuous (FretNet) | `d481054f54184374c04b1cc27a487dc35c87f353` |
| GuitarSet v1.1 (Zenodo) | record 3371780, `annotation.zip` sha256 `8daa02e6417ccca1685feb44b135e95928ad7037e5032ecb326b5791856fda99` |
