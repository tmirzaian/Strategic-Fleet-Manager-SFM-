import type { ProcurementLine, ProcurementNeededByEntry, ReservedLine } from './procurement'
import { parseSizeNumber } from './procurement'
import {
  canonicalComponentCategoryLabel,
  CANONICAL_COMPONENT_CATEGORY_ORDER,
  CANONICAL_COMPONENT_CATEGORY_LABEL,
  CANONICAL_STABLE_CATEGORY_KEYS,
} from './componentCategoryIcon'

/**
 * UX-001B — Quartermaster Briefing. Turns the same procurement data every
 * other page already computes (`buildProcurementList`,
 * `buildReservedAwaitingInstallLines` — never a second accounting
 * authority) into the two things a Quartermaster actually scans for:
 * "which category has the greatest demand" (Deliverable 1/2/7) and "which
 * individual rows are immediately actionable right now" (Deliverable 3/4).
 *
 * UX-001B.1 — categories reuse `componentCategoryIcon.ts`'s own canonical
 * component-system taxonomy (Coolers, Power Plants, Quantum Drives,
 * Shields, Weapons, ...), not `commanderSystemTaxonomy.ts`'s coarser
 * 9-bucket port-layout grouping. A Quartermaster thinks "I am short
 * twenty-one shields," not "I am short twenty-one core components" — the
 * Design System Amendment elevates this per-system taxonomy app-wide, and
 * this is its first non-Ship-Workspace consumer.
 */

const CATEGORY_DISPLAY_ORDER: string[] = CANONICAL_COMPONENT_CATEGORY_ORDER.map((key) => CANONICAL_COMPONENT_CATEGORY_LABEL[key])
const STABLE_CATEGORY_LABELS: Set<string> = new Set(CANONICAL_STABLE_CATEGORY_KEYS.map((key) => CANONICAL_COMPONENT_CATEGORY_LABEL[key]))

export interface QuartermasterDemandGroup {
  category: string
  /** Sum of `qtyNeeded` (true shortage) across every procurement line in
   * this category — Deliverable 7's "18 Needed," not a row count. Zero
   * for a stable category with nothing outstanding (UX-001B.3
   * Deliverable 3) — the caller renders that as a "Complete" state, never
   * as an absent card. */
  needed: number
}

/** Deliverable 1/2/7 — aggregate demand by category. UX-001B.3
 * (Deliverable 3/4) — the stable core categories
 * (`CANONICAL_STABLE_CATEGORY_KEYS`) always appear, even at zero, so the
 * Quartermaster Logistics layout stays fixed and learnable through
 * repetition; every other (additive/future) category still only appears
 * when it has real outstanding demand — the "don't render empty state"
 * discipline `priorityActions.ts` established for the Hero remains
 * correct for those, just not for the stable set. */
export function buildQuartermasterDemandSummary(procurementLines: ProcurementLine[]): QuartermasterDemandGroup[] {
  const totals = new Map<string, number>()
  for (const line of procurementLines) {
    if (line.qtyNeeded <= 0) continue
    const category = canonicalComponentCategoryLabel({ type: line.type })
    totals.set(category, (totals.get(category) ?? 0) + line.qtyNeeded)
  }
  const groups: QuartermasterDemandGroup[] = []
  for (const category of CATEGORY_DISPLAY_ORDER) {
    const needed = totals.get(category) ?? 0
    if (needed === 0 && !STABLE_CATEGORY_LABELS.has(category)) continue
    groups.push({ category, needed })
  }
  return groups
}

/** Deliverable 6 — one badge, one state, per row. Ordered Reserved (zero
 * further decision-making) → Available (one click, no shopping) →
 * Purchase Required (needs procurement) — the identical Commander-value
 * ordering `priorityActions.ts`'s own `PRIORITY_ACTION_CATEGORY_ORDER`
 * established for the Hero, applied here to logistics rows. */
export type ProcurementRowState = 'RESERVED' | 'AVAILABLE' | 'PURCHASE_REQUIRED'

const STATE_PRIORITY: Record<ProcurementRowState, number> = { RESERVED: 0, AVAILABLE: 1, PURCHASE_REQUIRED: 2 }

export interface WorkQueueRow {
  itemName: string
  type: string
  size: string
  category: string
  state: ProcurementRowState
  quantity: number
  neededBy: ProcurementNeededByEntry[]
}

/** Deliverable 3/4/8 — every row here is, by construction, actionable:
 * a Reserved row means "go install it," an Available row means "go
 * reserve it," a Purchase Required row means "go acquire it." A single
 * component can legitimately produce two rows (e.g. 2 available + 4 still
 * needed) — that is two distinct Commander actions, not one row with two
 * numbers crammed into it. Nothing with zero actionable quantity is ever
 * pushed, so there is no "no action" row to filter out afterward. */
