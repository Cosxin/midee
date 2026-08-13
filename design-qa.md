# Guitar Focus Canvas Design QA

## Comparison Target

- Source visual truth: `/Users/justin/.codex/generated_images/019feb24-6c15-7b01-97d8-7dad77e4e08a/exec-1d267fbe-1eea-43cb-9bd8-38dc51128619.png`
- Rendered implementation: `http://127.0.0.1:5173/`
- Desktop implementation: `/private/tmp/midee-guitar-ui-final-desktop-v7.png`
- Desktop active chord: `/private/tmp/midee-guitar-ui-chord-desktop-final.png`
- Desktop MIDI Play with guide: `/private/tmp/midee-guitar-play-guide-desktop-final-v2.png`
- Desktop playback-follow Position guide: `/private/tmp/midee-guitar-guide-follow-position-final.png`
- Desktop synchronized guide/main fretboard: `/private/tmp/midee-guitar-guide-synced-desktop-final.png`
- User-reported duplicated Position layout: `/var/folders/wq/8fsr8dfx0zv0vkb9wnc70d_c0000gn/T/orca-paste-1786514569804-00c729d6-879e-4233-8d7d-ebf248acbb36.png`
- Desktop performance inspector: `/private/tmp/midee-guitar-inspector-desktop-final.png`
- Desktop horizontal fretboard + bottom details dock: `/private/tmp/midee-guitar-horizontal-1500-final.png`
- Desktop vertical fretboard + left details rail: `/private/tmp/midee-guitar-vertical-1500-final.png`
- Reference/horizontal/vertical comparison: `/private/tmp/midee-guitar-orientation-comparison.png`
- Mobile performance inspector sheet: `/private/tmp/midee-guitar-inspector-mobile-open.png`
- Equal-size user-report/inspector comparison: `/private/tmp/midee-guitar-layout-comparison-final.png`
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
- Position-inspector comparison: the 2404 x 1610 user screenshot was normalized to 1500 x 1000 and paired with a 1500 x 1000 browser capture at device scale 1. Both show dark-theme MIDI Play, Guitar view, Position open, and sounding notes; playback time and chord differ because both captures are live frames from the same sample.
- Orientation-switch comparison: the same user screenshot was normalized to 1500 x 1000 and paired with 1500 x 1000 Live captures of both horizontal and vertical modes. Horizontal shows one full neck plus a 118px details dock; vertical shows one compact neck on the selected side and no second canvas fretboard.

## Full-View Comparison Evidence

The final combined images show the selected guitar composition rather than the prior piano-derived page in both Live and MIDI Play: one compact command header, a bounded luthier guide rail, six falling-note lanes, a clear strike line, a lower-stage horizontal rosewood neck, and warm amber-on-black tokens. The neck now ends above the viewport edge instead of behaving like an endless piano roll. Live retains its musical controls in the command header; Play uses a slim transport rail directly below it without covering the guide or strings.

The final user-report comparison also shows one spatial fretboard instead of two. The rail now acts as a complementary performance inspector: chord/note first, the bottom neck's visible fret range second, and active string/fret coordinates as compact rows. This preserves the left rail's glanceability without asking users to reconcile a rotated miniature neck with the main horizontal neck.

## Focused Evidence

- Command header: Live context and active chord remain readable; volume, zoom, metronome, record, loop, View, Sound, and MIDI fit in one 60px row at the selected desktop viewport.
- Guide rail: guitar-specific Position/Tune/Chord/Tips navigation, current chord/note, visible fret range, active string/fret rows, off-screen indicators, and active amber edge.
- Play surface: lower bounded rosewood neck with metallic frets, pearl position markers, bronze wound strings, steel treble strings, guitar string labels, and a 54/46 runway-to-neck split.
- Active state: the `C♯` readout occupied x=409.68..484.54 while the embedded HUD started at x=504.63, so the chord and controls did not overlap.
- MIDI Play: the guide is x=7..161, transport is x=175..1188 and y=80..126, and the resized guitar surface begins at x=161. The active chord readout remains visible in the command header.
- Playback-follow: the inspector consumes the same active voice assignments and viewport as the guitar renderer. During the sample it updated chord/note, string/fret coordinates, and visible range; notes outside that range remained truthfully listed with an off-screen indicator instead of being hidden or clamped.
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

