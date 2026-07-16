/**
 * EWO-038 (Task 4, tier 5 — "reviewed variant-name normalization") —
 * a small, explicit, individually-reviewed list of known differences
 * between the Commander workbook's ship names and SFM's canonical
 * `bareDisplayName` (manufacturer prefix already stripped), discovered by
 * direct comparison of the real 221-row workbook against the real 258
 * canonical hulls. Each entry maps a normalized workbook name to the
 * normalized canonical bare name it is confirmed to mean — never a
 * generic rule (e.g. "drop the last word"), so this can never silently
 * misattach an image to the wrong variant. Keys/values must already be run
 * through `normalizedCompareKey` (see nameNormalization.ts).
 *
 * The Commander workbook consistently omits the "Starlifter" sub-brand
 * name for all three Hercules variants — RSI's own site lists them as
 * "A2 Hercules" / "C2 Hercules" / "M2 Hercules" without it, while SFM's
 * catalog (sourced from the full StarBreaker record) carries the complete
 * "A2 Hercules Starlifter" name. The variant code (A2/C2/M2) is still the
 * distinguishing token on both sides, so this alias can never conflate the
 * three distinct hulls with each other.
 */
export const REVIEWED_NAME_ALIASES: ReadonlyMap<string, string> = new Map([
  ['a2 hercules', 'a2 hercules starlifter'],
  ['c2 hercules', 'c2 hercules starlifter'],
  ['m2 hercules', 'm2 hercules starlifter'],

  // "Explorer" is RSI's own real product name for the base/unlabeled 600i —
  // distinct from the separately-named "600i Touring" and "600i Executive
  // Edition", both of which already match the workbook directly and are
  // never touched by this entry.
  ['600i explorer', '600i'],

  // The workbook consistently drops a trailing qualifier word RSI's own
  // site omits in casual listings but SFM's catalog (sourced from the full
  // StarBreaker record) keeps — each of the following has exactly one
  // canonical candidate, so this can never misattach across variants.
  ['85x', '85x limited'],
  ['ares inferno', 'ares star fighter inferno'],
  ['ares ion', 'ares star fighter ion'],
  ['c8r pisces', 'c8r pisces rescue'],
  ['gladius pirate edition', 'gladius pirate'],
  ['m50', 'm50 interceptor'],
  ['mercury', 'mercury star runner'],
  ['valkyrie liberator edition', 'valkyrie liberator'],

  // The unlabeled base Dragonfly is RSI's real "Dragonfly Black" (a color
  // designation, the same convention as the two other Dragonfly color
  // variants — "Star Kitten"/pink and "Yellowjacket" — which already match
  // the workbook directly and are never touched by this entry).
  ['dragonfly black', 'dragonfly'],

  // Two individual, one-off catalog anomalies (confirmed by direct
  // inspection): these two hulls' own `manufacturer` field doesn't match
  // their `displayName` prefix at all (Esperia/Vanduul are cross-attributed
  // between them in the source data), so the general manufacturer-prefix
  // strip can't reach them.
  ['scythe', 'vanduul scythe'],
  ['stinger', 'esperia stinger'],

  // Plain spelling/naming differences between the workbook and SFM's
  // catalog, each with exactly one unambiguous canonical candidate.
  ['f7c hornet heartseeker mk i', 'f7c-m hornet heartseeker mk i'],
  ['f8c lightening', 'f8c lightning'],
  ['f8c lightening executive edition', 'f8c lightning executive edition'],
])
