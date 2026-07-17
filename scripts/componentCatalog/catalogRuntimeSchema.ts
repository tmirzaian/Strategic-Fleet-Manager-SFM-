/**
 * Types and constants for `generated-data/component-metadata-catalog.runtime.json`
 * (Mission RC-008 — Portable Runtime Catalog Certification).
 *
 * Same rationale as `scripts/shipCatalog/shipCatalogRuntimeSchema.ts`: the
 * full catalog (gitignored, 6,095 records) carries `recordId` (a raw
 * DataCore database GUID), `recordName`, `subtype`, `localizationKey`, and
 * `provenance` — none of which `src/generated/componentCatalog.ts` (the
 * only browser runtime consumer) reads. Confirmed by direct audit: the
 * browser loader only ever reads `category`, `size`, `displayName`,
 * `grade`, and `manufacturerRef` off a raw record, and only for records
 * where `displayName`, `category`, and `size` are all present (its own
 * existing `continue` guard) — a record failing that guard is already
 * unreachable through either exported map, so omitting it here changes
 * nothing observable.
 */

export const COMPONENT_CATALOG_RUNTIME_SCHEMA_VERSION = 1
export const COMPONENT_CATALOG_RUNTIME_FILENAME = 'component-metadata-catalog.runtime.json'

export interface ComponentCatalogRuntimeRecord {
  category: string
  size: number
  grade: number | null
  displayName: string
  /** Inconsistent raw shape (short code or a `scitemmanufacturer.<code>.json` path, or null) — preserved verbatim; `manufacturerCodeFromRef` in the browser loader does the same conservative extraction it always has. */
  manufacturerRef: string | null
}

export interface ComponentCatalogRuntimeSource {
  gameVersion: string
  generatedAt: string
}

export interface ComponentCatalogRuntimeFile {
  schemaVersion: number
  source: ComponentCatalogRuntimeSource
  records: Record<string, ComponentCatalogRuntimeRecord>
}
