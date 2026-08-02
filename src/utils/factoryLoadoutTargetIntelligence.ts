import type { Ship, Build, Hardpoint, HangarItem, InstalledLoadoutEntry, MissionReservation } from '../types'
import { selectActiveShips } from './fleetLifecycle'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { findActiveSlotReservation } from '../engine/logistics/reservationLookup'
import { componentIdentityMatches } from './procurement'
import { canonicalComponentCategoryKey, CANONICAL_STABLE_CATEGORY_KEYS } from './componentCategoryIcon'
import { shipDefinitions, shipFactoryTemplates } from '../data/shipDefinitions'

/**
 * EWO-104 (corrected) — "Be On the Lookout" Factory Loadout Target
 * Intelligence.
 *
 * Canonical question: which known stock/factory ship models carry
 * components the fleet's Commander-managed target loadouts still need?
 *
 * Authority composition — nothing here is a new formula:
 *  - "Still needed" demand reuses the exact same literal exclusion rules
 *    `priorityActions.ts`/`procurement.ts` both already establish
 *    independently (skip `isStructural`, skip an empty/`'—'` target),
 *    narrowed to `status === 'Missing'` only per this work order's Part C
 *    (satisfied `'OK'`, `'Invalid Target'`, `'Unresolved'`, and — unlike
 *    `buildProcurementList` — `'Upgrade Available'` are all excluded; an
 *    upgrade opportunity means something is already installed, so it is
 *    not acquisition demand for this roster).
 *  - Net-of-owned-stock shortfall reuses `calculateComponentAvailability`
 *    directly (never re-derived), the same primitive `buildProcurementList`
 *    itself nets against.
 *  - EWO-104 Amendment 2 (Part C) — remaining acquisition quantity is
 *    computed via the exact same two-step call path
 *    `buildProcurementList` (`src/utils/procurement.ts`) already uses,
 *    reused directly rather than reimplemented: (1) per-hardpoint,
 *    `findActiveSlotReservation` (`src/engine/logistics/reservationLookup.ts`)
 *    excludes any row whose own exact slot already has an active
 *    reservation (a specific owned unit already committed — needs
 *    installing, not acquiring); (2) for the remaining raw count per
 *    component, `calculateComponentAvailability`'s own `availableQuantity`
 *    field is subtracted (genuinely free, uncommitted owned stock).
 *  - Component-identity matching (both fleet-demand grouping and the
 *    factory-loadout cross-reference) reuses `componentIdentityMatches`
 *    (`procurement.ts`) directly — the same entityClass-preferred,
 *    name-fallback rule already established and already exported
 *    specifically so other callers don't reinvent it.
 *  - Scope is fleet-wide across every Build belonging to an active ship
 *    (via `selectActiveShips`), not just each ship's currently active
 *    Build — matching the Quartermaster Report's own "what does the fleet
 *    need" scope (`buildProcurementList`'s doc comment: "not just the
 *    currently active one"), since BOLO's own framing ("Commander-managed
 *    target loadouts," plural) is a fleet-wide intelligence question, not
 *    a single-active-loadout one.
 *  - EWO-104 Amendment 2 (Part A/B) — demand additionally requires
 *    `isCommanderManagedBuild(build)`: a Factory Loadout build's own
 *    hardpoints never contribute, explicit and independent of the
 *    `status === 'Missing'` check above. A custom build whose target
 *    happens to equal its ship's own factory component is still eligible
 *    demand (Part D) — this resolver never compares a target against the
 *    ship's own `factoryItem`, only against its own `installedItem`
 *    (via `status`), so "target equals factory component" never enters
 *    the eligibility decision either way, by construction.
 *
 * Returns plain structured data only — no React elements, CSS classes, or
 * page-specific presentation strings (Part B).
 */

export interface TargetIntelligenceAffectedEntry {
  shipId: string
  shipName: string
  buildId: string
  buildName: string
  /** Raw per-build demand count — mirrors `ProcurementNeededByEntry`'s own
   * list-not-netted convention (never reduced by owned stock). */
  quantity: number
  deepLink: { path: string; shipId: string }
}

export interface TargetIntelligenceDemandComponent {
  componentName: string
  componentEntityClass: string | null
  category: string
  /** Net shortfall after owned/reserved Hangar stock — mirrors
   * `ProcurementLine.qtyNeeded`'s own net-shortfall convention. Always > 0
   * (a fully-satisfiable component is filtered out before this is returned). */
  fleetQuantityNeeded: number
  affected: TargetIntelligenceAffectedEntry[]
}

