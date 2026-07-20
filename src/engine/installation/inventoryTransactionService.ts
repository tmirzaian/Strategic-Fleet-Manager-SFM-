import type { HangarItem, InstalledLoadoutEntry, MissionReservation } from '../../types'
import { calculateComponentAvailability } from '../../engine/logistics/availability'
import { identitiesMatch, resolveComponentIdentity, type ResolvedComponentIdentity } from './componentIdentityService'

/**
 * EWO-STAB-003B — the single inventory-bookkeeping implementation
 * (EWO-STAB-003A §4). EWO-STAB-001 found this duplicated three separate
 * ways: `installComponent`'s reservation-quantity-spread decrement,
 * `moveToShip`'s single-hangarItemId decrement (with its own
 * double-decrement guard against the first), and `removeComponent`'s
 * add-back-via-merge. This module consolidates the first two — the two
 * that were genuinely reimplementing the same operation — into one pure
 * function. `removeComponent`'s return-to-hangar path already had a
 * single, correct implementation (`addHangarItem`'s merge-by-entityClass
 * logic) before this mission; it is referenced via the injected
 * `returnToInventory` effect (see types.ts), not duplicated here.
 *
 * Pure: takes the current arrays, returns new ones. Never touches the
 * store directly — src/store/useFleetStore.ts commits the result.
 */

export interface HangarDecrementInput {
  hangarItems: HangarItem[]
  reservations: MissionReservation[]
  installedLoadouts: InstalledLoadoutEntry[]
  itemName: string
  buildId: string
  slotLabel: string
  /** EWO-STAB-003C (ADR-010) — the reservation the ENGINE already
   * identity-matched (via identitiesMatch), passed through rather than
   * re-derived here by plain componentName equality. Re-deriving it
   * independently would risk a real inconsistency: the engine could
   * correctly refuse to treat a differing-entityClass, same-name
   * reservation as a match, while this function's own separate lookup
   * fulfilled it anyway. */
  matchingReservationId?: string
  /** The specific record Move to Ship's UI selected, when known. Absent
   * for Quick Update's install-by-typed-name flow. */
  hangarItemId?: string
  /** 'NONE' preserves the long-standing "record an install with no
   * inventory bookkeeping involved" Quick Update case (EWO-029) — no
   * hangar/reservation array is touched at all. */
  inventorySource: 'HANGAR' | 'NONE'
}

export type OwnershipCheckResult = { ok: true } | { ok: false; message: string }

/**
 * EWO-029 (Task 7, Scenario F / Design Authority Ruling 8), relocated
 * unchanged from installComponent — a physical unit already committed to
 * a DIFFERENT Fleet Asset/Build's active reservation must never be
 * silently consumed by installing here instead. Only fires when a
 * genuine competing ACTIVE reservation exists; `availableQuantity <= 0`
 * alone is not evidence of a steal.
 */
export function checkReservationOwnership(input: {
  identity: ResolvedComponentIdentity
  hasMatchingReservation: boolean
  hangarItems: HangarItem[]
  installedLoadouts: InstalledLoadoutEntry[]
  reservations: MissionReservation[]
}): OwnershipCheckResult {
  if (input.hasMatchingReservation) return { ok: true }
  // EWO-STAB-003C/003D (ADR-010) — identity-aware: a competing reservation
  // for a DIFFERENT real component that merely shares this one's display
  // name must never block this install. `calculateComponentAvailability`
  // below is now also identity-aware (EWO-STAB-003D) — passed
  // `input.identity.entityClass` — so this check and the availability
  // figure it reads agree on what "the same component" means.
  const hasCompetingReservation = input.reservations.some((r) => r.status === 'ACTIVE' && identitiesMatch(input.identity, resolveReservationIdentity(r)))
  if (!hasCompetingReservation) return { ok: true }
  const availability = calculateComponentAvailability(input.identity.displayName, input.hangarItems, input.installedLoadouts, input.reservations, input.identity.entityClass)
  if (availability.availableQuantity > 0) return { ok: true }
  return {
    ok: false,
    message: `${input.identity.displayName} has no Available stock — the remaining unit(s) are reserved for a different Fleet Asset/Build. Release that reservation first, or install using its own Fleet Asset and Loadout.`,
  }
}

