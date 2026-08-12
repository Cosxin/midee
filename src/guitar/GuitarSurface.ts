import {
  Application,
  Assets,
  Container,
  FillPattern,
  Graphics,
  Text,
  TextStyle,
  type Texture,
  type Ticker,
} from 'pixi.js'
import type { MasterClock } from '../core/clock/MasterClock'
import type { MidiFile } from '../core/midi/types'
import type { LiveNote, LiveNoteStore } from '../midi/LiveNoteStore'
import type { RenderLayer } from '../renderer/RenderLayer'
import { darkTheme, getTrackColor, type Theme } from '../renderer/theme'
import type {
  LiveVoiceSource,
  SurfaceHit,
  VisualizationFrameSource,
  VisualizationHitId,
  VisualizationSurface,
} from '../renderer/VisualizationSurface'
import { Viewport } from '../renderer/viewport'
import type { EventSignal } from '../store/eventSignal'
import { createEventSignal } from '../store/eventSignal'
import { FretboardInteraction } from './FretboardInteraction'
import { assignGuitarCluster, precomputeGuitarFingerings } from './fingering'
import { GuitarAccessibilityGrid } from './GuitarAccessibilityGrid'
import {
  centeredPanForFret,
  createGuitarLayout,
  FRET_MARKERS,
  FRETBOARD_LABEL_WIDTH,
  fretboardStringY,
  GUITAR_MAX_FRET,
  GUITAR_STRING_COUNT,
  highwayLaneX,
  pitchAtPosition,
  positionAtPoint,
  positionRect,
} from './GuitarGeometry'
import { candidatePositions, STANDARD_GUITAR_PROFILE } from './profile'
import type { AssignedGuitarVoice, GuitarPosition, GuitarVoice } from './types'

const HIGHWAY_SECONDS = 2.4
const HIGHWAY_HEADER_MIN_Y = 146
const HIGHWAY_HEADER_MAX_Y = 154
const MOBILE_HIGHWAY_HEADER_MIN_Y = 132
const MOBILE_HIGHWAY_HEADER_MAX_Y = 142
const DOUBLE_FRET_MARKERS = new Set([12, 24])
export const GUITAR_CLUSTER_WINDOW_SECONDS = 0.04
const IDLE_GRACE_FRAMES = 30
const STRING_NAMES = ['Low E', 'A', 'D', 'G', 'B', 'High E'] as const
const FRETBOARD_TEXTURE_URL = '/textures/guitar-fretboard-rosewood.webp'
const WOUND_STRING_COLOR = 0xdca06b
const PLAIN_STRING_COLOR = 0xe8e4dc

export function applyGuitarCanvasVisibility(canvas: HTMLCanvasElement, visible: boolean): void {
  canvas.style.visibility = visible ? '' : 'hidden'
  canvas.style.pointerEvents = visible ? '' : 'none'
}

export interface ScheduledGuitarVoice extends AssignedGuitarVoice {
  voiceId: string
  duration: number
  endTime: number
}

/**
 * Balanced BST over schedule notes (already sorted by start time); each node id is its
 * note's array index, and every node carries the max endTime across its own subtree.
 * `queryGuitarSchedule` walks this to prune subtrees that already expired instead of
 * rescanning every note behind `currentTime`, so a single long-sustained note can't force
 * an O(N) lookback across intervening short notes.
 */
export interface GuitarScheduleIndex {
  readonly left: Int32Array
  readonly right: Int32Array
  readonly maxEnd: Float64Array
  readonly root: number
}

export interface GuitarSchedule {
  readonly notes: readonly ScheduledGuitarVoice[]
  readonly index: GuitarScheduleIndex
}

export interface GuitarScheduleWindow {
  active: ScheduledGuitarVoice[]
  upcoming: ScheduledGuitarVoice[]
  inspected: number
}

export function filterGuitarWindow(
  window: GuitarScheduleWindow,
  hiddenTrackIds: ReadonlySet<string>,
): GuitarScheduleWindow {
  return {
    active: window.active.filter((voice) => !hiddenTrackIds.has(voice.sourceId ?? '')),
    upcoming: window.upcoming.filter((voice) => !hiddenTrackIds.has(voice.sourceId ?? '')),
    inspected: window.inspected,
  }
}

export function assignLiveGuitarVoices(notes: readonly LiveNote[]): AssignedGuitarVoice[] {
  const voices = notes.map((note) => ({
    pitch: note.pitch,
    time: note.startTime,
    voiceId: note.voiceId,
    ...(note.channel !== undefined ? { channel: note.channel } : {}),
    ...(note.sourceId !== undefined ? { sourceId: note.sourceId } : {}),
    ...(note.string !== undefined && note.fret !== undefined
      ? { position: { string: note.string, fret: note.fret }, supported: true as const }
      : {}),
  }))
  const performed = voices.filter(
    (voice): voice is typeof voice & { position: GuitarPosition; supported: true } =>
      'position' in voice,
  )
  const reservedStrings = new Set(performed.map((voice) => voice.position.string))
  const availableProfile = {
    ...STANDARD_GUITAR_PROFILE,
    strings: STANDARD_GUITAR_PROFILE.strings.filter((string) => !reservedStrings.has(string.index)),
  }
  return [
    ...performed,
    ...assignGuitarCluster(
      voices.filter((voice) => !('position' in voice)),
      undefined,
      availableProfile,
    ).voices,
  ]
}

