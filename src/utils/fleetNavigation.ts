import type { FleetBuildState, Ownership, RsiRole, Ship } from '../types'
import type { BuildProgressResult } from './buildProgress'
import { classifyFleetStatusTile, compareByReadinessRank, type FleetStatusTile } from './fleetBuildState'

/**
 * EWO-053 (Objective B — Fleet Navigation Refactor) — a dedicated,
 * store-independent fleet-navigation layer, generalized ahead of the
 * future Ship Management Initiative per the Chief Architect's own framing:
 * "Ship Management inherits a mature fleet-navigation layer instead of
 * becoming responsible for fleet discovery, organization, filtering, and
 * configuration simultaneously."
 *
 * Architectural principle maintained throughout this module and its one
 * consumer (src/pages/FleetDashboard.tsx): Fleet selection -> Fleet
 * filtering -> Fleet sorting -> Ship selection -> Ship management. This
 * module is purely the filtering/sorting stage — it has no opinion about
 * how a ship got into the fleet or what happens after one is selected.
 *
 * Every filter dimension here reads a value the fleet already carries
 * canonically — `ship.manufacturer` (EWO-051's canonicalization; a Ship's
 * own field is copied verbatim from its ShipDefinition at materialization
 * time, so this module never re-translates or re-aliases a manufacturer
 * name of its own), the ship's own RSI role classification (Mission M-012
 * catalog data, via ALL_RSI_ROLES — never a user-defined role), and the
 * existing Build Progress/FleetBuildState engine (never a second
 * readiness calculation). No new domain concept is introduced here.
 */

export type OwnershipFilterValue = Ownership | 'All'
export type ManufacturerFilterValue = string | 'All'
export type RsiRoleFilterValue = RsiRole | 'All'
export type ReadinessFilterValue = FleetStatusTile | 'All'

/**
 * Every dimension defaults to 'All' (a no-op) and is independent of every
 * other — this is what makes filters compose (Required Feature:
 * "Composable Filters"). Adding a future dimension (Favorite, Pledged vs
 * In-game, Fuel state, Location, etc. — explicitly named as future
 * candidates this mission must not prevent) means adding one more field
 * here and one more clause in `matchesFleetFilters`; no existing
 * dimension's logic changes, and `DEFAULT_FLEET_FILTERS`/persistence below
 * need no structural change either, since both operate on the whole
 * object generically.
 */
export interface FleetFilterState {
  ownership: OwnershipFilterValue
  manufacturer: ManufacturerFilterValue
  rsiRole: RsiRoleFilterValue
  readiness: ReadinessFilterValue
}

export const DEFAULT_FLEET_FILTERS: FleetFilterState = {
  ownership: 'All',
  manufacturer: 'All',
  rsiRole: 'All',
  readiness: 'All',
}

export function isFleetFilterActive(filters: FleetFilterState): boolean {
  return filters.ownership !== 'All' || filters.manufacturer !== 'All' || filters.rsiRole !== 'All' || filters.readiness !== 'All'
}

/** One ship's worth of context this module needs to filter/sort it —
 * assembled once per render by the caller (FleetDashboard already
 * computes `progress`/`state` per ship via the shared Build Progress
 * engine; `rsiRoles` comes from the ship's own ShipDefinition
 * classification). Never re-derived internally, so this module can never
 * disagree with Ship Detail/Mission Control about readiness or role. */
export interface FleetNavigationEntry {
  ship: Ship
  rsiRoles: RsiRole[]
  state: FleetBuildState
  progress: BuildProgressResult
}

/** Pure predicate — every active ('All' excluded) dimension must match.
 * AND composition, not a single mutually-exclusive selector: this is the
 * one change that actually makes "Industrial -> ARGO -> Ready" possible,
 * where the previous single `activeFilter` pill could only ever express
 * one dimension at a time. */
export function matchesFleetFilters(entry: FleetNavigationEntry, filters: FleetFilterState): boolean {
  if (filters.ownership !== 'All' && entry.ship.ownership !== filters.ownership) return false
  if (filters.manufacturer !== 'All' && entry.ship.manufacturer !== filters.manufacturer) return false
  if (filters.rsiRole !== 'All' && !entry.rsiRoles.includes(filters.rsiRole)) return false
  if (filters.readiness !== 'All' && classifyFleetStatusTile(entry.state) !== filters.readiness) return false
  return true
}

export function applyFleetFilters<T extends FleetNavigationEntry>(entries: T[], filters: FleetFilterState): T[] {
  return entries.filter((e) => matchesFleetFilters(e, filters))
}

/** The set of manufacturers actually present in the Commander's own fleet
 * right now — never the full universe catalog (a Commander choosing "by
 * manufacturer" wants to narrow among ships they actually have, not
 * browse every manufacturer in the game). Already-canonical values
 * (ship.manufacturer), so this list needs no alias resolution of its own
 * — sorted for a stable, predictable pill/dropdown order. */
