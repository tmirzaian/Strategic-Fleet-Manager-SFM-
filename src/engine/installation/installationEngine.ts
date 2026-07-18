import type { Hardpoint, Ship } from '../../types'
import { resolveComponentIdentity, type ResolvedComponentIdentity } from './componentIdentityService'
import { checkInstallationCompatibility } from './compatibilityEngine'
import { checkReservationOwnership, planHangarDecrement } from './inventoryTransactionService'
import type { InstallationCommand, InstallationDestination, InstallationEffects, InstallationResult, InstallationStateSnapshot } from './types'

/**
 * EWO-STAB-003B — the installation engine: the single public entry point
 * for every component installation operation (EWO-STAB-003A §1). Only
 * `executeInstallation` and the command/result types are exported from
 * this module's index.ts — ComponentIdentityService, CompatibilityEngine,
 * and the inventory transaction functions are internal collaborators,
 * never called directly by anything outside src/engine/installation/.
 *
 * Pipeline (EWO-STAB-003A §5): Resolve Identity -> Resolve Destination ->
 * Validate Compatibility -> Validate Ownership -> Apply Ship Mutation ->
 * Apply Inventory Transaction -> Recalculate Readiness -> Commit. Every
 * validation step runs and can fail before any `effects` callback is
 * invoked — there is no partial commit to roll back, because nothing is
 * written until every check has already passed.
 */
export function executeInstallation(command: InstallationCommand, state: InstallationStateSnapshot, effects: InstallationEffects): InstallationResult {
  if (command.operation === 'TRANSFER') return executeTransfer(command, state, effects)
  return executeInstallOrRemove(command, state, effects)
}

function findShip(ships: Ship[], shipId: string): Ship | undefined {
  return ships.find((s) => s.id === shipId)
}

/** Resolves a component reference to a plain name/entityClass shape the
 * identity service accepts — the one place a `hangarItemId` reference is
 * ever turned into something else, so no other module needs to know
 * Hangar Inventory records exist at all. */
function resolveIdentityFromCommand(command: InstallationCommand, state: InstallationStateSnapshot): { identity: ResolvedComponentIdentity | null; hangarItemId?: string } {
  const component = command.component
  if (!component) return { identity: null }
  if ('hangarItemId' in component) {
    const item = state.hangarItems.find((h) => h.id === component.hangarItemId)
    if (!item) return { identity: null }
    const reference = item.entityClass ? ({ entityClass: item.entityClass } as const) : ({ displayName: item.name } as const)
    return { identity: resolveComponentIdentity(reference), hangarItemId: item.id }
  }
  return { identity: resolveComponentIdentity(component) }
}

function resolveDestinationHardpoint(state: InstallationStateSnapshot, ship: Ship, destination: InstallationDestination): Hardpoint | undefined {
  const buildId = destination.buildId ?? ship.activeBuildId
  // EWO-STAB-002 (containment), preserved verbatim: no slotLabel means no
  // mutation — never a scan across the whole build for "any open slot."
  if (!destination.slotLabel) return undefined
  return state.hardpoints.find((h) => h.buildId === buildId && h.slotLabel === destination.slotLabel && h.status !== 'OK')
}

function executeInstallOrRemove(command: InstallationCommand, state: InstallationStateSnapshot, effects: InstallationEffects): InstallationResult {
  const ship = findShip(state.ships, command.destination.shipId)
  if (!ship) return { ok: false, reason: 'ship-not-found', message: 'Item or ship not found.' }

  const buildId = command.destination.buildId ?? ship.activeBuildId

  if (command.operation === 'REMOVE') {
    if (!command.destination.slotLabel) return { ok: false, reason: 'destination-invalid', message: 'A slot is required to remove a component.' }
    const target = state.hardpoints.find((h) => h.buildId === buildId && h.slotLabel === command.destination.slotLabel)
    if (!target || target.installedItem === '—' || !target.installedItem) {
      return { ok: false, reason: 'destination-invalid', message: 'That slot has nothing installed to remove.' }
    }
    const removedItem = target.installedItem
    effects.applyShipMutation(ship.id, command.destination.slotLabel, '—')
    if (command.returnToInventory) {
      effects.returnToInventory({ name: removedItem, type: target.type, size: target.size })
    }
    return {
      ok: true,
      shipId: ship.id,
      buildId,
      slotLabel: command.destination.slotLabel,
      resolvedDisplayName: removedItem,
      resolvedEntityClass: null,
      reservationFulfilled: false,
    }
  }

  // INSTALL
  const { identity, hangarItemId } = resolveIdentityFromCommand(command, state)
  if (!identity) return { ok: false, reason: 'destination-invalid', message: 'Unknown or empty component.' }

  const target = resolveDestinationHardpoint(state, ship, command.destination)
  if (!target) return { ok: false, reason: 'destination-invalid', message: 'No matching open slot.' }

  const compatibility = checkInstallationCompatibility(identity, target, { mode: command.compatibilityMode ?? 'catalog' })
  if (!compatibility.compatible) {
    return { ok: false, reason: 'incompatible', message: compatibility.message ?? `${identity.displayName} is not compatible with that slot.` }
  }

  const matchingReservation = state.reservations.find(
    (r) =>
      r.missionConfigurationId === buildId &&
      r.targetSlotLabel === target.slotLabel &&
      r.componentName === identity.displayName &&
      r.status === 'ACTIVE'
  )
  const ownership = checkReservationOwnership({
    itemName: identity.displayName,
    hasMatchingReservation: Boolean(matchingReservation),
    hangarItems: state.hangarItems,
    installedLoadouts: state.installedLoadouts,
    reservations: state.reservations,
  })
  if (!ownership.ok) return { ok: false, reason: 'reserved-elsewhere', message: ownership.message }

  effects.applyShipMutation(ship.id, target.slotLabel, identity.displayName)

  const decrementPlan = planHangarDecrement({
    hangarItems: state.hangarItems,
    reservations: state.reservations,
    installedLoadouts: state.installedLoadouts,
    itemName: identity.displayName,
    buildId,
    slotLabel: target.slotLabel,
    hangarItemId,
    inventorySource: command.inventorySource ?? 'HANGAR',
  })
  effects.commitHangarItems(decrementPlan.hangarItems)
  effects.commitReservations(decrementPlan.reservations)

  return {
    ok: true,
    shipId: ship.id,
    buildId,
    slotLabel: target.slotLabel,
    resolvedDisplayName: identity.displayName,
    resolvedEntityClass: identity.entityClass,
    reservationFulfilled: decrementPlan.reservationFulfilled,
    hangarItemId,
  }
}

