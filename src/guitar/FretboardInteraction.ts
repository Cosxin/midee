import type { GuitarPosition } from './types'

export const AUTO_FOLLOW_SUSPEND_MS = 3_000

export type SurfaceHitPhase = 'on' | 'off' | 'cancel'

export interface SurfaceHit {
  phase: SurfaceHitPhase
  pitch: number
  string: number
  fret: number
  pointerId: number | 'keyboard'
  velocity: number
}

export class FretboardInteraction {
  private readonly activePointers = new Map<number, { position: GuitarPosition; pitch: number }>()
  private manualPanUntil = 0

  constructor(private readonly emit: (hit: SurfaceHit) => void) {}

  pointerDown(pointerId: number, position: GuitarPosition, pitch: number, velocity = 1): void {
    const existing = this.activePointers.get(pointerId)
    if (existing) this.endPointer(pointerId, 'cancel')
    this.activePointers.set(pointerId, { position, pitch })
    this.emit({ phase: 'on', pitch, ...position, pointerId, velocity })
  }

  pointerUp(pointerId: number): void {
    this.endPointer(pointerId, 'off')
  }

  pointerCancel(pointerId: number): void {
    this.endPointer(pointerId, 'cancel')
  }

  keyboardActivate(position: GuitarPosition, pitch: number): void {
    const base = { pitch, ...position, pointerId: 'keyboard' as const, velocity: 1 }
    this.emit({ phase: 'on', ...base })
    this.emit({ phase: 'off', ...base })
  }

  noteManualPan(now: number): void {
    this.manualPanUntil = now + AUTO_FOLLOW_SUSPEND_MS
  }

  canAutoFollow(now: number): boolean {
    return now >= this.manualPanUntil
  }

  cancelAll(): void {
    for (const pointerId of Array.from(this.activePointers.keys())) {
      this.endPointer(pointerId, 'cancel')
    }
  }

  private endPointer(pointerId: number, phase: 'off' | 'cancel'): void {
    const active = this.activePointers.get(pointerId)
    if (!active) return
    this.activePointers.delete(pointerId)
    this.emit({ phase, pitch: active.pitch, ...active.position, pointerId, velocity: 0 })
  }
}
