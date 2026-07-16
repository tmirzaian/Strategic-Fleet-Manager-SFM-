#!/usr/bin/env vite-node
/**
 * Operation Golden Fleet — GF-002B CLI entry point.
 *
 * Must be run via `vite-node` (see manifest.ts's own header for why plain
 * `tsx`/Node cannot import `selectableShipDefinitions`). Never writes
 * into `raw-data/` or `generated-data/` — only into `--staging`.
 *
 * Usage:
 *   npx vite-node scripts/goldenFleet/acquire.ts -- --dry-run
 *   npx vite-node scripts/goldenFleet/acquire.ts -- --limit 3
 *   npx vite-node scripts/goldenFleet/acquire.ts
 *
 * Flags:
 *   --dry-run              print the planned commands, invoke nothing
 *   --staging <dir>        staging output directory (default: staging-data/golden-fleet)
 *   --starbreaker <path>   StarBreaker executable path
 *   --p4k <path>           Data.p4k path
 *   --timeout <ms>         per-hull timeout in milliseconds (default 60000)
 *   --retries <n>          retry attempts after the first failure (default 1)
 *   --force                ignore overwrite protection and resume state
 *   --limit <n>            process at most n pending hulls this run
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { runAcquisition, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY_COUNT, type AcquisitionConfig } from './acquisitionRunner'
import { realSpawn } from './realSpawn'
import { buildReport } from './report'
import { buildManifest } from './manifest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..', '..')

const DEFAULT_STARBREAKER_EXE = 'D:\\StarBreaker-main\\StarBreaker-main\\target\\release\\starbreaker.exe'
const DEFAULT_DATA_P4K = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k'
const DEFAULT_STAGING = join(REPO_ROOT, 'staging-data', 'golden-fleet')

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}
function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function starbreakerVersion(exe: string): string {
  const result = spawnSync(exe, ['--version'], { encoding: 'utf-8' })
  const match = /starbreaker\s+(\S+)/i.exec(result.stdout ?? '')
  return match ? match[1] : 'unknown'
}

function readBuildManifest(p4kPath: string): { branch: string; version: string; p4ChangeNum: string } {
  const manifestPath = join(dirname(p4kPath), 'build_manifest.id')
  if (!existsSync(manifestPath)) return { branch: 'unknown', version: 'unknown', p4ChangeNum: 'unknown' }
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  return { branch: parsed.Data?.Branch ?? 'unknown', version: parsed.Data?.Version ?? 'unknown', p4ChangeNum: parsed.Data?.RequestedP4ChangeNum ?? 'unknown' }
}

async function main() {
  const starbreakerPath = argValue('--starbreaker') ?? process.env.STARBREAKER_EXE ?? DEFAULT_STARBREAKER_EXE
  const p4kPath = argValue('--p4k') ?? process.env.SC_DATA_P4K ?? DEFAULT_DATA_P4K
  const stagingDir = argValue('--staging') ?? DEFAULT_STAGING
  const quarantineDir = join(stagingDir, 'quarantine')
  const dryRun = hasFlag('--dry-run')
  const force = hasFlag('--force')
  const timeoutStr = argValue('--timeout')
  const retriesStr = argValue('--retries')
  const limitStr = argValue('--limit')

  if (!dryRun && !existsSync(starbreakerPath)) throw new Error(`StarBreaker executable not found at "${starbreakerPath}". Pass --starbreaker or set STARBREAKER_EXE.`)
  if (!dryRun && !existsSync(p4kPath)) throw new Error(`Data.p4k not found at "${p4kPath}". Pass --p4k or set SC_DATA_P4K.`)

  const config: AcquisitionConfig = {
    starbreakerPath,
    p4kPath,
    stagingDir,
    quarantineDir,
    perHullTimeoutMs: timeoutStr ? Number(timeoutStr) : DEFAULT_TIMEOUT_MS,
    retryCount: retriesStr ? Number(retriesStr) : DEFAULT_RETRY_COUNT,
    force,
    dryRun,
    spawn: realSpawn,
    limit: limitStr ? Number(limitStr) : undefined,
  }

  console.log(`Golden Fleet GF-002B acquisition ${dryRun ? '(DRY RUN)' : ''}`)
  console.log(`  StarBreaker: ${starbreakerPath}`)
  console.log(`  Data.p4k:    ${p4kPath}`)
  console.log(`  Staging:     ${stagingDir}`)
  console.log(`  Manifest count: ${buildManifest().length}`)

  const { records, statusCounts, totalRuntimeMs } = await runAcquisition(config)

  console.log('Status counts:', JSON.stringify(statusCounts, null, 2))
  console.log(`Total runtime: ${(totalRuntimeMs / 1000).toFixed(1)}s`)

  if (dryRun) {
    console.log('Dry run complete — no StarBreaker process was invoked, no files written.')
    return
  }

  const report = buildReport({
    records,
    statusCounts,
    totalRuntimeMs,
    stagingDir,
    p4k: { path: p4kPath, ...readBuildManifest(p4kPath) },
    starbreaker: { path: starbreakerPath, version: starbreakerVersion(starbreakerPath), sha256: sha256File(starbreakerPath) },
  })

  mkdirSync(stagingDir, { recursive: true })
  const reportPath = join(stagingDir, 'acquisition-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`Report written to ${reportPath}`)

  const hardFailureStatuses: Array<keyof typeof statusCounts> = ['EXPORT_FAILED', 'MALFORMED_OUTPUT', 'IDENTITY_MISMATCH', 'IMPORTER_REJECTED', 'OTHER']
  const hardFailures = hardFailureStatuses.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0)
  if (hardFailures > 0) {
    console.error(`${hardFailures} hull(s) hit an unexpected failure state — see the report for details.`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
