import type { Hardpoint, Ship, HangarItem, InstalledLoadoutEntry, MissionReservation, Build, FleetBuildState, ComponentAvailability } from '../types'
import { calculateBuildProgress, type BuildProgressResult } from './buildProgress'
import { deriveFleetBuildState } from './fleetBuildState'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { describeAcquisitionHint, type AcquisitionHint } from './componentAcquisitionHint'

/**
 * EWO-063 (Part C) — moved here from ShipWorkspacePrototype.tsx as part of
 * consolidating every Ship Management summary calculation into this one
 * module. EWO-064 (Part C/G) — now includes 'Upgrade Available' rows
 * alongside 'Missing': a slot that already has a real (non-factory,
 * non-empty) component installed but whose Target differs is a genuine
 * decision too ("Compatible Upgrade Opportunity" — a Commander needs to
 * complete the swap), previously silently excluded from every decision
 * surface even though it already counted toward the readiness percentage
 * and the "Missing: …" summary text. Invalid Target rows still sort
 * first — a data problem needing resolution, not acquisition.
 */
export function criticalHardpointsInPriorityOrder(hardpoints: Hardpoint[]): Hardpoint[] {
  const invalid = hardpoints.filter((h) => h.status === 'Invalid Target')
  const actionable = hardpoints.filter((h) => h.status === 'Missing' || h.status === 'Upgrade Available')
  return [...invalid, ...actionable]
}

/**
 * EWO-064 (Part C/G) — the Commander-approved acquisition priority order:
 * Reserved Target Component (already committed to another Loadout;
 * reassigning it is a one-click resolution of an existing commitment) >
 * Available Inventory Component (genuinely free stock, including stock
 * already reserved for this exact port) > Borrow From Another Ship
 * (collapsed by default — a cross-ship transfer is a bigger decision) >
 * Record Newly Acquired Component (Purchase Required — not yet owned,
 * lowest priority, but no longer excluded from the Decision Summary the
 * way SW-002 Revision C originally excluded it; recording an acquisition
 * plan is itself a real Commander action now). This reorders (not
 * removes) the same four tones `describeAcquisitionHint` has always
 * returned — never a new eligibility rule, only which of them a
 * Commander sees, and in what order.
 */
function acquisitionRank(hint: AcquisitionHint): number {
  switch (hint.tone) {
    case 'warning':
      return 0
    case 'success':
      return 1
    case 'cyan':
      return 2
    default:
      return 3
  }
}

export interface ShipManagementSummary {
  progress: BuildProgressResult
  buildState: FleetBuildState
  missingSummary: string[]
  /** Invalid Target rows first, then every Missing/Upgrade Available row
   * ranked by acquisition priority (see `acquisitionRank`) — the one
   * ordered decision list the Hero's Priority Components strip and
   * Decision Summary panel both render directly. "No Immediate
   * Decisions" is correct only when this is empty (EWO-064 Part C) —
   * every non-empty case now has at least a Record Newly Acquired
   * Component entry, so there is no longer a separate "gaps exist but
   * none are actionable" state to represent. */
  decisionHardpoints: Hardpoint[]
  decisionCount: number
  prioritizedDecisions: Hardpoint[]
  /** Acquisition hint for every non-structural hardpoint's own
   * currently-SAVED target, keyed by Hardpoint.id — the Decision Summary
   * panel's badges, the Priority Components strip's icons, and Change
   * Installed Components' expandable disclosure (reachable from any row,
   * not only a Missing one) all read from here rather than each
   * independently calling describeAcquisitionHint. */
  hintByHardpointId: Map<string, AcquisitionHint>
  /** Inventory availability for every non-structural hardpoint's own
   * currently-SAVED target, keyed by Hardpoint.id — Change Installed
   * Components' per-row "N Available" badge reads from here. Deliberately
   * excludes Manage Loadout's New Target column: that badge reflects a
   * live, unsaved, per-keystroke pending edit (`desiredTargets`), which
   * is ephemeral UI-editing feedback, not part of the ship's own summary
   * — it correctly keeps its own live calculation against the pending
   * value, the one principled exception to "one calculation." */
  availabilityByHardpointId: Map<string, ComponentAvailability>
}

