import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShipWheel,
  LayoutGrid,
  PackageCheck,
  CheckCircle2,
  Wrench,
  Factory,
  PackageX,
  Plus,
  AlertOctagon,
  BookmarkCheck,
  PackageOpen,
  ArrowUpCircle,
  XCircle,
  X,
  ShoppingCart,
  Boxes,
} from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import ShipCard from '../components/ShipCard'
import PriorityLabel from '../components/PriorityLabel'
import { resolveShipStockRoleFocus } from '../utils/shipIdentityLine'
import SortableHeader from '../components/SortableHeader'
import FleetStatusTile from '../components/FleetStatusTile'
import CriticalMetricTile from '../components/CriticalMetricTile'
import ActionCard from '../components/ActionCard'
import Badge, { procurementRowStateTone, procurementRowStateLabel } from '../components/Badge'
import WorkflowDestinationCard from '../components/WorkflowDestinationCard'
import PageEnvironment from '../components/layout/PageEnvironment'
import { colorFor } from '../components/ReadinessBar'
import { buildProcurementList, buildReservedAwaitingInstallLines, type ProcurementNeededByEntry } from '../utils/procurement'
import {
  buildQuartermasterDemandSummary,
  buildQuartermasterWorkQueue,
  filterActionableWorkQueue,
  assessCategoryWorkQueue,
  sortWorkQueue,
  type WorkQueueSortColumn,
  type WorkQueueSortDirection,
  type CategoryWorkQueueAssessment,
} from '../utils/quartermasterBriefing'
import { CANONICAL_COMPONENT_CATEGORY_ORDER, CANONICAL_COMPONENT_CATEGORY_LABEL, CANONICAL_COMPONENT_CATEGORY_ICON } from '../utils/componentCategoryIcon'
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

/** UX-001B (Deliverable 5) — "Needed By" as real hyperlinks straight to
 * the relevant Ship Workspace, not inert text (the Procurement table's
 * prior behavior). Inventory state itself is never hyperlinked here —
 * that's the Badge column's job (Deliverable 6): badges communicate
 * state, links communicate destinations. */
function renderNeededByLinks(entries: ProcurementNeededByEntry[]) {
  if (entries.length === 0) return <span className="text-muted/50">—</span>
  return (
    <>
      {entries.map((entry, i) => (
        <span key={`${entry.shipId}-${entry.buildId}`}>
          {i > 0 && ', '}
          <Link to={`/ship-workspace/${entry.shipId}`} className="text-cyan hover:underline">
            {entry.label}
          </Link>
        </span>
      ))}
    </>
  )
}

/** UX-001B.1 (Deliverable 2/9) — Canonical Component Taxonomy. Categories,
 * glyphs, and ordering are NOT reinvented here — they are reused directly
 * from `componentCategoryIcon.ts`'s own canonical per-system exports
 * (`CANONICAL_COMPONENT_CATEGORY_ICON`/`_LABEL`), the one Chief-Architect-
 * approved component-system taxonomy Ship Workspace already draws its own
 * row glyphs from. A Quartermaster who reads "Shields" here sees the
 * identical icon and word Ship Workspace already uses for that system,
 * never a second, Mission-Control-only meaning. Every category with real
 * outstanding demand shares one neutral accent (Quartermaster Blue)
 * rather than an invented severity color — these are aggregate demand
 * counts, not procurement-row state classifications, so Priority
 * Actions'/the Work Queue's own green/blue/white vocabulary does not
 * apply here (see docs/UI_ARCHITECTURE.md §4) — EXCEPT the one deliberate
 * exception below: a stable category at zero demand borrows Readiness
 * Green to read as "Complete," per UX-001B.3 Deliverable 3 ("the
 * Commander should perceive 'nothing to do here' without opening the
 * Work Queue"). Glyph still answers "what system," color still answers
 * "what state" — Complete is a real state, just not a severity one. */
