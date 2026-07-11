#!/usr/bin/env tsx
/**
 * Standalone Component Catalog Generator (Mission M-007).
 *
 * Reads authoritative component metadata for every entity class SFM's
 * raw-data ship exports actually mount, by querying the installed
 * StarBreaker executable against a local Star Citizen `Data.p4k`. Writes
 * exactly one file: generated-data/component-metadata-catalog.json.
 *
 * This tool is intentionally isolated:
 *   - it does not import from src/normalizer (no coupling to
 *     ShipNormalizer/loadoutNodeAdapter behavior);
 *   - it does not write, read, or modify any other generated-data file;
 *   - nothing in src/ imports from this catalog yet — a future
 *     ComponentMetadataResolver is separate, unbuilt work.
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
import { parseBuildManifest } from './componentCatalog/buildManifest'
import { runDcbQuery, parseDcbQueryResult, extractItemDefinitionFields } from './componentCatalog/dcbQuery'
import { addRecordOrThrow, buildCatalogDocument } from './componentCatalog/buildCatalog'
import { toPortableP4kLabel } from './componentCatalog/portablePath'
import { writeCatalogFile } from './componentCatalog/catalogWriter'
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

function main(): void {
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
    try {
      doc = JSON.parse(readFileSync(fullPath, 'utf-8'))
    } catch (err) {
      throw new Error(`Failed to parse raw-data file "${file}": ${(err as Error).message}`)
    }
    const { entities, warnings } = collectEntityClasses(doc, file)
    for (const e of entities) allEntities.add(e)
    collectionWarnings.push(...warnings)
  }

  console.log(`Collected ${allEntities.size} distinct entity class(es) from ${rawFiles.length} raw-data file(s).`)
  for (const w of collectionWarnings) console.warn(`  [warn] ${w}`)

  const records = new Map<string, CatalogRecord>()
  const unresolved: UnresolvedEntry[] = []

  const sortedEntities = Array.from(allEntities).sort((a, b) => a.localeCompare(b))
  for (const entityClass of sortedEntities) {
    const processResult = runDcbQuery(starbreakerExe, dataP4k, entityClass)
    const outcome = parseDcbQueryResult(entityClass, processResult)

    if (outcome.kind === 'not-found') {
      unresolved.push({ entityClass, reason: outcome.reason })
      continue
    }

    const fields = extractItemDefinitionFields(outcome.record)
    addRecordOrThrow(records, entityClass, {
      entityClass,
      recordName: outcome.record._RecordName_,
      recordId: outcome.record._RecordId_,
      ...fields,
      displayName: null,
      provenance: {
        source: 'starbreaker-datacore',
        recordPath: typeof outcome.record._RecordTag_ === 'string' ? outcome.record._RecordTag_ : null,
      },
    })
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

  console.log(`\nWrote ${writtenPath}`)
  console.log(`  resolved:   ${records.size}`)
  console.log(`  unresolved: ${unresolved.length}`)
  if (unresolved.length > 0) {
    for (const u of unresolved) console.log(`    - ${u.entityClass}: ${u.reason}`)
  }
}

main()
