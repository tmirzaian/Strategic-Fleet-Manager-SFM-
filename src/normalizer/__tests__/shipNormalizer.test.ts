import { describe, it, expect } from 'vitest'
import { ShipNormalizer } from '../shipNormalizer'
import type { RawShipExport, LegacyLoadoutNode } from '../rawTypes'

function fixture(overrides?: Partial<RawShipExport>): RawShipExport {
  return {
    entity: { className: 'TEST_Fixture', manufacturer: 'Test Co', career: 'Combat', role: 'Fighter' },
    loadout: [
      {
        itemPortName: 'hardpoint_gun_left_wing',
        portType: 'WeaponGun',
        allowedTypes: ['WeaponGun'],
        allowedSubtypes: [],
        minSize: 2,
        maxSize: 2,
        factoryComponent: {
          internalName: 'test_repeater',
          displayName: 'Test Repeater',
          manufacturer: 'Test Co',
          category: 'WeaponGun',
          subtype: 'Ballistic',
          size: 2,
          grade: 'A',
          class: 'Military',
        },
      },
      {
        itemPortName: 'hardpoint_missile_rack',
        portType: 'MissileRack',
        allowedTypes: ['MissileRack'],
        allowedSubtypes: [],
        minSize: 2,
        maxSize: 2,
        factoryComponent: null,
        children: [
          {
            itemPortName: 'hardpoint_missile_rack_01',
            portType: 'Missile',
            allowedTypes: ['Missile'],
            allowedSubtypes: [],
            minSize: 2,
            maxSize: 2,
            factoryComponent: {
              internalName: 'test_missile',
              displayName: 'Test Missile',
              manufacturer: 'Test Co',
              category: 'Missile',
              subtype: 'Guided',
              size: 2,
              grade: 'A',
              class: 'Military',
            },
          },
        ],
      },
      { itemPortName: 'door_pilot', portType: 'Door', factoryComponent: null },
    ],
    ...overrides,
  }
}

describe('ShipNormalizer', () => {
  it('preserves recursive parent-child port relationships', () => {
    const pkg = new ShipNormalizer().normalize(fixture(), 'test.json')
    const rack = pkg.ports.find((p) => p.internalName === 'hardpoint_missile_rack')!
    const child = pkg.ports.find((p) => p.internalName === 'hardpoint_missile_rack_01')!

    expect(rack.parentPortId).toBeNull()
    expect(rack.childPortIds).toContain(child.id)
    expect(child.parentPortId).toBe(rack.id)
  })

  it('excludes irrelevant nodes (doors, controllers, etc.) from the normalized ports', () => {
    const pkg = new ShipNormalizer().normalize(fixture(), 'test.json')
    expect(pkg.ports.find((p) => p.internalName === 'door_pilot')).toBeUndefined()
  })

  it('initializes Installed Loadout to exactly match Factory Loadout', () => {
    const pkg = new ShipNormalizer().normalize(fixture(), 'test.json')
    const factoryMap = new Map(pkg.factoryLoadout.portAssignments.map((a) => [a.portId, a.componentId]))
    for (const a of pkg.installedLoadout.portAssignments) {
      expect(a.componentId).toBe(factoryMap.get(a.portId))
    }
    expect(pkg.installedLoadout.portAssignments.length).toBe(pkg.factoryLoadout.portAssignments.length)
  })

  it('initializes the default Target Build to match Factory Loadout', () => {
    const pkg = new ShipNormalizer().normalize(fixture(), 'test.json')
    const factoryMap = new Map(pkg.factoryLoadout.portAssignments.map((a) => [a.portId, a.componentId]))
    for (const a of pkg.defaultTargetBuild.portAssignments) {
      expect(a.componentId).toBe(factoryMap.get(a.portId))
    }
    expect(pkg.defaultTargetBuild.name).toBe('Factory Build')
  })

  it('every port and component id is unique', () => {
    const pkg = new ShipNormalizer().normalize(fixture(), 'test.json')
    expect(new Set(pkg.ports.map((p) => p.id)).size).toBe(pkg.ports.length)
    expect(new Set(pkg.components.map((c) => c.id)).size).toBe(pkg.components.length)
  })

  it('records a warning (not an invented value) when size constraints are missing', () => {
    const raw = fixture()
    // Strip constraint data from the weapon port entirely.
    const weaponNode = raw.loadout[0]
    delete (weaponNode as any).minSize
    delete (weaponNode as any).maxSize
    delete (weaponNode as any).size
    delete (weaponNode as any).allowedTypes

    const pkg = new ShipNormalizer().normalize(raw, 'test.json')
    const port = pkg.ports.find((p) => p.internalName === 'hardpoint_gun_left_wing')!

    expect(port.minSize).toBeNull()
    expect(port.maxSize).toBeNull()
    expect(port.allowedTypes).toEqual([])
    const hasWarning = pkg.normalizationWarnings.some((w) => w.code === 'missing-size-constraint' && w.path === 'hardpoint_gun_left_wing')
    expect(hasWarning).toBe(true)
  })

  it('never uses the "Factory Component" placeholder string', () => {
    const pkg = new ShipNormalizer().normalize(fixture(), 'test.json')
    for (const c of pkg.components) {
      expect(c.displayName).not.toBe('Factory Component')
    }
  })

  it('does not crash on a raw document with no factory components at all', () => {
    const raw = fixture()
    ;(raw.loadout[0] as LegacyLoadoutNode).factoryComponent = null
    expect(() => new ShipNormalizer().normalize(raw, 'test.json')).not.toThrow()
  })
})
