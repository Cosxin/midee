# GAPS / high-resolution guitar transcription — local run attempt

**Status: BLOCKED — no publicly released code or weights exist to run.**

This directory documents the actual verification steps taken to try to run
Xavier Riley et al.'s guitar transcription model locally (the model behind
both papers below), before concluding it is not directly usable.

## What was checked (primary sources, checked 2026-07-21)

1. **Paper 1 — the model**: "High Resolution Guitar Transcription via Domain
   Adaptation", Riley, Edwards, Dixon. ICASSP 2024.
   arXiv: https://arxiv.org/abs/2402.15258 (commit-pinned nothing to pin —
   no code link in the abstract, comments, or body as rendered).
2. **Paper 2 — the dataset + benchmark**: "GAPS: A Large and Diverse
   Classical Guitar Dataset and Benchmark Transcription Model", Riley, Guo,
   Edwards, Dixon. ISMIR 2024. arXiv: https://arxiv.org/abs/2408.08653.
3. **Companion site**: https://xavriley.github.io/HighResolutionGuitarTranscription/
   — its GitHub repo (https://github.com/xavriley/HighResolutionGuitarTranscription,
   commit `c82d461c38ae951840c97095b2b47d21ba5f12e9`) contains only a Nerfies
   Jekyll website template (paper abstract, demo videos); no model code, no
   training/inference scripts, no checkpoint.
4. **GAPS dataset homepage**: https://aim-qmul.github.io/GAPS/ — links to
   the arXiv paper and the Zenodo data record only. No code link.
5. **GAPS Zenodo record**: https://zenodo.org/records/13962272 — license
   CC BY-NC-SA 4.0 (non-commercial), single file `gaps_v1_no_audio.zip`
   (7,022,261 bytes; audio is intentionally NOT redistributed, only
   score/alignment metadata — consistent with the dataset's license terms
   restricting redistribution of the underlying commercial recordings).
6. **Author's full GitHub repo list**: queried
   `https://api.github.com/users/xavriley/repos?per_page=100` (both pages,
   127 repos total). The author has published separate inference-ready
   repos for other instruments he's worked on in the same period —
   `xavriley/hf_midi_transcription` (saxophone), `xavriley/sax_transcription`,
   `xavriley/DrumTranscription` — but **no equivalent guitar-transcription
   inference repo exists** among any of the 127 repositories.
7. **Hugging Face papers page**: https://huggingface.co/papers/2402.15258
   — no linked model, code, or Space.
8. **Papers-with-Code**: redirects to the Hugging Face papers page above;
   no code implementation listed.

## Conclusion

There is no publicly obtainable code, wrapper, or pretrained checkpoint for
the GAPS / high-resolution guitar transcription model as of 2026-07-21. The
paper states aligned MIDI is "available from the authors on request," which
is not a reproducible, automatable artifact. **This is a hard blocker, not
a bandwidth/environment limitation** — there is nothing to download or run
regardless of network speed, OS, or hardware. No inference was attempted
because there is no inference code to run.

If the authors release code/weights in the future, `python3.10` (confirmed
available in the reference environment: `Python 3.10.13`, pip 23.3.1, venv
module present) would be the natural target, matching the amt-tools/
guitar-transcription-with-inhibition ecosystem this model builds on (see
../../docs/GUITAR_TRANSCRIPTION_MODEL_EVALUATION.md for the FretNet
research-code assessment, which shares that ecosystem).
