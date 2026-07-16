/**
 * EWO-038 (Task 4, tier 6 — "manual-review classification") — the last,
 * most explicit resort: a hand-reviewed, one-to-one map from a workbook
 * ship name (normalized) straight to the single canonical id it was
 * confirmed to mean, for the rare case a real workbook row doesn't resolve
 * through EXACT_NAME/NORMALIZED_NAME/EXISTING_ALIAS at all. Empty until a
 * real import run identifies a genuine case — never pre-filled with
 * guesses. Each entry is a deliberate, individually-justified decision,
 * not a pattern or rule.
 */
export const MANUAL_REVIEW_OVERRIDES: ReadonlyMap<string, string> = new Map([])
