import { describe, it, expect } from 'vitest'
import { classifyPort } from '../portClassifier'

describe('classifyPort', () => {
  it('includes recognized user-manageable equipment types', () => {
    expect(classifyPort('hardpoint_gun_left_wing', 'WeaponGun').include).toBe(true)
    expect(classifyPort('hardpoint_power_plant', 'PowerPlant').equipmentGroup).toBe('Power')
    expect(classifyPort('hardpoint_shield_generator_left', 'Shield').equipmentGroup).toBe('Shields')
    expect(classifyPort('hardpoint_quantum_drive', 'QuantumDrive').equipmentGroup).toBe('QuantumDrive')
    expect(classifyPort('hardpoint_cooler', 'Cooler').equipmentGroup).toBe('Coolers')
    expect(classifyPort('hardpoint_cargo_grid', 'Cargo').equipmentGroup).toBe('Cargo')
  })

  it('excludes explicitly non-user-manageable node types', () => {
    for (const portType of ['Door', 'Light', 'Seat', 'Dashboard', 'ATCManager', 'LandingGear', 'Controller', 'Thruster', 'FuelTank', 'MeshHelper', 'Joint', 'Animation']) {
      const result = classifyPort(`some_${portType.toLowerCase()}_node`, portType)
      expect(result.include, `expected ${portType} to be excluded`).toBe(false)
    }
  })

  it('fails safe (excludes) an unrecognized portType rather than guessing', () => {
    const result = classifyPort('hardpoint_mystery_thing', 'SomeFutureThingCIGHasNotDocumented')
    expect(result.include).toBe(false)
    expect(result.equipmentGroup).toBeNull()
  })

  it('excludes a node with no portType at all', () => {
    const result = classifyPort('untyped_node', undefined)
    expect(result.include).toBe(false)
  })

  it('still generates a displayName even for excluded nodes (for debug/report purposes)', () => {
    const result = classifyPort('door_pilot', 'Door')
    expect(result.displayName).toBeTruthy()
  })

  it('always returns a reason string explaining the decision', () => {
    expect(classifyPort('hardpoint_gun_left_wing', 'WeaponGun').reason).toBeTruthy()
    expect(classifyPort('door_pilot', 'Door').reason).toBeTruthy()
  })
})
