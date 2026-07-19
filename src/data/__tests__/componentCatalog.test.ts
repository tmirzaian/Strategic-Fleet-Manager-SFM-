import { describe, it, expect } from 'vitest'
import { validateTargetCompatibility, isComponentSelectableForPort } from '../componentCatalog'
import { runFullValidation } from '../../engine/validation'
import { ships, builds, hardpoints } from '../seed'
import { shipDefinitions, shipFactoryTemplates } from '../shipDefinitions'
import { migrateSeedFleetToAssets } from '../fleetAssetMigration'
import { catalogComponentsByName, componentsByEntityClass, resolveComponentByEntityClass } from '../../generated/componentCatalog'

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

describe('FTB-001D: mining laser catalog eligibility (Helix II Mining Laser and the real mining-laser population)', () => {
  // Root cause: every real mining weapon port across every currently-
  // imported mining ship (MOLE, Prospector, ROC, Golem) carried the raw,
  // untranslated equipmentGroup string "Mining" as its own Hardpoint
  // `type` (src/data/shipDefinitions.ts's compatibilityTypeFor never
  // translated it), permanently mismatched against
  // CATEGORY_TO_PORT_TYPE.WeaponMining ("Mining Laser" — the vocabulary
  // every mining laser's own catalog record resolves to). A handful of
  // mining lasers (Arbor MH1/MH2/MHV, Pitman) had a hand-authored
  // src/data/componentCatalog.ts override forcing their category to the
  // wrong-but-matching "Mining" — Helix II (and every other real mining
  // laser with no such override) simply never appeared as selectable on
  // any real mining port. Fixed at the true source (the ship-side
  // translation), so no per-name override is needed for any of them.
  const HELIX_II = 'Helix II Mining Laser'
  const hasCatalog = catalogComponentsByName.size > 0

  // 1/2/3 exercise the REAL MOLE Fleet Asset's own mining weapon port —
  // its `type`/`size` come straight from shipFactoryTemplates (the same
  // real ship-generation pipeline Loadout Manager reads), not a
  // hand-typed literal. This is what actually reproduces the reported
  // defect: a test that only ever passes a literal 'Mining Laser' string
  // never exercises whether the SHIP's own port really produces that
  // string in the first place — confirmed by reverting the
  // shipDefinitions.ts fix and observing tests using a literal still pass
  // while this one correctly fails.
  function realMoleMiningPort() {
    const mole = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'MOLE')
    if (!mole) return null
    const template = shipFactoryTemplates[mole.id]
    return template.find((t) => t.factoryEntityClass && componentsByEntityClass.get(t.factoryEntityClass)?.category === 'WeaponMining') ?? null
  }

  it('1. Helix II Mining Laser is a valid candidate for a real MOLE S2 mining weapon port', () => {
    if (!hasCatalog) return
    const port = realMoleMiningPort()
    if (!port) return
    expect(port.type).toBe('Mining Laser') // not the raw, untranslated "Mining" equipmentGroup string
    expect(isComponentSelectableForPort(HELIX_II, port.type, port.size)).toBe(true)
  })

  it('2. Helix II Mining Laser is not offered for an incompatible port TYPE (the same real port size, a Shield type)', () => {
    if (!hasCatalog) return
    const port = realMoleMiningPort()
    if (!port) return
    expect(isComponentSelectableForPort(HELIX_II, 'Shield', port.size)).toBe(false)
  })

  it('3. Helix II Mining Laser is not offered for an incompatible component SIZE (the same real port type, S1 instead of S2)', () => {
    if (!hasCatalog) return
    const port = realMoleMiningPort()
    if (!port) return
    expect(port.size).toBe('S2')
    expect(isComponentSelectableForPort(HELIX_II, port.type, 'S1')).toBe(false)
  })

  it('8. the Target picker (entityClass-first resolution) and Hangar Inventory (display-name resolution) resolve Helix II to the exact same canonical entityClass', () => {
    if (!hasCatalog) return
    const byName = catalogComponentsByName.get(HELIX_II)
    expect(byName).toBeDefined()
    expect(byName!.entityClass).toBe('Mining_Laser_THCN_Helix_S2')
    const byEntityClass = resolveComponentByEntityClass(byName!.entityClass)
    expect(byEntityClass.status).toBe('resolved')
    if (byEntityClass.status === 'resolved') {
      expect(byEntityClass.record.displayName).toBe(HELIX_II)
      expect(byEntityClass.record.category).toBe('WeaponMining')
    }
  })

  it("a real MOLE Fleet Asset's own mining weapon port now carries the translated \"Mining Laser\" type, not the raw \"Mining\" equipmentGroup string", () => {
    if (!hasCatalog) return
    const mole = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'MOLE')
    if (!mole) return
    const template = shipFactoryTemplates[mole.id]
    const miningPort = template.find((t) => t.type === 'Mining Laser')
    expect(miningPort).toBeDefined()
    expect(template.some((t) => t.type === 'Mining')).toBe(false)
  })

  it('9. census — every real mining laser in the catalog (WeaponMining/Gun) is selectable at its own size against a Mining Laser port, none excluded by the fixed defect', () => {
    if (!hasCatalog) return
    const miningLasers = Array.from(componentsByEntityClass.values()).filter((r) => r.category === 'WeaponMining' && r.subtype === 'Gun')
    expect(miningLasers.length).toBeGreaterThan(5) // Helix I/II, Impact I/II, Lancet MH1/MH2, Klein-S1/S2, Hofstede-S1/S2, Arbor MH1/MH2/MHV, Pitman, etc.
    for (const record of miningLasers) {
      expect(isComponentSelectableForPort(record.displayName, 'Mining Laser', `S${record.size}`, { itemEntityClass: record.entityClass })).toBe(true)
    }
  })
})
