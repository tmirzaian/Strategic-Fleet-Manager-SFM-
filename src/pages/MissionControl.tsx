import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShipWheel,
  LayoutGrid,
  ClipboardList,
  PackageCheck,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Factory,
  PackageX,
  Plus,
  ScanSearch,
  AlertOctagon,
  BookmarkCheck,
  PackageOpen,
  ArrowUpCircle,
  XCircle,
} from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import ShipCard from '../components/ShipCard'
import PriorityLabel from '../components/PriorityLabel'
import { resolveShipStockRoleFocus } from '../utils/shipIdentityLine'
import SortableHeader from '../components/SortableHeader'
import FleetStatusTile from '../components/FleetStatusTile'
import CriticalMetricTile from '../components/CriticalMetricTile'
import ActionCard from '../components/ActionCard'
import WorkflowDestinationCard from '../components/WorkflowDestinationCard'
import PageEnvironment from '../components/layout/PageEnvironment'
import { colorFor } from '../components/ReadinessBar'
import { buildProcurementList, sortProcurementList, type ProcurementSortColumn, type SortDirection } from '../utils/procurement'
import { calculateBuildProgress } from '../utils/buildProgress'
import { deriveFleetBuildState, classifyFleetStatusTile } from '../utils/fleetBuildState'
import { buildTileContextNames, type TileContextResult } from '../utils/tileContextNames'
import { deriveFleetPriorityActions, type PriorityActionCategory } from '../utils/priorityActions'

/** UX-001A.2 — the exact same per-ship deep-link markup Priority Actions
 * already rendered (never changed, per this mission's own "no changes to
 * deep-link behavior" constraint) — now passed as an Action Card's own
 * `children` (supporting context) rather than owned by a bespoke row
 * component. Kept here, not inside ActionCard itself, so ActionCard stays
 * domain-agnostic (no ship/fleet concept baked into a component meant for
 * reuse across Decision Center, Fleet Dashboard, and future modules). */
function renderShipContext(context: TileContextResult) {
  if (context.shown.length === 0) return null
  return (
    <span title={context.shown.map((c) => c.name).join(', ')}>
      {context.shown.map((entry, i) => (
        <span key={entry.shipId}>
          {i > 0 && ' • '}
          <Link to={`/ship-workspace/${entry.shipId}`} className="hover:text-cyan hover:underline">
            {entry.name}
          </Link>
        </span>
      ))}
      {context.overflowCount > 0 && (
        <>
          {' '}
          <Link to="/fleet" className="hover:text-cyan hover:underline">
            +{context.overflowCount}
          </Link>
        </>
      )}
    </span>
  )
}

/** UX-001A — Glyph Standard v1 (Hero-scoped): one icon, one accent color
 * family, per Priority Actions category. Color communicates state (danger
 * red = a real problem, success green = a zero-friction win available
 * right now, warning gold = an optional improvement); the glyph
 * disambiguates meaning within a shared color. Never reused for another
 * concept within the Hero — see ActionCard's own doc comment. */
