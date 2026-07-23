#!/usr/bin/env tsx
/**
 * SW-010B — Configurable Topology Certification.
 *
 * Runs the SW-010A Configurable Slot Adapter pipeline
 * (`scripts/configurableSlots/`) across every ship in `raw-data/` — the
 * repo's real, deep-imported "currently supported fleet" set (confirmed
 * during SW-010B investigation: `npm run import:ships` consumes every
 * `raw-data/*.json` file and produces exactly that many `generated-data/ships.json`
 * entries — 257 at the time of this sprint — so this IS the importer's
 * actual supported-ship universe, not a hand-picked sample).
 *
 * This is a certification tool, not runtime app code and not wired into
 * any `npm run generate:*` pipeline that feeds the app. It exists to
 * answer one question: does the generalized swap-group/merge architecture
 * actually scale across the whole fleet without any ship-specific code
 * path, or does it only work for the 5 hand-verified SW-010A vessels? The
 * live fleet sweep itself lives in `scripts/configurableSlots/fleetSweep.ts`,
 * shared with SW-011A's runtime-catalog generator so the ~25-minute sweep
 * only ever needs to run once per invocation, not once per consumer.
 *
 * Usage:
 *   npm run certify:configurable-slots
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runFleetSweep } from './configurableSlots/fleetSweep'

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

  const sweep = runFleetSweep(starbreakerExe, dataP4k, REPO_ROOT, (message) => console.log(message))

  const rows = sweep.ships.flatMap((s) => s.rows)

  // Objective 3 — Coverage Metrics
  const resolvedRows = rows.filter((r) => r.confidence !== 'unresolved')
  const shipsWithConfigurableTopology = new Set(resolvedRows.map((r) => r.hull)).size
  const uniqueSwapGroups = new Set(resolvedRows.map((r) => r.swapGroupId).filter((id): id is string => id !== null))
  const avgEligible = resolvedRows.length > 0 ? resolvedRows.reduce((sum, r) => sum + r.eligibleComponentCount, 0) / resolvedRows.length : 0
  const unresolvedReferenceCount = sweep.ships.reduce((sum, s) => sum + s.topology.configurableSlots.filter((slot) => slot.confidence === 'unresolved' && slot.diagnostics.some((d) => d.code === 'swap-group-unresolved-reference')).length, 0)
  const duplicateGroupDiagnostics = sweep.ships.reduce((sum, s) => sum + s.topology.diagnostics.filter((d) => d.code === 'configuration-duplicate-port-name').length, 0)
  const confidenceDistribution: Record<string, number> = {}
  for (const r of rows) confidenceDistribution[r.confidence] = (confidenceDistribution[r.confidence] ?? 0) + 1

  const categoryDistribution: Record<string, number> = {}
  for (const r of resolvedRows) {
    const key = r.category ?? '(unclassified)'
    categoryDistribution[key] = (categoryDistribution[key] ?? 0) + 1
  }

  const coverageMetrics = {
    totalShipsAnalyzed: sweep.totalShips,
    shipsWithNoLiveRecord: sweep.shipsWithNoLiveRecord.length,
    shipsWithConfigurableTopology,
    totalConfigurableSlots: rows.length,
    resolvedConfigurableSlots: resolvedRows.length,
    uniqueSwapGroups: uniqueSwapGroups.size,
    averageEligibleComponentsPerResolvedGroup: Number(avgEligible.toFixed(2)),
    unresolvedReferences: unresolvedReferenceCount,
    duplicateGroupIdentifiersDetected: duplicateGroupDiagnostics,
    confidenceDistribution,
    categoryDistribution,
  }

  console.log('\n=== Coverage Metrics ===')
  console.log(JSON.stringify(coverageMetrics, null, 2))

  const outputDir = join(REPO_ROOT, 'generated-data')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'configurable-slot-certification.json'), JSON.stringify({ coverageMetrics, shipsWithNoLiveRecord: sweep.shipsWithNoLiveRecord, rows }, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${join(outputDir, 'configurable-slot-certification.json')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
