export type VisualizationMode = 'piano-roll' | 'guitar'

export interface GuitarString {
  /** Zero-based, ordered from the lowest-pitched string. */
  index: number
  openPitch: number
  maxFret: number
}

export interface GuitarProfile {
  strings: readonly GuitarString[]
}

export interface GuitarVoice {
  pitch: number
  time: number
  channel?: number
}

export interface GuitarPosition {
  string: number
  fret: number
}

export interface AssignedGuitarVoice extends GuitarVoice {
  position: GuitarPosition | null
  supported: boolean
}

export interface GuitarClusterAssignment {
  time: number
  voices: readonly AssignedGuitarVoice[]
}
