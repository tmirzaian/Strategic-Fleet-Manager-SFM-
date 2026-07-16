import { describe, it, expect } from 'vitest'
import { validateTargetCompatibility, isComponentSelectableForPort } from '../componentCatalog'
import { runFullValidation } from '../../engine/validation'
import { ships, builds, hardpoints } from '../seed'
import { shipDefinitions } from '../shipDefinitions'
import { migrateSeedFleetToAssets } from '../fleetAssetMigration'
import { catalogComponentsByName } from '../../generated/componentCatalog'

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

describe('Mission M-012: component selectors use the authoritative full-universe catalog, not just the ~20-entry demo table', () => {
  it('13. recognizes a real component that only exists in the generated catalog (not the hand-authored demo table)', () => {
    if (catalogComponentsByName.size === 0) return // real generated-data/component-metadata-catalog.json not present on this machine
    const beacon = catalogComponentsByName.get('Beacon')
    expect(beacon).toBeDefined()
    expect(beacon!.category).toBe('Quantum Drive')
    // Correctly flags a real category mismatch for a catalog-only item, exactly like the hand-authored demo entries already do.
    expect(validateTargetCompatibility('Beacon', 'Shield', `S${beacon!.size}`).valid).toBe(false)
    expect(validateTargetCompatibility('Beacon', 'Quantum Drive', `S${beacon!.size}`).valid).toBe(true)
  })

  it('13. the widened catalog has well over a thousand player-usable components, not the ~20-entry demo scope', () => {
    if (catalogComponentsByName.size === 0) return
    expect(catalogComponentsByName.size).toBeGreaterThan(500)
  })
})

describe('EWO-024 (Task 2): isComponentSelectableForPort — Target picker suggestion filtering', () => {
  it('1. a component positively known to be a different size for this port type is not selectable (S1 Cooler in an S2 Cooler slot)', () => {
    expect(isComponentSelectableForPort('Snowblind', 'Cooler', 'S2')).toBe(false) // Snowblind is S1
    expect(isComponentSelectableForPort('Blizzard', 'Cooler', 'S2')).toBe(true) // Blizzard is S2
  })

  it('2. a component of the wrong category is not selectable even at the right size (a Shield is never a Missile Rack)', () => {
    expect(isComponentSelectableForPort('FR-86', 'Missile Rack', 'S3')).toBe(false)
    expect(isComponentSelectableForPort('FR-86', 'Shield', 'S3')).toBe(true)
  })

  it('3. an uncataloged (unknown) component is still selectable — never positively disproven, same philosophy validateTargetCompatibility already uses', () => {
    expect(isComponentSelectableForPort('Some Totally Unrecognized Item', 'Shield', 'S1')).toBe(true)
  })

  it('4. agrees with validateTargetCompatibility on every real demo fixture — the picker never suggests something save-time validation would reject, and never hides something it would accept', () => {
    const fixtures: Array<[string, string, string]> = [
      ['Mirage', 'Shield', 'S1'],
      ['Mirage', 'Shield', 'S3'],
      ['Mass Driver', 'Weapon', 'S4'],
      ['Mass Driver', 'Weapon', 'S2'],
      ['Atlas', 'Quantum Drive', 'S1'],
      ['Atlas', 'Quantum Drive', 'S2'],
    ]
    for (const [item, type, size] of fixtures) {
      expect(isComponentSelectableForPort(item, type, size)).toBe(validateTargetCompatibility(item, type, size).valid)
    }
  })
})
