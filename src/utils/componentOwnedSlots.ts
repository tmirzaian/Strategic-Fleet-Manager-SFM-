import { getMiningModuleSlotCount } from '../generated/miningModuleSlots'

/**
 * FTB-001A (Workstream C) — the count of real, source-derived child
 * attachment ports a component (by entityClass) owns on its own DataCore
 * record, regardless of which physical ship port it happens to be
 * installed into. Generic over the data source: today only mining heads
 * populate this (see generated-data/mining-module-slots.json, derived by
 * scripts/generateMiningModuleSlots.ts); a future component-owned-slot
 * category (if one is ever found) only needs its own lookup merged in
 * here, never a change to the tree-construction step that consumes this.
 */
export function componentOwnedChildSlotCount(entityClass: string | null | undefined): number {
  return getMiningModuleSlotCount(entityClass)
}

export interface ComponentOwnedSlotHost {
  id: string
  slotLabel: string
  isStructural?: boolean
  installedEntityClass?: string
  targetEntityClass?: string
  factoryEntityClass?: string
}

/**
 * FTB-001A (Workstream C) — appends one synthetic child row per real
 * component-owned slot beneath every hardpoint whose CURRENTLY RELEVANT
 * component (installed, falling back to target, falling back to factory —
 * the same "what's actually there right now" precedence
 * `computeHardpointStatusWithValidation`'s callers already use elsewhere)
 * owns any. The slot count is always derived fresh from that component's
 * own identity, never from the ship or the port itself — swap a
 * Commander's mining head for a different real model (via Quick Update or
 * the Loadout Manager) and the slot count updates to match on the next
 * render, with no per-ship template change needed.
 *
 * Purely additive and generic over the row shape `T` — the caller supplies
 * `makeSlotRow` because the exact Hardpoint-shaped row differs between
 * Ship Detail's real `Hardpoint[]` and the Loadout Manager's preview rows.
 * Appended rows are linked in via the same `parentSlotLabel` mechanism
 * `buildPortTree()` already understands — no change to tree construction
 * itself was needed. Never mining-specific here: the decision of WHICH
 * components own child slots, and how many, lives entirely in
 * `componentOwnedChildSlotCount` above.
 */
export function withComponentOwnedChildSlots<T extends ComponentOwnedSlotHost>(rows: T[], makeSlotRow: (host: T, slotNumber: number, slotCount: number) => T): T[] {
  const extra: T[] = []
  for (const row of rows) {
    if (row.isStructural) continue
    const entityClass = row.installedEntityClass ?? row.targetEntityClass ?? row.factoryEntityClass
    const count = componentOwnedChildSlotCount(entityClass)
    for (let slotNumber = 1; slotNumber <= count; slotNumber++) {
      extra.push(makeSlotRow(row, slotNumber, count))
    }
  }
  return extra.length > 0 ? [...rows, ...extra] : rows
}
