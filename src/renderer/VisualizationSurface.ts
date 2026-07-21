import type { MasterClock } from '../core/clock/MasterClock'
import type { MidiFile } from '../core/midi/types'
import type { LiveNoteStore } from '../midi/LiveNoteStore'
import type { EventSignal } from '../store/eventSignal'
import type { RenderLayer } from './RenderLayer'
import type { Theme } from './theme'
import type { Viewport } from './viewport'

// ── Normalized frame/hit contracts ──────────────────────────────────────
//
// These aliases are the seam a future non-piano instrument surface (e.g. a
// fretboard/LED-strip visualization) would widen or replace. Today every
// concrete surface in this app is fed by the same MIDI-derived data, so the
// aliases resolve to the existing piano types — no behavior changes, but call
// sites and the `VisualizationSurface` contract below spell out *why* a value
// is shaped the way it is, independent of "piano" naming.

/** Scheduled/timeline note data a surface renders as it plays back. MIDI
 * today; the alias is what a future source format would replace. */
export type VisualizationFrameSource = MidiFile

/** Live (as-played, not scheduled) voice data — MIDI-in notes, keyboard
 * input, or a future instrument's real-time hits. */
export type LiveVoiceSource = LiveNoteStore

/** Stable identifier for a single "voice" a surface can highlight — a MIDI
 * pitch on the piano roll today. A future surface (e.g. guitar string+fret)
 * would widen this; nothing in the contract assumes more than a number. */
export type VisualizationHitId = number

/**
 * Contract an instrument visualization surface must satisfy to be mounted
 * behind `AppServices.renderer`. `PianoRollRenderer` is the only
 * implementation today (see `PianoRollRenderer implements VisualizationSurface`
 * in `./PianoRollRenderer.ts`); this interface exists so a future surface
 * (e.g. a guitar/fretboard or LED-strip visualization) can be swapped in
 * without widening every call site's type back to the concrete piano class.
 *
 * Grouped by capability rather than call order:
 *   - mount/init/teardown, frame data, live voices, resize, seek/reset,
 *     visibility, practice hints/layers, capture canvas, theme.
 *
 * `currentViewport` is a known, deliberate leak: `Viewport` describes pixel
 * geometry in piano-key terms (`pitchToX`, `pitchWidth`, `pitchAtPoint`) and
 * a handful of Learn exercises read it directly for overlay placement.
 * Generalizing it is out of scope here (no second surface exists yet to
 * design against) — it stays on the contract, documented, rather than
 * silently reintroducing a concrete `PianoRollRenderer` import at every call
 * site that needs it.
 */
export interface VisualizationSurface {
  // ── Mount / init / teardown ─────────────────────────────────────────
  init(canvas: HTMLCanvasElement): Promise<void>
  attachClock(clock: MasterClock): void
  destroy(): void

  // ── Frame data (scheduled/timeline notes) ───────────────────────────
  loadMidi(source: VisualizationFrameSource): void
  clearMidi(): void

  // ── Live voices ──────────────────────────────────────────────────────
  setLiveNoteStore(store: LiveVoiceSource): void
  setLoopNoteStore(store: LiveVoiceSource | null): void
  setLiveNotesVisible(visible: boolean): void
  /** Pitch → color of every voice currently lit, republished on change. */
  readonly activeKeys: EventSignal<ReadonlyMap<VisualizationHitId, number>>

  // ── Resize ───────────────────────────────────────────────────────────
  resize(width: number, height: number, resolution?: number): void
  readonly canvasSize: { width: number; height: number; resolution: number }

  // ── Seek / reset ─────────────────────────────────────────────────────
  // Re-present the scene at a given timeline position without advancing
  // playback (scrubbing, mode re-entry, post-mutation repaint).
  renderStaticFrame(currentTime: number): void

  // ── Visibility ───────────────────────────────────────────────────────
  setVisible(visible: boolean): void

  // ── Practice hints / overlay layers ─────────────────────────────────
  setPracticeHints(
    pending: ReadonlySet<VisualizationHitId> | null,
    accepted: ReadonlySet<VisualizationHitId> | null,
  ): void
  setPracticeTrackFocus(trackIds: Iterable<string> | null): void
  addLayer(layer: RenderLayer): void
  removeLayer(layer: RenderLayer): void

  // ── Capture canvas ───────────────────────────────────────────────────
  readonly canvas: HTMLCanvasElement

  // ── Theme ────────────────────────────────────────────────────────────
  setTheme(theme: Theme): void
  readonly currentTheme: Theme

  // ── Documented piano-specific leak (see interface doc comment) ───────
  readonly currentViewport: Viewport
}
