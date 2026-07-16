import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShipNormalizer } from '../shipNormalizer'
import { validateNormalizedPackage } from '../validation'
import { goldenFixtures, compareToGoldenFixture } from '../goldenFixture'
import type { NormalizedShipPackage } from '../../engine/types'

const RAW_DATA_DIR = resolve(__dirname, '../../../raw-data')

function loadGladius(): NormalizedShipPackage {
  const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'AEGS Gladius.json'), 'utf-8'))
  return new ShipNormalizer().normalize(raw, 'raw-data/AEGS Gladius.json')
}

function componentNameFor(pkg: NormalizedShipPackage, componentId: string | null) {
  return componentId ? pkg.components.find((c) => c.id === componentId)?.displayName : undefined
}

describe('Gladius golden fixture — authoritative resolution (reconciled, Mission M-010)', () => {
  it('1. has exactly three weapon positions: nose, left wing, right wing', () => {
    const pkg = loadGladius()
    const weapons = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Weapons')
    const names = weapons.map((w) => w.displayName).sort()
    expect(names).toEqual(['Left Wing Weapon', 'Nose Weapon', 'Right Wing Weapon'])
  })

  it('2. all three weapon ports resolve to size 3', () => {
    const pkg = loadGladius()
    const weapons = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Weapons')
    for (const w of weapons) {
      expect(w.minSize).toBe(3)
      expect(w.maxSize).toBe(3)
    }
  })

  it('3. the nose gun is ballistic and both wing guns are laser — not a uniform loadout', () => {
    const pkg = loadGladius()
    const nose = pkg.equipmentAssignments.find((a) => a.displayName === 'Nose Weapon')!
    const leftWing = pkg.equipmentAssignments.find((a) => a.displayName === 'Left Wing Weapon')!
    const rightWing = pkg.equipmentAssignments.find((a) => a.displayName === 'Right Wing Weapon')!
    expect(componentNameFor(pkg, nose.resolvedItemId)).toBe('Mantis GT-220 Gatling')
    expect(componentNameFor(pkg, leftWing.resolvedItemId)).toBe('CF-337 Panther Repeater')
    expect(componentNameFor(pkg, rightWing.resolvedItemId)).toBe('CF-337 Panther Repeater')
    // Each weapon mount's own mount hardware is reported separately, not
    // as the resolved equipment — see equipmentRelationship.ts.
    expect(componentNameFor(pkg, nose.mountItemId)).toBe('VariPuck S3 Gimbal Mount')
  })

  it('4. Power Plant resolves to the real catalog-derived Regulus power plant', () => {
    const pkg = loadGladius()
    const powerPlant = pkg.equipmentAssignments.find((a) => a.displayName === 'Power Plant')!
    expect(powerPlant.minSize).toBe(1)
    expect(powerPlant.maxSize).toBe(1)
    expect(componentNameFor(pkg, powerPlant.resolvedItemId)).toBe('Regulus')
  })

  it('5. both coolers resolve to the real catalog-derived Bracer cooler', () => {
    const pkg = loadGladius()
    const coolers = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Coolers')
    expect(coolers).toHaveLength(2)
    for (const c of coolers) {
      expect(c.minSize).toBe(1)
      expect(c.maxSize).toBe(1)
      expect(componentNameFor(pkg, c.resolvedItemId)).toBe('Bracer')
    }
  })

  it('6. both shields resolve to the real catalog-derived AllStop shield', () => {
    const pkg = loadGladius()
    const shields = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Shields')
    expect(shields).toHaveLength(2)
    for (const s of shields) {
      expect(s.minSize).toBe(1)
      expect(s.maxSize).toBe(1)
      expect(componentNameFor(pkg, s.resolvedItemId)).toBe('AllStop')
    }
  })

  it('7. Quantum Drive resolves to the quantum drive itself (Beacon), not the nested Jump Drive (Mission M-010 fix)', () => {
    const pkg = loadGladius()
    const qd = pkg.equipmentAssignments.find((a) => a.displayName === 'Quantum Drive')!
    expect(qd.minSize).toBe(1)
    expect(qd.maxSize).toBe(1)
    expect(componentNameFor(pkg, qd.resolvedItemId)).toBe('Beacon')
    expect(qd.mountItemId).toBeNull() // QuantumDrive is independent equipment, not a mount/container
  })

  it('7b. Jump Drive is independently represented as its own equipment row, not collapsed away', () => {
    const pkg = loadGladius()
    const jumpDrives = pkg.equipmentAssignments.filter((a) => a.displayName === 'Jump Drive')
    expect(jumpDrives).toHaveLength(1)
    const jd = jumpDrives[0]!
    expect(jd.equipmentGroup).toBe('QuantumDrive')
    expect(componentNameFor(pkg, jd.resolvedItemId)).toBe('Explorer')
    expect(jd.mountItemId).toBeNull()
  })

  it('8. four missile rack positions exist: left inner, right inner, left outer, right outer', () => {
    const pkg = loadGladius()
    const racks = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Missiles')
    const names = racks.map((r) => r.displayName).sort()
    expect(names).toEqual(['Left Inner Wing Missile Rack', 'Left Outer Wing Missile Rack', 'Right Inner Wing Missile Rack', 'Right Outer Wing Missile Rack'])
  })

  it('9. missile racks collapse to one mount + one type decision; the real fixture has no mixed-type rack', () => {
    const pkg = loadGladius()
    const racks = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Missiles')
    expect(racks).toHaveLength(4)

    const innerRacks = racks.filter((r) => r.displayName.includes('Inner'))
    const outerRacks = racks.filter((r) => r.displayName.includes('Outer'))
    // Inner racks are single-slot racks; outer racks are dual-slot — real,
    // verified structural facts from the raw export, not invented.
    for (const r of innerRacks) {
      expect(r.leafCount).toBe(1)
      expect(componentNameFor(pkg, r.mountItemId)).toBe('MSD-313 Missile Rack')
    }
    for (const r of outerRacks) {
      expect(r.leafCount).toBe(2)
      expect(componentNameFor(pkg, r.mountItemId)).toBe('MSD-322 Missile Rack')
    }
    // None of the real racks in this fixture are mixed-type — the old
    // Sprint 1.3F fixture invented a mixed-loadout scenario that doesn't
    // reflect the authoritative DataCore-derived Gladius loadout.
    for (const r of racks) {
      expect(r.mixedChildItems).toBe(false)
      expect(r.resolvedItemId).not.toBeNull()
    }
  })

  it('10. re-running the importer is deterministic and idempotent', () => {
    const pkg1 = loadGladius()
    const pkg2 = loadGladius()
    expect(pkg1.ship.id).toBe(pkg2.ship.id)
    expect(pkg1.equipmentAssignments.map((a) => `${a.portId}:${a.resolvedItemId}`).sort()).toEqual(
      pkg2.equipmentAssignments.map((a) => `${a.portId}:${a.resolvedItemId}`).sort()
    )
    expect(pkg1.ports.length).toBe(pkg2.ports.length)
    expect(pkg1.components.length).toBe(pkg2.components.length)
  })

  it('11. no user-facing row displays Bulldog Repeater or CoolCore I (not present in this authoritative source)', () => {
    const pkg = loadGladius()
    const allNames = pkg.components.map((c) => c.displayName)
    expect(allNames).not.toContain('Bulldog Repeater')
    expect(allNames).not.toContain('CoolCore I')
  })

  it('12. size is never derived from a helper-name convention, even now that "hardpoint_class_2" legitimately appears as a real raw port name', () => {
    const pkg = loadGladius()
    const classNamedPorts = pkg.ports.filter((p) => /_class_\d/.test(p.internalName))
    // The real StarBreaker export does use "hardpoint_class_2" as a
    // literal child-port name (the weapon slot inside every gimbal
    // mount) — no longer just a hand-authored-fixture artifact. What
    // must still hold: its size (3) comes from authoritative catalog
    // data, never parsed out of the "_class_2" string (which would
    // wrongly suggest size 2).
    expect(classNamedPorts.length).toBeGreaterThan(0)
    for (const port of classNamedPorts) {
      expect(port.minSize).toBe(3)
      expect(port.maxSize).toBe(3)
    }
  })

  it('passes the full golden fixture comparison (14/14)', () => {
    const pkg = loadGladius()
    const results = compareToGoldenFixture(pkg, goldenFixtures.Gladius)
    const failures = results.filter((r) => !r.pass)
    expect(failures).toEqual([])
    expect(results).toHaveLength(14)
  })

  it('produces zero validation errors', () => {
    const pkg = loadGladius()
    const result = validateNormalizedPackage(pkg)
    const errors = [...result.normalizationWarnings, ...result.compatibilityWarnings].filter((w) => w.severity === 'error')
    expect(errors).toEqual([])
  })

  it('every port id and every factory assignment port id is unique', () => {
    const pkg = loadGladius()
    expect(new Set(pkg.ports.map((p) => p.id)).size).toBe(pkg.ports.length)
    expect(new Set(pkg.factoryLoadout.portAssignments.map((a) => a.portId)).size).toBe(pkg.factoryLoadout.portAssignments.length)
    expect(new Set(pkg.equipmentAssignments.map((a) => a.portId)).size).toBe(pkg.equipmentAssignments.length)
  })
})