export function buildQuartermasterWorkQueue(procurementLines: ProcurementLine[], reservedLines: ReservedLine[]): WorkQueueRow[] {
  const rows: WorkQueueRow[] = []
  for (const line of reservedLines) {
    rows.push({
      itemName: line.itemName,
      type: line.type,
      size: line.size,
      category: canonicalComponentCategoryLabel({ type: line.type }),
      state: 'RESERVED',
      quantity: line.quantity,
      neededBy: line.neededBy,
    })
  }
  for (const line of procurementLines) {
    const category = canonicalComponentCategoryLabel({ type: line.type })
    if (line.availableToReserve > 0) {
      rows.push({ itemName: line.itemName, type: line.type, size: line.size, category, state: 'AVAILABLE', quantity: line.availableToReserve, neededBy: line.neededBy })
    }
    if (line.qtyNeeded > 0) {
      rows.push({ itemName: line.itemName, type: line.type, size: line.size, category, state: 'PURCHASE_REQUIRED', quantity: line.qtyNeeded, neededBy: line.neededBy })
    }
  }
  return rows.sort((a, b) => STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state] || a.itemName.localeCompare(b.itemName))
}

/** UX-001B.5 Deliverable 3 — Mission Control is execution-only:
 * "If a component does not currently exist in inventory, the Commander
 * cannot act on it during today's operational briefing." Purchase
 * Required (and future Craft Required/Loot Source) rows never appear
 * here, unconditionally — not even for a category with no other
 * actionable rows. This supersedes UX-001B.4's own per-category
 * exception (which kept a bare "everything must be purchased" list
 * visible when a category owned nothing) — Commander review reclassified
 * that as procurement planning, which belongs to a future dedicated
 * tool, not today's briefing. Callers that still want to distinguish "no
 * inventory, but real demand exists" from "genuinely nothing
 * outstanding" (UX-001B.5 Deliverable 4's contextual Quartermaster
 * Assessment) should call `assessCategoryWorkQueue` on the UNFILTERED
 * rows, not this function's output — see that function's own doc
 * comment. */
export function filterActionableWorkQueue(rows: WorkQueueRow[]): WorkQueueRow[] {
  return rows.filter((row) => row.state !== 'PURCHASE_REQUIRED')
}

/** UX-001B.4/UX-001B.5 — the three operational outcomes a scope (one
 * category, or the whole fleet) can represent, and they must never share
 * the same presentation. Pass the UNFILTERED row set for that scope
 * (before `filterActionableWorkQueue` strips Purchase Required rows) —
 * this function needs to see Purchase Required rows to tell "no
 * inventory but real demand" apart from "genuinely nothing outstanding,"
 * even though Mission Control itself never renders those rows as a table:
 *   - 'ACTIONABLE' — genuinely actionable (Reserved/Available) rows are
 *     present; render the table, plus a short "N assets immediately
 *     available" assessment.
 *   - 'PROCUREMENT_ONLY' ("No Inventory Available") — no actionable rows,
 *     but real outstanding demand exists (Purchase Required rows present
 *     in the unfiltered set); render only the assessment message, no
 *     table — there is nothing actionable to tabulate.
 *   - 'COMPLETE' ("Fleet Demand Complete") — no rows of any state at all;
 *     render the Quartermaster completion assessment, no table. */
export type CategoryWorkQueueAssessment = 'ACTIONABLE' | 'PROCUREMENT_ONLY' | 'COMPLETE'

export function assessCategoryWorkQueue(categoryRows: WorkQueueRow[]): CategoryWorkQueueAssessment {
  if (categoryRows.length === 0) return 'COMPLETE'
  if (categoryRows.every((row) => row.state === 'PURCHASE_REQUIRED')) return 'PROCUREMENT_ONLY'
  return 'ACTIONABLE'
}

export type WorkQueueSortColumn = 'name' | 'sizeType' | 'quantity' | 'state'
export type WorkQueueSortDirection = 'asc' | 'desc'

/** Deliverable 2 — the click-through sort for a category-filtered queue;
 * defaults to the Commander-value state order above rather than a raw
 * quantity or alphabetical default, matching this feature's own emphasis
 * on "what's actionable" over "what sorts biggest." */
export function sortWorkQueue(rows: WorkQueueRow[], column: WorkQueueSortColumn, direction: WorkQueueSortDirection): WorkQueueRow[] {
  const factor = direction === 'asc' ? 1 : -1
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0
    if (column === 'name') {
      cmp = a.itemName.localeCompare(b.itemName)
    } else if (column === 'sizeType') {
      cmp = parseSizeNumber(a.size) - parseSizeNumber(b.size)
      if (cmp === 0) cmp = a.type.localeCompare(b.type)
      if (cmp === 0) cmp = a.itemName.localeCompare(b.itemName)
    } else if (column === 'state') {
      cmp = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state]
    } else {
      cmp = a.quantity - b.quantity
    }
    if (cmp === 0) cmp = a.itemName.localeCompare(b.itemName)
    return cmp * factor
  })
  return sorted
}
