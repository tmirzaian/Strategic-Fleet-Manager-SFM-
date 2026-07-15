import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShipWheel, ScanSearch, LayoutGrid, ClipboardList, PackageCheck, CheckCircle2, AlertTriangle, Wrench, Factory, PackageX, Plus } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import ShipCard from '../components/ShipCard'
import PriorityLabel from '../components/PriorityLabel'
import { resolveShipStockRoleFocus } from '../utils/shipIdentityLine'
import SortableHeader from '../components/SortableHeader'
import FleetStatusTile from '../components/FleetStatusTile'
import CriticalMetricTile from '../components/CriticalMetricTile'
import WorkflowDestinationCard from '../components/WorkflowDestinationCard'
import PageEnvironment from '../components/layout/PageEnvironment'
import { colorFor } from '../components/ReadinessBar'
import { APP_VERSION_LABEL } from '../config/appVersion'
import { buildProcurementList, sortProcurementList, type ProcurementSortColumn, type SortDirection } from '../utils/procurement'
import { calculateBuildProgress } from '../utils/buildProgress'
import { deriveFleetBuildState, classifyFleetStatusTile } from '../utils/fleetBuildState'
import { buildTileContextNames } from '../utils/tileContextNames'

/** Circular Fleet Readiness gauge — the primary bridge instrument, docked
 * into the observation window rather than floating as its own widget.
 * Static (no transition/animation), colored by the same threshold logic
 * ReadinessBar already uses everywhere else. Not redesigned from EWO-007 —
 * only its surrounding dock changed. */
