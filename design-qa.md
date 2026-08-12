# Guitar Focus Canvas Design QA

## Comparison Target

- Source visual truth: `/Users/justin/.codex/generated_images/019feb24-6c15-7b01-97d8-7dad77e4e08a/exec-1d267fbe-1eea-43cb-9bd8-38dc51128619.png`
- Rendered implementation: `http://127.0.0.1:5173/`
- Desktop implementation: `/private/tmp/midee-guitar-ui-final-desktop-v7.png`
- Desktop active chord: `/private/tmp/midee-guitar-ui-chord-desktop-final.png`
- Desktop MIDI Play with guide: `/private/tmp/midee-guitar-play-guide-desktop-final-v2.png`
- Desktop playback-follow Position guide: `/private/tmp/midee-guitar-guide-follow-position-final.png`
- Desktop playback-follow Chord guide: `/private/tmp/midee-guitar-guide-follow-chord-final.png`
- Mobile compact guide: `/private/tmp/midee-guitar-ui-final-mobile-v4.png`
- Mobile Chord panel: `/private/tmp/midee-guitar-ui-final-mobile-chord-v4.png`
- Mobile MIDI Play compact guide: `/private/tmp/midee-guitar-play-guide-mobile-final.png`
- Mobile MIDI Play Position sheet: `/private/tmp/midee-guitar-play-guide-mobile-open-final.png`
- Mobile MIDI Play Chord sheet: `/private/tmp/midee-guitar-play-guide-mobile-chord-final.png`
- Mobile playback-follow Position sheet: `/private/tmp/midee-guitar-guide-follow-mobile-final.png`
- Equal-size source/implementation comparison: `/private/tmp/midee-guitar-ui-source-comparison-final-v3.png`
- Equal-size source/MIDI Play comparison: `/private/tmp/midee-guitar-play-source-comparison-final-v2.png`
- Generated production texture: `public/textures/guitar-fretboard-rosewood.webp`

## Normalization and State

- Original source pixels: 1502 x 1047. The source was center-cropped and normalized to 1202 x 838; the browser implementation was captured at 1202 x 838 CSS pixels, 1202 x 838 output pixels, and device scale 1 for an equal-size comparison.
- Desktop state: 1202 x 838 CSS viewport at device scale 1, dark theme, Live mode, Guitar view, Position guide open, with both empty and active chord states checked.
- Desktop MIDI state: 1202 x 838 CSS viewport at device scale 1, dark theme, Play mode, Guitar view, Chopin sample loaded, Position guide open, active notes and chord checked.
- Mobile state: 390 x 844 CSS viewport at device scale 1, dark theme, Live and Play modes, Guitar view, with the compact guide and open Position/Chord sheets checked.

## Full-View Comparison Evidence

The final combined images show the selected guitar composition rather than the prior piano-derived page in both Live and MIDI Play: one compact command header, a bounded luthier guide rail, six falling-note lanes, a clear strike line, a lower-stage horizontal rosewood neck, and warm amber-on-black tokens. The neck now ends above the viewport edge instead of behaving like an endless piano roll. Live retains its musical controls in the command header; Play uses a slim transport rail directly below it without covering the guide or strings.

## Focused Evidence

- Command header: Live context and active chord remain readable; volume, zoom, metronome, record, loop, View, Sound, and MIDI fit in one 60px row at the selected desktop viewport.
- Guide rail: guitar-specific miniature neck, E-A-D-G-B-E tuning, fret labels 3/5/7/9, Position/Tune/Chord/Tips navigation, and active amber edge.
- Play surface: lower bounded rosewood neck with metallic frets, pearl position markers, bronze wound strings, steel treble strings, guitar string labels, and a 54/46 runway-to-neck split.
- Active state: the `C♯` readout occupied x=409.68..484.54 while the embedded HUD started at x=504.63, so the chord and controls did not overlap.
- MIDI Play: the guide is x=7..161, transport is x=175..1188 and y=80..126, and the resized guitar surface begins at x=161. The active chord readout remains visible in the command header.
- Playback-follow: the miniature neck consumes the same active voice assignments as the guitar renderer. During the sample it changed from `C5 · S1 F8 / F#3 · S4 F4 / D#4 · S2 F4` with fret window 4–7 to `A#5 · S1 F18 / F2 · S6 F1` with fret window 17–20; the Chord panel independently changed to the current chord and note names.
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

### Iteration 4 - shared Play guide and transport polish

- P1: the guitar guide was gated to Live mode, so a loaded MIDI could animate a guitar neck without exposing Position, Tune, Chord, or Tips.
- P2: restoring the guide in Play initially competed with the full floating transport and dense file actions.
- P2: the phone Play header repeated the Learn action already present in the mode switch and retained desktop-only selectors, increasing horizontal pressure.
- Fixed by making guide visibility depend on the Guitar instrument context in both Live and loaded MIDI Play, keeping the guide stable while the playback HUD idles, preserving guitar chord readout in Play, placing transport in a 46px desktop rail, and reducing mobile Play to its primary icon actions.
- Post-fix Play bounds: desktop guide x=7..161 and y=76..702; desktop transport x=175..1188 and y=80..126; mobile compact guide x=8..382 and y=792..836; mobile Position sheet x=8..382 and y=557.5..836; mobile Chord sheet x=8..382 and y=580..836. The mobile document remains 390px wide.

### Iteration 5 - live playback-follow content

- P1: the guide stayed visually static while MIDI playback changed notes, strings, frets, and chords.
- Fixed by publishing the renderer's exact active guitar voice assignments through the stable surface router, then driving the miniature neck, fret window, string/fret summary, and Chord panel from that stream. The guide no longer recomputes a competing fingering.
- Post-fix evidence: seek and playback changed the guide DOM, marker positions, fret labels, chord name, and note list; desktop remained 1202px wide and the open mobile sheet remained within x=8..382 and bottom=836 on a 390 x 844 viewport.

## Verification

- `npm run check`: passed, 55 files and 686/686 tests. Five pre-existing lint warnings remain; jsdom emits its known Pixi canvas diagnostic while all tests pass.
- `npx vite build`: passed. Existing chunk-size warnings remain for the Pixi and main bundles.
- `git diff --check` and `git diff --cached --check`: passed.
- Orca browser QA: desktop 1202 x 838 and mobile 390 x 844; Live and loaded MIDI Play modes, playback, seek, guide open/close, Position/Chord tabs, changing exact string/fret assignments, active chord, responsive bounds, document overflow, and console checked. Console contains only Vite, Tone.js, and local analytics development logs.

## Implementation Checklist

- [x] One command header at the selected desktop viewport.
- [x] Guitar guide is instrument-specific and interactive.
- [x] Guitar guide remains available in both Live and loaded MIDI Play.
- [x] Position and Chord content follow the sounding playback voices.
- [x] Desktop guide does not cover note lanes or fretboard cells.
- [x] Pixi surface and accessibility grid resize with the guide rail and bounded stage.
- [x] Persistent controls and active chord do not overlap.
- [x] Mobile uses a 44px entry and bounded bottom sheet.
- [x] All six locales include the new visible strings.
- [x] Real wood material, metal frets, markers, and string types match the selected guitar direction.

final result: passed