### Iteration 6 - one fret coordinate system

- P1: the miniature guide and bottom neck used the same active fingering data but different visible fret windows; out-of-window notes were clamped to the guide edge and the four decorative divisions did not describe the bottom neck.
- Fixed by publishing the renderer's exact fractional `startFret` and `fretSpan`, drawing the guide's fret boundaries, labels, and markers from that viewport, and omitting active dots outside the visible range instead of clamping them.
- Post-fix evidence at the reported 1910 x 1277 viewport: guide and main neck both show the same visible range and marker sequence; fret 13 appears at the same normalized location, while sounding fret 3 is truthfully absent from both visible neck regions rather than pinned to the guide edge.

### Iteration 7 - remove the duplicated fretboard model

- P1: the synchronized miniature neck still repeated the same spatial instrument as the bottom neck, forcing users to compare a rotated, compressed map against the primary horizontal fretboard.
- P2: the compact summary concatenated note, string, and fret data, which was difficult to scan during playback and did not explain sounding notes outside the visible neck.
- Fixed by removing the miniature neck from Position and replacing it with a semantic performance inspector: current chord/note, exact visible fret range, high-to-low active string rows, note names, string/fret chips, and a dashed off-screen state. The bottom neck is now the only spatial fretboard.
- Post-fix evidence: the equal-size comparison shows the duplicate neck removed and a materially simpler left rail. At 1500 x 1000 the rail is x=7..197 and the document is exactly 1500px wide. At 390 x 844 the open sheet is x=8..382, y=548.375..836, has a 286px content height, and no internal or document overflow.
- Focused comparison was required because the rail text was too small in the full app view; `/private/tmp/midee-guitar-inspector-desktop-final.png` and `/private/tmp/midee-guitar-inspector-mobile-open.png` confirm legible hierarchy, aligned string/fret chips, bounded rows, and one visible-neck source of truth.

### Iteration 8 - switchable one-fretboard layouts

- P1: a fixed horizontal-only composition could not satisfy players who need a vertical neck without returning to the duplicated left-and-bottom model.
- P2: the Position details needed to follow the active visualization instead of occupying a separate, competing rail.
- Fixed with a mutually exclusive Horizontal/Vertical control. Horizontal retains the full interactive canvas neck and docks the guide details immediately below it. Vertical hides that canvas neck and its invisible accessibility hit-grid, expands the six note lanes, and shows one synchronized vertical neck with its details directly underneath.
- Added a second vertical-only action that swaps the complete guide between left and right. The resized canvas and HUD follow the selected side, while the guide remains outside the note lanes.
- Post-fix desktop evidence at 1500 x 1000: horizontal canvas x=0..1500 and y=0..862, details dock x=7..1493 and y=875..993; vertical-left canvas x=197..1500 and guide x=7..197; vertical-right canvas x=0..1303 and guide x=1303..1493. Only horizontal exposes the canvas fretboard grid.

### Iteration 9 - control hierarchy and readout space

- P2: the first horizontal dock gave most of its width to four oversized section tabs and compressed the live note readout; the vertical rail relied on small icon-only layout and side actions.
- Fixed by assigning the dock's widest column to Position details, reducing the section navigation to a centered compact strip, and turning the layout control into a labeled Horizontal/Vertical segmented choice.
- Replaced the vertical rail's one-way swap icon with explicit Left/Right choices, increased the rail to a readable 188–220px range, and reorganized its sections into a 2 x 2 navigation grid above the single synchronized neck.
- Post-fix evidence at 1500 x 1000: the horizontal dock columns are 276/361/807px, giving the live readout more than half the dock; the vertical rail is 217.5px wide, its layout and side controls are explicit 40px-high segmented buttons, and its four section targets are 44px high. Right-side switching moves the rail to x=1275.5..1493 while the canvas remains x=0..1275.5.

### Iteration 10 - ImageGen panel reference implementation

