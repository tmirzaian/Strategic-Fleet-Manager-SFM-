import { describe, it, expect } from 'vitest'
import { resolveEquipmentAssignments } from '../equipmentResolver'
import type { Port } from '../../engine/types'

let counter = 0
function port(overrides: Partial<Port> & Pick<Port, 'internalName' | 'displayName' | 'equipmentGroup'>): Port {
  counter++
  return {
    id: `port-${counter}`,
    shipId: 'ship-1',
    parentPortId: null,
    allowedTypes: [],
    allowedSubtypes: [],
    minSize: 1,
    maxSize: 1,
    installedItemId: undefined,
    factoryItemId: undefined,
    targetItemId: undefined,
    childPortIds: [],
    ...overrides,
  }
}

describe('resolveEquipmentAssignments — QuantumDrive/JumpDrive independent-equipment relationship', () => {
  it('1. a QuantumDrive parent with a JumpDrive child preserves the QuantumDrive as its own resolved item', () => {
    const jumpDrive = port({
      internalName: 'hardpoint_jump_drive',
      displayName: 'Jump Drive',
      equipmentGroup: 'QuantumDrive',
      canonicalPortType: 'JumpDrive',
      factoryItemId: 'component-explorer',
    })
    const quantumDrive = port({
      internalName: 'hardpoint_quantum_drive',
      displayName: 'Quantum Drive',
      equipmentGroup: 'QuantumDrive',
      canonicalPortType: 'QuantumDrive',
      factoryItemId: 'component-beacon',
      childPortIds: [jumpDrive.id],
    })
    jumpDrive.parentPortId = quantumDrive.id

    const { assignments } = resolveEquipmentAssignments('ship-1', [quantumDrive, jumpDrive])
    const qdAssignment = assignments.find((a) => a.displayName === 'Quantum Drive')!
    expect(qdAssignment.resolvedItemId).toBe('component-beacon')
    expect(qdAssignment.mountItemId).toBeNull()
  })

  it('2. the JumpDrive child is independently represented as its own assignment', () => {
    const jumpDrive = port({
      internalName: 'hardpoint_jump_drive',
      displayName: 'Jump Drive',
      equipmentGroup: 'QuantumDrive',
      canonicalPortType: 'JumpDrive',
      factoryItemId: 'component-explorer',
    })
    const quantumDrive = port({
      internalName: 'hardpoint_quantum_drive',
      displayName: 'Quantum Drive',
      equipmentGroup: 'QuantumDrive',
      canonicalPortType: 'QuantumDrive',
      factoryItemId: 'component-beacon',
      childPortIds: [jumpDrive.id],
    })
    jumpDrive.parentPortId = quantumDrive.id

    const { assignments } = resolveEquipmentAssignments('ship-1', [quantumDrive, jumpDrive])
    expect(assignments).toHaveLength(2)
    const jdAssignment = assignments.find((a) => a.displayName === 'Jump Drive')!
    expect(jdAssignment.resolvedItemId).toBe('component-explorer')
    expect(jdAssignment.mountItemId).toBeNull()
  })
})

