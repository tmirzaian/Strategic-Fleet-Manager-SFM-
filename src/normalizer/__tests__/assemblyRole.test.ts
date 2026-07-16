import { describe, it, expect } from 'vitest'
import { deriveAssemblyRole, deriveAssemblyRoleFromEntityClass } from '../assemblyRole'

describe('deriveAssemblyRoleFromEntityClass — EWO-020, evidenced against real raw exports', () => {
  it('a gimbal mount entity class (Eclipse, Gladius, Valkyrie wing mounts) is GIMBAL_MOUNT', () => {
    expect(deriveAssemblyRoleFromEntityClass('Mount_Gimbal_S2')).toBe('GIMBAL_MOUNT')
    expect(deriveAssemblyRoleFromEntityClass('Mount_Gimbal_S3')).toBe('GIMBAL_MOUNT')
    expect(deriveAssemblyRoleFromEntityClass('Mount_Gimbal_S4')).toBe('GIMBAL_MOUNT')
  })

  it('a fixed weapon mount entity class (Valkyrie door guns) is DIRECT_WEAPON_MOUNT', () => {
    expect(deriveAssemblyRoleFromEntityClass('WeaponMount_Gun_S1_ANVL_Asgard_Door_Right')).toBe('DIRECT_WEAPON_MOUNT')
  })

  it('an explicit "Remote Turret" entity class (Valkyrie wing remote turrets) is REMOTE_TURRET', () => {
    expect(deriveAssemblyRoleFromEntityClass('ANVL_Valkyrie_SCItem_Remote_Turret_Left')).toBe('REMOTE_TURRET')
    expect(deriveAssemblyRoleFromEntityClass('ANVL_Valkyrie_SCItem_Remote_Turret_Right')).toBe('REMOTE_TURRET')
  })

  it('a "Nose Turret" entity class is treated as a fixed mount, not a turret (Valkyrie nose gun despite CIG\'s own naming)', () => {
    expect(deriveAssemblyRoleFromEntityClass('ANVL_Valkyrie_Nose_Turret_S3')).toBe('DIRECT_WEAPON_MOUNT')
  })

  it('a "Turret" entity class without Remote/Nose evidence is MANNED_TURRET (Cutlass Black, Valkyrie top/bottom turrets)', () => {
    expect(deriveAssemblyRoleFromEntityClass('DRAK_Cutlass_SCItem_Turret_Black')).toBe('MANNED_TURRET')
    expect(deriveAssemblyRoleFromEntityClass('ANVL_Valkyrie_Turret_Top')).toBe('MANNED_TURRET')
    expect(deriveAssemblyRoleFromEntityClass('ANVL_Valkyrie_Turret_Bubble')).toBe('MANNED_TURRET')
  })

  it('an unrecognized entity class with no mount/turret naming is GENERIC_MOUNT, never guessed further', () => {
    expect(deriveAssemblyRoleFromEntityClass('Some_Unknown_Assembly_Thing')).toBe('GENERIC_MOUNT')
  })

  it('no entity class at all is UNKNOWN', () => {
    expect(deriveAssemblyRoleFromEntityClass(null)).toBe('UNKNOWN')
    expect(deriveAssemblyRoleFromEntityClass(undefined)).toBe('UNKNOWN')
  })

  it('does not misclassify a real gun/missile component as a mount merely because its class contains a shared token', () => {
    // KLWE_LaserRepeater_S2 is a leaf gun, not a mount — no Mount_/WeaponMount_ prefix, no Turret token.
    expect(deriveAssemblyRoleFromEntityClass('KLWE_LaserRepeater_S2')).toBe('GENERIC_MOUNT')
  })
})

describe('deriveAssemblyRole — combined entity-class + canonical-port-type resolution', () => {
  it('prefers entity-class mount/turret evidence over canonical port type', () => {
    expect(deriveAssemblyRole('Mount_Gimbal_S3', 'WeaponTurret')).toBe('GIMBAL_MOUNT')
  })

  it('falls back to canonical port type for a plain equipment leaf (gun, missile, rack, quantum drive, jump module)', () => {
    expect(deriveAssemblyRole('KLWE_LaserRepeater_S2', 'WeaponGun')).toBe('WEAPON')
    expect(deriveAssemblyRole('MISL_S02_CS_FSKI_Tempest', 'Missile')).toBe('MISSILE')
    expect(deriveAssemblyRole('MRCK_S09_AEGS_Eclipse', 'MissileRack')).toBe('MISSILE_RACK')
    expect(deriveAssemblyRole('QDRV_RACO_S01_Drift_SCItem', 'QuantumDrive')).toBe('QUANTUM_DRIVE')
    expect(deriveAssemblyRole('JDRV_TARS_S01_Explorer_SCItem', 'JumpDrive')).toBe('JUMP_MODULE')
  })

  it('is UNKNOWN when neither entity class nor canonical port type resolves anything', () => {
    expect(deriveAssemblyRole(null, undefined)).toBe('UNKNOWN')
  })
})
