import type { LucideIcon } from 'lucide-react'
import type { Hardpoint, Ship, HangarItem, InstalledLoadoutEntry, MissionReservation, Build, FleetBuildState, ComponentAvailability } from '../types'
import { calculateBuildProgress, type BuildProgressResult } from './buildProgress'
import { deriveFleetBuildState } from './fleetBuildState'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { describeAcquisitionHint, type AcquisitionHint } from './componentAcquisitionHint'
import { canonicalComponentCategoryKey, CANONICAL_COMPONENT_CATEGORY_ORDER, CANONICAL_COMPONENT_CATEGORY_LABEL, CANONICAL_COMPONENT_CATEGORY_ICON } from './componentCategoryIcon'

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
 * Purchase Required (not yet owned, lowest priority). Ranks all four
 * tones `describeAcquisitionHint` returns, for ordering within
 * `prioritizedDecisions` (still used by `categoryDemand`'s full-demand
 * accounting and Change Installed Components' disclosure); EWO-065B
 * separately excludes the `'muted'` (Purchase Required) tier from
 * `actionableDecisions` (the Hero's own Decision Summary) rather than
 * changing this ranking itself.
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

/**
 * EWO-065 (Part B/D) — one category-level demand card. Reuses
 * `componentCategoryIcon.ts`'s own canonical taxonomy verbatim (the same
 * resolver, order, label, and glyph Mission Control's Quartermaster
 * Report already uses) rather than inventing a Ship-Management-only
 * classification — Part D's explicit requirement that "a component
 * cannot appear under different categories on different pages."
 */
export interface CategoryDemand {
  key: string
  label: string
  icon: LucideIcon
  /** Count of unresolved target positions (Hardpoints) in this category
   * for the current hardpoint set — a position count, not a summed
   * quantity-needed the way the fleet-wide Quartermaster Report totals
   * work (`quartermasterBriefing.ts`'s own `needed`); Part B is explicit
   * this is "the number of unresolved target positions," singular ship
   * scope. */
  count: number
}

/**
 * EWO-065 (Part B/D) — aggregates `decisionHardpoints` (the same
 * authoritative decision set the Decision Summary already uses, never a
 * second calculation) by canonical category. Demand-driven only, unlike
 * the fleet-wide Quartermaster Report's stable-5-always-visible rule
 * (`CANONICAL_STABLE_CATEGORY_KEYS`) — Part B is explicit that a category
 * with zero outstanding targets must not render a card at all, so the
 * Hero visibly compacts as demand clears rather than settling into a
 * fixed learnable layout the way the fleet dashboard does.
 */
function buildCategoryDemand(decisionHardpoints: Hardpoint[]): CategoryDemand[] {
  const counts = new Map<string, number>()
  for (const hp of decisionHardpoints) {
    const key = canonicalComponentCategoryKey(hp)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const demand: CategoryDemand[] = []
  for (const key of CANONICAL_COMPONENT_CATEGORY_ORDER) {
    const count = counts.get(key) ?? 0
    if (count === 0) continue
    demand.push({ key, label: CANONICAL_COMPONENT_CATEGORY_LABEL[key], icon: CANONICAL_COMPONENT_CATEGORY_ICON[key], count })
  }
  return demand
}

export interface ShipManagementSummary {
  progress: BuildProgressResult
  buildState: FleetBuildState
  missingSummary: string[]
  /** EWO-065 (Part B) — category-level demand cards for the Hero, ordered
   * per the canonical taxonomy, omitting anything with zero outstanding
   * targets. */
  categoryDemand: CategoryDemand[]
  /** EWO-065 (Part E) — true only when ALL of: the reviewed Build is a
   * real custom target loadout (`kind !== 'FACTORY'`), it defines at
   * least one real target (`progress.requiredAssignments > 0` — without
   * this, an entirely empty/undefined custom Build would trivially read
   * as "100% complete, nothing missing" and wrongly earn the Quartermaster
   * Completion Seal purely from having no targets at all, exactly the
   * false-positive Part E calls out by name), and every one of those
   * targets is actually satisfied (`decisionCount === 0` and
   * `progress.percentage === 100` — redundant with each other once the
   * two conditions above hold, kept both because Part E's own acceptance
   * criteria names them separately). A Factory Loadout at 100% (a
   * genuinely stock ship) deliberately never satisfies this — see
   * `deriveFleetBuildState`'s own `build.kind === 'FACTORY'` check, which
   * `MISSION_READY` already excludes Factory from, but which alone still
   * doesn't exclude the empty-custom-Build case this flag adds. */
  isFullyCompletedCustomLoadout: boolean
  /** Invalid Target rows first, then every Missing/Upgrade Available row
   * ranked by acquisition priority (see `acquisitionRank`) — EVERY
   * unresolved target position, including Purchase Required ones. This is
   * the full demand set: Missing text and `categoryDemand` both read from
   * `decisionHardpoints`/`decisionCount` (via `buildCategoryDemand`)
   * because a Purchase-Required gap is still real, unresolved demand —
   * see `isFullyCompletedCustomLoadout`, which also still requires this
   * to be zero. EWO-065B (Part "Summary Engine") — the Hero's own Decision
   * Summary panel does NOT read this; it reads `actionableDecisions`
   * below instead. */
  decisionHardpoints: Hardpoint[]
  decisionCount: number
  prioritizedDecisions: Hardpoint[]
  /** EWO-065B — the subset of `prioritizedDecisions` the Commander can
   * actually act on RIGHT NOW with current fleet resources: every Invalid
   * Target row (resolving one is always an immediate action — pick a
   * different, compatible target — never an acquisition problem), plus
   * every Missing/Upgrade Available row whose acquisition hint tone is
   * NOT `'muted'` (Purchase Required). A target that exists only in the
   * catalog and must still be obtained does not qualify — restores the
   * distinction EWO-064 (Part C) had collapsed ("even a Purchase-Required
   * gap now surfaces here... rather than being deferred to future
   * procurement and hidden"), per this mission's explicit reversal of
   * that call: Missing tells the Commander what the build lacks;
   * Immediate Decisions tells them what they can do about it right now.
   * The Hero's Decision Summary panel reads ONLY this — never
   * `prioritizedDecisions` directly — so a "Record {item}" line can never
   * be auto-generated from a catalog-only gap; the Record Newly Acquired
   * Component workflow entry point in Change Installed Components'
   * disclosure is unaffected (an explicit Commander-invoked action, not a
   * standing recommendation). */
  actionableDecisions: Hardpoint[]
  actionableCount: number
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
  const categoryDemand = buildCategoryDemand(decisionHardpoints)
  const isFullyCompletedCustomLoadout = context.build !== undefined && context.build.kind !== 'FACTORY' && progress.requiredAssignments > 0 && decisionCount === 0 && progress.percentage === 100

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

  // EWO-065B — Immediate Decisions qualification: an Invalid Target row
  // is always immediately actionable (resolving it never depends on
  // inventory — the Commander just picks a different, compatible
  // target); a Missing/Upgrade Available row qualifies only when its own
  // acquisition hint is NOT Purchase Required (`'muted'`). A gap that
  // exists only in the catalog and must still be obtained does not
  // qualify as something the Commander can do "right now."
  const actionableDecisions = prioritizedDecisions.filter((h) => h.status === 'Invalid Target' || hintByHardpointId.get(h.id)!.tone !== 'muted')
  const actionableCount = actionableDecisions.length

  return {
    progress,
    buildState,
    missingSummary,
    categoryDemand,
    isFullyCompletedCustomLoadout,
    decisionHardpoints,
    decisionCount,
    prioritizedDecisions,
    actionableDecisions,
    actionableCount,
    hintByHardpointId,
    availabilityByHardpointId,
  }
}
