import type { Ship, FleetAsset, Build, Hardpoint, HangarItem, InstalledLoadoutEntry, MissionReservation } from '../types'
import { prepareCanonicalHardpoints } from './canonicalHardpointPreparation'
import { buildShipManagementSummary } from './shipManagementSummary'
import { activeReservationsForShip } from './fleetLifecycle'
import type { AcquisitionHint } from './componentAcquisitionHint'

/**
 * EWO-103 — Launch Readiness Authority.
 *
 * The one canonical answer to "can the Commander launch this ship right
 * now?" Every future consumer (Flight Commander, VoiceAttack, Organization
 * Operations, external integrations) must derive its answer from this
 * resolver rather than re-deriving readiness itself.
 *
 * This is composition, not a new formula: `prepareCanonicalHardpoints` →
 * `buildShipManagementSummary` are the exact same canonical chain Ship
 * Management's own Decision Summary already calls (see
 * `docs/EWO-103-Launch-Readiness-Authority.md` Part A for the full audit of
 * every existing readiness-deriving location this reuses rather than
 * duplicates). No new percentage/status/availability calculation is
 * introduced here — only a launch-framed reclassification of facts that
 * already exist.
 *
 * Performs no mutations and contains no UI logic (Part F) — `deepLink`
 * fields are plain structured data (a real, navigable `path`, plus a
 * `suggestedCommanderIntent` future consumers may act on). Ship
 * Management's Commander Intent is local component state today
 * (`ShipWorkspacePrototype.tsx`'s own `useState`), not URL-driven — wiring
 * a page to actually honor `suggestedCommanderIntent` is separate, future,
 * UI-layer work, deliberately out of this work order's scope.
 */

/** Part C — canonical launch states, ordered worst-to-best is
 * LAUNCH_BLOCKED < MAINTENANCE_REQUIRED < READY_WITH_ADVISORIES <
 * MISSION_READY. Deliberately not percentage-only — the Commander needs a
 * decision, not a number (Part C direction). */
export type LaunchReadinessStatus = 'MISSION_READY' | 'READY_WITH_ADVISORIES' | 'MAINTENANCE_REQUIRED' | 'LAUNCH_BLOCKED'

/** How much to trust `status`/`readinessPercent` themselves — orthogonal to
 * status. LOW means the underlying build has nothing real to evaluate
 * (no build resolved, or zero required assignments — trivially reads
 * "ready" because nothing was ever asked of it). MEDIUM means a real
 * target set exists but was never explicitly reviewed by the Commander
 * (still on the Factory Loadout). HIGH means a genuinely reviewed
 * Custom/Mission/Template build with real requirements. */
export type LaunchReadinessConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

/** Part D — blocker classification, matching the work order's own literal
 * examples ("required component missing," "incompatible installation").
 * A `HardpointStatus` of `'Unresolved'` is excluded entirely, consistent
 * with `criticalHardpointsInPriorityOrder`'s and Mission Control's
 * `deriveFleetPriorityActions`' own established treatment of that status
 * as a non-actionable data edge case, never a real Commander decision. */
export type LaunchBlockerReason = 'MISSING_REQUIRED_COMPONENT' | 'INCOMPATIBLE_INSTALLATION'

/** Part D — advisory classification. `UPGRADE_AVAILABLE` matches "better
 * component available"/"upgrade opportunity" verbatim. `RESERVATION_PENDING`
 * matches "optional reservation pending" — an ACTIVE reservation on this
 * ship that isn't already the reason behind one of `blockers` (i.e. not the
 * exact build+slot+component a Missing blocker's own "Reserved For This
 * Port" hint already reflects). */
export type LaunchAdvisoryReason = 'UPGRADE_AVAILABLE' | 'RESERVATION_PENDING'

export type LaunchReadinessCommanderIntent = 'MANAGE_LOADOUT' | 'CHANGE_INSTALLED'

export interface LaunchReadinessDeepLink {
  /** A real, navigable route today (`/ship-workspace/:shipId` or `/hangar`). */
  path: string
  shipId: string
  /** Intent data for a future consumer — not yet wired to any URL param
   * anywhere in the app. See this module's own doc comment. */
  suggestedCommanderIntent?: LaunchReadinessCommanderIntent
  hardpointId?: string
}

