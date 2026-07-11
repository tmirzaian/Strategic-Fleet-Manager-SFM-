/**
 * Types and constants for `generated-data/component-metadata-catalog.json`.
 *
 * This schema is standalone — it intentionally does not import from
 * `src/normalizer` or `src/engine` so the generator stays isolated from
 * normalization behavior (Mission M-007).
 */

export const CATALOG_SCHEMA_VERSION = 1
export const GENERATOR_NAME = 'Strategic Fleet Manager Component Catalog Generator'
export const GENERATOR_VERSION = '1.0.0'

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
  recordId: string
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
