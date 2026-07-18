import type { Hardpoint, MissionReservation, Ship } from '../../types'
import { identitiesMatch, resolveComponentIdentity, type ResolvedComponentIdentity } from './componentIdentityService'
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

/** EWO-STAB-003C (ADR-010) — a reservation's own canonical identity: its
 * stored `componentEntityClass` when present (set at creation time by
 * reserveComponent), otherwise resolved fresh from its legacy
 * `componentName` — the same fallback order applied everywhere else. */
function reservationIdentity(reservation: MissionReservation): ResolvedComponentIdentity | null {
  return resolveComponentIdentity(reservation.componentEntityClass ? { entityClass: reservation.componentEntityClass } : { displayName: reservation.componentName })
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
    // EWO-STAB-003C (ADR-010) — the REMOVED component's own identity,
    // never derived from the destination port: prefer the row's own
    // stored installedEntityClass (set when it was installed under this
    // mission's identity population); fall back to resolving fresh from
    // its display name for a pre-existing/legacy row that predates it.
    const removedIdentity = target.installedEntityClass ? { entityClass: target.installedEntityClass } : resolveComponentIdentity({ displayName: removedItem })
    const removedEntityClass = target.installedEntityClass ?? removedIdentity?.entityClass ?? undefined

    effects.applyShipMutation(ship.id, command.destination.slotLabel, '—')
    if (command.returnToInventory) {
      effects.returnToInventory({ name: removedItem, type: target.type, size: target.size, entityClass: removedEntityClass })
    }
    return {
      ok: true,
      shipId: ship.id,
      buildId,
      slotLabel: command.destination.slotLabel,
      resolvedDisplayName: removedItem,
      resolvedEntityClass: removedEntityClass ?? null,
      reservationFulfilled: false,
    }
  }

  // INSTALL
  const { identity, hangarItemId } = resolveIdentityFromCommand(command, state)
  if (!identity) return { ok: false, reason: 'destination-invalid', message: 'Unknown or empty component.' }

  // EWO-STAB-004A (ADR-010, Assignment 7) — checked before any other
  // validation and before any mutation: a component whose display name
  // matches more than one distinct real entityClass (e.g. `M2C "Swarm"`)
  // must never be installed by guessing which one the Commander means.
  if (identity.ambiguous) {
    return {
      ok: false,
      reason: 'identity-ambiguous',
      message: `"${identity.displayName}" matches more than one real component and cannot be installed by name alone. Select it from Hangar Inventory or a resolved identity instead.`,
    }
  }

  const target = resolveDestinationHardpoint(state, ship, command.destination)
  if (!target) return { ok: false, reason: 'destination-invalid', message: 'No matching open slot.' }

  const compatibility = checkInstallationCompatibility(identity, target, { mode: command.compatibilityMode ?? 'catalog' })
  if (!compatibility.compatible) {
    return { ok: false, reason: 'incompatible', message: compatibility.message ?? `${identity.displayName} is not compatible with that slot.` }
  }

  // EWO-STAB-003C (ADR-010) — identity-aware reservation matching:
  // entityClass compared when both the installing component and the
  // reservation resolve one; a shared display name is never sufficient
  // once a stronger signal exists on both sides (the Slipstream/Snowblind
  // collision class). Falls back to the pre-existing display-name
  // comparison whenever either side lacks an entityClass.
  const matchingReservation = state.reservations.find(
    (r) =>
      r.missionConfigurationId === buildId &&
      r.targetSlotLabel === target.slotLabel &&
      r.status === 'ACTIVE' &&
      identitiesMatch(identity, reservationIdentity(r))
  )
  const ownership = checkReservationOwnership({
    identity,
    hasMatchingReservation: Boolean(matchingReservation),
    hangarItems: state.hangarItems,
    installedLoadouts: state.installedLoadouts,
    reservations: state.reservations,
  })
  if (!ownership.ok) return { ok: false, reason: 'reserved-elsewhere', message: ownership.message }

  effects.applyShipMutation(ship.id, target.slotLabel, identity.displayName, identity.entityClass ?? undefined)

  const decrementPlan = planHangarDecrement({
    hangarItems: state.hangarItems,
    reservations: state.reservations,
    installedLoadouts: state.installedLoadouts,
    itemName: identity.displayName,
    buildId,
    slotLabel: target.slotLabel,
    matchingReservationId: matchingReservation?.id,
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
  // EWO-STAB-004A — prefers the donor's own already-stored
  // installedEntityClass over re-resolving fresh by name (Assignment 6):
  // an ambiguous display name (e.g. `M2C "Swarm"`) would otherwise be
  // silently re-guessed at transfer time even when the donor row already
  // has a specific, correct identity recorded. Falls back to name
  // resolution (guaranteed non-null for a real, non-empty, non-'—' item
  // name) if the stored entityClass no longer has a catalog presentation.
  const identity =
    (donorHardpoint.installedEntityClass ? resolveComponentIdentity({ entityClass: donorHardpoint.installedEntityClass }) : null) ??
    resolveComponentIdentity({ displayName: itemName })!

  if (identity.ambiguous) {
    return {
      ok: false,
      reason: 'identity-ambiguous',
      message: `"${identity.displayName}" matches more than one real component and cannot be transferred by name alone.`,
    }
  }

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
  // EWO-STAB-003C (ADR-010) — the donor's own stored installedEntityClass
  // is preserved through the transfer (never re-derived from the
  // recipient port), falling back to a fresh resolution for a legacy row.
  const transferredEntityClass = donorHardpoint.installedEntityClass ?? identity.entityClass ?? undefined
  effects.applyShipMutation(fromShip.id, source.slotLabel, '—')
  effects.applyShipMutation(toShip.id, destination.slotLabel, itemName, transferredEntityClass)

  return {
    ok: true,
    shipId: toShip.id,
    buildId: toBuildId,
    slotLabel: destination.slotLabel,
    resolvedDisplayName: itemName,
    resolvedEntityClass: transferredEntityClass ?? null,
    reservationFulfilled: false,
    source: { shipId: fromShip.id, buildId: fromShip.activeBuildId, slotLabel: source.slotLabel },
  }
}
