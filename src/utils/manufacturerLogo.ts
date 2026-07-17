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
  'roberts space industries': 'RSI',
  crusader: 'CRUS',
  'crusader industries': 'CRUS',
  argo: 'ARGO',
  'argo astronautics': 'ARGO',
  gatac: 'GATC',
  'gatac manufacture': 'GATC',
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

const MANUFACTURER_CODE_TO_NAME: Record<string, string> = (() => {
  const byCode: Record<string, string> = {}
  for (const [alias, code] of Object.entries(MANUFACTURER_ALIASES)) {
    const existing = byCode[code]
    if (!existing || alias.length < existing.length) {
      byCode[code] = alias
    }
  }
  return Object.fromEntries(Object.entries(byCode).map(([code, alias]) => [code, titleCase(alias)]))
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
