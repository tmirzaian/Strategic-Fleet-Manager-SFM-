#!/usr/bin/env tsx
/**
 * SW-011A — Configurable Slot Runtime Catalog Generator.
 *
 * Runs the live fleet sweep (`scripts/configurableSlots/fleetSweep.ts`,
 * shared with SW-010B's certification driver) and derives the small,
 * committed `generated-data/configurable-slots.runtime.json` — the file
 * `src/generated/configurableSlots.ts` (the browser loader) actually
 * reads. Same RC-008 posture as the component/ship runtime catalogs:
 * this IS wired into the app (unlike the certification driver, which is
 * validation-only and never feeds `src/`) — Ship Workspace's Objective 1
 * integration depends on this file existing and being current.
 *
 * Usage:
 *   npm run generate:configurable-slots-runtime-catalog
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runFleetSweep } from './configurableSlots/fleetSweep'
import { deriveConfigurableSlotsRuntimeCatalog, writeConfigurableSlotsRuntimeFile } from './configurableSlots/catalogRuntimeWriter'
import { parseBuildManifest } from './componentCatalog/buildManifest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const DEFAULT_STARBREAKER_EXE = 'D:\\StarBreaker-main\\StarBreaker-main\\target\\release\\starbreaker.exe'
const DEFAULT_DATA_P4K = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k'

async function main(): Promise<void> {
  const starbreakerExe = process.env.STARBREAKER_EXE ?? DEFAULT_STARBREAKER_EXE
  const dataP4k = process.env.SC_DATA_P4K ?? DEFAULT_DATA_P4K
  if (!existsSync(starbreakerExe)) throw new Error(`StarBreaker executable not found at "${starbreakerExe}". Set STARBREAKER_EXE to override.`)
  if (!existsSync(dataP4k)) throw new Error(`Data.p4k not found at "${dataP4k}". Set SC_DATA_P4K to override.`)

  const manifestPath = join(dirname(dataP4k), 'build_manifest.id')
  if (!existsSync(manifestPath)) throw new Error(`Build manifest not found at "${manifestPath}".`)
  const manifest = parseBuildManifest(readFileSync(manifestPath, 'utf-8'))
  console.log(`Game build: branch=${manifest.branch} version=${manifest.version}`)

  const sweep = runFleetSweep(starbreakerExe, dataP4k, REPO_ROOT, (message) => console.log(message))

  const catalog = deriveConfigurableSlotsRuntimeCatalog(sweep, manifest.version, new Date().toISOString())
  const shipCount = Object.keys(catalog.ships).length
  const slotCount = Object.values(catalog.ships).reduce((sum, records) => sum + records.length, 0)
  console.log(`\nDerived runtime catalog: ${shipCount} ships with at least one Commander-visible configurable slot, ${slotCount} slots total.`)

  const outputDir = join(REPO_ROOT, 'generated-data')
  mkdirSync(outputDir, { recursive: true })
  const path = writeConfigurableSlotsRuntimeFile(outputDir, catalog)
  console.log(`Wrote ${path}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
