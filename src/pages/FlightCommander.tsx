import { useMemo, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { resolveFactoryLoadoutTargetIntelligence, type TargetIntelligenceSourceShip } from '../utils/factoryLoadoutTargetIntelligence'
import { buildFlightCommanderPresentation } from '../utils/flightCommanderPresentation'
import { shipDefinitions } from '../data/shipDefinitions'
import type { ShipDefinition } from '../types'
import { StationShell, StationEnvironmentMount, StationBriefingRegion, OperationalRailMount, PrimaryWorkspace } from '../components/stationShell'
import StationBriefingHeader from './flightCommander/StationBriefingHeader'
import TacticalInstruments from './flightCommander/TacticalInstruments'
import IntelligenceControlRail from './flightCommander/IntelligenceControlRail'
import SourceVesselDossier from './flightCommander/SourceVesselDossier'
import StandingWatchPanel from './flightCommander/StandingWatchPanel'

/**
 * EWO-104 (corrected) + Amendments 1-3, EWO-108, EWO-109 — Flight
 * Commander: Factory Loadout Target Intelligence, Quartermaster
 * Prototype Zero, first Station Shell consumer.
 *
 * Canonical Product Rule: Flight Commander observes and directs — it
 * never edits. This page renders only `resolveFactoryLoadoutTargetIntelligence`'s
 * (EWO-104, `src/utils/factoryLoadoutTargetIntelligence.ts`) own structured
 * output, narrowed for display by `buildFlightCommanderPresentation`
 * (Amendment 1) and `describeComponentIdentity` (Amendment 3), plus local
 * filter/search UI state. Every "Needed" entry links into Ship Management
 * (the sole editing authority) rather than offering any action here.
 * EWO-108/109 changed presentation and interaction architecture only — no
 * resolver, ranking, filter, acquisition-boundary, or source-variant
 * logic was touched (Part Q/H). See
 * docs/EWO-108-Flight-Commander-Quartermaster-Prototype-Zero.md and
 * docs/EWO-109-Quartermaster-Station-Shell-Prototype.md for the full
 * before/after architecture record.
 *
 * EWO-109 (Part D) — structural architecture (environment mount,
 * briefing region, mounted instrument housing, operational rail mount,
 * standing report framing) now lives in `src/components/stationShell/`,
 * a reusable primitive with no dependency on this page's own business
 * logic. This file composes those regions; it does not implement them.
 * Every remaining local component (`StationBriefingHeader`,
 * `TacticalInstruments`, `IntelligenceControlRail`, `SourceVesselDossier`,
 * `StandingWatchPanel`) owns Flight-Commander-specific content only.
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

  // EWO-108 (Part G/H) — presentation-only identity lookup (image,
  // manufacturer, classification) for each source ship's dossier. Reads
  // the same static catalog `resolveFactoryLoadoutTargetIntelligence`
  // itself already reads from (`shipDefinitions`) — no new data source,
  // no resolver change.
  const definitionById = useMemo(() => new Map(shipDefinitions.map((d) => [d.id, d])), [])

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

  const active = presentation.factoryDataAvailable && presentation.hasActionableDemand && presentation.sourceShips.length > 0

  return (
    <StationShell>
      {/* EWO-108 (Part C) / EWO-109 (Part D) — a single continuous CIC
          mount: extended well past a conventional hero band to reveal
          genuinely more of the same existing artwork — never a second
          copy, never new artwork. The Station Briefing Header and
          Tactical Instruments mount inside its dark left band; a bottom
          gradient fades the artwork into the page's own background so
          the Intelligence Control Rail and dossier list below never read
          as a separate "webpage" starting underneath a banner. The
          mount/fade/region mechanics now live in
          `src/components/stationShell/` — this page supplies only its
          own `environmentId` and content. */}
      <StationEnvironmentMount environmentId="flight-commander">
        <StationBriefingRegion>
          <StationBriefingHeader active={active} sourceShipsIdentifiedCount={presentation.sourceShipsIdentifiedCount} matchedDemandComponentCount={presentation.matchedDemandComponentCount} />
          {presentation.factoryDataAvailable && <TacticalInstruments presentation={presentation} />}
        </StationBriefingRegion>
      </StationEnvironmentMount>

      {!presentation.factoryDataAvailable ? (
        <FactoryDataUnavailablePanel />
      ) : !active ? (
        <StandingWatchPanel />
      ) : (
        <>
          {/* EWO-108 (Part K) — sticky at the top of the scrolling
              viewport once the Commander scrolls past the hero, so
              category-filter context (and the search field) never
              disappears during a long roster review. Replaces the
              certified EWO-104 Amendment 3 sticky *table* header — Part K
              explicitly allows the operational requirement (persistent
              category context) to outlive the specific table
              implementation it was originally built on. EWO-109 — the
              sticky mounting mechanism itself now lives in
              `OperationalRailMount`; the rail's own visual styling
              remains Flight-Commander-owned (Part E). */}
          <OperationalRailMount>
            <IntelligenceControlRail search={search} onSearchChange={setSearch} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} />
          </OperationalRailMount>
          <PrimaryWorkspace>
            <SourceVesselDossierList sourceShips={filteredSourceShips} definitionById={definitionById} />
          </PrimaryWorkspace>
        </>
      )}
    </StationShell>
  )
}

function SourceVesselDossierList({
  sourceShips,
  definitionById,
}: {
  sourceShips: TargetIntelligenceSourceShip[]
  definitionById: Map<string, ShipDefinition>
}) {
  if (sourceShips.length === 0) {
    return (
      <div className="bg-black/25 border border-white/10 rounded-md p-6 text-center text-sm text-muted" data-testid="no-filtered-results">
        No source ships match the current filters.
      </div>
    )
  }
  return (
    <div className="space-y-2" data-testid="target-roster">
      {sourceShips.map((ship) => (
        <SourceVesselDossier key={ship.shipDefinitionId} ship={ship} definition={definitionById.get(ship.shipDefinitionId)} />
      ))}
    </div>
  )
}

function FactoryDataUnavailablePanel() {
  return (
    <div className="bg-black/25 border border-white/10 rounded-md p-8 text-center" data-testid="factory-data-unavailable-state">
      <ShieldAlert className="mx-auto text-warning" size={32} aria-hidden="true" />
      <p className="mt-3 text-white font-display font-bold">Factory Loadout Data Unavailable</p>
      <p className="text-sm text-muted mt-1">Stock ship loadout data could not be found. Target intelligence cannot be generated until it is available.</p>
    </div>
  )
}
