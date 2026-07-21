import { describe, expect, it, vi } from 'vitest'
import type { RenderLayer } from './RenderLayer'
import { SurfaceRouter } from './SurfaceRouter'
import type { VisualizationSurface } from './VisualizationSurface'

// Hand-built fake surfaces (no Pixi/WebGL) so these tests exercise the
// router's own broadcast/active-only/migration logic in isolation — the
// concrete surfaces (PianoRollRenderer, GuitarSurface) each have their own
// contract tests.
function fakeSurface(name: string): VisualizationSurface & { name: string } {
  return {
    name,
    activeKeys: { value: new Map(), set: vi.fn(), subscribe: vi.fn() } as never,
    init: vi.fn(async () => {}),
    attachClock: vi.fn(),
    destroy: vi.fn(),
    loadMidi: vi.fn(),
    clearMidi: vi.fn(),
    setLiveNoteStore: vi.fn(),
    setLoopNoteStore: vi.fn(),
    setLiveNotesVisible: vi.fn(),
    resize: vi.fn(),
    canvasSize: { width: 800, height: 600, resolution: 1 },
    renderStaticFrame: vi.fn(),
    renderManualFrame: vi.fn(),
    pauseAutoRender: vi.fn(),
    resumeAutoRender: vi.fn(),
    setVisible: vi.fn(),
    setPracticeHints: vi.fn(),
    setPracticeTrackFocus: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    canvas: { name } as unknown as HTMLCanvasElement,
    setTheme: vi.fn(),
    currentTheme: { name: `${name}-theme` } as never,
    currentViewport: undefined,
  }
}

function fakeLayer(id: string): RenderLayer {
  return { id, zIndex: 5, mount: vi.fn(), unmount: vi.fn(), update: vi.fn(), rebuild: vi.fn() }
}

