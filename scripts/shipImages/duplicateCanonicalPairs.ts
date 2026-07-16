/**
 * EWO-038 (Task 5) — the two known pre-existing duplicate canonical-hull
 * pairs, confirmed by GF-002B-V1's full audit (see
 * docs/OPERATION_GOLDEN_FLEET.md): the seed-authored ship and its
 * catalog-only ("MISC "-prefixed) sibling describe the same real hull, but
 * `selectableShipDefinitions`'s own de-duplication does not merge them —
 * `bareHullName()`'s manufacturer-prefix strip only fires when a
 * definition's own `manufacturer` field literally starts with its
 * displayName's first word, and neither catalog entry's manufacturer field
 * ("Musashi Industrial & Starflight Concern") starts with "MISC". This is a
 * known, pre-existing quirk this mission explicitly must NOT fix (that is
 * GF-002D's job) — only account for during image import, per Task 5.
 *
 * Maps the lesser (catalog-only) sibling's canonical id to the preferred
 * winner's canonical id (ranked by the same completeness rule
 * shipDefinitions.ts already uses: a seed definition outranks a bare
 * Mission M-012 catalog placeholder). The winner receives the workbook's
 * image; the lesser sibling intentionally receives no runtime registry
 * entry of its own (never a duplicated URL) and remains on whatever image
 * source it already had (typically the universal fallback) until GF-002D.
 */
export const DUPLICATE_CANONICAL_PAIRS: ReadonlyMap<string, string> = new Map([
  ['MISC_Prospector', 'prospector'],
  ['MISC_Starlite', 'starlite'],
])
