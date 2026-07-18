import type { HangarItem, InstalledLoadoutEntry, MissionReservation, ComponentAvailability } from '../../types'
// EWO-STAB-003D (ADR-010) — imported directly from componentIdentityService,
// not the installation engine's public barrel. The barrel re-exports
// executeInstallation -> inventoryTransactionService.ts -> this very file
// (it already calls calculateComponentAvailability); going through the
// barrel would close a real import cycle. componentIdentityService.ts has
// no path back here, so it's the one safe, cycle-free import.
import { identitiesMatch } from '../installation/componentIdentityService'

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
 *
 * EWO-STAB-003D (ADR-010) — `componentEntityClass` is optional and
 * additive. When it's provided AND a given HangarItem/InstalledLoadoutEntry/
 * MissionReservation also carries its own resolved entityClass, that row is
 * matched by entityClass alone — never by name — so two differently
 * cataloged components that merely share a display name are never counted
 * as the same component. Any row missing an entityClass on either side (an
 * uncataloged component, or a record persisted before this mission) falls
 * back to the exact `===` name comparison this function has always used.
 * Quantity semantics (owned/installed/reserved/available math) are
 * unchanged — only which rows count as "this component" can differ.
 */
function componentRowMatches(rowName: string, rowEntityClass: string | null | undefined, componentName: string, componentEntityClass: string | null | undefined): boolean {
  if (rowEntityClass && componentEntityClass) {
    return identitiesMatch(
      { displayName: rowName, entityClass: rowEntityClass, category: null, size: null },
      { displayName: componentName, entityClass: componentEntityClass, category: null, size: null }
    )
  }
  return rowName === componentName
}

export function calculateComponentAvailability(
  componentName: string,
  hangarItems: HangarItem[],
  installedLoadouts: InstalledLoadoutEntry[],
  reservations: MissionReservation[],
  componentEntityClass?: string | null
): ComponentAvailability {
  const hangarStockQuantity = hangarItems
    .filter((h) => componentRowMatches(h.name, h.entityClass, componentName, componentEntityClass))
    .reduce((sum, h) => sum + h.qty, 0)
  const installedQuantity = installedLoadouts.filter((e) => componentRowMatches(e.installedItem, e.entityClass, componentName, componentEntityClass)).length
  const reservedQuantity = reservations
    .filter((r) => r.status === 'ACTIVE' && componentRowMatches(r.componentName, r.componentEntityClass, componentName, componentEntityClass))
    .reduce((sum, r) => sum + r.quantity, 0)
  const availableQuantity = Math.max(0, hangarStockQuantity - reservedQuantity)
  const ownedQuantity = availableQuantity + reservedQuantity + installedQuantity

  return { componentName, ownedQuantity, installedQuantity, reservedQuantity, availableQuantity }
}