export interface LaunchReadinessBlocker {
  hardpointId: string
  slotLabel: string
  targetItem: string
  reason: LaunchBlockerReason
  /** True when the Commander can resolve this in Ship Management right now
   * with no external procurement — an Invalid Target retarget (always
   * immediately resolvable — the fix is picking a different, compatible
   * target, never dependent on inventory), or a Missing component whose
   * acquisition hint tone isn't `'muted'` (Reserved / Available / Borrow).
   * Reuses `buildShipManagementSummary`'s own `actionableDecisions`
   * classification (EWO-065B) rather than a new formula — this is the one
   * fact that decides Maintenance Required vs. Launch Blocked (Part C). */
  immediatelyResolvable: boolean
  /** Present for `MISSING_REQUIRED_COMPONENT` only — the exact same
   * `AcquisitionHint` Ship Management's Decision Summary/Status column
   * already show for this hardpoint, never re-derived. */
  acquisitionHint?: AcquisitionHint
  deepLink: LaunchReadinessDeepLink
}

export interface LaunchReadinessAdvisory {
  hardpointId?: string
  slotLabel?: string
  targetItem?: string
  reason: LaunchAdvisoryReason
  detail: string
  acquisitionHint?: AcquisitionHint
  deepLink: LaunchReadinessDeepLink
}

export interface LaunchReadinessRecommendation {
  message: string
  deepLink?: LaunchReadinessDeepLink
}

export interface LaunchReadinessResult {
  shipId: string
  shipName: string
  buildId: string | undefined
  buildName: string | undefined
  status: LaunchReadinessStatus
  confidence: LaunchReadinessConfidence
  /** 0-100, `BuildProgressResult.percentage` verbatim — never a second
   * formula. Present for context; `status` (not this number) is the
   * decision Part C asks for. */
  readinessPercent: number
  blockers: LaunchReadinessBlocker[]
  warnings: LaunchReadinessAdvisory[]
  recommendations: LaunchReadinessRecommendation[]
}

export interface LaunchReadinessParams {
  shipId: string
  /** Defaults to the ship's own `activeBuildId` when omitted — pass
   * explicitly to evaluate readiness against a different Build (e.g. a
   * Commander comparing an alternate Loadout before switching to it). */
  buildId?: string
  ships: Ship[]
  fleetAssets: FleetAsset[]
  builds: Build[]
  hardpoints: Hardpoint[]
  hangarItems: HangarItem[]
  installedLoadouts: InstalledLoadoutEntry[]
  reservations: MissionReservation[]
}

function deepLinkFor(shipId: string, suggestedCommanderIntent?: LaunchReadinessCommanderIntent, hardpointId?: string): LaunchReadinessDeepLink {
  return { path: `/ship-workspace/${shipId}`, shipId, suggestedCommanderIntent, hardpointId }
}

/** Part B — the canonical resolver. Given a ship (and optionally a specific
 * Build to evaluate against), returns a structured verdict, never a bare
 * boolean. */
