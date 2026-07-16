/**
 * EWO-038 (Task 4) — matches one Commander workbook ship name to a
 * canonical selectable hull, via the mission's own controlled precedence:
 *   1/2/4/5. EXACT_NAME, then NORMALIZED_NAME (whitespace/case cleanup,
 *      manufacturer-prefix strip, and the small reviewed alias table all
 *      compare on the same normalized key — see nameNormalization.ts and
 *      reviewedNameAliases.ts for why these collapse into one step).
 *   3. EXISTING_ALIAS — the name matches a superseded/non-selectable
 *      definition's own display name; redirect to its canonical winner.
 *   6. MANUAL_REVIEW — an explicit, hand-reviewed one-off override.
 * Never broad fuzzy matching: a name with more than one plausible
 * candidate at any tier is AMBIGUOUS, not a guess.
 */
import type { CanonicalHullRow } from './canonicalHulls'
import { exactCompareKey, normalizedCompareKey } from './nameNormalization'
import { REVIEWED_NAME_ALIASES } from './reviewedNameAliases'
import { MANUAL_REVIEW_OVERRIDES } from './manualReviewOverrides'

export type MatchMethod = 'EXACT_NAME' | 'NORMALIZED_NAME' | 'EXISTING_ALIAS' | 'MANUAL_REVIEW'
export type MatchOutcome = MatchMethod | 'AMBIGUOUS' | 'UNMATCHED'

export interface MatchResult {
  outcome: MatchOutcome
  /** Populated only when outcome is a real match method (a single canonical id). */
  canonicalId?: string
  /** Populated only when outcome is 'AMBIGUOUS' — every plausible candidate. */
  candidateIds?: string[]
}

function findByKey(hulls: CanonicalHullRow[], key: string, keyFn: (h: CanonicalHullRow) => string): CanonicalHullRow[] {
  return hulls.filter((h) => keyFn(h) === key)
}

/** Resolves a set of matched hulls (0, 1, or many) into the tier's outcome
 * for this specific comparison — many is always AMBIGUOUS, never a guess. */
function resolveTier(matches: CanonicalHullRow[], method: MatchMethod): MatchResult | undefined {
  if (matches.length === 1) return { outcome: method, canonicalId: matches[0].canonicalId }
  if (matches.length > 1) return { outcome: 'AMBIGUOUS', candidateIds: matches.map((m) => m.canonicalId) }
  return undefined
}

export function matchShipName(workbookName: string, canonicalHulls: CanonicalHullRow[], aliasLookupRows: CanonicalHullRow[]): MatchResult {
  // Tier 1 — EXACT_NAME: the workbook's own text, trimmed only, against the
  // canonical hull's real displayName exactly as SFM shows it (no
  // manufacturer-prefix stripping yet — that is tier 2's job).
  const exactKey = exactCompareKey(workbookName)
  const exactMatches = canonicalHulls.filter((h) => exactCompareKey(h.displayName) === exactKey)
  const exactResult = resolveTier(exactMatches, 'EXACT_NAME')
  if (exactResult) return exactResult

  // Tiers 2/4/5 — NORMALIZED_NAME: case-fold + whitespace-collapse, and the
  // small reviewed alias table for a handful of known RSI/SFM name gaps.
  const normalizedKey = normalizedCompareKey(workbookName)
  const aliasedKey = REVIEWED_NAME_ALIASES.get(normalizedKey) ?? normalizedKey
  const normalizedMatches = canonicalHulls.filter((h) => {
    const displayKey = normalizedCompareKey(h.displayName)
    const bareKey = normalizedCompareKey(h.bareDisplayName)
    return displayKey === normalizedKey || bareKey === normalizedKey || displayKey === aliasedKey || bareKey === aliasedKey
  })
  const normalizedResult = resolveTier(normalizedMatches, 'NORMALIZED_NAME')
  if (normalizedResult) return normalizedResult

  // Tier 3 — EXISTING_ALIAS: the name matches a non-canonical/superseded
  // definition directly; redirect to that hull group's canonical winner
  // (only meaningful if the winner is itself a currently-selectable hull).
  const canonicalIds = new Set(canonicalHulls.map((h) => h.canonicalId))
  const aliasSourceMatches = aliasLookupRows.filter(
    (h) => !canonicalIds.has(h.canonicalId) && (exactCompareKey(h.displayName) === exactKey || normalizedCompareKey(h.bareDisplayName) === normalizedKey)
  )
  const aliasCanonicalIds = Array.from(new Set(aliasSourceMatches.map((h) => h.registryKey).filter((id) => canonicalIds.has(id))))
  if (aliasCanonicalIds.length === 1) return { outcome: 'EXISTING_ALIAS', canonicalId: aliasCanonicalIds[0] }
  if (aliasCanonicalIds.length > 1) return { outcome: 'AMBIGUOUS', candidateIds: aliasCanonicalIds }

  // Tier 6 — MANUAL_REVIEW: an explicit, individually-reviewed override.
  const manualOverride = MANUAL_REVIEW_OVERRIDES.get(normalizedKey)
  if (manualOverride && canonicalIds.has(manualOverride)) return { outcome: 'MANUAL_REVIEW', canonicalId: manualOverride }

  return { outcome: 'UNMATCHED' }
}
