import { manufacturerCodeFor, manufacturerNameForCode, manufacturerFullNameForCode } from './manufacturerLogo'

/**
 * EWO-026 (Task 9/10/11) — the one shared formatter for every Commander-
 * facing ship picker label (Add Ship today; any future picker tomorrow),
 * so seed, deep-import, and Mission M-012 catalog definitions all read
 * the same way: "Manufacturer Model — Manufacturer Full Name" (e.g.
 * "Origin 135c — Origin Jumpworks").
 *
 * The three current sources of `ShipDefinition` disagree with each other
 * in exactly two ways this formatter reconciles:
 *   - seed/deep-import definitions store `displayName` WITHOUT a
 *     manufacturer prefix ("135c", "Cutlass Black", "Eclipse") and
 *     `manufacturer` as the short brand name ("Origin", "Drake", "Aegis");
 *   - Mission M-012 catalog-only definitions already store `displayName`
 *     WITH the prefix baked in ("Drake Cutlass Blue") and `manufacturer`
 *     as the full corporate name ("Drake Interplanetary") straight from
 *     source data.
 * Prefixing unconditionally would double up the catalog source's already-
 * correct names ("Drake Drake Cutlass Blue") — this checks whether the
 * model name already starts with the resolved brand (short or full form)
 * before adding one.
 *
 * Never fabricates a manufacturer: a name/code with no reviewed entry in
 * `manufacturerLogo.ts`'s alias table is shown exactly as given, with no
 * invented prefix or full name (Design Authority Ruling 6).
 */
export function formatShipPickerLabel(displayName: string, manufacturer: string): string {
  const trimmedName = (displayName ?? '').trim()
  const trimmedManufacturer = (manufacturer ?? '').trim()

  if (!trimmedManufacturer || trimmedManufacturer.toLowerCase() === 'unknown') {
    return trimmedName || 'Unknown Ship'
  }

  const code = manufacturerCodeFor(trimmedManufacturer)
  const shortName = code ? manufacturerNameForCode(code) : undefined
  const fullName = code ? manufacturerFullNameForCode(code) : undefined

  if (!shortName || !fullName) {
    // Unreviewed manufacturer — never guess a normalized brand prefix or
    // full name; show exactly what's already known.
    return `${trimmedName} — ${trimmedManufacturer}`
  }

  const alreadyPrefixed = startsWithWord(trimmedName, shortName) || startsWithWord(trimmedName, fullName)
  const normalizedModel = alreadyPrefixed ? trimmedName : `${shortName} ${trimmedName}`.trim()
  return `${normalizedModel} — ${fullName}`
}

function startsWithWord(value: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}(\\s|$)`, 'i').test(value)
}
