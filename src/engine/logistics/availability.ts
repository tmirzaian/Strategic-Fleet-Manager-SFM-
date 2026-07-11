import type { HangarItem, InstalledLoadoutEntry, MissionReservation, ComponentAvailability } from '../../types'

/**
 * The one shared inventory-accounting function (Alpha 2.3, Part 5). Every
 * page that needs to know "how much of X do I own, and how much of that
 * is actually free" calls this — there is no second accounting path.
 *
 * ownedQuantity = availableQuantity + reservedQuantity + installedQuantity
 *
 * `installedQuantity` counts unique (shipId, slotLabel) physical
 * mounting points from the shared Installed Loadout (Alpha 2.2) — never
 * raw Hardpoint rows, which are duplicated once per Mission Configuration
 * sharing that slot and would over-count the same physical unit.
 *
 * HangarItem.qty represents everything owned but not currently
 * installed — i.e. available + reserved together, since a reserved item
 * is still physically sitting in the Hangar, just committed. Available is
 * therefore hangar stock minus whatever's actively reserved, floored at
 * zero so a data inconsistency can never present as negative inventory.
 */
export function calculateComponentAvailability(
  componentName: string,
  hangarItems: HangarItem[],
  installedLoadouts: InstalledLoadoutEntry[],
  reservations: MissionReservation[]
): ComponentAvailability {
  const hangarStockQuantity = hangarItems.filter((h) => h.name === componentName).reduce((sum, h) => sum + h.qty, 0)
  const installedQuantity = installedLoadouts.filter((e) => e.installedItem === componentName).length
  const reservedQuantity = reservations.filter((r) => r.componentName === componentName && r.status === 'ACTIVE').reduce((sum, r) => sum + r.quantity, 0)
  const availableQuantity = Math.max(0, hangarStockQuantity - reservedQuantity)
  const ownedQuantity = availableQuantity + reservedQuantity + installedQuantity

  return { componentName, ownedQuantity, installedQuantity, reservedQuantity, availableQuantity }
}
