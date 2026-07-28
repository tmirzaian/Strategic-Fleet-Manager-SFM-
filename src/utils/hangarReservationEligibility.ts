import type { Build, FleetAsset, HangarItem, Hardpoint, InstalledLoadoutEntry, MissionReservation, Ship, ComponentAvailability } from '../types'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { resolveNeededByBuilds, type NeededByEntry } from './inventoryDependencies'

/**
 * EWO-072 (Part B/K) — "Required architecture: use one canonical
 * reservation-eligibility resolver for: Reserve button visibility; Needed
 * By counts; modal Fleet Asset options; modal Build/Loadout options;
 * modal Target Requirement options. These surfaces must not
 * independently derive eligibility."
 *
 * A Reserve action is only ever meaningful when BOTH real, independent
 * facts hold at once: genuinely free stock exists
 * (`calculateComponentAvailability`'s own `availableQuantity`, the one
 * shared inventory-accounting authority — Part K), AND at least one real,
 * saved Build has an unresolved, not-yet-reserved requirement for this
 * exact component (`resolveNeededByBuilds`'s own `reserved: false`
 * entries — already the one shared "what does the fleet still need"
 * authority, EWO-029 Task 7). Neither fact alone is sufficient: stock
 * with no demand has nothing to reserve TOWARD; demand with no stock has
 * nothing to reserve WITH. Every Hangar Inventory surface that needs to
 * answer "can I reserve this right now, and against what" calls this one
 * function — never a bespoke `availableQuantity > 0` check on its own.
 */
export interface ReservationEligibility {
  availability: ComponentAvailability
  /** Every real, unresolved Build requirement for this component, reserved or not — the same list the Needed By column's own count/context uses. */
  neededBy: NeededByEntry[]
  /** The subset of `neededBy` not already covered by an ACTIVE reservation — exactly the candidate pool the Reserve modal's Fleet Asset/Build/Target selectors narrow through. */
  unreservedNeededBy: NeededByEntry[]
  /** True only when a Reserve action is genuinely meaningful: free stock AND at least one real, unresolved, unreserved target requirement. */
  eligible: boolean
}

export function resolveReservationEligibility(
  componentName: string,
  componentEntityClass: string | undefined,
  ships: Ship[],
  builds: Build[],
  fleetAssets: FleetAsset[],
  hardpoints: Hardpoint[],
  hangarItems: HangarItem[],
  installedLoadouts: InstalledLoadoutEntry[],
  reservations: MissionReservation[]
): ReservationEligibility {
  const availability = calculateComponentAvailability(componentName, hangarItems, installedLoadouts, reservations, componentEntityClass)
  const neededBy = resolveNeededByBuilds(componentName, ships, builds, fleetAssets, hardpoints, reservations)
  const unreservedNeededBy = neededBy.filter((e) => !e.reserved)
  const eligible = availability.availableQuantity > 0 && unreservedNeededBy.length > 0
  return { availability, neededBy, unreservedNeededBy, eligible }
}
