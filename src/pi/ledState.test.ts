import { describe, expect, it } from 'vitest'
import { activePitchesToOutputs, mismatchIndexes } from './ledState'

describe('LED harness state', () => {
  it('maps the piano endpoints while leaving auxiliary outputs off', () => {
    const outputs = activePitchesToOutputs([20, 21, 60, 108, 109])
    expect(outputs).toHaveLength(100)
    expect(outputs[0]).toBe(true)
    expect(outputs[39]).toBe(true)
    expect(outputs[87]).toBe(true)
    expect(outputs.slice(88).some(Boolean)).toBe(false)
  })

  it('reports indexes whose expected and actual states differ', () => {
    const expected = activePitchesToOutputs([21, 60])
    const actual = activePitchesToOutputs([21, 61])
    expect([...mismatchIndexes(expected, actual)]).toEqual([39, 40])
  })
})
