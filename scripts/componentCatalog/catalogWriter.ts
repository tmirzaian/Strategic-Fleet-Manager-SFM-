import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The one and only file this generator writes. */
export const CATALOG_FILENAME = 'component-metadata-catalog.json'

/** Writes the catalog document to `<outputDir>/component-metadata-catalog.json`
 * and nothing else — isolated into its own function so it's easy to prove
 * (see the "no mutation of existing generated-data files" test) that the
 * generator never touches ships.json/ports.json/components.json/etc. */
export function writeCatalogFile(outputDir: string, catalog: unknown): string {
  const path = join(outputDir, CATALOG_FILENAME)
  writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n', 'utf-8')
  return path
}
