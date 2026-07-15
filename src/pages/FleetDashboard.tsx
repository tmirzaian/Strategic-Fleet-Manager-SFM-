import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, Table2, ArrowRight, Plus, CheckCircle2, AlertOctagon, PackageX } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import ShipCard from '../components/ShipCard'
import PriorityLabel from '../components/PriorityLabel'
import Badge, { ownershipTone } from '../components/Badge'
import ReadinessBar from '../components/ReadinessBar'
import AddShipModal from '../components/AddShipModal'
import { calculateBuildProgress, type BuildProgressResult } from '../utils/buildProgress'
import { deriveFleetBuildState, compareByReadinessRank } from '../utils/fleetBuildState'
import { ALL_RSI_ROLES } from '../data/shipClassification'
import { shipDefinitionById } from '../data/shipDefinitions'
import { resolveShipStockRoleFocus } from '../utils/shipIdentityLine'
import type { FleetBuildState, RsiRole } from '../types'

type OwnershipPill = 'All' | 'Owned' | 'Purchased' | 'Loaner'
type FilterPill = OwnershipPill | RsiRole
type SortMode = 'Priority' | 'Readiness'
type ViewMode = 'Card' | 'Table'

const ownershipPills: OwnershipPill[] = ['All', 'Owned', 'Purchased', 'Loaner']

export default function FleetDashboard() {
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)
  const [activeFilter, setActiveFilter] = useState<FilterPill>('All')
  const [sortMode, setSortMode] = useState<SortMode>('Priority')
  const [viewMode, setViewMode] = useState<ViewMode>('Card')
  const [addShipOpen, setAddShipOpen] = useState(false)

  const buildName = (id: string) => builds.find((b) => b.id === id)?.name ?? 'Unknown Loadout'

  // Single Build Progress engine, computed fresh from current
  // Installed + Active Target Build — never trusted from a stored
  // readiness/missing cache. Every consumer below (cards, table) reads
  // from this same map, so Fleet Dashboard can never disagree with
  // Ship Detail or Mission Control about the same ship. FleetBuildState
  // rides alongside it — Factory-only and completed-custom read the same
  // progress numbers but are never the same state (Part 7/9).
  const progressByShipId = useMemo(() => {
    const map = new Map<string, BuildProgressResult>()
    for (const ship of ships) {
      map.set(ship.id, calculateBuildProgress(hardpoints.filter((h) => h.buildId === ship.activeBuildId)))
    }
    return map
  }, [ships, hardpoints])

  const stateByShipId = useMemo(() => {
    const map = new Map<string, FleetBuildState>()
    for (const ship of ships) {
      const build = builds.find((b) => b.id === ship.activeBuildId)
      map.set(ship.id, deriveFleetBuildState(build, progressByShipId.get(ship.id)!))
    }
    return map
  }, [ships, builds, progressByShipId])

  // Role filters read ShipDefinition.classification.rsiRoles only — never
  // Build name, custom Role text, or nickname (Part 5/6). A ship with
  // multiple RSI roles can appear under more than one filter.
  const filtered = useMemo(() => {
    let result = ships
    if (activeFilter !== 'All') {
      if ((ownershipPills as string[]).includes(activeFilter)) {
        result = result.filter((s) => s.ownership === activeFilter)
      } else {
        result = result.filter((s) => shipDefinitionById.get(s.id)?.classification.rsiRoles.includes(activeFilter as RsiRole))
      }
    }
    if (sortMode === 'Priority') {
      result = [...result].sort((a, b) => a.priority - b.priority)
    } else {
      result = [...result].sort((a, b) =>
        compareByReadinessRank(
          { ship: a, state: stateByShipId.get(a.id)!, progress: progressByShipId.get(a.id)! },
          { ship: b, state: stateByShipId.get(b.id)!, progress: progressByShipId.get(b.id)! }
        )
      )
    }
    return result
  }, [ships, activeFilter, sortMode, progressByShipId, stateByShipId])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Fleet Dashboard</p>
          <h1 className="text-2xl font-display font-bold text-white">Which ship needs attention?</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddShipOpen(true)}
            className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
          >
            <Plus size={15} /> Add Ship
          </button>
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
        <div className="panel p-10 flex flex-col items-center text-center gap-2">
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
      ) : (
      <>
      {/* Filters — dedicated to filtering only (Alpha 2.4, Part 6). */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted/70 mb-1.5">Filters</p>
        <div className="flex flex-wrap items-center gap-2">
          {ownershipPills.map((pill) => (
            <button
              key={pill}
              onClick={() => setActiveFilter(pill)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === pill
                  ? 'bg-cyan/15 border-cyan/40 text-cyan'
                  : 'border-white/10 text-muted hover:text-white hover:border-white/25'
              }`}
            >
              {pill}
            </button>
          ))}
          <span className="w-px h-5 bg-white/10 mx-1" />
          {ALL_RSI_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => setActiveFilter(role)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === role
                  ? 'bg-cyan/15 border-cyan/40 text-cyan'
                  : 'border-white/10 text-muted hover:text-white hover:border-white/25'
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* Ships Shown + Sort — grouped together, visually distinct from Filters. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-3">
        <span className="text-sm text-white font-medium whitespace-nowrap">
          {filtered.length} Ship{filtered.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted/70">Sort By</span>
        <div className="flex flex-wrap items-center gap-2">
          {(['Priority', 'Readiness'] as SortMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                sortMode === mode
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'border-white/10 text-muted hover:text-white hover:border-white/25'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'Card' ? (
        // EWO-033 (Task 1) — every Fleet Asset gets its own Priority
        // wrapper in Card view, always (not only while Priority sort is
        // selected), showing that ship's own stored `priority` value —
        // never a recomputed positional rank — so the label stays
        // correct regardless of the active filter/sort mode (Ruling 7:
        // existing gaps/duplicates render honestly, not repaired here).
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                  <th className="px-5 py-3 font-medium">Ship</th>
                  <th className="px-5 py-3 font-medium">Ownership</th>
                  <th className="px-5 py-3 font-medium">Career</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Active Loadout</th>
                  <th className="px-5 py-3 font-medium w-40">Loadout Progress</th>
                  <th className="px-5 py-3 font-medium">Missing Items</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ship) => {
                  const progress = progressByShipId.get(ship.id)!
                  const state = stateByShipId.get(ship.id)!
                  return (
                    <tr key={ship.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-white font-medium whitespace-nowrap">{ship.name}</td>
                      <td className="px-5 py-3">
                        <Badge tone={ownershipTone(ship.ownership)}>{ship.ownership}</Badge>
                      </td>
                      <td className="px-5 py-3 text-muted whitespace-nowrap">{ship.career}</td>
                      <td className="px-5 py-3 text-muted whitespace-nowrap">{ship.role}</td>
                      <td className="px-5 py-3 text-cyan/90 whitespace-nowrap">{state === 'FACTORY_ONLY' ? 'Factory Loadout' : buildName(ship.activeBuildId)}</td>
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
                      <td className="px-5 py-3 text-right">
                        <Link
                          to={`/ship/${ship.id}`}
                          className="inline-flex items-center gap-1 text-cyan text-xs font-medium hover:gap-1.5 transition-all"
                        >
                          Ship Detail <ArrowRight size={13} />
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