const QUARTERMASTER_CATEGORY_ACCENT = '#35D0FF'
const QUARTERMASTER_COMPLETE_ACCENT = '#42E695'
const QUARTERMASTER_CATEGORY_ICON: Record<string, any> = Object.fromEntries(
  CANONICAL_COMPONENT_CATEGORY_ORDER.map((key) => [CANONICAL_COMPONENT_CATEGORY_LABEL[key], CANONICAL_COMPONENT_CATEGORY_ICON[key]])
)

/** UX-001B.5 (Deliverable 4) — Contextual Quartermaster Assessment: one
 * short, plain-language line that reacts to the current report scope
 * (one category, or the whole fleet), reusing the exact same three-way
 * classification and color vocabulary `assessCategoryWorkQueue` and the
 * Logistics Demand "Complete" cards already established — never a fourth
 * competing presentation for the same three operational outcomes. */
const QUARTERMASTER_ASSESSMENT_PRESENTATION: Record<CategoryWorkQueueAssessment, { icon: any; accent: string; title: string | null }> = {
  ACTIONABLE: { icon: Boxes, accent: QUARTERMASTER_CATEGORY_ACCENT, title: null },
  PROCUREMENT_ONLY: { icon: ShoppingCart, accent: '#8B93A1', title: null },
  // The only state that adds a designation beyond the "Quartermaster
  // Assessment" section label already sitting directly above it — the
  // other two states would otherwise repeat that exact text twice in a row.
  COMPLETE: { icon: CheckCircle2, accent: QUARTERMASTER_COMPLETE_ACCENT, title: 'Quartermaster Assessment — Complete' },
}

