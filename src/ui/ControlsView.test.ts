import { describe, expect, it } from 'vitest'
import type { SurfaceActiveVoice } from '../renderer/VisualizationSurface'
import {
  getGuitarGuideFretRange,
  isGuitarVoiceInViewport,
  orderGuitarGuideVoices,
} from './ControlsView'

type PositionedVoice = SurfaceActiveVoice & { string: number; fret: number }

const voice = (pitch: number, string: number, fret: number): PositionedVoice => ({
  pitch,
  string,
  fret,
  color: 0xff8a3d,
})

describe('guitar guide position inspector', () => {
  it('reports the whole visible fret range from fractional viewport edges', () => {
    expect(getGuitarGuideFretRange({ startFret: 8.4, fretSpan: 12.2 })).toEqual({
      start: 8,
      end: 20,
    })
    expect(getGuitarGuideFretRange({ startFret: -0.4, fretSpan: 30 })).toEqual({
      start: 0,
      end: 24,
    })
  })

  it('marks voices outside the exact surface viewport instead of hiding them', () => {
    const viewport = { startFret: 8.4, fretSpan: 12.2 }

    expect(isGuitarVoiceInViewport(voice(69, 5, 9), viewport)).toBe(true)
    expect(isGuitarVoiceInViewport(voice(64, 5, 8), viewport)).toBe(false)
    expect(isGuitarVoiceInViewport(voice(88, 5, 24), viewport)).toBe(false)
  })

  it('orders the readout from high E toward low E without mutating surface state', () => {
    const voices = [voice(40, 0, 0), voice(59, 4, 0), voice(76, 5, 17)]

    expect(orderGuitarGuideVoices(voices).map((item) => item.string)).toEqual([5, 4, 0])
    expect(voices.map((item) => item.string)).toEqual([0, 4, 5])
  })
})
