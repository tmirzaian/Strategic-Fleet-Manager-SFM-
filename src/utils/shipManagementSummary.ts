import type { LucideIcon } from 'lucide-react'
import type { Hardpoint, Ship, HangarItem, InstalledLoadoutEntry, MissionReservation, Build, FleetBuildState, ComponentAvailability, HardpointStatus } from '../types'
import { calculateBuildProgress, type BuildProgressResult } from './buildProgress'
import { deriveFleetBuildState } from './fleetBuildState'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { describeAcquisitionHint, type AcquisitionHint } from './componentAcquisitionHint'
import { canonicalComponentCategoryKey, CANONICAL_COMPONENT_CATEGORY_ORDER, CANONICAL_COMPONENT_CATEGORY_LABEL, CANONICAL_COMPONENT_CATEGORY_ICON } from './componentCategoryIcon'
import { computeHardpointStatus } from './hardpointStatus'
import type { Tone } from '../components/Badge'

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
 * EWO-068A — the single canonical resolver for "what fulfillment state
 * should a Commander-facing Status pill show for this hardpoint," used by
 * every read-only status surface (Operational Review's Status column is
 * the first consumer; the Hero's own Decision Summary already renders
 * `hint.label` directly and doesn't need this wrapper). `hp.status`
 * (`computeHardpointStatus` — a pure installed/target/factory identity
 * comparison) stays exactly as-is for readiness/internal-logic purposes
 * (Part E) — this is a pure display derivation layered on top, never a
 * replacement, and it is NEVER computed independently by a table or any
 * other consumer (Part D — "do not maintain a second status resolver").
 *
 * Precedence (Part B): OK, Invalid Target, and Unresolved all pass
 * through `hp.status` unchanged — a genuine data problem (or a target
 * that's already satisfied) is never demoted by an inventory fact (items
 * 1/6 — Invalid Target "remains actionable regardless of inventory").
 * For every other unresolved target (`hp.status` is 'Missing' or the old
 * grade-only 'Upgrade Available'), the acquisition hint — already the one
 * canonical per-hardpoint classification every other surface
 * (`hintByHardpointId`) reads — decides the label instead: Reserved For
 * This Port and Available in Inventory both outrank the old blind grade
 * comparison (Part E's own worked examples — a genuinely reserved or
 * available exact target is never demoted to a lesser label just because
 * Installed also happens to differ from Target); the hint's own "Available
 * to Reserve" tier (owned, but currently committed to a different
 * port/build — reassigning it is a real, inventory-backed action) becomes
 * this column's narrower 'Upgrade Available' — never fabricated from
 * grade math alone (Part B item 4's explicit requirement); Borrow
 * Available passes through unchanged; Purchase Required — no current
 * fulfillment action exists — reads as Missing (Part B item 7, "may
 * represent a procurement gap but must not create an Immediate
 * Decision" — unaffected here, since EWO-065B's own actionableDecisions
 * exclusion already keeps Purchase-Required rows out of the Hero's
 * Decision Summary regardless of what this column shows).
 */
export type OperationalReviewStatus = HardpointStatus | 'Reserved For This Port' | 'Available in Inventory' | 'Borrow Available' | 'Installed'

/**
 * EWO-068B (Part D) — the acquisition-hint half of the fulfillment-status
 * derivation, pulled out to its own named function so any tree/table
 * surface holding a raw `AcquisitionHint` (not just a Hardpoint with a
 * `.status`) can resolve the SAME canonical classification —
 * `resolveOperationalReviewStatus` below is one caller; Change Installed
 * Components' own inline acquisition-hint badge (ShipWorkspacePrototype.tsx)
 * is the other, so the two never drift into rendering different labels
 * for what is provably the same underlying tier.
 */
export function fulfillmentStatusFromHint(hint: AcquisitionHint): OperationalReviewStatus {
  switch (hint.label) {
    case 'Reserved For This Port':
      return 'Reserved For This Port'
    case 'Available in Inventory':
      return 'Available in Inventory'
    case 'Available to Reserve':
      return 'Upgrade Available'
    case 'Borrow Available':
      return 'Borrow Available'
    default:
      // Purchase Required — no reserved, available, upgrade, or borrow
      // option currently exists; a real gap, but not one this column can
      // present as anything more specific than Missing.
      return 'Missing'
  }
}

export function resolveOperationalReviewStatus(hp: Hardpoint, hint: AcquisitionHint | undefined): OperationalReviewStatus {
  if (hp.status !== 'Missing' && hp.status !== 'Upgrade Available') return hp.status
  if (!hint) return hp.status
  return fulfillmentStatusFromHint(hint)
}

/**
 * EWO-068B — "Canonical Status Pills & Column Rebalance." The one shared
 * status -> {compactLabel, longLabel, tone} mapping for every Ship
 * Management tree/table surface (Operational Review's Status column,
 * Change Installed Components' inline acquisition-hint badge) — Part D's
 * explicit requirement that the same underlying state never renders as
 * "AVAILABLE" in one table and "AVAILABLE IN INVENTORY" in another.
 * `compactLabel` is what a tree/table cell renders; `longLabel` documents
 * the wording the Hero/Decision Summary independently render via
 * `AcquisitionHint.label` (Part A explicitly keeps "Hero pill wording"
 * out of scope, so the Hero does NOT consume this map — its own
 * established tone/label path from EWO-064/065B is untouched) — recorded
 * here anyway so the relationship between the two vocabularies is
 * explicit in one place rather than duplicated tribal knowledge.
 *
 * Tone (Part B, "mirror the established Mission Control palette"):
 * OK/Available both read as the same immediately-actionable green;
 * Reserved gets its OWN cyan tone (Mission Control's own canonical
 * `procurementRowStateTone('RESERVED')` — Badge.tsx — already uses cyan
 * for the identical concept), deliberately distinct from Available's
 * green even though both used to render identically via `hint.tone`;
 * Upgrade is Quartermaster Gold — "a recommendation, not a warning,"
 * never `warning`/Caution Yellow; Borrow is `muted` neutral gray — "must
 * not visually compete with Reserved/Available/Upgrade," the question
 * mark alone communicates "evaluate the consequences"; Missing/Invalid
 * both stay red, preserving the existing `danger`/`invalid` intensity
 * distinction between a procurement gap and a genuine data problem.
 */
export interface StatusPillPresentation {
  compactLabel: string
  longLabel: string
  tone: Tone
}

export const STATUS_PILL: Record<OperationalReviewStatus, StatusPillPresentation> = {
  OK: { compactLabel: 'OK', longLabel: 'OK', tone: 'success' },
  // EWO-069 (Part D item 1) — Manage Loadout's own top precedence tier:
  // the selected New Target already matches what's physically installed.
  // Conceptually the same "nothing outstanding" state as OK, worded for
  // an active planning surface rather than a read-only assessment — reuses
  // OK's own `success` tone verbatim ("the existing canonical tone"),
  // never a new color.
  Installed: { compactLabel: 'INSTALLED', longLabel: 'Installed', tone: 'success' },
  'Reserved For This Port': { compactLabel: 'RESERVED', longLabel: 'Reserved For This Port', tone: 'cyan' },
  'Available in Inventory': { compactLabel: 'AVAILABLE', longLabel: 'Available in Inventory', tone: 'success' },
  'Upgrade Available': { compactLabel: 'UPGRADE', longLabel: 'Upgrade Available', tone: 'gold' },
  'Borrow Available': { compactLabel: 'BORROW?', longLabel: 'Borrow Available', tone: 'muted' },
  Missing: { compactLabel: 'MISSING', longLabel: 'Missing', tone: 'danger' },
  'Invalid Target': { compactLabel: 'INVALID', longLabel: 'Invalid Target', tone: 'invalid' },
  Unresolved: { compactLabel: 'UNRESOLVED', longLabel: 'Unresolved', tone: 'muted' },
}

/**
 * EWO-069 (Part D/H/I) — Manage Loadout's own live Status resolver: unlike
 * Operational Review (which classifies the already-SAVED `hp.targetItem`),
 * this classifies whatever the Commander currently has SELECTED in the
 * New Target picker (`desiredTargetItem`) — the exact value driving Part
 * I's "no save/blur/refresh required" reactivity, since it's plain
 * synchronous derivation from already-reactive component state, not a
 * second async calculation. Consumes the SAME canonical
 * `fulfillmentStatusFromHint`/`STATUS_PILL` this file already established
 * for Operational Review (Part H — "do not define a separate pill
 * vocabulary"); only the INPUT (a live selection vs. a saved field) and
 * the added `Installed` precedence tier are new.
 *
 * Precedence: an unedited selection (still equal to the saved
 * `hp.targetItem`) whose SAVED status is Invalid Target/Unresolved passes
 * that through unchanged — the moment the Commander picks a different,
 * compatible option (the New Target picker only ever offers compatible
 * catalog entries), this branch no longer applies and the normal
 * Installed/hint-based resolution below takes over. Otherwise: if the
 * selection identity-matches what's physically installed (the same
 * `computeHardpointStatus` identity comparison every other status
 * resolver in this codebase already uses — never a raw `===` on display
 * names alone, so a same-named-but-differently-cataloged part is never
 * mistaken for a match), it's `Installed`; otherwise the live
 * `AcquisitionHint` (computed by the caller against the SAME selection,
 * not the saved target) decides Reserved/Available/Upgrade/Borrow/Missing.
 */
export function resolveNewTargetStatus(params: {
  hp: Hardpoint
  desiredTargetItem: string
  desiredTargetEntityClass: string | null | undefined
  isEdited: boolean
  hint: AcquisitionHint
}): OperationalReviewStatus {
  const { hp, desiredTargetItem, desiredTargetEntityClass, isEdited, hint } = params
  if (!isEdited && (hp.status === 'Invalid Target' || hp.status === 'Unresolved')) return hp.status
  const matchesInstalled =
    computeHardpointStatus(hp.installedItem, desiredTargetItem, hp.factoryItem, {
      installedEntityClass: hp.installedEntityClass,
      targetEntityClass: desiredTargetEntityClass,
      factoryEntityClass: hp.factoryEntityClass,
    }) === 'OK'
  if (matchesInstalled) return 'Installed'
  return fulfillmentStatusFromHint(hint)
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