describe('resolveEquipmentAssignments — existing mount/rack behavior unchanged', () => {
  it('3. a weapon mount still resolves to its child gun (mount hardware reported separately)', () => {
    const gun = port({
      internalName: 'hardpoint_class_2',
      displayName: 'Nose Weapon Weapon',
      equipmentGroup: 'Weapons',
      canonicalPortType: 'WeaponGun',
      factoryItemId: 'component-gats',
    })
    const mount = port({
      internalName: 'hardpoint_gun_nose',
      displayName: 'Nose Weapon',
      equipmentGroup: 'Weapons',
      canonicalPortType: 'WeaponTurret',
      factoryItemId: 'component-mount-gimbal',
      childPortIds: [gun.id],
    })
    gun.parentPortId = mount.id

    const { assignments } = resolveEquipmentAssignments('ship-1', [mount, gun])
    expect(assignments).toHaveLength(1) // collapsed into ONE assignment, unlike the independent case
    const assignment = assignments[0]!
    expect(assignment.displayName).toBe('Nose Weapon')
    expect(assignment.resolvedItemId).toBe('component-gats')
    expect(assignment.mountItemId).toBe('component-mount-gimbal')
  })

  it('4. a missile rack still resolves its missile children, detecting a mixed loadout', () => {
    const missileA = port({ internalName: 'missile_01_attach', displayName: 'Missile 1', equipmentGroup: 'Missiles', canonicalPortType: 'Missile', factoryItemId: 'component-ignite' })
    const missileB = port({ internalName: 'missile_02_attach', displayName: 'Missile 2', equipmentGroup: 'Missiles', canonicalPortType: 'Missile', factoryItemId: 'component-arrester' })
    const rack = port({
      internalName: 'hardpoint_missilerack',
      displayName: 'Missile Rack',
      equipmentGroup: 'Missiles',
      canonicalPortType: 'MissileRack',
      factoryItemId: 'component-rack',
      childPortIds: [missileA.id, missileB.id],
    })
    missileA.parentPortId = rack.id
    missileB.parentPortId = rack.id

    const { assignments, warnings } = resolveEquipmentAssignments('ship-1', [rack, missileA, missileB])
    expect(assignments).toHaveLength(1)
    const assignment = assignments[0]!
    expect(assignment.mixedChildItems).toBe(true)
    expect(assignment.resolvedItemId).toBeNull()
    expect(assignment.resolvedItemIds.sort()).toEqual(['component-arrester', 'component-ignite'])
    expect(warnings.some((w) => w.code === 'mixed-child-items')).toBe(true)
  })

  it('5. a uniformly-loaded missile rack resolves to the single agreed item (no mixed warning)', () => {
    const missileA = port({ internalName: 'missile_01_attach', displayName: 'Missile 1', equipmentGroup: 'Missiles', canonicalPortType: 'Missile', factoryItemId: 'component-ignite' })
    const missileB = port({ internalName: 'missile_02_attach', displayName: 'Missile 2', equipmentGroup: 'Missiles', canonicalPortType: 'Missile', factoryItemId: 'component-ignite' })
    const rack = port({
      internalName: 'hardpoint_missilerack',
      displayName: 'Missile Rack',
      equipmentGroup: 'Missiles',
      canonicalPortType: 'MissileRack',
      factoryItemId: 'component-rack',
      childPortIds: [missileA.id, missileB.id],
    })
    missileA.parentPortId = rack.id
    missileB.parentPortId = rack.id

    const { assignments, warnings } = resolveEquipmentAssignments('ship-1', [rack, missileA, missileB])
    expect(assignments[0]!.mixedChildItems).toBe(false)
    expect(assignments[0]!.resolvedItemId).toBe('component-ignite')
    expect(warnings.some((w) => w.code === 'mixed-child-items')).toBe(false)
  })
})

describe('resolveEquipmentAssignments — internal attachments never reach the resolver', () => {
  it('6. a weapon mount with only its gun as a child (attachments already excluded upstream) still resolves cleanly', () => {
    // WeaponAttachment children (Barrel, FiringMechanism, ...) are excluded
    // by classificationTranslator before a Port is ever created for them
    // (Mission M-009) — they never reach equipmentResolver.ts at all. This
    // confirms the resolver doesn't need to know about them to work
    // correctly: the gun is the only child present, exactly as it would
    // be in the real, post-exclusion tree.
    const gun = port({ internalName: 'hardpoint_class_2', displayName: 'Gun', equipmentGroup: 'Weapons', canonicalPortType: 'WeaponGun', factoryItemId: 'component-gats' })
    const mount = port({
      internalName: 'hardpoint_gun_nose',
      displayName: 'Nose Weapon',
      equipmentGroup: 'Weapons',
      canonicalPortType: 'WeaponTurret',
      factoryItemId: 'component-mount',
      childPortIds: [gun.id],
    })
    gun.parentPortId = mount.id

    const { assignments } = resolveEquipmentAssignments('ship-1', [mount, gun])
    expect(assignments).toHaveLength(1)
    expect(assignments[0]!.resolvedItemId).toBe('component-gats')
  })
})

