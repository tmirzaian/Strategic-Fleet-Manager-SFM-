/**
 * Types and constants for `generated-data/component-metadata-catalog.json`.
 *
 * This schema is standalone — it intentionally does not import from
 * `src/normalizer` or `src/engine` so the generator stays isolated from
 * normalization behavior (Mission M-007).
 */

// Bumped 1 -> 2 for Mission M-012 (Universe Provisioning): discovery moved
// from a per-entity, raw-data-fixture-scoped walk to full-universe bulk
// DataCore field queries. `recordId` becomes optional as a result —
// StarBreaker's bulk field-query mode extracts values from within
// `_RecordValue_` only; a record's own `_RecordId_` GUID is wrapper
// metadata, not reachable via that mechanism without a per-entity full
// dump (which would defeat bulk querying's whole performance rationale).
// `displayName` is now actually resolved (see
// scripts/universeCatalog/localization.ts) rather than always null.
export const CATALOG_SCHEMA_VERSION = 2
export const GENERATOR_NAME = 'Strategic Fleet Manager Component Catalog Generator'
export const GENERATOR_VERSION = '2.0.0'

export interface CatalogRecordProvenance {
  source: 'starbreaker-datacore'
  /** Source path/type information where available — currently the
   * DataCore `_RecordTag_` (e.g. "SystemsDesign"), since `dcb query`
   * does not expose a file path for a record. */
  recordPath: string | null
}

export interface CatalogRecord {
  entityClass: string
  recordName: string
  /** Present only for records resolved via the narrow per-entity query path (M-007); omitted for full-universe bulk-discovered records (M-012) — see the schemaVersion 2 note above. */
  recordId?: string
  category: string | null
  subtype: string | null
  size: number | null
  grade: number | null
  manufacturerRef: string | null
  localizationKey: string | null
  displayName: string | null
  provenance: CatalogRecordProvenance
}

export interface UnresolvedEntry {
  entityClass: string
  reason: string
}

export interface CatalogSource {
  tool: 'StarBreaker'
  toolVersion: string
  gameBranch: string
  gameVersion: string
  p4ChangeNum: string
  /**
   * Portable label (e.g. "LIVE/Data.p4k"), NOT an absolute filesystem
   * path — see the portability requirement in Mission M-007. This is a
   * deliberate deviation from a literal absolute path despite the field
   * name suggesting one.
   */
  dataP4kPath: string
  generatedAt: string
}

export interface CatalogFile {
  schemaVersion: number
  generator: { name: string; version: string }
  source: CatalogSource
  records: Record<string, CatalogRecord>
  unresolved: UnresolvedEntry[]
}
