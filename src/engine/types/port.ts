import type { EquipmentGroup } from './equipmentGroup'

/**
 * `Port` — THE HEART OF THE DATA MODEL.
 *
 * A Port represents a single mount point on a ship (a hardpoint, a bay, a
 * turret gimbal, an internal component slot, etc.). Parent-child
 * relationships are preserved via `parentPortId` (child -> parent) and
 * `childPortIds` (parent -> children) — a flat, doubly-linked structure
 * rather than nested embedding, so `ports: Port[]` from a normalizer is
 * always a flat, directly-indexable array. `children` is kept only for
 * backward compatibility with the earlier Gladius proof-of-concept's
 * nested-tree shape; new normalizer code should not populate it.
 *
 * `internalName` is the raw CIG/StarBreaker identifier (e.g.
 * "hardpoint_gun_left_wing"); `displayName` is what the UI is allowed to
 * show. See `src/normalizer/displayNameGenerator.ts` — the UI should
 * NEVER render `internalName` directly.
 */
export interface Port {
  id: string
  shipId: string
  /** Null/undefined for a top-level port with no parent. */
  parentPortId?: string | null
  equipmentGroup: EquipmentGroup

  internalName: string
  displayName: string
  /** Human-facing position, e.g. "Left Wing", "Nose", "Turret 1". */
  positionLabel?: string

  /** Compatibility constraints for what can be installed in this Port.
   * Empty arrays / null bounds mean "unknown/unconstrained", never
   * "nothing allowed" — see CompatibilityRule. */
  allowedTypes: string[]
  allowedSubtypes: string[]
  minSize: number | null
  maxSize: number | null

  /** Foreign keys into Component. Null/undefined = empty. */
  installedItemId?: string | null
  factoryItemId?: string | null
  targetItemId?: string | null

  /** Flat list of this port's direct children's ids (new, normalized shape). */
  childPortIds?: string[]
  /** @deprecated legacy nested-tree shape from the Gladius proof-of-concept. */
  children?: Port[]

  /** Optional debug metadata: where in the raw source this port came from. */
  sourcePath?: string
}
