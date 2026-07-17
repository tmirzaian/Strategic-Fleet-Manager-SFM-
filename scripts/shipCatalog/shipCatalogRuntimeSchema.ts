/**
 * Types and constants for `generated-data/ship-catalog.runtime.json`
 * (Mission RC-008 — Portable Runtime Catalog Certification).
 *
 * RC-007 confirmed that `generated-data/ship-catalog.json` (the full
 * StarBreaker-derived catalog, gitignored per ADR-005) is a hard runtime
 * dependency for canonical ship naming and role classification — meaning
 * a real GitHub Beta user, who has neither StarBreaker nor a licensed
 * Star Citizen install, silently loses both. This file is the fix: a
 * small, derived, committed artifact containing ONLY the fields the
 * browser runtime (`src/generated/shipCatalog.ts` and its consumers)
 * actually reads — confirmed by direct audit of every call site. Every
 * other field on the full catalog record (`recordName`, `movementClass`,
 * `localizationKey`, `crewSize`, `dimensions`, `provenance`, the
 * manufacturer's own `localizationKey`) is dev-only: read by nothing in
 * `src/`, kept on the full catalog for generation-time provenance/audit
 * only. Dropping them here is not a scope reduction of what the app can
 * do — it is the exact runtime-required subset, nothing more, nothing
 * less.
 *
 * What this file legally is: resolved English ship names, manufacturer
 * names/codes, and career/role text — the same class of factual,
 * publicly-published identity data already visible on RSI's own public
 * ship listing and reproduced by numerous long-standing fan tools. It is
 * NOT a redistribution of DataCore's raw record structure, any P4K path,
 * any internal record GUID, or any extracted asset (model/texture/audio).
 * See ADR-005's "Licensing / output treatment" section and RC-008's
 * licensing impact assessment for the full reasoning.
 */

export const SHIP_CATALOG_RUNTIME_SCHEMA_VERSION = 1
export const SHIP_CATALOG_RUNTIME_FILENAME = 'ship-catalog.runtime.json'

export type ShipCatalogRuntimeVehicleCategory = 'ship' | 'ground_vehicle'

export interface ShipCatalogRuntimeManufacturer {
  /** Stable DataCore manufacturer code (e.g. "AEGS"). Never invented. */
  code: string
  /** Resolved English display name (e.g. "Aegis Dynamics"), or null if unresolved. */
  name: string | null
}

export interface ShipCatalogRuntimeRecord {
  /** Exact DataCore entity class — the stable identifier every consumer keys on. */
  entityClass: string
  category: ShipCatalogRuntimeVehicleCategory
  manufacturer: ShipCatalogRuntimeManufacturer | null
  /** Resolved English display name. Only records with a real resolved name are ever included here (see deriveRuntimeShipCatalog). */
  displayName: string
  /** Raw DataCore career/role localization keys — kept because classificationFor's override table matches on these exactly. */
  careerKey: string | null
  roleKey: string | null
  /** Resolved English display text for careerKey/roleKey, or null if unresolved. */
  careerName: string | null
  roleName: string | null
}

export interface ShipCatalogRuntimeSource {
  /** The Star Citizen build this data was generated against (e.g. "4.9.186.42610") — the only source field the runtime reads (Captain's Log certification line). */
  gameVersion: string
  generatedAt: string
}

export interface ShipCatalogRuntimeFile {
  schemaVersion: number
  source: ShipCatalogRuntimeSource
  records: Record<string, ShipCatalogRuntimeRecord>
}
