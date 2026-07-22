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
- **Fret Range:** Frets 0 through 24 (spanning pitches E2 / MIDI 40 to E6 / MIDI 88 inclusive).
- **Tablature & Highway Geometry:**
  - On the horizontal fretboard surface, String 1 (High E) is displayed at the top and String 6 (Low E) at the bottom, matching standard tablature conventions.
  - On the note highway, lanes map left-to-right from low E (String 6) to high E (String 1).

---

## Supported Modes & Workflows

1. **Play Mode (Scheduled MIDI):**
   - Decodes loaded MIDI files using `precomputeGuitarFingerings` (in `src/guitar/fingering.ts`).
   - Groups note events into 40 ms time clusters, evaluating movement distance penalties against immediately preceding cluster positions (at matching cluster-array indices) and soft MIDI channel affinity across time clusters to schedule 6-string fretboard and highway note events.
2. **Live Performance (`assignLiveGuitarVoices`):**
   - Active live performance notes are assigned frame-by-frame via `assignLiveGuitarVoices` (in `GuitarSurface.ts`).
   - Direct user touch/mouse interactions on the fretboard canvas (via `FretboardInteraction`) explicitly specify and preserve targeted string and fret positions (`position: { string, fret }`), reserving those physical strings.
   - For remaining currently held live MIDI notes without explicit string assignments, it calls `assignGuitarCluster` with an empty state (`EMPTY_STATE`).
   - The production live path does **not** carry prior-cluster movement scoring or channel affinity across live renders.
3. **Play-Along Exercises:**
   - Integrates with Midee's interactive practice engine for step-by-step guitar play-along verification.
4. **Track Visibility & Filtering:**
   - Multi-track MIDI control allows toggling visibility per channel/track, determining which tracks render on the guitar surface.
5. **Touch & Mobile Ergonomics:**
   - Fretboard layout enforces string heights and touch target dimensions of at least 44 px (`MIN_FRET_TARGET_PX = 44`) for high touch accuracy on mobile screens.
   - Includes horizontal fretboard panning/scrolling so full 24-fret positions are accessible on smaller viewports.
6. **Active-Surface MP4 Export:**
   - WebCodecs video export (`VideoExporter`) renders whichever surface is currently active. Exporting video while Guitar mode is selected produces an MP4 video of the 6-string fretboard visualization.

---

## Fingering Inference & MIDI Channel Affinity

Fret positions for external MIDI inputs are dynamically computed via dynamic programming / heuristic scoring (`assignGuitarCluster`), with distinct semantics between precomputed scheduled MIDI playback and real-time live input:

### Scheduled MIDI Precomputation (`precomputeGuitarFingerings`)
Loaded MIDI files undergo batch precomputation via `precomputeGuitarFingerings`:
- **40 ms Cluster Windowing:** Groups note events into 40 ms time windows (`GUITAR_CLUSTER_WINDOW_MS = 40`).
- **Prior-Position Movement Scoring:** Computes a movement distance penalty against immediately preceding cluster positions at the same cluster-array index (`movement += Math.abs(position.fret - previous.fret)`). Movement scoring evaluates only the immediately prior cluster order, without persisting movement history beyond that prior cluster.
- **Soft MIDI Channel Affinity:** Tracks channel affinity (`affinityByChannel`). Matching a voice's MIDI channel to a previously used string provides a soft scoring bonus (`-affinityMatches` in the score vector), encouraging consecutive notes on the same MIDI channel to stay on the same physical string without hard-locking channel assignments.
- **Span Preference:** Evaluates positions with a preference for a 4-fret hand span ($\le 4$ frets incur no penalty; wider spans incur a score penalty).
- **Polyphony & Low Frets:** Enforces at most one note per physical string per time cluster and favors open strings / lower fret positions.

### Real-Time Live Input Assignment (`assignLiveGuitarVoices`)
Live performance notes are assigned per render frame via `assignLiveGuitarVoices`:
- **Direct Interaction Preservation:** Direct touch/mouse clicks on the fretboard canvas explicitly set string and fret (`position: { string, fret }`), reserving those physical strings.
- **Stateless Frame Assignment:** Unassigned live notes are passed to `assignGuitarCluster` with an empty state (`EMPTY_STATE`). The production live path does not carry prior-cluster movement history or channel affinity state across live renders.

### Direct Interaction vs. Inferred Fingering
- **Direct Interaction:** Clicking or touching specific fretboard coordinates explicitly sets the string and fret, preserving the exact performed position.
- **External MIDI Fingering:** Fret assignments for external MIDI files or live MIDI controllers without string metadata are algorithmically inferred for ergonomics and visual clarity. They do **not** represent or attempt to reconstruct exact performed tablature or original performer finger placements.

---

## Handling of Unsupported Voices & Out-of-Range Notes

- **Pitch Range Bounds:** Standard EADGBE 24-fret range covers MIDI pitches 40 (E2) through 88 (E6) inclusive.
- **Behavior for Out-of-Range or Exceeded Polyphony Notes:**
  - **Audio Engine Path:** Out-of-range notes (pitch < 40 or pitch > 88) and notes exceeding 6-string polyphony continue to play through Midee's normal audio and synthesizer path (`SynthEngine`).
  - **Visible:** Out-of-range/exceeded notes remain visible on the UI and note highway.
  - **Play-Along Verification:** Marked as unassigned/unsupported (`supported: false`, `position: null`). They are **not required** for Guitar Play-Along exercise step matching or progress validation.

---

## Learn Mode Preference Persistence

- **Piano-Forced Exercises:** Exercises in Learn mode designed specifically for 88-key piano temporarily force piano visualization (`visualizationForced = 'piano'`).
- **Preference Restoration:** When leaving a piano-only exercise or unsetting the forced state (`visualizationForced = null`), the UI automatically restores the user's persisted visualization preference (`visualizationMode`, saved in `localStorage` as `'piano'` or `'guitar'`).

---

## Explicit v1 Exclusions

The following capabilities are **explicitly excluded** from v1:

1. **Microphone & Raspberry Pi Guitar Transcription:** Microphone and Raspberry Pi guitar audio-to-MIDI transcription is absent in v1 (the separate Raspberry Pi verification harness `?pi=1` is strictly piano-oriented for 88-key piano LED strip verification).
2. **Alternate Tunings:** Tuning is strictly standard EADGBE (no Drop D, DADGAD, Open G, or custom tunings).
3. **Continuous Pitch Bends & MPE:** Pitch bend wheel modulation and MIDI Polyphonic Expression (MPE) pitch curves are excluded in v1.
4. **Exact Performed Tablature:** Fret positions for external MIDI are algorithmically inferred for ergonomics rather than extracted from exact performer tablature.

---

## Related Research: Model Evaluation

For background research on ML-based guitar audio transcription (evaluating Basic Pitch and GAPS / François Leduc model checkpoints on GuitarSet), refer to the separate evaluation report:

- [Guitar Transcription Model Evaluation](./GUITAR_TRANSCRIPTION_MODEL_EVALUATION.md)

*Note:* That document represents an offline research spike. Audio transcription models evaluated in that report are **not adopted** in Midee v1.
