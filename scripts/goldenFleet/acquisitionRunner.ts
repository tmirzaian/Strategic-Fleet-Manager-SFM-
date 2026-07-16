/**
 * Operation Golden Fleet — GF-002B (Tasks 2/3/4/5/6) acquisition runner.
 *
 * Orchestrates: manifest -> per-hull StarBreaker export (skipping hulls
 * already covered by the 6 approved raw-data files) -> identity
 * verification -> in-memory importer/normalizer validation -> a resumable
 * per-hull status record. Never writes into raw-data/ or generated-data/
 * — only into the caller-supplied staging directory. Promotion into
 * raw-data/ is a separate, out-of-scope, reviewed GF-002C step.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buildManifest } from './manifest'
import { checkIdentity } from './identityCheck'
import { validateStagedExport } from './validator'
import type { AcquisitionStatus, ExportAttemptResult, HullAcquisitionRecord, ManifestEntry, ValidationRecord } from './types'

export interface SpawnResult {
  status: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

/** Injectable so tests never invoke a real StarBreaker process (Task 10). */
export type SpawnFn = (command: string, args: string[], timeoutMs: number) => SpawnResult

export interface AcquisitionConfig {
  starbreakerPath: string
  p4kPath: string
  stagingDir: string
  quarantineDir: string
  perHullTimeoutMs: number
  retryCount: number
  force: boolean
  dryRun: boolean
  spawn: SpawnFn
  /** Caps how many pending hulls are processed in one run — omitted means "all". Useful for staged/manual runs, never a silent partial claim. */
  limit?: number
}

export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_RETRY_COUNT = 1

const STATE_FILE_NAME = 'acquisition-state.json'

interface PersistedState {
  [canonicalId: string]: { finalStatus: AcquisitionStatus; requestedEntityId: string; file: string }
}

