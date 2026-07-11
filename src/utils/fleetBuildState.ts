import type { Build, FleetBuildState, Ship } from '../types'
import type { BuildProgressResult } from './buildProgress'

/**
 * Derives the player-facing ship/build state — never stored as
 * authoritative, always computed fresh from the same inputs Build
 * Progress already uses (Alpha 2.1, Part 7).
 *
 * FACTORY_ONLY and MISSION_READY can look identical at the raw-numbers
 * level (Installed = Target = Factory everywhere, 100% match) but mean
 * completely different things to a player: one is "I haven't customized
 * anything," the other is "I finished a real project." The distinguishing
 * signal is `build.kind` — see src/types/index.ts.
 */
export function deriveFleetBuildState(build: Build | undefined, progress: BuildProgressResult): FleetBuildState {
  if (!build) return 'INVALID_BUILD'
  if (progress.status === 'INVALID') return 'INVALID_BUILD'
  if (build.kind === 'FACTORY') return 'FACTORY_ONLY'
  if (progress.isComplete) return 'MISSION_READY'
  if (progress.matchedAssignments === 0 && progress.requiredAssignments > 0) return 'BUILD_ASSIGNED'
  return 'BUILD_IN_PROGRESS'
}

/**
 * Mission Control's three Fleet Status tiles (Alpha 2.5A, Part 1) — a
 * strict partition of `deriveFleetBuildState`'s five states, chosen so
 * the three counts always sum to Ships Active with no ship ever silently
 * omitted. INVALID_BUILD folds into LOADOUTS_IN_PROGRESS rather than a
 * separate tile (Part 4: "count the Fleet Asset in Loadouts In Progress
 * or an explicit invalid state... never silently omit it") — it remains
 * visibly flagged (never counted as Mission Ready) even though it
 * doesn't get its own top-level tile this sprint.
 */
export type FleetStatusTile = 'MISSION_READY' | 'LOADOUTS_IN_PROGRESS' | 'FACTORY_LOADOUT'

export function classifyFleetStatusTile(state: FleetBuildState): FleetStatusTile {
  if (state === 'FACTORY_ONLY') return 'FACTORY_LOADOUT'
  if (state === 'MISSION_READY') return 'MISSION_READY'
  return 'LOADOUTS_IN_PROGRESS' // BUILD_ASSIGNED, BUILD_IN_PROGRESS, INVALID_BUILD
}

/** Sort-rank groups for "Sort by Readiness" (Part 10) — lower sorts first. */
const STATE_RANK: Record<FleetBuildState, number> = {
  MISSION_READY: 0,
  BUILD_IN_PROGRESS: 1,
  BUILD_ASSIGNED: 1,
  FACTORY_ONLY: 2,
  INVALID_BUILD: 3,
}

/**
 * A deliberate, state-aware "Sort by Readiness" ordering (Part 10):
 * completed custom Builds first, then incomplete custom Builds by
 * descending percentage, then Factory-only ships, then invalid data last
 * — never interpreting a Factory-only 100%-match as ranking above (or
 * even alongside) a genuinely completed custom Build. Stable tie-breaker:
 * priority, then ship display name, then id.
 */
export function compareByReadinessRank(
  a: { ship: Ship; state: FleetBuildState; progress: BuildProgressResult },
  b: { ship: Ship; state: FleetBuildState; progress: BuildProgressResult }
): number {
  const rankDiff = STATE_RANK[a.state] - STATE_RANK[b.state]
  if (rankDiff !== 0) return rankDiff

  if (a.state === 'BUILD_IN_PROGRESS' || a.state === 'BUILD_ASSIGNED') {
    const pctDiff = b.progress.percentage - a.progress.percentage
    if (pctDiff !== 0) return pctDiff
  }

  if (a.ship.priority !== b.ship.priority) return a.ship.priority - b.ship.priority
  const nameDiff = a.ship.name.localeCompare(b.ship.name)
  if (nameDiff !== 0) return nameDiff
  return a.ship.id.localeCompare(b.ship.id)
}
