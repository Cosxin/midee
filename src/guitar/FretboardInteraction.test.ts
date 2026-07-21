import { describe, expect, it, vi } from 'vitest'
import {
  AUTO_FOLLOW_SUSPEND_MS,
  FretboardInteraction,
  type SurfaceHit,
} from './FretboardInteraction'

describe('FretboardInteraction', () => {
  it('tracks simultaneous pointers through independent note on/off lifecycles', () => {
    const hits: SurfaceHit[] = []
    const interaction = new FretboardInteraction((hit) => hits.push(hit))
    interaction.pointerDown(1, { string: 0, fret: 3 }, 43, 0.8)
    interaction.pointerDown(2, { string: 5, fret: 5 }, 69)
    interaction.pointerUp(2)
    interaction.pointerUp(1)
    expect(hits.map((hit) => [hit.phase, hit.pointerId, hit.pitch])).toEqual([
      ['on', 1, 43],
      ['on', 2, 69],
      ['off', 2, 69],
      ['off', 1, 43],
    ])
  })

  it('cancels pointers exactly once and cleans all held notes', () => {
    const emit = vi.fn()
    const interaction = new FretboardInteraction(emit)
    interaction.pointerDown(1, { string: 1, fret: 2 }, 47)
    interaction.pointerCancel(1)
    interaction.pointerCancel(1)
    interaction.pointerDown(2, { string: 2, fret: 4 }, 54)
    interaction.cancelAll()
    expect(emit.mock.calls.map((call) => (call[0] as SurfaceHit).phase)).toEqual([
      'on',
      'cancel',
      'on',
      'cancel',
    ])
  })

  it('normalizes keyboard activation as an on/off pair', () => {
    const hits: SurfaceHit[] = []
    const interaction = new FretboardInteraction((hit) => hits.push(hit))
    interaction.keyboardActivate({ string: 4, fret: 1 }, 60)
    expect(hits).toEqual([
      { phase: 'on', pitch: 60, string: 4, fret: 1, pointerId: 'keyboard', velocity: 1 },
      { phase: 'off', pitch: 60, string: 4, fret: 1, pointerId: 'keyboard', velocity: 1 },
    ])
  })

  it('suspends auto-follow for exactly three seconds after manual pan', () => {
    const interaction = new FretboardInteraction(() => {})
    interaction.noteManualPan(1_000)
    expect(interaction.canAutoFollow(1_000 + AUTO_FOLLOW_SUSPEND_MS - 1)).toBe(false)
    expect(interaction.canAutoFollow(1_000 + AUTO_FOLLOW_SUSPEND_MS)).toBe(true)
  })
})
