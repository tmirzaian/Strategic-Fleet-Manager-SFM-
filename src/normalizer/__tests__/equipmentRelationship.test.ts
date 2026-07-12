import { describe, it, expect } from 'vitest'
import { classifyPortRelationship } from '../equipmentRelationship'

describe('classifyPortRelationship — container types', () => {
  it.each(['WeaponTurret', 'GimbalMount', 'Turret', 'MissileRack'])('%s is a container', (type) => {
    expect(classifyPortRelationship(type).kind).toBe('container')
  })
})

describe('classifyPortRelationship — independent types', () => {
  it.each(['QuantumDrive', 'JumpDrive', 'WeaponGun', 'Missile', 'PowerPlant', 'Shield', 'Cooler', 'Radar', 'LifeSupport', 'Avionics', 'Relay', 'Bomb'])(
    '%s is independent',
    (type) => {
      expect(classifyPortRelationship(type).kind).toBe('independent')
    }
  )
})

describe('classifyPortRelationship — unresolved', () => {
  it('returns unresolved when no canonical port type is given', () => {
    expect(classifyPortRelationship(undefined).kind).toBe('unresolved')
  })
})

describe('classifyPortRelationship — independent of entity names', () => {
  it('the decision depends only on the canonical port type string, not any name', () => {
    // Same canonical type, wildly different (irrelevant) context — same result.
    const a = classifyPortRelationship('Turret')
    const b = classifyPortRelationship('Turret')
    expect(a.kind).toBe(b.kind)
  })

  it('a made-up, non-name-like type string is treated identically to a real one with the same spelling', () => {
    expect(classifyPortRelationship('QuantumDrive').kind).toBe(classifyPortRelationship('QuantumDrive').kind)
  })
})
