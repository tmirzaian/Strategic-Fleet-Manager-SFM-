import { describe, it, expect } from 'vitest'
import { resolveManufacturerLogo } from '../manufacturerLogo'

describe('resolveManufacturerLogo (Alpha 2.5C, Part 10)', () => {
  it('normalizes known manufacturer aliases to their code', () => {
    expect(resolveManufacturerLogo('Anvil').code).toBe('ANVL')
    expect(resolveManufacturerLogo('Aegis Dynamics').code).toBe('AEGS')
    expect(resolveManufacturerLogo('Drake Interplanetary').code).toBe('DRAK')
    expect(resolveManufacturerLogo('RSI').code).toBe('RSI')
  })

  it('6. an unknown manufacturer falls back gracefully rather than throwing', () => {
    const result = resolveManufacturerLogo('Some New Shipyard')
    expect(result.code).toBeTruthy()
    expect(result.logoPath).toBeUndefined()
  })

  it('handles an empty string without throwing', () => {
    expect(() => resolveManufacturerLogo('')).not.toThrow()
    expect(resolveManufacturerLogo('').code).toBe('—')
  })

  it('every manufacturer currently resolves to the text fallback (no local logo assets shipped yet)', () => {
    expect(resolveManufacturerLogo('Anvil').logoPath).toBeUndefined()
  })
})
