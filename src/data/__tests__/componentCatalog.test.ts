import { describe, it, expect } from 'vitest'
import { validateTargetCompatibility } from '../componentCatalog'
import { runFullValidation } from '../../engine/validation'
import { ships, builds, hardpoints } from '../seed'
import { shipDefinitions } from '../shipDefinitions'
import { migrateSeedFleetToAssets } from '../fleetAssetMigration'

describe('Data validation fixes (Alpha 2.4, Part 10)', () => {
  it('FR-86 is correctly categorized as an S3 Shield, not a Missile Rack', () => {
    const asShield = validateTargetCompatibility('FR-86', 'Shield', 'S3')
    expect(asShield.valid).toBe(true)

    const asMissileRack = validateTargetCompatibility('FR-86', 'Missile Rack', 'S3')
    expect(asMissileRack.valid).toBe(false)
  })

  it('the real seed dataset has no INCOMPATIBLE_TARGET errors beyond the one intentional M80 demo defect', () => {
    const summary = runFullValidation({ ships, builds, hardpoints, fleetAssets: migrateSeedFleetToAssets(), shipDefinitions })
    const incompatibleTargetErrors = summary.issues.filter((i) => i.code === 'INCOMPATIBLE_TARGET')
    expect(incompatibleTargetErrors).toHaveLength(1)
    expect(incompatibleTargetErrors[0].entityId).toContain('m80')
  })

  it('Cutlass Black no longer targets FR-86 (a Shield) in its Missile Rack slot', () => {
    const row = hardpoints.find((h) => h.buildId === 'cutlass-black-utility' && h.type === 'Missile Rack')!
    expect(row.targetItem).not.toBe('FR-86')
    expect(row.status).toBe('OK')
  })
})

describe('Generalized compatibility rule (Alpha 2.5A, Part 7 — not hardcoded to FR-86)', () => {
  it('27/28: no Shield-category item can satisfy a Missile Rack port, and this holds for any shield, not just FR-86', () => {
    for (const shieldItem of ['FR-86', 'Mirage', 'FR-66', 'Debilitator', 'Shield Array']) {
      const result = validateTargetCompatibility(shieldItem, 'Missile Rack', 'S3')
      expect(result.valid).toBe(false)
    }
  })

  it('the same items are valid against their real category (Shield ports)', () => {
    expect(validateTargetCompatibility('FR-86', 'Shield', 'S3').valid).toBe(true)
    expect(validateTargetCompatibility('Mirage', 'Shield', 'S1').valid).toBe(true)
  })
})
