/**
 * Tolerant, loosely-typed shapes for a raw StarBreaker-style export.
 *
 * These deliberately live outside `src/engine/types` — Layer 1 (raw CIG
 * data) shapes belong to whatever StarBreaker happens to export and vary
 * by node kind, not to the normalized Layer 2 model. Every field the
 * pipeline actually depends on is optional or defaulted so that unrelated
 * or partially-populated nodes (mesh helpers, joints, doors, controllers)
 * don't crash normalization — they just get excluded by
 * `portClassifier.ts` or produce a normalization warning.
 */

export interface RawEntity {
  className?: string
  manufacturer?: string
  career?: string
  role?: string
  insurance?: string
  model?: string
}

/**
 * The `root` envelope used by the newer StarBreaker export format. It only
 * carries the entity class identifier (e.g. "EntityClassDefinition.AEGS_Gladius")
 * and a geometry path — none of the metadata fields `RawEntity` exposes.
 */
export interface RawRootEnvelope {
  entity: string
  geometry?: string
}

/** Non-equipment geometry/helper data. Never treated as a port. */
export interface RawGeometry {
  helpers?: string[]
  [key: string]: unknown
}

export interface RawComponentNode {
  internalName: string
  displayName?: string
  manufacturer?: string
  category?: string
  subtype?: string
  size?: number
  grade?: string
  class?: string
  tags?: string[]
}

/**
 * One node in the raw `loadout` hierarchy, legacy schema. This may be a
 * real equipment port (a weapon mount, a shield generator bay) or an
 * unrelated node (a door, a seat, a landing gear controller, a thruster) —
 * `portClassifier` is what decides which is which, not this type. A node
 * is simultaneously "the port" and "the component installed there," with
 * structured constraint fields (`allowedTypes`, `minSize`, etc.) supplied
 * directly by the export.
 */
export interface LegacyLoadoutNode {
  /** The raw CIG/StarBreaker port identifier, e.g. "hardpoint_gun_left_wing". */
  itemPortName: string
  /** Raw port/subsystem kind, e.g. "WeaponGun", "Door", "Seat", "Thruster". */
  portType?: string
  size?: number
  /** DataCore-derived constraints, when the export includes them. */
  allowedTypes?: string[]
  allowedSubtypes?: string[]
  minSize?: number
  maxSize?: number
  requiredTags?: string[]
  portTags?: string[]
  factoryComponent?: RawComponentNode | null
  children?: LegacyLoadoutNode[]
}

/**
 * One node in the raw `loadout` hierarchy, newer StarBreaker geometry-export
 * schema. Each node names the `entity` class mounted at `port` and nests its
 * sub-hardpoints/sub-parts under `children` — there is no structured
 * classification (`portType`) or constraint (`allowedTypes`/`minSize`/
 * `maxSize`) data; that only exists in the legacy, curated export.
 */
export interface StarBreakerLoadoutNode {
  /** The entity class mounted at this node's `port`, e.g. "Mount_Gimbal_S3". */
  entity: string
  /** The raw CIG/StarBreaker port identifier, e.g. "hardpoint_gun_left_wing". */
  port: string
  parent?: string
  geometry?: string
  invisible?: boolean
  nmc_properties?: unknown[]
  children?: StarBreakerLoadoutNode[]
}

/** A raw loadout node in either schema StarBreaker has exported. Narrow with
 * the `isLegacyLoadoutNode` type guard in `loadoutNodeAdapter.ts` before
 * reading schema-specific fields. */
export type RawLoadoutNode = LegacyLoadoutNode | StarBreakerLoadoutNode

export interface RawShipExport {
  /** Legacy top-level entity metadata. */
  entity?: RawEntity
  /** Newer StarBreaker envelope — entity class name lives at `root.entity`. */
  root?: RawRootEnvelope
  root_nmc?: unknown[]
  geometry?: RawGeometry
  loadout: RawLoadoutNode[]
  interiors?: unknown[]
}
