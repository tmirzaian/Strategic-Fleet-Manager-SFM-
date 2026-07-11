import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `ComponentMetadataResolver` — a pure lookup service over the Component
 * Metadata Catalog produced by `scripts/generateComponentCatalog.ts`
 * (Mission M-007). It has exactly four responsibilities: load the catalog
 * (lazily, once), build an immutable in-memory map, answer exact-key
 * lookups, and report unresolved entity classes explicitly. Nothing else.
 *
 * This module never imports DataCore, StarBreaker, or P4K code — it only
 * ever reads the already-generated `generated-data/component-metadata-catalog.json`
 * file. If that file is missing (e.g. a machine that hasn't run
 * `npm run generate:component-catalog`), every lookup is reported
 * `unresolved` rather than the resolver failing to construct — a missing
 * catalog is a normal, expected state, not an error.
 */

/** The catalog metadata this resolver exposes for one entity class.
 * Fields mirror the catalog record but only the identity + taxonomy
 * fields consumers actually need — `provenance`/`recordPath` from the
 * catalog stay internal to the catalog file itself. */
export interface ComponentMetadata {
  entityClass: string
  recordName: string
  recordId: string
  /** DataCore's own `Type` value, verbatim — e.g. "PowerPlant", "Turret".
   * NOT translated into SFM's `EquipmentGroup`/portType vocabulary. */
  category: string | null
  /** DataCore's own `SubType` value, verbatim — e.g. "Gun", "GunTurret". */
  subtype: string | null
  size: number | null
  grade: number | null
  manufacturerRef: string | null
  localizationKey: string | null
  displayName: string | null
}

export interface ResolvedMetadata {
  status: 'resolved'
  entityClass: string
  metadata: ComponentMetadata
  provenance: 'catalog'
}

export interface UnresolvedMetadata {
  status: 'unresolved'
  entityClass: string
  reason: string
}

export type MetadataResolution = ResolvedMetadata | UnresolvedMetadata

/** The subset of the catalog file's shape this resolver reads. Loosely
 * typed on purpose — schema validation of the catalog itself is
 * `scripts/generateComponentCatalog.ts`'s job, not this consumer's. */
interface RawCatalogRecord {
  entityClass?: unknown
  recordName?: unknown
  recordId?: unknown
  category?: unknown
  subtype?: unknown
  size?: unknown
  grade?: unknown
  manufacturerRef?: unknown
  localizationKey?: unknown
  displayName?: unknown
}

interface RawCatalogFile {
  records?: Record<string, RawCatalogRecord>
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_CATALOG_PATH = resolvePath(MODULE_DIR, '../../generated-data/component-metadata-catalog.json')

function loadCatalogFromDisk(catalogPath: string): RawCatalogFile | null {
  if (!existsSync(catalogPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(catalogPath, 'utf-8'))
    if (!parsed || typeof parsed !== 'object' || typeof parsed.records !== 'object' || parsed.records === null) {
      return null
    }
    return parsed as RawCatalogFile
  } catch {
    return null
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function toComponentMetadata(entityClass: string, raw: RawCatalogRecord): ComponentMetadata {
  return {
    entityClass,
    recordName: typeof raw.recordName === 'string' ? raw.recordName : `EntityClassDefinition.${entityClass}`,
    recordId: typeof raw.recordId === 'string' ? raw.recordId : '',
    category: nullableString(raw.category),
    subtype: nullableString(raw.subtype),
    size: nullableNumber(raw.size),
    grade: nullableNumber(raw.grade),
    manufacturerRef: nullableString(raw.manufacturerRef),
    localizationKey: nullableString(raw.localizationKey),
    displayName: nullableString(raw.displayName),
  }
}

/**
 * Builds the immutable lookup map from a list of `[entityClass, record]`
 * entries. Exists as its own function (rather than inlined into
 * `ensureLoaded`) so the duplicate-key guard is directly unit-testable —
 * a real parsed JSON object can never contain a literal duplicate key
 * (`JSON.parse` collapses it silently), but this guard protects a future
 * caller that merges entries from more than one source.
 */
export function buildMetadataMapFromEntries(entries: Array<[string, RawCatalogRecord]>): Map<string, ComponentMetadata> {
  const map = new Map<string, ComponentMetadata>()
  for (const [entityClass, raw] of entries) {
    if (map.has(entityClass)) {
      throw new Error(`ComponentMetadataResolver: duplicate exact entity key "${entityClass}" in catalog.`)
    }
    map.set(entityClass, toComponentMetadata(entityClass, raw))
  }
  return map
}

export interface ComponentMetadataResolverOptions {
  /** Overrides the default `generated-data/component-metadata-catalog.json` path. */
  catalogPath?: string
  /** Overrides how the raw catalog file is loaded entirely — the seam
   * tests use to inject fixture data without touching disk. */
  loadCatalog?: () => RawCatalogFile | null
}

export class ComponentMetadataResolver {
  private cache: Map<string, ComponentMetadata> | null = null
  private readonly loadCatalog: () => RawCatalogFile | null

  constructor(options: ComponentMetadataResolverOptions = {}) {
    const catalogPath = options.catalogPath ?? DEFAULT_CATALOG_PATH
    this.loadCatalog = options.loadCatalog ?? (() => loadCatalogFromDisk(catalogPath))
  }

  /** Loads and builds the lookup map on first use only. Every subsequent
   * call — from this same resolver instance — reuses the cached map
   * without touching disk again. */
  private ensureLoaded(): Map<string, ComponentMetadata> {
    if (this.cache) return this.cache
    const catalog = this.loadCatalog()
    const entries = catalog?.records ? Object.entries(catalog.records) : []
    this.cache = buildMetadataMapFromEntries(entries)
    return this.cache
  }

  /** Exact lookup only — no substring, fuzzy, case-insensitive, or
   * normalized-name matching. An entity class not present in the catalog
   * (including when no catalog file exists at all) is reported
   * `unresolved`, never guessed. */
  resolve(entityClass: string): MetadataResolution {
    const map = this.ensureLoaded()
    const metadata = map.get(entityClass)
    if (!metadata) {
      return { status: 'unresolved', entityClass, reason: `No Component Metadata Catalog entry for exact entity class "${entityClass}".` }
    }
    return { status: 'resolved', entityClass, metadata, provenance: 'catalog' }
  }

  /** True once the catalog has been loaded (lazily) by a prior `resolve()` call. */
  get isLoaded(): boolean {
    return this.cache !== null
  }
}
