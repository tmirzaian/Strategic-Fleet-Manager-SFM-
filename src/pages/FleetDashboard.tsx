import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, Table2, ArrowRight, Plus, CheckCircle2, AlertOctagon, PackageX, ChevronDown, ChevronUp, X, SlidersHorizontal, Archive } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { selectActiveShips, selectRetiredShips } from '../utils/fleetLifecycle'
import ShipCard from '../components/ShipCard'
import PriorityLabel from '../components/PriorityLabel'
import Badge, { ownershipTone } from '../components/Badge'
import ReadinessBar from '../components/ReadinessBar'
import AddShipModal from '../components/AddShipModal'
import EnvironmentBay from '../components/layout/EnvironmentBay'
import { calculateBuildProgress, type BuildProgressResult } from '../utils/buildProgress'
import { prepareCanonicalHardpoints } from '../utils/canonicalHardpointPreparation'
import { deriveFleetBuildState } from '../utils/fleetBuildState'
import { ALL_RSI_ROLES } from '../data/shipClassification'
import { resolveShipStockRoleFocus, resolveShipRsiRoles } from '../utils/shipIdentityLine'
import {
  applyFleetFilters,
  isFleetFilterActive,
  loadPersistedFleetView,
  manufacturersInFleet,
  savePersistedFleetView,
  sortFleetEntries,
  ALL_FLEET_SORT_MODES,
  DEFAULT_FLEET_FILTERS,
  type FleetFilterState,
  type FleetNavigationEntry,
  type FleetSortMode,
  type FleetViewMode,
  type OwnershipFilterValue,
  type ReadinessFilterValue,
} from '../utils/fleetNavigation'
import type { FleetBuildState, RsiRole } from '../types'

const ownershipPills: OwnershipFilterValue[] = ['All', 'Owned', 'Purchased', 'Loaner']
const readinessPills: { value: ReadinessFilterValue; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'MISSION_READY', label: 'Ready' },
  { value: 'LOADOUTS_IN_PROGRESS', label: 'In Progress' },
  { value: 'FACTORY_LOADOUT', label: 'Factory Only' },
]
const sortLabels: Record<FleetSortMode, string> = { Priority: 'Priority', Readiness: 'Readiness', Name: 'Ship Name', Manufacturer: 'Manufacturer', RsiRole: 'RSI Role' }