export interface TargetIntelligenceComponentMatch {
  componentName: string
  componentEntityClass: string | null
  category: string
  /** How many of this component this one source ship's stock loadout carries. */
  factoryQuantity: number
  /** The same net fleet-wide shortfall as the matching `TargetIntelligenceDemandComponent`. */
  fleetQuantityNeeded: number
  affected: TargetIntelligenceAffectedEntry[]
}

export interface TargetIntelligenceSourceShip {
  shipDefinitionId: string
  displayName: string
  matches: TargetIntelligenceComponentMatch[]
  distinctComponentCount: number
  /** Part E ranking metadata — sum of min(factoryQuantity, fleetQuantityNeeded) across matches. */
  totalUnresolvedUnitsCovered: number
  /** Which of the five stable core categories this ship has a match in. */
  categoriesPresent: string[]
}

export interface FactoryLoadoutTargetIntelligenceResult {
  sourceShips: TargetIntelligenceSourceShip[]
  /** Every qualifying demand component, matched or not — a diagnostic view. */
  demandComponents: TargetIntelligenceDemandComponent[]
  /** Distinct demand components actually represented by at least one source ship (Part H "Priority Components"). */
  matchedDemandComponentCount: number
  /** Part H "Fleet Requirements" — sum of net shortfall across every demand component. */
  totalFleetRequirementUnits: number
  /** Part H "Source Ships Identified." */
  sourceShipsIdentifiedCount: number
  /** Part H "High-Value Targets" — source ships matching more than one distinct component. */
  highValueTargetCount: number
  /** Part K.3 — false when no ship definition anywhere carries real factory-loadout data. */
  factoryDataAvailable: boolean
}

export interface FactoryLoadoutTargetIntelligenceParams {
  ships: Ship[]
  builds: Build[]
  hardpoints: Hardpoint[]
  hangarItems: HangarItem[]
  installedLoadouts: InstalledLoadoutEntry[]
  reservations: MissionReservation[]
}

/**
 * EWO-104 Amendment 2 (Part B) — the canonical, explicit distinction
 * between a ship's immutable Factory Loadout and a Commander-created
 * custom build (`kind`: `'CUSTOM' | 'MISSION' | 'TEMPLATE'`, or absent —
 * defaults to `'MISSION'`). Every Flight Commander demand-eligibility
 * check must use this one predicate — never inferred from display text.
 *
 * This is deliberately explicit rather than relied on as an emergent side
 * effect of Factory hardpoints always materializing with `status: 'OK'`
 * (true today, per `fleetAssetMaterializer.ts` — but that is a separate
 * computation this function does not depend on, so this predicate stays
 * correct even if that materialization behavior ever changes).
 */
export function isCommanderManagedBuild(build: Pick<Build, 'kind'>): boolean {
  return build.kind !== 'FACTORY'
}

function deriveDemandComponents(params: FactoryLoadoutTargetIntelligenceParams): TargetIntelligenceDemandComponent[] {
  const { ships, builds, hardpoints, hangarItems, installedLoadouts, reservations } = params
  const activeShipById = new Map(selectActiveShips(ships).map((s) => [s.id, s]))

  const groups: TargetIntelligenceDemandComponent[] = []
  for (const hp of hardpoints) {
    if (hp.isStructural) continue
    if (!hp.targetItem || hp.targetItem === '—') continue
    // Part C — satisfied ('OK'), incompatible ('Invalid Target'), data-edge-
    // case ('Unresolved'), and purely informational ('Upgrade Available')
    // rows are all excluded — only a genuine physical gap is demand.
    if (hp.status !== 'Missing') continue

    const build = builds.find((b) => b.id === hp.buildId)
    if (!build) continue
    // EWO-104 Amendment 2 (Part A/B) — explicit Factory Loadout exclusion.
    // A Factory build's hardpoints already always read 'OK' by
    // construction (see isCommanderManagedBuild's own doc comment), so
    // this is redundant with the status check above today — kept as an
    // explicit, independent guard per Part B's own "use the same
    // authority wherever Flight Commander demand is derived" direction,
    // rather than relying on that emergent property alone.
    if (!isCommanderManagedBuild(build)) continue
    const ship = activeShipById.get(build.shipId)
    if (!ship) continue // retired or unknown ship — excluded

    const targetEntityClass = hp.targetEntityClass ?? null

    // EWO-104 Amendment 2 (Part C) — the exact same per-row reservation
    // exclusion `buildProcurementList` (src/utils/procurement.ts) already
    // establishes: a hardpoint with its OWN active reservation already has
    // a specific owned unit committed to it — the Commander needs to
    // install it, not acquire more, so it never becomes BOLO demand.
    // Reused directly (`findActiveSlotReservation`), never re-derived.
    if (findActiveSlotReservation(reservations, { missionConfigurationId: hp.buildId, targetSlotLabel: hp.slotLabel, componentName: hp.targetItem, componentEntityClass: targetEntityClass })) {
      continue
    }

    let group = groups.find((g) => componentIdentityMatches(g.componentName, g.componentEntityClass, hp.targetItem, targetEntityClass))
    if (!group) {
      group = { componentName: hp.targetItem, componentEntityClass: targetEntityClass, category: canonicalComponentCategoryKey(hp), fleetQuantityNeeded: 0, affected: [] }
      groups.push(group)
    }

    let affected = group.affected.find((a) => a.shipId === ship.id && a.buildId === build.id)
    if (!affected) {
      affected = { shipId: ship.id, shipName: ship.name, buildId: build.id, buildName: build.name, quantity: 0, deepLink: { path: `/ship-workspace/${ship.id}`, shipId: ship.id } }
      group.affected.push(affected)
    }
    affected.quantity += 1
    group.fleetQuantityNeeded += 1
  }

  // Net against currently owned, unreserved Hangar stock — the canonical
  // procurement/Needed-By authority's own definition of "still needed."
  return groups
    .map((g) => {
      const availability = calculateComponentAvailability(g.componentName, hangarItems, installedLoadouts, reservations, g.componentEntityClass)
      return { ...g, fleetQuantityNeeded: Math.max(0, g.fleetQuantityNeeded - availability.availableQuantity) }
    })
    .filter((g) => g.fleetQuantityNeeded > 0)
}

