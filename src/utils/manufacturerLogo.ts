export interface ManufacturerLogoInfo {
  code: string
  displayName: string
  /** Local asset path, when one exists. No logo image assets ship with
   * this build yet — every manufacturer currently resolves to the text
   * fallback (Part 10: "do not block the sprint on complete logo
   * coverage"). The resolver architecture is what this sprint delivers;
   * dropping real assets into a manifest later requires no caller changes. */
  logoPath?: string
}

/**
 * Normalizes manufacturer name/code aliases to a short badge code
 * (Alpha 2.5C, Part 10). Ship Detail never hardcodes manufacturer logic
 * itself — it always goes through this resolver, so adding a new
 * manufacturer or a real logo asset later is a one-file change.
 */
const MANUFACTURER_ALIASES: Record<string, string> = {
  anvil: 'ANVL',
  'anvil aerospace': 'ANVL',
  aegis: 'AEGS',
  'aegis dynamics': 'AEGS',
  drake: 'DRAK',
  'drake interplanetary': 'DRAK',
  origin: 'ORIG',
  'origin jumpworks': 'ORIG',
  misc: 'MISC',
  'musashi industrial & starflight concern': 'MISC',
  rsi: 'RSI',
  roberts: 'RSI',
  'roberts space industries': 'RSI',
  crusader: 'CRUS',
  'crusader industries': 'CRUS',
  argo: 'ARGO',
  'argo astronautics': 'ARGO',
  // EWO-051 — the real DataCore/ship-catalog code for Gatac is "GAM"
  // (confirmed against generated-data/ship-catalog.json's own resolved
  // manufacturer record for Railen/Syulen/Tyilui) — "GATC" here before
  // this mission was never validated against real data and matched
  // nothing any real ship actually carries, silently leaving every Gatac
  // ship's manufacturer unresolved.
  gatac: 'GAM',
  'gatac manufacture': 'GAM',
  mirai: 'MRAI',
  tumbril: 'TMBL',
  'tumbril land systems': 'TMBL',
  // EWO-050 — Grey's Market (code GLSN, confirmed via the real DataCore
  // manufacturer record's own localization, @manufacturer_NameGREY). Only
  // one reviewed alias, like Mirai/Tumbril above with no separate long
  // form — the short name doubles as the full name.
  "grey's market": 'GLSN',
  // EWO-050 (Additional Validation) — found alongside the Grey's Market
  // audit: Consolidated Outland (code CNOU) was never added either, so
  // every CNOU ship's ShipDefinition.manufacturer field was silently
  // empty (confirmed against all 8 deep-imported CNOU ships). Only one
  // reviewed alias, same pattern as Mirai/Grey's Market above.
  'consolidated outland': 'CNOU',
  // EWO-051 (Manufacturer Integrity Initiative) — the Manufacturer Audit
  // found these real, confirmed manufacturers (all resolved against
  // generated-data/ship-catalog.json's own real DataCore records) missing
  // from this table entirely, the exact same gap shape as Grey's
  // Market/Consolidated Outland before EWO-050 — every ship of theirs had
  // a silently blank ShipDefinition.manufacturer field. "greycat" and
  // "kruger" are the short, commonly-used forms Commanders actually search
  // with (Objective 2's own worked example); the canonical stored form is
  // still the full corporate name (see MANUFACTURER_CANONICAL_NAME below).
  greycat: 'GRIN',
  'greycat industrial': 'GRIN',
  esperia: 'ESPR',
  banu: 'BANU',
  kruger: 'KRI',
  'kruger intergalactic': 'KRI',
  aopoa: 'XNAA',
  // "Xi'an" is the in-fiction species/faction name, not the manufacturer
  // brand itself (that's "Aopoa") — included as a search alias only,
  // since Commanders commonly refer to these hulls that way.
  "xi'an": 'XNAA',
  vanduul: 'VNC',
}

/**
 * EWO-051 (Manufacturer Integrity Initiative) — one canonical stored
 * string per manufacturer, independent of `MANUFACTURER_ALIASES`' own
 * shortest/longest-alias-derived short/full names below. Most real
 * manufacturers here use their common short brand name (Aegis, Anvil,
 * Drake, Origin, RSI, MISC, Crusader, Argo, Gatac, Mirai, Tumbril,
 * Banu) — matching what this app has always displayed — but a few use
 * their real full corporate name instead, because that IS the name
 * Commanders and DataCore itself use for them (Greycat Industrial,
 * Kruger Intergalactic, Consolidated Outland, Grey's Market) rather than
 * an artificially-shortened form nobody actually calls them. Never
 * derived from alias string length — that mechanism is what silently
 * produced the wrong canonical form for Greycat/Kruger in the first
 * place (the bare "Greycat"/"Kruger" search aliases are shorter than the
 * real corporate names, so a length-based pick would wrongly canonicalize
 * to the short form). Every code in `MANUFACTURER_ALIASES` MUST have an
 * entry here — enforced by scripts/componentCatalog/__tests__ and
 * src/utils/__tests__/manufacturerLogo.test.ts's own coverage test.
 */
