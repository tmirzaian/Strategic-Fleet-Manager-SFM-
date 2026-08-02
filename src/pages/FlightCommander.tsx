import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, Search, CheckCircle2 } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { resolveFactoryLoadoutTargetIntelligence } from '../utils/factoryLoadoutTargetIntelligence'
import { buildFlightCommanderPresentation, type FlightCommanderPresentation } from '../utils/flightCommanderPresentation'
import { CANONICAL_STABLE_CATEGORY_KEYS, CANONICAL_COMPONENT_CATEGORY_LABEL, CANONICAL_COMPONENT_CATEGORY_ICON } from '../utils/componentCategoryIcon'
import { describeComponentIdentity } from '../utils/flightCommanderComponentIdentity'
import type { TargetIntelligenceSourceShip } from '../utils/factoryLoadoutTargetIntelligence'
import PageEnvironment from '../components/layout/PageEnvironment'

/**
 * EWO-104 (corrected) + Amendments 1-3 — Flight Commander: Factory
 * Loadout Target Intelligence.
 *
 * Canonical Product Rule: Flight Commander observes and directs — it never
 * edits. This page renders only `resolveFactoryLoadoutTargetIntelligence`'s
 * (EWO-104, `src/utils/factoryLoadoutTargetIntelligence.ts`) own structured
 * output, narrowed for display by `buildFlightCommanderPresentation`
 * (Amendment 1, `src/utils/flightCommanderPresentation.ts` — presentation/
 * filtering only, no new demand or matching calculation), plus local
 * filter/search UI state. Every "Needed by" entry links into Ship
 * Management (the sole editing authority) rather than offering any action
 * here.
 *
 * Amendment 2 (Part F) — the hero uses the approved `'flight-commander'`
 * `EnvironmentId` via `PageEnvironment`, the same full-strength, zero-
 * filter pattern Mission Control's own hero uses.
 *
 * Amendment 3 — presentation only, no authority/resolver change (Part H):
 * summary cards moved to the hero's left column (Part A, mirroring Mission
 * Control's own layout), a sticky intelligence-matrix header (Part B), a
 * denser per-component entry combining rich catalog-metadata identity
 * (Part D, `describeComponentIdentity` — reuses the existing canonical
 * component catalog resolvers, no new metadata) with a single-line
 * "needed by" destination (Part C, no more orphan label row), a quieter
 * icon matrix with an emphasized narrative column (Part E), softer glass
 * cards (Part F), and a unified "Operational Briefing" empty state (Part
 * G) replacing the old table-shaped empty panels.
 */
export default function FlightCommander() {
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const hangarItems = useFleetStore((s) => s.hangarItems)
  const installedLoadouts = useFleetStore((s) => s.installedLoadouts)
  const reservations = useFleetStore((s) => s.reservations)

  const presentation = useMemo(() => {
    const result = resolveFactoryLoadoutTargetIntelligence({ ships, builds, hardpoints, hangarItems, installedLoadouts, reservations })
    return buildFlightCommanderPresentation(result)
  }, [ships, builds, hardpoints, hangarItems, installedLoadouts, reservations])

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const filteredSourceShips = useMemo(() => {
    const term = search.trim().toLowerCase()
    return presentation.sourceShips.filter((ship) => {
      if (categoryFilter && !ship.categoriesPresent.includes(categoryFilter)) return false
      if (!term) return true
      if (ship.displayName.toLowerCase().includes(term)) return true
      return ship.matches.some((m) => m.componentName.toLowerCase().includes(term))
    })
  }, [presentation.sourceShips, search, categoryFilter])

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Flight Commander</p>
        <h1 className="text-2xl font-display font-bold text-white">Target Intelligence Available</h1>
      </div>

      {/* Amendment 3 (Part A) — hero layout mirrors Mission Control:
          summary cards anchored to the LEFT column, the right side left
          as pure negative space over the artwork's own highest-detail
          area. Amendment 2 (Part F) presentation (crisp, blurPx: 0, no
          vignette) unchanged; the hero always renders regardless of data
          state, matching Mission Control's own always-present hero. Cards
          render only once factory data is genuinely available — a "0"
          must mean a real confirmed zero, never a data-unavailable
          placeholder. */}
      <div className="relative overflow-hidden rounded-xl lg:border lg:border-white/15 lg:min-h-[220px] flex flex-col lg:flex-row lg:items-stretch">
        <PageEnvironment id="flight-commander" />
        {presentation.factoryDataAvailable && (
          <div className="relative z-10 w-full lg:w-[300px] shrink-0 p-3.5 lg:p-4 flex items-center">
            <SummaryCards presentation={presentation} />
          </div>
        )}
        <div className="relative z-10 flex-1 min-w-0 min-h-[80px] lg:min-h-0" aria-hidden="true" />
      </div>

      {!presentation.factoryDataAvailable ? (
        <FactoryDataUnavailablePanel />
      ) : !presentation.hasActionableDemand || presentation.sourceShips.length === 0 ? (
        <OperationalBriefingPanel />
      ) : (
        <>
          <FilterBar search={search} onSearchChange={setSearch} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} />
          <TargetRosterTable sourceShips={filteredSourceShips} />
        </>
      )}
    </div>
  )
}

