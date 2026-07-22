# MIDI Guitar Support & Visualization

**Date:** 2026-07-22  
**Status:** Canonical Reference / Active Documentation  

## Overview

Midee includes native 6-string guitar fretboard visualization alongside its standard 88-key piano roll. The guitar engine renders note events on a 24-fret fretboard with waterfall note lanes, real-time live performance mapping, multi-track visibility filtering, and WebCodecs MP4 video export.

### Timbre Independence

Visualization mode (`piano` vs `guitar`) is **completely independent** of output audio timbre:
- Users can switch between Piano roll and Guitar fretboard surfaces without altering audio synthesis settings.
- MIDI notes can be visualized on the Guitar surface while playing back with sampled piano, synth plucks, or any soundfont instrument.
- Audio synthesis engine settings (e.g. Tone.js samplers or pluck synths) remain decoupled from the active canvas visualization surface.

---

## Technical Profile & Fretboard Geometry

Midee uses a standard 6-string, 24-fret profile:

- **Tuning:** Standard EADGBE
  - String 1 (High E): E4 (MIDI pitch 64)
  - String 2 (B): B3 (MIDI pitch 59)
  - String 3 (G): G3 (MIDI pitch 55)
  - String 4 (D): D3 (MIDI pitch 50)
  - String 5 (A): A2 (MIDI pitch 45)
  - String 6 (Low E): E2 (MIDI pitch 40)
- **Fret Range:** Frets 0 through 24 (spanning pitches E2 / MIDI 40 to E6 / MIDI 88).
- **Tablature & Highway Geometry:**
  - On the horizontal fretboard surface, String 1 (High E) is displayed at the top and String 6 (Low E) at the bottom, matching standard tablature conventions.
  - On the note highway, lanes map left-to-right from low E (String 6) to high E (String 1).

---

## Supported Modes & Workflows

1. **Play Mode:**
   - Decodes loaded MIDI files and schedules note events onto the 6-string fretboard and highway lanes in real time.
2. **Live Performance:**
   - Accepts Web MIDI controller inputs, computer keyboard notes, or live event streams and calculates live fretboard note assignments with minimal latency (`LiveGuitarFingering`).
3. **Play-Along Exercises:**
   - Integrates with Midee's interactive practice engine for step-by-step guitar play-along verification.
4. **Track Visibility & Filtering:**
   - Multi-track MIDI control allows toggling visibility per channel/track, determining which tracks render on the guitar surface.
5. **Touch & Mobile Ergonomics:**
   - Fretboard layout enforces minimum touch target dimensions (`MIN_FRET_TARGET_PX = 44`) for high touch accuracy on mobile screens.
   - Includes horizontal fretboard panning/scrolling so full 24-fret positions are accessible on smaller viewports.
6. **Active-Surface MP4 Export:**
   - WebCodecs video export (`VideoExporter`) renders whichever surface is currently active. Exporting video while Guitar mode is selected produces an MP4 video of the 6-string fretboard visualization.

---

## Fingering Inference & Channel Affinity

### Algorithmic Dynamic Fingering
Fret positions are dynamically computed via dynamic programming / heuristic scoring (`assignGuitarCluster`):
- **Span Constraint:** Prefers positions within a 4-fret hand span ($\le 4$ frets).
- **Hand Movement:** Minimizes fret jumping between consecutive note clusters.
- **Polyphony:** Enforces a maximum of one note per physical string per time cluster (40 ms window).
- **Low Fret Preference:** Favors open strings and lower fret positions when multiple playable options exist.

### MIDI Channel & Voice Affinity Semantics
- Notes sharing a MIDI channel maintain string affinity (`affinityByChannel`).
- Consecutive notes on the same MIDI channel prefer staying on the same physical string, preserving melodic continuity for multi-channel MIDI files and mapped channel inputs.

### Ergonomic Inferred Fingering Disclaimer
- **Inferred, Not Tablature:** Fret assignments are algorithmically inferred for physical playability and visual clarity. They do **not** represent or attempt to reconstruct exact performed tablature or original performer string selections from performance MIDI.

---

## Handling of Unsupported Voices & Out-of-Range Notes

- **Pitch Range Bounds:** Standard EADGBE 24-fret range covers MIDI pitches 40 (E2) through 88 (E6).
- **Behavior for Out-of-Range or Exceeded Polyphony Notes:**
  - **Audible:** Out-of-range notes (pitch < 40 or pitch > 88) and notes exceeding 6-string polyphony remain **100% audible** through the audio synthesizer.
  - **Visible:** Out-of-range/exceeded notes remain visible on the UI and note highway.
  - **Play-Along Verification:** Marked as unassigned/unsupported (`supported: false`, `position: null`). They are **not required** for Guitar Play-Along exercise step matching or progress validation.

---

## Learn Mode Preference Persistence

- **Piano-Forced Exercises:** Exercises in Learn mode designed specifically for 88-key piano temporarily force piano visualization (`visualizationForced = 'piano'`).
- **Preference Restoration:** When leaving a piano-only exercise or unsetting the forced state (`visualizationForced = null`), the UI automatically restores the user's persisted visualization preference (`visualizationMode`, saved in `localStorage` as `'piano'` or `'guitar'`).

---

## Explicit v1 Exclusions

The following capabilities are **explicitly excluded** from v1:

1. **Microphone / Raspberry Pi Guitar Transcription:** Audio-to-MIDI live transcription on the Pi harness prototype is piano-only. No audio-to-MIDI guitar transcription is active or supported in v1.
2. **Alternate Tunings:** Tuning is strictly standard EADGBE (no Drop D, DADGAD, Open G, or custom tunings).
3. **Continuous Pitch Bends & MPE:** Pitch bend wheel modulation and MIDI Polyphonic Expression (MPE) pitch curves are excluded in v1.
4. **Exact Performed Tablature:** Fret positions are algorithmically inferred and do not capture original performer finger placement.

---

## Related Research: Model Evaluation

For background research on ML-based guitar audio transcription (evaluating Basic Pitch and GAPS / François Leduc model checkpoints on GuitarSet), refer to the separate evaluation report:

- [Guitar Transcription Model Evaluation](./GUITAR_TRANSCRIPTION_MODEL_EVALUATION.md)

*Note:* That document represents an offline research spike. Audio transcription models evaluated in that report are **not adopted** in Midee v1.