export function evaluateLaunchReadiness(params: LaunchReadinessParams): LaunchReadinessResult {
  const { shipId, ships, fleetAssets, builds, hardpoints, hangarItems, installedLoadouts, reservations } = params
  const ship = ships.find((s) => s.id === shipId)
  if (!ship) {
    throw new Error(`evaluateLaunchReadiness: no ship found for id "${shipId}".`)
  }
  const buildId = params.buildId ?? ship.activeBuildId
  const build = builds.find((b) => b.id === buildId)

  // Same canonical chain Ship Management's own Decision Summary calls —
  // never a raw `hardpoints.filter(...)` read as final authority.
  const buildHardpoints = hardpoints.filter((h) => h.buildId === buildId)
  const canonicalHardpoints = prepareCanonicalHardpoints(shipId, buildHardpoints, fleetAssets)
  const summary = buildShipManagementSummary(canonicalHardpoints, { shipId, build, hangarItems, installedLoadouts, reservations, ships })

  const blockers: LaunchReadinessBlocker[] = []
  const warnings: LaunchReadinessAdvisory[] = []

  for (const hp of summary.decisionHardpoints) {
    const hint = summary.hintByHardpointId.get(hp.id)
    if (hp.status === 'Invalid Target') {
      blockers.push({
        hardpointId: hp.id,
        slotLabel: hp.slotLabel,
        targetItem: hp.targetItem,
        reason: 'INCOMPATIBLE_INSTALLATION',
        immediatelyResolvable: true,
        deepLink: deepLinkFor(shipId, 'MANAGE_LOADOUT', hp.id),
      })
    } else if (hp.status === 'Missing') {
      blockers.push({
        hardpointId: hp.id,
        slotLabel: hp.slotLabel,
        targetItem: hp.targetItem,
        reason: 'MISSING_REQUIRED_COMPONENT',
        immediatelyResolvable: hint ? hint.tone !== 'muted' : false,
        acquisitionHint: hint,
        deepLink: deepLinkFor(shipId, 'CHANGE_INSTALLED', hp.id),
      })
    } else if (hp.status === 'Upgrade Available') {
      warnings.push({
        hardpointId: hp.id,
        slotLabel: hp.slotLabel,
        targetItem: hp.targetItem,
        reason: 'UPGRADE_AVAILABLE',
        detail: `A better match for ${hp.slotLabel} is available: ${hp.targetItem}.`,
        acquisitionHint: hint,
        deepLink: deepLinkFor(shipId, 'CHANGE_INSTALLED', hp.id),
      })
    }
  }

  // "Optional reservation pending" — an ACTIVE reservation touching this
  // ship not already accounted for by one of the blockers above.
  const blockerReservationKeys = new Set(
    blockers.filter((b) => b.reason === 'MISSING_REQUIRED_COMPONENT').map((b) => `${buildId}::${b.slotLabel}::${b.targetItem}`)
  )
  for (const reservation of activeReservationsForShip(shipId, builds, reservations)) {
    const key = `${reservation.missionConfigurationId}::${reservation.targetSlotLabel}::${reservation.componentName}`
    if (blockerReservationKeys.has(key)) continue
    warnings.push({
      reason: 'RESERVATION_PENDING',
      detail: `${reservation.componentName} is reserved (${reservation.targetSlotLabel}) but not tied to a current blocker on this Loadout.`,
      deepLink: deepLinkFor(shipId, 'CHANGE_INSTALLED'),
    })
  }

  const allBlockersResolvableNow = blockers.length > 0 && blockers.every((b) => b.immediatelyResolvable)
  let status: LaunchReadinessStatus
  if (blockers.length === 0 && warnings.length === 0) status = 'MISSION_READY'
  else if (blockers.length === 0) status = 'READY_WITH_ADVISORIES'
  else if (allBlockersResolvableNow) status = 'MAINTENANCE_REQUIRED'
  else status = 'LAUNCH_BLOCKED'

  const confidence: LaunchReadinessConfidence =
    !build || summary.progress.requiredAssignments === 0 ? 'LOW' : build.kind === 'FACTORY' ? 'MEDIUM' : 'HIGH'

  const recommendations: LaunchReadinessRecommendation[] = []
  if (status === 'MISSION_READY') {
    recommendations.push({ message: `${ship.name} is fully mission ready. Clear to launch.` })
  } else if (status === 'READY_WITH_ADVISORIES') {
    recommendations.push({
      message: `${ship.name} is launch ready with ${warnings.length} advisory item(s) — review at your convenience.`,
      deepLink: deepLinkFor(shipId, 'CHANGE_INSTALLED'),
    })
  } else if (status === 'MAINTENANCE_REQUIRED') {
    recommendations.push({
      message: `${blockers.length} component(s) can be resolved immediately in Ship Management before launch.`,
      deepLink: deepLinkFor(shipId, 'CHANGE_INSTALLED'),
    })
  } else {
    const unresolvable = blockers.filter((b) => !b.immediatelyResolvable)
    recommendations.push({
      message: `${unresolvable.length} component(s) require procurement before ${ship.name} can launch.`,
      deepLink: { path: '/hangar', shipId },
    })
  }
  if (confidence === 'LOW') {
    recommendations.push({
      message: build
        ? `${ship.name} has no reviewed target Loadout with real requirements yet — this reading is trivially "ready" and should not be trusted.`
        : `${ship.name} has no resolvable Loadout for this evaluation.`,
      deepLink: deepLinkFor(shipId, 'MANAGE_LOADOUT'),
    })
  } else if (confidence === 'MEDIUM') {
    recommendations.push({
      message: `${ship.name} is still on its Factory Loadout — a Commander has never explicitly reviewed a target configuration for it.`,
      deepLink: deepLinkFor(shipId, 'MANAGE_LOADOUT'),
    })
  }

  return {
    shipId,
    shipName: ship.name,
    buildId: build?.id,
    buildName: build?.name,
    status,
    confidence,
    readinessPercent: summary.progress.percentage,
    blockers,
    warnings,
    recommendations,
  }
}
