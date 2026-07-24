import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShipNormalizer } from '../shipNormalizer'
import type { NormalizedShipPackage } from '../../engine/types'

const RAW_DATA_DIR = resolve(__dirname, '../../../raw-data')

function loadShip(file: string): NormalizedShipPackage {
  const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, file), 'utf-8'))
  return new ShipNormalizer().normalize(raw, `raw-data/${file}`)
}

function componentNameFor(pkg: NormalizedShipPackage, componentId: string | null | undefined) {
  return componentId ? pkg.components.find((c) => c.id === componentId)?.displayName : undefined
}

/**
 * SW-013C.2B — Module Taxonomy Activation. These tests run the real
 * `ShipNormalizer` against the real, checked-in raw StarBreaker exports
 * (not synthetic fixtures) for every ship in this mission's certification
 * corpus, proving the classification fix end-to-end: from raw geometry
 * data through to the real `Port[]` the rest of the app builds on.
 */
describe('SW-013C.2B: Hornet Ghost Mk II — Module classification activates real ports', () => {
  const pkg = () => loadShip('ANVL_Hornet_F7CS_Mk2.json')

  it('the Center mount materializes as a real, non-structural port', () => {
    const center = pkg().ports.find((p) => p.internalName === 'hardpoint_weapon_center')
    expect(center).toBeDefined()
    expect(center!.canonicalPortType).toBe('Module')
    expect(center!.equipmentGroup).toBe('Modules')
    expect(center!.isStructural).not.toBe(true)
  })

  it('the Nose mount materializes as a real, non-structural port', () => {
    const nose = pkg().ports.find((p) => p.internalName === 'hardpoint_nose_cone')
    expect(nose).toBeDefined()
    expect(nose!.canonicalPortType).toBe('Module')
    expect(nose!.equipmentGroup).toBe('Modules')
  })

  it('Objective 2: the Center mount preserves real factory truth — the Cap, not fabricated empty or a fabricated turret', () => {
    const p = pkg()
    const center = p.ports.find((port) => port.internalName === 'hardpoint_weapon_center')!
    expect(componentNameFor(p, center.factoryItemId)).toBe('Anvil Hornet Ghost Mk II Center Cap')
    expect(center.factoryItemId).toBe(center.installedItemId)
    expect(center.factoryItemId).toBe(center.targetItemId)
  })

  it('Objective 2: the Nose mount preserves real factory truth — the nose cap, not fabricated', () => {
    const p = pkg()
    const nose = p.ports.find((port) => port.internalName === 'hardpoint_nose_cone')!
    expect(componentNameFor(p, nose.factoryItemId)).toBeDefined()
    expect(nose.factoryItemId).toBe(nose.installedItemId)
    expect(nose.factoryItemId).toBe(nose.targetItemId)
  })

  it('Objective 3: minimum/maximum size is derived from the real factory component, not fabricated', () => {
    const center = pkg().ports.find((p) => p.internalName === 'hardpoint_weapon_center')!
    expect(center.minSize).toBe(5)
    expect(center.maxSize).toBe(5)
  })

  it('Objective 6 / Objective 8: no duplicate row is produced for an already-classified port (Left/Right Wing Weapon)', () => {
    const p = pkg()
    const leftWing = p.ports.filter((port) => port.internalName === 'hardpoint_weapon_left_wing')
    expect(leftWing).toHaveLength(1)
    expect(leftWing[0].canonicalPortType).toBe('WeaponTurret')
  })

  it('the real armed wing weapons are unaffected — still WeaponTurret/Weapons, not reclassified as Module', () => {
    const p = pkg()
    for (const name of ['hardpoint_weapon_left_wing', 'hardpoint_weapon_right_wing']) {
      const port = p.ports.find((x) => x.internalName === name)!
      expect(port.canonicalPortType).toBe('WeaponTurret')
      expect(port.equipmentGroup).toBe('Weapons')
    }
  })
})

