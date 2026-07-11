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
