import type { MasterClock } from '../core/clock/MasterClock'
import type { VisualizationMode } from '../guitar/types'
import type { RenderLayer } from './RenderLayer'
import type { Theme } from './theme'
import type {
  LiveVoiceSource,
  VisualizationFrameSource,
  VisualizationHitId,
  VisualizationSurface,
} from './VisualizationSurface'

/**
 * Routes `AppServices.renderer` calls to whichever concrete surface (piano or
 * guitar) is currently selected, while keeping both surfaces' mount-time
 * state (loaded MIDI, live/loop note stores, theme, live-notes visibility,
 * practice hints/focus, external render layers) in sync — so a switch is
 * instant and never needs to re-derive anything from scratch.
 *
 * `App` owns both concrete surfaces (each on its own canvas, both `init()`ed
 * at boot) and constructs this router once; every other consumer only ever
 * sees the `VisualizationSurface` contract.
 *
 * Frame/canvas-identity operations (`resize`, `renderStaticFrame`,
 * `renderManualFrame`, `pauseAutoRender`, `resumeAutoRender`, `canvas`,
 * `canvasSize`, `currentViewport`, `activeKeys`) apply only to the active
 * surface — that's what makes MP4 export capture "whichever surface is on
 * screen" for free (`canvas`/`canvasSize` delegate live). `setVisible`
 * applies to the active surface too, but the router remembers the last
 * requested visibility so a newly-activated surface picks it up immediately
 * instead of flashing visible before the caller re-hides it.
 *
 * `addLayer`/`removeLayer` are special: a `RenderLayer` mounts a Pixi
 * `Container` into exactly one stage, so the same layer instance can't be
 * mounted on both surfaces at once. The router tracks registered layers and
 * migrates them (unmount from the outgoing surface, mount + rebuild on the
 * incoming one) on every `setMode` switch.
 */
export class SurfaceRouter implements VisualizationSurface {
  private active: VisualizationSurface
  private mode: VisualizationMode = 'piano'
  private desiredVisible = true
  private readonly layers: RenderLayer[] = []

  constructor(
    private readonly piano: VisualizationSurface,
    private readonly guitar: VisualizationSurface,
  ) {
    this.active = piano
  }

  get currentMode(): VisualizationMode {
    return this.mode
  }

  private get surfaces(): readonly VisualizationSurface[] {
    return [this.piano, this.guitar]
  }

  private surfaceFor(mode: VisualizationMode): VisualizationSurface {
    return mode === 'guitar' ? this.guitar : this.piano
  }

  // Switches which concrete surface is live. Broadcast state (MIDI, live
  // stores, theme, hints) is already mirrored on both surfaces, so the only
  // work here is: pause + hide the outgoing surface, migrate any registered
  // layers, then show + wake the incoming one at `currentTime`.
  setMode(mode: VisualizationMode, currentTime: number): void {
    if (mode === this.mode) return
    const next = this.surfaceFor(mode)
    const prev = this.active
    if (prev === next) {
      this.mode = mode
      return
    }
    for (const layer of this.layers) prev.removeLayer(layer)
    prev.setVisible(false)
    prev.pauseAutoRender()

    this.active = next
    this.mode = mode

    for (const layer of this.layers) next.addLayer(layer)
    next.resumeAutoRender()
    next.setVisible(this.desiredVisible)
    next.renderStaticFrame(currentTime)
  }

  // ── Broadcast: both surfaces stay mounted with identical state ─────────

  async init(): Promise<void> {
    // No-op: `App` initializes each concrete surface directly (each owns its
    // own canvas) before this router is constructed.
  }

  attachClock(clock: MasterClock): void {
    for (const s of this.surfaces) s.attachClock(clock)
  }

  loadMidi(source: VisualizationFrameSource): void {
    for (const s of this.surfaces) s.loadMidi(source)
  }

  clearMidi(): void {
    for (const s of this.surfaces) s.clearMidi()
  }

  setLiveNoteStore(store: LiveVoiceSource): void {
    for (const s of this.surfaces) s.setLiveNoteStore(store)
  }

  setLoopNoteStore(store: LiveVoiceSource | null): void {
    for (const s of this.surfaces) s.setLoopNoteStore(store)
  }

  setLiveNotesVisible(visible: boolean): void {
    for (const s of this.surfaces) s.setLiveNotesVisible(visible)
  }

  setTheme(theme: Theme): void {
    for (const s of this.surfaces) s.setTheme(theme)
  }

  setPracticeHints(
    pending: ReadonlySet<VisualizationHitId> | null,
    accepted: ReadonlySet<VisualizationHitId> | null,
  ): void {
    for (const s of this.surfaces) s.setPracticeHints(pending, accepted)
  }

  setPracticeTrackFocus(trackIds: Iterable<string> | null): void {
    // `Iterable` may be a one-shot generator — snapshot so the second
    // surface doesn't get an already-exhausted iterator.
    const ids = trackIds ? Array.from(trackIds) : null
    for (const s of this.surfaces) s.setPracticeTrackFocus(ids)
  }

  addLayer(layer: RenderLayer): void {
    if (this.layers.includes(layer)) return
    this.layers.push(layer)
    this.active.addLayer(layer)
  }

  removeLayer(layer: RenderLayer): void {
    const idx = this.layers.indexOf(layer)
    if (idx < 0) return
    this.layers.splice(idx, 1)
    this.active.removeLayer(layer)
  }

  destroy(): void {
    for (const s of this.surfaces) s.destroy()
  }

  // ── Active-surface-only: frame/canvas identity ──────────────────────────

  get activeKeys(): VisualizationSurface['activeKeys'] {
    return this.active.activeKeys
  }

  // No `surfaceHits` here: it's `SurfaceHit`-emitting only for interactive
  // surfaces (the fretboard), and `App` subscribes directly on
  // `guitarSurface.surfaceHits` rather than routing it through here — the
  // hits only ever fire while that canvas is the one receiving events anyway.

  get canvas(): HTMLCanvasElement {
    return this.active.canvas
  }

  get canvasSize(): { width: number; height: number; resolution: number } {
    return this.active.canvasSize
  }

  get currentTheme(): Theme {
    return this.active.currentTheme
  }

  get currentViewport(): VisualizationSurface['currentViewport'] {
    return this.active.currentViewport
  }

  resize(width: number, height: number, resolution?: number): void {
    this.active.resize(width, height, resolution)
  }

  renderStaticFrame(currentTime: number): void {
    this.active.renderStaticFrame(currentTime)
  }

  renderManualFrame(time: number, dt: number): void {
    this.active.renderManualFrame(time, dt)
  }

  pauseAutoRender(): void {
    this.active.pauseAutoRender()
  }

  resumeAutoRender(): void {
    this.active.resumeAutoRender()
  }

  setVisible(visible: boolean): void {
    this.desiredVisible = visible
    this.active.setVisible(visible)
  }
}
