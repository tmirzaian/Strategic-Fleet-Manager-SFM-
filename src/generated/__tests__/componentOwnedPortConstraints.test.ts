import { describe, it, expect } from 'vitest'
import { getComponentOwnedPortConstraint } from '../componentOwnedPortConstraints'

describe('getComponentOwnedPortConstraint — null-safety (EWO-055)', () => {
  it('returns null for a missing/nullish ownerEntityClass or portName, never throws', () => {
    expect(getComponentOwnedPortConstraint(null, 'hardpoint_class_2')).toBeNull()
    expect(getComponentOwnedPortConstraint(undefined, 'hardpoint_class_2')).toBeNull()
    expect(getComponentOwnedPortConstraint('Mount_Gimbal_S3', null)).toBeNull()
    expect(getComponentOwnedPortConstraint('Mount_Gimbal_S3', undefined)).toBeNull()
    expect(getComponentOwnedPortConstraint('', '')).toBeNull()
  })

  it('returns null for an entityClass this generator has no data for — never fabricated, never throws', () => {
    expect(getComponentOwnedPortConstraint('Completely_Uncataloged_Entity_XYZ', 'hardpoint_class_2')).toBeNull()
  })
})

// EWO-055 — real-data-dependent: skips (never fails) when the committed
// generated-data/component-owned-port-constraints.json wasn't produced
// with real Mount_Gimbal_S3 data on this machine, matching every other
// generated-data-dependent test in this repo (see componentOwnedSlots.test.ts's
// own hasRackData convention).
const GIMBAL_S3 = 'Mount_Gimbal_S3'
const GIMBAL_S3_PORT = 'hardpoint_class_2'
const hasGimbalData = getComponentOwnedPortConstraint(GIMBAL_S3, GIMBAL_S3_PORT) !== null

describe('getComponentOwnedPortConstraint — real DataCore data (EWO-055 proving spike)', () => {
  it("resolves Mount_Gimbal_S3's own single real port (hardpoint_class_2) to its real MinSize/MaxSize/Types", () => {
    if (!hasGimbalData) return
    const constraint = getComponentOwnedPortConstraint(GIMBAL_S3, GIMBAL_S3_PORT)!
    expect(constraint.minSize).toBe(3)
    expect(constraint.maxSize).toBe(3)
    expect(constraint.accepted.some((a) => a.type === 'WeaponGun' && a.subtypes.includes('Gun'))).toBe(true)
  })

  it('returns null for a real owner entityClass but a port name that does not exist on its record', () => {
    if (!hasGimbalData) return
    expect(getComponentOwnedPortConstraint(GIMBAL_S3, 'hardpoint_that_does_not_exist')).toBeNull()
  })
})

// EWO-056B — the two real, confirmed-by-direct-query entities from
// EWO-056's own investigation: the Command Module tractor beam
// (Flags: "uneditable") and the Eclipse missile rack (Flags: "editable").
// Both are already discovered by this generator (REMOTE_TURRET/
// MISSILE_RACK roles) — no new query/entity was needed for this coverage.
const TRACTOR_BEAM_TURRET = 'DRAK_Command_Module_Remote_Turret_Tractor_Beam'
const TRACTOR_BEAM_PORT = 'turret_weapon'
const ECLIPSE_RACK = 'MRCK_S09_AEGS_Eclipse'
const ECLIPSE_PORT = 'missile_01_attach'
const hasTractorBeamData = getComponentOwnedPortConstraint(TRACTOR_BEAM_TURRET, TRACTOR_BEAM_PORT) !== null
const hasEclipseData = getComponentOwnedPortConstraint(ECLIPSE_RACK, ECLIPSE_PORT) !== null

describe('getComponentOwnedPortConstraint — editable field, real DataCore data (EWO-056B)', () => {
  it('the Command Module tractor beam\'s real port resolves editable: false — the confirmed lock source behind its Locked presentation in SPPV/in-game', () => {
    if (!hasTractorBeamData) return
    const constraint = getComponentOwnedPortConstraint(TRACTOR_BEAM_TURRET, TRACTOR_BEAM_PORT)!
    expect(constraint.editable).toBe(false)
  })

  it('an ordinary missile rack port resolves editable: true', () => {
    if (!hasEclipseData) return
    const constraint = getComponentOwnedPortConstraint(ECLIPSE_RACK, ECLIPSE_PORT)!
    expect(constraint.editable).toBe(true)
  })

  it('editable is always exactly true, false, or null on every loaded record — the loader never silently drops or coerces the field', () => {
    if (!hasGimbalData) return
    const constraint = getComponentOwnedPortConstraint(GIMBAL_S3, GIMBAL_S3_PORT)!
    expect([true, false, null]).toContain(constraint.editable)
  })
})
