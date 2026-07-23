/**
 * Types and constants for `generated-data/component-metadata-catalog.runtime.json`
 * (Mission RC-008 — Portable Runtime Catalog Certification; `subtype`
 * restored by EWO-STAB-004A/CAT-003).
 *
 * Same rationale as `scripts/shipCatalog/shipCatalogRuntimeSchema.ts`: the
 * full catalog (gitignored, 6,095 records) carries `recordId` (a raw
 * DataCore database GUID), `recordName`, `localizationKey`, and
 * `provenance` — none of which `src/generated/componentCatalog.ts` (the
 * only browser runtime consumer) reads. Confirmed by direct audit: the
 * browser loader only ever reads `category`, `subtype`, `size`,
 * `displayName`, `grade`, and `manufacturerRef` off a raw record, and only
 * for records where `displayName`, `category`, and `size` are all present
 * (its own existing `continue` guard) — a record failing that guard is
 * already unreachable through either exported map, so omitting it here
 * changes nothing observable.
 *
 * `subtype` was originally excluded here by RC-008 ("confirmed unread here
 * by direct audit") — that conclusion was correct at the time. CAT-003
 * (Polaris Point Defense Cannon Compatibility Certification) found it is
 * now load-bearing: `subtype: "PDCTurret"` is the only canonical field
 * that distinguishes a Point Defense Turret assembly (e.g.
 * `Turret_PDC_BEHR_A`) from an ordinary Size 2 gimbal/turret mount
 * (`subtype: "GunTurret"`) sharing the same `category: "Turret"` and
 * `size: 2` — see ADR-010's EWO-STAB-004A section.
 *
 * `classification` added by CAT-001 (Objective 6): "Persist the extracted
 * classification within the generated Component Catalog. The runtime
 * shall consume the catalog normally. No runtime parsing of descriptions
 * is authorized." — the browser loader reads this pre-computed field
 * verbatim; it never sees or parses description text itself.
 */

export const COMPONENT_CATALOG_RUNTIME_SCHEMA_VERSION = 3
export const COMPONENT_CATALOG_RUNTIME_FILENAME = 'component-metadata-catalog.runtime.json'

export interface ComponentCatalogRuntimeRecord {
  category: string
  /** DataCore's own SubType, verbatim (e.g. "Gun", "GunTurret",
   * "PDCTurret") — `null` when the source record carries none. Never
   * translated into SFM's port-type vocabulary here; that translation
   * happens at the point of use (src/data/componentCatalog.ts), the same
   * layering already used for `category`. */
  subtype: string | null
  size: number
  grade: number | null
  displayName: string
  /** Inconsistent raw shape (short code or a `scitemmanufacturer.<code>.json` path, or null) — preserved verbatim; `manufacturerCodeFromRef` in the browser loader does the same conservative extraction it always has. */
  manufacturerRef: string | null
  /** CAT-001 — see the schemaVersion 3 note above. Null for the majority of records. */
  classification: string | null
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