export interface ShipManagementSummaryContext {
  shipId: string
  build: Build | undefined
  hangarItems: HangarItem[]
  installedLoadouts: InstalledLoadoutEntry[]
  reservations: MissionReservation[]
  ships: Ship[]
}

/**
 * EWO-063 (Part C) — the one authoritative calculation every Ship
 * Management summary surface reads from: Readiness %, Missing
 * Components, Decision Summary, the Priority Components strip's
 * notification icons, and Change Installed Components' per-row
 * availability badges. Previously five independent expressions
 * (`activeProgress`, `missingSummary`, `decisionHardpoints`,
 * `prioritizedDecisions`, `actionableDecisions`) plus per-row inline
 * `describeAcquisitionHint`/`calculateComponentAvailability` calls
 * scattered across ShipWorkspacePrototype.tsx — all deriving from the
 * same hardpoint set, but as separate hand-maintained code paths that
 * could silently drift apart from each other. One function now, called
 * with whichever hardpoint set is relevant.
 *
 * EWO-064 (Part F) — "Sticky Header owns context, Hero owns action." The
 * Hero (and everything under it: Readiness, Missing, Decision Summary,
 * the Priority Components strip) now reads the Reviewed hardpoint set,
 * not the Active one — the Sticky Context Bar is already the single
 * source of truth for which Loadout ("Ship / Reviewed Loadout / Intent /
 * Pending Changes") the Commander is looking at, so the Hero now reflects
 * operational state for that exact same Loadout rather than silently
 * showing a different one underneath it. This does not change the
 * underlying Active-vs-Reviewed data model at all (Part H) — Active
 * Loadout, Pending Changes, and the Loadout selection/pill mechanism are
 * completely unchanged; only which of the two already-computed summaries
 * (`activeSummary`/`reviewedSummary` in `ShipWorkspacePrototype.tsx`)
 * feeds the Hero. They are the literal same object whenever Reviewed and
 * Active are the same Loadout (the common case, zero extra computation).
 */
export function buildShipManagementSummary(hardpoints: Hardpoint[], context: ShipManagementSummaryContext): ShipManagementSummary {
  const progress = calculateBuildProgress(hardpoints)
  const buildState = deriveFleetBuildState(context.build, progress)
  const missingSummary = [...progress.missingAssignments, ...progress.upgradeOpportunities, ...progress.invalidTargets]

  const decisionHardpoints = criticalHardpointsInPriorityOrder(hardpoints)
  const decisionCount = decisionHardpoints.length

  // Computed for every non-structural hardpoint, not just the Missing
  // decision subset — Change Installed Components' expandable "Install /
  // Change" disclosure is reachable from ANY row (a Commander swapping an
  // already-OK component, not only resolving a gap), so it needs a hint
  // regardless of that row's own current status. The decision-ranking
  // logic below only ever reads the Missing subset of this same map.
  const hintByHardpointId = new Map<string, AcquisitionHint>()
  const availabilityByHardpointId = new Map<string, ComponentAvailability>()
  for (const hp of hardpoints) {
    if (hp.isStructural) continue
    hintByHardpointId.set(
      hp.id,
      describeAcquisitionHint({
        componentName: hp.targetItem,
        componentEntityClass: hp.targetEntityClass,
        currentShipId: context.shipId,
        currentBuildId: hp.buildId,
        currentSlotLabel: hp.slotLabel,
        hangarItems: context.hangarItems,
        installedLoadouts: context.installedLoadouts,
        reservations: context.reservations,
        ships: context.ships,
      })
    )
    availabilityByHardpointId.set(hp.id, calculateComponentAvailability(hp.targetItem, context.hangarItems, context.installedLoadouts, context.reservations, hp.targetEntityClass))
  }

  const prioritizedDecisions = [
    ...decisionHardpoints.filter((h) => h.status === 'Invalid Target'),
    ...decisionHardpoints
      .filter((h) => h.status === 'Missing' || h.status === 'Upgrade Available')
      .map((h) => ({ hp: h, hint: hintByHardpointId.get(h.id)! }))
      .sort((a, b) => acquisitionRank(a.hint) - acquisitionRank(b.hint))
      .map((x) => x.hp),
  ]

  return {
    progress,
    buildState,
    missingSummary,
    decisionHardpoints,
    decisionCount,
    prioritizedDecisions,
    hintByHardpointId,
    availabilityByHardpointId,
  }
}