export function buildGuitarSchedule(source: MidiFile): GuitarSchedule {
  const durations = new Map<string, number>()
  const voices: GuitarVoice[] = []
  for (const track of source.tracks) {
    track.notes.forEach((note, noteIndex) => {
      const voiceId = `scheduled:${track.id}:${noteIndex}`
      durations.set(voiceId, note.duration)
      voices.push({
        pitch: note.pitch,
        time: note.time,
        channel: track.channel,
        sourceId: track.id,
        voiceId,
      })
    })
  }
  const notes = precomputeGuitarFingerings(
    voices,
    STANDARD_GUITAR_PROFILE,
    GUITAR_CLUSTER_WINDOW_SECONDS,
  )
    .flatMap((cluster) =>
      cluster.voices.map((voice) => {
        const voiceId = voice.voiceId!
        const duration = durations.get(voiceId) ?? 0
        return { ...voice, voiceId, duration, endTime: voice.time + duration }
      }),
    )
    .sort((left, right) => left.time - right.time || left.voiceId.localeCompare(right.voiceId))
  return indexGuitarNotes(notes)
}

export function buildVisibleGuitarSchedule(
  source: MidiFile,
  hiddenTrackIds: ReadonlySet<string>,
): GuitarSchedule {
  return buildGuitarSchedule({
    ...source,
    tracks: source.tracks.filter((track) => !hiddenTrackIds.has(track.id)),
  })
}

/** Builds a schedule (with its interval index) from notes already sorted by (time, voiceId). */
export function indexGuitarNotes(notes: readonly ScheduledGuitarVoice[]): GuitarSchedule {
  return { notes, index: buildScheduleIndex(notes) }
}

function buildScheduleIndex(notes: readonly ScheduledGuitarVoice[]): GuitarScheduleIndex {
  const count = notes.length
  const left = new Int32Array(count).fill(-1)
  const right = new Int32Array(count).fill(-1)
  const maxEnd = new Float64Array(count)

  const build = (lo: number, hi: number): number => {
    if (lo >= hi) return -1
    const mid = (lo + hi) >> 1
    const leftId = build(lo, mid)
    const rightId = build(mid + 1, hi)
    left[mid] = leftId
    right[mid] = rightId
    let best = notes[mid]!.endTime
    if (leftId >= 0 && maxEnd[leftId]! > best) best = maxEnd[leftId]!
    if (rightId >= 0 && maxEnd[rightId]! > best) best = maxEnd[rightId]!
    maxEnd[mid] = best
    return mid
  }

  return { left, right, maxEnd, root: build(0, count) }
}

export function queryGuitarSchedule(
  schedule: GuitarSchedule,
  currentTime: number,
  upcomingSeconds = HIGHWAY_SECONDS,
): GuitarScheduleWindow {
  const { notes, index } = schedule
  const active: ScheduledGuitarVoice[] = []
  let inspected = collectActiveNotes(index, notes, currentTime, active)

  const upcoming: ScheduledGuitarVoice[] = []
  const upcomingLimit = currentTime + upcomingSeconds
  const upcomingStart = lowerBoundTime(notes, currentTime)
  for (let i = upcomingStart; i < notes.length; i++) {
    const note = notes[i]!
    if (note.time > upcomingLimit) break
    inspected++
    if (note.time <= currentTime && note.endTime > currentTime) continue
    upcoming.push(note)
  }
  return { active, upcoming, inspected }
}

/**
 * Point-stabbing query over the interval index: collects notes active at `time` in
 * ascending (time, voiceId) order, descending only into subtrees whose max endTime
 * can still reach `time` and whose starts can still be `<= time`.
 */
function collectActiveNotes(
  index: GuitarScheduleIndex,
  notes: readonly ScheduledGuitarVoice[],
  time: number,
  out: ScheduledGuitarVoice[],
): number {
  let inspected = 0
  const visit = (nodeId: number): void => {
    if (nodeId < 0) return
    inspected++
    const note = notes[nodeId]!
    const leftId = index.left[nodeId]!
    if (leftId >= 0 && index.maxEnd[leftId]! > time) visit(leftId)
    if (note.time <= time) {
      if (note.endTime > time) out.push(note)
      const rightId = index.right[nodeId]!
      if (rightId >= 0 && index.maxEnd[rightId]! > time) visit(rightId)
    }
  }
  visit(index.root)
  return inspected
}

function lowerBoundTime(notes: readonly ScheduledGuitarVoice[], time: number): number {
  let low = 0
  let high = notes.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (notes[middle]!.time < time) low = middle + 1
    else high = middle
  }
  return low
}

export class GuitarRenderActivity {
  idleFrames = 0
  exportMode = false

  wake(): void {
    this.idleFrames = 0
  }

  shouldRender(animating: boolean): boolean {
    if (this.exportMode) return false
    if (animating) {
      this.idleFrames = 0
      return true
    }
    if (this.idleFrames >= IDLE_GRACE_FRAMES) return false
    this.idleFrames++
    return true
  }
}

export function applySurfaceResize(
  renderer: { resolution: number; resize(width: number, height: number): void },
  width: number,
  height: number,
  resolution?: number,
): void {
  if (resolution !== undefined) renderer.resolution = resolution
  renderer.resize(width, height)
}

interface PointerGesture {
  startX: number
  lastX: number
  startedOnNote: boolean
  panning: boolean
}