function resolveReservationIdentity(reservation: MissionReservation): ResolvedComponentIdentity | null {
  return resolveComponentIdentity(reservation.componentEntityClass ? { entityClass: reservation.componentEntityClass } : { displayName: reservation.componentName })
}

export interface HangarDecrementPlan {
  hangarItems: HangarItem[]
  reservations: MissionReservation[]
  reservationFulfilled: boolean
}

/**
 * EWO-052 (Inventory Transaction Integrity Initiative) — the pure,
 * snapshot-based twin of the store's own `addHangarItem` merge logic
 * (src/store/useFleetStore.ts), so a component displaced by an INSTALL
 * that overwrites an already-occupied slot can be folded into the SAME
 * hangarItems array `planHangarDecrement` then consumes from — one
 * commit, not two independent writes.
 *
 * This exists because the engine's injected `returnToInventory` effect
 * (used standalone by REMOVE) calls the store's `addHangarItem` directly
 * against LIVE state via `get()` — correct when it's the only hangar
 * mutation in the transaction, but wrong for INSTALL: `planHangarDecrement`
 * below is pure and only ever sees the STATE SNAPSHOT captured once at
 * the top of `executeInstallation`, so a live `returnToInventory` call
 * followed by `commitHangarItems(decrementPlan.hangarItems)` would
 * silently erase the just-returned item the moment that stale-snapshot-
 * derived plan is committed (confirmed by direct reproduction during this
 * mission's investigation). Merging first, then decrementing from the
 * merged result, keeps the whole operation one atomic array transform.
 */
export function planHangarReturn(hangarItems: HangarItem[], displaced: { name: string; type: string; size: string; entityClass?: string }): HangarItem[] {
  const existing = hangarItems.find((h) => {
    if (displaced.entityClass && h.entityClass) return h.entityClass === displaced.entityClass
    if (displaced.entityClass || h.entityClass) return false
    return h.name === displaced.name && h.type === displaced.type && h.size === displaced.size
  })
  if (existing) {
    return hangarItems.map((h) => (h.id === existing.id ? { ...h, qty: h.qty + 1 } : h))
  }
  return [{ id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: displaced.name, type: displaced.type, size: displaced.size, entityClass: displaced.entityClass, qty: 1, neededBy: 'None', disposition: 'Store' }, ...hangarItems]
}

export function planHangarDecrement(input: HangarDecrementInput): HangarDecrementPlan {
  if (input.inventorySource === 'NONE') {
    return { hangarItems: input.hangarItems, reservations: input.reservations, reservationFulfilled: false }
  }

  const reservation = input.matchingReservationId ? input.reservations.find((r) => r.id === input.matchingReservationId) : undefined

  if (reservation) {
    // Alpha 2.3 (Part 12 / Golden C) — installing a reserved component
    // fulfills the reservation atomically; the committed unit's Hangar
    // quantity is consumed here too, since it was only ever "available"
    // pending this exact install.
    const reservations = input.reservations.map((r) => (r.id === reservation.id ? { ...r, status: 'FULFILLED' as const, updatedAt: new Date().toISOString() } : r))
    let remaining = reservation.quantity
    const hangarItems = input.hangarItems
      .map((h) => {
        if (h.name !== input.itemName || remaining <= 0) return h
        const take = Math.min(remaining, h.qty)
        remaining -= take
        return { ...h, qty: h.qty - take }
      })
      .filter((h) => h.qty > 0)
    return { hangarItems, reservations, reservationFulfilled: true }
  }

  if (input.hangarItemId) {
    // Move to Ship's case — decrement the exact unit the Commander
    // selected. Never runs when a reservation was already fulfilled above
    // (this function's own single `if`/`if` structure already prevents
    // double-decrementing the same physical unit — the two paths are
    // mutually exclusive by construction, not by a caller-side flag).
    const hangarItems = input.hangarItems.map((i) => (i.id === input.hangarItemId ? { ...i, qty: Math.max(0, i.qty - 1) } : i))
    return { hangarItems, reservations: input.reservations, reservationFulfilled: false }
  }

  // Pre-existing Quick Update use case (EWO-029): installing without any
  // reservation or hangar record at all — no inventory bookkeeping to do.
  return { hangarItems: input.hangarItems, reservations: input.reservations, reservationFulfilled: false }
}
