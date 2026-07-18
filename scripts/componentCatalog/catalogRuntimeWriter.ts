import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CatalogFile, CatalogRecord } from './catalogSchema'
import {
  COMPONENT_CATALOG_RUNTIME_FILENAME,
  COMPONENT_CATALOG_RUNTIME_SCHEMA_VERSION,
  type ComponentCatalogRuntimeFile,
  type ComponentCatalogRuntimeRecord,
} from './catalogRuntimeSchema'

/**
 * RC-008 — derives the small, committed runtime catalog from the full,
 * gitignored one. A record is included only when `displayName`,
 * `category`, and `size` are all present — the exact guard
 * `src/generated/componentCatalog.ts` already applies before a record can
 * enter either of its exported maps, so a record failing this guard was
 * already unreachable at runtime; this only moves the filter earlier.
 */
export function deriveRuntimeComponentCatalog(full: CatalogFile): ComponentCatalogRuntimeFile {
  const records: Record<string, ComponentCatalogRuntimeRecord> = {}
  for (const [entityClass, record] of Object.entries(full.records)) {
    if (!record.displayName || !record.category || record.size === null) continue
    records[entityClass] = toRuntimeRecord(record)
  }
  return {
    schemaVersion: COMPONENT_CATALOG_RUNTIME_SCHEMA_VERSION,
    source: {
      gameVersion: full.source.gameVersion,
      generatedAt: full.source.generatedAt,
    },
    records,
  }
}

function toRuntimeRecord(record: CatalogRecord): ComponentCatalogRuntimeRecord {
  return {
    category: record.category!,
    subtype: record.subtype,
    size: record.size!,
    grade: record.grade,
    displayName: record.displayName!,
    manufacturerRef: record.manufacturerRef,
  }
}

/** Writes the derived runtime catalog to `<outputDir>/component-metadata-catalog.runtime.json` and nothing else. */
export function writeCatalogRuntimeFile(outputDir: string, catalog: ComponentCatalogRuntimeFile): string {
  const path = join(outputDir, COMPONENT_CATALOG_RUNTIME_FILENAME)
  writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n', 'utf-8')
  return path
}
