import { describe, expect, it } from 'vitest'
import type { MidiFile } from '../core/midi/types'
import type { VisualizationSurface } from '../renderer/VisualizationSurface'
import {
  AccessibilityTargetCache,
  applySurfaceResize,
  buildGuitarSchedule,
  GUITAR_CLUSTER_WINDOW_SECONDS,
  GuitarRenderActivity,
  GuitarSurface,
  indexGuitarNotes,
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
    const schedule = indexGuitarNotes(notes)
    const window = queryGuitarSchedule(schedule, 900, 2.4)
    expect(window.inspected).toBeLessThan(100)
    expect(window.active[0]?.time).toBe(900)
    expect(window.upcoming[0]?.time).toBeCloseTo(900.1)
  })

  it('keeps active queries logarithmic when one long sustain spans thousands of expired notes', () => {
    const SHORT_NOTE_COUNT = 8_000
    const longNote: ScheduledGuitarVoice = {
      pitch: 40,
      time: 0,
      duration: 3600,
      endTime: 3600,
      voiceId: 'scheduled:long:0',
      sourceId: 'long',
      position: { string: 0, fret: 0 },
      supported: true,
    }
    // Short notes densely fill [0.001, 800) and all expire long before currentTime.
    const shortNotes: ScheduledGuitarVoice[] = Array.from(
      { length: SHORT_NOTE_COUNT },
      (_, index) => {
        const time = 0.001 + index * 0.1
        return {
          pitch: 41 + (index % 20),
          time,
          duration: 0.01,
          endTime: time + 0.01,
          voiceId: `scheduled:short:${index}`,
          sourceId: 'short',
          position: { string: 1, fret: index % 20 },
          supported: true,
        }
      },
    )
    // A couple of notes land just after currentTime to verify upcoming stays correct.
    const upcomingA: ScheduledGuitarVoice = {
      pitch: 50,
      time: 1800.5,
      duration: 0.1,
      endTime: 1800.6,
      voiceId: 'scheduled:upcoming:0',
      sourceId: 'upcoming',
      position: { string: 2, fret: 3 },
      supported: true,
    }
    const upcomingB: ScheduledGuitarVoice = {
      pitch: 51,
      time: 1801.0,
      duration: 0.1,
      endTime: 1801.1,
      voiceId: 'scheduled:upcoming:1',
      sourceId: 'upcoming',
      position: { string: 2, fret: 4 },
      supported: true,
    }
    const notes = [longNote, ...shortNotes, upcomingA, upcomingB].sort(
      (left, right) => left.time - right.time || left.voiceId.localeCompare(right.voiceId),
    )
    const totalNotes = notes.length
    const schedule = indexGuitarNotes(notes)

    // currentTime is well after every short note has expired, but still inside the long sustain.
    const window = queryGuitarSchedule(schedule, 1800, 2.4)

    expect(window.active).toHaveLength(1)
    expect(window.active[0]?.voiceId).toBe(longNote.voiceId)

    expect(window.upcoming.map((note) => note.voiceId)).toEqual([
      upcomingA.voiceId,
      upcomingB.voiceId,
    ])

    // Deterministic work bound: must stay near log2(N), nowhere close to a full rescan.
    expect(window.inspected).toBeLessThan(100)
    expect(window.inspected).toBeLessThan(totalNotes / 20)
  })

  it('treats a zero-duration note as upcoming-not-active exactly at its own start time', () => {
    const notes: ScheduledGuitarVoice[] = [
      {
        pitch: 60,
        time: 5,
        duration: 0,
        endTime: 5,
        voiceId: 'scheduled:zero:0',
        sourceId: 'zero',
        position: { string: 3, fret: 0 },
        supported: true,
      },
    ]
    const schedule = indexGuitarNotes(notes)
    const atStart = queryGuitarSchedule(schedule, 5, 2.4)
    expect(atStart.active).toHaveLength(0)
    expect(atStart.upcoming.map((note) => note.voiceId)).toEqual(['scheduled:zero:0'])

    const afterStart = queryGuitarSchedule(schedule, 5.0001, 2.4)
    expect(afterStart.active).toHaveLength(0)
    expect(afterStart.upcoming).toHaveLength(0)
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
