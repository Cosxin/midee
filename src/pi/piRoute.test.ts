import { describe, expect, it } from 'vitest'
import { isPiPage } from './piRoute'

describe('Pi harness route', () => {
  it('uses pi=1 as the only LED harness entry point', () => {
    expect(isPiPage('?pi=1')).toBe(true)
    expect(isPiPage('?pi=0')).toBe(false)
    expect(isPiPage('?led=1')).toBe(false)
    expect(isPiPage('?led-harness=1')).toBe(false)
  })
})