const MANUFACTURER_CANONICAL_NAME: Record<string, string> = {
  ANVL: 'Anvil',
  AEGS: 'Aegis',
  DRAK: 'Drake',
  ORIG: 'Origin',
  MISC: 'MISC',
  RSI: 'RSI',
  CRUS: 'Crusader',
  ARGO: 'Argo',
  GAM: 'Gatac',
  MRAI: 'Mirai',
  TMBL: 'Tumbril',
  GLSN: "Grey's Market",
  CNOU: 'Consolidated Outland',
  GRIN: 'Greycat Industrial',
  ESPR: 'Esperia',
  BANU: 'Banu',
  KRI: 'Kruger Intergalactic',
  XNAA: 'Aopoa',
  VNC: 'Vanduul',
}

/**
 * EWO-023 (Task 3) — the reverse of `MANUFACTURER_ALIASES`: a manufacturer
 * CODE (e.g. "DRAK", as parsed from a StarBreaker entity class like
 * "DRAK_Cutlass_Black") -> its short canonical display name ("Drake").
 * Derived from the SAME reviewed alias table above rather than a second,
 * separately-maintained name list — for a code with more than one alias
 * (e.g. "drake" and "drake interplanetary" both map to DRAK), the
 * shortest key wins, since this table's own convention is that the
 * short form is always the bare brand name and the long form is the
 * full corporate name. Never invents a manufacturer that isn't already
 * a reviewed entry in `MANUFACTURER_ALIASES`.
 */
/** EWO-050 — a bare `\b\w` word-boundary match treats an apostrophe as a
 * non-word character, so it would incorrectly also capitalize the letter
 * right after one ("grey's" -> "Grey'S"). The negative lookbehind keeps
 * that letter lowercase while still capitalizing every real word start. */
