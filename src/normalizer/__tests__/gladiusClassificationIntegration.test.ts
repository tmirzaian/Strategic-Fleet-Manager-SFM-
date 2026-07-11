import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShipNormalizer } from '../shipNormalizer'
import { ComponentMetadataResolver } from '../componentMetadataResolver'
import { validateNormalizedPackage } from '../validation'
import type { RawShipExport } from '../rawTypes'

/**
 * Mission M-009 — end-to-end proof that the classification translation
 * layer makes the REAL raw-data/AEGS Gladius.json fixture (new StarBreaker
 * schema) produce classified, player-facing equipment ports, not the
 * zero-port result every prior mission (M-004 through M-008) documented.
 *
 * The injected catalog below is a self-contained, hardcoded excerpt of
 * the real DataCore records this repo's Mission M-006/M-007 investigation
 * verified against the live game (category/subtype/size/grade values are
 * copied from that verified data) — deliberately NOT read from
 * generated-data/component-metadata-catalog.json, so this test is
 * portable and passes identically on a machine with no local StarBreaker
 * install or generated catalog.
 */
const RAW_DATA_DIR = resolve(__dirname, '../../../raw-data')

function rec(entityClass: string, category: string, subtype: string, size: number | null = null, grade: number | null = null) {
  return {
    entityClass,
    recordName: `EntityClassDefinition.${entityClass}`,
    recordId: `guid-${entityClass}`,
    category,
    subtype,
    size,
    grade,
    manufacturerRef: null,
    localizationKey: null,
    displayName: null,
  }
}

const GLADIUS_CATALOG_EXCERPT = {
  records: {
    Mount_Gimbal_S3: rec('Mount_Gimbal_S3', 'Turret', 'GunTurret', 3, 1),
    GATS_BallisticGatling_S3: rec('GATS_BallisticGatling_S3', 'WeaponGun', 'Gun', 3, 1),
    GATS_BallisticGatling_Barrel_S3: rec('GATS_BallisticGatling_Barrel_S3', 'WeaponAttachment', 'Barrel', 1, 1),
    GATS_BallisticGatling_FiringMechanism_S3: rec('GATS_BallisticGatling_FiringMechanism_S3', 'WeaponAttachment', 'FiringMechanism', 1, 1),
    GATS_BallisticGatling_PowerArray_S3: rec('GATS_BallisticGatling_PowerArray_S3', 'WeaponAttachment', 'PowerArray', 1, 1),
    GATS_BallisticGatling_Ventilation_S3: rec('GATS_BallisticGatling_Ventilation_S3', 'WeaponAttachment', 'Ventilation', 1, 1),
    KLWE_LaserRepeater_S3: rec('KLWE_LaserRepeater_S3', 'WeaponGun', 'Gun', 3, 1),
    POWR_AEGS_S01_Regulus_SCItem: rec('POWR_AEGS_S01_Regulus_SCItem', 'PowerPlant', 'Power', 1, 3),
    COOL_AEGS_S01_Bracer_SCItem: rec('COOL_AEGS_S01_Bracer_SCItem', 'Cooler', 'UNDEFINED', 1, 3),
    SHLD_GODI_S01_AllStop_SCItem: rec('SHLD_GODI_S01_AllStop_SCItem', 'Shield', 'UNDEFINED', 1, 3),
    QDRV_WETK_S01_Beacon_SCItem: rec('QDRV_WETK_S01_Beacon_SCItem', 'QuantumDrive', 'UNDEFINED', 1, 3),
    JDRV_TARS_S01_Explorer_SCItem: rec('JDRV_TARS_S01_Explorer_SCItem', 'JumpDrive', 'UNDEFINED', 1, 1),
    MRCK_S03_BEHR_Single_S03: rec('MRCK_S03_BEHR_Single_S03', 'MissileLauncher', 'MissileRack', 3, 1),
    MRCK_S03_BEHR_Dual_S02: rec('MRCK_S03_BEHR_Dual_S02', 'MissileLauncher', 'MissileRack', 3, 1),
    MISL_S02_IR_FSKI_Ignite: rec('MISL_S02_IR_FSKI_Ignite', 'Missile', 'Missile', 2, 1),
    MISL_S03_CS_FSKI_Arrester: rec('MISL_S03_CS_FSKI_Arrester', 'Missile', 'Missile', 3, 1),
  },
}

function loadRealGladius(): RawShipExport {
  return JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'AEGS Gladius.json'), 'utf-8'))
}

