import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SHIP_CATALOG_FILENAME = 'ship-catalog.json'

/** Writes the ship catalog document to `<outputDir>/ship-catalog.json` and nothing else. */
export function writeShipCatalogFile(outputDir: string, catalog: unknown): string {
  const path = join(outputDir, SHIP_CATALOG_FILENAME)
  writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n', 'utf-8')
  return path
}