function titleCase(s: string): string {
  return s.replace(/(?<!')\b\w/g, (c) => c.toUpperCase())
}

/**
 * EWO-051 — when a manufacturer's shortest alias IS its own code in
 * every way except casing (RSI's shortest alias is literally "rsi";
 * MISC's is "misc"), that alias is a real acronym brand name, not an
 * ordinary word — `titleCase` would wrongly produce "Rsi"/"Misc" (only
 * the first letter capitalized) instead of the correct all-caps "RSI"/
 * "MISC". Confirmed a real, live defect: the Add Ship picker's label
 * formatter (`formatShipPickerLabel`) rendered every RSI ship's
 * manufacturer suffix as "— Rsi", never "— RSI", until this fix. Using
 * the code's own casing in that one case, title-casing every other alias
 * normally, fixes it without touching any manufacturer whose short form
 * is a genuine word (Drake, Aegis, Anvil, ...).
 */
function shortNameFor(code: string, alias: string): string {
  return alias.toLowerCase() === code.toLowerCase() ? code : titleCase(alias)
}

const MANUFACTURER_CODE_TO_NAME: Record<string, string> = (() => {
  const byCode: Record<string, string> = {}
  for (const [alias, code] of Object.entries(MANUFACTURER_ALIASES)) {
    const existing = byCode[code]
    if (!existing || alias.length < existing.length) {
      byCode[code] = alias
    }
  }
  return Object.fromEntries(Object.entries(byCode).map(([code, alias]) => [code, shortNameFor(code, alias)]))
})()

/** Resolves a manufacturer code (e.g. "DRAK", "AEGS") to its short
 * canonical display name (e.g. "Drake", "Aegis"), or `undefined` for a
 * code with no reviewed entry — callers must keep their own fallback for
 * that case, never guess a name from the bare code. */
export function manufacturerNameForCode(code: string): string | undefined {
  return MANUFACTURER_CODE_TO_NAME[code.trim().toUpperCase()]
}

/**
 * EWO-026 (Task 9/10) — the reverse of `manufacturerNameForCode`, but the
 * LONGEST alias per code (e.g. "drake interplanetary", "origin jumpworks")
 * rather than the shortest — this table's own convention is that the long
 * form is always the full corporate name. Derived from the same reviewed
 * `MANUFACTURER_ALIASES` table, never a second hand-maintained list, and
 * never invents a full name for a manufacturer with no reviewed long-form
 * alias (e.g. "Mirai", which only ever had one alias) — that manufacturer's
 * short name doubles as its full name rather than fabricating one.
 */
const MANUFACTURER_CODE_TO_FULL_NAME: Record<string, string> = (() => {
  const byCode: Record<string, string> = {}
  for (const [alias, code] of Object.entries(MANUFACTURER_ALIASES)) {
    const existing = byCode[code]
    if (!existing || alias.length > existing.length) {
      byCode[code] = alias
    }
  }
  return Object.fromEntries(Object.entries(byCode).map(([code, alias]) => [code, titleCase(alias)]))
})()

/** Resolves a manufacturer code to its full corporate display name (e.g.
 * "DRAK" -> "Drake Interplanetary"), or `undefined` for a code with no
 * reviewed entry. */
export function manufacturerFullNameForCode(code: string): string | undefined {
  return MANUFACTURER_CODE_TO_FULL_NAME[code.trim().toUpperCase()]
}

/** Resolves a manufacturer name or code (short or long form — both are
 * reviewed alias-table keys) to its own alias code, or `undefined` if it
 * isn't a reviewed manufacturer at all. */
export function manufacturerCodeFor(manufacturerNameOrCode: string): string | undefined {
  return MANUFACTURER_ALIASES[manufacturerNameOrCode.trim().toLowerCase()]
}

/** Resolves a manufacturer name or code to display info. Unknown
 * manufacturers fall back to the first four letters of whatever string
 * was given, uppercased — never blocks rendering, never throws. */
export function resolveManufacturerLogo(manufacturerNameOrCode: string): ManufacturerLogoInfo {
  const trimmed = (manufacturerNameOrCode ?? '').trim()
  if (!trimmed) return { code: '—', displayName: 'Unknown Manufacturer', logoPath: undefined }

  const key = trimmed.toLowerCase()
  const fallback = trimmed.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || '—'
  const code = MANUFACTURER_ALIASES[key] ?? fallback

  return { code, displayName: trimmed, logoPath: undefined }
}

/**
 * EWO-051 (Manufacturer Integrity Initiative) — the ONE function that
 * turns any raw manufacturer string (whatever casing/verbosity a given
 * source happened to store — "Rsi", "RSI", "Roberts Space Industries")
 * into the single canonical form every ShipDefinition stores from Beta
 * onward (see src/data/shipDefinitions.ts). Deliberately never guesses:
 * an unreviewed manufacturer (no entry in MANUFACTURER_ALIASES) is
 * returned trimmed as-is rather than invented or blanked — a genuinely
 * new/undocumented manufacturer stays visible and searchable by its own
 * raw name instead of silently disappearing.
 */
export function canonicalManufacturerName(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return 'Unknown'
  const code = manufacturerCodeFor(trimmed)
  if (!code) return trimmed
  return MANUFACTURER_CANONICAL_NAME[code] ?? trimmed
}

/**
 * EWO-051 — the reverse of `MANUFACTURER_ALIASES`, grouped: every known
 * alias string for a given code, so a free-text search token can match
 * against ANY of them (e.g. "roberts" matching a ship whose canonical
 * manufacturer is "RSI", via the "roberts space industries" alias), not
 * just the one canonical string actually stored.
 */
const ALIASES_BY_CODE: Record<string, string[]> = (() => {
  const byCode: Record<string, string[]> = {}
  for (const [alias, code] of Object.entries(MANUFACTURER_ALIASES)) {
    ;(byCode[code] ??= []).push(alias)
  }
  return byCode
})()

/**
 * EWO-051 (Objective 2/6) — the one shared search-matching function every
 * manufacturer search field (Add Ship, future filters) uses, so "RSI",
 * "Roberts", and "Roberts Space Industries" all find the same ships
 * without each caller re-implementing its own alias logic. `manufacturer`
 * is expected to already be canonical (every ShipDefinition's own field
 * is, post-EWO-051) — this only widens what a Commander's typed QUERY is
 * allowed to match against, never what gets stored.
 */
export function manufacturerMatchesQuery(manufacturer: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const name = (manufacturer ?? '').trim().toLowerCase()
  if (name.includes(q)) return true
  const code = manufacturerCodeFor(manufacturer)
  if (!code) return false
  if (code.toLowerCase().includes(q)) return true
  return (ALIASES_BY_CODE[code] ?? []).some((alias) => alias.includes(q))
}