function SummaryCards({ presentation }: { presentation: FlightCommanderPresentation }) {
  const cards = [
    { id: 'source-ships-identified', label: 'Source Ships Identified', value: presentation.sourceShipsIdentifiedCount },
    { id: 'priority-components', label: 'Priority Components', value: presentation.matchedDemandComponentCount },
    { id: 'fleet-requirements', label: 'Fleet Requirements', value: presentation.totalFleetRequirementUnits },
    { id: 'high-value-targets', label: 'High-Value Targets', value: presentation.highValueTargetCount },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 w-full" data-testid="summary-cards">
      {cards.map((c) => (
        // Amendment 3 (Part F) — hero card polish: a stronger backdrop
        // blur and a softer, more diffuse shadow than the page's plain
        // `.panel` cards (necessary since these now sit directly over the
        // hero artwork) — exact same padding/sizing/typography as before,
        // no animation.
        <div
          key={c.id}
          className="bg-panel/70 backdrop-blur-lg border border-white/10 rounded-xl shadow-lg shadow-black/40 p-4 text-center"
          data-testid={`summary-card-${c.id}`}
        >
          {/* Amendment 1 (Part A) — Quartermaster Gold: these cards
              represent informational intelligence, not operational status,
              so the numeric value deliberately does not use success/
              warning/danger (those already mean something specific
              elsewhere in this app). */}
          <p className="text-2xl font-display font-bold text-gold">{c.value}</p>
          <p className="text-[11px] uppercase tracking-widest text-muted mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  )
}

function pillClass(active: boolean): string {
  return `text-xs font-medium rounded-full px-3 py-1 border transition-colors ${
    active ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-cyan/30'
  }`
}

function FilterBar({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  categoryFilter: string | null
  onCategoryFilterChange: (value: string | null) => void
}) {
  return (
    <div className="panel p-3 flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[220px]">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search source ship or component..."
          aria-label="Search target roster"
          className="w-full pl-8"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onCategoryFilterChange(null)} className={pillClass(categoryFilter === null)}>
          All
        </button>
        {CANONICAL_STABLE_CATEGORY_KEYS.map((key) => (
          <button key={key} type="button" onClick={() => onCategoryFilterChange(categoryFilter === key ? null : key)} className={pillClass(categoryFilter === key)}>
            {CANONICAL_COMPONENT_CATEGORY_LABEL[key]}
          </button>
        ))}
      </div>
    </div>
  )
}

function TargetRosterTable({ sourceShips }: { sourceShips: TargetIntelligenceSourceShip[] }) {
  if (sourceShips.length === 0) {
    return (
      <div className="panel p-6 text-center text-sm text-muted" data-testid="no-filtered-results">
        No source ships match the current filters.
      </div>
    )
  }
  return (
    // Amendment 3 (Part B) — the table's own scroll container no longer
    // clips vertically, so `position: sticky` on the header has a real
    // scrolling context to stick within (the window/page scroll) rather
    // than a clipped-height panel.
    <div className="panel overflow-x-auto" data-testid="target-roster">
      <table className="w-full text-sm">
        {/* Amendment 1 (Part C) — the five category columns are compact,
            icon-only indicators now (no wrapped text headers forcing extra
            width); the space recovered is allocated to Source Ship and,
            primarily, the Matching Fleet Requirements column — the
            Commander's actual actionable intelligence. */}
        <colgroup>
          <col style={{ width: '14%' }} />
          {CANONICAL_STABLE_CATEGORY_KEYS.map((key) => (
            <col key={key} style={{ width: '5%' }} />
          ))}
          <col style={{ width: '61%' }} />
        </colgroup>
        {/* Amendment 3 (Part B) — sticky intelligence header, the exact
            same `sticky top-0 bg-panel z-10` convention
            `LoadoutPortTree.tsx`'s own table header already establishes. */}
        <thead className="sticky top-0 bg-panel z-10">
          <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/10">
            <th className="px-4 py-3">Source Ship</th>
            {/* Amendment 3 (Part E) — reduced visual weight: dimmed icon
                color, same size/spacing as before. */}
            {CANONICAL_STABLE_CATEGORY_KEYS.map((key) => {
              const Icon = CANONICAL_COMPONENT_CATEGORY_ICON[key]
              const label = CANONICAL_COMPONENT_CATEGORY_LABEL[key]
              return (
                <th key={key} className="px-1 py-3 text-center text-muted/50" title={label} aria-label={label}>
                  <Icon size={14} aria-hidden="true" className="inline-block" />
                </th>
              )
            })}
            {/* Amendment 3 (Part E) — the one column Commanders actually
                read gets the visual emphasis instead: brighter, bolder,
                slightly larger than the other (intentionally quiet)
                header labels. */}
            <th className="px-4 py-3 text-cyan/90 text-xs font-bold not-italic tracking-wide">Matching Fleet Requirements</th>
          </tr>
        </thead>
        <tbody>
          {sourceShips.map((ship) => (
            <tr key={ship.shipDefinitionId} className="border-b border-white/5 align-top" data-testid={`roster-row-${ship.shipDefinitionId}`}>
              <td className="px-4 py-2.5 text-white font-medium whitespace-nowrap">{ship.displayName}</td>
              {CANONICAL_STABLE_CATEGORY_KEYS.map((key) => (
                <td key={key} className="px-1 py-2.5 text-center">
                  {ship.categoriesPresent.includes(key) ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-cyan" aria-label={`${CANONICAL_COMPONENT_CATEGORY_LABEL[key]} match`} />
                  ) : (
                    <span className="text-muted/30">—</span>
                  )}
                </td>
              ))}
              <td className="px-4 py-2.5">
                {/* Amendment 3 (Part C/D) — one compact block per matched
                    component: name, then rich catalog-metadata identity
                    (reused canonical catalog resolvers, never fabricated),
                    then one single-line "-> destination" per affected
                    ship/build — no orphan "Needed by:" label row. */}
                <div className="space-y-1.5">
                  {ship.matches.map((m) => {
                    const identity = describeComponentIdentity(m.componentName, m.componentEntityClass, m.category)
                    return (
                      <div key={`${m.componentEntityClass ?? ''}-${m.componentName}`}>
                        <p className="text-white text-xs font-semibold leading-tight">{m.componentName}</p>
                        {identity && <p className="text-[10.5px] text-muted/75 leading-tight">{identity}</p>}
                        {m.affected.map((a) => (
                          <p key={`${a.shipId}-${a.buildId}`} className="text-[11px] text-muted/90 leading-tight">
                            <span className="text-cyan/70">&rarr;</span>{' '}
                            <Link to={a.deepLink.path} className="text-cyan hover:text-cyan/80">
                              {a.shipName}
                            </Link>{' '}
                            &bull; {a.buildName} &times;{a.quantity}
                          </p>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Amendment 3 (Part G) — the unified empty-intelligence state. Covers both
 * prior cases (no unresolved demand at all, or demand with no matching
 * source ship) — Part G's own copy applies equally to either cause, and
 * both are the same outcome from the Commander's point of view: nothing
 * actionable to display right now. Deliberately Quartermaster Gold, never
 * a warning/danger tone — "this is mission success, not missing
 * information."
 */
function OperationalBriefingPanel() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 p-10 text-center" data-testid="operational-briefing-panel">
      <PageEnvironment id="flight-commander" className="opacity-20" />
      {/* Subtle holographic radar sweep — purely decorative/atmospheric. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="w-72 h-72 rounded-full border border-gold/15 overflow-hidden relative">
          <div className="absolute inset-0 animate-radar-sweep" style={{ background: 'conic-gradient(from 0deg, rgba(201,162,39,0.22), transparent 70deg)' }} />
        </div>
      </div>
      <div className="relative z-10">
        <CheckCircle2 className="mx-auto text-gold" size={30} aria-hidden="true" />
        <p className="text-xs uppercase tracking-[0.25em] text-gold/70 mt-3">Intelligence Status</p>
        <p className="mt-2 text-lg font-display font-bold text-white">No actionable factory targets identified.</p>
        <p className="text-sm text-muted mt-3 max-w-md mx-auto">Current fleet objectives cannot be accelerated through known factory loadouts.</p>
        <p className="text-sm text-muted mt-2 max-w-md mx-auto">
          Quartermaster recommends monitoring future ship traffic after modifying target builds or adding new fleet objectives.
        </p>
        <p className="text-[11px] text-cyan/60 mt-6 uppercase tracking-widest">Intelligence Sweep Complete</p>
        <p className="text-[11px] text-cyan/40 uppercase tracking-widest">Awaiting New Fleet Requirements</p>
      </div>
    </div>
  )
}

function FactoryDataUnavailablePanel() {
  return (
    <div className="panel p-8 text-center" data-testid="factory-data-unavailable-state">
      <ShieldAlert className="mx-auto text-warning" size={32} aria-hidden="true" />
      <p className="mt-3 text-white font-display font-bold">Factory Loadout Data Unavailable</p>
      <p className="text-sm text-muted mt-1">Stock ship loadout data could not be found. Target intelligence cannot be generated until it is available.</p>
    </div>
  )
}