/** Pixi guitar visualization; app-level selection and audio routing are intentionally external. */
export class GuitarSurface implements VisualizationSurface {
  readonly activeKeys = createEventSignal<ReadonlyMap<VisualizationHitId, number>>(new Map())
  readonly surfaceHits: EventSignal<SurfaceHit | null> = createEventSignal<SurfaceHit | null>(null)

  private app!: Application
  private compatibilityViewport!: Viewport
  private scene!: Container
  private graphics!: Graphics
  private labels!: Container
  private fretboardPattern: FillPattern | null = null
  private accessibilityGrid!: GuitarAccessibilityGrid
  private layout = createGuitarLayout(1, 1)
  private theme: Theme = darkTheme
  private midi: MidiFile | null = null
  private schedule: GuitarSchedule = indexGuitarNotes([])
  private currentWindow: GuitarScheduleWindow = { active: [], upcoming: [], inspected: 0 }
  private liveStore: LiveNoteStore | null = null
  private loopStore: LiveNoteStore | null = null
  private liveStoreUnsub: (() => void) | null = null
  private loopStoreUnsub: (() => void) | null = null
  private clockUnsub: (() => void) | null = null
  private lastTime = 0
  private panX = 0
  private practicePending: ReadonlySet<number> | null = null
  private practiceAccepted: ReadonlySet<number> | null = null
  private practiceTrackIds: Set<string> | null = null
  private hiddenTrackIds = new Set<string>()
  private layers: RenderLayer[] = []
  private gestures = new Map<number, PointerGesture>()
  private interaction = new FretboardInteraction((hit) => this.publishSurfaceHit(hit))
  private activity = new GuitarRenderActivity()
  private clock: MasterClock | null = null
  private canvasResizeObserver: ResizeObserver | null = null

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.app = new Application()
    await this.app.init({
      canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: this.theme.background,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    this.scene = new Container()
    this.graphics = new Graphics()
    this.labels = new Container()
    this.scene.addChild(this.graphics, this.labels)
    this.app.stage.addChild(this.scene)
    try {
      const fretboardTexture = await Assets.load<Texture>(FRETBOARD_TEXTURE_URL)
      this.fretboardPattern = new FillPattern(fretboardTexture, 'repeat')
    } catch {
      // The flat theme fill below remains a complete fallback if the texture cannot load.
      this.fretboardPattern = null
    }
    this.compatibilityViewport = new Viewport({
      canvasWidth: this.app.screen.width,
      canvasHeight: this.app.screen.height,
      keyboardHeight: 0,
      pixelsPerSecond: 200,
    })
    this.bindCanvasEvents()
    this.accessibilityGrid = new GuitarAccessibilityGrid({
      canvas,
      onActivate: (position, pitch) => {
        if (!this.activity.exportMode) this.interaction.keyboardActivate(position, pitch)
      },
      onFocus: (position) => {
        if (this.activity.exportMode) return
        this.panX = centeredPanForFret(position.fret, this.layout)
        this.interaction.noteManualPan(performance.now())
        this.renderStaticFrame(this.lastTime)
      },
    })
    if (import.meta.env.VITE_ENABLE_E2E === '1') canvas.dataset.e2eSurfaceHitCount = '0'
    this.resize(window.innerWidth, window.innerHeight)
    this.canvasResizeObserver = new ResizeObserver(() => this.syncCanvasSize())
    this.canvasResizeObserver.observe(canvas)
    window.addEventListener('resize', this.handleResize)
  }

  attachClock(clock: MasterClock): void {
    this.clock = clock
    this.app.ticker.add((ticker: Ticker) => this.onTick(ticker))
    this.clockUnsub = clock.subscribe(() => this.wake())
  }

  loadMidi(source: VisualizationFrameSource): void {
    this.midi = source
    this.hiddenTrackIds.clear()
    this.schedule = buildVisibleGuitarSchedule(source, this.hiddenTrackIds)
    this.renderStaticFrame(0)
    this.wake()
  }

  clearMidi(): void {
    this.midi = null
    this.hiddenTrackIds.clear()
    this.schedule = indexGuitarNotes([])
    this.currentWindow = { active: [], upcoming: [], inspected: 0 }
    this.interaction.cancelAll()
    this.renderStaticFrame(0)
    this.wake()
  }

  setTrackVisible(trackId: string, visible: boolean): void {
    if (visible) this.hiddenTrackIds.delete(trackId)
    else this.hiddenTrackIds.add(trackId)
    if (this.midi) {
      this.schedule = buildVisibleGuitarSchedule(this.midi, this.hiddenTrackIds)
    }
    this.renderStaticFrame(this.lastTime)
  }

  setLiveNoteStore(store: LiveVoiceSource): void {
    this.liveStoreUnsub?.()
    this.liveStore = store
    this.liveStoreUnsub = store.onChange(() => this.wake())
    this.wake()
  }

  setLoopNoteStore(store: LiveVoiceSource | null): void {
    this.loopStoreUnsub?.()
    this.loopStore = store
    this.loopStoreUnsub = store?.onChange(() => this.wake()) ?? null
    this.wake()
  }

  setLiveNotesVisible(_visible: boolean): void {
    // Guitar has no floating live trajectory layer yet. Held fret highlights and
    // activeKeys are input state, so this contract must not suppress them.
    this.renderStaticFrame(this.lastTime)
    this.wake()
  }

  resize(width: number, height: number, resolution?: number): void {
    applySurfaceResize(this.app.renderer, width, height, resolution)
    this.layout = createGuitarLayout(width, height)
    const focused = this.accessibilityGrid.focusedPosition
    this.panX = focused
      ? centeredPanForFret(focused.fret, this.layout)
      : Math.min(this.panX, this.layout.maxPan)
    this.compatibilityViewport.update({ canvasWidth: width, canvasHeight: height })
    this.rebuildLayers()
    this.renderStaticFrame(this.lastTime)
  }

  renderStaticFrame(currentTime: number): void {
    this.renderFrame(currentTime, 0)
    this.app.renderer.render(this.app.stage)
  }

  renderManualFrame(time: number, dt: number): void {
    this.renderFrame(time, dt)
    this.app.renderer.render(this.app.stage)
  }

  pauseAutoRender(): void {
    this.activity.exportMode = true
    this.app.ticker.stop()
    this.interaction.cancelAll()
    this.gestures.clear()
  }

  resumeAutoRender(): void {
    this.activity.exportMode = false
    this.syncCanvasSize()
    this.wake()
  }

  // Does NOT touch `body.canvas-hidden` — SurfaceRouter owns that class
  // exclusively (it's the only thing that knows whether the *active* surface
  // is hidden; this surface doesn't know if it's even the active one).
  setVisible(visible: boolean): void {
    this.app.stage.visible = visible
    applyGuitarCanvasVisibility(this.app.canvas as HTMLCanvasElement, visible)
    this.accessibilityGrid.setVisible(visible)
    if (!visible) this.cleanupGestures()
    if (visible) this.renderStaticFrame(this.lastTime)
  }

  setPracticeHints(
    pending: ReadonlySet<VisualizationHitId> | null,
    accepted: ReadonlySet<VisualizationHitId> | null,
  ): void {
    this.practicePending = pending
    this.practiceAccepted = accepted
    this.renderStaticFrame(this.lastTime)
  }

  setPracticeTrackFocus(trackIds: Iterable<string> | null): void {
    this.practiceTrackIds = trackIds ? new Set(trackIds) : null
    this.renderStaticFrame(this.lastTime)
  }

  addLayer(layer: RenderLayer): void {
    if (this.layers.includes(layer)) return
    this.layers.push(layer)
    this.layers.sort((a, b) => a.zIndex - b.zIndex)
    layer.mount(this.app.stage)
    layer.rebuild?.({
      viewport: this.compatibilityViewport,
      theme: this.theme,
      time: this.lastTime,
      dt: 0,
    })
    this.renderStaticFrame(this.lastTime)
    this.wake()
  }

  removeLayer(layer: RenderLayer): void {
    const index = this.layers.indexOf(layer)
    if (index < 0) return
    this.layers.splice(index, 1)
    layer.unmount()
    this.renderStaticFrame(this.lastTime)
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.app.renderer.background.color = theme.background
    this.rebuildLayers()
    this.renderStaticFrame(this.lastTime)
  }

  get currentTheme(): Theme {
    return this.theme
  }

  get currentViewport(): undefined {
    return undefined
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement
  }

  get canvasSize(): { width: number; height: number; resolution: number } {
    return {
      width: this.app.canvas.width,
      height: this.app.canvas.height,
      resolution: this.app.renderer.resolution,
    }
  }

  destroy(): void {
    window.removeEventListener('resize', this.handleResize)
    this.canvasResizeObserver?.disconnect()
    this.canvasResizeObserver = null
    this.unbindCanvasEvents()
    this.cleanupGestures()
    this.liveStoreUnsub?.()
    this.loopStoreUnsub?.()
    this.clockUnsub?.()
    // Deliberately does NOT touch `body.canvas-hidden` — see setVisible().
    // The old unconditional `classList.remove` here used to clobber the
    // class if piano (the *other* surface) was legitimately hidden at the
    // moment guitar was destroyed.
    for (const layer of this.layers) layer.unmount()
    this.layers = []
    this.accessibilityGrid.destroy()
    this.app.destroy(false, { children: true })
  }

  wake(): void {
    this.activity.wake()
    if (this.app && !this.activity.exportMode && !this.app.ticker.started) this.app.ticker.start()
  }

  private onTick(ticker: Ticker): void {
    const clock = this.clock
    if (!clock) return
    const hasLive =
      (this.liveStore?.heldVoices.size ?? 0) > 0 || (this.loopStore?.heldVoices.size ?? 0) > 0
    const animating = clock.playing || hasLive || this.layers.length > 0
    if (!this.activity.shouldRender(animating)) {
      this.app.ticker.stop()
      return
    }
    this.renderFrame(clock.currentTime, ticker.deltaMS / 1000)
  }

  private rebuildLayers(): void {
    for (const layer of this.layers) {
      layer.rebuild?.({
        viewport: this.compatibilityViewport,
        theme: this.theme,
        time: this.lastTime,
        dt: 0,
      })
    }
  }

  private renderFrame(currentTime: number, dt: number): void {
    this.lastTime = currentTime
    this.currentWindow = filterGuitarWindow(
      queryGuitarSchedule(this.schedule, currentTime),
      this.hiddenTrackIds,
    )
    const active = this.collectActive()
    const follow = active.find((voice) => voice.position)?.position
    if (
      follow &&
      !this.accessibilityGrid.hasFocus &&
      this.interaction.canAutoFollow(performance.now())
    ) {
      this.panX = centeredPanForFret(follow.fret, this.layout)
    }
    this.draw(active, currentTime)
    if (import.meta.env.VITE_ENABLE_E2E === '1') {
      // Read-only semantic snapshot for Playwright's E2E-only build. Pixi pixels
      // are otherwise opaque; Vite folds this branch away in ordinary builds.
      const canvas = this.app.canvas as HTMLCanvasElement
      canvas.dataset.e2eActivePitches = active.map((voice) => voice.pitch).join(',')
      canvas.dataset.e2eActiveVoices = String(active.length)
      canvas.dataset.e2eUpcomingVoices = String(this.currentWindow.upcoming.length)
      canvas.dataset.e2eHighwayFrame = this.currentWindow.upcoming
        .map((voice) => `${voice.voiceId}:${Math.round((voice.time - currentTime) * 100)}`)
        .join(',')
      canvas.dataset.e2eUnsupportedVoices = String(
        active.filter((voice) => !voice.position).length +
          this.currentWindow.upcoming.filter((voice) => !voice.position).length,
      )
      canvas.dataset.e2ePanX = String(Math.round(this.panX * 100) / 100)
    }
    for (const layer of this.layers) {
      layer.update?.({
        viewport: this.compatibilityViewport,
        theme: this.theme,
        time: currentTime,
        dt,
      })
    }
  }

  private collectActive(): AssignedGuitarVoice[] {
    const liveNotes = [this.liveStore, this.loopStore].flatMap((store) =>
      store ? Array.from(store.heldVoices.values()) : [],
    )
    return [...this.currentWindow.active, ...assignLiveGuitarVoices(liveNotes)]
  }

  private publishSurfaceHit(hit: SurfaceHit): void {
    this.surfaceHits.set(hit)
    if (import.meta.env.VITE_ENABLE_E2E === '1') {
      const canvas = this.app.canvas as HTMLCanvasElement
      canvas.dataset.e2eSurfaceHitCount = String(Number(canvas.dataset.e2eSurfaceHitCount ?? 0) + 1)
      canvas.dataset.e2eLastSurfaceHit = `${hit.type}:${hit.pitch}:${hit.string}:${hit.fret}`
    }
  }

  private draw(active: readonly AssignedGuitarVoice[], currentTime: number): void {
    const g = this.graphics
    g.clear()
    this.labels.removeChildren().forEach((child) => {
      child.destroy()
    })
    this.drawHighway(g, currentTime)
    this.drawFretboard(g)

    const colors = new Map<number, number>()
    let unsupportedRow = 0
    for (const voice of active) {
      const color = this.colorForVoice(voice)
      colors.set(voice.pitch, color)
      if (voice.position) this.drawActivePosition(g, voice.position, color)
      else this.drawUnsupported(g, voice, color, unsupportedRow++)
    }
    this.drawPracticeHints(g, active)
    this.activeKeys.set(colors)
    this.accessibilityGrid.updateGeometry(this.layout, this.panX)
  }

  private drawHighway(g: Graphics, currentTime: number): void {
    g.rect(0, 0, this.layout.width, this.layout.highwayHeight).fill({
      color: this.theme.background,
    })

    const laneWidth = this.layout.width / GUITAR_STRING_COUNT
    const headerY = this.highwayHeaderY()
    const lineTop = Math.min(this.layout.highwayHeight - 18, headerY + 18)
    const nowY = this.layout.highwayHeight - 12
    const travelTop = Math.min(nowY - 1, headerY + 28)

    // Alternating lane washes and time guides make dense passages easier to
    // scan without competing with the track colors used for actual notes.
    for (let string = 0; string < GUITAR_STRING_COUNT; string++) {
      if (string % 2 === 0) {
        g.rect(string * laneWidth, 0, laneWidth, this.layout.highwayHeight).fill({
          color: this.theme.whiteKey,
          alpha: 0.012,
        })
      }
    }
    for (let guide = 1; guide <= 3; guide++) {
      const y = travelTop + ((nowY - travelTop) * guide) / 4
      g.moveTo(0, y).lineTo(this.layout.width, y).stroke({
        color: this.theme.whiteKey,
        alpha: 0.045,
        width: 1,
      })
    }

    for (let string = 0; string < GUITAR_STRING_COUNT; string++) {
      const x = highwayLaneX(string, this.layout)
      const stringWidth = 1 + (GUITAR_STRING_COUNT - 1 - string) * 0.2
      g.moveTo(x, lineTop).lineTo(x, this.layout.highwayHeight).stroke({
        color: this.theme.whiteKey,
        alpha: 0.22,
        width: stringWidth,
      })
      const pillWidth = Math.min(64, Math.max(42, laneWidth - 14))
      g.roundRect(x - pillWidth / 2, headerY - 11, pillWidth, 22, 11)
        .fill({ color: this.theme.blackKey, alpha: 0.78 })
        .stroke({ color: this.theme.whiteKey, alpha: 0.12, width: 1 })
      this.addText(STRING_NAMES[string]!, x, headerY, 10, 0.82, 0.5, '600')
    }

    // A soft outer rail plus a crisp core keeps the strike line legible in
    // every theme while preserving the theme's own accent strength.
    g.moveTo(0, nowY)
      .lineTo(this.layout.width, nowY)
      .stroke({
        color: this.theme.nowLineGlow,
        alpha: this.theme.nowLineAlpha * 0.28,
        width: 7,
      })
    g.moveTo(0, nowY)
      .lineTo(this.layout.width, nowY)
      .stroke({
        color: this.theme.nowLine,
        alpha: Math.min(0.82, this.theme.nowLineAlpha * 2.8),
        width: 1.5,
      })
    for (const voice of this.currentWindow.upcoming) {
      const delta = voice.time - currentTime
      if (delta < 0 || delta > HIGHWAY_SECONDS) continue
      const y = nowY - (delta / HIGHWAY_SECONDS) * Math.max(1, nowY - travelTop)
      if (!voice.position) {
        this.drawUnsupported(g, voice, this.colorForVoice(voice), 0, y)
        continue
      }
      const x = highwayLaneX(voice.position.string, this.layout)
      const color = this.colorForVoice(voice)
      const sustainHeight = Math.min(
        Math.max(0, y - travelTop),
        (voice.duration / HIGHWAY_SECONDS) * Math.max(1, nowY - travelTop),
      )
      if (sustainHeight > 4) {
        g.roundRect(x - 3, y - sustainHeight, 6, sustainHeight, 3).fill({
          color,
          alpha: 0.28,
        })
      }
      g.circle(x, y, 13).fill({ color, alpha: 0.12 })
      g.circle(x, y, 8)
        .fill({ color, alpha: 0.96 })
        .stroke({ color: this.theme.whiteKey, alpha: 0.42, width: 1 })
      this.addText(String(voice.position.fret), x, y, 9, 1, 0.5, '600')
    }
  }

  private drawFretboard(g: Graphics): void {
    g.rect(0, this.layout.fretboardTop, this.layout.width, this.layout.fretboardHeight).fill({
      color: this.theme.blackKey,
      alpha: 0.96,
    })

    if (this.fretboardPattern) {
      g.rect(
        FRETBOARD_LABEL_WIDTH,
        this.layout.fretboardTop,
        this.layout.width - FRETBOARD_LABEL_WIDTH,
        this.layout.fretboardHeight,
      ).fill({ fill: this.fretboardPattern, alpha: 0.54 })
      // Keep the generated wood subordinate to notes, strings, and theme contrast.
      g.rect(
        FRETBOARD_LABEL_WIDTH,
        this.layout.fretboardTop,
        this.layout.width - FRETBOARD_LABEL_WIDTH,
        this.layout.fretboardHeight,
      ).fill({ color: this.theme.blackKey, alpha: 0.22 })
    }

    // Subtle row and fret variation gives the board material depth while
    // keeping the note colors as the only saturated elements.
    for (let row = 0; row < GUITAR_STRING_COUNT; row++) {
      if (row % 2 === 0) {
        g.rect(
          FRETBOARD_LABEL_WIDTH,
          this.layout.fretboardTop + row * this.layout.stringHeight,
          this.layout.width - FRETBOARD_LABEL_WIDTH,
          this.layout.stringHeight,
        ).fill({ color: this.theme.whiteKey, alpha: 0.014 })
      }
    }

    for (let fret = 0; fret <= GUITAR_MAX_FRET; fret++) {
      const x = FRETBOARD_LABEL_WIDTH + fret * this.layout.fretWidth - this.panX
      if (x + this.layout.fretWidth < FRETBOARD_LABEL_WIDTH || x > this.layout.width) continue
      g.rect(x, this.layout.fretboardTop, this.layout.fretWidth, this.layout.fretboardHeight).fill({
        color: this.theme.whiteKey,
        alpha: fret === 0 ? 0.024 : fret % 2 === 0 ? 0.018 : 0.006,
      })

      if (FRET_MARKERS.has(fret)) {
        const markerX = x + this.layout.fretWidth / 2
        const markerYs = DOUBLE_FRET_MARKERS.has(fret)
          ? [
              this.layout.fretboardTop + this.layout.fretboardHeight * 0.34,
              this.layout.fretboardTop + this.layout.fretboardHeight * 0.66,
            ]
          : [this.layout.fretboardTop + this.layout.fretboardHeight / 2]
        for (const markerY of markerYs) {
          g.circle(markerX + 1, markerY + 1, 7).fill({ color: 0x000000, alpha: 0.34 })
          g.circle(markerX, markerY, 6.5)
            .fill({ color: 0xd8cec6, alpha: 0.62 })
            .stroke({ color: 0xffffff, alpha: 0.28, width: 1 })
          g.circle(markerX - 1.5, markerY - 1.5, 1.7).fill({ color: 0xffffff, alpha: 0.38 })
        }
      }

      const isNut = fret === 1
      g.moveTo(x + 1.5, this.layout.fretboardTop)
        .lineTo(x + 1.5, this.layout.height)
        .stroke({
          color: 0x000000,
          alpha: isNut ? 0.58 : 0.48,
          width: isNut ? 6 : 4,
        })
      g.moveTo(x, this.layout.fretboardTop)
        .lineTo(x, this.layout.height)
        .stroke({
          color: isNut ? 0xf0e8df : 0xbaa796,
          alpha: isNut ? 0.84 : 0.74,
          width: isNut ? 4 : 2.4,
        })
      g.moveTo(x - 0.5, this.layout.fretboardTop)
        .lineTo(x - 0.5, this.layout.height)
        .stroke({
          color: 0xffffff,
          alpha: isNut ? 0.78 : 0.46,
          width: isNut ? 1.2 : 0.75,
        })
      if (fret === 0 || FRET_MARKERS.has(fret)) {
        this.addText(
          String(fret),
          x + this.layout.fretWidth / 2,
          this.layout.fretboardTop + 11,
          10,
          0.7,
          0.5,
          '600',
        )
      }
    }

    for (let string = 0; string < GUITAR_STRING_COUNT; string++) {
      const y = fretboardStringY(string, this.layout)
      const stringWidth = 1 + (GUITAR_STRING_COUNT - 1 - string) * 0.22
      const stringColor = string <= 3 ? WOUND_STRING_COLOR : PLAIN_STRING_COLOR
      g.moveTo(FRETBOARD_LABEL_WIDTH, y)
        .lineTo(this.layout.width, y)
        .stroke({ color: 0x000000, alpha: 0.58, width: stringWidth + 2.6 })
      g.moveTo(FRETBOARD_LABEL_WIDTH, y)
        .lineTo(this.layout.width, y)
        .stroke({ color: stringColor, alpha: 0.94, width: stringWidth })
      g.moveTo(FRETBOARD_LABEL_WIDTH, y - 0.45)
        .lineTo(this.layout.width, y - 0.45)
        .stroke({ color: 0xffffff, alpha: string <= 3 ? 0.22 : 0.34, width: 0.55 })
      this.addText(STRING_NAMES[string]!, FRETBOARD_LABEL_WIDTH / 2, y, 10, 0.82, 0.5, '600')
    }

    g.rect(0, this.layout.fretboardTop, FRETBOARD_LABEL_WIDTH, this.layout.fretboardHeight).fill({
      color: this.theme.background,
      alpha: 0.98,
    })
    g.moveTo(FRETBOARD_LABEL_WIDTH, this.layout.fretboardTop)
      .lineTo(FRETBOARD_LABEL_WIDTH, this.layout.height)
      .stroke({ color: this.theme.whiteKey, alpha: 0.16, width: 1 })
    g.moveTo(0, this.layout.fretboardTop)
      .lineTo(this.layout.width, this.layout.fretboardTop)
      .stroke({ color: this.theme.nowLineGlow, alpha: 0.12, width: 6 })
    g.moveTo(0, this.layout.fretboardTop)
      .lineTo(this.layout.width, this.layout.fretboardTop)
      .stroke({ color: this.theme.nowLine, alpha: 0.3, width: 1.5 })
  }

  private drawPracticeHints(g: Graphics, active: readonly AssignedGuitarVoice[]): void {
    const activePitches = new Set(active.map((voice) => voice.pitch))
    for (const [pitches, accepted] of [
      [this.practicePending, false],
      [this.practiceAccepted, true],
    ] as const) {
      if (!pitches) continue
      for (const pitch of pitches) {
        if (activePitches.has(pitch)) continue
        const position = candidatePositions(pitch)[0]
        if (!position) {
          this.drawUnsupported(
            g,
            { pitch, time: this.lastTime, position: null, supported: false },
            this.theme.trackColors[0] ?? this.theme.nowLine,
            0,
          )
          continue
        }
        const rect = positionRect(position, this.layout, this.panX)
        if (rect.x + rect.width < FRETBOARD_LABEL_WIDTH || rect.x > this.layout.width) continue
        const pillWidth = Math.max(24, Math.min(52, rect.width - 14))
        const pillHeight = Math.max(24, Math.min(34, rect.height - 14))
        const pillX = rect.x + (rect.width - pillWidth) / 2
        const pillY = rect.y + (rect.height - pillHeight) / 2
        g.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2)
          .fill({
            color: accepted
              ? this.theme.nowLine
              : (this.theme.trackColors[0] ?? this.theme.nowLine),
            alpha: accepted ? 0.48 : 0.28,
          })
          .stroke({ color: this.theme.nowLine, alpha: 0.65, width: 2 })
      }
    }
  }

