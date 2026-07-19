export const LED_OUTPUT_COUNT = 100

export interface LedSetMessage {
  type: 'set'
  index: number
  on: boolean
  color?: string
  velocity?: number
}

export interface LedClearMessage {
  type: 'clear_all'
}

export interface LedSnapshotMessage {
  type: 'snapshot'
  outputs: readonly boolean[]
}

export type PiPlaybackState = 'idle' | 'playing' | 'paused' | 'stopped' | 'finished'

export interface PiStatusMessage {
  type: 'status'
  state: PiPlaybackState
  song: string
  position: number
  duration: number
  eventCount: number
}

export type LedMessage = LedSetMessage | LedClearMessage | LedSnapshotMessage | PiStatusMessage

function isOutputIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < LED_OUTPUT_COUNT
}

export function parseLedMessage(value: unknown): LedMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Record<string, unknown>
  if (message.type === 'clear_all') return { type: 'clear_all' }
  if (
    message.type === 'status' &&
    ['idle', 'playing', 'paused', 'stopped', 'finished'].includes(String(message.state)) &&
    typeof message.song === 'string' &&
    typeof message.position === 'number' &&
    typeof message.duration === 'number' &&
    typeof message.eventCount === 'number'
  ) {
    return {
      type: 'status',
      state: message.state as PiPlaybackState,
      song: message.song,
      position: message.position,
      duration: message.duration,
      eventCount: message.eventCount,
    }
  }
  if (message.type === 'set' && isOutputIndex(message.index) && typeof message.on === 'boolean') {
    const parsed: LedSetMessage = { type: 'set', index: message.index, on: message.on }
    if (typeof message.color === 'string') parsed.color = message.color
    if (typeof message.velocity === 'number') parsed.velocity = message.velocity
    return parsed
  }
  if (
    message.type === 'snapshot' &&
    Array.isArray(message.outputs) &&
    message.outputs.length === LED_OUTPUT_COUNT &&
    message.outputs.every((output) => typeof output === 'boolean')
  ) {
    return { type: 'snapshot', outputs: message.outputs }
  }
  return null
}

export function parseLedMessageJson(json: string): LedMessage | null {
  try {
    return parseLedMessage(JSON.parse(json))
  } catch {
    return null
  }
}

/** Convert the Pi bridge's MIDI velocity (0-127) to Midee's 0-1 scale. */
export function midiVelocityToUnit(velocity: number | undefined, fallback = 0.8): number {
  if (velocity === undefined || !Number.isFinite(velocity)) return fallback
  return Math.max(0, Math.min(127, velocity)) / 127
}

export function applyLedMessage(outputs: readonly boolean[], message: LedMessage): boolean[] {
  if (message.type === 'status') return [...outputs]
  if (message.type === 'clear_all') return Array.from({ length: LED_OUTPUT_COUNT }, () => false)
  if (message.type === 'snapshot') return [...message.outputs]
  const next = [...outputs]
  next[message.index] = message.on
  return next
}
