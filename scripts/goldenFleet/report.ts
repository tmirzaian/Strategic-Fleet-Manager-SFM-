/**
 * Operation Golden Fleet — GF-002B (Task 9) acquisition report builder.
 */
import { statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AcquisitionReport, AcquisitionStatus, HullAcquisitionRecord } from './types'

export interface P4kMeta {
  path: string
  branch: string
  version: string
  p4ChangeNum: string
}

export interface StarBreakerMeta {
  path: string
  version: string
  sha256: string
}

function directorySize(dir: string): number {
  let total = 0
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return 0
  }
  for (const name of entries) {
    try {
      const stat = statSync(join(dir, name))
      if (stat.isFile()) total += stat.size
    } catch {
      /* ignore unreadable entries */
    }
  }
  return total
}

export function buildReport(params: {
  records: HullAcquisitionRecord[]
  statusCounts: Record<AcquisitionStatus, number>
  totalRuntimeMs: number
  stagingDir: string
  p4k: P4kMeta
  starbreaker: StarBreakerMeta
}): AcquisitionReport {
  const { records, statusCounts, totalRuntimeMs, stagingDir, p4k, starbreaker } = params
  const p4kStat = statSync(p4k.path)

  return {
    generatedAt: new Date().toISOString(),
    p4k: { path: p4k.path, sizeBytes: p4kStat.size, mtime: p4kStat.mtime.toISOString(), branch: p4k.branch, version: p4k.version, p4ChangeNum: p4k.p4ChangeNum },
    starbreaker: { path: starbreaker.path, version: starbreaker.version, sha256: starbreaker.sha256 },
    targetCanonicalHullCount: records.length,
    totalRuntimeMs,
    stagingDirectory: stagingDir,
    totalStagingBytes: directorySize(stagingDir),
    statusCounts,
    hulls: records,
  }
}