- Generated and preserved a dedicated 1919 x 820 horizontal panel reference at `docs/design-references/guitar-guide-panel-imagegen-2026-08-12.png`. The reference uses a precision-instrument console direction: one matte black and walnut enclosure, labeled layout switch, compact navigation, amber calibration line, large serif chord, exact fret range, and aligned active-note chips.
- P2: the coded dock still read as three adjacent utility blocks rather than one calibrated performance console, and its chord hierarchy was visually weaker than the generated reference.
- Fixed by increasing the dock to 152px, unifying its dark walnut surface, strengthening its bronze enclosure, giving the selected layout and Position tab tactile wood states, replacing the inspector card border with the reference's vertical amber calibration line, enlarging the live chord/range hierarchy, and reshaping active voices into two-line note chips.
- Equal-size combined review used the generated reference plus the latest 1500 x 1000 browser capture. The implementation intentionally retains the simulator around the panel and uses real dynamic Bach playback data instead of copying the reference's static `D#M` sample.
- Post-fix browser evidence: the first verified reference pass placed the horizontal panel at x=7..1493 and y=841..993 with 340/420/700px columns and four 66px tabs; the final legibility pass increases the dock to 180px and its tabs to 74px while keeping the same zero-overflow three-zone composition. Vertical-right remains x=1275.5..1493, canvas x=0..1275.5, Left/Right controls remain 40px high, and the canvas accessibility grid remains hidden in vertical mode.

### Iteration 11 - ImageGen vertical rail reference implementation

- Generated and preserved a second dedicated reference at `docs/design-references/guitar-guide-vertical-panel-imagegen-2026-08-12.png`. The horizontal implementation sheet depicts one complete tall rail with the same matte-black, walnut, bronze, and amber instrument language as the bottom dock.
- P2: the coded vertical rail had the correct mutually exclusive behavior but still compressed its identity, controls, neck, and live metadata into utility-sized surfaces that did not match the horizontal dock's hierarchy.
- Fixed by widening the adaptive rail to 218–250px, restoring the fretboard emblem, keeping both two-way switches full width, raising the 2 x 2 guide modes to 48px targets, enlarging the single synchronized neck to 136 x 248px, and placing the chord/range inspector plus note rows in a separated amber-calibrated details stack below it.
- Orca browser proof at 1500 x 1000: vertical-left rail x=7..247 and canvas x=247..1500; vertical-right rail x=1253..1493 and canvas x=0..1253. The rail is 240px wide on both sides, its content panel is 216px wide without internal scroll, the visual ends at y=656 before the live inspector begins at y=664, and both document overflow axes remain zero.
- Horizontal regression proof after returning through the visible layout switch: dock x=7..1493 and y=813..993, canvas x=0..1500 and y=0..800, panel scrollHeight equals clientHeight, no vertical visual remains mounted, and both document overflow axes remain zero.

### Iteration 12 - full-height vertical content

- P1: the vertical Position panel still owned an internal scrollbar because its fixed 248px neck and stacked sounding-note rows could exceed the rail's available height.
- Fixed by making the neck height respond to the viewport, removing the panel and note-list scroll owners, and laying out up to six sounding strings in a compact two-column grid. A compact-height breakpoint keeps all four guide modes as 44px targets while reducing only the neck and inspector spacing.
- Orca proof at 850 x 838: the rail is fully visible at x=7..225 and y=88..824; the six-string worst-case panel reports clientHeight=scrollHeight=437px, the note grid reports clientHeight=scrollHeight=106px, every note row reports equal client and scroll dimensions, and both document overflow axes remain zero. Tune, Chord, and Tips also report equal panel client and scroll heights.

## Verification

- `npm run check`: passed, 56 files and 692/692 tests. Five pre-existing lint warnings remain; jsdom emits its known Pixi canvas diagnostic while all tests pass.
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
- [x] Position does not duplicate the primary fretboard; it explains the live musical state and viewport instead.
- [x] Horizontal and vertical layouts are mutually exclusive and keyboard-labeled.
- [x] Vertical layout can swap sides without covering note lanes.
- [x] Position details follow below the active fretboard visualization.

final result: passed
