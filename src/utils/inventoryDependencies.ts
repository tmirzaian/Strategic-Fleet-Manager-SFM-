import type { Ship, Build, FleetAsset, Hardpoint, InstalledLoadoutEntry, MissionReservation } from '../types'
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

/**
 * EWO-029 (Task 4/8/9/12) — "which real, saved Builds currently have an
 * unresolved (non-OK, non-Invalid, non-Unresolved) target requirement for
 * this exact component, and does that requirement already have an ACTIVE
 * reservation covering it?" One shared answer, reused by three different
 * surfaces so they can never disagree with each other:
 *   - the Needed By column (Task 12) — every entry here, reserved or not;
 *   - the unreserved-match / "available upgrade" signal (Task 8/9/10) —
 *     entries with `reserved: false`, cross-checked against
 *     calculateComponentAvailability's own availableQuantity;
 *   - the Reserve modal's candidate Build/target-slot list (Task 4) — for
 *     a chosen Fleet Asset, its own unreserved entries here are exactly
 *     the compatible, selectable requirements.
 *
 * Deliberately does NOT consult Hangar stock/availability itself — this
 * answers "what does the fleet still need," not "can it be fulfilled
 * right now." Callers combine it with calculateComponentAvailability for
 * that second question, exactly like the pre-existing
 * buildProcurementList (src/utils/procurement.ts) already does — this
 * function does not replace that fleet-wide aggregate, it exposes the
 * same per-row facts at the single-component granularity the Reserve
 * workflow and Hangar Inventory row need.
 */
export interface NeededByEntry {
  shipId: string
  fleetAssetLabel: string
  hullName: string
  buildId: string
  buildName: string
  slotLabel: string
  /** True when an ACTIVE reservation already commits a specific owned
   * unit to this exact (Build, slot) requirement. */
  reserved: boolean
}

export function resolveNeededByBuilds(
  componentName: string,
  ships: Ship[],
  builds: Build[],
  fleetAssets: FleetAsset[],
  hardpoints: Hardpoint[],
  reservations: MissionReservation[]
): NeededByEntry[] {
  const entries: NeededByEntry[] = []
  for (const hp of hardpoints) {
    if (hp.targetItem !== componentName) continue
    if (hp.status === 'OK' || hp.status === 'Invalid Target' || hp.status === 'Unresolved') continue
    const build = builds.find((b) => b.id === hp.buildId)
    if (!build) continue
    const ship = ships.find((s) => s.id === build.shipId)
    if (!ship) continue
    const reserved = reservations.some(
      (r) => r.missionConfigurationId === hp.buildId && r.targetSlotLabel === hp.slotLabel && r.componentName === componentName && r.status === 'ACTIVE'
    )
    entries.push({
      shipId: ship.id,
      fleetAssetLabel: ship.name,
      hullName: hullNameFor(ship, fleetAssets),
      buildId: build.id,
      buildName: build.name,
      slotLabel: hp.slotLabel,
      reserved,
    })
  }
  return entries
}
