import { describe, it, expect } from 'vitest'
import { validateTargetCompatibility, isComponentSelectableForPort, deriveDestinationCapability } from '../componentCatalog'
import { resolveComponentByEntityClass, resolveComponentByName } from '../../generated/componentCatalog'
import { resolveComponentIdentity } from '../../engine/installation/componentIdentityService'
import { executeInstallation } from '../../engine/installation/installationEngine'
import { shipDefinitions, shipFactoryTemplates } from '../shipDefinitions'
import type { Hardpoint, Ship, Build } from '../../types'

/**
 * EWO-STAB-004A (ADR-010, CAT-003) — the eighteen required regression
 * scenarios for canonical PDC compatibility and ambiguous identity
 * resolution.
 *
 * Real catalog fixtures throughout: `Turret_PDC_BEHR_A`/`Turret_PDC_VNCL`
 * (category Turret, subtype PDCTurret, size 2) and
 * `BEHR_LaserRepeater_PDC_S1` (category WeaponGun, subtype Gun, size 1) —
 * all three genuinely share the display name `M2C "Swarm"` in the real
 * bulk catalog (confirmed by CAT-003's own direct audit), and
 * `KLWE_LaserRepeater_S2` ("CF-227 Badger Repeater") is a real, ordinary
 * S2 weapon. Every test that needs real ship data (the Polaris, the
 * Cutter) guards on the generated catalog/ship data being present on this
 * machine, matching the existing convention throughout
 * src/data/__tests__/shipDefinitions.test.ts — skipping (not failing)
 * when the licensed, gitignored source isn't available.
 */

const PDC_BEHR = 'Turret_PDC_BEHR_A'
const PDC_VNCL = 'Turret_PDC_VNCL'
const PDC_GUN = 'BEHR_LaserRepeater_PDC_S1'
const ORDINARY_S2_GUN = 'KLWE_LaserRepeater_S2'
const SWARM_NAME = 'M2C "Swarm"'

const hasCatalog = resolveComponentByEntityClass(PDC_BEHR).status === 'resolved'

function skipIfNoCatalog() {
  return !hasCatalog
}

describe('EWO-STAB-004A: canonical PDC discriminator resolution', () => {
  it('1. Turret_PDC_BEHR_A resolves as category Turret, subtype PDCTurret, size 2', () => {
    if (skipIfNoCatalog()) return
    const resolution = resolveComponentByEntityClass(PDC_BEHR)
    expect(resolution.status).toBe('resolved')
    if (resolution.status !== 'resolved') return
    expect(resolution.record.category).toBe('Turret')
    expect(resolution.record.subtype).toBe('PDCTurret')
    expect(resolution.record.size).toBe(2)
  })

  it('2. Turret_PDC_VNCL resolves as PDCTurret', () => {
    if (skipIfNoCatalog()) return
    const resolution = resolveComponentByEntityClass(PDC_VNCL)
    expect(resolution.status).toBe('resolved')
    if (resolution.status !== 'resolved') return
    expect(resolution.record.category).toBe('Turret')
    expect(resolution.record.subtype).toBe('PDCTurret')
  })

  it('3. BEHR_LaserRepeater_PDC_S1 resolves independently as WeaponGun/Gun/S1', () => {
    if (skipIfNoCatalog()) return
    const resolution = resolveComponentByEntityClass(PDC_GUN)
    expect(resolution.status).toBe('resolved')
    if (resolution.status !== 'resolved') return
    expect(resolution.record.category).toBe('WeaponGun')
    expect(resolution.record.subtype).toBe('Gun')
    expect(resolution.record.size).toBe(1)
  })

  it('4. the three M2C "Swarm" records remain three distinct canonical identities', () => {
    if (skipIfNoCatalog()) return
    const resolution = resolveComponentByName(SWARM_NAME)
    expect(resolution.status).toBe('ambiguous')
    if (resolution.status !== 'ambiguous') return
    const entityClasses = new Set(resolution.candidates.map((c) => c.entityClass))
    expect(entityClasses).toEqual(new Set([PDC_BEHR, PDC_VNCL, PDC_GUN]))
  })

  it('5. name-only resolution of M2C "Swarm" returns ambiguous rather than selecting the first entry', () => {
    if (skipIfNoCatalog()) return
    // No entityClass supplied — falls through to bare name resolution.
    const result = validateTargetCompatibility(SWARM_NAME, 'Weapon', 'S1')
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('ambiguous')
    // Also confirmed at the identity-resolution layer the installation
    // engine itself uses.
    const identity = resolveComponentIdentity({ displayName: SWARM_NAME })
    expect(identity?.ambiguous).toBe(true)
    expect(identity?.entityClass).toBeNull()
  })

  it('6. entityClass resolution selects the exact requested Swarm entity', () => {
    if (skipIfNoCatalog()) return
    const identity = resolveComponentIdentity({ entityClass: PDC_VNCL })
    expect(identity?.entityClass).toBe(PDC_VNCL)
    expect(identity?.ambiguous).toBeUndefined()
    const result = validateTargetCompatibility(SWARM_NAME, 'Turret', 'S2', { itemEntityClass: PDC_VNCL, destinationFactoryEntityClass: PDC_VNCL })
    expect(result.valid).toBe(true)
  })
})

