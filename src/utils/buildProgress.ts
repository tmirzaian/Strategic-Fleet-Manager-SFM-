import type { Hardpoint } from '../types'

export type BuildProgressStatus = 'NOT_READY' | 'IN_PROGRESS' | 'NEAR_READY' | 'COMPLETE' | 'INVALID'

export interface BuildProgressResult {
  percentage: number
  matchedAssignments: number
  requiredAssignments: number
  missingAssignments: string[]
  mismatchedAssignments: string[]
  invalidTargets: string[]
  upgradeOpportunities: string[]
  /** Hardpoints whose factory data is a placeholder (Unresolved status) —
   * never counted toward required/matched, but tracked separately so the
   * UI can surface "Factory Data Unresolved" rather than silently
   * dropping them (Alpha 2.1, Part 12). */
  unresolvedAssignments: string[]
  isComplete: boolean
  status: BuildProgressStatus
}

/**
 * The single Build Progress engine (Alpha 2.0) — every consumer (Fleet
 * Dashboard cards, Fleet Dashboard table, Ship Detail, Mission Control,
 * priority summaries) must call this and nothing else. There is
 * deliberately no separate readiness/complete calculation anywhere else
 * in the app; `Ship.readiness`/`Ship.missing` on the materialized Ship
 * record are kept only as a last-known cache for cheap sorting — nothing
 * treats them as authoritative. Recompute from current Installed + Active
 * Target Build (the `hardpoints` passed in) every time.
 *
 * Rules (see Sprint "Alpha 2.0" brief):
 *   1. A hardpoint with no target (empty/'—') is not a required
 *      assignment at all — it never reduces the percentage.
 *   2. Installed === Target -> matched.
 *   3. Installed empty, Target exists -> missing.
 *   4. Installed still equals Factory (untouched) but Target differs ->
 *      missing (nothing has actually been done for this slot yet).
 *   5. Installed differs from both Factory and Target -> upgrade
 *      opportunity / interim component — counted as incomplete, never as
 *      matched.
 *   6. Target incompatible with the port -> invalid target — incomplete,
 *      and never silently folded into "missing".
 *   7. A genuinely empty, non-required factory port never reduces
 *      progress unless the Target Build explicitly asks for something
 *      there (covered by rule 1).
 *
 * Percentage = matched / required * 100. Zero required assignments (a
 * Factory Build where every target trivially equals factory) is treated
 * as 100% — Factory = Installed = Target is the "nothing to do" case, not
 * a 0-divided-by-0 edge case that should read as broken.
 *
 * BUILD COMPLETE is only true at an exact, unconditional 100% — every
 * required assignment matched, nothing missing, nothing invalid, nothing
 * mid-upgrade. 85%, 96%, 99% are all NOT complete. No tolerance.
 */
export function calculateBuildProgress(hardpoints: Hardpoint[]): BuildProgressResult {
  // Unresolved factory data (the "Unknown Factory Item" placeholder) is
  // excluded from the required set entirely — it can never count as
  // matched via placeholder equality, and it can never count as a real
  // "missing" to-do either, since we don't actually know what belongs
  // there yet (Alpha 2.1, Part 12).
  const unresolved = hardpoints.filter((h) => h.status === 'Unresolved')
  const required = hardpoints.filter((h) => h.status !== 'Unresolved' && h.targetItem && h.targetItem !== '—')

  const matched = required.filter((h) => h.status === 'OK')
  const missing = required.filter((h) => h.status === 'Missing')
  const upgrade = required.filter((h) => h.status === 'Upgrade Available')
  const invalid = required.filter((h) => h.status === 'Invalid Target')

  const requiredAssignments = required.length
  const matchedAssignments = matched.length
  const percentage = requiredAssignments > 0 ? Math.round((matchedAssignments / requiredAssignments) * 100) : 100

  // No tolerance: complete only when every required assignment is
  // matched. (Since required = matched + missing + upgrade + invalid,
  // matchedAssignments === requiredAssignments already implies the other
  // three are empty — this is not a separate, looser check.)
  const isComplete = requiredAssignments === 0 || matchedAssignments === requiredAssignments

  let status: BuildProgressStatus
  if (invalid.length > 0) status = 'INVALID'
  else if (isComplete) status = 'COMPLETE'
  else if (matchedAssignments === 0) status = 'NOT_READY'
  else if (percentage >= 75) status = 'NEAR_READY'
  else status = 'IN_PROGRESS'

  return {
    percentage,
    matchedAssignments,
    requiredAssignments,
    missingAssignments: missing.map((h) => h.targetItem),
    mismatchedAssignments: upgrade.map((h) => h.targetItem),
    invalidTargets: invalid.map((h) => h.targetItem),
    upgradeOpportunities: upgrade.map((h) => h.targetItem),
    unresolvedAssignments: unresolved.map((h) => h.slotLabel),
    isComplete,
    status,
  }
}
