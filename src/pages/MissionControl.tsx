import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gauge, ShipWheel, ScanSearch, Timer, LayoutGrid, ClipboardList, PackageCheck, CheckCircle2, AlertTriangle, Wrench, Factory, PackageX, Plus } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import PriorityCard from '../components/PriorityCard'
import SortableHeader from '../components/SortableHeader'
import FleetStatusTile from '../components/FleetStatusTile'
import { buildProcurementList, sortProcurementList, type ProcurementSortColumn, type SortDirection } from '../utils/procurement'
import { calculateBuildProgress } from '../utils/buildProgress'
import { deriveFleetBuildState, classifyFleetStatusTile } from '../utils/fleetBuildState'
import { buildTileContextNames } from '../utils/tileContextNames'

function StatTile({ icon: Icon, label, value, accent, sub }: { icon: any; label: string; value: string | number; accent?: string; sub?: string }) {
  return (
    <div className="panel p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-cyan/10 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-cyan" />
      </div>
      <div>
        <div className="text-2xl font-display font-bold leading-none" style={accent ? { color: accent } : undefined}>
          {value}
        </div>
        <div className="text-[11px] uppercase tracking-widest text-muted mt-1">{label}</div>
        {sub && <div className="text-[11px] text-muted/80 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function MissionControl() {
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const installedLoadouts = useFleetStore((s) => s.installedLoadouts)
  const reservations = useFleetStore((s) => s.reservations)
  const hangarItems = useFleetStore((s) => s.hangarItems)

  // Ships Active / Owned / Purchased / Loaner all derive from `ships`,
  // which only ever contains materialized Fleet Assets — a Ship
  // Definition with no Fleet Asset never appears here (Part 14). Overall
  // Fleet Readiness and Needed Items are computed fresh from the same
  // Build Progress engine every other page uses, never from a stored
  // readiness/missing cache.
  const progressByShipId = new Map(ships.map((s) => [s.id, calculateBuildProgress(hardpoints.filter((h) => h.buildId === s.activeBuildId))]))
  const overallReadiness = ships.length > 0 ? Math.round(ships.reduce((sum, s) => sum + (progressByShipId.get(s.id)?.percentage ?? 0), 0) / ships.length) : 0
  const owned = ships.filter((s) => s.ownership === 'Owned').length
  const purchased = ships.filter((s) => s.ownership === 'Purchased').length
  const loaner = ships.filter((s) => s.ownership === 'Loaner').length
  const neededItems = ships.reduce((sum, s) => {
    const p = progressByShipId.get(s.id)
    return sum + (p ? p.missingAssignments.length + p.upgradeOpportunities.length + p.invalidTargets.length : 0)
  }, 0)
  const topPriority = [...ships].sort((a, b) => a.priority - b.priority).slice(0, 3)
  const procurementRaw = buildProcurementList(hardpoints, builds, ships, installedLoadouts, reservations, hangarItems)

  // Fleet Status (Alpha 2.5A, Part 1) — a strict 3-way partition of every
  // Fleet Asset's state, so Mission Ready + Loadouts In Progress + Factory
  // Loadout always equals Ships Active. Mission Ready here means Installed
  // Match — every required target physically installed — not Package
  // Readiness (which stays inside Ship Detail/Loadout Manager, Part 1:
  // "Remove Package Staged from the top-level ship-state tile row").
  const missionReadyShips: typeof ships = []
  const inProgressShips: typeof ships = []
  const factoryShips: typeof ships = []
  for (const ship of ships) {
    const build = builds.find((b) => b.id === ship.activeBuildId)
    const progress = progressByShipId.get(ship.id)!
    const state = deriveFleetBuildState(build, progress)
    const tile = classifyFleetStatusTile(state)
    if (tile === 'MISSION_READY') missionReadyShips.push(ship)
    else if (tile === 'FACTORY_LOADOUT') factoryShips.push(ship)
    else inProgressShips.push(ship)
  }
  const missionReadyContext = buildTileContextNames(missionReadyShips)
  const inProgressContext = buildTileContextNames(inProgressShips)
  const factoryContext = buildTileContextNames(factoryShips)

  const missingComponentsCount = procurementRaw.reduce((sum, l) => sum + l.qtyNeeded, 0)
  const unreservedInventoryCount = procurementRaw.reduce((sum, l) => sum + l.availableToReserve, 0)

  const [sortColumn, setSortColumn] = useState<ProcurementSortColumn>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const procurement = sortProcurementList(procurementRaw, sortColumn, sortDirection)

  function handleSort(column: ProcurementSortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const buildName = (id: string) => builds.find((b) => b.id === id)?.name ?? 'Unknown Build'

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Mission Control</p>
        <h1 className="text-2xl font-display font-bold text-white">What should I work on?</h1>
        <p className="text-sm text-muted mt-1">A single glance at fleet status, before you spend your two minutes.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Gauge} label="Overall Fleet Readiness" value={`${overallReadiness}%`} accent="#35D0FF" />
        <StatTile
          icon={ShipWheel}
          label="Ships Active"
          value={ships.length}
          sub={`Owned ${owned} · Purchased ${purchased} · Loaner ${loaner}`}
        />
        <StatTile icon={ScanSearch} label="Needed Items" value={neededItems} accent="#FFD166" />
        <StatTile icon={Timer} label="Update Budget" value="2 min" />
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5">
          <PackageCheck size={13} /> Quartermaster Logistics
        </p>

        <p className="text-[10px] uppercase tracking-widest text-muted/60 mb-1.5">Fleet Status</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <FleetStatusTile icon={CheckCircle2} label="Mission Ready" count={missionReadyShips.length} accent="#42E695" context={missionReadyContext} />
          <FleetStatusTile icon={Wrench} label="Loadouts In Progress" count={inProgressShips.length} accent="#FFD166" context={inProgressContext} />
          <FleetStatusTile icon={Factory} label="Factory Loadout" count={factoryShips.length} context={factoryContext} />
        </div>

        <p className="text-[10px] uppercase tracking-widest text-muted/60 mb-1.5">Inventory Status</p>
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon={AlertTriangle} label="Missing Components" value={missingComponentsCount} accent={missingComponentsCount > 0 ? '#FF5F73' : undefined} />
          <StatTile icon={ScanSearch} label="Unreserved Inventory" value={unreservedInventoryCount} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-lg text-white">Top Priority Ships</h2>
          <Link to="/fleet" className="text-sm text-cyan hover:underline flex items-center gap-1">
            <LayoutGrid size={14} /> View full fleet
          </Link>
        </div>
        {ships.length === 0 ? (
          <div className="panel p-8 flex flex-col items-center text-center gap-2">
            <PackageX size={26} className="text-muted/60 mb-1" />
            <h3 className="font-display font-semibold text-white">No Vessels Assigned</h3>
            <p className="text-sm text-muted max-w-sm">Your fleet manifest is currently empty.</p>
            <Link
              to="/fleet"
              className="mt-2 inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
            >
              <Plus size={15} /> Add First Ship
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {topPriority.map((ship, i) => (
              <PriorityCard key={ship.id} ship={ship} buildName={buildName(ship.activeBuildId)} rank={i + 1} progress={progressByShipId.get(ship.id)!} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList size={18} className="text-cyan" />
          <h2 className="font-display font-semibold text-lg text-white">Procurement List</h2>
        </div>
        <p className="text-xs text-muted mb-3">
          What to go get, fleet-wide — grouped by component so you don't chase the same part twice.
        </p>
        {procurement.length === 0 ? (
          <div className="panel p-5 text-sm text-success">Every active Build target is satisfied. Nothing to procure.</div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                    <SortableHeader label="Component Name" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                    <SortableHeader label="Size / Type" column="sizeType" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                    <SortableHeader label="Qty Needed" column="quantity" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                    <SortableHeader label="Unreserved Inventory" column="unreserved" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                    <th className="px-5 py-3 font-medium">Needed By</th>
                  </tr>
                </thead>
                <tbody>
                  {procurement.map((line) => (
                    <tr key={line.itemName} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-white font-medium whitespace-nowrap">{line.itemName}</td>
                      <td className="px-5 py-3 text-muted whitespace-nowrap">{line.size} {line.type}</td>
                      <td className="px-5 py-3 font-mono text-cyan">{line.qtyNeeded > 0 ? line.qtyNeeded : <span className="text-success">0</span>}</td>
                      <td className="px-5 py-3 font-mono">
                        {line.availableToReserve > 0 ? <span className="text-cyan">{line.availableToReserve} — reserve it</span> : <span className="text-muted/50">—</span>}
                      </td>
                      <td className="px-5 py-3 text-muted text-xs">{line.neededBy.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Link to="/decision-center" className="panel p-5 flex items-center justify-between hover:border-cyan/30 hover:shadow-glow transition-all">
          <div>
            <h3 className="font-display font-semibold text-white">Found loot? Check it.</h3>
            <p className="text-xs text-muted mt-1">Run it through the Decision Center to see if you should keep it.</p>
          </div>
          <ScanSearch className="text-cyan" size={22} />
        </Link>
        <Link to="/quick-update" className="panel p-5 flex items-center justify-between hover:border-cyan/30 hover:shadow-glow transition-all">
          <div>
            <h3 className="font-display font-semibold text-white">Something changed?</h3>
            <p className="text-xs text-muted mt-1">Log it in under two minutes with Quick Update.</p>
          </div>
          <Timer className="text-cyan" size={22} />
        </Link>
      </div>
    </div>
  )
}
