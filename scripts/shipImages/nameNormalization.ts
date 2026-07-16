/**
 * EWO-038 (Task 4) — normalization used ONLY to decide whether a workbook
 * ship name and a canonical hull's display name refer to the same real
 * ship. Deliberately narrow: whitespace/case/punctuation cleanup only —
 * never a broad fuzzy/similarity match that could silently attach an image
 * to the wrong variant (600i Explorer vs 600i Touring, Cutlass Black vs
 * Cutlass Red, Hercules C2/M2/A2, etc. must never collapse together).
 */

/** Trims only — the strictest comparison, for EXACT_NAME (Task 4, tier 1). */
export function exactCompareKey(s: string): string {
  return s.trim()
}

/**
 * EWO-038 — one confirmed ship-catalog data artifact: "Argo CSV-SM"'s own
 * `displayName` was generated with a literal trailing two-character
 * backslash-n sequence baked in (not a real newline, not part of the name —
 * confirmed by direct char-code inspection; no other canonical hull carries
 * this artifact). Stripped here rather than in generated-data itself, which
 * this mission is not authorized to touch.
 */
function stripKnownDisplayNameArtifacts(s: string): string {
  return s.endsWith('\\n') ? s.slice(0, -2) : s
}

/** Case-fold + collapse repeated/irregular whitespace + fold Unicode
 * diacritics (NFD + strip combining marks — standard orthographic
 * equivalence, not fuzzy similarity) — for NORMALIZED_NAME (Task 4, tiers
 * 2/4/5: canonical-display normalization, manufacturer-prefix
 * normalization, and reviewed variant-name normalization all compare on
 * this same key). Deliberately does NOT touch hyphens or other punctuation
 * within a name (e.g. "F7C-S", "Idris-M" are byte-identical between the two
 * sources in the current dataset) or Roman numerals — there is nothing in
 * the real Commander workbook that requires those specific transforms
 * today, and adding them unexercised risks silently collapsing a real
 * distinction later. */
export function normalizedCompareKey(s: string): string {
  return stripKnownDisplayNameArtifacts(s.trim())
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}
