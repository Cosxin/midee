# GAPS / high-resolution guitar transcription — local run attempt

**Status (M1R, 2026-07-21): USABLE — installed, weights loaded, real
inference run against the 12-track GuitarSet subset. See
`../../../docs/GUITAR_TRANSCRIPTION_MODEL_EVALUATION.md`'s Model 2 section
for full results and the license-provenance caveat.**

> **This file previously said the opposite** ("BLOCKED — no publicly
> released code or weights exist to run"). That was wrong. It was reached
> honestly, from a real search of primary sources at the time, but it
> missed a working package published by the same author under what looked
> (from its GitHub description alone) like an unrelated, saxophone-only
> repo. See "What M1 missed and why" below.

## What exists (verified 2026-07-21)

1. **Code:** [`xavriley/hf_midi_transcription`](https://github.com/xavriley/hf_midi_transcription),
   commit `96f6797881e9497cbfc8f8e5deccea9c1f2f7adc` (`main`). README
   documents CLI (`midi_transcription ... --instrument guitar`) and Python
   API (`MidiTranscriptionModel`) support for saxophone, bass, guitar, and
   piano. `pyproject.toml`: `hf-midi-transcription` v0.1.1, MIT classifier
   — but **no `LICENSE` file in the repo** (GitHub's own license detection
   returns `null`). Treat as MIT-intended, not MIT-instantiated.
2. **Weights:** [`xavriley/midi-transcription-models`](https://huggingface.co/xavriley/midi-transcription-models)
   on Hugging Face, repo commit `689e773723bcafd8c81015b10c03f12675ce16ec`,
   `license: mit` on the model card. Contains (among other instruments'
   checkpoints) `guitar-gaps.pth` (99,178,877 bytes, sha256
   `65483e7c0e340a90415b15b520687587698c8c728f5fa470a205f13ee45c6513`,
   verified by direct download + checksum in this spike) and
   `guitar-fl.pth` (98,916,957 bytes, sha256
   `50d93dba89bdd3401849bc735614478e83d9f46d21fa3f71d8aca5acc0a52028`,
   also downloaded and verified).

## What M1 missed and why

M1's search checked: the paper's companion GitHub Pages site
(`xavriley/HighResolutionGuitarTranscription` — genuinely just a Nerfies
website template, no code, this part of M1's finding was correct), the
GAPS dataset homepage (genuinely doesn't link code), Hugging Face Papers,
and Papers-with-Code. It also enumerated the author's GitHub repos and
found `xavriley/hf_midi_transcription` — but its GitHub API `description`
field is a stale `"Audio-to-MIDI for solo saxophone"`, and M1 apparently
treated that one-line metadata as sufficient signal that the repo was
saxophone-only and irrelevant to a guitar search, without opening the
actual README (which, as of the same commit M1 could have checked, already
documented guitar support). **The fix for next time: always open a
plausibly-related repo's current README before ruling it out by
description text alone** — GitHub descriptions are not required to be kept
in sync with README content and frequently aren't.

The Hugging Face *model* repo (`xavriley/midi-transcription-models`) is
also a separate namespace from both the paper's companion site and the
GAPS *dataset* repo (`xavriley/GAPS`) — M1 checked the dataset repo's
homepage for code links (correctly found none) but didn't independently
search Hugging Face for a *model* repo under the same author, which is
where the actual runnable weights live.

## Real install (this spike, isolated `uv` environment)

Nothing here touches Midee's own Python/Node toolchain: throwaway `uv venv`
at `python/.venv` (Python 3.11.15, gitignored), `HF_HOME` pointed at
`../.cache/huggingface` (gitignored).

```bash
uv venv --python 3.11 .venv
source .venv/bin/activate
uv pip install "git+https://github.com/xavriley/hf_midi_transcription.git@96f6797881e9497cbfc8f8e5deccea9c1f2f7adc"
```

Three real bugs found and fixed along the way (full detail in the docs
report's Model 2 section):

1. `pip install hf-midi-transcription` (the README's **recommended** path)
   fails — not published on PyPI. Use the git-source install above
   instead (the README's documented fallback).
2. `MidiTranscriptionModel.from_pretrained(...)` fails against this
   environment's default `huggingface-hub==1.24.0` with
   `TypeError: ... missing 2 required keyword-only arguments: 'proxies'
   and 'resume_download'` — a real version-skew bug between the package's
   `_from_pretrained()` override and current `huggingface_hub` internals.
   Fix used: `uv pip install "huggingface-hub==0.25.2"`.
3. `from_pretrained(...)` also does a full **repo snapshot download**
   (~672MB observed, every instrument's checkpoint) instead of the one
   file needed. **Better fix, used for the actual eval runs:** skip
   `from_pretrained()` entirely and use the plain
   `MidiTranscriptionModel(instrument="guitar_gaps")` constructor, whose
   `_download_model_if_needed()` calls `hf_hub_download()` for exactly one
   file. This also sidesteps bug #2, since the constructor path never
   touches the buggy `from_pretrained()` code.
4. The constructor path then failed with
   `ValueError: Unsupported instrument 'guitar_gaps'` — the repo's
   `instruments.json` (needed to know `guitar_gaps`/`guitar_fl` map to
   `guitar-gaps.pth`/`guitar-fl.pth`) isn't included in the installed
   package. Fix used: copied `instruments.json` from the GitHub repo into
   this directory (`python/instruments.json`, committed) — the package's
   config loader checks the current working directory as a fallback.

## Real inference run

`python/run_gaps_eval.py` loads `guitar-gaps.pth` and, separately,
`guitar-fl.pth` (both practical to run once bug #3/#4 above were worked
around) and evaluates each against the same 12-track GuitarSet subset and
`.jams` ground truth as the Basic Pitch harness, using the same onset/
onset+offset F1 methodology. Results: `results/results.gaps-guitar_gaps.json`
and `results/results.gaps-guitar_fl.json`. Headline numbers (see docs
report for full per-track tables and discussion):

| Checkpoint | Mean onset F1@50ms | Mean onset+offset F1 | Mean RTF (MPS GPU) |
| --- | --- | --- | --- |
| `guitar-gaps.pth` | 0.881 | 0.434 | 0.096 |
| `guitar-fl.pth` | 0.903 | 0.674 | 0.060 |

Both beat Basic Pitch's onset F1 (0.750) on this subset; `guitar-fl.pth`
also beats Basic Pitch's onset+offset F1 (0.543). Both models are
documented as **monophonic-only** and show it in their error pattern
(false negatives dominate on GuitarSet's chord-heavy `comp` tracks).

## What remains unresolved (do not overclaim)

- **License provenance of the training data**, for both checkpoints —
  see the docs report's dedicated subsections. This is a "get it in
  writing before commercial use" flag, not a "this is fine" or "this is
  blocked" conclusion.
- Why `guitar-fl.pth` outperforms the package's documented default
  `guitar-gaps.pth` on this subset — plausible but unverified hypotheses
  only (see docs report).
- Browser/WASM packaging — not attempted; this is a PyTorch model with no
  found JS/ONNX export path, unlike Basic Pitch. A guitar mode using this
  family of models would need a server-side deployment (matching Midee's
  existing Pi piano pipeline shape), not a browser one.
- Raspberry Pi / ARM performance — not evaluated in this spike (no Pi
  hardware here); the MPS-GPU numbers above are Apple Silicon-specific and
  don't transfer to a Pi's CPU-only inference story.
