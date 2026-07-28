import type { Build, MissionReservation, Ship } from '../types'

/**
 * SW-015C — the one canonical active-vessel predicate every business-
 * logic surface should use (Engineering Constraint: "Use one canonical
 * active-vessel predicate or registry selector across business logic
 * where practical"). A retired vessel's `Ship`/`Build`/`Hardpoint`/
 * `InstalledLoadout` rows are never deleted (see `retireFleetAsset` in
 * src/store/useFleetStore.ts) — they remain fully present in the store
 * so a Retired view can render them and recommission can restore them
 * with zero data loss. Exclusion from "the active fleet" is therefore a
 * read-time filter, applied here once, not a data-presence fact — every
 * page/utility that means "the fleet I'm currently operating," rather
 * than "every vessel record that exists," should filter through this
 * before computing readiness, demand, reservations, or selectors.
 */
export function isActiveShip(ship: Pick<Ship, 'lifecycleStatus'>): boolean {
  return ship.lifecycleStatus !== 'retired'
}

export function selectActiveShips(ships: Ship[]): Ship[] {
  return ships.filter(isActiveShip)
}

export function selectRetiredShips(ships: Ship[]): Ship[] {
  return ships.filter((s) => s.lifecycleStatus === 'retired')
}

/**
 * Deliverable 6 — every currently-ACTIVE reservation that belongs to
 * this ship, whether recorded directly against it (`fleetAssetId`,
 * despite the name, holds a `Ship.id` — see `reserveComponent`'s own
 * call sites, never `FleetAsset.id`) or against one of its Builds
 * (`missionConfigurationId`). Shared by the retire action (which
 * releases these for real) and the retirement confirmation dialog
 * (which only needs the count) so the preview and the actual effect can
 * never drift apart.
 */
export function activeReservationsForShip(shipId: string, builds: Build[], reservations: MissionReservation[]): MissionReservation[] {
  const buildIds = new Set(builds.filter((b) => b.shipId === shipId).map((b) => b.id))
  return reservations.filter((r) => r.status === 'ACTIVE' && (r.fleetAssetId === shipId || buildIds.has(r.missionConfigurationId)))
}
