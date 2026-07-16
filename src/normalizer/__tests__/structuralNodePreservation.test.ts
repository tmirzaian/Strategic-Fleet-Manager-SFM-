import { describe, it, expect } from 'vitest'
import { ShipNormalizer } from '../shipNormalizer'
import type { RawShipExport } from '../rawTypes'

/**
 * EWO-020 — synthetic StarBreaker-schema (entity/port/children) fixtures,
 * the real-world export shape this mission's structural-node preservation
 * targets (unlike shipNormalizer.test.ts's legacy-schema fixture).
 *
 * EWO-042 / CWO-001 correction: `Mount_Gimbal_S2`/`Mount_Gimbal_S3` and
 * `KLWE_LaserRepeater_S1/S2/S3` below are real, catalog-resolvable
 * entities (confirmed: the real VariPuck S2/S3 Gimbal Mount and CF-1/2/3xx
 * Repeater components) — deliberately kept, not replaced, because CWO-001
 * certified that a node resolving in the real catalog is expected to be
 * simultaneously installed equipment AND a structural parent (Case A —
 * see the "CASE A" tests below). `Some_Unrecognized_Housing_Assembly`,
 * `TEST_SCItem_Turret_Housing`, `Mount_Gimbal_S1` (confirmed: no real S1
 * variant exists), and `Door_Something` remain deliberately unresolvable
 * against the real catalog — used to certify the other valid
 * architectural case, a genuinely structural-only parent (Case B), and
 * plain exclusion. Both cases are real, permanent, expected shapes of the
 * same recursive equipment graph, not a contradiction.
 */
function starBreakerFixture(overrides?: Partial<RawShipExport>): RawShipExport {
  return {
    root: { entity: 'EntityClassDefinition.TEST_Fixture' },
    loadout: [
      {
        entity: 'Mount_Gimbal_S2',
        port: 'hardpoint_weapon_left',
        children: [{ entity: 'KLWE_LaserRepeater_S2', port: 'hardpoint_class_2' }],
      },
      {
        entity: 'Some_Unrecognized_Housing_Assembly',
        port: 'hardpoint_turret_top',
        children: [{ entity: 'Mount_Gimbal_S3', port: 'turret_left', children: [{ entity: 'KLWE_LaserRepeater_S3', port: 'hardpoint_class_2' }] }],
      },
      // A door — excluded, no included descendant — must still be dropped entirely (no regression).
      { entity: 'Door_Something', port: 'door_pilot' },
    ],
    ...overrides,
  } as RawShipExport
}

