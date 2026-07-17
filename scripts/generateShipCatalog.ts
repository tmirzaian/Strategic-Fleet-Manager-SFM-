#!/usr/bin/env tsx
/**
 * Ship & Ground Vehicle Catalog Generator (Mission M-012 Universe
 * Provisioning).
 *
 * Discovers every player-ownable ship/ground vehicle in the frozen LIVE
 * P4K via bulk DataCore field queries (see scripts/universeCatalog/
 * dcbBulkQuery.ts) — no per-record StarBreaker spawns, no raw-data
 * fixture dependency, no hardcoded ship-name list. Writes two files:
 * generated-data/ship-catalog.json (full, gitignored, developer-only) and
 * generated-data/ship-catalog.runtime.json (RC-008: the small, committed
 * subset the browser runtime actually reads — regenerated automatically
 * here so the two never drift apart).
 *
 * Usage:
 *   npm run generate:ship-catalog
 *
 * Override the default local paths via:
 *   STARBREAKER_EXE=<path to starbreaker.exe>
 *   SC_DATA_P4K=<path to Data.p4k>
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { parseBuildManifest } from './componentCatalog/buildManifest'
import { toPortableP4kLabel } from './componentCatalog/portablePath'
import { runBulkFieldQuery } from './universeCatalog/dcbBulkQuery'
import { extractGlobalIni, loadLocalizationTable } from './universeCatalog/localization'
import { buildShipCatalog, type ShipCatalogFieldMaps } from './shipCatalog/shipCatalogBuilder'
import { writeShipCatalogFile } from './shipCatalog/shipCatalogWriter'
import { deriveRuntimeShipCatalog, writeShipCatalogRuntimeFile } from './shipCatalog/shipCatalogRuntimeWriter'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const DEFAULT_STARBREAKER_EXE = 'D:\\StarBreaker-main\\StarBreaker-main\\target\\release\\starbreaker.exe'
const DEFAULT_DATA_P4K = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k'

function requireVersion(starbreakerExePath: string): string {
  const result = spawnSync(starbreakerExePath, ['--version'], { encoding: 'utf-8' })
  if (result.error) throw new Error(`Failed to execute StarBreaker at "${starbreakerExePath}": ${result.error.message}`)
  if (result.status !== 0 || !result.stdout) throw new Error(`Could not determine StarBreaker version (exit ${result.status}).`)
  const match = /starbreaker\s+(\S+)/i.exec(result.stdout)
  if (!match) throw new Error(`Could not parse StarBreaker version output: "${result.stdout.trim()}"`)
  return match[1]
}

async function main(): Promise<void> {
  const starbreakerExe = process.env.STARBREAKER_EXE ?? DEFAULT_STARBREAKER_EXE
  const dataP4k = process.env.SC_DATA_P4K ?? DEFAULT_DATA_P4K

  if (!existsSync(starbreakerExe)) throw new Error(`StarBreaker executable not found at "${starbreakerExe}". Set STARBREAKER_EXE to override.`)
  if (!existsSync(dataP4k)) throw new Error(`Data.p4k not found at "${dataP4k}". Set SC_DATA_P4K to override.`)

  const manifestPath = join(dirname(dataP4k), 'build_manifest.id')
  if (!existsSync(manifestPath)) throw new Error(`Build manifest not found at "${manifestPath}".`)
  const manifest = parseBuildManifest(readFileSync(manifestPath, 'utf-8'))
  console.log(`Game build: branch=${manifest.branch} version=${manifest.version} p4Change=${manifest.requestedP4ChangeNum}`)

  const starbreakerVersion = requireVersion(starbreakerExe)
  console.log(`StarBreaker version: ${starbreakerVersion}`)

  console.log('\nExtracting English localization table...')
  const localizationScratchDir = join(REPO_ROOT, '.localization-cache')
  const globalIniPath = extractGlobalIni(starbreakerExe, dataP4k, localizationScratchDir)
  const localizationTable = await loadLocalizationTable(globalIniPath)
  console.log(`  loaded ${localizationTable.size} localization entries from ${globalIniPath}`)

  console.log('\nRunning bulk DataCore field queries (one process per field, all records in one pass)...')
  const fieldPaths: { key: keyof ShipCatalogFieldMaps; path: string }[] = [
    { key: 'movementClass', path: 'EntityClassDefinition.Components[VehicleComponentParams].movementClass' },
    { key: 'manufacturerCode', path: 'EntityClassDefinition.Components[VehicleComponentParams].manufacturer.Code' },
    { key: 'manufacturerLocKey', path: 'EntityClassDefinition.Components[VehicleComponentParams].manufacturer.Localization.Name' },
    { key: 'vehicleName', path: 'EntityClassDefinition.Components[VehicleComponentParams].vehicleName' },
    { key: 'vehicleCareer', path: 'EntityClassDefinition.Components[VehicleComponentParams].vehicleCareer' },
    { key: 'vehicleRole', path: 'EntityClassDefinition.Components[VehicleComponentParams].vehicleRole' },
    { key: 'crewSize', path: 'EntityClassDefinition.Components[VehicleComponentParams].crewSize' },
    { key: 'maxBoundingBoxSize', path: 'EntityClassDefinition.Components[VehicleComponentParams].maxBoundingBoxSize' },
  ]

  const fields = {} as ShipCatalogFieldMaps
  for (const { key, path } of fieldPaths) {
    const start = Date.now()
    const result = runBulkFieldQuery(starbreakerExe, dataP4k, path)
    fields[key] = result.values
    console.log(`  ${path} -> ${result.values.size} value(s) (${result.matchCount} records matched, ${Date.now() - start}ms)`)
  }

  const catalog = buildShipCatalog(fields, localizationTable, {
    tool: 'StarBreaker',
    toolVersion: starbreakerVersion,
    gameBranch: manifest.branch,
    gameVersion: manifest.version,
    p4ChangeNum: manifest.requestedP4ChangeNum,
    dataP4kPath: toPortableP4kLabel(dataP4k),
    generatedAt: new Date().toISOString(),
  })

  const outputDir = join(REPO_ROOT, 'generated-data')
  const writtenPath = writeShipCatalogFile(outputDir, catalog)

  const runtimeCatalog = deriveRuntimeShipCatalog(catalog)
  const runtimeWrittenPath = writeShipCatalogRuntimeFile(outputDir, runtimeCatalog)

  const shipCount = Object.values(catalog.records).filter((r) => r.category === 'ship').length
  const groundVehicleCount = Object.values(catalog.records).filter((r) => r.category === 'ground_vehicle').length

  console.log(`\nWrote ${writtenPath}`)
  console.log(`  total candidates:          ${catalog.totalCandidates}`)
  console.log(`  excluded (non-player):     ${catalog.excludedNonPlayerVariantCount}`)
  console.log(`  unresolved (movementClass): ${catalog.unresolved.length}`)
  console.log(`  included ships:            ${shipCount}`)
  console.log(`  included ground vehicles:  ${groundVehicleCount}`)
  console.log(`  total included:            ${Object.keys(catalog.records).length}`)
  console.log(`\nWrote ${runtimeWrittenPath} (RC-008 committed runtime subset)`)
  console.log(`  records: ${Object.keys(runtimeCatalog.records).length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
