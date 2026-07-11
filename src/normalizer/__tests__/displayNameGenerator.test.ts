import { describe, it, expect } from 'vitest'
import { generateDisplayName } from '../displayNameGenerator'

describe('generateDisplayName', () => {
  it('generates every example from the sprint brief exactly', () => {
    expect(generateDisplayName('hardpoint_gun_left_wing').displayName).toBe('Left Wing Weapon')
    expect(generateDisplayName('hardpoint_gun_right_wing').displayName).toBe('Right Wing Weapon')
    expect(generateDisplayName('hardpoint_shield_generator_left').displayName).toBe('Left Shield Generator')
    expect(generateDisplayName('hardpoint_quantum_drive').displayName).toBe('Quantum Drive')
    expect(generateDisplayName('hardpoint_cooler_right').displayName).toBe('Right Cooler')
    expect(generateDisplayName('hardpoint_missilerack_left_wing_outer').displayName).toBe('Left Outer Wing Missile Rack')
  })

  it('numbers a trailing numeric token as a suffix, not a prefix', () => {
    expect(generateDisplayName('hardpoint_missile_rack_01').displayName).toBe('Missile Rack 1')
    expect(generateDisplayName('hardpoint_missile_rack_02').displayName).toBe('Missile Rack 2')
  })

  it('never relies only on numbering when no type word is recognized', () => {
    const result = generateDisplayName('hardpoint_unknown_thing_04')
    expect(result.displayName).not.toBe('4')
    expect(result.displayName.length).toBeGreaterThan(1)
  })

  it('produces a positionLabel separate from the full displayName', () => {
    const result = generateDisplayName('hardpoint_gun_left_wing')
    expect(result.positionLabel).toBe('Left Wing')
    expect(result.displayName).toContain(result.positionLabel!)
  })

  it('has no positionLabel when the name carries no positional info', () => {
    expect(generateDisplayName('hardpoint_quantum_drive').positionLabel).toBeUndefined()
  })

  it('an override map wins outright over token-based generation', () => {
    const overrides = { hardpoint_weird_thing_9000: 'Experimental Weapon Mount' }
    expect(generateDisplayName('hardpoint_weird_thing_9000', overrides).displayName).toBe('Experimental Weapon Mount')
  })

  it('never exposes the raw internal name as the display name for a recognized port', () => {
    const result = generateDisplayName('hardpoint_gun_left_wing')
    expect(result.displayName).not.toBe('hardpoint_gun_left_wing')
  })
})
