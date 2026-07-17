/// <reference types="vite/client" />
/**
 * Browser-side loader for generated-data/ship-catalog.runtime.json
 * (Mission M-012, re-pointed by RC-008 — Portable Runtime Catalog
 * Certification).
 *
 * RC-007 (Fresh Clone Certification) found that the full catalog
 * (`generated-data/ship-catalog.json`) is gitignored per ADR-005, so a
 * real GitHub Beta user — with no StarBreaker, no licensed Star Citizen
 * install — silently lost canonical ship naming and role classification
 * for every ship outside the 12 hand-authored seed ships. RC-008's fix:
 * `npm run generate:ship-catalog` now also derives and writes
 * `ship-catalog.runtime.json` — a small subset containing only the fields
 * this loader (and its consumers) actually read, stripped of dev-only
 * provenance (`recordName`, `movementClass`, `crewSize`, `dimensions`,
 * localization keys, etc. — confirmed unread anywhere in `src/` by direct
 * audit). That file IS committed to git (see .gitignore's RC-008 note) —
 * this is the whole fix. `import.meta.glob` is kept anyway (rather than a
 * plain static import) purely as defense in depth: if the runtime file is
 * ever missing for any reason, Add Ship degrades to the seed + imported
 * roster instead of failing the build, exactly as it always has.
 */
const modules = import.meta.glob<{ default: unknown }>('../../generated-data/ship-catalog.runtime.json', { eager: true })
const rawCatalog = Object.values(modules)[0]?.default as ShipCatalogFile | undefined

export interface ShipCatalogManufacturer {
  code: string
  name: string | null
}

export interface ShipCatalogRecord {
  entityClass: string
  category: 'ship' | 'ground_vehicle'
  manufacturer: ShipCatalogManufacturer | null
  displayName: string | null
  careerKey: string | null
  roleKey: string | null
  careerName: string | null
  roleName: string | null
}

export interface ShipCatalogSource {
  gameVersion: string
  generatedAt: string
}

interface ShipCatalogFile {
  schemaVersion: number
  source?: ShipCatalogSource
  records: Record<string, ShipCatalogRecord>
}

/** Every catalog record with a resolved display name — Add Ship can't usefully search/show an entry with no name. */
export const shipCatalogRecords: ShipCatalogRecord[] = rawCatalog ? Object.values(rawCatalog.records).filter((r) => r.displayName) : []

export const hasShipCatalog = shipCatalogRecords.length > 0

/** CWO-005 (Task 5) — the real Star Citizen build this catalog (and
 * therefore the currently-imported Golden Fleet) was generated against.
 * `undefined` when the runtime catalog is missing — the same honest "not
 * generated yet" state `hasShipCatalog` already documents, never a
 * guessed or hardcoded version. */
export const shipCatalogSource: ShipCatalogSource | undefined = rawCatalog?.source