describe('EWO-STAB-004A: PDC compatibility rules (A-E)', () => {
  it('7. Turret_PDC_BEHR_A is compatible with a real Polaris PDC hardpoint', () => {
    if (skipIfNoCatalog()) return
    const polaris = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Polaris')
    if (!polaris) return
    const template = shipFactoryTemplates[polaris.id]
    const pdcRow = template.find((t) => t.factoryEntityClass === PDC_BEHR)
    expect(pdcRow).toBeDefined()
    if (!pdcRow) return
    const result = validateTargetCompatibility(pdcRow.factoryItem, pdcRow.type, pdcRow.size, {
      itemEntityClass: pdcRow.factoryEntityClass,
      destinationFactoryEntityClass: pdcRow.factoryEntityClass,
    })
    expect(result.valid, result.message).toBe(true)
  })

  it("8. Turret_PDC_BEHR_A is incompatible with an ordinary Cutter S2 gimbal/weapon port", () => {
    if (skipIfNoCatalog()) return
    const cutter = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Cutter')
    if (!cutter) return
    const template = shipFactoryTemplates[cutter.id]
    const weaponRow = template.find((t) => t.factoryEntityClass === ORDINARY_S2_GUN || (t.type === 'Weapon' && t.size === 'S2'))
    if (!weaponRow) return
    // Try to target the real PDC turret assembly at this ordinary weapon port.
    const result = validateTargetCompatibility(SWARM_NAME, weaponRow.type, weaponRow.size, {
      itemEntityClass: PDC_BEHR,
      destinationFactoryEntityClass: weaponRow.factoryEntityClass,
    })
    expect(result.valid).toBe(false)
  })

  it('9. an ordinary S2 Badger remains compatible with its ordinary Cutter weapon destination', () => {
    if (skipIfNoCatalog()) return
    const cutter = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Cutter')
    if (!cutter) return
    const template = shipFactoryTemplates[cutter.id]
    const weaponRow = template.find((t) => t.factoryEntityClass === ORDINARY_S2_GUN)
    if (!weaponRow) return
    const result = validateTargetCompatibility(weaponRow.factoryItem, weaponRow.type, weaponRow.size, {
      itemEntityClass: weaponRow.factoryEntityClass,
      destinationFactoryEntityClass: weaponRow.factoryEntityClass,
    })
    expect(result.valid, result.message).toBe(true)
  })

  it('10. an ordinary gun is incompatible with a monolithic Polaris PDC parent port', () => {
    if (skipIfNoCatalog()) return
    const result = validateTargetCompatibility(SWARM_NAME, 'Turret', 'S2', {
      itemEntityClass: ORDINARY_S2_GUN,
      destinationFactoryEntityClass: PDC_BEHR,
    })
    expect(result.valid).toBe(false)
  })

  it("11. Idris-style internal PDC gun identity is not confused with the parent PDC turret sharing its display name", () => {
    if (skipIfNoCatalog()) return
    // The internal gun (S1, WeaponGun) validates against its own ordinary
    // S1 weapon destination — never treated as the S2 Turret assembly it
    // shares a display name with.
    const gunResult = validateTargetCompatibility(SWARM_NAME, 'Weapon', 'S1', {
      itemEntityClass: PDC_GUN,
      destinationFactoryEntityClass: PDC_GUN,
    })
    expect(gunResult.valid, gunResult.message).toBe(true)
    // The same gun does NOT satisfy the parent S2 PDC_TURRET destination.
    const wrongSlot = validateTargetCompatibility(SWARM_NAME, 'Turret', 'S2', {
      itemEntityClass: PDC_GUN,
      destinationFactoryEntityClass: PDC_BEHR,
    })
    expect(wrongSlot.valid).toBe(false)
  })

  it('12. all seven Polaris factory PDC positions validate successfully', () => {
    if (skipIfNoCatalog()) return
    const polaris = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Polaris')
    if (!polaris) return
    const template = shipFactoryTemplates[polaris.id]
    const pdcRows = template.filter((t) => t.factoryEntityClass === PDC_BEHR || t.factoryEntityClass === PDC_VNCL)
    expect(pdcRows.length).toBeGreaterThanOrEqual(7)
    for (const row of pdcRows) {
      const result = validateTargetCompatibility(row.factoryItem, row.type, row.size, {
        itemEntityClass: row.factoryEntityClass,
        destinationFactoryEntityClass: row.factoryEntityClass,
      })
      expect(result.valid, `${row.slotLabel}: ${result.message ?? ''}`).toBe(true)
    }
  })
})

