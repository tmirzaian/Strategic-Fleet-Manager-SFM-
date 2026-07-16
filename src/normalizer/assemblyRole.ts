import type { EquipmentGroup } from '../engine/types'

/**
 * EWO-020 — a conservative, source-evidenced physical-assembly role for a
 * Port. Never forces a specific role when the evidence doesn't support
 * one: `GENERIC_MOUNT` (structure present, role not specifically
 * identified) and `UNKNOWN` (no entity identity at all) are both legal,
 * expected outcomes, preferred over a false classification.
 */
export type AssemblyRole =
  | 'DIRECT_WEAPON_MOUNT'
  | 'GIMBAL_MOUNT'
  | 'WEAPON'
  | 'MISSILE_RACK'
  | 'MISSILE_SLOT'
  | 'MISSILE'
  | 'MANNED_TURRET'
  | 'REMOTE_TURRET'
  | 'QUANTUM_DRIVE'
  | 'JUMP_MODULE'
  | 'GENERIC_MOUNT'
  | 'UNKNOWN'

/** The EquipmentGroup a role belongs to, for ports whose own classification
 * didn't already resolve one (a structural node that was excluded by
 * `classifyPort` has no `equipmentGroup` of its own). Only roles that
 * imply a stable, unambiguous group are listed — a role not present here
 * must derive its group from a resolved descendant instead (see
 * `shipNormalizer.ts`'s `findDescendantEquipmentGroup`), never guessed. */
export const ROLE_EQUIPMENT_GROUP: Partial<Record<AssemblyRole, EquipmentGroup>> = {
  DIRECT_WEAPON_MOUNT: 'Weapons',
  GIMBAL_MOUNT: 'Weapons',
  WEAPON: 'Weapons',
  MANNED_TURRET: 'Weapons',
  REMOTE_TURRET: 'Weapons',
  MISSILE_RACK: 'Missiles',
  MISSILE_SLOT: 'Missiles',
  MISSILE: 'Missiles',
  QUANTUM_DRIVE: 'QuantumDrive',
  JUMP_MODULE: 'QuantumDrive',
}

/**
 * Derives a role from the raw entity class mounted at a node (e.g.
 * "Mount_Gimbal_S2", "ANVL_Valkyrie_Turret_Top") — CIG's own DataCore
 * class-naming convention, not a port/hardpoint name (EWO-019B already
 * proved port-name substrings like "turret" are unreliable: a Valkyrie
 * wing port literally named `turret_gun` hosts a plain `Mount_Gimbal_S4`,
 * while `hardpoint_turret_door_*` hosts a fixed `WeaponMount`, neither a
 * turret at all). Every rule below is evidenced against real raw exports
 * inspected for this mission (Eclipse, Cutlass Black, Valkyrie):
 *
 * - `Mount_Gimbal_*` -> GIMBAL_MOUNT (Eclipse's two weapon mounts,
 *   Gladius's three, Valkyrie's wing mounts one level below their own
 *   Remote Turret assembly).
 * - `WeaponMount_*` -> DIRECT_WEAPON_MOUNT (Valkyrie's door guns).
 * - entity class contains token "Remote" and "Turret" -> REMOTE_TURRET
 *   (`ANVL_Valkyrie_SCItem_Remote_Turret_Left/Right` — DataCore's own
 *   explicit naming, the strongest signal available).
 * - entity class contains token "Turret" and token "Nose" -> treated as
 *   DIRECT_WEAPON_MOUNT, not a turret — `ANVL_Valkyrie_Nose_Turret_S3` is
 *   a fixed, pilot-aimed nose gun despite CIG's own "Turret" naming (the
 *   same false-signal risk EWO-019B already documented); "Nose" is real,
 *   observed, disambiguating evidence, not a guess.
 * - entity class contains token "Turret" (neither Remote nor Nose) ->
 *   MANNED_TURRET (`DRAK_Cutlass_SCItem_Turret_Black`, whose own geometry
 *   path is literally `..._turret_seat.cga`; `ANVL_Valkyrie_Turret_Top`/
 *   `_Turret_Bubble`). This is the single most inferential rule in this
 *   module — "not Remote and not Nose" is evidence of exclusion, not
 *   direct positive evidence of a seat — flagged here and in the EWO-020
 *   report rather than asserted as equally certain to the others.
 * - anything else with a real entity class -> GENERIC_MOUNT (structure
 *   preserved, role not specifically identified).
 * - no entity class at all -> UNKNOWN.
 */
export function deriveAssemblyRoleFromEntityClass(entityClass: string | null | undefined): AssemblyRole {
  if (!entityClass) return 'UNKNOWN'

  if (entityClass.startsWith('Mount_Gimbal')) return 'GIMBAL_MOUNT'
  if (entityClass.startsWith('WeaponMount')) return 'DIRECT_WEAPON_MOUNT'

  const tokens = entityClass.split('_').filter(Boolean)
  const hasToken = (t: string) => tokens.some((tok) => tok.toLowerCase() === t.toLowerCase())

  if (hasToken('Turret')) {
    if (hasToken('Remote')) return 'REMOTE_TURRET'
    if (hasToken('Nose')) return 'DIRECT_WEAPON_MOUNT'
    return 'MANNED_TURRET'
  }

  return 'GENERIC_MOUNT'
}

/** Maps an already-resolved canonical port type (a node that classified
 * successfully — real DataCore category, real translation) to a role, for
 * the common equipment leaves whose own entity class doesn't follow a
 * mount/turret naming pattern (a gun, a missile, a rack). Falls back to
 * GENERIC_MOUNT for a recognized-but-unmapped type rather than UNKNOWN,
 * since "recognized and included" is itself positive structural evidence. */
function roleFromCanonicalPortType(canonicalPortType: string | undefined): AssemblyRole | null {
  switch (canonicalPortType) {
    case 'WeaponGun':
      return 'WEAPON'
    case 'MissileRack':
      return 'MISSILE_RACK'
    case 'Missile':
      return 'MISSILE'
    case 'QuantumDrive':
      return 'QUANTUM_DRIVE'
    case 'JumpDrive':
      return 'JUMP_MODULE'
    default:
      return null
  }
}

/**
 * The single entry point every call site (normalizer, for both included
 * and structural-fallback ports) uses. Entity-class-name evidence takes
 * priority when it identifies a mount/turret assembly specifically;
 * canonical-port-type evidence covers the common equipment leaves whose
 * own entity class is just a named item (a gun, a missile), not a
 * mount-shaped class name.
 */
export function deriveAssemblyRole(entityClass: string | null | undefined, canonicalPortType: string | undefined): AssemblyRole {
  const fromEntity = deriveAssemblyRoleFromEntityClass(entityClass)
  if (fromEntity !== 'GENERIC_MOUNT' && fromEntity !== 'UNKNOWN') return fromEntity

  const fromType = roleFromCanonicalPortType(canonicalPortType)
  if (fromType) return fromType

  return fromEntity
}
