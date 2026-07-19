import { MIDI_MAX, MIDI_MIN } from '../core/midi/types'
import { LED_OUTPUT_COUNT } from './ledProtocol'

export function activePitchesToOutputs(pitches: Iterable<number>): boolean[] {
  const outputs = Array.from({ length: LED_OUTPUT_COUNT }, () => false)
  for (const pitch of pitches) {
    if (pitch >= MIDI_MIN && pitch <= MIDI_MAX) outputs[pitch - MIDI_MIN] = true
  }
  return outputs
}

export function mismatchIndexes(
  expected: readonly boolean[],
  actual: readonly boolean[],
): ReadonlySet<number> {
  const mismatches = new Set<number>()
  for (let index = 0; index < LED_OUTPUT_COUNT; index++) {
    if (Boolean(expected[index]) !== Boolean(actual[index])) mismatches.add(index)
  }
  return mismatches
}
