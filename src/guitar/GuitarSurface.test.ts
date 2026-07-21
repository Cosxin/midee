import { describe, expect, it } from 'vitest'
import type { VisualizationSurface } from '../renderer/VisualizationSurface'
import { GuitarSurface } from './GuitarSurface'

function asVisualizationSurface(surface: GuitarSurface): VisualizationSurface {
  return surface
}
void asVisualizationSurface

describe('GuitarSurface contract', () => {
  it('constructs without WebGL and exposes normalized surface hits', () => {
    const surface = new GuitarSurface()
    expect(asVisualizationSurface(surface)).toBe(surface)
    expect(surface.surfaceHits.value).toBeNull()
    expect(surface.activeKeys.value).toEqual(new Map())
    expect(surface.currentTheme.name).toBe('Dark')
  })
})