export function manufacturersInFleet(ships: Ship[]): string[] {
  return Array.from(new Set(ships.map((s) => s.manufacturer))).sort((a, b) => a.localeCompare(b))
}

export type FleetSortMode = 'Priority' | 'Readiness' | 'Name' | 'Manufacturer' | 'RsiRole'

export const ALL_FLEET_SORT_MODES: FleetSortMode[] = ['Priority', 'Readiness', 'Name', 'Manufacturer', 'RsiRole']

/**
 * Manufacturer sort compares `ship.manufacturer` directly — the canonical
 * identity EWO-051 already guarantees, never a second display-name
 * translation. RsiRole sorts by each ship's first classified role
 * (alphabetically among a ship's own roles, for a stable order when a
 * ship carries more than one) — ships with no role sort last. Every mode
 * falls back to name, then id, for a fully stable order.
 */
export function sortFleetEntries<T extends FleetNavigationEntry>(entries: T[], mode: FleetSortMode): T[] {
  const withStableFallback = (primary: number, a: T, b: T): number => {
    if (primary !== 0) return primary
    const nameDiff = a.ship.name.localeCompare(b.ship.name)
    return nameDiff !== 0 ? nameDiff : a.ship.id.localeCompare(b.ship.id)
  }

  return [...entries].sort((a, b) => {
    switch (mode) {
      case 'Priority':
        return withStableFallback(a.ship.priority - b.ship.priority, a, b)
      case 'Readiness':
        return compareByReadinessRank(a, b)
      case 'Name':
        return withStableFallback(0, a, b)
      case 'Manufacturer':
        return withStableFallback(a.ship.manufacturer.localeCompare(b.ship.manufacturer), a, b)
      case 'RsiRole': {
        // Empty-string would sort before every real role alphabetically —
        // explicit no-role-last handling instead, so an unclassified ship
        // never jumps ahead of every classified one.
        const roleA = [...a.rsiRoles].sort()[0]
        const roleB = [...b.rsiRoles].sort()[0]
        if (!roleA && !roleB) return withStableFallback(0, a, b)
        if (!roleA) return 1
        if (!roleB) return -1
        return withStableFallback(roleA.localeCompare(roleB), a, b)
      }
    }
  })
}

export type FleetViewMode = 'Card' | 'Table'

export interface FleetNavigationView {
  filters: FleetFilterState
  sortMode: FleetSortMode
  viewMode: FleetViewMode
}

export const DEFAULT_FLEET_VIEW: FleetNavigationView = { filters: DEFAULT_FLEET_FILTERS, sortMode: 'Priority', viewMode: 'Card' }

/**
 * Required Feature: Persistent View — "Commander fleet view should
 * survive normal navigation... Session persistence is sufficient unless a
 * better architectural location already exists." `sessionStorage`,
 * deliberately NOT the Zustand `persist` store `useFleetStore.ts` already
 * owns: that store's schema is versioned (`PERSIST_VERSION`) and holds
 * fleet DATA (ships, builds, hardpoints) — a Commander's transient
 * browsing preference (which filter pill is active right now) is a
 * different kind of state with a different lifetime, and folding it in
 * would mean a schema bump for a concern that has nothing to do with
 * fleet data integrity. `sessionStorage` already gives exactly the
 * required lifetime: survives navigating to Ship Detail and back (a
 * route change, not a tab close), clears on a genuine application
 * restart (a new tab/session) — matching "session persistence" literally
 * rather than the fleet-data persistence layer's own "survive a full
 * restart" contract, which this view state was never asked to have.
 * Read/write are defensive (try/catch, malformed-JSON-safe) — a Commander
 * must never see a crashed Fleet Dashboard because of a corrupted or
 * disabled sessionStorage, the same defensive posture every persisted
 * reader in this codebase already takes.
 */
const SESSION_STORAGE_KEY = 'sfm-fleet-navigation-view'

export function loadPersistedFleetView(): FleetNavigationView {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return DEFAULT_FLEET_VIEW
    const parsed = JSON.parse(raw) as Partial<FleetNavigationView>
    return {
      filters: { ...DEFAULT_FLEET_FILTERS, ...parsed.filters },
      sortMode: parsed.sortMode && ALL_FLEET_SORT_MODES.includes(parsed.sortMode) ? parsed.sortMode : DEFAULT_FLEET_VIEW.sortMode,
      viewMode: parsed.viewMode === 'Card' || parsed.viewMode === 'Table' ? parsed.viewMode : DEFAULT_FLEET_VIEW.viewMode,
    }
  } catch {
    return DEFAULT_FLEET_VIEW
  }
}

export function savePersistedFleetView(view: FleetNavigationView): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(view))
  } catch {
    // Storage unavailable/full/disabled — the Commander's session simply
    // won't remember the view across navigation; never a crash.
  }
}