function describeQuartermasterAssessment(assessment: CategoryWorkQueueAssessment, categoryFilter: string | null, assetCount: number): string {
  if (assessment === 'COMPLETE') {
    return categoryFilter
      ? `All target loadouts for ${categoryFilter} have been satisfied. Quartermaster Report complete.`
      : 'All target loadouts have been satisfied fleet-wide. Quartermaster Report complete.'
  }
  if (assessment === 'PROCUREMENT_ONLY') {
    return categoryFilter
      ? `There are currently no inventory assets available to satisfy the selected target loadouts for ${categoryFilter}.`
      : 'There are currently no inventory assets available to satisfy outstanding target loadouts fleet-wide.'
  }
  const noun = assetCount === 1 ? 'asset is' : 'assets are'
  return `${assetCount} inventory ${noun} immediately available to improve fleet readiness${categoryFilter ? ` for ${categoryFilter}` : ''}.`
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

  // UX-001A (Deliverable 4) — Priority Actions: the Hero's own action
  // queue, "what should I do right now." Same accounting authorities as
  // everything else on this page (see priorityActions.ts's own doc
  // comment) — never a second readiness/inventory computation.
  const priorityActionGroups = deriveFleetPriorityActions(ships, hardpoints, hangarItems, installedLoadouts, reservations)

  // UX-001B — Quartermaster Briefing. `procurementRaw` (unchanged
  // computation) covers Available/Purchase-Required; `reservedLines`
  // covers the "reserved but not yet installed" half that
  // `buildProcurementList` deliberately excludes. `demandSummary`
  // aggregates true shortage by category (Deliverable 1/2/7);
  // `workQueueRaw` is the flat, individually-actionable row list
  // (Deliverable 3/4/8) a category card can filter down to.
  const reservedLines = buildReservedAwaitingInstallLines(hardpoints, builds, ships, reservations)
  const demandSummary = buildQuartermasterDemandSummary(procurementRaw)
  const workQueueRaw = buildQuartermasterWorkQueue(procurementRaw, reservedLines)

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<WorkQueueSortColumn>('state')
  const [sortDirection, setSortDirection] = useState<WorkQueueSortDirection>('asc')

  // UX-001B.5 — the Quartermaster Report's own current scope: one
  // category, or the whole fleet. `workQueueScopedRaw` keeps Purchase
  // Required rows (needed by the assessment below to tell "no inventory,
  // but real demand" apart from "genuinely nothing outstanding");
  // `workQueue` is what the table actually renders — actionable
  // (Reserved/Available) only, per Deliverable 3, unconditionally.
  const workQueueScopedRaw = categoryFilter ? workQueueRaw.filter((row) => row.category === categoryFilter) : workQueueRaw
  const workQueueFiltered = filterActionableWorkQueue(workQueueScopedRaw)
  const workQueue = sortWorkQueue(workQueueFiltered, sortColumn, sortDirection)
  const reportAssessment = assessCategoryWorkQueue(workQueueScopedRaw)
  const reportAssessmentAssetCount = workQueueFiltered.reduce((sum, row) => sum + row.quantity, 0)

  function handleSort(column: WorkQueueSortColumn) {
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

        {/* Quartermaster Report — UX-001B.5 consolidates what were three
            visually independent panels (Logistics Demand, Quartermaster
            Assessment, Procurement Work Queue) into ONE reporting
            surface, read top to bottom as a single document rather than
            three unrelated dashboard widgets. This is stage II of Mission
            Control's own three-stage operational flow (Commander Briefing
            → Quartermaster Report → Execute Orders): the fleet's demand,
            the Quartermaster's plain-language read on it, and exactly the
            inventory that can act on it today. */}
        <div className="panel p-5 lg:p-6">
          <div className="flex items-center justify-between gap-2 mb-4 min-w-0">
            <p className="text-sm font-display font-semibold text-white flex items-center gap-2 min-w-0">
              <PackageCheck size={15} className="text-cyan shrink-0" /> <span className="truncate">Quartermaster Report</span>
            </p>
            {categoryFilter && (
              <button
                onClick={() => setCategoryFilter(null)}
                className="text-xs text-cyan hover:underline shrink-0 flex items-center gap-1"
              >
                {categoryFilter} <X size={13} />
              </button>
            )}
          </div>

          <p className="text-[10px] uppercase tracking-widest text-muted/60 mb-2">Logistics Demand</p>
          {/* UX-001B.3 (Deliverable 3/4) — the stable core categories
              (Coolers, Power Plants, Quantum Drives, Shields, Weapons)
              always populate `demandSummary`, so this grid always
              renders — no page-level "nothing to procure" empty state to
              maintain separately. A category at zero demand renders
              Complete (green accent, checkmark, "Complete" caption)
              rather than disappearing, so the layout stays fixed and
              learnable through repetition. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {demandSummary.map((group) => {
              const isActive = categoryFilter === group.category
              const isComplete = group.needed === 0
              return (
                // Deliverable 5 — a demand category card is an in-place
                // report filter, not a passive metric: clicking it scopes
                // the whole Quartermaster Report below to this category
                // (toggles off on a second click). No `to` — this changes
                // in-page state, never navigates away from the Briefing.
                <ActionCard
                  key={group.category}
                  icon={QUARTERMASTER_CATEGORY_ICON[group.category] ?? CANONICAL_COMPONENT_CATEGORY_ICON.Other}
                  title={group.category}
                  count={isComplete ? '✓' : group.needed}
                  accent={isComplete ? QUARTERMASTER_COMPLETE_ACCENT : QUARTERMASTER_CATEGORY_ACCENT}
                  active={isActive}
                  onClick={() => setCategoryFilter(isActive ? null : group.category)}
                >
                  {isComplete ? 'Complete' : undefined}
                </ActionCard>
              )
            })}
          </div>

          <div className="border-t border-white/10 my-4" />

          <p className="text-[10px] uppercase tracking-widest text-muted/60 mb-2">Quartermaster Assessment</p>
          {/* UX-001B.5 (Deliverable 4) — always present, reacting to the
              current scope (one category, or the whole fleet): exactly
              one of three operational outcomes, reusing the same
              classification and color vocabulary the Logistics Demand
              cards and Work Queue already established — never a fourth
              competing presentation. */}
          {(() => {
            const presentation = QUARTERMASTER_ASSESSMENT_PRESENTATION[reportAssessment]
            const AssessmentIcon = presentation.icon
            return (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border-l-[3px]" style={{ borderLeftColor: presentation.accent }}>
                <AssessmentIcon size={18} className="shrink-0 mt-0.5" style={{ color: presentation.accent }} />
                <div className="min-w-0">
                  {presentation.title && <div className="text-sm font-semibold text-success">{presentation.title}</div>}
                  <div className={presentation.title ? 'text-xs text-muted mt-0.5' : 'text-sm text-white'}>
                    {describeQuartermasterAssessment(reportAssessment, categoryFilter, reportAssessmentAssetCount)}
                  </div>
                </div>
              </div>
            )
          })()}

          {reportAssessment === 'ACTIONABLE' && (
            <>
              <div className="border-t border-white/10 my-4" />
              <p className="text-[10px] uppercase tracking-widest text-muted/60 mb-2">Procurement Work Queue</p>
              {/* UX-001B.4 (Deliverable 1) — locked column widths. The
                  Quantum Drives view's own natural proportions became the
                  fixed template (`table-fixed` + explicit `<col>` widths)
                  for every category, so switching filters only ever
                  changes row contents, never column geometry.
                  UX-001B.5 (Deliverable 3) — Available/Reserved rows
                  only; Purchase Required never renders in Mission
                  Control, unconditionally (procurement planning belongs
                  to a future dedicated tool). */}
              <div className="rounded-lg border border-white/5 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col className="w-[26%]" />
                      <col className="w-[18%]" />
                      <col className="w-[18%]" />
                      <col className="w-[10%]" />
                      <col className="w-[28%]" />
                    </colgroup>
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                        <SortableHeader label="Component Name" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                        <SortableHeader label="Size / Type" column="sizeType" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                        <SortableHeader label="State" column="state" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                        <SortableHeader label="Qty" column="quantity" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                        <th className="px-3 py-2 font-medium">Needed By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workQueue.map((row) => (
                        <tr key={`${row.itemName}-${row.state}`} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-3 py-2 text-white font-medium truncate">{row.itemName}</td>
                          <td className="px-3 py-2 text-muted truncate">{row.size} {row.type}</td>
                          <td className="px-3 py-2">
                            <Badge tone={procurementRowStateTone(row.state)}>{procurementRowStateLabel(row.state)}</Badge>
                          </td>
                          <td className="px-3 py-2 font-mono text-cyan">{row.quantity}</td>
                          <td className="px-3 py-2 text-muted text-xs truncate">{renderNeededByLinks(row.neededBy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Execute Orders — stage III of Mission Control's operational
            flow (End-of-Briefing Action Center, UX-001B.4 Deliverable 5).
            Deliberately kept OUTSIDE the Quartermaster Report panel
            above — the report identifies work, this transitions into
            performing it. UX-001C corrected all three destinations:
            "Loot Lookup" (not "Loot Lockup" — a real component still
            gets reviewed, not arrested) routes to Decision Center, where
            unresolved/recovered/unassigned component decisions actually
            live; "Add Inventory" routes to Hangar Inventory, the future
            home of the reusable Add Inventory workflow, never Quick
            Update; "Modify Ship" was already correct and is unchanged. */}
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <WorkflowDestinationCard
              to="/decision-center"
              title="Loot Lookup"
              supportingLine="Review unresolved, recovered, or unassigned component decisions."
              illustrationId="decision-center-found-loot"
            />
            <WorkflowDestinationCard
              to="/hangar"
              title="Add Inventory"
              supportingLine="Record newly acquired or purchased components."
              illustrationId="hangar-add-inventory"
            />
            <WorkflowDestinationCard
              to="/ship-workspace"
              title="Modify Ship"
              supportingLine="Adjust loadouts, reservations, or installed components."
              illustrationId="ship-workspace-modify"
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
