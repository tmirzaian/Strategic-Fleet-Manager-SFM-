import { CATALOG_SCHEMA_VERSION, GENERATOR_NAME, GENERATOR_VERSION } from './catalogSchema'
import type { CatalogFile, CatalogRecord, CatalogSource, UnresolvedEntry } from './catalogSchema'

/**
 * Defensive duplicate-key guard. The entity collector already deduplicates
 * via a `Set`, so this should never trigger in normal operation — it
 * exists so a future caller that skips the collector's dedup step (or a
 * bug in it) fails loudly instead of silently overwriting a record.
 */
export function addRecordOrThrow(records: Map<string, CatalogRecord>, key: string, value: CatalogRecord): void {
  if (records.has(key)) {
    throw new Error(`Duplicate exact entity key "${key}" — a component catalog record already exists for this key.`)
  }
  records.set(key, value)
}

export interface BuildCatalogDocumentInput {
  source: CatalogSource
  records: Map<string, CatalogRecord> | Record<string, CatalogRecord>
  unresolved: UnresolvedEntry[]
}

/**
 * Assembles the final catalog document with deterministic ordering:
 * `records` keys and `unresolved` entries are both sorted alphabetically
 * by entity class, regardless of insertion order, so re-running the
 * generator against the same DataCore state always produces byte-identical
 * output (aside from `generatedAt`).
 */
export function buildCatalogDocument(input: BuildCatalogDocumentInput): CatalogFile {
  const entries = input.records instanceof Map ? Array.from(input.records.entries()) : Object.entries(input.records)
  entries.sort(([a], [b]) => a.localeCompare(b))

  const records: Record<string, CatalogRecord> = {}
  for (const [key, value] of entries) records[key] = value

  const unresolved = [...input.unresolved].sort((a, b) => a.entityClass.localeCompare(b.entityClass))

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    source: input.source,
    records,
    unresolved,
  }
}
