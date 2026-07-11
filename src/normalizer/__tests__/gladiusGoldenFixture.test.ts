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

describe('Gladius golden fixture — authoritative resolution (Sprint 1.3F)', () => {
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

  it('3. all three factory weapons resolve to CF-337 Panther Repeater', () => {
    const pkg = loadGladius()
    const weapons = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Weapons')
    for (const w of weapons) {
      expect(componentNameFor(pkg, w.resolvedItemId)).toBe('CF-337 Panther Repeater')
    }
  })

  it('4. Power Plant resolves to S1 Regulus', () => {
    const pkg = loadGladius()
    const powerPlant = pkg.equipmentAssignments.find((a) => a.displayName === 'Power Plant')!
    expect(powerPlant.minSize).toBe(1)
    expect(powerPlant.maxSize).toBe(1)
    expect(componentNameFor(pkg, powerPlant.resolvedItemId)).toBe('Regulus')
  })

  it('5. both coolers resolve to S1 Bracer', () => {
    const pkg = loadGladius()
    const coolers = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Coolers')
    expect(coolers).toHaveLength(2)
    for (const c of coolers) {
      expect(c.minSize).toBe(1)
      expect(c.maxSize).toBe(1)
      expect(componentNameFor(pkg, c.resolvedItemId)).toBe('Bracer')
    }
  })

  it('6. both shields resolve to S1 AllStop', () => {
    const pkg = loadGladius()
    const shields = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Shields')
    expect(shields).toHaveLength(2)
    for (const s of shields) {
      expect(s.minSize).toBe(1)
      expect(s.maxSize).toBe(1)
      expect(componentNameFor(pkg, s.resolvedItemId)).toBe('AllStop')
    }
  })

  it('7. Quantum Drive resolves to S1 Beacon', () => {
    const pkg = loadGladius()
    const qd = pkg.equipmentAssignments.find((a) => a.equipmentGroup === 'QuantumDrive')!
    expect(qd.minSize).toBe(1)
    expect(qd.maxSize).toBe(1)
    expect(componentNameFor(pkg, qd.resolvedItemId)).toBe('Beacon')
  })

  it('8. four missile rack positions exist: left inner, right inner, left outer, right outer', () => {
    const pkg = loadGladius()
    const racks = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Missiles')
    const names = racks.map((r) => r.displayName).sort()
    expect(names).toEqual(['Left Inner Missile Rack', 'Left Outer Missile Rack', 'Right Inner Missile Rack', 'Right Outer Missile Rack'])
  })

  it('9. missile rack UI normalization produces one rack + missile-type row, not individual missile-slot rows', () => {
    const pkg = loadGladius()
    const racks = pkg.equipmentAssignments.filter((a) => a.equipmentGroup === 'Missiles')
    // Exactly 4 collapsed rows for missiles — never 8 (one per missile slot).
    expect(racks).toHaveLength(4)
    for (const r of racks) {
      expect(r.leafCount).toBeGreaterThan(1) // each rack really does have multiple missile children...
      expect(componentNameFor(pkg, r.mountItemId)).toBe('S2 Missile Rack') // ...but collapses to one mount + one type decision
    }
    // The deliberately mixed rack reports itself as mixed rather than inventing one type.
    const mixedRack = racks.find((r) => r.displayName === 'Right Outer Missile Rack')!
    expect(mixedRack.mixedChildItems).toBe(true)
    expect(mixedRack.resolvedItemId).toBeNull()
    expect(mixedRack.resolvedItemIds.length).toBe(2)
  })

  it('10. re-running the importer is deterministic and idempotent', () => {
    const pkg1 = loadGladius()
    const pkg2 = loadGladius()
    // Same ids, same resolved values, every run — nothing is randomized or order-dependent.
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

  it('12. no size is derived from a helper-name convention like hardpoint_class_2', () => {
    const pkg = loadGladius()
    // Every port's size in this fixture comes from explicit minSize/maxSize
    // fields — none of the internalNames even contain a "_class_" size hint,
    // proving size couldn't have been inferred from naming even accidentally.
    for (const port of pkg.ports) {
      expect(port.internalName).not.toMatch(/_class_\d/)
    }
  })

  it('passes the full golden fixture comparison (13/13)', () => {
    const pkg = loadGladius()
    const results = compareToGoldenFixture(pkg, goldenFixtures.Gladius)
    const failures = results.filter((r) => !r.pass)
    expect(failures).toEqual([])
    expect(results).toHaveLength(13)
  })

  it('produces zero validation errors', () => {
    const pkg = loadGladius()
    const result = validateNormalizedPackage(pkg)
    const errors = [...result.normalizationWarnings, ...result.compatibilityWarnings].filter((w) => w.severity === 'error')
    expect(errors).toEqual([])
  })
})