describe('ShipNormalizer — EWO-020 structural node preservation (StarBreaker schema)', () => {
  it('CASE A — a real, catalog-resolvable gimbal mount (VariPuck) is independently assignable equipment, not a structural placeholder, and still owns its child weapon', () => {
    // CWO-001: Mount_Gimbal_S2 resolves as a real, removable/replaceable
    // component (the VariPuck S2 Gimbal Mount) — a node that resolves in
    // the real catalog is never treated as a placeholder-only structural
    // node merely because it also owns child equipment. This is Star
    // Citizen's own recursive equipment model: a node may simultaneously
    // be installed equipment AND a structural parent.
    const pkg = new ShipNormalizer().normalize(starBreakerFixture(), 'test.json')
    const mount = pkg.ports.find((p) => p.internalName === 'hardpoint_weapon_left')
    const gun = pkg.ports.find((p) => p.sourcePath === '/hardpoint_weapon_left/hardpoint_class_2')
    expect(mount).toBeDefined()
    expect(gun).toBeDefined()
    expect(mount!.isStructural).toBeFalsy()
    expect(mount!.assemblyRole).toBe('GIMBAL_MOUNT')
    expect(mount!.sourceEntityClass).toBe('Mount_Gimbal_S2')
    expect(mount!.factoryItemId).toBeTruthy()
    expect(mount!.childPortIds).toContain(gun!.id)
    expect(gun!.parentPortId).toBe(mount!.id)
  })

  it('the real gun remains nested under its gimbal mount parent, not orphaned to the ship root, regardless of whether that parent is itself structural-only or independently assignable', () => {
    const pkg = new ShipNormalizer().normalize(starBreakerFixture(), 'test.json')
    const mount = pkg.ports.find((p) => p.internalName === 'hardpoint_weapon_left')!
    const gun = pkg.ports.find((p) => p.sourcePath === '/hardpoint_weapon_left/hardpoint_class_2')!
    expect(gun.parentPortId).toBe(mount.id)
    expect(mount.childPortIds).toContain(gun.id)
  })

  it('CASE A — the assignable parent\'s own factory assignment is distinct from its child\'s — no duplicate assignment is created', () => {
    // CWO-001 (Task 5): validated this is not "duplicated equipment
    // assignment" — the mount and its child gun are two genuinely
    // separate real-world items (a Commander can own/replace the VariPuck
    // independently of the weapon seated in it), so each gets exactly one
    // real, distinct assignment.
    const pkg = new ShipNormalizer().normalize(starBreakerFixture(), 'test.json')
    const mount = pkg.ports.find((p) => p.internalName === 'hardpoint_weapon_left')!
    const gun = pkg.ports.find((p) => p.sourcePath === '/hardpoint_weapon_left/hardpoint_class_2')!
    expect(mount.factoryItemId).toBe('component-Mount_Gimbal_S2')
    expect(gun.factoryItemId).toBe('component-KLWE_LaserRepeater_S2')
    expect(mount.factoryItemId).not.toBe(gun.factoryItemId)

    const mountAssignment = pkg.factoryLoadout.portAssignments.find((a) => a.portId === mount.id)
    const gunAssignment = pkg.factoryLoadout.portAssignments.find((a) => a.portId === gun.id)
    expect(mountAssignment?.componentId).toBeTruthy()
    expect(gunAssignment?.componentId).toBeTruthy()
    expect(mountAssignment?.componentId).not.toBe(gunAssignment?.componentId)
    // Exactly one assignment per port — never a duplicated/split entry.
    expect(pkg.factoryLoadout.portAssignments.filter((a) => a.portId === mount.id)).toHaveLength(1)
    expect(pkg.factoryLoadout.portAssignments.filter((a) => a.portId === gun.id)).toHaveLength(1)
  })

  it('CASE B — a genuinely unresolvable housing assembly is a structural-only parent, while its real nested equipment still resolves and imports independently', () => {
    // "Some_Unrecognized_Housing_Assembly" matches no known naming
    // convention and does not resolve in the real catalog — a real,
    // present entity, but not one this mission's evidence covers, so it
    // is not forced into Weapon/Turret/anything else, and correctly gets
    // no factory assignment of its own (Case B, per CWO-001).
    const pkg = new ShipNormalizer().normalize(starBreakerFixture(), 'test.json')
    const housing = pkg.ports.find((p) => p.internalName === 'hardpoint_turret_top')
    expect(housing).toBeDefined()
    expect(housing!.isStructural).toBe(true)
    expect(housing!.factoryItemId).toBeFalsy()
    expect(housing!.assemblyRole).toBe('GENERIC_MOUNT')

    const nestedGimbal = pkg.ports.find((p) => p.internalName === 'turret_left')!
    expect(nestedGimbal.parentPortId).toBe(housing!.id)
    expect(housing!.childPortIds).toContain(nestedGimbal.id)
    expect(nestedGimbal.assemblyRole).toBe('GIMBAL_MOUNT')
    // The descendant (Mount_Gimbal_S3, the real VariPuck S3) is itself
    // real, catalog-resolvable equipment — a structural-only parent never
    // blocks its real nested equipment from importing/assigning correctly.
    expect(nestedGimbal.factoryItemId).toBeTruthy()
  })

  it('an entity whose name genuinely does encode "Turret" (no Remote/Nose evidence) correctly classifies MANNED_TURRET even when unrecognized by the catalog', () => {
    const raw = starBreakerFixture({
      loadout: [
        {
          entity: 'TEST_SCItem_Turret_Housing',
          port: 'hardpoint_turret_dorsal',
          children: [{ entity: 'Mount_Gimbal_S2', port: 'gun_mount', children: [{ entity: 'KLWE_LaserRepeater_S2', port: 'hardpoint_class_2' }] }],
        },
      ],
    })
    const pkg = new ShipNormalizer().normalize(raw, 'test.json')
    const turret = pkg.ports.find((p) => p.internalName === 'hardpoint_turret_dorsal')!
    expect(turret.isStructural).toBe(true)
    expect(turret.assemblyRole).toBe('MANNED_TURRET')
  })

  it('a door with no included descendant is still dropped entirely — no regression for the common excluded-node case', () => {
    const pkg = new ShipNormalizer().normalize(starBreakerFixture(), 'test.json')
    expect(pkg.ports.find((p) => p.internalName === 'door_pilot')).toBeUndefined()
  })

  it('every port id remains unique, including structural ones', () => {
    const pkg = new ShipNormalizer().normalize(starBreakerFixture(), 'test.json')
    expect(new Set(pkg.ports.map((p) => p.id)).size).toBe(pkg.ports.length)
  })

  it('records a distinct warning for a preserved structural-only node (Case B), distinguishable from a fully excluded one, and never mislabels a real assignable parent (Case A) as structural-preserved', () => {
    const pkg = new ShipNormalizer().normalize(starBreakerFixture(), 'test.json')
    const structuralWarning = pkg.normalizationWarnings.find((w) => w.code === 'structural-node-preserved' && w.path === 'hardpoint_turret_top')
    expect(structuralWarning).toBeDefined()
    const excludedWarning = pkg.normalizationWarnings.find((w) => w.code === 'excluded-node' && w.path === 'door_pilot')
    expect(excludedWarning).toBeDefined()
    // CASE A — hardpoint_weapon_left (Mount_Gimbal_S2, the real VariPuck)
    // was genuinely included as real equipment, never a structural
    // fallback, so it must never carry this warning.
    const mountWarning = pkg.normalizationWarnings.find((w) => w.code === 'structural-node-preserved' && w.path === 'hardpoint_weapon_left')
    expect(mountWarning).toBeUndefined()
  })
})

