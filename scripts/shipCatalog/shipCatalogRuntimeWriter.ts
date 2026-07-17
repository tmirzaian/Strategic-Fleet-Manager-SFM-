import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ShipCatalogFile, ShipCatalogRecord } from './shipCatalogSchema'
import { SHIP_CATALOG_RUNTIME_FILENAME, SHIP_CATALOG_RUNTIME_SCHEMA_VERSION, type ShipCatalogRuntimeFile, type ShipCatalogRuntimeRecord } from './shipCatalogRuntimeSchema'

/**
 * RC-008 — derives the small, committed runtime catalog from the full,
 * gitignored StarBreaker-generated one. A record is included only when it
 * has a real resolved `displayName` — the exact condition
 * `src/generated/shipCatalog.ts` already applies when building
 * `shipCatalogRecords` from whichever file it loads, so this derivation
 * changes WHERE that filter happens, never what it means.
 */
export function deriveRuntimeShipCatalog(full: ShipCatalogFile): ShipCatalogRuntimeFile {
  const records: Record<string, ShipCatalogRuntimeRecord> = {}
  for (const [entityClass, record] of Object.entries(full.records)) {
    if (!record.displayName) continue
    records[entityClass] = toRuntimeRecord(record)
  }
  return {
    schemaVersion: SHIP_CATALOG_RUNTIME_SCHEMA_VERSION,
    source: {
      gameVersion: full.source.gameVersion,
      generatedAt: full.source.generatedAt,
    },
    records,
  }
}

function toRuntimeRecord(record: ShipCatalogRecord): ShipCatalogRuntimeRecord {
  return {
    entityClass: record.entityClass,
    category: record.category,
    manufacturer: record.manufacturer ? { code: record.manufacturer.code, name: record.manufacturer.name } : null,
    displayName: record.displayName!,
    careerKey: record.careerKey,
    roleKey: record.roleKey,
    careerName: record.careerName,
    roleName: record.roleName,
  }
}

/** Writes the derived runtime catalog to `<outputDir>/ship-catalog.runtime.json` and nothing else. */
export function writeShipCatalogRuntimeFile(outputDir: string, catalog: ShipCatalogRuntimeFile): string {
  const path = join(outputDir, SHIP_CATALOG_RUNTIME_FILENAME)
  writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n', 'utf-8')
  return path
}