describe('resolveEquipmentAssignments — independent equipment nested arbitrarily deep is never collapsed', () => {
  it('7. a plain leaf port (no children) resolves to its own item, same as before Mission M-010', () => {
    const powerPlant = port({ internalName: 'hardpoint_power_plant', displayName: 'Power Plant', equipmentGroup: 'Power', canonicalPortType: 'PowerPlant', factoryItemId: 'component-regulus' })
    const { assignments } = resolveEquipmentAssignments('ship-1', [powerPlant])
    expect(assignments).toHaveLength(1)
    expect(assignments[0]!.resolvedItemId).toBe('component-regulus')
    expect(assignments[0]!.mountItemId).toBeNull()
    expect(assignments[0]!.leafCount).toBe(1)
  })

  it('8. relationship behavior depends only on canonicalPortType, not on internalName/displayName', () => {
    // A node whose *name* looks exactly like a mount, but whose canonical
    // port type is independent equipment, is NOT collapsed — proving the
    // decision doesn't key off any name.
    const child = port({ internalName: 'mount_child', displayName: 'Mount Child', equipmentGroup: 'QuantumDrive', canonicalPortType: 'JumpDrive', factoryItemId: 'component-child' })
    const parent = port({
      internalName: 'hardpoint_gun_nose_mount_turret_rack', // deliberately mount/rack/turret-shaped name
      displayName: 'Definitely A Mount',
      equipmentGroup: 'QuantumDrive',
      canonicalPortType: 'QuantumDrive', // independent, despite the name
      factoryItemId: 'component-parent',
      childPortIds: [child.id],
    })
    child.parentPortId = parent.id

    const { assignments } = resolveEquipmentAssignments('ship-1', [parent, child])
    expect(assignments).toHaveLength(2)
    expect(assignments.find((a) => a.displayName === 'Definitely A Mount')!.resolvedItemId).toBe('component-parent')
    expect(assignments.find((a) => a.displayName === 'Mount Child')!.resolvedItemId).toBe('component-child')
  })
})

describe('resolveEquipmentAssignments — deterministic behavior', () => {
  it('9. repeated resolution of the same ports produces identical output', () => {
    const gun = port({ internalName: 'hardpoint_class_2', displayName: 'Gun', equipmentGroup: 'Weapons', canonicalPortType: 'WeaponGun', factoryItemId: 'component-gats' })
    const mount = port({
      internalName: 'hardpoint_gun_nose',
      displayName: 'Nose Weapon',
      equipmentGroup: 'Weapons',
      canonicalPortType: 'WeaponTurret',
      factoryItemId: 'component-mount',
      childPortIds: [gun.id],
    })
    gun.parentPortId = mount.id
    const ports = [mount, gun]

    const first = resolveEquipmentAssignments('ship-1', ports)
    const second = resolveEquipmentAssignments('ship-1', ports)
    expect(first.assignments).toEqual(second.assignments)
  })
})

describe('resolveEquipmentAssignments — port/assignment id uniqueness', () => {
  it('10. every assignment portId is unique across a mixed container/independent tree', () => {
    const gun = port({ internalName: 'hardpoint_class_2', displayName: 'Gun', equipmentGroup: 'Weapons', canonicalPortType: 'WeaponGun', factoryItemId: 'component-gats' })
    const mount = port({
      internalName: 'hardpoint_gun_nose',
      displayName: 'Nose Weapon',
      equipmentGroup: 'Weapons',
      canonicalPortType: 'WeaponTurret',
      factoryItemId: 'component-mount',
      childPortIds: [gun.id],
    })
    gun.parentPortId = mount.id

    const jumpDrive = port({ internalName: 'hardpoint_jump_drive', displayName: 'Jump Drive', equipmentGroup: 'QuantumDrive', canonicalPortType: 'JumpDrive', factoryItemId: 'component-explorer' })
    const quantumDrive = port({
      internalName: 'hardpoint_quantum_drive',
      displayName: 'Quantum Drive',
      equipmentGroup: 'QuantumDrive',
      canonicalPortType: 'QuantumDrive',
      factoryItemId: 'component-beacon',
      childPortIds: [jumpDrive.id],
    })
    jumpDrive.parentPortId = quantumDrive.id

    const { assignments } = resolveEquipmentAssignments('ship-1', [mount, gun, quantumDrive, jumpDrive])
    const portIds = assignments.map((a) => a.portId)
    expect(new Set(portIds).size).toBe(portIds.length)
  })
})