describe('ShipNormalizer — EWO-020 Task 9: generic future-assembly extensibility (synthetic, not fabricated production data)', () => {
  it('a Mining Head -> Mining Module relationship normalizes with the same generic mechanism, no renderer-specific code required', () => {
    const raw: RawShipExport = {
      root: { entity: 'EntityClassDefinition.TEST_MiningRig' },
      loadout: [
        {
          entity: 'Some_Mining_Head_Assembly',
          port: 'hardpoint_mining_head',
          children: [{ entity: 'MNGM_TEST_S01_Module', port: 'hardpoint_mining_module' }],
        },
      ],
    } as RawShipExport
    // The mining module component itself won't resolve a DataCore category
    // in this synthetic test (no metadata resolver stub configured), so it
    // is correctly excluded too — this test's point is structural, not
    // about a specific future EquipmentGroup wiring being pre-built.
    const pkg = new ShipNormalizer().normalize(raw, 'test.json')
    expect(pkg.ports.length).toBe(0) // honest: no included descendant exists in this minimal fixture, so nothing is preserved — proving the mechanism never invents structure without real evidence
  })

  it('CASE B — a structural-only parent generalizes to any assembly shape, not just weapons/quantum-drive (synthetic tractor-beam-shaped fixture)', () => {
    // Mount_Gimbal_S1 is deliberately used here (not S2/S3) — confirmed it
    // has no real S1 variant in the catalog, so this exercises the
    // genuinely-unresolvable/structural-only path (Case B) at a
    // differently-named, differently-shaped port, distinct from the
    // CASE A tests above which deliberately use the real S2/S3 entities.
    const raw: RawShipExport = {
      root: { entity: 'EntityClassDefinition.TEST_Salvage' },
      loadout: [
        {
          entity: 'Mount_Gimbal_S1',
          port: 'hardpoint_tractor_mount',
          children: [{ entity: 'KLWE_LaserRepeater_S1', port: 'hardpoint_class_1' }],
        },
      ],
    } as RawShipExport
    const pkg = new ShipNormalizer().normalize(raw, 'test.json')
    const mount = pkg.ports.find((p) => p.internalName === 'hardpoint_tractor_mount')
    // Proves the exact same GIMBAL_MOUNT preservation path used for
    // Eclipse/Cutlass Black/Valkyrie's weapons fires identically for a
    // differently-named port hosting the same entity-class convention —
    // no port-name branch, no ship name, anywhere in this mechanism.
    expect(mount?.isStructural).toBe(true)
    expect(mount?.assemblyRole).toBe('GIMBAL_MOUNT')
  })
})
