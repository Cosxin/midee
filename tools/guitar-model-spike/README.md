# guitar-model-spike

Research spike (M1): feasibility evaluation of open-source guitar
transcription models for Midee. See
[`docs/GUITAR_TRANSCRIPTION_MODEL_EVALUATION.md`](../../docs/GUITAR_TRANSCRIPTION_MODEL_EVALUATION.md)
at the repo root for the full write-up, conclusions, and risk assessment.

**This directory is fully isolated from the root app**: its own
`package.json`, its own `node_modules`, its own Vite/TypeScript config. It
does not change any root dependency and is never imported by `src/`.
Nothing here ships in the Midee production build.

## What's in here

| Path | Purpose |
| --- | --- |
| `data/guitarset-track-list.json` | The real, verified 360-track GuitarSet v1.1 manifest (source: Zenodo record 3371780's `annotation.zip` listing). |
| `scripts/select-subset.mjs` | Deterministic selection of 12 tracks (1 comp + 1 solo × 6 players) by ascending SHA-256 hash of `track_id`. Re-running always produces the same 12 tracks. |
| `scripts/remote-zip.mjs` | Generic HTTP-Range-based partial ZIP reader (no deps) -- pulls only the needed member files out of Zenodo's multi-hundred-MB archives instead of downloading the whole thing. |
| `scripts/fetch-subset.mjs` | Uses `remote-zip.mjs` to cache just the 12 selected tracks' audio + annotations under `.cache/` (gitignored, never committed). |
| `scripts/wav.mjs` | Minimal 16-bit PCM WAV decoder + linear resampler to 22050 Hz mono (what Basic Pitch requires). |
| `scripts/parse-jams.mjs` | Parses GuitarSet's real `.jams` ground-truth annotation format into a flat polyphonic note list. |
| `scripts/basic-pitch-runner.mjs` | Runs real `@spotify/basic-pitch` inference in Node via the `@tensorflow/tfjs` CPU backend (see report for why not `tfjs-node`). |
| `scripts/metrics.mjs` | Onset F1 @ 50ms, onset+offset F1, FP/FN -- mir_eval-style note-transcription metrics. |
| `scripts/measure.mjs` | Orchestrates the full run: decode → infer → score → write `results/results.<profile>.json`. |
| `src/browserSmoke.ts` + `vite.config.ts` | Minimal real browser build (`npm run build:browser-smoke`) to measure actual bundled bytes under this repo's pinned Vite 8. |
| `python/gaps_probe_README.md` | Documents the (negative) search for a runnable GAPS / high-resolution-guitar-transcription code release. |
| `results/` | Committed, small (<100KB) JSON/markdown outputs of runs actually executed in this spike. Raw audio/weights are never committed. |

## Reproducing

```bash
cd tools/guitar-model-spike
npm install
node scripts/select-subset.mjs        # writes data/selected-subset.json
node scripts/fetch-subset.mjs both     # caches audio + annotations under .cache/
node scripts/measure.mjs upstream-python-defaults   # or: ts-readme-example
npm run build:browser-smoke            # real Vite 8 browser build, see dist/
```

`fetch-subset.mjs` talks to the internet (Zenodo). Nothing it downloads is
committed; `.cache/` is gitignored.