describe('SurfaceRouter', () => {
  it('starts on piano and stays there until setMode switches', () => {
    const piano = fakeSurface('piano')
    const guitar = fakeSurface('guitar')
    const router = new SurfaceRouter(piano, guitar)
    expect(router.currentMode).toBe('piano')
    expect(router.canvas).toBe(piano.canvas)
  })

  // ── Surface/timbre independence: mount-time state always mirrors on both,
  // so switching never re-derives anything (and never touches the selected
  // output instrument, which lives entirely outside this router).
  describe('broadcasts mount-time state to both surfaces', () => {
    it('loadMidi / clearMidi', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      const midi = { name: 'song.mid' } as never
      router.loadMidi(midi)
      expect(piano.loadMidi).toHaveBeenCalledWith(midi)
      expect(guitar.loadMidi).toHaveBeenCalledWith(midi)
      router.clearMidi()
      expect(piano.clearMidi).toHaveBeenCalled()
      expect(guitar.clearMidi).toHaveBeenCalled()
    })

    it('setLiveNoteStore / setLoopNoteStore — same store instance on both', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      const store = { id: 'live' } as never
      router.setLiveNoteStore(store)
      expect(piano.setLiveNoteStore).toHaveBeenCalledWith(store)
      expect(guitar.setLiveNoteStore).toHaveBeenCalledWith(store)
    })

    it('setTheme', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      const theme = { name: 'Sunset' } as never
      router.setTheme(theme)
      expect(piano.setTheme).toHaveBeenCalledWith(theme)
      expect(guitar.setTheme).toHaveBeenCalledWith(theme)
    })

    it('setPracticeHints / setPracticeTrackFocus', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      const pending = new Set([60])
      const accepted = new Set([64])
      router.setPracticeHints(pending, accepted)
      expect(piano.setPracticeHints).toHaveBeenCalledWith(pending, accepted)
      expect(guitar.setPracticeHints).toHaveBeenCalledWith(pending, accepted)

      router.setPracticeTrackFocus(['track-a'])
      expect(piano.setPracticeTrackFocus).toHaveBeenCalledWith(['track-a'])
      expect(guitar.setPracticeTrackFocus).toHaveBeenCalledWith(['track-a'])
    })

    it('attachClock / destroy', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      const clock = {} as never
      router.attachClock(clock)
      expect(piano.attachClock).toHaveBeenCalledWith(clock)
      expect(guitar.attachClock).toHaveBeenCalledWith(clock)

      router.destroy()
      expect(piano.destroy).toHaveBeenCalled()
      expect(guitar.destroy).toHaveBeenCalled()
    })
  })

  describe('setMode switching', () => {
    it('pauses + hides the outgoing surface and wakes + shows the incoming one at the given time', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)

      router.setMode('guitar', 12.5)

      expect(piano.pauseAutoRender).toHaveBeenCalled()
      expect(piano.setVisible).toHaveBeenCalledWith(false)
      expect(guitar.resumeAutoRender).toHaveBeenCalled()
      expect(guitar.setVisible).toHaveBeenCalledWith(true)
      expect(guitar.renderStaticFrame).toHaveBeenCalledWith(12.5)
      expect(router.currentMode).toBe('guitar')
    })

    it('is a no-op when already on the requested mode', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      router.setMode('piano', 5)
      expect(piano.pauseAutoRender).not.toHaveBeenCalled()
      expect(piano.setVisible).not.toHaveBeenCalled()
    })

    it('carries the last requested visibility onto the newly active surface', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      // Learn's hub view hides the surface while piano is active...
      router.setVisible(false)
      expect(piano.setVisible).toHaveBeenLastCalledWith(false)
      // ...switching to guitar must not flash it visible before the caller
      // re-shows it.
      router.setMode('guitar', 0)
      expect(guitar.setVisible).toHaveBeenLastCalledWith(false)
    })
  })

  describe('layer migration', () => {
    it('mounts a registered layer on the incoming surface and unmounts it from the outgoing one', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      const layer = fakeLayer('learn-overlay')

      router.addLayer(layer)
      expect(piano.addLayer).toHaveBeenCalledWith(layer)
      expect(guitar.addLayer).not.toHaveBeenCalled()

      router.setMode('guitar', 0)
      expect(piano.removeLayer).toHaveBeenCalledWith(layer)
      expect(guitar.addLayer).toHaveBeenCalledWith(layer)

      router.setMode('piano', 0)
      expect(guitar.removeLayer).toHaveBeenCalledWith(layer)
      expect(piano.addLayer).toHaveBeenCalledTimes(2)
    })

    it('addLayer is idempotent for the same layer instance', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      const layer = fakeLayer('learn-overlay')
      router.addLayer(layer)
      router.addLayer(layer)
      expect(piano.addLayer).toHaveBeenCalledTimes(1)
    })

    it('removeLayer stops it from migrating on a later switch', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      const layer = fakeLayer('learn-overlay')
      router.addLayer(layer)
      router.removeLayer(layer)
      router.setMode('guitar', 0)
      expect(guitar.addLayer).not.toHaveBeenCalled()
    })
  })

  // ── Active-surface-only: this is what makes MP4 export capture "whichever
  // surface is on screen" for free — `canvas`/`canvasSize`/`renderManualFrame`
  // all resolve against the currently active surface.
  describe('active-surface-only delegation (export selection)', () => {
    it('canvas/canvasSize track the active surface across a switch', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      expect(router.canvas).toBe(piano.canvas)

      router.setMode('guitar', 0)
      expect(router.canvas).toBe(guitar.canvas)
      expect(router.canvasSize).toBe(guitar.canvasSize)
    })

    it('resize / renderManualFrame / pauseAutoRender / resumeAutoRender only touch the active surface', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      router.setMode('guitar', 0)
      vi.clearAllMocks()

      router.resize(1080, 1920, 1)
      router.renderManualFrame(3, 0.016)
      router.pauseAutoRender()
      router.resumeAutoRender()

      expect(guitar.resize).toHaveBeenCalledWith(1080, 1920, 1)
      expect(guitar.renderManualFrame).toHaveBeenCalledWith(3, 0.016)
      expect(guitar.pauseAutoRender).toHaveBeenCalled()
      expect(guitar.resumeAutoRender).toHaveBeenCalled()
      expect(piano.resize).not.toHaveBeenCalled()
      expect(piano.renderManualFrame).not.toHaveBeenCalled()
    })

    it('currentTheme / activeKeys / currentViewport read from the active surface', () => {
      const piano = fakeSurface('piano')
      const guitar = fakeSurface('guitar')
      const router = new SurfaceRouter(piano, guitar)
      expect(router.currentTheme).toBe(piano.currentTheme)
      router.setMode('guitar', 0)
      expect(router.currentTheme).toBe(guitar.currentTheme)
      expect(router.activeKeys).toBe(guitar.activeKeys)
      expect(router.currentViewport).toBe(guitar.currentViewport)
    })
  })
})
