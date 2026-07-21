# Guitar transcription model evaluation (M1 spike, M1R corrections)

**Date:** 2026-07-21 (M1), corrected/extended 2026-07-21 (M1R)
**Status:** Complete (non-blocking research spike)
**Owner artifacts:** [`tools/guitar-model-spike/`](../tools/guitar-model-spike/) (isolated tooling, deterministic manifest/runner), this document.
**Does not touch:** root `package.json`/`package-lock.json`, `src/`, or any shipped Midee code path.

> **M1R correction notice:** the original M1 pass of this document
> concluded that GAPS / high-resolution guitar transcription had **no
> publicly available code or weights** and was a hard blocker. That
> conclusion was **wrong** — it was accurate for the sources checked at the
> time (the paper's companion GitHub Pages site and the author's repo list
> as enumerated then) but missed that the same author has since published
> a working package and hosted checkpoints elsewhere on Hugging Face. This
> revision corrects every claim built on that error: see the rewritten
> "Model 2" section, comparison table, conclusion, risks, and pinned
> revisions below. The Basic Pitch findings and measurements from M1 are
> unchanged and are reproduced here verbatim (see git history for the
> original commit if you want a byte-for-byte diff).

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
- **GAPS / high-resolution guitar transcription** (Xavier Riley et al.) —
  **correction: this is now directly usable, not blocked.** A working
  package ([`xavriley/hf_midi_transcription`](https://github.com/xavriley/hf_midi_transcription),
  MIT) and real pretrained checkpoints
  ([`xavriley/midi-transcription-models`](https://huggingface.co/xavriley/midi-transcription-models)
  on Hugging Face, MIT model card: `guitar-gaps.pth` ~99.2MB,
  `guitar-fl.pth` ~98.9MB, `guitar_kroma.safetensors` ~49.4MB) exist and
  were installed and loaded in this spike via an isolated `uv` environment.
  It is **monophonic-only** (explicitly documented upstream — not a
  polyphonic competitor to Basic Pitch), and the underlying GAPS
  *training* dataset has a **license discrepancy that still blocks a
  confident commercial-use claim** — see Model 2 below and the Risks
  section. See measured results below for what was actually run.
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

## Model 2: GAPS / High-Resolution Guitar Transcription (Xavier Riley et al.) — **usable; installed, weights loaded, license provenance unresolved**

> **This section replaces M1's "blocked, no artifact exists" finding,
> which was wrong.** M1 checked the paper companion site, the GAPS
> dataset homepage, the author's GitHub repo list, Hugging Face Papers,
> and Papers-with-Code — and at that time none of them surfaced a working
> package. What M1 missed: the author moved the runnable artifact to a
> **separate Hugging Face *model* repo** (`xavriley/midi-transcription-models`,
> distinct from the paper's companion site and from the GAPS *dataset*
> repo), and updated the `hf_midi_transcription` GitHub repo (which M1's
> search *did* find, but only recognized as a saxophone-only tool — its
> GitHub API `description` field still literally reads "Audio-to-MIDI for
> solo saxophone" even though its README now documents guitar support) to
> add multi-instrument support including guitar. Lesson: a repo's stale
> metadata description is not proof its content is stale — M1 should have
> opened the README.

### What exists (verified primary sources, 2026-07-21)

- **Code:** [`xavriley/hf_midi_transcription`](https://github.com/xavriley/hf_midi_transcription), commit `96f6797881e9497cbfc8f8e5deccea9c1f2f7adc` (`main`, pushed 2026-01-27). `pyproject.toml`: `hf-midi-transcription` v0.1.1, `requires-python = ">=3.9"`, classifier `License :: OSI Approved :: MIT License`. README states MIT and instructs "see the LICENSE file for details" — **but there is no `LICENSE` file in the repo** (confirmed via GitHub Contents API listing; also why the GitHub API's own `license` field reports `null`/unrecognized despite the human-readable claim). Treat as MIT-*intended*, not MIT-*instantiated*; a real integration should ask the author to add the missing file rather than resting on the README/classifier text alone.
- **Weights:** [`xavriley/midi-transcription-models`](https://huggingface.co/xavriley/midi-transcription-models) on Hugging Face, repo commit `689e773723bcafd8c81015b10c03f12675ce16ec` (`lastModified` 2026-03-13), model card `license: mit`. Confirmed present via the HF API tree listing and downloaded in this spike:

  | File | Bytes (HF API `size`) | `x-linked-etag` (xet content hash, from `resolve` redirect headers) |
  | --- | --- | --- |
  | `guitar-gaps.pth` | 99,178,877 | `65483e7c0e340a90415b15b520687587698c8c728f5fa470a205f13ee45c6513` |
  | `guitar-fl.pth` | 98,916,957 | `50d93dba89bdd3401849bc735614478e83d9f46d21fa3f71d8aca5acc0a52028` |
  | `guitar_kroma.safetensors` | 49,360,574 | `26919a2fa15652f3a63255ea413a64ffbbeba99efa0a2a2dab425d13f57f2de0` |

  `guitar-gaps.pth` is trained on the GAPS dataset (below); `guitar-fl.pth` is trained on a separate "Francois Leduc dataset" per `instruments.json` in the code repo — not otherwise documented in this spike, flagged for follow-up if pursued further. `guitar_kroma.safetensors` is present but not wired into `instruments.json`'s instrument map as of this commit and was not evaluated.
- **CLI/API surface (confirmed real, from the current README):** `midi_transcription input.wav output.mid --instrument guitar` (CLI, maps to `guitar-gaps.pth` as the default guitar checkpoint per `instruments.json`), or `MidiTranscriptionModel.from_pretrained("xavriley/midi-transcription-models", instrument="guitar_gaps")` (Python API, `PyTorchModelHubMixin`-based).
- **Architecture:** CRNN with onset/offset/frame/velocity regression, built on a fork of `piano_transcription_inference` (`xavriley/piano_transcription_inference`, resolved commit `7568dc7f78b625e40cf9776e2806d164006610e3` when installed in this spike) — the same Kong-et-al.-derived piano-transcription lineage Midee's *existing* piano pipeline uses ("Onsets & Velocities"), now retrained/adapted per-instrument. 16kHz input, 10-second windows with overlap, note range reuses piano's 88-key/`begin_note=21` (MIDI 21-108) window (guitar's range is a subset, so no remapping needed). **Documented as monophonic-only** ("Optimized for monophonic performance (single notes, not chords) across all instruments" — this is explicit in the current README, not an inference from our testing) — i.e. this is architecturally not a chord-capable competitor to Basic Pitch; expect it to systematically under-predict on GuitarSet's `comp` (chord-heavy) tracks by design, not as a bug.

### Real install attempt (this spike, isolated `uv` environment)

Per instructions, nothing here touches Midee's own Python/Node toolchain: a
throwaway `uv venv` was created at `tools/guitar-model-spike/python/.venv`
(Python 3.11.15, gitignored) with `HF_HOME` pointed at
`tools/guitar-model-spike/.cache/huggingface` (also gitignored — model
weights are cached locally, never committed, matching the same policy as
GuitarSet audio).

1. `pip install hf-midi-transcription` (the README's **recommended**
   install path) **fails** — the package is **not published on PyPI**
   under that name (`pypi.org/pypi/hf-midi-transcription/json` → 404, both
   hyphen and underscore spellings checked). This is a real, currently-true
   README defect worth reporting upstream, not something this spike
   invented.
2. `uv pip install "git+https://github.com/xavriley/hf_midi_transcription.git@96f6797881e9497cbfc8f8e5deccea9c1f2f7adc"`
   (the README's documented fallback, "Option 2: Install from source")
   **succeeds**: resolves 59 packages, builds `hf-midi-transcription` and
   its git dependency `piano-transcription-inference` (also from source),
   pulls `torch==2.13.0` (CPU wheel) and the rest of the dependency tree
   cleanly. `python -c "import hf_midi_transcription"` succeeds.
3. `MidiTranscriptionModel.from_pretrained(...)` **fails on first try** with
   the environment's default (latest) `huggingface-hub==1.24.0`:
   ```
   TypeError: MidiTranscriptionModel._from_pretrained() missing 2 required
   keyword-only arguments: 'proxies' and 'resume_download'
   ```
   This is a **real version-skew bug**: the package's own `pyproject.toml`
   declares only `huggingface-hub>=0.16.0` (no upper bound), but its
   `_from_pretrained()` override (`hf_midi_transcription/model.py`) still
   requires `proxies`/`resume_download` keyword arguments that newer
   `huggingface_hub` `ModelHubMixin` internals (as of `huggingface-hub` 1.x)
   no longer pass through. **Working fix found and verified in this
   spike:** pin `huggingface-hub==0.25.2` (downgrade from 1.24.0) — with
   that pin, `from_pretrained(..., revision="689e773723bcafd8c81015b10c03f12675ce16ec")`
   succeeds.
4. **Inefficiency finding:** `MidiTranscriptionModel.from_pretrained(...)`
   (the class method — `PyTorchModelHubMixin`'s generic HF integration)
   does a full **repo snapshot download**: this spike observed **~672MB**
   fetched across the shared `xavriley/midi-transcription-models` repo's
   other files (saxophone, bass, piano checkpoints, both `.safetensors`
   files) before a transient network error interrupted the one file this
   spike didn't need (`filobass_20000_iterations.pth`) — none of that
   ~672MB was the ~99MB `guitar-gaps.pth` actually wanted. **Real fix used
   in this spike:** call the plain `MidiTranscriptionModel(instrument=...)`
   **constructor** instead of `.from_pretrained(...)` — its internal
   `_download_model_if_needed()` calls `hf_hub_download()` for exactly the
   one checkpoint file the requested instrument needs (confirmed: model
   load completed in 4.66s once only `guitar-gaps.pth`, 99,178,877 bytes,
   needed fetching). This also sidesteps the `huggingface-hub` version-skew
   bug in step 3 entirely, since the plain constructor never calls
   `PyTorchModelHubMixin.from_pretrained()`'s internal machinery — **so the
   practical recommendation is: don't use `.from_pretrained()` with this
   package at all, use the constructor.**
5. **Packaging bug found:** the plain constructor path above initially
   failed with `ValueError: Unsupported instrument 'guitar_gaps'.
   Available: ['saxophone', 'bass', 'guitar', 'piano']` — the repo's
   `instruments.json` (which maps `guitar_gaps`/`guitar_fl` to their
   checkpoint filenames) is **not included in the installed package**
   (confirmed: absent from `site-packages/hf_midi_transcription/` after
   both the git-source and editable installs; `pyproject.toml` doesn't
   declare it as package data). The code falls back to a hardcoded
   4-instrument dict lacking the `guitar_gaps`/`guitar_fl` split. **Working
   fix used in this spike:** copy `instruments.json` from the repo into the
   working directory (`tools/guitar-model-spike/python/instruments.json`,
   committed here since it's the actual config needed to reproduce this
   run) — the code's config loader also checks `Path("instruments.json")`
   relative to the current working directory as a fallback, which picks it
   up. Plain `--instrument guitar` (using the fallback dict, which does
   include a `guitar` → `guitar-gaps.pth` mapping) would have worked
   without this file; only the `guitar_gaps`/`guitar_fl` naming used by
   this spike (to unambiguously log which checkpoint was tested) needed
   the workaround.

### Inference results

Real inference was run against the **same 12-track deterministic GuitarSet
subset and same real `.jams` ground truth** used for Basic Pitch (see
Methodology above), via `tools/guitar-model-spike/python/run_gaps_eval.py`
— a from-scratch script using the package's documented API
(`MidiTranscriptionModel(instrument=...)` → `model.transcribe(wav, mid,
activations=True)` → the returned `est_note_events` dict, which already
has `{onset_time, offset_time, midi_note, velocity}` per note, no MIDI
re-parsing needed) and the exact same greedy nearest-onset F1 methodology
as the Node/Basic Pitch harness (re-implemented in Python for a
self-contained script; same 50ms onset tolerance, same
`max(50ms, 0.2×duration)` offset tolerance). Inference ran on this
machine's Apple Silicon **MPS** GPU backend (auto-selected by the
package — `torch.backends.mps.is_available()` — not something this spike
configured manually), using the package's own default thresholds
(`onset_threshold=0.3`, `offset_threshold=0.3`, `frame_threshold=0.1`, no
tuning applied).

**`guitar-gaps.pth` (the default `--instrument guitar` checkpoint):**

| Track | Style | RTF | Onset F1@50ms | Onset+Offset F1 | GT notes | Pred notes | FP | FN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `00_SS1-68-E_comp` | comp | 0.455 | 0.863 | 0.241 | 189 | 168 | 14 | 35 |
| `00_BN1-129-Eb_solo` | solo | 0.070 | 0.942 | 0.609 | 71 | 67 | 2 | 6 |
| `01_BN2-166-Ab_comp` | comp | 0.053 | 0.749 | 0.292 | 260 | 274 | 74 | 60 |
| `01_Jazz1-130-D_solo` | solo | 0.056 | 0.940 | 0.597 | 68 | 66 | 3 | 5 |
| `02_Rock3-148-C_comp` | comp | 0.048 | 0.691 | 0.366 | 435 | 329 | 65 | 171 |
| `02_SS1-100-C#_solo` | solo | 0.042 | 0.957 | 0.615 | 59 | 58 | 2 | 3 |
| `03_Jazz1-200-B_comp` | comp | 0.119 | 0.921 | 0.121 | 82 | 83 | 7 | 6 |
| `03_Jazz2-110-Bb_solo` | solo | 0.058 | 0.934 | 0.599 | 99 | 98 | 6 | 7 |
| `04_SS3-98-C_comp` | comp | 0.040 | 0.776 | 0.311 | 268 | 188 | 11 | 91 |
| `04_Jazz1-200-B_solo` | solo | 0.079 | 0.884 | 0.543 | 65 | 64 | 7 | 8 |
| `05_SS1-68-E_comp` | comp | 0.073 | 0.973 | 0.226 | 143 | 149 | 7 | 1 |
| `05_Rock2-85-F_solo` | solo | 0.065 | 0.940 | 0.691 | 125 | 124 | 7 | 8 |

| Metric | Value |
| --- | --- |
| Mean onset F1 @ 50ms | **0.881** — higher than Basic Pitch's 0.750 |
| Mean onset+offset F1 | **0.434** — lower than Basic Pitch's 0.543 |
| Mean real-time factor | **0.096** (MPS GPU — not a CPU-vs-CPU comparison with Basic Pitch's 0.605 CPU-JS number; both are real, neither is apples-to-apples hardware) |
| Total false positives (onset-only) | 205 (vs. Basic Pitch's 649) |
| Total false negatives (onset-only) | 401 (vs. Basic Pitch's 492) |
| Model load time | 4.66s (first call; downloads+caches the 99MB checkpoint if not already cached) |
| Peak process RSS (whole 12-track run) | ~812 MB (`831872` KB) — torch + MPS backend, notably heavier than Basic Pitch's ~452MB tfjs-CPU run |

**Reading this honestly:** onset F1 is genuinely better than Basic Pitch's
on this subset, *including* on chord-heavy `comp` tracks the model isn't
architecturally built for (e.g. `05_SS1-68-E_comp` scored 0.973) — the
monophonic design evidently still captures a useful subset of onsets
(likely the most prominent/salient note per chord) rather than failing
outright on polyphonic input. But **onset+offset F1 is worse than Basic
Pitch's**, and false negatives dominate the error breakdown on the densest
comp tracks (`02_Rock3-148-C_comp`: 171 FN out of 435 ground-truth notes;
`04_SS3-98-C_comp`: 91 FN out of 268) — consistent with a model that
picks one note where GuitarSet's ground truth has several simultaneous
ones. **Solo tracks are where this model is strongest** (mean onset F1
≈0.93, mean onset+offset F1 ≈0.61 across the 6 solo tracks above),
which lines up exactly with its documented monophonic design intent.

**`guitar-fl.pth` (trained on the separate "Francois Leduc dataset," per
`instruments.json`) — run because it was practical (already cached from
the interrupted snapshot download above), and the result was surprising
enough to be worth reporting prominently:**

| Track | Style | RTF | Onset F1@50ms | Onset+Offset F1 | GT notes | Pred notes | FP | FN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `00_SS1-68-E_comp` | comp | 0.087 | 0.864 | 0.453 | 189 | 186 | 24 | 27 |
| `00_BN1-129-Eb_solo` | solo | 0.057 | 0.921 | 0.633 | 71 | 68 | 4 | 7 |
| `01_BN2-166-Ab_comp` | comp | 0.053 | 0.842 | 0.623 | 260 | 279 | 52 | 33 |
| `01_Jazz1-130-D_solo` | solo | 0.055 | 0.978 | 0.847 | 68 | 69 | 2 | 1 |
| `02_Rock3-148-C_comp` | comp | 0.047 | 0.797 | 0.539 | 435 | 388 | 60 | 107 |
| `02_SS1-100-C#_solo` | solo | 0.043 | 0.917 | 0.833 | 59 | 61 | 6 | 4 |
| `03_Jazz1-200-B_comp` | comp | 0.079 | 0.945 | 0.479 | 82 | 81 | 4 | 5 |
| `03_Jazz2-110-Bb_solo` | solo | 0.047 | 0.954 | 0.913 | 99 | 96 | 3 | 6 |
| `04_SS3-98-C_comp` | comp | 0.040 | 0.785 | 0.522 | 268 | 226 | 32 | 74 |
| `04_Jazz1-200-B_solo` | solo | 0.078 | 0.908 | 0.769 | 65 | 65 | 6 | 6 |
| `05_SS1-68-E_comp` | comp | 0.071 | 0.976 | 0.602 | 143 | 146 | 5 | 2 |
| `05_Rock2-85-F_solo` | solo | 0.064 | 0.948 | 0.869 | 125 | 126 | 7 | 6 |

| Metric | Value |
| --- | --- |
| Mean onset F1 @ 50ms | **0.903** — best of all three models tested in this spike |
| Mean onset+offset F1 | **0.674** — best of all three models tested in this spike, and well above Basic Pitch's 0.543 |
| Mean real-time factor | **0.060** (MPS GPU) |
| Total false positives (onset-only) | 205 |
| Total false negatives (onset-only) | 278 |
| Peak process RSS | ~920 MB (`942144` KB) |

**This is a genuinely surprising result worth stating plainly:
`guitar-fl.pth` outperformed `guitar-gaps.pth` on both metrics on this
GuitarSet subset**, despite `guitar-gaps` being the package's *documented
default* for `--instrument guitar` and the one named in this task's
correction. This spike does not have an explanation for why (jazz-specific
training data generalizing better to GuitarSet's jazz-heavy style mix is
one plausible hypothesis, given 2 of the 5 GuitarSet styles are
Jazz-labeled — but that's speculation, not a verified finding). **Practical
implication: if this model family is pursued further, benchmark both
checkpoints before picking one as default — do not assume the package's
default instrument mapping is the better-performing choice.**

**A second, separate license caution applies specifically to
`guitar-fl.pth`:** its training data (the "François Leduc Dataset") is
**239 jazz guitar performances paired with commercial transcriptions
originally sold by François Leduc's online transcription library**
([restricted-access Zenodo record 10984521](https://zenodo.org/records/10984521),
`access_right: restricted`, no open license — "the original scores may be
purchased from François Leduc at his online library"). A newer mirror,
[`xavriley/FrancoisLeducGuitarDataset`](https://huggingface.co/datasets/xavriley/FrancoisLeducGuitarDataset)
on Hugging Face, tags itself MIT — **the same discrepancy pattern as
GAPS**, and arguably a sharper one here, since the underlying content is
explicitly described as derived from a third party's commercial,
purchasable transcription product, not just performances by ~200
uncredited contributors. The same caution applies: **do not treat
`guitar-fl.pth` as commercially cleared without written confirmation from
the rights holders (both Xavier Riley and François Leduc).**

### GAPS dataset license discrepancy — **do not treat as commercially cleared**

The task that produced `guitar-gaps.pth`'s *training data* is the GAPS
dataset, and its licensing is genuinely inconsistent across the two places
it's published, which M1 did not have visibility into (M1 only found the
older Zenodo record):

| Source | Version | License stated | Audio included |
| --- | --- | --- | --- |
| [Zenodo record 13962272](https://zenodo.org/records/13962272) | v1 (per filename `gaps_v1_no_audio.zip`) | **CC BY-NC-SA 4.0** (non-commercial) | No — `gaps_v1_no_audio.zip` (7,022,261 bytes), score/alignment metadata only |
| [Hugging Face `xavriley/GAPS`](https://huggingface.co/datasets/xavriley/GAPS) | v1.1 ("audio now included" per the dataset card's own changelog) | **MIT** (`license: mit` in the card's YAML front matter) | **Yes** — `audio/` directory present in the repo tree |

This is a real discrepancy in what the *same author* has published for
what is presented as *the same dataset*, one version apart. It is not this
spike's place to decide which license controls, and **this document
explicitly does not assert that GAPS-trained weights are commercially
clear to use in Midee.** Plausible (unverified) explanations include: the
v1.1 HF release is a deliberate re-license by the rights-holder now that
audio clearance was sorted out; or the MIT tag on the HF card is a
copy-paste default that doesn't reflect actual rights over ~200
contributed performers' recordings. Before using `guitar-gaps.pth` (or any
GAPS-derived weights) in a commercial product, get explicit written
confirmation from the author about which license governs the training
data the checkpoint was fit on — a model card's license tag is a claim,
not a guarantee, especially when it contradicts an earlier release by the
same author under a stricter, non-commercial license for what's described
as the same content.

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
| Direct-use status | **Usable, validated** | **Usable, validated** (monophonic only; license provenance unresolved) | Usable (Linux/LV2 host), Pi unverified | Research-only, no weights |
| License | Apache-2.0 | Code: MIT-intended (README + classifier; **no LICENSE file present**). Weights repo: MIT (HF model card). Training-data (GAPS dataset) license: **discrepant** — CC BY-NC-SA 4.0 on Zenodo v1 vs. MIT on HF v1.1, see below. | LGPL-2.0-or-later | MIT (code); no weights to license |
| Output | Pitch-only note events (+ optional pitch bend) | Pitch-only note events (onset/offset/velocity), **monophonic** | Pitch-only MIDI note on/off, fixed velocity | Pitch + string/fret (architecture only) |
| Onset F1 @ 50ms (this spike, 12-track subset) | **0.750 mean** (upstream thresholds) | **0.881 mean** (`guitar-gaps.pth`) / **0.903 mean** (`guitar-fl.pth`, best of all three) | not measured (no Pi/Linux host here) | not run (no weights) |
| Onset+offset F1 (this spike) | **0.543 mean** (upstream thresholds) | **0.434 mean** (`guitar-gaps.pth`) / **0.674 mean** (`guitar-fl.pth`, best of all three) | not measured | not run |
| Real-time factor | **0.605 mean** (CPU JS backend, conservative) | **0.096 mean** (`guitar-gaps.pth`) / **0.060 mean** (`guitar-fl.pth`), both MPS GPU — not directly comparable to Basic Pitch's CPU number | author-reported 4-16ms latency, unverified hardware | n/a |
| Browser packaging | **Confirmed** (Vite 8 build succeeds; asset-copy caveat noted) | Not evaluated — PyTorch/CRNN, Python-only today; no JS/WASM/ONNX export found in either repo. Would need a server-side (Pi-style) deployment like Midee's existing piano pipeline, not a browser one. | n/a (native LV2 plugin, not browser) | n/a |
| Pi packaging | Not evaluated (would mirror existing PipeWire server-side pattern) | Not evaluated in this spike (no Pi/ARM hardware here); architecture (CRNN + torch) matches the same *class* of model Midee already runs server-side for piano, so a Pi port is plausible but unverified — do not treat as proven. | **Unverified** on this spike's hardware | n/a |

## Conclusion

**No candidate here is definitively "same-level" as Midee's existing piano
approach, but the `xavriley/hf_midi_transcription` guitar checkpoints are
architecturally the closest relative and, on this spike's measurements,
the most accurate for onset detection** — both are direct descendants of
the same `piano_transcription_inference` (Kong-et-al.-style Onsets &
Velocities) lineage Midee already runs server-side for piano, retrained
per-instrument. That kinship is promising for a future integration path
(same model family, same general deployment shape). **Measured onset F1 on
this spike's 12-track subset ranks `guitar-fl.pth` (0.903) >
`guitar-gaps.pth` (0.881) > Basic Pitch (0.750)**, and `guitar-fl.pth` also
wins on onset+offset F1 (0.674 vs. Basic Pitch's 0.543). That is a real,
measured accuracy edge, not a marginal one.

It does not, however, make either checkpoint a drop-in replacement for
Midee's piano model: both are monophonic-only by design (GuitarSet's
`comp` tracks, which are chord-heavy, are structurally outside what
they're built to do — reflected in their false-negative-heavy error
pattern on `comp` tracks above), and **both checkpoints' training data has
an unresolved license discrepancy** (GAPS: CC BY-NC-SA 4.0 on Zenodo vs.
MIT on HF for what's described as the same dataset; François Leduc
dataset: restricted/no-license on Zenodo, described as derived from a
third party's *commercial, purchasable* transcription product, vs. MIT on
a newer HF mirror). Neither of those two things is true of Midee's current
piano model, which is why neither GAPS checkpoint is "same-level" despite
outperforming Basic Pitch numerically.

**Practical recommendation:** if this model family is pursued for a real
guitar-mode spike, (1) get written license confirmation from Xavier Riley
(and, for `guitar-fl.pth`, from François Leduc) before using either
checkpoint's output in a shipped feature, (2) default to `guitar-fl.pth`
over the package's documented default `guitar-gaps.pth` given its measured
edge here, (3) treat both as solo/monophonic-only — pair with a separate
polyphonic fallback (Basic Pitch, license-clean, already validated) for
comped/strummed content, and (4) don't use `.from_pretrained()`, use the
plain constructor with `hf_hub_download` underneath (see install notes).
**Basic Pitch remains the only candidate with zero license ambiguity**
(Apache-2.0, code and no separate training-data question because Spotify
trained and shipped it directly) and is the safer default for a first
shippable experiment even though it scored lower on this benchmark.

**All four candidates' relevant output (where an output exists at all) is
pitch/note-level**, which is exactly what Midee's ergonomic mapper already
consumes for piano (`MIDI note → mapper → LED index`, per `README.md`'s
data-flow diagram). No candidate requires Midee to build new string/fret-
aware mapping logic to be usable. GuitarMidi-LV2 still needs real Pi/ARM
validation before any latency claim can be trusted, and FretNet still
needs someone to actually train it before it's anything but a paper — M1's
findings on those two are unchanged by this correction.

## Risks

- **GAPS training-data license risk (new in this revision):** the GAPS
  dataset backing `guitar-gaps.pth` is published under **two different,
  conflicting licenses** by the same author (CC BY-NC-SA 4.0 on the
  original Zenodo record vs. MIT on the newer Hugging Face mirror) for
  what is described as the same underlying content. **Do not treat
  `guitar-gaps.pth` as commercially cleared until this is resolved in
  writing with the author** — see the dedicated subsection above.
- **François Leduc dataset license risk (new in this revision, arguably
  sharper than the GAPS one):** `guitar-fl.pth` — the *better-performing*
  checkpoint in this spike's measurements — is trained on 239 jazz guitar
  performances paired with transcriptions from a third party's commercial,
  purchasable transcription library. The dataset's original Zenodo record
  is access-restricted with no open license; a newer HF mirror tags MIT.
  **This is not just an author-relicensing question like GAPS — it
  potentially involves a second rights holder (François Leduc) whose
  commercial transcriptions the dataset is built from.** Do not use
  `guitar-fl.pth` commercially without confirming both Riley's and
  Leduc's positions in writing.
- **Surprising-result risk:** `guitar-fl.pth` beat the package's own
  documented default (`guitar-gaps.pth`) on both F1 metrics in this
  spike's measurements. This spike does not have a verified explanation
  (see Model 2 above) — treat it as a real, reproducible measurement on
  this specific 12-track subset, not as a general claim that
  `guitar-fl.pth` is "better" in all contexts. Re-verify on a larger
  sample before making it a default in any future work.
- **Code-license hygiene risk (new in this revision):** `hf_midi_transcription`'s
  README and `pyproject.toml` both assert MIT, but the repo ships no
  `LICENSE` file. Low risk of the intent being anything other than MIT,
  but "the README says so" is not the same as an actual license grant —
  flag for the author or wait for the file before relying on it formally.
- **Monophonic-limitation risk (new in this revision):** `guitar-gaps.pth`
  and `guitar-fl.pth` are explicitly documented as monophonic-only. Any
  integration plan that assumes GAPS can handle strummed/comped guitar
  (the majority of real guitar playing, per GuitarSet's own 50/50
  comp/solo split) will fail by design, not by bug.
- **Accuracy risk:** Basic Pitch's measured onset+offset F1 is
  substantially lower than onset-only F1 across every profile tested here
  — sustained-note timing (not just onset detection) is the weaker link,
  which matters for Midee's key-down/key-up LED timing model.
- **License risk (Basic Pitch / GuitarMidi-LV2 / FretNet, unchanged from
  M1):** GuitarMidi-LV2's LGPL-2.0-or-later has copyleft implications for a
  statically-linked native integration (dynamic linking / plugin-boundary
  use is the safer LGPL pattern). Basic Pitch (Apache-2.0) and FretNet
  (MIT) remain commercially unencumbered on the code side.
- **Unverified-claims risk:** GuitarMidi-LV2's latency numbers are the
  author's own, on unspecified hardware — do not cite them as Midee-Pi
  numbers without independent Pi measurement.
- **Threshold-sensitivity risk:** as shown above, Basic Pitch's headline
  accuracy swings by roughly 2x in F1 depending on undocumented threshold
  choice — any future integration must pin and justify its thresholds
  explicitly rather than copying an illustrative README snippet. The same
  caution applies to GAPS: this spike used the package's own documented
  defaults (`onset_threshold=0.3`, `offset_threshold=0.3`,
  `frame_threshold=0.1`) without additional tuning.
- **Process risk (why M1 got this wrong):** M1's GAPS conclusion was
  reached by exhausting a fixed list of sources (paper site, dataset
  homepage, author's repo list, HF Papers, Papers-with-Code) at a single
  point in time, without re-opening a repo whose one-line GitHub
  description ("Audio-to-MIDI for solo saxophone") looked unrelated to
  guitar. **A repo's short metadata description is not a substitute for
  reading its current README** before concluding an artifact doesn't
  exist — this spike's correction process is itself evidence of that.

## Reproducibility

All findings with a checkmark above were produced by the code in
`tools/guitar-model-spike/` against real, checksummed GuitarSet v1.1 data
(see `results/fetch-report.json` for per-file SHA-256s) and a real,
pinned-version npm install (`@spotify/basic-pitch@1.0.1`,
`@tensorflow/tfjs@^3.21.0`, exact resolved versions in
`tools/guitar-model-spike/package-lock.json`) for Basic Pitch, and a real,
isolated `uv`-managed Python 3.11 virtualenv
(`tools/guitar-model-spike/python/.venv`, gitignored) for the GAPS/FL
checkpoints, with `hf-midi-transcription` installed from the pinned git
commit above and `huggingface-hub` pinned to `0.25.2` (see the version-skew
note in Model 2). See `tools/guitar-model-spike/README.md` for exact
reproduction steps for both.

Pinned upstream revisions:

| Project | Commit / revision |
| --- | --- |
| spotify/basic-pitch-ts | `2d498f82b61c71898edf0e8dd661b99076676c8b` |
| spotify/basic-pitch (Python, reference only) | `fa5997af0a8210982619003269994a1be25eddf3` |
| xavriley/hf_midi_transcription | `96f6797881e9497cbfc8f8e5deccea9c1f2f7adc` (`main`) |
| xavriley/piano_transcription_inference (fork, git dependency) | `7568dc7f78b625e40cf9776e2806d164006610e3` |
| xavriley/midi-transcription-models (HF model repo) | `689e773723bcafd8c81015b10c03f12675ce16ec` |
| xavriley/GAPS (HF dataset repo, referenced not downloaded) | `b4c89a33a639c7ae903e74102dfbb3e147e1417f` |
| xavriley/HighResolutionGuitarTranscription (paper companion site only, superseded as "the" GAPS pointer by the above) | `c82d461c38ae951840c97095b2b47d21ba5f12e9` |
| geraldmwangi/GuitarMidi-LV2 | `153327048989bffd3b623572eb5ddd0bc261b526` |
| cwitkowitz/guitar-transcription-continuous (FretNet) | `d481054f54184374c04b1cc27a487dc35c87f353` |
| GuitarSet v1.1 (Zenodo, evaluation benchmark — unchanged from M1) | record 3371780, `annotation.zip` sha256 `8daa02e6417ccca1685feb44b135e95928ad7037e5032ecb326b5791856fda99` |
| GAPS dataset (Zenodo, training data for guitar-gaps.pth, license reference only) | record 13962272, CC BY-NC-SA 4.0, `gaps_v1_no_audio.zip` |
