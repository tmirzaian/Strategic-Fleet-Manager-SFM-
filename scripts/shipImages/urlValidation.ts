/**
 * EWO-038 (Task 2) — validates a workbook-supplied image URL without ever
 * downloading it. Mirrors (does not replace) the runtime's own
 * `validRegistryUrl` (src/utils/resolveShipImage.ts), which only requires
 * HTTPS — this validator is intentionally stricter at import time (host
 * allowlist, protocol rejection) since a bad value here would otherwise
 * sit silently in the generated registry.
 */
const APPROVED_RSI_IMAGE_HOSTS = new Set(['robertsspaceindustries.com', 'media.robertsspaceindustries.com'])

export type UrlValidationReason =
  | 'EMPTY'
  | 'NOT_ABSOLUTE_URL'
  | 'NOT_HTTPS'
  | 'DISALLOWED_HOST'
  | 'HAD_WHITESPACE'

export interface UrlValidationResult {
  valid: boolean
  /** The value to actually use if valid (trimmed) — always present even
   * when invalid, so a caller can still show what was supplied. */
  trimmed: string
  reasons: UrlValidationReason[]
}

export function validateImageUrl(raw: string): UrlValidationResult {
  const trimmed = raw.trim()
  const reasons: UrlValidationReason[] = []

  if (trimmed !== raw) reasons.push('HAD_WHITESPACE')
  if (trimmed === '') {
    return { valid: false, trimmed, reasons: ['EMPTY'] }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { valid: false, trimmed, reasons: [...reasons, 'NOT_ABSOLUTE_URL'] }
  }

  if (parsed.protocol !== 'https:') reasons.push('NOT_HTTPS')
  if (!APPROVED_RSI_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) reasons.push('DISALLOWED_HOST')

  // HAD_WHITESPACE alone (the URL is otherwise fine once trimmed) does not
  // fail validation — only genuinely malformed/disallowed URLs do.
  const hardFailures = reasons.filter((r) => r !== 'HAD_WHITESPACE')
  return { valid: hardFailures.length === 0, trimmed, reasons }
}