export function resolveFactoryLoadoutTargetIntelligence(params: FactoryLoadoutTargetIntelligenceParams): FactoryLoadoutTargetIntelligenceResult {
  const demandComponents = deriveDemandComponents(params)
  const factoryDataAvailable = shipDefinitions.some((d) => (shipFactoryTemplates[d.id] ?? []).length > 0)

  const sourceShips: TargetIntelligenceSourceShip[] = []
  if (demandComponents.length > 0 && factoryDataAvailable) {
    for (const definition of shipDefinitions) {
      const template = shipFactoryTemplates[definition.id] ?? []
      if (template.length === 0) continue

      const matches: TargetIntelligenceComponentMatch[] = []
      for (const demand of demandComponents) {
        const matchingRows = template.filter(
          (row) => !row.isStructural && row.factoryItem && row.factoryItem !== '—' && componentIdentityMatches(demand.componentName, demand.componentEntityClass, row.factoryItem, row.factoryEntityClass ?? null)
        )
        if (matchingRows.length === 0) continue
        matches.push({
          componentName: demand.componentName,
          componentEntityClass: demand.componentEntityClass,
          category: demand.category,
          factoryQuantity: matchingRows.length,
          fleetQuantityNeeded: demand.fleetQuantityNeeded,
          affected: demand.affected,
        })
      }
      if (matches.length === 0) continue

      const categoriesPresent = Array.from(new Set(matches.map((m) => m.category))).filter((c) => CANONICAL_STABLE_CATEGORY_KEYS.includes(c))
      const totalUnresolvedUnitsCovered = matches.reduce((sum, m) => sum + Math.min(m.factoryQuantity, m.fleetQuantityNeeded), 0)

      sourceShips.push({
        shipDefinitionId: definition.id,
        displayName: definition.displayName,
        matches,
        distinctComponentCount: matches.length,
        totalUnresolvedUnitsCovered,
        categoriesPresent,
      })
    }
  }

  // Part E — deterministic ranking: distinct matched components desc, then
  // total unresolved units covered desc, then display name as a stable
  // tie-breaker. No economic value, salvage probability, or rarity scoring.
  sourceShips.sort(
    (a, b) => b.distinctComponentCount - a.distinctComponentCount || b.totalUnresolvedUnitsCovered - a.totalUnresolvedUnitsCovered || a.displayName.localeCompare(b.displayName)
  )

  const matchedComponentKeys = new Set<string>()
  for (const s of sourceShips) for (const m of s.matches) matchedComponentKeys.add(`${m.componentEntityClass ?? ''}::${m.componentName}`)

  return {
    sourceShips,
    demandComponents,
    matchedDemandComponentCount: matchedComponentKeys.size,
    totalFleetRequirementUnits: demandComponents.reduce((sum, d) => sum + d.fleetQuantityNeeded, 0),
    sourceShipsIdentifiedCount: sourceShips.length,
    highValueTargetCount: sourceShips.filter((s) => s.distinctComponentCount > 1).length,
    factoryDataAvailable,
  }
}
