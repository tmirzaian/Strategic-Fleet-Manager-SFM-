import { describe, it, expect } from 'vitest'
import { ShipNormalizer } from '../shipNormalizer'
import { validateNormalizedPackage } from '../validation'
import type { RawShipExport } from '../rawTypes'

const baseFixture: RawShipExport = {
  entity: { className: 'TEST_Validation', manufacturer: 'Test Co', career: 'Combat', role: 'Fighter' },
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
  ],
}

describe('validateNormalizedPackage', () => {
  it('produces no errors for a well-formed normalized package', () => {
    const pkg = new ShipNormalizer().normalize(baseFixture, 'test.json')
    const result = validateNormalizedPackage(pkg)
    const errors = [...result.normalizationWarnings, ...result.compatibilityWarnings].filter((w) => w.severity === 'error')
    expect(errors).toEqual([])
  })

  it('flags a dangling factory-loadout port reference', () => {
    const pkg = new ShipNormalizer().normalize(baseFixture, 'test.json')
    pkg.factoryLoadout = {
      ...pkg.factoryLoadout,
      portAssignments: [...pkg.factoryLoadout.portAssignments, { portId: 'does-not-exist', componentId: null }],
    }
    const result = validateNormalizedPackage(pkg)
    expect(result.normalizationWarnings.some((w) => w.code === 'dangling-factory-port')).toBe(true)
  })

  it('flags duplicate port ids', () => {
    const pkg = new ShipNormalizer().normalize(baseFixture, 'test.json')
    pkg.ports.push({ ...pkg.ports[0] })
    const result = validateNormalizedPackage(pkg)
    expect(result.normalizationWarnings.some((w) => w.code === 'duplicate-port-id')).toBe(true)
  })

  it('flags duplicate component ids', () => {
    const pkg = new ShipNormalizer().normalize(baseFixture, 'test.json')
    pkg.components.push({ ...pkg.components[0] })
    const result = validateNormalizedPackage(pkg)
    expect(result.normalizationWarnings.some((w) => w.code === 'duplicate-component-id')).toBe(true)
  })

  it('flags Installed Loadout diverging from Factory Loadout', () => {
    const pkg = new ShipNormalizer().normalize(baseFixture, 'test.json')
    pkg.installedLoadout.portAssignments = pkg.installedLoadout.portAssignments.map((a) => ({ ...a, componentId: null }))
    const result = validateNormalizedPackage(pkg)
    expect(result.normalizationWarnings.some((w) => w.code === 'installed-mismatch')).toBe(true)
  })

  it('flags an incompatible target/factory assignment when component data is known', () => {
    const pkg = new ShipNormalizer().normalize(baseFixture, 'test.json')
    // Force a size mismatch: port wants exactly size 2, component is size 9.
    pkg.components[0].size = 9
    const result = validateNormalizedPackage(pkg)
    expect(result.compatibilityWarnings.some((w) => w.code === 'incompatible-target')).toBe(true)
  })
})