function loadState(stagingDir: string): PersistedState {
  const path = join(stagingDir, STATE_FILE_NAME)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

function saveState(stagingDir: string, state: PersistedState): void {
  writeFileSync(join(stagingDir, STATE_FILE_NAME), JSON.stringify(state, null, 2), 'utf-8')
}

function buildCommand(config: AcquisitionConfig, requestedEntityId: string, outputPath: string): { args: string[]; commandLine: string } {
  const args = ['entity', 'export', requestedEntityId, outputPath, '--p4k', config.p4kPath, '--dump-hierarchy']
  const commandLine = `${config.starbreakerPath} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
  return { args, commandLine }
}

export function exportOneHull(entry: ManifestEntry, config: AcquisitionConfig): ExportAttemptResult {
  const outputPath = join(config.stagingDir, entry.expectedOutputFilename)
  const { args, commandLine } = buildCommand(config, entry.requestedEntityId, outputPath)

  if (!config.force && existsSync(outputPath)) {
    const size = statSync(outputPath).size
    return { canonicalId: entry.canonicalId, requestedEntityId: entry.requestedEntityId, command: commandLine, exitCode: 0, stdoutTail: '(skipped — output already exists, overwrite protection)', stderrTail: '', timedOut: false, elapsedMs: 0, outputPath, outputExists: true, outputSize: size }
  }

  const start = Date.now()
  let result: SpawnResult = { status: null, stdout: '', stderr: '', timedOut: false }
  let attempts = 0
  const maxAttempts = 1 + Math.max(0, config.retryCount)
  while (attempts < maxAttempts) {
    attempts++
    result = config.spawn(config.starbreakerPath, args, config.perHullTimeoutMs)
    if (result.status === 0 && !result.timedOut) break
  }
  const elapsedMs = Date.now() - start

  const outputExists = existsSync(outputPath)
  const outputSize = outputExists ? statSync(outputPath).size : 0

  return {
    canonicalId: entry.canonicalId,
    requestedEntityId: entry.requestedEntityId,
    command: commandLine,
    exitCode: result.status,
    stdoutTail: result.stdout.slice(-2000),
    stderrTail: result.stderr.slice(-2000),
    timedOut: result.timedOut,
    elapsedMs,
    outputPath,
    outputExists,
    outputSize,
  }
}

export interface RunOptions {
  manifestOverride?: ManifestEntry[]
}

export async function runAcquisition(config: AcquisitionConfig, options: RunOptions = {}): Promise<{ records: HullAcquisitionRecord[]; statusCounts: Record<AcquisitionStatus, number>; totalRuntimeMs: number }> {
  if (!config.dryRun) {
    mkdirSync(config.stagingDir, { recursive: true })
    mkdirSync(config.quarantineDir, { recursive: true })
  }

  const manifest = options.manifestOverride ?? buildManifest()
  const state = config.dryRun ? {} : loadState(config.stagingDir)
  const records: HullAcquisitionRecord[] = []
  const start = Date.now()
  let processed = 0

  for (const entry of manifest) {
    const hullStart = Date.now()

    // Already covered by an approved raw-data/*.json file — nothing to acquire.
    if (entry.alreadyInRawData) {
      records.push({ manifest: entry, exportAttempt: null, validation: null, finalStatus: 'ALREADY_VALIDATED', elapsedMs: 0 })
      continue
    }

    // No resolvable entity identifier at all (Task 1/GF-002A finding).
    if (!entry.requestedEntityId) {
      records.push({ manifest: entry, exportAttempt: null, validation: null, finalStatus: 'NO_MECHANICAL_ENTITY', elapsedMs: 0 })
      continue
    }

    // Ambiguous seed match (>1 catalog candidate) — never auto-resolved.
    if (entry.alternateCandidates.length > 1) {
      records.push({ manifest: entry, exportAttempt: null, validation: null, finalStatus: 'AMBIGUOUS_MATCH', elapsedMs: 0 })
      continue
    }

    // Resume mode: a prior successful run for this exact entity id is trusted as-is.
    const prior = state[entry.canonicalId]
    if (!config.force && prior && prior.finalStatus === 'EXPORTED_VALID' && prior.requestedEntityId === entry.requestedEntityId && existsSync(prior.file)) {
      records.push({ manifest: entry, exportAttempt: null, validation: null, finalStatus: 'ALREADY_VALIDATED', elapsedMs: 0 })
      continue
    }

    if (config.limit !== undefined && processed >= config.limit) {
      records.push({ manifest: entry, exportAttempt: null, validation: null, finalStatus: 'PENDING', elapsedMs: 0 })
      continue
    }

    if (config.dryRun) {
      const { commandLine } = buildCommand(config, entry.requestedEntityId, join(config.stagingDir, entry.expectedOutputFilename))
      records.push({
        manifest: entry,
        exportAttempt: { canonicalId: entry.canonicalId, requestedEntityId: entry.requestedEntityId, command: commandLine, exitCode: null, stdoutTail: '(dry-run — not executed)', stderrTail: '', timedOut: false, elapsedMs: 0, outputPath: '', outputExists: false, outputSize: 0 },
        validation: null,
        finalStatus: 'PENDING',
        elapsedMs: 0,
      })
      processed++
      continue
    }

    processed++
    const exportAttempt = exportOneHull(entry, config)

    let validation: ValidationRecord | null = null
    let finalStatus: AcquisitionStatus

    if (exportAttempt.timedOut) {
      finalStatus = 'EXPORT_FAILED'
    } else if (exportAttempt.exitCode !== 0 || !exportAttempt.outputExists || exportAttempt.outputSize === 0) {
      finalStatus = 'EXPORT_FAILED'
    } else {
      const rawText = readFileSync(exportAttempt.outputPath, 'utf-8')
      const identity = checkIdentity(entry.requestedEntityId, rawText)

      if (!identity.ok && identity.observedEntityId === null) {
        finalStatus = 'MALFORMED_OUTPUT'
        quarantine(config, exportAttempt.outputPath, entry.expectedOutputFilename, identity.reason ?? 'unreadable')
      } else if (!identity.ok) {
        finalStatus = 'IDENTITY_MISMATCH'
        quarantine(config, exportAttempt.outputPath, entry.expectedOutputFilename, identity.reason ?? 'identity mismatch')
      } else {
        validation = await validateStagedExport(entry.canonicalId, entry.requestedEntityId, exportAttempt.outputPath)
        if (!validation.normalizeSucceeded) {
          finalStatus = 'IMPORTER_REJECTED'
        } else {
          finalStatus = 'EXPORTED_VALID'
        }
      }
    }

    state[entry.canonicalId] = { finalStatus, requestedEntityId: entry.requestedEntityId, file: exportAttempt.outputPath }
    records.push({ manifest: entry, exportAttempt, validation, finalStatus, elapsedMs: Date.now() - hullStart })
  }

  if (!config.dryRun) saveState(config.stagingDir, state)

  const statusCounts = records.reduce(
    (acc, r) => {
      acc[r.finalStatus] = (acc[r.finalStatus] ?? 0) + 1
      return acc
    },
    {} as Record<AcquisitionStatus, number>
  )

  return { records, statusCounts, totalRuntimeMs: Date.now() - start }
}

function quarantine(config: AcquisitionConfig, outputPath: string, filename: string, reason: string): void {
  if (!existsSync(outputPath)) return
  const content = readFileSync(outputPath, 'utf-8')
  const quarantinePath = join(config.quarantineDir, filename)
  writeFileSync(quarantinePath, content, 'utf-8')
  writeFileSync(`${quarantinePath}.reason.txt`, reason, 'utf-8')
}
