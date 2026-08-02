import type { FactoryLoadoutTargetIntelligenceResult, TargetIntelligenceSourceShip } from './factoryLoadoutTargetIntelligence'
import { CANONICAL_STABLE_CATEGORY_KEYS } from './componentCategoryIcon'

/**
 * EWO-104 Amendment 1 — presentation and filtering only. This module reads
 * `FactoryLoadoutTargetIntelligenceResult` (EWO-104's canonical resolver,
 * untouched by this amendment) and narrows it to what Flight Commander
 * should actually display — it introduces no new demand/matching/
 * availability calculation; every number here is either passed through
 * verbatim or re-derived by filtering + the exact same counting/ranking
 * arithmetic the resolver itself already performs, applied to a subset.
 *
 * Part D — cosmetic/promotional ship-variant exclusion. No structured
 * authority exists anywhere in this app's data model for this distinction
 * — `ShipDefinition` (src/types/index.ts) carries no variant/edition/tags
 * field, confirmed by direct source read. The only real signal is the
 * ship's own `displayName` text, sourced upstream from CIG/StarBreaker's
 * own localized name. This is therefore a documented, explicit substring
 * exclusion list, not a hidden ad hoc filter: "wikelo" and "best in show"
 * are confirmed present in this app's real generated data (29 and 2
 * occurrences respectively); "foundation festival" and "concierge" are
 * included defensively per the work order's own named examples even
 * though absent from current data, in case a future data refresh
 * introduces them. If CIG data ever grows a structured edition/variant
 * field, this list should be replaced by a real predicate against it.
 */
const COSMETIC_VARIANT_MARKERS = ['wikelo', 'best in show', 'foundation festival', 'concierge']

export function isCanonicalStockShipDisplayName(displayName: string): boolean {
  const lower = displayName.toLowerCase()
  return !COSMETIC_VARIANT_MARKERS.some((marker) => lower.includes(marker))
}

/** Part E — actionable component scope. The resolver may (and does)
 * internally match against every component category factory data carries;
 * this presentation narrows what's actually shown to the five categories
 * that meaningfully affect fleet planning (the same
 * `CANONICAL_STABLE_CATEGORY_KEYS` the table's own category columns
 * already use) — Missile Racks, Utility mounts, Structural mounts, and
 * every other non-planning category are filtered out of the *display*,
 * never out of the resolver's own return value. */
function isActionableCategory(category: string): boolean {
  return CANONICAL_STABLE_CATEGORY_KEYS.includes(category)
}

/** The exact same deterministic ranking rule the resolver itself applies
 * (Part E of the original EWO-104), reapplied here because filtering can
 * change a ship's own distinct-match-count/coverage — never a new ranking
 * concept, the identical tie-break order. */
function rankSourceShips(ships: TargetIntelligenceSourceShip[]): TargetIntelligenceSourceShip[] {
  return [...ships].sort(
    (a, b) => b.distinctComponentCount - a.distinctComponentCount || b.totalUnresolvedUnitsCovered - a.totalUnresolvedUnitsCovered || a.displayName.localeCompare(b.displayName)
  )
}

export interface FlightCommanderPresentation {
  sourceShips: TargetIntelligenceSourceShip[]
  matchedDemandComponentCount: number
  totalFleetRequirementUnits: number
  sourceShipsIdentifiedCount: number
  highValueTargetCount: number
  factoryDataAvailable: boolean
  /** Whether any actionable-category demand exists at all, independent of
   * whether a source ship was found for it — drives the "no demand" vs.
   * "no source match" empty-state distinction (Part K, unchanged from the
   * original EWO-104) using the same actionable-category scope this
   * amendment introduces. */
  hasActionableDemand: boolean
}

export function buildFlightCommanderPresentation(result: FactoryLoadoutTargetIntelligenceResult): FlightCommanderPresentation {
  const filteredShips = result.sourceShips
    .filter((s) => isCanonicalStockShipDisplayName(s.displayName))
    .map((s) => {
      const matches = s.matches.filter((m) => isActionableCategory(m.category))
      const categoriesPresent = s.categoriesPresent.filter(isActionableCategory)
      const totalUnresolvedUnitsCovered = matches.reduce((sum, m) => sum + Math.min(m.factoryQuantity, m.fleetQuantityNeeded), 0)
      return { ...s, matches, categoriesPresent, distinctComponentCount: matches.length, totalUnresolvedUnitsCovered }
    })
    .filter((s) => s.matches.length > 0)

  const sourceShips = rankSourceShips(filteredShips)

  const matchedComponentKeys = new Set<string>()
  for (const s of sourceShips) for (const m of s.matches) matchedComponentKeys.add(`${m.componentEntityClass ?? ''}::${m.componentName}`)

  const actionableDemand = result.demandComponents.filter((d) => isActionableCategory(d.category))

  return {
    sourceShips,
    matchedDemandComponentCount: matchedComponentKeys.size,
    totalFleetRequirementUnits: actionableDemand.reduce((sum, d) => sum + d.fleetQuantityNeeded, 0),
    sourceShipsIdentifiedCount: sourceShips.length,
    highValueTargetCount: sourceShips.filter((s) => s.distinctComponentCount > 1).length,
    factoryDataAvailable: result.factoryDataAvailable,
    hasActionableDemand: actionableDemand.length > 0,
  }
}
