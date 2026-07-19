#!/usr/bin/env tsx
/**
 * Component Catalog Generator (Mission M-007, widened to the full
 * player-usable universe by Mission M-012, narrow-path optimized by
 * FTB-001F Part C).
 *
 * Two discovery paths feed one merged, deterministic catalog:
 *   1. Narrow path (original M-007): every entity class SFM's raw-data
 *      ship exports actually mount, resolved by exact entity-class name.
 *      Preserved so the existing Gladius/Avenger Titan certification
 *      stays green — but resolved from the SAME shared bulk field maps
 *      Path 2 already fetches (see FTB-001F Part C note below), not from
 *      5,642 individual `dcb query` process spawns.
 *   2. Full-universe bulk path (M-012): every entity class in the whole
 *      LIVE P4K with an `AttachDef.Type` in the reviewed player-usable
 *      category allowlist (scripts/componentCatalog/componentTaxonomy.ts),
 *      discovered via bulk DataCore field queries — no per-record spawns,
 *      no raw-data dependency. See scripts/universeCatalog/dcbBulkQuery.ts.
 *
 * FTB-001F Part C (Chief Architect directive): the narrow path originally
 * called `runDcbQuery` once per raw-data-fixture entity class (5,642
 * sequential StarBreaker process spawns, each re-opening/re-indexing the
 * 151 GB Data.p4k archive from scratch — observed to take multiple hours
 * end to end). Path 2's bulk field queries already resolve the exact same
 * underlying DataCore fields (`AttachDef.Type`/`SubType`/`Size`/`Grade`/
 * `Manufacturer.*`/`Localization.Name`) for the ENTIRE ~25,544-entity
 * universe in ~7 process spawns total (a few seconds each, confirmed
 * empirically). The narrow path now runs the bulk queries first, then
 * resolves its own 5,642 known entity-class names via `Map.get` against
 * those SAME in-memory results
 * (`scripts/componentCatalog/bulkComponentCollector.ts`'s
 * `buildRecordFromBulkFields`, shared with Path 2 so both paths always
 * agree on one record for a given entity, never two independently
 * maintained extraction rules) — zero additional StarBreaker spawns, no
 * raw-data-fixture-specific query left at all. `recordId` (previously
 * populated by the per-entity dump's own `_RecordId_` GUID) is no longer
 * set for narrow-path entities, exactly like Path 2's bulk-discovered
 * ones — schemaVersion 2 already documents `recordId` as optional for
 * this reason, and no consumer reads it (componentMetadataResolver.ts
 * defaults a missing value to `''`; `provenance.recordPath` was already
 * documented as internal-to-the-catalog-file, unread by any consumer).
 *
 * Writes generated-data/component-metadata-catalog.json (full, gitignored,
 * developer-only) and generated-data/component-metadata-catalog.runtime.json
 * (RC-008: the small, committed subset the browser runtime actually reads
 * — regenerated automatically here so the two never drift apart). This
 * tool is intentionally isolated from src/normalizer (no coupling to
 * ShipNormalizer/loadoutNodeAdapter behavior) and never writes/reads any
 * other generated-data file.
 *
 * Usage:
 *   npm run generate:component-catalog
 *
 * Override the default local paths (set for this machine's install) via:
 *   STARBREAKER_EXE=<path to starbreaker.exe>
 *   SC_DATA_P4K=<path to Data.p4k>
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { collectEntityClasses } from './componentCatalog/rawEntityCollector'
import { stripTrailingCommas } from '../src/engine/importer/trailingCommaJson'
import { parseBuildManifest } from './componentCatalog/buildManifest'
import { buildCatalogDocument } from './componentCatalog/buildCatalog'
import { toPortableP4kLabel } from './componentCatalog/portablePath'
import { writeCatalogFile } from './componentCatalog/catalogWriter'
import { deriveRuntimeComponentCatalog, writeCatalogRuntimeFile } from './componentCatalog/catalogRuntimeWriter'
import { collectBulkComponents, buildRecordFromBulkFields, type ComponentFieldMaps } from './componentCatalog/bulkComponentCollector'
import { runBulkFieldQuery } from './universeCatalog/dcbBulkQuery'
import { extractGlobalIni, loadLocalizationTable } from './universeCatalog/localization'
import type { CatalogRecord, UnresolvedEntry } from './componentCatalog/catalogSchema'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const DEFAULT_STARBREAKER_EXE = 'D:\\StarBreaker-main\\StarBreaker-main\\target\\release\\starbreaker.exe'
const DEFAULT_DATA_P4K = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k'

function requireVersion(starbreakerExePath: string): string {
  const result = spawnSync(starbreakerExePath, ['--version'], { encoding: 'utf-8' })
  if (result.error) {
    throw new Error(`Failed to execute StarBreaker at "${starbreakerExePath}": ${result.error.message}`)
  }
  if (result.status !== 0 || !result.stdout) {
    throw new Error(`Could not determine StarBreaker version ("${starbreakerExePath} --version" exited ${result.status}).`)
  }
  const match = /starbreaker\s+(\S+)/i.exec(result.stdout)
  if (!match) {
    throw new Error(`Could not parse StarBreaker version output: "${result.stdout.trim()}"`)
  }
  return match[1]
}

async function main(): Promise<void> {
  const starbreakerExe = process.env.STARBREAKER_EXE ?? DEFAULT_STARBREAKER_EXE
  const dataP4k = process.env.SC_DATA_P4K ?? DEFAULT_DATA_P4K

  if (!existsSync(starbreakerExe)) {
    throw new Error(`StarBreaker executable not found at "${starbreakerExe}". Set STARBREAKER_EXE to override.`)
  }
  if (!existsSync(dataP4k)) {
    throw new Error(`Data.p4k not found at "${dataP4k}". Set SC_DATA_P4K to override.`)
  }

  const manifestPath = join(dirname(dataP4k), 'build_manifest.id')
  if (!existsSync(manifestPath)) {
    throw new Error(`Build manifest not found at "${manifestPath}" — cannot verify the installed game build.`)
  }
  const manifest = parseBuildManifest(readFileSync(manifestPath, 'utf-8'))
  console.log(`Game build: branch=${manifest.branch} version=${manifest.version} p4Change=${manifest.requestedP4ChangeNum}`)

  const starbreakerVersion = requireVersion(starbreakerExe)
  console.log(`StarBreaker version: ${starbreakerVersion}`)

  const rawDataDir = join(REPO_ROOT, 'raw-data')
  const rawFiles = readdirSync(rawDataDir).filter((f) => f.toLowerCase().endsWith('.json'))
  if (rawFiles.length === 0) {
    throw new Error(`No raw-data/*.json files found under "${rawDataDir}".`)
  }

  const allEntities = new Set<string>()
  const collectionWarnings: string[] = []
  for (const file of rawFiles) {
    const fullPath = join(rawDataDir, file)
    let doc: unknown
    const text = readFileSync(fullPath, 'utf-8')
    try {
      doc = JSON.parse(text)
    } catch (strictErr) {
      // Some StarBreaker `--dump-hierarchy` builds emit a trailing comma
      // after the last element of every array/object — JSON5-legal, but
      // not strict JSON (see src/engine/importer/starBreakerImporter.ts,
      // which already tolerates this same quirk for the main import path).
      try {
        doc = JSON.parse(stripTrailingCommas(text))
      } catch {
        throw new Error(`Failed to parse raw-data file "${file}": ${(strictErr as Error).message}`)
      }
    }
    const { entities, warnings } = collectEntityClasses(doc, file)
    for (const e of entities) allEntities.add(e)
    collectionWarnings.push(...warnings)
  }

  console.log(`Collected ${allEntities.size} distinct entity class(es) from ${rawFiles.length} raw-data file(s).`)
  for (const w of collectionWarnings) console.warn(`  [warn] ${w}`)

  console.log('\nExtracting English localization table...')
  const localizationScratchDir = join(REPO_ROOT, '.localization-cache')
  const globalIniPath = extractGlobalIni(starbreakerExe, dataP4k, localizationScratchDir)
  const localizationTable = await loadLocalizationTable(globalIniPath)
  console.log(`  loaded ${localizationTable.size} localization entries from ${globalIniPath}`)

  // Path 2 (M-012) runs FIRST now (FTB-001F Part C): the narrow path below
  // resolves its own entity classes from these SAME in-memory bulk field
  // maps, so both paths must share one set of already-fetched results
  // rather than each fetching (or, previously, spawning per-entity) their
  // own. See scripts/componentCatalog/bulkComponentCollector.ts and
  // scripts/universeCatalog/dcbBulkQuery.ts.
  console.log('\nRunning bulk DataCore field queries for the full component universe...')
  const fieldPaths: { key: keyof ComponentFieldMaps; path: string }[] = [
    { key: 'type', path: 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Type' },
    { key: 'subType', path: 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.SubType' },
    { key: 'size', path: 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Size' },
    { key: 'grade', path: 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Grade' },
    { key: 'manufacturerCode', path: 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Manufacturer.Code' },
    { key: 'manufacturerLocKey', path: 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Manufacturer.Localization.Name' },
    { key: 'localizationName', path: 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Localization.Name' },
  ]
  const bulkFields = {} as ComponentFieldMaps
  for (const { key, path } of fieldPaths) {
    const start = Date.now()
    const result = runBulkFieldQuery(starbreakerExe, dataP4k, path)
    bulkFields[key] = result.values
    console.log(`  ${path} -> ${result.values.size} value(s) (${result.matchCount} records matched, ${Date.now() - start}ms)`)
  }
  const bulkResult = collectBulkComponents(bulkFields, localizationTable)
  console.log(`  ${bulkResult.records.size} player-usable component(s) discovered across the full universe.`)

  // Path 1 (M-007, FTB-001F Part C): narrow, raw-data-fixture-scoped
  // resolution — every entity class SFM's raw-data ship exports actually
  // mount, looked up (never re-queried) against the bulk field maps just
  // fetched above. No StarBreaker spawn per entity, no raw-data-specific
  // query at all — `buildRecordFromBulkFields` is the exact same
  // extraction function Path 2 uses, so a shared entity resolves
  // identically either way.
  const narrowRecords = new Map<string, CatalogRecord>()
  const unresolved: UnresolvedEntry[] = []

  const sortedEntities = Array.from(allEntities).sort((a, b) => a.localeCompare(b))
  for (const entityClass of sortedEntities) {
    const record = buildRecordFromBulkFields(entityClass, bulkFields, localizationTable)
    if (!record) {
      unresolved.push({ entityClass, reason: `No AttachDef.Type resolved via bulk DataCore field extraction for entity class "${entityClass}".` })
      continue
    }
    narrowRecords.set(entityClass, record)
  }

  // Merge: bulk-discovered (player-usable-only) records fill in the full
  // universe; wherever the narrow path also resolved the same exact
  // entity class — including categories outside the player-usable
  // allowlist, e.g. seats/thrusters a raw-data ship export mounts — its
  // record wins, since it's the more specific, explicitly-requested set.
  const records = new Map<string, CatalogRecord>(bulkResult.records)
  for (const [entityClass, record] of narrowRecords) {
    records.set(entityClass, record)
  }

  const catalog = buildCatalogDocument({
    source: {
      tool: 'StarBreaker',
      toolVersion: starbreakerVersion,
      gameBranch: manifest.branch,
      gameVersion: manifest.version,
      p4ChangeNum: manifest.requestedP4ChangeNum,
      dataP4kPath: toPortableP4kLabel(dataP4k),
      generatedAt: new Date().toISOString(),
    },
    records,
    unresolved,
  })

  const outputDir = join(REPO_ROOT, 'generated-data')
  const writtenPath = writeCatalogFile(outputDir, catalog)

  const runtimeCatalog = deriveRuntimeComponentCatalog(catalog)
  const runtimeWrittenPath = writeCatalogRuntimeFile(outputDir, runtimeCatalog)

  console.log(`\nWrote ${writtenPath}`)
  console.log(`  narrow-path resolved: ${narrowRecords.size}`)
  console.log(`  bulk-path resolved:   ${bulkResult.records.size}`)
  console.log(`  total (merged):       ${records.size}`)
  console.log(`  unresolved (narrow):  ${unresolved.length}`)
  if (unresolved.length > 0) {
    for (const u of unresolved) console.log(`    - ${u.entityClass}: ${u.reason}`)
  }
  console.log(`\nWrote ${runtimeWrittenPath} (RC-008 committed runtime subset)`)
  console.log(`  records: ${Object.keys(runtimeCatalog.records).length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
