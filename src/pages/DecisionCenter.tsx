import { useMemo, useState } from 'react'
import { Search, Star, HelpCircle, Lock, CheckCircle2, Plus, ScanLine } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { selectActiveShips } from '../utils/fleetLifecycle'
import Badge from '../components/Badge'
import { catalogComponentsByName } from '../generated/componentCatalog'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { resolveNeededByBuilds, type NeededByEntry } from '../utils/inventoryDependencies'
import { resolveReservationEligibility } from '../utils/hangarReservationEligibility'
import { StationShell, StandingReportRegion } from '../components/stationShell'
import { CompartmentHeader, OfficerBriefingBlock, MountedWorkspacePanel, StructuralDivider, QuartermasterIconHousing } from '../components/stationKit'

/**
 * UX-003A — "Decision Center Loot Intake: Lookup-to-Inventory Workflow &
 * Visual Refactor." Decision Center answers "Should I keep this?" — the
 * natural sequence is Recovered Item -> Look Up -> Evaluate -> Keep ->
 * Add to Inventory, entirely in place, never a trip to Hangar Inventory
 * to record something already evaluated here.
 *
 * EWO-031 (Task 4) — suggestions/lookup still draw from the same
 * canonical, generated component catalog every other page searches
 * against (`catalogComponentsByName`) — unchanged by this mission
 * (Deliverable 1: "do not redesign the search interaction").
 */
const componentCatalogNames = Array.from(catalogComponentsByName.keys()).sort((a, b) => a.localeCompare(b))
const MAX_SUGGESTIONS = 8

type Verdict =
  // EWO-031 (Task 5, Scenario A) — still required by one or more of this
  // component's own active Loadouts. Unchanged business rule (Engineering
  // Constraint: "Reuse existing item lookup logic").
  | { kind: 'REQUIRED'; entries: NeededByEntry[] }
  // EWO-031 (Task 5, Scenario B) — every active Loadout that could use it
  // is already satisfied (or none ever targeted it at all).
  | { kind: 'SATISFIED' }
  | { kind: 'UNKNOWN' }
// Deliverable 5 — space preserved for a future disposal state (Mark for
// Disposal / Sell Later / Ignore / Not Needed) without a structural
// rewrite: a future case joins this union, `Recommendation` below grows
// one more branch, nothing else in this file assumes the union is closed
// at three members. No disposal workflow is implemented this sprint.

function evaluate(
  name: string,
  ships: ReturnType<typeof useFleetStore.getState>['ships'],
  builds: ReturnType<typeof useFleetStore.getState>['builds'],
  fleetAssets: ReturnType<typeof useFleetStore.getState>['fleetAssets'],
  hardpoints: ReturnType<typeof useFleetStore.getState>['hardpoints'],
  reservations: ReturnType<typeof useFleetStore.getState>['reservations']
): Verdict {
  if (!catalogComponentsByName.has(name)) return { kind: 'UNKNOWN' }
  const activeEntries = resolveNeededByBuilds(name, ships, builds, fleetAssets, hardpoints, reservations).filter(
    (e) => ships.find((s) => s.id === e.shipId)?.activeBuildId === e.buildId
  )
  if (activeEntries.length > 0) return { kind: 'REQUIRED', entries: activeEntries }
  return { kind: 'SATISFIED' }
}

/** Deliverable 8 — reuse the established semantic palette, never a new
 * one: Readiness Green for immediately useful (REQUIRED), Quartermaster
 * Blue for informational (SATISFIED — no action needed, not blocked),
 * Red only for invalid/blocked (UNKNOWN — not a real catalog component). */
function recommendationTone(kind: Verdict['kind']): 'success' | 'cyan' | 'danger' {
  if (kind === 'REQUIRED') return 'success'
  if (kind === 'SATISFIED') return 'cyan'
  return 'danger'
}

