import type { Build, FleetAsset, MissionReservation, Ship } from '../types'
import { shipDefinitionById } from '../data/shipDefinitions'

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

/**
 * EWO-097 Amendment — "Canonical Purge Confirmation Phrase." The one
 * shared source of truth for what a Commander must type to purge a
 * retired vessel. Precedence: a non-empty, trimmed nickname wins;
 * otherwise the canonical ship-model display name. Never derived from
 * the materialized `Ship.name` (which already folds nickname-or-
 * canonical together for unrelated display purposes) — this is an
 * independent, explicitly named, independently testable resolution so
 * the purge confirmation's correctness can never silently drift if
 * `Ship.name`'s own semantics ever change for a reason unrelated to
 * purge. Falls back to the raw `shipDefinitionId` in the extreme case
 * where even the ship definition can't be resolved — never an empty
 * string, which would leave the confirmation input satisfied by nothing
 * typed at all. Every consumer (the modal heading, the "Type ___ to
 * confirm" instruction, the input's accessible label, button
 * enablement, and the destructive store action's own validation) calls
 * this one function — never a second, parallel derivation.
 */
export function resolvePurgeConfirmationPhrase(asset: Pick<FleetAsset, 'nickname' | 'shipDefinitionId'>): string {
  const nickname = asset.nickname?.trim()
  if (nickname) return nickname
  const definitionDisplayName = shipDefinitionById.get(asset.shipDefinitionId)?.displayName?.trim()
  return definitionDisplayName || asset.shipDefinitionId
}

/**
 * EWO-097 Amendment — the one normalized comparison every purge-
 * confirmation consumer (button enablement AND the store action's own
 * validation) must use, so the two can never disagree (Requirement 7).
 * Case-insensitive via `toLocaleLowerCase`, whitespace-trimmed on both
 * sides, but always a full-string comparison — never a substring/prefix
 * match, so "Sab" or "Sabre1" are rejected exactly like a mismatched
 * phrase would be.
 */
export function matchesPurgeConfirmationPhrase(entered: string, expectedPhrase: string): boolean {
  return entered.trim().toLocaleLowerCase() === expectedPhrase.trim().toLocaleLowerCase()
}