  private drawActivePosition(g: Graphics, position: GuitarPosition, color: number): void {
    const rect = positionRect(position, this.layout, this.panX)
    if (rect.x + rect.width < FRETBOARD_LABEL_WIDTH || rect.x > this.layout.width) return
    const hintPitch = pitchAtPosition(position)
    const pending = this.practicePending?.has(hintPitch) ?? false
    const accepted = this.practiceAccepted?.has(hintPitch) ?? false
    const activeColor = accepted ? this.theme.nowLine : color
    const pillWidth = Math.max(26, Math.min(54, rect.width - 12))
    const pillHeight = Math.max(26, Math.min(36, rect.height - 12))
    const pillX = rect.x + (rect.width - pillWidth) / 2
    const pillY = rect.y + (rect.height - pillHeight) / 2
    g.roundRect(pillX - 6, pillY - 6, pillWidth + 12, pillHeight + 12, pillHeight / 2 + 6).fill({
      color: activeColor,
      alpha: 0.13,
    })
    g.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2)
      .fill({ color: activeColor, alpha: pending ? 0.66 : 0.94 })
      .stroke({ color: this.theme.whiteKey, alpha: 0.46, width: 1 })
    this.addText(
      String(position.fret),
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      12,
      1,
      0.5,
      '600',
    )
  }

  private drawUnsupported(
    g: Graphics,
    voice: AssignedGuitarVoice,
    color: number,
    row: number,
    y?: number,
  ): void {
    const railX = this.layout.width - 14
    const railY = Math.min(this.layout.highwayHeight - 18, (y ?? this.highwayHeaderY()) + row * 18)
    g.circle(railX, railY, 6).fill({ color, alpha: 0.7 })
    g.moveTo(railX - 4, railY - 4)
      .lineTo(railX + 4, railY + 4)
      .stroke({ color: 0xffffff })
    this.addText(`!${voice.pitch}`, railX - 22, railY, 9, 0.9, 1)
  }

  private colorForVoice(voice: AssignedGuitarVoice): number {
    const track = this.midi?.tracks.find((candidate) => candidate.id === voice.sourceId)
    if (track && (!this.practiceTrackIds || this.practiceTrackIds.has(track.id))) {
      return getTrackColor(track, this.theme)
    }
    return this.theme.trackColors[0] ?? this.theme.nowLine
  }

  private highwayHeaderY(): number {
    const mobilePortrait = this.layout.width <= 640 && this.layout.height >= this.layout.width
    const minimum = mobilePortrait ? MOBILE_HIGHWAY_HEADER_MIN_Y : HIGHWAY_HEADER_MIN_Y
    const maximum = mobilePortrait ? MOBILE_HIGHWAY_HEADER_MAX_Y : HIGHWAY_HEADER_MAX_Y
    return Math.max(
      0,
      Math.min(
        maximum,
        Math.max(minimum, this.layout.highwayHeight * 0.2),
        this.layout.highwayHeight - 32,
      ),
    )
  }

  private addText(
    text: string,
    x: number,
    y: number,
    size: number,
    alpha = 0.85,
    anchor = 0.5,
    fontWeight: '400' | '500' | '600' = '500',
  ): void {
    const label = new Text({
      text,
      style: new TextStyle({
        fill: this.theme.whiteKey,
        fontFamily: 'Inter, sans-serif',
        fontSize: size,
        fontWeight,
      }),
    })
    label.anchor.set(anchor)
    label.position.set(x, y)
    label.alpha = alpha
    this.labels.addChild(label)
  }

  private bindCanvasEvents(): void {
    const canvas = this.app.canvas
    canvas.style.touchAction = 'pan-y'
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('lostpointercapture', this.onLostPointerCapture)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
  }

  private unbindCanvasEvents(): void {
    const canvas = this.app.canvas
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointercancel', this.onPointerCancel)
    canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture)
    canvas.removeEventListener('wheel', this.onWheel)
  }

  private localPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.accessibilityGrid.blur()
    const point = this.localPoint(event)
    const position = positionAtPoint(point.x, point.y, this.layout, this.panX)
    this.gestures.set(event.pointerId, {
      startX: point.x,
      lastX: point.x,
      startedOnNote: position !== null,
      panning: false,
    })
    this.app.canvas.setPointerCapture?.(event.pointerId)
    if (position) this.interaction.pointerDown(event.pointerId, position, pitchAtPosition(position))
  }

  private onPointerMove = (event: PointerEvent): void => {
    const gesture = this.gestures.get(event.pointerId)
    if (!gesture) return
    const point = this.localPoint(event)
    if (!gesture.panning && Math.abs(point.x - gesture.startX) >= 8) {
      gesture.panning = true
      if (gesture.startedOnNote) this.interaction.pointerCancel(event.pointerId)
    }
    if (!gesture.panning) return
    this.panX = Math.max(0, Math.min(this.layout.maxPan, this.panX - (point.x - gesture.lastX)))
    gesture.lastX = point.x
    this.interaction.noteManualPan(performance.now())
    this.renderStaticFrame(this.lastTime)
  }

  private onPointerUp = (event: PointerEvent): void => {
    this.gestures.delete(event.pointerId)
    this.interaction.pointerUp(event.pointerId)
  }

  private onPointerCancel = (event: PointerEvent): void => {
    this.gestures.delete(event.pointerId)
    this.interaction.pointerCancel(event.pointerId)
  }

  private onLostPointerCapture = (event: PointerEvent): void => {
    if (!this.gestures.has(event.pointerId)) return
    this.gestures.delete(event.pointerId)
    this.interaction.pointerCancel(event.pointerId)
  }

  private onWheel = (event: WheelEvent): void => {
    this.accessibilityGrid.blur()
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) && !event.shiftKey) return
    event.preventDefault()
    const delta = event.deltaX || event.deltaY
    this.panX = Math.max(0, Math.min(this.layout.maxPan, this.panX + delta))
    this.interaction.noteManualPan(performance.now())
    this.renderStaticFrame(this.lastTime)
  }

  private handleResize = (): void => {
    // Export owns the backing-store dimensions until it restores them after capture.
    if (this.activity.exportMode) return
    this.resize(window.innerWidth, window.innerHeight)
  }

  private syncCanvasSize(): void {
    if (this.activity.exportMode || !this.app) return
    const canvas = this.app.canvas as HTMLCanvasElement | undefined
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    if (Math.abs(this.layout.width - width) < 1 && Math.abs(this.layout.height - height) < 1) return
    this.resize(width, height)
  }

  private cleanupGestures(): void {
    this.gestures.clear()
    this.interaction.cancelAll()
  }
}