export default function DecisionCenter() {
  // SW-015C (Deliverable 4) — every use of `ships` on this page feeds
  // demand/reservation-eligibility computation for the CURRENT fleet;
  // intercepted once here (the one canonical active-vessel selector,
  // src/utils/fleetLifecycle.ts) rather than filtering each call site.
  const ships = selectActiveShips(useFleetStore((s) => s.ships))
  const builds = useFleetStore((s) => s.builds)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const hangarItems = useFleetStore((s) => s.hangarItems)
  const installedLoadouts = useFleetStore((s) => s.installedLoadouts)
  const reservations = useFleetStore((s) => s.reservations)
  const addHangarItem = useFleetStore((s) => s.addHangarItem)
  const reserveComponent = useFleetStore((s) => s.reserveComponent)

  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  // null = Deliverable 7 empty state, before any lookup completes.
  const [lookedUpName, setLookedUpName] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  // Deliverable 2/3 — Add to Inventory + the post-add reservation step.
  // Local, ephemeral UI state only (Regression: "Refresh preserves only
  // state that is intentionally persisted") — the real ledger/reservation
  // mutations go through the same store actions Hangar Inventory itself
  // uses, so THEIR persistence is already handled there, unchanged.
  const [addQtyInput, setAddQtyInput] = useState('1')
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null)
  const [added, setAdded] = useState(false)
  const [reserveOutcome, setReserveOutcome] = useState<{ reserved: boolean; label: string } | null>(null)
  const [reserveError, setReserveError] = useState<string | null>(null)

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return componentCatalogNames.filter((name) => name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS)
  }, [query])

  // Deliverable 4 — live, reactive facts about the item currently under
  // assessment. Recomputed from the store on every render (never a
  // point-in-time snapshot), so the SAME lookup result reflects Add to
  // Inventory the instant it happens — Reserve eligibility in particular
  // must see the real, just-added stock, not a stale pre-add read.
  const catalogEntry = lookedUpName ? catalogComponentsByName.get(lookedUpName) : undefined
  const inventoryPosition = lookedUpName && catalogEntry ? calculateComponentAvailability(lookedUpName, hangarItems, installedLoadouts, reservations, catalogEntry.entityClass) : null
  // Engineering Constraint: "Reuse EWO-072 reservation eligibility... No
  // duplicate reservation calculations" — the exact same canonical
  // resolver Hangar Inventory's own row/modal both call.
  const reservationEligibility =
    lookedUpName && catalogEntry
      ? resolveReservationEligibility(lookedUpName, catalogEntry.entityClass, ships, builds, fleetAssets, hardpoints, hangarItems, installedLoadouts, reservations)
      : null

  const parsedAddQty = Number(addQtyInput)
  const isAddQtyValid = Number.isInteger(parsedAddQty) && parsedAddQty > 0

  function check(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    // Regression: "Repeated lookup resets the assessment cleanly" — a
    // fresh lookup always discards any prior Add/Reserve state, even for
    // the same component name searched twice.
    setLookedUpName(trimmed)
    setVerdict(evaluate(trimmed, ships, builds, fleetAssets, hardpoints, reservations))
    setAddQtyInput('1')
    setAddResult(null)
    setAdded(false)
    setReserveOutcome(null)
    setReserveError(null)
  }

  function selectItem(name: string) {
    setQuery(name)
    setShowSuggestions(false)
    check(name)
  }

  // Deliverable 2 — the canonical Add Inventory action itself
  // (`addHangarItem`), the exact same store call Hangar Inventory's own
  // Add New Item modal makes — never a second, divergent ledger write.
  function addToInventory() {
    if (!lookedUpName || !catalogEntry || !isAddQtyValid) return
    const result = addHangarItem({
      name: lookedUpName,
      type: catalogEntry.category,
      size: `S${catalogEntry.size}`,
      qty: parsedAddQty,
      neededBy: 'None',
      disposition: 'Store',
      entityClass: catalogEntry.entityClass,
    })
    if (result.success) {
      setAdded(true)
      setAddResult({ success: true, message: result.merged ? `Added to existing ${lookedUpName} stock.` : `${lookedUpName} added to Hangar Inventory.` })
    } else {
      setAddResult({ success: false, message: result.message ?? 'Could not add item.' })
    }
  }

  function reserveNow(entry: NeededByEntry) {
    const result = reserveComponent({ missionConfigurationId: entry.buildId, fleetAssetId: entry.shipId, targetSlotLabel: entry.slotLabel, componentName: lookedUpName! })
    if (result.success) {
      setReserveOutcome({ reserved: true, label: `${entry.fleetAssetLabel} — ${entry.buildName}` })
      setReserveError(null)
    } else {
      setReserveError(result.message ?? 'Could not reserve this component.')
    }
  }

  return (
    // EWO-116 — Decision Center's Station migration. StationShell (EWO-109)
    // provides the compartment threshold; a narrower inner column preserves
    // this Station's own deliberately measured, non-executive-width reading
    // column (Part F — "measured, analytical, intentional," never Mission
    // Control's own full-width openness) as Station-owned content choice
    // inside the Shell's general area, not a duplicate Shell implementation.
    // The Technical Evaluation Laboratory environment plate now renders as
    // the app-wide FlagshipEnvironmentLayer backdrop (App.tsx, route-gated
    // on "/decision-center") rather than a bounded EnvironmentBay — a
    // viewport into the laboratory, never a hero banner (Part C).
    <StationShell>
      <div className="max-w-2xl space-y-5">
        {/* EWO-116 (Part D) — CompartmentHeader (EWO-110) mounted on its own
            translucent glass placard directly over the laboratory
            environment, the same treatment EWO-115 gave Mission Control's
            own header: a standing placard on the threshold, not a
            conventional page heading floating in plain space. Designation
            and title text are unchanged — "Technical Evaluation Laboratory"
            is this Station's architectural identity (matching how "the
            Bridge"/"Combat Information Center" were never literal Mission
            Control/Flight Commander copy either); the real, tested,
            Commander-facing text stays "Decision Center." */}
        <div className="inline-block rounded-lg bg-black/35 backdrop-blur-md border border-white/10 px-5 py-3.5">
          <CompartmentHeader designation="Decision Center" title="Mission Assessment Available" />
        </div>

        {/* EWO-116 (Part G) — the Quartermaster's own briefing, consuming
            QDS-003's Officer Briefing grammar directly (OfficerBriefingBlock,
            EWO-110): a single, evergreen, always-true summary of what this
            compartment does — never per-item, never fabricating certainty
            about a specific component. Per-item findings remain entirely
            inside the Item Assessment panel below, exactly as QDS-003 Part
            C.1 requires (Station Identification/Condition never duplicated
            outside the header it belongs to). */}
        <OfficerBriefingBlock summary="Recovered components are evaluated here before they rejoin the fleet's active inventory — retention, fleet demand, and disposition are all assessed in one pass." />

        {/* EWO-116 (Part E) — Loot Lookup, now a MountedWorkspacePanel
            (EWO-110 Part G's own canonical replacement for an ad hoc
            `.panel div`) rather than a hand-rolled glass panel. The search
            interaction itself (input, suggestions, Check Item, Enter-to-
            check) is byte-for-byte unchanged (Part J — no duplicated logic,
            no business-authority change). */}
        <MountedWorkspacePanel
          title={
            <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted">
              <Search size={13} className="text-cyan/70" /> Loot Lookup
            </span>
          }
        >
          <div className="relative">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setShowSuggestions(true)
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
                onKeyDown={(e) => e.key === 'Enter' && check(query)}
                placeholder="Start typing — e.g. M, Mi, Mirage…"
                className="flex-1"
              />
              <button
                onClick={() => check(query)}
                className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-cyan/90 transition-colors shrink-0"
              >
                <Search size={15} /> Check Item
              </button>
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1.5 w-full max-w-[calc(100%-6.5rem)] bg-black border border-cyan/30 rounded-lg overflow-hidden shadow-glow">
                {suggestions.map((name) => (
                  <button
                    key={name}
                    onMouseDown={() => selectItem(name)}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cyan/15 transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </MountedWorkspacePanel>

        {/* EWO-116 (Part E/H/I) — Item Assessment, also a
            MountedWorkspacePanel, so it reads as physically mounted into
            the laboratory rather than a floating rectangle (Part H). The
            pre-lookup state now composes StationShell's own
            StandingReportRegion (EWO-109 Part B/E) — the same "calm,
            operational, nothing wrong" surface Flight Commander's Standing
            Watch already uses — directly satisfying Part I's "the
            laboratory should appear operational even with nothing awaiting
            evaluation, no warning language, no dead page." Its monitoring
            visual (a radar sweep) is kept on: the pre-existing `ScanLine`
            icon this empty state already used independently establishes a
            scanning/sweep metaphor genuinely fits this Station's own
            domain, not a forced reuse. */}
        <MountedWorkspacePanel title={<span className="text-xs uppercase tracking-widest text-muted">Item Assessment</span>}>
          {!lookedUpName && (
            <StandingReportRegion monitoringVisual testId="item-assessment-standing-report">
              <div className="flex flex-col items-center text-center gap-2">
                <QuartermasterIconHousing icon={ScanLine} label="Awaiting Item Assessment" />
                <h2 className="font-display font-semibold text-white mt-1">Awaiting Item Assessment</h2>
                <p className="text-sm text-muted max-w-sm">Search for a recovered component to review fleet demand, inventory status, and retention value.</p>
              </div>
            </StandingReportRegion>
          )}

          {verdict?.kind === 'UNKNOWN' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <HelpCircle size={18} className="text-danger" />
              <span className="font-display font-semibold text-white">{lookedUpName}</span>
              <Badge tone="danger">NO CATALOG MATCH</Badge>
            </div>
            <p className="text-sm text-muted">Doesn't match a real catalog component. Check the spelling or pick a suggestion from the list.</p>
          </div>
        )}

        {catalogEntry && lookedUpName && (verdict?.kind === 'REQUIRED' || verdict?.kind === 'SATISFIED') && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-lg font-display font-bold text-white">{lookedUpName}</div>
                <div className="text-xs text-muted">
                  {catalogEntry.category} · S{catalogEntry.size}
                </div>
              </div>
              <Badge tone={recommendationTone(verdict.kind)}>{verdict.kind === 'REQUIRED' ? 'KEEP' : 'ALREADY SATISFIED'}</Badge>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-black/20 border border-white/5 rounded-lg px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-muted/60 mb-1">Fleet Demand</div>
                <div className="text-white">
                  {verdict.kind === 'REQUIRED'
                    ? `Needed by ${verdict.entries.length} active Loadout${verdict.entries.length === 1 ? '' : 's'}`
                    : 'No active Loadout has an unresolved requirement'}
                </div>
              </div>
              <div className="bg-black/20 border border-white/5 rounded-lg px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-muted/60 mb-1">Inventory Position</div>
                <div className="text-white font-mono text-xs">
                  Installed {inventoryPosition?.installedQuantity ?? 0} · Reserved {inventoryPosition?.reservedQuantity ?? 0} · Available {inventoryPosition?.availableQuantity ?? 0}
                </div>
              </div>
            </div>

            {verdict.kind === 'REQUIRED' && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted/60 mb-1.5">Applicable Target Loadouts</div>
                <ul className="space-y-2">
                  {verdict.entries.map((e, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 bg-black/20 border border-white/5 rounded-lg px-3 py-2.5">
                      <div className="text-sm text-white min-w-0">
                        <div className="truncate">
                          {e.fleetAssetLabel} ({e.hullName}) — {e.buildName}
                        </div>
                        <div className="text-xs text-muted">Needed By: {e.slotLabel}</div>
                      </div>
                      {e.reserved ? (
                        <span className="shrink-0 text-xs font-medium text-cyan">Already Reserved</span>
                      ) : reserveOutcome?.reserved && reserveOutcome.label === `${e.fleetAssetLabel} — ${e.buildName}` ? (
                        <span className="shrink-0 text-xs font-medium text-success">Reserved</span>
                      ) : inventoryPosition && inventoryPosition.availableQuantity > 0 ? (
                        // Real, genuinely free stock exists right now — whether
                        // it arrived via this session's Add to Inventory or was
                        // already owned before this lookup — so a direct
                        // Reserve is genuinely actionable (EWO-072 eligibility).
                        <button
                          onClick={() => reserveNow(e)}
                          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
                        >
                          <Lock size={13} /> Reserve
                        </button>
                      ) : (
                        <span className="shrink-0 text-xs text-muted/60">Not yet owned</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {verdict.kind === 'SATISFIED' && (
              <p className="text-xs uppercase tracking-widest text-white/60">
                Recommendation: <span className="font-semibold text-white">Store in Hangar</span> — no reservation required.
              </p>
            )}

            {/* Deliverable 2/3 — Add to Inventory, then the optional,
                canonically-gated post-add reservation step, entirely in
                place. EWO-116 (Part E) — the section break ahead of this
                action row now composes StructuralDivider (EWO-110 Part C)
                instead of a raw `border-t` — the exact same shipped
                `.scanline-divider` CSS, reached through the canonical
                component. */}
            <StructuralDivider testId="assessment-action-divider" />
            {!added ? (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={addQtyInput}
                  onChange={(e) => {
                    setAddQtyInput(e.target.value)
                    setAddResult(null)
                  }}
                  className="w-20"
                  aria-label="Quantity to add"
                />
                <button
                  disabled={!isAddQtyValid}
                  onClick={addToInventory}
                  className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={15} /> Add to Inventory
                </button>
                {addResult && !addResult.success && <p className="text-xs text-danger">{addResult.message}</p>}
              </div>
            ) : (
              <div className="pt-1 space-y-2">
                <div className="flex items-center gap-2 text-success text-sm">
                  <CheckCircle2 size={16} /> {addResult?.message ?? 'Item added to Hangar Inventory.'}
                </div>
                {reserveOutcome ? (
                  <p className="text-xs text-muted">
                    {reserveOutcome.reserved ? (
                      <>
                        <span className="text-cyan font-medium">Reserved</span> for {reserveOutcome.label}.
                      </>
                    ) : (
                      'Left unreserved — available in Hangar Inventory.'
                    )}
                  </p>
                ) : reservationEligibility?.eligible ? (
                  <div className="space-y-1.5">
                    <p className="text-sm text-white">Reserve for a target loadout?</p>
                    {reserveError && <p className="text-xs text-danger">{reserveError}</p>}
                    <div className="flex items-center gap-3">
                      {reservationEligibility.unreservedNeededBy.length === 1 && (
                        <button
                          onClick={() => reserveNow(reservationEligibility.unreservedNeededBy[0])}
                          className="inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
                        >
                          <Lock size={13} /> Reserve Now
                        </button>
                      )}
                      {reservationEligibility.unreservedNeededBy.length > 1 && (
                        <span className="text-xs text-muted">Choose a target above to reserve, or:</span>
                      )}
                      <button onClick={() => setReserveOutcome({ reserved: false, label: '' })} className="text-xs font-medium text-muted hover:text-white transition-colors">
                        Leave Unreserved
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
        </MountedWorkspacePanel>
      </div>
    </StationShell>
  )
}
