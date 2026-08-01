import type { HangarItem, InstalledLoadoutEntry, MissionReservation, Ship } from '../types'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { findActiveSlotReservation } from '../engine/logistics/reservationLookup'

/**
 * SW-002, "Immediate Decision Intelligence" — decision cards must answer
 * "what should I do?", never just list a missing component's name. This
 * is presentation composition only: it calls the one existing inventory-
 * accounting authority (`calculateComponentAvailability`, already used by
 * Ship Detail/Loadout Manager) and filters the already-existing
 * `installedLoadouts` list (a flat, cross-ship record the store already
 * maintains) — no new readiness/compatibility/reservation calculation.
 *
 * Deliberately stops short of projecting a hypothetical post-swap
 * readiness number (the work order's own "Railen readiness becomes 92%"
 * example) — that would require simulating an installation and is exactly
 * the "Recommendation engine" SW-002's Scope Protection excludes. This
 * only ever states real, already-true facts about where the component
 * could come from.
 *
 * SW-002 Revision A (Phase 6) — the "is this reserved" question now
 * reuses `findActiveSlotReservation`, the exact same shared reservation
 * authority `derivePortLogistics` (src/utils/portTree.ts) already uses for
 * the row's own Reservations badge. Before this, `reservedQuantity > 0`
 * alone (any ACTIVE reservation of this component, anywhere) could label
 * a component "Reserved Elsewhere" even when the reservation was actually
 * committed to THIS exact port — the banner's decision card and the row's
 * own logistics display could disagree. `currentBuildId`/`currentSlotLabel`
 * are optional so existing callers keep working; omitting them just skips
 * the slot-specific distinction and falls back to the aggregate signal.
 *
 * SW-002 Revision B (Part 2) — tier labels now match the approved
 * Quartermaster priority language exactly: "Available in Inventory" →
 * "Available to Reserve" → "Borrow Available" → "Purchase Required." The
 * first three read as actionable work the Commander can do right now; the
 * fourth is explicitly future acquisition, never dressed up as equally
 * actionable. Underlying computation is unchanged — this is a wording
 * pass, not a new authority.
 *
 * EWO-071B (Part A) — "Reserved For This Port" now wins outright over
 * "Available in Inventory," checked first regardless of whether
 * genuinely-free stock ALSO exists. Before this, a component with BOTH a
 * reservation on this exact port AND separate free stock returned
 * "Available in Inventory" (the old Tier 1 check ran before the
 * reservation check), so the Status column — which reads this same hint
 * — could show "1 AVAILABLE" while the Install/Change disclosure right
 * below it (EWO-071A) already displays a RESERVED row for the identical
 * component: two contradictory statements about the same physical asset.
 * "The Quartermaster would never recommend consuming free inventory
 * before consuming the asset already committed to this loadout." Every
 * other caller of this function (Hero, Decision Summary, Operational
 * Review's own Status column) gets the corrected priority automatically
 * — there is only ever one shared authority, never a second one specific
 * to Change Installed Components.
 */
export type AcquisitionTone = 'success' | 'warning' | 'cyan' | 'muted'

export interface AcquisitionHint {
  tone: AcquisitionTone
  /** Short label — "what should I do" in a few words. */
  label: string
  /** One supporting sentence — never a bare component name. */
  detail: string
}

export function describeAcquisitionHint(params: {
  componentName: string
  componentEntityClass?: string
  currentShipId: string
  /** The exact port this hint is being computed for — when both are
   * provided, distinguishes "already reserved for this exact port" from
   * "reserved for something else" using the same authority
   * `derivePortLogistics` uses (Phase 6). */
  currentBuildId?: string
  currentSlotLabel?: string
  hangarItems: HangarItem[]
  installedLoadouts: InstalledLoadoutEntry[]
  reservations: MissionReservation[]
  /** EWO-088 — must be active-fleet-scoped (`selectActiveShips`, SW-015C
   * convention). Tier 3 below treats a donor not present in this array as
   * not a real borrow source at all, never as a same-tier match with a
   * placeholder name — a retired ship's installed component is not an
   * offer a Commander can actually act on. */
  ships: Ship[]
}): AcquisitionHint {
  const { componentName, componentEntityClass, currentShipId, currentBuildId, currentSlotLabel, hangarItems, installedLoadouts, reservations, ships } = params
  const availability = calculateComponentAvailability(componentName, hangarItems, installedLoadouts, reservations, componentEntityClass)

  // Tier 0 (EWO-071B, Part A) — Reserved For This Port: the highest
  // actionable priority, checked before genuinely-free stock so this
  // never contradicts a RESERVED row the Install/Change disclosure is
  // already showing for the identical committed asset.
  const ownReservation =
    currentBuildId && currentSlotLabel
      ? findActiveSlotReservation(reservations, { missionConfigurationId: currentBuildId, targetSlotLabel: currentSlotLabel, componentName, componentEntityClass })
      : undefined
  if (ownReservation) {
    return { tone: 'success', label: 'Reserved For This Port', detail: 'Already committed to this exact port — no further action needed' }
  }

  // Tier 1 — Available Inventory: genuinely free stock, immediately actionable.
  if (availability.availableQuantity > 0) {
    return { tone: 'success', label: 'Available in Inventory', detail: `${availability.availableQuantity} in Hangar, ready to install` }
  }

  // Tier 2 — Reserved Components (elsewhere): owned, but committed to a
  // DIFFERENT Loadout than this one — still a distinct, useful signal for
  // the Hero/Decision Summary/Status column, even though the Install/
  // Change disclosure itself no longer offers a Reassign action for it
  // (EWO-071 dropped that tier from this one surface only).
  if (availability.reservedQuantity > 0) {
    return { tone: 'warning', label: 'Available to Reserve', detail: 'Owned, but committed to another Loadout — reassigning it releases that reservation' }
  }

  // Tier 3 — Installed On Other Ships: Borrow Intelligence. Names the real
  // source ship (existing InstalledLoadoutEntry data); never claims a
  // specific outcome for either ship.
  //
  // EWO-088 — a donor whose ship isn't in `ships` (i.e. retired) is
  // excluded here, not just mislabeled: falling through to Tier 4 is the
  // honest signal, since a Commander cannot actually transfer a component
  // off a retired vessel from this workflow.
  const installedElsewhere = installedLoadouts.find(
    (e) => e.shipId !== currentShipId && e.installedItem === componentName && ships.some((s) => s.id === e.shipId)
  )
  if (installedElsewhere) {
    const sourceShip = ships.find((s) => s.id === installedElsewhere.shipId)!
    return { tone: 'cyan', label: 'Borrow Available', detail: `Installed on ${sourceShip.name} — Commander chooses whether to transfer it` }
  }

  // Tier 4 — Purchase Required: the honest "you don't have this yet"
  // fallback, explicitly future acquisition rather than immediate work
  // (looted / purchased / crafted / NPC acquired).
  return { tone: 'muted', label: 'Purchase Required', detail: 'Not currently owned — add as a newly acquired component (looted, purchased, or crafted)' }
}
