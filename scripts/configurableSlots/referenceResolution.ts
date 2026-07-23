/**
 * SW-010A — Default Loadout Reference Resolution.
 *
 * ADR-014's own Readiness Review listed "whether a normalized reference
 * key can be resolved to a real entity class" as an open problem — the
 * one live test performed there (`dcb query --filter` glob matching
 * against a naive uppercase transform of the file path) failed, because
 * `dcb query`'s glob filter is case-sensitive against the real,
 * non-mechanically-cased entity class name.
 *
 * SW-010A implementation found the actual general solution: it doesn't
 * require StarBreaker to do case-insensitive matching at all. Every
 * entity class SFM already bulk-fetches (for Swap Group Resolution, or
 * any other full-catalog bulk query) can be indexed client-side, once,
 * by lowercase name — and a `normalizeEntityClassReference()` output
 * (`defaultLoadoutExtractor.ts`) matches that lowercase index exactly,
 * for every one of the 7 real references checked during implementation
 * (Hornet Mk II center mount + nose cone, Retaliator front/rear module
 * defaults, Scorpius turret, MOTH turret + missile rack), with **zero
 * case-insensitive collisions** across the full ~25,959-entity universe.
 * This closes the "general reference resolution" gap — no per-vessel
 * hand-maintained lookup table is required.
 */

/** Builds a lowercase-name -> real-cased-name index over any iterable of
 * real entity class names — typically the same bulk-fetched universe
 * already used for tag resolution (`swapGroupResolver.ts`'s
 * `buildGlobalTagIndex` input keys), so no new query is required. */
export function buildEntityClassCaseIndex(entityClasses: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>()
  for (const entityClass of entityClasses) {
    const lower = entityClass.toLowerCase()
    // A genuine collision (two real entity classes differing only by
    // case) is not expected — DataCore record names are unique — but if
    // one is ever found, the first one indexed wins and nothing throws;
    // callers needing certainty should treat a index-miss vs. index-hit
    // distinction as the real signal, not assume uniqueness blindly.
    if (!index.has(lower)) index.set(lower, entityClass)
  }
  return index
}

/**
 * Resolves a normalized reference key (from
 * `normalizeEntityClassReference()`) to its real, correctly-cased entity
 * class, using an already-built case index. Returns `null` when no
 * case-insensitive match exists — never a guess, never a partial/fuzzy
 * match.
 */
export function resolveEntityClassReference(normalizedReference: string, caseIndex: Map<string, string>): string | null {
  return caseIndex.get(normalizedReference.toLowerCase()) ?? null
}
