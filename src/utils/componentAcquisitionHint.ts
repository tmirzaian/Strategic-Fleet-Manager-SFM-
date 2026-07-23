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
  ships: Ship[]
}): AcquisitionHint {
  const { componentName, componentEntityClass, currentShipId, currentBuildId, currentSlotLabel, hangarItems, installedLoadouts, reservations, ships } = params
  const availability = calculateComponentAvailability(componentName, hangarItems, installedLoadouts, reservations, componentEntityClass)

  // Tier 1 — Available Inventory: highest priority, immediately actionable.
  if (availability.availableQuantity > 0) {
    return { tone: 'success', label: 'Available in Inventory', detail: `${availability.availableQuantity} in Hangar, ready to install` }
  }

  // Tier 2 — Reserved Components: available, but reassigning it releases
  // whatever it's currently committed to.
  if (availability.reservedQuantity > 0) {
    const ownReservation =
      currentBuildId && currentSlotLabel
        ? findActiveSlotReservation(reservations, { missionConfigurationId: currentBuildId, targetSlotLabel: currentSlotLabel, componentName, componentEntityClass })
        : undefined
    if (ownReservation) {
      return { tone: 'success', label: 'Reserved For This Port', detail: 'Already committed to this exact port — no further action needed' }
    }
    return { tone: 'warning', label: 'Available to Reserve', detail: 'Owned, but committed to another Loadout — reassigning it releases that reservation' }
  }

  // Tier 3 — Installed On Other Ships: Borrow Intelligence. Names the real
  // source ship (existing InstalledLoadoutEntry data); never claims a
  // specific outcome for either ship.
  const installedElsewhere = installedLoadouts.find((e) => e.shipId !== currentShipId && e.installedItem === componentName)
  if (installedElsewhere) {
    const sourceShip = ships.find((s) => s.id === installedElsewhere.shipId)
    return { tone: 'cyan', label: 'Borrow Available', detail: `Installed on ${sourceShip?.name ?? 'another ship'} — Commander chooses whether to transfer it` }
  }

  // Tier 4 — Purchase Required: the honest "you don't have this yet"
  // fallback, explicitly future acquisition rather than immediate work
  // (looted / purchased / crafted / NPC acquired).
  return { tone: 'muted', label: 'Purchase Required', detail: 'Not currently owned — add as a newly acquired component (looted, purchased, or crafted)' }
}
