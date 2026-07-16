/**
 * Types and constants for `generated-data/ship-catalog.json` (Mission
 * M-012). A lightweight, complete ROSTER of every player-ownable ship and
 * ground vehicle — identity, manufacturer, and classification metadata
 * only. This is deliberately NOT a replacement for the deep, per-ship
 * normalized port-tree pipeline (generated-data/ships.json/ports.json/
 * factory-loadouts.json) — that pipeline's full authoritative loadout
 * resolution is a separate, much larger undertaking per ship (see
 * docs/ImportPipeline.md), and doing that for the full ~294-ship roster is
 * explicitly out of this mission's scope ("catalog breadth and application
 * integration," not a new sync/import engine). This catalog powers Add
 * Ship's search breadth; a ship added from it that has no deep import yet
 * materializes with an empty/unresolved loadout, which is a documented,
 * honest limitation, not a silent gap.
 */

export const SHIP_CATALOG_SCHEMA_VERSION = 1
export const SHIP_CATALOG_GENERATOR_NAME = 'Strategic Fleet Manager Ship Catalog Generator'
export const SHIP_CATALOG_GENERATOR_VERSION = '1.0.0'

export type ShipCatalogVehicleCategory = 'ship' | 'ground_vehicle'

export interface ShipCatalogManufacturer {
  /** Stable DataCore manufacturer code (e.g. "AEGS"). Never invented. */
  code: string
  /** Resolved English display name (e.g. "Aegis Dynamics"), or null if the localization key had no table entry. */
  name: string | null
  /** Raw DataCore localization key for the manufacturer name, preserved for provenance (e.g. "@manufacturer_NameAEGS"). */
  localizationKey: string | null
}

export interface ShipCatalogRecord {
  /** Exact DataCore entity class — the stable identifier every consumer keys on. */
  entityClass: string
  recordName: string
  /** "ship" (movementClass "Spaceship") or "ground_vehicle" (movementClass "ArcadeWheeled"). */
  category: ShipCatalogVehicleCategory
  /** Raw DataCore movementClass value, preserved verbatim for provenance. */
  movementClass: string
  manufacturer: ShipCatalogManufacturer | null
  /** Resolved English display name, or null if unresolved (Mission M-012: explicit null, never guessed). */
  displayName: string | null
  /** Raw DataCore localization key for the vehicle name, preserved for provenance. */
  localizationKey: string | null
  /** Raw DataCore career/role localization keys, preserved verbatim — not translated or categorized further. */
  careerKey: string | null
  roleKey: string | null
  /** Resolved English display text for careerKey/roleKey, or null if unresolved. */
  careerName: string | null
  roleName: string | null
  crewSize: number | null
  /** Bounding-box dimensions in meters where DataCore provides them. */
  dimensions: { x: number; y: number; z: number } | null
  provenance: {
    source: 'starbreaker-datacore'
    /** Which reviewed exclusion pattern (if any) this record was checked against and passed — always null for an included record; unresolved candidates that failed the taxonomy check are never included here at all (see UnresolvedShipEntry). */
    recordPath: string | null
  }
}

export interface ShipCatalogUnresolvedEntry {
  entityClass: string
  reason: string
}

export interface ShipCatalogSource {
  tool: 'StarBreaker'
  toolVersion: string
  gameBranch: string
  gameVersion: string
  p4ChangeNum: string
  dataP4kPath: string
  generatedAt: string
}

export interface ShipCatalogFile {
  schemaVersion: number
  generator: { name: string; version: string }
  source: ShipCatalogSource
  /** Total vehicle-component candidates discovered before any filtering — for coverage reporting. */
  totalCandidates: number
  /** Candidates excluded by the reviewed non-player-variant name taxonomy — for coverage reporting. */
  excludedNonPlayerVariantCount: number
  records: Record<string, ShipCatalogRecord>
  unresolved: ShipCatalogUnresolvedEntry[]
}