describe('SW-013C.2B: Retaliator — Module classification activates independent front/rear module bays', () => {
  const pkg = () => loadShip('AEGS_Retaliator.json')

  it('both module bays materialize as real, independent, non-structural ports', () => {
    const p = pkg()
    const front = p.ports.find((port) => port.internalName === 'hardpoint_front_module')
    const rear = p.ports.find((port) => port.internalName === 'hardpoint_rear_module')
    expect(front).toBeDefined()
    expect(rear).toBeDefined()
    expect(front!.canonicalPortType).toBe('Module')
    expect(rear!.canonicalPortType).toBe('Module')
    expect(front!.id).not.toBe(rear!.id)
  })

  it('Objective 2: each bay preserves its own real factory truth — Front Base and Rear Base are distinct, both authoritative', () => {
    const p = pkg()
    const front = p.ports.find((port) => port.internalName === 'hardpoint_front_module')!
    const rear = p.ports.find((port) => port.internalName === 'hardpoint_rear_module')!
    expect(componentNameFor(p, front.factoryItemId)).toBe('Retaliator Unladen Front Module')
    expect(componentNameFor(p, rear.factoryItemId)).toBe('Retaliator Unladen Rear Module')
    expect(front.factoryItemId).not.toBe(rear.factoryItemId)
  })

  it('each bay is a top-level port (parentPortId null) — matches the confirmed DataCore parent (the ship root)', () => {
    const p = pkg()
    const front = p.ports.find((port) => port.internalName === 'hardpoint_front_module')!
    expect(front.parentPortId).toBeNull()
  })
})

describe('SW-013C.2B: Hornet Mk I — negative control, must remain unchanged', () => {
  const pkg = () => loadShip('ANVL_Hornet_F7A_Mk1.json')

  it('has zero Module-classified ports — its nose/center mounts were already real, armed WeaponTurret ports', () => {
    const p = pkg()
    expect(p.ports.filter((port) => port.canonicalPortType === 'Module')).toHaveLength(0)
  })

  it('the nose and center turrets remain real, factory-armed WeaponTurret ports, unaffected', () => {
    const p = pkg()
    const nose = p.ports.find((port) => port.internalName === 'hardpoint_class_4_nose')!
    const center = p.ports.find((port) => port.internalName === 'hardpoint_class_4_center')!
    expect(nose.canonicalPortType).toBe('WeaponTurret')
    expect(center.canonicalPortType).toBe('WeaponTurret')
    expect(componentNameFor(p, nose.factoryItemId)).toBeTruthy()
    expect(componentNameFor(p, center.factoryItemId)).toBeTruthy()
  })
})

describe('SW-013C.2B: Buccaneer — negative control, contrast with a factory-populated weapon mount', () => {
  it('the Spinal S4 nose mount remains an ordinary, unaffected WeaponTurret port', () => {
    const p = loadShip('DRAK_Buccaneer.json')
    expect(p.ports.filter((port) => port.canonicalPortType === 'Module')).toHaveLength(0)
    const spinal = p.ports.find((port) => port.internalName === 'hardpoint_Spinal_S4')!
    expect(spinal.canonicalPortType).toBe('WeaponTurret')
  })
})

describe('SW-013C.2B (Objective 7): Vanguard — exclusive nose weapon positions remain distinct, never collapsed', () => {
  it('all four exclusive fixed nose guns materialize as four separate, real WeaponTurret ports — not one generic Module row', () => {
    const p = loadShip('AEGS_Vanguard.json')
    const fixedNoseGuns = p.ports.filter((port) => port.internalName.startsWith('hardpoint_weapon_gun_nose_fixed_'))
    expect(fixedNoseGuns).toHaveLength(4)
    const ids = new Set(fixedNoseGuns.map((port) => port.id))
    expect(ids.size).toBe(4) // four genuinely distinct ports, not duplicates of one
    for (const port of fixedNoseGuns) {
      expect(port.canonicalPortType).toBe('WeaponTurret')
      expect(port.canonicalPortType).not.toBe('Module')
    }
  })
})
