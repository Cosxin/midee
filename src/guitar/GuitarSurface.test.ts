import { describe, expect, it } from 'vitest'
import type { MidiFile } from '../core/midi/types'
import type { VisualizationSurface } from '../renderer/VisualizationSurface'
import {
  AccessibilityTargetCache,
  applySurfaceResize,
  buildGuitarSchedule,
  GUITAR_CLUSTER_WINDOW_SECONDS,
  GuitarRenderActivity,
  type GuitarSchedule,
  GuitarSurface,
  queryGuitarSchedule,
  type ScheduledGuitarVoice,
} from './GuitarSurface'

function asVisualizationSurface(surface: GuitarSurface): VisualizationSurface {
  return surface
}
void asVisualizationSurface

function midiAt(times: readonly number[]): MidiFile {
  return {
    name: 'timing',
    duration: 5,
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [
      {
        id: 'track-a',
        name: 'Guitar',
        channel: 2,
        instrument: 24,
        isDrum: false,
        color: 0xffffff,
        colorIndex: 0,
        notes: times.map((time) => ({ pitch: 64, time, duration: 0.5, velocity: 0.8 })),
      },
    ],
  }
}

describe('GuitarSurface contract', () => {
  it('exposes shared normalized hits without fabricating a piano viewport', () => {
    const surface = new GuitarSurface()
    expect(asVisualizationSurface(surface)).toBe(surface)
    expect(surface.surfaceHits.value).toBeNull()
    expect(surface.currentViewport).toBeUndefined()
    expect(surface.activeKeys.value).toEqual(new Map())
    expect(surface.currentTheme.name).toBe('Dark')
  })
})

describe('guitar schedule', () => {
  it('clusters 0.040-second notes together and splits 0.041-second notes', () => {
    expect(GUITAR_CLUSTER_WINDOW_SECONDS).toBe(0.04)
    const together = buildGuitarSchedule(midiAt([0, 0.04])).notes
    const split = buildGuitarSchedule(midiAt([0, 0.041])).notes
    expect(together[0]!.position?.string).not.toBe(together[1]!.position?.string)
    expect(split[0]!.position).toEqual(split[1]!.position)
  })

  it('assigns deterministic IDs and caches duration/end time on every voice', () => {
    const first = buildGuitarSchedule(midiAt([0.2, 0.1]))
    const second = buildGuitarSchedule(midiAt([0.2, 0.1]))
    expect(first).toEqual(second)
    expect(first.notes.map((note) => note.voiceId)).toEqual([
      'scheduled:track-a:1',
      'scheduled:track-a:0',
    ])
    expect(first.notes.map((note) => [note.duration, note.endTime])).toEqual([
      [0.5, 0.6],
      [0.5, 0.7],
    ])
  })

  it('uses binary time bounds instead of rescanning all past notes', () => {
    const notes: ScheduledGuitarVoice[] = Array.from({ length: 10_000 }, (_, index) => ({
      pitch: 40,
      time: index * 0.1,
      duration: 0.05,
      endTime: index * 0.1 + 0.05,
      voiceId: `scheduled:t:${index}`,
      sourceId: 't',
      position: { string: 0, fret: 0 },
      supported: true,
    }))
    const schedule: GuitarSchedule = { notes, maxDuration: 0.05 }
    const window = queryGuitarSchedule(schedule, 900, 2.4)
    expect(window.inspected).toBeLessThan(30)
    expect(window.active[0]?.time).toBe(900)
    expect(window.upcoming[0]?.time).toBeCloseTo(900.1)
  })
})

describe('surface lifecycle helpers', () => {
  it('renders a 30-frame idle grace, wakes, and yields rendering during capture', () => {
    const activity = new GuitarRenderActivity()
    for (let frame = 0; frame < 30; frame++) expect(activity.shouldRender(false)).toBe(true)
    expect(activity.shouldRender(false)).toBe(false)
    activity.wake()
    expect(activity.shouldRender(false)).toBe(true)
    activity.exportMode = true
    expect(activity.shouldRender(true)).toBe(false)
    activity.exportMode = false
    expect(activity.shouldRender(true)).toBe(true)
  })

  it('invalidates accessible targets for resize and pan, but not stable frames', () => {
    const cache = new AccessibilityTargetCache()
    expect(cache.needsRebuild(390, 844, 0)).toBe(true)
    expect(cache.needsRebuild(390, 844, 0)).toBe(false)
    expect(cache.needsRebuild(390, 844, 44)).toBe(true)
    expect(cache.needsRebuild(430, 844, 44)).toBe(true)
    cache.invalidate()
    expect(cache.needsRebuild(430, 844, 44)).toBe(true)
  })

  it('sets capture resolution before resizing the backing store', () => {
    const calls: string[] = []
    let currentResolution = 2
    const renderer = {
      get resolution() {
        return currentResolution
      },
      set resolution(value: number) {
        currentResolution = value
        calls.push(`resolution:${value}`)
      },
      resize(width: number, height: number) {
        calls.push(`resize:${width}x${height}@${currentResolution}`)
      },
    }
    applySurfaceResize(renderer, 1920, 1080, 1)
    expect(calls).toEqual(['resolution:1', 'resize:1920x1080@1'])
  })
})
