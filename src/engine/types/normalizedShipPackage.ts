import type { Ship } from './ship'
import type { EquipmentGroup } from './equipmentGroup'
import type { Port } from './port'
import type { Component } from './component'
import type { FactoryLoadout, InstalledLoadout, TargetBuild } from './loadouts'

export interface SourceMetadata {
  sourceType: 'StarBreaker'
  /** The raw entity's own identifier (e.g. "AEGS_Gladius"), not the SFM ship id. */
  sourceEntity: string
  /** Path/filename of the raw-data file this package was built from. */
  sourceFile: string
  importedAt: string
  /** Version of the CIG game data the source export came from, if known. */
  gameDataVersion?: string
  /** Version of the importer/normalizer pipeline that produced this package. */
  importerVersion: string
}

export type WarningSeverity = 'warning' | 'error'

export interface NormalizationWarning {
  severity: WarningSeverity
  code: string
  message: string
  /** Internal name or port id this warning concerns, if applicable. */
  path?: string
}

export interface CompatibilityWarning {
  severity: WarningSeverity
  code: string
  message: string
  portId?: string
}

/**
 * `ResolvedEquipmentAssignment` — the collapsed, user-facing view of one
 * top-level port and everything nested beneath it (a gimbal-mounted
 * weapon, a missile rack and its missiles, a future mining/salvage mount).
 * The full uncollapsed graph is still preserved in `ports` — this is a
 * derived, additional view for rendering, not a replacement.
 *
 * `resolvedItemId` is the single meaningful item to show the player when
 * every leaf beneath this port agrees on one factory item (the common
 * case: a gimbal with one gun, a rack whose missiles are all the same
 * type). When leaves disagree, `resolvedItemId` is null,
 * `mixedChildItems` is true, and `resolvedItemIds` holds every distinct
 * value actually found — the raw data is never collapsed into an invented
 * single answer.
 */
export interface ResolvedEquipmentAssignment {
  shipId: string
  /** The top-level (outer/mount) port id — e.g. the ship hardpoint. */
  portId: string
  displayName: string
  positionLabel?: string
  equipmentGroup: EquipmentGroup
  /** Authoritative size range — from the leaf port(s) when they agree,
   * else falls back to the mount port's own range with a warning. */
  minSize: number | null
  maxSize: number | null
  /** The mount/rack hardware's own factory item, if the outer port itself
   * has one (a gimbal, a rack chassis). Null for a plain, non-nested port. */
  mountItemId: string | null
  /** The single resolved leaf item, when unambiguous. */
  resolvedItemId: string | null
  /** Every distinct leaf factory item id found beneath this port. */
  resolvedItemIds: string[]
  mixedChildItems: boolean
  /** How many leaf ports were found beneath this port (1 for a plain port). */
  leafCount: number
  /** internalNames from this port down to each resolved leaf, for debugging. */
  mountPath: string[]
}

/**
 * The complete output of one Importer -> Normalizer run for one ship.
 * This is what `GeneratedDataWriter` persists (or, split apart, what the
 * individual generated-data/*.json files together represent) and what the
 * UI's imported-ship loader reads back.
 */
export interface NormalizedShipPackage {
  ship: Ship
  equipmentGroups: EquipmentGroup[]
  ports: Port[]
  components: Component[]
  /** Collapsed, user-facing view derived from `ports` — see ResolvedEquipmentAssignment. */
  equipmentAssignments: ResolvedEquipmentAssignment[]
  factoryLoadout: FactoryLoadout
  installedLoadout: InstalledLoadout
  defaultTargetBuild: TargetBuild
  compatibilityWarnings: CompatibilityWarning[]
  normalizationWarnings: NormalizationWarning[]
  sourceMetadata: SourceMetadata
}