export default function FleetDashboard() {
  const allShips = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)

  // SW-015C (Deliverable 7) — Active/Retired is a view toggle, not one
  // more filter chip among ownership/manufacturer/role/readiness: it
  // selects which BASE population (src/utils/fleetLifecycle.ts's one
  // canonical active/retired split) the existing filter/sort pipeline
  // below then runs against, unchanged. Defaults to Active, never
  // session-persisted like the filter/sort/view choices below — a
  // Commander should never land back on the Retired view by surprise
  // after navigating away and back (Deliverable 7: "Retired vessels must
  // not be mixed into the normal active fleet by default").
  const [lifecycleView, setLifecycleView] = useState<'active' | 'retired'>('active')
  const ships = lifecycleView === 'active' ? selectActiveShips(allShips) : selectRetiredShips(allShips)
  const retiredCount = useMemo(() => selectRetiredShips(allShips).length, [allShips])

  // EWO-053 (Objective B) — Required Feature: Persistent View. Loaded once,
  // synchronously, at first mount (not in an effect) so the Commander's
  // filter/sort/view choice is already correct on the very first render
  // after navigating back from Ship Detail — never a flash of the default
  // state before session data catches up.
  const [initialView] = useState(() => loadPersistedFleetView())
  const [filters, setFilters] = useState(initialView.filters)
  const [sortMode, setSortMode] = useState<FleetSortMode>(initialView.sortMode)
  const [viewMode, setViewMode] = useState<FleetViewMode>(initialView.viewMode)
  const [addShipOpen, setAddShipOpen] = useState(false)
  // EWO-059 (Part B) — collapsed by default every fresh mount; plain
  // component state, not session-persisted like filters/sort/view above —
  // "may automatically remain expanded only within the current session...
  // no new persistence is required" is satisfied by a component that
  // simply stays expanded for as long as the Commander stays on the page.
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  useEffect(() => {
    savePersistedFleetView({ filters, sortMode, viewMode })
  }, [filters, sortMode, viewMode])

  const buildName = (id: string) => builds.find((b) => b.id === id)?.name ?? 'Unknown Loadout'

  // Single Build Progress engine, computed fresh from current
  // Installed + Active Target Build — never trusted from a stored
  // readiness/missing cache. Every consumer below (cards, table) reads
  // from this same map, so Fleet Dashboard can never disagree with
  // Ship Detail or Mission Control about the same ship. FleetBuildState
  // rides alongside it — Factory-only and completed-custom read the same
  // progress numbers but are never the same state (Part 7/9).
  //
  // EWO-089 — routed through prepareCanonicalHardpoints (the same
  // canonical-template reconciliation Ship Management/Ship Detail already
  // apply) rather than the raw saved rows, so a ship whose Build has
  // drifted from its current canonical port structure can never disagree
  // with those two surfaces either (EWO-087 §0.3 finding).
  const progressByShipId = useMemo(() => {
    const map = new Map<string, BuildProgressResult>()
    for (const ship of ships) {
      const rawHardpoints = hardpoints.filter((h) => h.buildId === ship.activeBuildId)
      map.set(ship.id, calculateBuildProgress(prepareCanonicalHardpoints(ship.id, rawHardpoints, fleetAssets)))
    }
    return map
  }, [ships, hardpoints, fleetAssets])

  const stateByShipId = useMemo(() => {
    const map = new Map<string, FleetBuildState>()
    for (const ship of ships) {
      const build = builds.find((b) => b.id === ship.activeBuildId)
      map.set(ship.id, deriveFleetBuildState(build, progressByShipId.get(ship.id)!))
    }
    return map
  }, [ships, builds, progressByShipId])

  // EWO-053 (Objective B) — the one shared assembly point feeding the
  // dedicated fleet-navigation layer (src/utils/fleetNavigation.ts):
  // every field here already comes from an existing, authoritative source
  // (RSI role from the ship's own ShipDefinition classification — never
  // Build name, custom Role text, or nickname; state/progress from the
  // same engine every other Commander-facing screen reads). This module
  // never recomputes any of it.
  const entries = useMemo<FleetNavigationEntry[]>(
    () =>
      ships.map((ship) => ({
        ship,
        rsiRoles: resolveShipRsiRoles(ship.id, fleetAssets),
        state: stateByShipId.get(ship.id)!,
        progress: progressByShipId.get(ship.id)!,
      })),
    [ships, fleetAssets, stateByShipId, progressByShipId]
  )

  const manufacturerOptions = useMemo(() => manufacturersInFleet(ships), [ships])

  const navigatedEntries = useMemo(() => sortFleetEntries(applyFleetFilters(entries, filters), sortMode), [entries, filters, sortMode])
  const filtered = navigatedEntries.map((e) => e.ship)
  const filtersActive = isFleetFilterActive(filters)

  // EWO-059 (Part B) — one summary chip per active dimension, independent
  // of every other (removing one clears only that dimension back to
  // 'All', never the whole filter set — Clear Filters remains the only
  // action that resets all of them at once).
  const activeFilterChips = useMemo(() => {
    const chips: { key: keyof FleetFilterState; label: string }[] = []
    if (filters.ownership !== 'All') chips.push({ key: 'ownership', label: filters.ownership })
    if (filters.rsiRole !== 'All') chips.push({ key: 'rsiRole', label: filters.rsiRole })
    if (filters.manufacturer !== 'All') chips.push({ key: 'manufacturer', label: filters.manufacturer })
    if (filters.readiness !== 'All') chips.push({ key: 'readiness', label: readinessPills.find((p) => p.value === filters.readiness)?.label ?? filters.readiness })
    return chips
  }, [filters])

  const clearFilterDimension = (key: keyof FleetFilterState) => {
    setFilters((f) => ({ ...f, [key]: 'All' }))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Fleet Dashboard</p>
          <h1 className="text-2xl font-display font-bold text-white">Which ship needs attention?</h1>
          {/* EWO-073 (Commander's optional recommendation) — reinforces,
              right where the Commander lands, why a retired vessel isn't
              affecting readiness/procurement/mission planning, rather
              than leaving that only implied by the Retired tab itself. */}
          {lifecycleView === 'retired' && (
            <p className="text-xs text-muted mt-1 max-w-md">
              Viewing retired vessels. These assets are preserved but excluded from active fleet operations.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddShipOpen(true)}
            className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
          >
            <Plus size={15} /> Add Ship
          </button>
          {/* SW-015C (Deliverable 7) — Active/Retired view toggle. Retired
              only shows a badge/count when there's actually something to
              find there, so the control doesn't invite a Commander with
              no retired vessels to go looking for a Retired view that's
              always empty. */}
          <div className="flex border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setLifecycleView('active')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                lifecycleView === 'active' ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-white'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setLifecycleView('retired')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-white/10 ${
                lifecycleView === 'retired' ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-white'
              }`}
            >
              <Archive size={13} /> Retired{retiredCount > 0 ? ` (${retiredCount})` : ''}
            </button>
          </div>
          <div className="flex border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('Card')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'Card' ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-white'
              }`}
            >
              <LayoutGrid size={14} /> Card
            </button>
            <button
              onClick={() => setViewMode('Table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-white/10 ${
                viewMode === 'Table' ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-white'
              }`}
            >
              <Table2 size={14} /> Table
            </button>
          </div>
        </div>
      </div>

      {addShipOpen && <AddShipModal onClose={() => setAddShipOpen(false)} />}

      {ships.length === 0 ? (
        lifecycleView === 'retired' ? (
          <div className="panel p-10 flex flex-col items-center text-center gap-2">
            <Archive size={28} className="text-muted/60 mb-1" />
            <h2 className="font-display font-semibold text-white">No Retired Vessels</h2>
            <p className="text-sm text-muted max-w-sm">No vessels have been retired from the Fleet Registry.</p>
          </div>
        ) : retiredCount > 0 ? (
          // SW-015C — every vessel is currently retired; this is
          // distinct from a genuinely empty fleet and shouldn't read
          // as one (Add First Ship would be the wrong call to action).
          // Chief Architect Asset Handoff — deliberately no environment
          // artwork here: only the true "genuinely zero ships" branch
          // below gets it.
          <div className="panel p-10 flex flex-col items-center text-center gap-2">
            <Archive size={28} className="text-muted/60 mb-1" />
            <h2 className="font-display font-semibold text-white">No Active Vessels</h2>
            <p className="text-sm text-muted max-w-sm">Every vessel in your Fleet Registry is currently retired.</p>
            <button
              onClick={() => setLifecycleView('retired')}
              className="mt-2 inline-flex items-center gap-2 border border-white/15 text-white font-medium text-sm px-4 py-2 rounded-lg hover:border-white/35 transition-colors"
            >
              <Archive size={15} /> View Retired ({retiredCount})
            </button>
          </div>
        ) : (
          // Chief Architect Asset Handoff — the one genuine empty-fleet
          // case: ships.length === 0, not retired-view, and no retired
          // vessels exist to explain the zero either.
          <EnvironmentBay id="fleet-dashboard-empty" minHeightClassName="lg:min-h-[300px]" contentClassName="max-w-md" vignetteOpacity={0.45}>
            <div className="panel lg:bg-panel/55 lg:backdrop-blur-md p-10 flex flex-col items-center text-center gap-2">
              <PackageX size={28} className="text-muted/60 mb-1" />
              <h2 className="font-display font-semibold text-white">No Vessels Assigned</h2>
              <p className="text-sm text-muted max-w-sm">Your fleet manifest is currently empty.</p>
              <button
                onClick={() => setAddShipOpen(true)}
                className="mt-2 inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
              >
                <Plus size={15} /> Add First Ship
              </button>
            </div>
          </EnvironmentBay>
        )
      ) : (
      <>
      {/* Filters — dedicated to filtering only (Alpha 2.4, Part 6; EWO-053
          Objective B: each row is now its own independent, composable
          dimension — Ownership AND Manufacturer AND RSI Role AND
          Readiness can all be active at once, e.g. "Industrial -> ARGO ->
          Ready" — rather than one mutually-exclusive pill selector.
          EWO-059 (Part B) — collapsed by default, disclosed via one
          compact toolbar (toggle + active-filter summary + Clear
          Filters) so the fleet results start substantially higher on the
          page; the matrix itself is a pure disclosure, not a redesign. */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              onClick={() => setFiltersExpanded((v) => !v)}
              aria-expanded={filtersExpanded}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-medium border border-white/10 text-muted hover:text-white hover:border-white/25 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
            >
              <SlidersHorizontal size={12} /> Filters {filtersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {activeFilterChips.length === 0 ? (
              <span className="text-xs text-muted">All ships</span>
            ) : (
              activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => clearFilterDimension(chip.key)}
                  title={`Remove ${chip.label} filter`}
                  aria-label={`Remove ${chip.label} filter`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-cyan/40 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors"
                >
                  {chip.label} <X size={11} />
                </button>
              ))
            )}
          </div>
          {filtersActive && (
            <button onClick={() => setFilters(DEFAULT_FLEET_FILTERS)} className="text-[11px] text-cyan/80 hover:text-cyan font-medium shrink-0">
              Clear Filters
            </button>
          )}
        </div>

        {filtersExpanded && (
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted/50 w-24 shrink-0">Ownership</span>
              {ownershipPills.map((pill) => (
                <button
                  key={pill}
                  onClick={() => setFilters((f) => ({ ...f, ownership: pill }))}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filters.ownership === pill
                      ? 'bg-cyan/15 border-cyan/40 text-cyan'
                      : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                  }`}
                >
                  {pill}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted/50 w-24 shrink-0">RSI Role</span>
              <button
                onClick={() => setFilters((f) => ({ ...f, rsiRole: 'All' }))}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filters.rsiRole === 'All' ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                }`}
              >
                All
              </button>
              {ALL_RSI_ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => setFilters((f) => ({ ...f, rsiRole: role as RsiRole }))}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filters.rsiRole === role
                      ? 'bg-cyan/15 border-cyan/40 text-cyan'
                      : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>

            {manufacturerOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted/50 w-24 shrink-0">Manufacturer</span>
                <button
                  onClick={() => setFilters((f) => ({ ...f, manufacturer: 'All' }))}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filters.manufacturer === 'All' ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                  }`}
                >
                  All
                </button>
                {manufacturerOptions.map((name) => (
                  <button
                    key={name}
                    onClick={() => setFilters((f) => ({ ...f, manufacturer: name }))}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      filters.manufacturer === name
                        ? 'bg-cyan/15 border-cyan/40 text-cyan'
                        : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted/50 w-24 shrink-0">Readiness</span>
              {readinessPills.map((pill) => (
                <button
                  key={pill.value}
                  onClick={() => setFilters((f) => ({ ...f, readiness: pill.value }))}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filters.readiness === pill.value
                      ? 'bg-cyan/15 border-cyan/40 text-cyan'
                      : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ships Shown + Sort — grouped together, visually distinct from Filters. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-3">
        <span className="text-sm text-white font-medium whitespace-nowrap">
          {/* EWO-073 (Part B) — the Retired view reads "N Retired
              Vessel(s)," never "N Ships," so the count itself reinforces
              which operational context the Commander is looking at. */}
          {lifecycleView === 'retired'
            ? `${filtered.length} Retired Vessel${filtered.length !== 1 ? 's' : ''}`
            : `${filtered.length} Ship${filtered.length !== 1 ? 's' : ''}`}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted/70">Sort By</span>
        <div className="flex flex-wrap items-center gap-2">
          {ALL_FLEET_SORT_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                sortMode === mode
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'border-white/10 text-muted hover:text-white hover:border-white/25'
              }`}
            >
              {sortLabels[mode]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        // EWO-059 (Part B, Zero-results state) — a functioning filter
        // combination that happens to exclude every ship is not the same
        // thing as an empty fleet (the ships.length === 0 case above) —
        // it needs its own intentional, recoverable empty state, never a
        // blank results area that could read as a broken page.
        <div className="panel p-10 flex flex-col items-center text-center gap-2">
          <PackageX size={28} className="text-muted/60 mb-1" />
          <h2 className="font-display font-semibold text-white">No ships match these filters.</h2>
          <p className="text-sm text-muted max-w-sm">Adjust the selected filters or clear them to view your fleet.</p>
          <button
            onClick={() => setFilters(DEFAULT_FLEET_FILTERS)}
            className="mt-2 inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      ) : viewMode === 'Card' ? (
        // EWO-033 (Task 1) — every Fleet Asset gets its own Priority
        // wrapper in Card view, always (not only while Priority sort is
        // selected), showing that ship's own stored `priority` value —
        // never a recomputed positional rank — so the label stays
        // correct regardless of the active filter/sort mode. EWO-066
        // (Part G) supersedes Ruling 7's "gaps/duplicates render
        // honestly, not repaired here": the store's own read-path
        // normalization now keeps every ship's stored priority a clean,
        // unique 1..N sequence (or `null`/"Unprioritized"), so what
        // renders here is already correct rather than a raw, possibly
        // inconsistent value.
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
          {filtered.map((ship) => (
            <PriorityLabel key={ship.id} rank={ship.priority}>
              <ShipCard
                ship={ship}
                buildName={buildName(ship.activeBuildId)}
                progress={progressByShipId.get(ship.id)!}
                buildState={stateByShipId.get(ship.id)!}
                stockRoleFocus={resolveShipStockRoleFocus(ship.id, fleetAssets)}
              />
            </PriorityLabel>
          ))}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            {/* EWO-060 (Part A) — Career/Role removed (low-value, mirrored
                data already visible via the ship name/Manufacturer
                elsewhere); the reclaimed width is redistributed via an
                explicit `<colgroup>` (the same locked-column-width pattern
                Mission Control's own Procurement Work Queue table already
                uses) rather than left to auto-layout, so Ship, Active
                Loadout, and Missing Items genuinely gain room instead of
                the browser distributing it arbitrarily. */}
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[9%]" />
                <col className="w-[21%]" />
                <col className="w-[13%]" />
                <col className="w-[25%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                  <th className="px-5 py-3 font-medium">Ship</th>
                  <th className="px-5 py-3 font-medium">Ownership</th>
                  <th className="px-5 py-3 font-medium">Active Loadout</th>
                  <th className="px-5 py-3 font-medium">Loadout Progress</th>
                  <th className="px-5 py-3 font-medium">Missing Items</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ship) => {
                  const progress = progressByShipId.get(ship.id)!
                  const state = stateByShipId.get(ship.id)!
                  const isRetired = ship.lifecycleStatus === 'retired'
                  return (
                    <tr key={ship.id} className={`border-b border-white/5 last:border-0 hover:bg-white/[0.02] ${isRetired ? 'opacity-60 hover:opacity-100' : ''}`}>
                      <td className="px-5 py-3 text-white font-medium truncate">{ship.name}</td>
                      <td className="px-5 py-3 flex flex-wrap items-center gap-1.5">
                        {isRetired && <Badge tone="muted">Retired</Badge>}
                        <Badge tone={ownershipTone(ship.ownership)}>{ship.ownership}</Badge>
                      </td>
                      <td className="px-5 py-3 text-cyan/90 truncate">{state === 'FACTORY_ONLY' ? 'Factory Loadout' : buildName(ship.activeBuildId)}</td>
                      <td className="px-5 py-3">
                        {state === 'INVALID_BUILD' ? (
                          <span className="inline-flex items-center gap-1.5 text-danger text-xs font-semibold uppercase tracking-widest">
                            <AlertOctagon size={13} /> Invalid Loadout
                          </span>
                        ) : state === 'FACTORY_ONLY' ? (
                          <span className="text-xs text-muted">No custom Loadout assigned</span>
                        ) : state === 'MISSION_READY' ? (
                          <span className="inline-flex items-center gap-1.5 text-success text-xs font-semibold uppercase tracking-widest">
                            <CheckCircle2 size={13} /> Mission Ready
                          </span>
                        ) : (
                          <ReadinessBar value={progress.percentage} size="sm" />
                        )}
                      </td>
                      <td className="px-5 py-3 text-warning text-xs">
                        {state === 'FACTORY_ONLY' || state === 'MISSION_READY' ? (
                          <span className="text-success">None</span>
                        ) : progress.missingAssignments.length + progress.upgradeOpportunities.length + progress.invalidTargets.length > 0 ? (
                          [...progress.missingAssignments, ...progress.upgradeOpportunities, ...progress.invalidTargets].join(', ')
                        ) : (
                          <span className="text-success">None</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {/* SW-013B (Objective 1) — table view's own per-row
                            destination is Ship Management, matching the
                            card view's click-anywhere target above.
                            EWO-060 (Part B) — label renamed from "Ship
                            Workspace" to "Manage Ship"; destination route
                            is unchanged. */}
                        <Link
                          to={`/ship-workspace/${ship.id}`}
                          className="inline-flex items-center justify-end gap-1 text-cyan text-xs font-medium hover:gap-1.5 transition-all"
                        >
                          Manage Ship <ArrowRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