describe('Real Gladius fixture — classification translation layer produces classified ports', () => {
  it('produces ports for weapons, power, coolers, shields, quantum drive, jump drive, and missiles', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => GLADIUS_CATALOG_EXCERPT })
    const normalizer = new ShipNormalizer(undefined, resolver)
    const pkg = normalizer.normalize(loadRealGladius(), 'raw-data/AEGS Gladius.json')

    expect(pkg.ports.length).toBeGreaterThan(0)

    const groupsPresent = new Set(pkg.ports.map((p) => p.equipmentGroup))
    expect(groupsPresent.has('Weapons')).toBe(true)
    expect(groupsPresent.has('Power')).toBe(true)
    expect(groupsPresent.has('Coolers')).toBe(true)
    expect(groupsPresent.has('Shields')).toBe(true)
    expect(groupsPresent.has('QuantumDrive')).toBe(true) // covers both QuantumDrive and JumpDrive ports
    expect(groupsPresent.has('Missiles')).toBe(true)
  })

  it('does not surface WeaponAttachment sub-parts (Barrel/FiringMechanism/PowerArray/Ventilation) as ports', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => GLADIUS_CATALOG_EXCERPT })
    const normalizer = new ShipNormalizer(undefined, resolver)
    const pkg = normalizer.normalize(loadRealGladius(), 'raw-data/AEGS Gladius.json')

    const attachmentInternalNames = new Set([
      'GATS_BallisticGatling_Barrel_S3',
      'GATS_BallisticGatling_FiringMechanism_S3',
      'GATS_BallisticGatling_PowerArray_S3',
      'GATS_BallisticGatling_Ventilation_S3',
    ])

    // A Port doesn't store its component's raw internalName directly, so
    // check via components: none of the excluded attachment entities
    // should be reachable through any port's item references.
    const leakedAttachmentComponents = pkg.components.filter((c) => attachmentInternalNames.has(c.internalName))
    // Components may still be discovered as catalog data, but none of
    // them should be reachable through a *port* — verified by confirming
    // no port's factoryItemId/installedItemId/targetItemId references one.
    const attachmentComponentIds = new Set(leakedAttachmentComponents.map((c) => c.id))
    const referencedByAnyPort = pkg.ports.some(
      (p) =>
        (p.factoryItemId && attachmentComponentIds.has(p.factoryItemId)) ||
        (p.installedItemId && attachmentComponentIds.has(p.installedItemId)) ||
        (p.targetItemId && attachmentComponentIds.has(p.targetItemId))
    )
    expect(referencedByAnyPort).toBe(false)
  })

  it('produces zero validation errors', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => GLADIUS_CATALOG_EXCERPT })
    const normalizer = new ShipNormalizer(undefined, resolver)
    const pkg = normalizer.normalize(loadRealGladius(), 'raw-data/AEGS Gladius.json')
    const result = validateNormalizedPackage(pkg)
    const errors = [...result.normalizationWarnings, ...result.compatibilityWarnings].filter((w) => w.severity === 'error')
    expect(errors).toEqual([])
  })

  it('classifies the nose/left-wing/right-wing gimbal mounts as WeaponTurret (Weapons group), not Turret (Defense)', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => GLADIUS_CATALOG_EXCERPT })
    const normalizer = new ShipNormalizer(undefined, resolver)
    const pkg = normalizer.normalize(loadRealGladius(), 'raw-data/AEGS Gladius.json')

    const mountPorts = pkg.ports.filter((p) => p.internalName === 'hardpoint_gun_nose' || p.internalName === 'hardpoint_gun_left_wing' || p.internalName === 'hardpoint_gun_right_wing')
    expect(mountPorts.length).toBeGreaterThan(0)
    for (const port of mountPorts) {
      expect(port.equipmentGroup).toBe('Weapons')
    }
    expect(pkg.ports.some((p) => p.equipmentGroup === 'Defense')).toBe(false)
  })

  it('repeated normalization of the real fixture is deterministic', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => GLADIUS_CATALOG_EXCERPT })
    const normalizer = new ShipNormalizer(undefined, resolver)
    const raw = loadRealGladius()
    const first = normalizer.normalize(raw, 'raw-data/AEGS Gladius.json')
    const second = normalizer.normalize(raw, 'raw-data/AEGS Gladius.json')
    expect(first.ports.map((p) => ({ ...p }))).toEqual(second.ports.map((p) => ({ ...p })))
    expect(first.components).toEqual(second.components)
  })
})