const PRIORITY_ACTION_PRESENTATION: Record<PriorityActionCategory, { label: string; icon: any; accent: string }> = {
  INVALID_TARGET: { label: 'Invalid Targets', icon: AlertOctagon, accent: '#FF5F73' },
  RESERVED_AWAITING_INSTALL: { label: 'Reserved — Awaiting Install', icon: BookmarkCheck, accent: '#42E695' },
  READY_TO_INSTALL: { label: 'Ready to Install', icon: PackageOpen, accent: '#42E695' },
  UPGRADE_OPPORTUNITY: { label: 'Upgrade Opportunities', icon: ArrowUpCircle, accent: '#FFD166' },
  CRITICAL_MISSING: { label: 'Critical Missing Components', icon: XCircle, accent: '#FF5F73' },
}

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
    // UX-001A.3 (Deliverable 1) — diameter raised ~7% at every breakpoint
    // (56→60, 64→68, 80→86) so Fleet Readiness reads as the right column's
    // first focal point. Everything that scales with the container (stroke
    // width, cap style, track/value colors) scales with it automatically
    // via the shared viewBox — no separate styling change needed to keep
    // the ring's existing proportions intact.
    <div className="relative shrink-0 w-[60px] h-[60px] sm:w-[68px] sm:h-[68px] lg:w-[86px] lg:h-[86px]">
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

  // Ships Active is computed fresh from the same Build Progress engine
  // every other page uses, never from a stored readiness/missing cache
  // (Alpha 2.5A). UX-001A — the old standalone "Needed Items" raw count
  // is retired: Priority Actions (below) now conveys the same "something
  // needs attention" signal in genuinely actionable, categorized form, so
  // keeping both would repeat one fact under two different numbers
  // (Engineering Constraint: "Do not add additional metrics simply
  // because space exists").
  const progressByShipId = new Map(ships.map((s) => [s.id, calculateBuildProgress(hardpoints.filter((h) => h.buildId === s.activeBuildId))]))
  const overallReadiness = ships.length > 0 ? Math.round(ships.reduce((sum, s) => sum + (progressByShipId.get(s.id)?.percentage ?? 0), 0) / ships.length) : 0
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

  // UX-001A (Deliverable 4) — Priority Actions: the Hero's own action
  // queue, "what should I do right now." Same accounting authorities as
  // everything else on this page (see priorityActions.ts's own doc
  // comment) — never a second readiness/inventory computation.
  const priorityActionGroups = deriveFleetPriorityActions(ships, hardpoints, hangarItems, installedLoadouts, reservations)

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

        {/* UX-001A — Command Briefing Hero. Three columns, one responsibility
            each, in the order a Commander reads them: Fleet Status ("where do
            I stand"), Operations Center ("what am I commanding" — the visual
            anchor, unchanged in spirit from the prior cinematic rail), Priority
            Actions ("what should I do next"). Stacks in that same order below
            the lg: breakpoint. Height is sized for a meaningful cinematic
            viewport, not an excessively large empty rectangle, so the
            environment artwork can dock in later without moving this
            information architecture (HP-001).
            EWO-035A-R2 — PageEnvironment's own artwork is opaque, full-cover,
            rendered at full presentation strength; any background here only
            ever shows through in the disabled/no-artwork case (today's actual
            state — every environment definition still ships `enabled: false`),
            so the center column below carries its own subtle backdrop rather
            than reading as an empty gap until real artwork lands. */}
        <div className="relative overflow-hidden rounded-xl lg:border lg:border-white/15 lg:min-h-[380px] flex flex-col lg:flex-row lg:items-stretch">
          <PageEnvironment id="mission-control" />
          <div className="hidden lg:block absolute top-3 left-3 w-5 h-5 border-t border-l border-cyan/20 pointer-events-none" aria-hidden="true" />
          <div className="hidden lg:block absolute bottom-3 left-3 w-5 h-5 border-b border-l border-cyan/10 pointer-events-none" aria-hidden="true" />

          {/* Fleet Status (left) — Deliverable 2 (UX-001A). Relocated verbatim
              from Quartermaster Logistics: an operational classification of
              the fleet, not a logistics/inventory metric (which stays put,
              below). Ships Active has no meaningful per-ship "context" (every
              ship trivially qualifies), so it renders as a plain metric
              rather than through FleetStatusTile's own name-list treatment.
              UX-001A.1 (Deliverable 1) — Ships Active is the parent
              classification the other three are a breakdown OF, not four
              independent counts. Advisory Gold (docs/UI_ARCHITECTURE.md §4)
              marks it as the anchor — explicitly authorized for this one
              case by this mission's own work order — and the three children
              sit in a gold-tinted, left-bracketed sub-container beneath it,
              the same parent/branch visual grammar an org chart or file tree
              already uses, never a size change (WO's own "avoid increasing
              card size dramatically"). */}
          <div className="panel lg:bg-panel/55 lg:backdrop-blur-md lg:border-0 lg:border-r lg:border-white/10 lg:rounded-none relative z-10 w-full lg:w-[260px] shrink-0 p-3.5 lg:p-4 flex flex-col gap-3 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted/60">Fleet Status</p>
            <CriticalMetricTile icon={ShipWheel} value={ships.length} label="Ships Active" className="border-gold/40" />
            <div className="flex flex-col gap-2 ml-2 pl-3 border-l border-gold/20">
              <FleetStatusTile icon={CheckCircle2} label="Mission Ready" count={missionReadyShips.length} accent="#42E695" context={missionReadyContext} />
              <FleetStatusTile icon={Wrench} label="Loadouts In Progress" count={inProgressShips.length} accent="#FFD166" context={inProgressContext} />
              <FleetStatusTile icon={Factory} label="Factory Loadout" count={factoryShips.length} context={factoryContext} />
            </div>
          </div>

          {/* Operations Center (center) — UX-001A.1 Deliverable 2/5. Purely
              atmospheric: command context and visual identity, no
              operational instrumentation of any kind (Fleet Readiness moved
              below, into Priority Actions — see that column's own doc
              comment for why). The EWO-035A-R2 philosophy this restores:
              "the goal is zero shading over the loaded image, not a
              fallback tone" — the dimmed glass backdrop UX-001A added here
              existed only to keep the readiness ring legible; with no
              instrument left to protect, the artwork shows at full
              presentation strength again. Kept as its own flex column
              (rather than collapsed away) so the Hero's three-part
              proportions and min-height are unchanged from UX-001A. */}
          <div className="relative z-10 flex-1 min-w-0 min-h-[120px] lg:min-h-0" aria-hidden="true" />

          {/* Priority Actions (right) — UX-001A.1 Deliverable 2/3/5. Fleet
              Readiness (the Hero metric — "how healthy is my fleet?") now
              docks at the top of this same column, directly above Priority
              Actions ("what can I do about it?") — one operational unit,
              per this mission's own explicit relationship, rather than
              split across two columns the way UX-001A first shipped it.
              Below it: the operational action queue, ranked by Commander
              value (lowest effort / highest readiness impact first, not
              severity alone — see priorityActions.ts's own reordered
              PRIORITY_ACTION_CATEGORY_ORDER). Every row deep-links into the
              ship(s) it concerns, in fleet priority order (Deliverable 4 —
              already the case via buildTileContextNames' own sort; see
              priorityActions.test.ts). */}
          <div className="panel lg:bg-panel/55 lg:backdrop-blur-md lg:border-0 lg:border-l lg:border-white/10 lg:rounded-none relative z-10 w-full lg:w-[280px] shrink-0 p-3.5 lg:p-4 flex flex-col min-w-0">
            {/* UX-001A.3 (Deliverable 2) — pb-3→pb-4 and mb-3→mb-4 give the
                now-larger gauge a touch more room to breathe as the
                column's own anchor, rather than crowding straight into the
                divider; intentional vertical distribution, not a mechanical
                side-effect of the diameter change alone. */}
            <div className="flex flex-col items-center gap-1.5 pb-4 mb-4 border-b border-white/10">
              <ReadinessRing value={overallReadiness} />
              <div className="text-[11px] uppercase tracking-widest text-muted text-center">Overall Fleet Readiness</div>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-muted/60 mb-1.5">Priority Actions</p>
            {priorityActionGroups.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 py-4">
                <CheckCircle2 size={18} className="text-success" />
                <p className="text-xs text-white font-medium">No Immediate Priority Actions</p>
                <p className="text-[11px] text-muted/70">Fleet Readiness has nothing outstanding to act on.</p>
              </div>
            ) : (
              // UX-001A.2 (Deliverable 1/4) — a stack of individually
              // bounded Action Cards, never a divided list — one card =
              // one action = one decision, matching Fleet Status's "one
              // card per operational concept" cadence on the opposite
              // side of the Hero. UX-001A.3 (Deliverable 2) widened the
              // rhythm slightly (gap-2→gap-2.5). UX-001A.4A (Deliverable
              // 4) — `flex-1` lets this stack absorb whatever vertical
              // space the Hero row's `items-stretch` gives the Priority
              // Actions panel beyond its own content height (the panel
              // otherwise matches Operations Center/Fleet Status's
              // height); `justify-between` then distributes that leftover
              // space as extra gaps between cards rather than leaving it
              // as dead space below the last card — gap-2.5 remains the
              // floor when there's little or no leftover space (1-2 short
              // cards) or when there are enough cards to fill the panel
              // on its own (justify-between never compresses below the
              // cards' own compact height either way).
              <div className="flex-1 flex flex-col justify-between gap-2.5">
                {priorityActionGroups.map((group) => {
                  const p = PRIORITY_ACTION_PRESENTATION[group.category]
                  return (
                    <ActionCard key={group.category} icon={p.icon} title={p.label} count={group.count} accent={p.accent}>
                      {renderShipContext(group.context)}
                    </ActionCard>
                  )
                })}
              </div>
            )}
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

        {/* Quartermaster Logistics — architecture approved (EWO-007); refined
            only. UX-001A (Deliverable 2) relocated Fleet Status into the Hero
            (it is a fleet operational classification, not a logistics
            metric) — Inventory Status is Quartermaster Logistics' own
            remaining, unchanged department. */}
        <div className="panel p-5 lg:p-6">
          <p className="text-sm font-display font-semibold text-white flex items-center gap-2 mb-4 min-w-0">
            <PackageCheck size={15} className="text-cyan shrink-0" /> <span className="truncate">Quartermaster Logistics</span>
          </p>
          <p className="text-[10px] uppercase tracking-widest text-muted/60 mb-2">Inventory Status</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CriticalMetricTile icon={AlertTriangle} label="Missing Components" value={missingComponentsCount} accent={missingComponentsCount > 0 ? '#FF5F73' : undefined} />
            <CriticalMetricTile icon={ScanSearch} label="Unreserved Inventory" value={unreservedInventoryCount} />
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
          short. CWO-005 (Task 5): version/build identity is no longer shown here —
          it lives in the Sidebar (SFM build) and Captain's Log (SC certification)
          only, so the bridge screen never duplicates or drifts from either. */}
      <div className="mt-8 pt-6 border-t border-white/5 flex items-center text-[10px] uppercase tracking-widest text-muted/70">
        <div>Update Budget · 2 min</div>
      </div>
    </div>
  )
}
