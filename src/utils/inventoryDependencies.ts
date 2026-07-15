import type { Ship, Build, FleetAsset, InstalledLoadoutEntry, MissionReservation } from '../types'
import { shipDefinitionById } from '../data/shipDefinitions'
import { resolveShipDefinitionId } from './loadoutEditorModel'

/**
 * EWO-028 (Task 7) — the one shared dependency resolver. Both the Delete
 * confirmation (Task 5) and the quantity-reduction safeguard (Task 6) call
 * this same function rather than each computing their own "is this
 * component in use" logic — there is exactly one answer to "which records
 * currently consume or claim units of this component," and it lives here.
 *
 * Matches by component display name, deliberately — Installed Loadout
 * (`InstalledLoadoutEntry.installedItem`) and Mission Reservations
 * (`MissionReservation.componentName`) are both name-keyed throughout the
 * existing logistics engine (see src/engine/logistics/availability.ts's
 * own doc comment); re-keying either to a canonical component id would be
 * the schema redesign Design Authority Ruling 12 explicitly withholds
 * authorization for. A HangarItem's own `entityClass` (when present) only
 * ever identifies the INVENTORY RECORD for add/merge purposes — it plays
 * no part in dependency resolution.
 */
export interface InventoryDependency {
  kind: 'INSTALLED' | 'RESERVED'
  fleetAssetId: string
  /** Nickname if one is set, otherwise the hull's own display name —
   * matches Ship.name's existing convention everywhere else in the app. */
  fleetAssetLabel: string
  /** The hull/model name, resolved from the canonical ShipDefinition —
   * always present even when a nickname has replaced Ship.name. */
  hullName: string
  buildId: string
  buildName: string
  quantity: number
  reservationId?: string
}

function hullNameFor(ship: Ship, fleetAssets: FleetAsset[]): string {
  const definitionId = resolveShipDefinitionId(ship.id, fleetAssets)
  const hull = definitionId ? shipDefinitionById.get(definitionId)?.displayName : undefined
  return hull ?? ship.name
}

export function resolveInventoryDependencies(
  componentName: string,
  ships: Ship[],
  builds: Build[],
  fleetAssets: FleetAsset[],
  installedLoadouts: InstalledLoadoutEntry[],
  reservations: MissionReservation[]
): InventoryDependency[] {
  const dependencies: InventoryDependency[] = []

  // Installed Loadout is shared across every Mission Configuration a ship
  // has (Alpha 2.2) — not tied to one specific Build — so the Build named
  // here is the ship's currently Active one, the single most actionable
  // answer to "which Build is this physically sitting in," not a claim
  // that the unit belongs exclusively to that Build.
  for (const entry of installedLoadouts) {
    if (entry.installedItem !== componentName) continue
    const ship = ships.find((s) => s.id === entry.shipId)
    if (!ship) continue
    const build = builds.find((b) => b.id === ship.activeBuildId)
    dependencies.push({
      kind: 'INSTALLED',
      fleetAssetId: ship.id,
      fleetAssetLabel: ship.name,
      hullName: hullNameFor(ship, fleetAssets),
      buildId: build?.id ?? ship.activeBuildId,
      buildName: build?.name ?? 'Unknown Loadout',
      quantity: 1,
    })
  }

  for (const r of reservations) {
    if (r.componentName !== componentName || r.status !== 'ACTIVE') continue
    const ship = ships.find((s) => s.id === r.fleetAssetId)
    const build = builds.find((b) => b.id === r.missionConfigurationId)
    dependencies.push({
      kind: 'RESERVED',
      fleetAssetId: r.fleetAssetId,
      fleetAssetLabel: ship?.name ?? 'Unknown Fleet Asset',
      hullName: ship ? hullNameFor(ship, fleetAssets) : 'Unknown Fleet Asset',
      buildId: r.missionConfigurationId,
      buildName: build?.name ?? 'Unknown Loadout',
      quantity: r.quantity,
      reservationId: r.id,
    })
  }

  return dependencies
}

/** "Origin 135c — Stealth Build" (no nickname) or 'Cutlass Black "Black
 * Betty" — PvE Build' (nickname set) — the exact format this mission's
 * own warning-copy examples use. */
export function formatDependencyLabel(dep: InventoryDependency): string {
  const hasNickname = dep.fleetAssetLabel !== dep.hullName
  const shipPart = hasNickname ? `${dep.hullName} "${dep.fleetAssetLabel}"` : dep.hullName
  return `${shipPart} — ${dep.buildName}`
}

export function totalClaimedQuantity(dependencies: InventoryDependency[]): number {
  return dependencies.reduce((sum, d) => sum + d.quantity, 0)
}