function ReadinessRing({ value }: { value: number }) {
  const viewBoxSize = 92
  const strokeWidth = 8
  const radius = (viewBoxSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(100, Math.max(0, value)) / 100)
  const color = colorFor(value)
  return (
    <div className="relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20">
      <svg viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} className="-rotate-90 w-full h-full">
        <circle cx={viewBoxSize / 2} cy={viewBoxSize / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
        <circle
          cx={viewBoxSize / 2}
          cy={viewBoxSize / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-base sm:text-lg lg:text-xl font-display font-bold text-white leading-none">{value}%</span>
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
  const fleetAssets = useFleetStore((s) => s.fleetAssets)

  // Ships Active / Needed Items are computed fresh from the same Build
  // Progress engine every other page uses, never from a stored readiness/
  // missing cache (Alpha 2.5A).
  const progressByShipId = new Map(ships.map((s) => [s.id, calculateBuildProgress(hardpoints.filter((h) => h.buildId === s.activeBuildId))]))
  const overallReadiness = ships.length > 0 ? Math.round(ships.reduce((sum, s) => sum + (progressByShipId.get(s.id)?.percentage ?? 0), 0) / ships.length) : 0
  const neededItems = ships.reduce((sum, s) => {
    const p = progressByShipId.get(s.id)
    return sum + (p ? p.missingAssignments.length + p.upgradeOpportunities.length + p.invalidTargets.length : 0)
  }, 0)
  // EWO-012: the Priority Ship section is sized for up to four records —
  // never invents a filler ship when fewer exist. EWO-033 (Task 2) raised
  // this from 3 to 4 per Commander direction; the sort/slice logic itself
  // is presentation-independent and unchanged by either card migration.
  const topPriority = [...ships].sort((a, b) => a.priority - b.priority).slice(0, 4)
  const procurementRaw = buildProcurementList(hardpoints, builds, ships, installedLoadouts, reservations, hangarItems)

  // EWO-032: computed once and reused both by the Fleet Status partition
  // below and by the Fleet Ship Card's `buildState` prop, so Mission
  // Control can never disagree with itself about the same ship's state.
  const stateByShipId = new Map(
    ships.map((s) => [s.id, deriveFleetBuildState(builds.find((b) => b.id === s.activeBuildId), progressByShipId.get(s.id)!)])
  )

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
    const tile = classifyFleetStatusTile(stateByShipId.get(ship.id)!)
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

  const buildName = (id: string) => builds.find((b) => b.id === id)?.name ?? 'Unknown Loadout'

  return (
    <div className="min-h-[calc(100vh-4rem)] md:min-h-[calc(100vh-5rem)] flex flex-col">
      <div className="space-y-8 flex-1">
        {/* DA-008.1 — the interface explains itself; no instructional copy. */}
        <div className="py-2">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide text-white uppercase">Mission Control</h1>
          <p className="text-xs uppercase tracking-[0.15em] sm:tracking-[0.3em] text-cyan/70 mt-2">Fleet Operations</p>
        </div>

        {/* Fleet Operations region — HP-001 hardpoint for the future cinematic environment,
            reserved at the left/center; the right side is the permanent command-console
            rail. Height is sized for a meaningful cinematic viewport (not the excessively
            large empty rectangle used in earlier passes) so the environment can later dock
            in without moving this information architecture.
            EWO-035A-R2 — the root's own gradient (originally /70,/60 for atmospheric depth
            before real artwork existed, then reduced to /15,/10 in EWO-035A-R1) is removed
            entirely per Commander direction: PageEnvironment's artwork is opaque, full-cover,
            and now rendered at full presentation strength (opacity/brightness/contrast/
            saturation all 1.0, see environmentAssets.ts) — any background here would only
            ever show through in the disabled/no-artwork case, and the goal is zero shading
            over the loaded image, not a fallback tone. `lg:border` and `rounded-xl` are
            framing, not shading, and are unchanged. */}
        <div className="relative overflow-hidden rounded-xl lg:border lg:border-white/15 lg:min-h-[400px] flex flex-col lg:flex-row lg:items-stretch">
          <PageEnvironment id="mission-control" />
          <div className="hidden lg:block absolute top-3 left-3 w-5 h-5 border-t border-l border-cyan/20 pointer-events-none" aria-hidden="true" />
          <div className="hidden lg:block absolute bottom-3 left-3 w-5 h-5 border-b border-l border-cyan/10 pointer-events-none" aria-hidden="true" />
          <div className="hidden lg:block relative z-10 flex-1" aria-hidden="true" />

          {/* Command-console rail — permanent. HP-002 (Commander identity/badge) and
              HP-003 (UTC time/date) are approved future hardpoints that will dock above
              the readiness console within this same vertical stack; no placeholder is
              rendered for either today.
              EWO-035A — now that the hero artwork (§ above) reads brighter, the rail
              gets its own translucent "glass" backdrop at the lg: breakpoint
              (bg-panel/55 + backdrop-blur, the same treatment Sidebar.tsx already
              uses) instead of `lg:bg-transparent`, rather than the artwork being
              re-darkened globally to keep this column legible. Deliberately still
              not the fully opaque `panel` fill (unchanged below lg:) — the artwork
              must stay visible through it at the breakpoint where they overlap. */}
          <div className="panel lg:bg-panel/55 lg:backdrop-blur-md lg:border-0 lg:border-l lg:border-white/10 lg:rounded-none relative z-10 w-full lg:w-[300px] shrink-0 p-4 lg:pl-5 lg:pr-5 flex flex-col items-center gap-4 justify-center min-w-0">
            <ReadinessRing value={overallReadiness} />
            <div className="text-[11px] uppercase tracking-widest text-muted text-center">Overall Fleet Readiness</div>
            <div className="w-full h-px bg-white/10" />
            <div className="w-full flex flex-col gap-3">
              <CriticalMetricTile icon={ShipWheel} value={ships.length} label="Ships Active" />
              <CriticalMetricTile icon={ScanSearch} value={neededItems} label="Needed Items" accent={neededItems > 0 ? '#FFD166' : undefined} />
            </div>
          </div>
        </div>

        {/* Top Priority Ship — the operational centerpiece; its own section between
            Fleet Readiness and Quartermaster Logistics per the approved eye flow. */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg text-white">Top Priority Ship</h2>
            <Link to="/fleet" className="text-xs text-muted hover:text-cyan transition-colors flex items-center gap-1">
              <LayoutGrid size={12} /> Full fleet
            </Link>
          </div>
          {ships.length === 0 ? (
            <div className="panel p-8 flex flex-col items-center text-center gap-2">
              <PackageX size={24} className="text-muted/60 mb-1" />
              <h3 className="font-display font-semibold text-white">No Vessels Assigned</h3>
              <p className="text-sm text-muted">Your fleet manifest is currently empty.</p>
              <Link
                to="/fleet"
                className="mt-2 inline-flex items-center gap-1.5 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
              >
                <Plus size={14} /> Add First Ship
              </Link>
            </div>
          ) : (
            <div
              // EWO-033 (Task 3) — the same lg/xl column thresholds Fleet
              // Dashboard's own grid uses (sm:2 -> lg:3 -> xl:4), so a
              // 4-card Priority section never renders narrower/cramped
              // cards than the identical ShipCard would get on Fleet
              // Dashboard at the same viewport width.
              className={`grid gap-5 items-stretch ${
                topPriority.length === 1
                  ? 'grid-cols-1 max-w-md'
                  : topPriority.length === 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : topPriority.length === 3
                      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              }`}
            >
              {topPriority.map((ship, i) => (
                // EWO-032/EWO-033 (Task 2/3/7): Mission Control is a
                // consumer of the canonical Fleet Ship Card — the same
                // component Fleet Dashboard renders, no duplicate
                // implementation. The only Mission-Control-specific
                // concept is the Priority label, rendered above the card
                // via the shared PriorityLabel wrapper (positional rank
                // within the Top 4, not the ship's own priority field —
                // Fleet Dashboard's wrapper shows the latter instead).
                <PriorityLabel key={ship.id} rank={i + 1}>
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
          )}
        </div>

        {/* Quartermaster Logistics — architecture approved (EWO-007); refined only.
            Fleet Status and Inventory Status remain two departments in one division. */}
        <div className="panel p-5 lg:p-6">
          <p className="text-sm font-display font-semibold text-white flex items-center gap-2 mb-4 min-w-0">
            <PackageCheck size={15} className="text-cyan shrink-0" /> <span className="truncate">Quartermaster Logistics</span>
          </p>
          <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-white/[0.04] gap-4 lg:gap-0">
            <div className="lg:pr-5 lg:flex-[3] min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted/60 mb-2">Fleet Status</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FleetStatusTile icon={CheckCircle2} label="Mission Ready" count={missionReadyShips.length} accent="#42E695" context={missionReadyContext} />
                <FleetStatusTile icon={Wrench} label="Loadouts In Progress" count={inProgressShips.length} accent="#FFD166" context={inProgressContext} />
                <FleetStatusTile icon={Factory} label="Factory Loadout" count={factoryShips.length} context={factoryContext} />
              </div>
            </div>
            <div className="lg:pl-5 lg:flex-[2] min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted/60 mb-2">Inventory Status</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CriticalMetricTile icon={AlertTriangle} label="Missing Components" value={missingComponentsCount} accent={missingComponentsCount > 0 ? '#FF5F73' : undefined} />
                <CriticalMetricTile icon={ScanSearch} label="Unreserved Inventory" value={unreservedInventoryCount} />
              </div>
            </div>
          </div>
        </div>

        {/* Procurement workflow — Procurement, Found Loot, and Quick Update read as one
            connected sequence (review, then act), not unrelated dashboard cards. */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={16} className="text-cyan" />
            <h2 className="font-display font-semibold text-lg text-white">Procurement</h2>
          </div>
          {procurement.length === 0 ? (
            <div className="panel p-5 flex items-center gap-3">
              <CheckCircle2 className="text-success shrink-0" size={22} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">All Loadout Targets Satisfied</div>
                <div className="text-xs text-muted mt-0.5">Nothing to procure fleet-wide right now.</div>
              </div>
            </div>
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
                      <th className="px-3 py-2 font-medium">Needed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {procurement.map((line) => (
                      <tr key={line.itemName} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 text-white font-medium whitespace-nowrap">{line.itemName}</td>
                        <td className="px-3 py-2 text-muted whitespace-nowrap">{line.size} {line.type}</td>
                        <td className="px-3 py-2 font-mono text-cyan">{line.qtyNeeded > 0 ? line.qtyNeeded : <span className="text-success">0</span>}</td>
                        <td className="px-3 py-2 font-mono">
                          {line.availableToReserve > 0 ? (
                            // EWO-029 (Task 10) — an unreserved-match signal
                            // must carry an actual action, not just a label;
                            // Hangar Inventory owns the Reserve workflow
                            // itself (Task 4), so this hands off there
                            // rather than duplicating it here.
                            <Link to="/hangar" className="text-cyan hover:underline" title={`Reserve ${line.itemName} in Hangar Inventory`}>
                              {line.availableToReserve} — Reserve
                            </Link>
                          ) : (
                            <span className="text-muted/50">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted text-xs">{line.neededBy.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Operational Workflow Destinations — the natural next step after
              Procurement, but workflows, not metrics: visually distinct from the data
              tiles above via WorkflowDestinationCard (EWO-011). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <WorkflowDestinationCard
              to="/decision-center"
              title="Found Loot? Check It."
              supportingLine="Review unassigned components and decide what to keep."
              illustrationId="decision-center-found-loot"
            />
            <WorkflowDestinationCard
              to="/quick-update"
              title="Something Changed?"
              supportingLine="Log new components, fittings, or fleet changes fast."
              illustrationId="quick-update-hangar"
            />
          </div>
        </div>
      </div>

      {/* Operational footer — pinned to the bottom edge of the viewport when content is
          short; existing values only (Update Budget already shown above; app version
          already shown in the sidebar identity block). */}
      <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-muted/70">
        <div>Update Budget · 2 min</div>
        <div>Strategic Fleet Manager · Quartermaster Edition · {APP_VERSION_LABEL}</div>
      </div>
    </div>
  )
}
