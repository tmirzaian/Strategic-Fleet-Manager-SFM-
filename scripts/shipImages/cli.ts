#!/usr/bin/env vite-node
/**
 * EWO-038 (Task 6/7) — Commander RSI Ship Image Registry import/maintenance
 * CLI. Must be run via `vite-node` (see canonicalHulls.ts's own header for
 * why plain `tsx`/`node` cannot import `selectableShipDefinitions`).
 *
 * Usage:
 *   npx vite-node scripts/shipImages/cli.ts -- import-xlsx [--dry-run]
 *   npx vite-node scripts/shipImages/cli.ts -- generate [--dry-run]
 *   npx vite-node scripts/shipImages/cli.ts -- check
 *
 * import-xlsx  — reads the Commander workbook + canonical hull list,
 *                writes/updates data-maintenance/ship-images/ship-image-master.csv
 *                (preserving any already-entered rsi_image_url values) and
 *                the coverage report JSON. Never touches the runtime
 *                registry.
 * generate     — reads the maintenance CSV (as the Commander last saved it)
 *                and regenerates src/data/shipImageRegistry.ts + the
 *                coverage report's registry diff. Never re-reads the xlsx
 *                workbook.
 * check        — validates + matches + diffs everything and prints a
 *                report; never writes any file. Exits non-zero on unsafe
 *                ambiguity or malformed input.
 * --dry-run    — (import-xlsx/generate) prints what would be written
 *                without writing it.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readXlsxFirstSheet } from './xlsxReader'
import { getCanonicalHullRows, getAllDefinitionRowsForAliasLookup } from './canonicalHulls'
import { buildMaintenanceCsvRows, buildRegistryEntries } from './pipeline'
import { toCsv, parseCsvWithHeader } from './csv'
import { MAINTENANCE_CSV_HEADER } from './types'
import type { MaintenanceCsvRow, CoverageStatus, MaintenanceMatchMethod, WorkbookRow } from './types'
import { generateRegistryFileContent } from './registryGenerator'
import { buildCoverageReport } from './reportBuilder'
import { DUPLICATE_CANONICAL_PAIRS } from './duplicateCanonicalPairs'
import { SHIP_IMAGE_URLS } from '../../src/data/shipImageRegistry'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const WORKBOOK_PATH = join(REPO_ROOT, 'data-maintenance', 'ship-images', 'Commander RSI URL Master.xlsx')
const CSV_PATH = join(REPO_ROOT, 'data-maintenance', 'ship-images', 'ship-image-master.csv')
const REPORT_PATH = join(REPO_ROOT, 'data-maintenance', 'ship-images', 'ship-image-import-report.json')
const REGISTRY_PATH = join(REPO_ROOT, 'src', 'data', 'shipImageRegistry.ts')

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function readWorkbookRows(): WorkbookRow[] {
  if (!existsSync(WORKBOOK_PATH)) {
    throw new Error(`Commander workbook not found at "${WORKBOOK_PATH}". Place it there before running import-xlsx.`)
  }
  const buf = readFileSync(WORKBOOK_PATH)
  const { rows, rowNumbers } = readXlsxFirstSheet(buf)
  return rows.map((cells, i) => ({ rowNumber: rowNumbers[i], name: cells[0] ?? '', url: cells[1] ?? '' }))
}

function readExistingCsv(): { rows: MaintenanceCsvRow[]; urlByCanonicalId: Map<string, string> } {
  if (!existsSync(CSV_PATH)) return { rows: [], urlByCanonicalId: new Map() }
  const parsed = parseCsvWithHeader(readFileSync(CSV_PATH, 'utf8'))
  const rows: MaintenanceCsvRow[] = parsed.map((r) => ({
    manufacturer: r.manufacturer ?? '',
    ship_name: r.ship_name ?? '',
    canonical_id: r.canonical_id ?? '',
    source_entity_class: r.source_entity_class ?? '',
    rsi_image_url: r.rsi_image_url ?? '',
    coverage_status: (r.coverage_status as CoverageStatus) || 'FALLBACK',
    match_method: (r.match_method as MaintenanceMatchMethod) || 'UNMATCHED',
    notes: r.notes ?? '',
  }))
  return { rows, urlByCanonicalId: new Map(rows.map((r) => [r.canonical_id, r.rsi_image_url])) }
}

function csvRowsToText(rows: MaintenanceCsvRow[]): string {
  return toCsv(
    [...MAINTENANCE_CSV_HEADER],
    rows.map((r) => [r.manufacturer, r.ship_name, r.canonical_id, r.source_entity_class, r.rsi_image_url, r.coverage_status, r.match_method, r.notes])
  )
}

function ensureDataMaintenanceDir() {
  mkdirSync(dirname(CSV_PATH), { recursive: true })
}

function runImportXlsx(dryRun: boolean) {
  const workbookRows = readWorkbookRows()
  const canonicalHulls = getCanonicalHullRows()
  const aliasLookupRows = getAllDefinitionRowsForAliasLookup()
  const { urlByCanonicalId: existingUrls } = readExistingCsv()

  const csvResult = buildMaintenanceCsvRows(workbookRows, canonicalHulls, aliasLookupRows, existingUrls)

  console.log(`EWO-038 ship-images:import:xlsx ${dryRun ? '(DRY RUN)' : ''}`)
  console.log(`  Workbook rows:        ${workbookRows.length}`)
  console.log(`  Canonical hulls:      ${canonicalHulls.length}`)
  console.log(`  Exact-name matches:   ${csvResult.matchCounts.EXACT_NAME}`)
  console.log(`  Normalized matches:   ${csvResult.matchCounts.NORMALIZED_NAME}`)
  console.log(`  Alias matches:        ${csvResult.matchCounts.EXISTING_ALIAS}`)
  console.log(`  Ambiguous rows:       ${csvResult.matchCounts.AMBIGUOUS}`)
  console.log(`  Unmatched rows:       ${csvResult.matchCounts.UNMATCHED}`)
  console.log(`  Duplicate names:      ${csvResult.duplicateWorkbookNames.length}`)
  console.log(`  Duplicate URLs:       ${csvResult.duplicateWorkbookUrls.length}`)
  if (csvResult.orphanCanonicalIdsInExistingCsv.length > 0) {
    console.log(`  Orphan CSV ids (no longer a canonical hull): ${csvResult.orphanCanonicalIdsInExistingCsv.join(', ')}`)
  }

  if (dryRun) {
    console.log('Dry run complete — no files written.')
    return 0
  }

  ensureDataMaintenanceDir()
  writeFileSync(CSV_PATH, csvRowsToText(csvResult.rows), 'utf8')
  console.log(`Wrote ${CSV_PATH}`)

  const registryResult = buildRegistryEntries(csvResult.rows, SHIP_IMAGE_URLS)
  const report = buildCoverageReport({
    workbookRowCount: workbookRows.length,
    canonicalHulls,
    csvResult,
    csvRows: csvResult.rows,
    registryResult,
    existingRegistry: SHIP_IMAGE_URLS,
    duplicateCanonicalPairs: DUPLICATE_CANONICAL_PAIRS,
  })
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
  console.log(`Wrote ${REPORT_PATH}`)
  console.log(`Image coverage: ${report.imageCoveragePercentage}%`)

  const malformedCount = csvResult.issues.filter((i) => i.reason === 'MALFORMED_URL').length
  return malformedCount > 0 ? 1 : 0
}

function runGenerate(dryRun: boolean) {
  const { rows: csvRows } = readExistingCsv()
  if (csvRows.length === 0) {
    console.error(`No maintenance CSV found at "${CSV_PATH}" — run ship-images:import:xlsx first.`)
    return 1
  }
  const canonicalHulls = getCanonicalHullRows()
  const canonicalIds = new Set(canonicalHulls.map((h) => h.canonicalId))
  const orphanRows = csvRows.filter((r) => !canonicalIds.has(r.canonical_id))

  const registryResult = buildRegistryEntries(csvRows, SHIP_IMAGE_URLS)

  console.log(`EWO-038 ship-images:generate ${dryRun ? '(DRY RUN)' : ''}`)
  console.log(`  CSV rows:                ${csvRows.length}`)
  console.log(`  Generated registry keys: ${registryResult.entries.length}`)
  console.log(`  Retained:                ${registryResult.diff.retained.length}`)
  console.log(`  Replaced:                ${registryResult.diff.replaced.length}`)
  console.log(`  Added:                   ${registryResult.diff.added.length}`)
  console.log(`  Removed:                 ${registryResult.diff.removed.length}`)
  if (registryResult.skippedReviewRequired.length > 0) console.log(`  Skipped (REVIEW_REQUIRED): ${registryResult.skippedReviewRequired.join(', ')}`)
  if (registryResult.duplicateRegistryKeys.length > 0) console.error(`  UNSAFE: duplicate registry keys: ${registryResult.duplicateRegistryKeys.join(', ')}`)
  if (orphanRows.length > 0) console.log(`  Orphan CSV rows (no longer a canonical hull): ${orphanRows.map((r) => r.canonical_id).join(', ')}`)

  if (registryResult.duplicateRegistryKeys.length > 0) return 1

  if (dryRun) {
    console.log('Dry run complete — no files written.')
    return 0
  }

  writeFileSync(REGISTRY_PATH, generateRegistryFileContent(registryResult.entries), 'utf8')
  console.log(`Wrote ${REGISTRY_PATH}`)
  return 0
}

function runCheck() {
  const workbookRows = readWorkbookRows()
  const canonicalHulls = getCanonicalHullRows()
  const aliasLookupRows = getAllDefinitionRowsForAliasLookup()
  const { rows: existingCsvRows, urlByCanonicalId: existingUrls } = readExistingCsv()

  const csvResult = buildMaintenanceCsvRows(workbookRows, canonicalHulls, aliasLookupRows, existingUrls)
  const rowsForRegistry = existingCsvRows.length > 0 ? existingCsvRows : csvResult.rows
  const registryResult = buildRegistryEntries(rowsForRegistry, SHIP_IMAGE_URLS)
  const report = buildCoverageReport({
    workbookRowCount: workbookRows.length,
    canonicalHulls,
    csvResult,
    csvRows: rowsForRegistry,
    registryResult,
    existingRegistry: SHIP_IMAGE_URLS,
    duplicateCanonicalPairs: DUPLICATE_CANONICAL_PAIRS,
  })

  console.log('EWO-038 ship-images:check')
  console.log(JSON.stringify(report, null, 2))

  const malformedCount = csvResult.issues.filter((i) => i.reason === 'MALFORMED_URL').length
  const unsafe = malformedCount > 0 || registryResult.duplicateRegistryKeys.length > 0
  return unsafe ? 1 : 0
}

function main(): number {
  const mode = process.argv[2]
  const dryRun = hasFlag('--dry-run')
  if (mode === 'import-xlsx') return runImportXlsx(dryRun)
  if (mode === 'generate') return runGenerate(dryRun)
  if (mode === 'check') return runCheck()
  console.error('Usage: vite-node scripts/shipImages/cli.ts -- <import-xlsx|generate|check> [--dry-run]')
  return 1
}

process.exitCode = main()