function executeTransfer(command: InstallationCommand, state: InstallationStateSnapshot, effects: InstallationEffects): InstallationResult {
  // Unlike destination.slotLabel (optional — TRANSFER preserves
  // moveComponentBetweenShips' own "scan for a compatible open slot"
  // behavior on the recipient side), the donor slot was always a
  // required parameter in the original function; preserved as a runtime
  // check here rather than a non-null assertion, so a malformed command
  // fails cleanly instead of throwing.
  const sourceSlotLabel = command.source?.slotLabel
  if (!command.source || !sourceSlotLabel) return { ok: false, reason: 'source-invalid', message: 'A source slot is required to transfer a component.' }
  const source = { ...command.source, slotLabel: sourceSlotLabel }
  const fromShip = findShip(state.ships, source.shipId)
  const toShip = findShip(state.ships, command.destination.shipId)
  if (!fromShip || !toShip) return { ok: false, reason: 'ship-not-found', message: 'Ship not found.' }

  const donorHardpoint = state.hardpoints.find((h) => h.buildId === fromShip.activeBuildId && h.slotLabel === source.slotLabel)
  if (!donorHardpoint || donorHardpoint.installedItem === '—' || !donorHardpoint.installedItem) {
    return { ok: false, reason: 'source-invalid', message: `${fromShip.name}'s ${source.slotLabel} has nothing installed to move.` }
  }
  const itemName = donorHardpoint.installedItem
  const identity = resolveComponentIdentity({ displayName: itemName })!

  // moveComponentBetweenShips' own pre-existing destination resolution,
  // preserved verbatim: same type/size as the donor hardpoint, an
  // explicit slotLabel narrows to one candidate, an open (`status !==
  // 'OK'`) slot is preferred, and the FIRST compatible slot is used only
  // when no explicit slotLabel was given (never "any slot regardless of
  // type/size" — the EWO-STAB-001/002 finding was specific to
  // installComponent, not this function).
  const toBuildId = command.destination.buildId ?? toShip.activeBuildId
  const recipientCandidates = state.hardpoints.filter((h) => h.buildId === toBuildId && (command.destination.slotLabel ? h.slotLabel === command.destination.slotLabel : true))
  const referenceSlot = { type: donorHardpoint.type, size: donorHardpoint.size }
  const compatible = recipientCandidates.filter((h) => checkInstallationCompatibility(identity, h, { mode: 'exact-slot-match', referenceSlot }).compatible)
  const destination = compatible.find((h) => h.status !== 'OK') ?? (command.destination.slotLabel ? compatible[0] : undefined)

  if (!destination) {
    return {
      ok: false,
      reason: 'destination-invalid',
      message: command.destination.slotLabel
        ? `${toShip.name}'s ${command.destination.slotLabel} is not compatible with ${itemName} (${donorHardpoint.size} ${donorHardpoint.type}).`
        : `${toShip.name} has no open ${donorHardpoint.size} ${donorHardpoint.type} slot for ${itemName}.`,
    }
  }

  // Atomic: donor removal and recipient installation applied back to back
  // with no intermediate state where the item exists on neither ship or
  // both — both effects resolve synchronously before this returns.
  effects.applyShipMutation(fromShip.id, source.slotLabel, '—')
  effects.applyShipMutation(toShip.id, destination.slotLabel, itemName)

  return {
    ok: true,
    shipId: toShip.id,
    buildId: toBuildId,
    slotLabel: destination.slotLabel,
    resolvedDisplayName: itemName,
    resolvedEntityClass: identity.entityClass,
    reservationFulfilled: false,
    source: { shipId: fromShip.id, buildId: fromShip.activeBuildId, slotLabel: source.slotLabel },
  }
}
