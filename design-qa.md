# Guitar Focus Canvas Design QA

## Comparison Target

- Source visual truth: `/Users/justin/.codex/generated_images/019feb24-6c15-7b01-97d8-7dad77e4e08a/exec-1d267fbe-1eea-43cb-9bd8-38dc51128619.png`
- Rendered implementation: `http://127.0.0.1:5173/`
- Desktop implementation: `/private/tmp/midee-guitar-ui-final-desktop-v7.png`
- Desktop active chord: `/private/tmp/midee-guitar-ui-chord-desktop-final.png`
- Mobile compact guide: `/private/tmp/midee-guitar-ui-final-mobile-v4.png`
- Mobile Chord panel: `/private/tmp/midee-guitar-ui-final-mobile-chord-v4.png`
- Equal-size source/implementation comparison: `/private/tmp/midee-guitar-ui-source-comparison-final-v3.png`
- Generated production texture: `public/textures/guitar-fretboard-rosewood.webp`

## Normalization and State

- Source and implementation were compared side by side at 1202 x 838.
- Desktop state: 1202 x 838 CSS viewport at device scale 1, dark theme, Live mode, Guitar view, Position guide open, with both empty and active chord states checked.
- Mobile state: 390 x 844 CSS viewport at device scale 1, dark theme, Live mode, Guitar view, with the compact guide and open Chord sheet checked.

## Full-View Comparison Evidence

The final combined image shows the selected guitar composition rather than the prior piano-derived page: one compact command header, a bounded luthier guide rail, six falling-note lanes, a clear strike line, a lower-stage horizontal rosewood neck, and warm amber-on-black tokens. The neck now ends above the viewport edge instead of behaving like an endless piano roll. The implementation retains the working product's View, Sound, MIDI, record, loop, volume, zoom, and metronome controls without adding a second desktop toolbar.

## Focused Evidence

- Command header: Live context and active chord remain readable; volume, zoom, metronome, record, loop, View, Sound, and MIDI fit in one 60px row at the selected desktop viewport.
- Guide rail: guitar-specific miniature neck, E-A-D-G-B-E tuning, fret labels 3/5/7/9, Position/Tune/Chord/Tips navigation, and active amber edge.
- Play surface: lower bounded rosewood neck with metallic frets, pearl position markers, bronze wound strings, steel treble strings, guitar string labels, and a 54/46 runway-to-neck split.
- Active state: the `C♯` readout occupied x=409.68..484.54 while the embedded HUD started at x=504.63, so the chord and controls did not overlap.
- Mobile: the collapsed guide is 374 x 44. The open Chord sheet is x=8, y=580, width=374, height=256, bottom=836. Its content has no internal horizontal or vertical overflow.

## Findings

- No actionable P0, P1, P2, or P3 visual findings remain in the selected desktop and mobile states.

### Required Fidelity Surfaces

- Typography: the existing Inter, Instrument Serif, and JetBrains Mono stack is preserved. Guitar guide hierarchy, command labels, empty-state copy, and chord readout do not clip.
- Layout: at 1202px the guide is x=7..161, the canvas and accessibility grid are x=161..1202, the surface ends at y=774, and the guide ends at y=702. The document remains exactly 1202px wide.
- Color and material: warm wood brown, amber active states, low-glare black surfaces, subtle borders, real rosewood texture, metal fret relief, pearl markers, and distinct string materials track the source direction.
- Copy: `Guitar guide`, `Position`, `Tune`, `Chord`, `Tips`, the tuning order, chord guidance, and the empty-state instruction are guitar-specific and localized.
- Accessibility: the canvas accessibility grid follows the resized visual surface. The phone guide entry is 44px high, guide tabs are 48px high, and the sheet stays inside the 390 x 844 viewport.

## Comparison History

### Iteration 1 - layout blockers

- P1: Pixi's inline canvas width overrode the guide rail and pushed the fretboard past the viewport edge.
- P1: the mobile guide inherited a desktop top anchor instead of opening as a bottom sheet.
- P2: the first compact-header pass collided with fully mounted Sound and MIDI controls.

### Iteration 2 - renderer material

- Added an ImageGen-produced project-local rosewood texture designed for low-contrast UI use.
- Added layered metal frets, restrained pearl markers, and separate wound/steel string treatments.

### Iteration 3 - UI redesign closure

- P1: at 1202px the implementation still used a second floating toolbar, unlike the selected one-header source.
- P2: the fretboard extended to the viewport bottom and read as an endless piano roll.
- Fixed by integrating live controls into the command header at 1180px+, compressing the redundant desktop actions, using icon-only MIDI, binding the desktop canvas to a lower-stage height, shortening the guide rail, and adding the miniature neck's fret labels.
- Post-fix desktop bounds: strip x=14..1188 and y=12..72; HUD x=504.63..854 and y=15..69; canvas/accessibility grid x=161..1202 and y=0..774; guide x=7..161 and y=76.4..702.4.

## Verification

- `npm run check`: passed, 55 files and 685/685 tests. Five pre-existing lint warnings remain; jsdom emits its known Pixi canvas diagnostic while all tests pass.
- `npx vite build`: passed. Existing chunk-size warnings remain for the Pixi and main bundles.
- `git diff --check` and `git diff --cached --check`: passed.
- Orca browser QA: desktop 1202 x 838 and mobile 390 x 844; Live mode, Position/Chord guide states, active chord, responsive bounds, overflow, and console checked. Console contains only Vite, Tone.js, and local analytics development logs.

## Implementation Checklist

- [x] One command header at the selected desktop viewport.
- [x] Guitar guide is instrument-specific and interactive.
- [x] Desktop guide does not cover note lanes or fretboard cells.
- [x] Pixi surface and accessibility grid resize with the guide rail and bounded stage.
- [x] Persistent controls and active chord do not overlap.
- [x] Mobile uses a 44px entry and bounded bottom sheet.
- [x] All six locales include the new visible strings.
- [x] Real wood material, metal frets, markers, and string types match the selected guitar direction.

final result: passed
