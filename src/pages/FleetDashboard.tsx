import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, Table2, ArrowRight } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import ShipCard from '../components/ShipCard'
import Badge, { ownershipTone } from '../components/Badge'
import ReadinessBar from '../components/ReadinessBar'

type FilterPill = 'All' | 'Owned' | 'Purchased' | 'Loaner' | 'Combat' | 'Industrial' | 'Cargo'
type SortMode = 'Priority' | 'Readiness'
type ViewMode = 'Card' | 'Table'

const filterPills: FilterPill[] = ['All', 'Owned', 'Purchased', 'Loaner', 'Combat', 'Industrial', 'Cargo']

export default function FleetDashboard() {
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const [activeFilter, setActiveFilter] = useState<FilterPill>('All')
  const [sortMode, setSortMode] = useState<SortMode>('Priority')
  const [viewMode, setViewMode] = useState<ViewMode>('Card')

  const buildName = (id: string) => builds.find((b) => b.id === id)?.name ?? 'Unknown Build'

  const filtered = useMemo(() => {
    let result = ships
    if (activeFilter !== 'All') {
      if (['Owned', 'Purchased', 'Loaner'].includes(activeFilter)) {
        result = result.filter((s) => s.ownership === activeFilter)
      } else {
        result = result.filter((s) => s.career.toLowerCase().includes(activeFilter.toLowerCase()))
      }
    }
    result = [...result].sort((a, b) => (sortMode === 'Priority' ? a.priority - b.priority : b.readiness - a.readiness))
    return result
  }, [ships, activeFilter, sortMode])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Fleet Dashboard</p>
          <h1 className="text-2xl font-display font-bold text-white">Which ship needs attention?</h1>
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

      <div className="flex flex-wrap items-center gap-2">
        {filterPills.map((pill) => (
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
            Sort by {mode}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted">{filtered.length} ship{filtered.length !== 1 ? 's' : ''} shown</p>

      {viewMode === 'Card' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((ship) => (
            <ShipCard key={ship.id} ship={ship} buildName={buildName(ship.activeBuildId)} />
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
                  <th className="px-5 py-3 font-medium">Active Build</th>
                  <th className="px-5 py-3 font-medium w-40">Readiness</th>
                  <th className="px-5 py-3 font-medium">Missing Items</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ship) => (
                  <tr key={ship.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-white font-medium whitespace-nowrap">{ship.name}</td>
                    <td className="px-5 py-3">
                      <Badge tone={ownershipTone(ship.ownership)}>{ship.ownership}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted whitespace-nowrap">{ship.career}</td>
                    <td className="px-5 py-3 text-muted whitespace-nowrap">{ship.role}</td>
                    <td className="px-5 py-3 text-cyan/90 whitespace-nowrap">{buildName(ship.activeBuildId)}</td>
                    <td className="px-5 py-3">
                      <ReadinessBar value={ship.readiness} size="sm" />
                    </td>
                    <td className="px-5 py-3 text-warning text-xs">
                      {ship.missing.length > 0 ? ship.missing.join(', ') : <span className="text-success">None</span>}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