describe('EWO-STAB-004A: ambiguous identity causes no mutation', () => {
  it('13. an ambiguous component name performs no ship mutation, inventory decrement, or reservation fulfillment', () => {
    if (skipIfNoCatalog()) return
    const ship: Ship = {
      id: 'test-ship',
      name: 'Test Ship',
      manufacturer: 'M',
      ownership: 'Owned',
      career: 'Combat',
      role: 'Role',
      activeBuildId: 'test-build',
      readiness: 0,
      priority: 1,
      missing: [],
    }
    const build: Build = { id: 'test-build', shipId: 'test-ship', name: 'Test Build', role: 'Role', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM' }
    const hardpoint: Hardpoint = {
      id: 'hp-1',
      shipId: 'test-ship',
      buildId: 'test-build',
      slotLabel: 'Slot',
      type: 'Turret',
      size: 'S2',
      factoryItem: '—',
      installedItem: '—',
      targetItem: '—',
      status: 'Missing',
    }
    let mutated = false
    const result = executeInstallation(
      { operation: 'INSTALL', component: { displayName: SWARM_NAME }, destination: { shipId: 'test-ship', slotLabel: 'Slot' } },
      { ships: [ship], builds: [build], hardpoints: [hardpoint], hangarItems: [], reservations: [], installedLoadouts: [] },
      {
        applyShipMutation: () => {
          mutated = true
        },
        commitHangarItems: () => {
          mutated = true
        },
        commitReservations: () => {
          mutated = true
        },
        returnToInventory: () => {
          mutated = true
        },
      }
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('identity-ambiguous')
    expect(mutated).toBe(false)
  })
})

describe('EWO-STAB-004A: legacy and uncataloged behavior preserved', () => {
  it('14. a legacy unambiguous name-only component retains existing behavior', () => {
    expect(validateTargetCompatibility('Mirage', 'Shield', 'S1').valid).toBe(true)
    expect(validateTargetCompatibility('Mirage', 'Shield', 'S3').valid).toBe(false)
  })

  it('15. a genuinely uncataloged component retains the existing EWO-024 permissive policy', () => {
    expect(validateTargetCompatibility('Some Totally Unrecognized Item', 'Shield', 'S1').valid).toBe(true)
    expect(isComponentSelectableForPort('Some Totally Unrecognized Item', 'Shield', 'S1')).toBe(true)
  })
})

describe('EWO-STAB-004A: selection-list safety', () => {
  it('16. selection lists exclude a PDC turret from an ordinary S2 weapon port', () => {
    if (skipIfNoCatalog()) return
    expect(isComponentSelectableForPort(SWARM_NAME, 'Weapon', 'S2', { itemEntityClass: PDC_BEHR, destinationFactoryEntityClass: undefined })).toBe(false)
  })

  it('17. selection lists include a compatible PDC turret for a native PDC port', () => {
    if (skipIfNoCatalog()) return
    expect(isComponentSelectableForPort(SWARM_NAME, 'Turret', 'S2', { itemEntityClass: PDC_BEHR, destinationFactoryEntityClass: PDC_BEHR })).toBe(true)
  })

  it('18. factory validation still reports unrelated, genuine incompatibilities (the M80 Atlas demo defect)', () => {
    expect(validateTargetCompatibility('Atlas', 'Missile Rack', 'S1').valid).toBe(false)
    expect(deriveDestinationCapability(undefined)).toBeNull()
  })
})
