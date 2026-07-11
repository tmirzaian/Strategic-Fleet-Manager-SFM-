import { describe, it, expect } from 'vitest'
import { initialShipImageState, onShipImageError } from '../shipImageState'
import { SHIP_PLACEHOLDER_URL } from '../../constants/shipImage'

describe('ship image fallback state machine', () => {
  it('missing imageUrl uses the local fallback from the start', () => {
    const state = initialShipImageState(undefined)
    expect(state.effectiveSrc).toBe(SHIP_PLACEHOLDER_URL)
    expect(state.usingFallback).toBe(true)
  })

  it('an empty-string src is treated the same as missing', () => {
    const state = initialShipImageState('   ')
    expect(state.usingFallback).toBe(true)
  })

  it('a valid src is used as-is initially, not the fallback', () => {
    const state = initialShipImageState('https://example.com/ship.jpg')
    expect(state.effectiveSrc).toBe('https://example.com/ship.jpg')
    expect(state.usingFallback).toBe(false)
  })

  it('a failed remote image switches to the fallback', () => {
    const initial = initialShipImageState('https://example.com/broken.jpg')
    const afterError = onShipImageError(initial)
    expect(afterError.effectiveSrc).toBe(SHIP_PLACEHOLDER_URL)
    expect(afterError.usingFallback).toBe(true)
  })

  it('the fallback does not trigger an error loop — a second error is a no-op', () => {
    const initial = initialShipImageState('https://example.com/broken.jpg')
    const afterFirstError = onShipImageError(initial)
    const afterSecondError = onShipImageError(afterFirstError)
    // Same object identity — no state change, no further src switching.
    expect(afterSecondError).toBe(afterFirstError)
    expect(afterSecondError.effectiveSrc).toBe(SHIP_PLACEHOLDER_URL)
  })

  it('respects a custom fallbackSrc when provided', () => {
    const customFallback = '/images/custom-fallback.png'
    const state = initialShipImageState(undefined, customFallback)
    expect(state.effectiveSrc).toBe(customFallback)
  })
})
