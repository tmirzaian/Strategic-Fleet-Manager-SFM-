/**
 * Component Classification extraction (CAT-001).
 *
 * DataCore has no structured `Class` field (confirmed by direct StarBreaker
 * schema probe: `SItemDefinition` rejects both `Class` and `ItemClass` as
 * unknown properties — see DATA-001). The Civilian/Industrial/Military/
 * Competition/Stealth vocabulary is nonetheless real, CIG-authored content:
 * it lives in the plain-text header CIG prepends to every item's localized
 * description (`AttachDef.Localization.Description`, resolved the same way
 * as `Localization.Name` — a `@`-prefixed key into
 * `Data/Localization/english/global.ini`). A real resolved example:
 *
 *   "Item Type: Shield Generator\nManufacturer: Ascension Astro\nSize: 1\nGrade: A\nClass: Stealth\n\nBy boasting a signature so faint..."
 *
 * Two things confirmed live against the LIVE Data.p4k while building this:
 *   1. The resolved string's line breaks are the literal two-character
 *      sequence "\n" (backslash + n), not a real newline byte.
 *   2. The header is a fixed-format, line-based `Label: Value` block
 *      terminated by a blank line, before the free-form flavor prose. This
 *      module parses that STRUCTURE generically — it never regex-searches
 *      for "Class" against the whole description body (which could also
 *      match label-like text inside the prose) — only lines within the
 *      already-isolated header block are ever read as label/value pairs.
 */

/**
 * Per-locale header label names (Objective 4 — localization-aware
 * parsing). Only 'en' is populated: SFM's catalog generator only ever
 * extracts `Data/Localization/english/global.ini` (see
 * scripts/universeCatalog/localization.ts) — there is no other locale's
 * text to parse today. The label lookup itself is the only
 * locale-specific part of this module; the structural header parse above
 * it is entirely generic, so a future locale needs only a new entry here,
 * never a rewritten parser.
 */
export const DESCRIPTION_HEADER_LABELS: Record<string, { classification: string; grade: string }> = {
  en: { classification: 'Class', grade: 'Grade' },
}

/**
 * Splits a resolved localized description into its header `Label: Value`
 * map — everything before the first blank line. Returns an empty map for
 * null/empty input or a body with no colon-separated header lines (e.g. a
 * ship hull's "Manufacturer/Focus" description template, or an item with
 * no description at all).
 */
export function parseDescriptionHeader(rawText: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!rawText) return map

  // The literal two-character "\n" sequence is this field's real line
  // break (see module doc comment) — never a byte 0x0A in the raw value.
  const normalized = rawText.split('\\n').join('\n')
  const headerBlock = normalized.split(/\n\s*\n/)[0]

  for (const line of headerBlock.split('\n')) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) continue
    const label = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    if (label && value) map.set(label, value)
  }
  return map
}

export interface DescriptionClassificationResult {
  /** The raw "Class" line value, exactly as CIG wrote it — never
   * filtered against a known-vocabulary allowlist (Objective 2: "do not
   * assume these are exhaustive"). Null when the header has no
   * classification line at all (every Weapon/Missile/Utility record, and
   * a real fraction of Core Components with no description text). */
  classification: string | null
  /** The raw "Grade" line value — a letter (A-D) or, for bespoke/capital
   * components, the literal word "Bespoke". Used only for the Objective 3
   * cross-check against the structured Grade field; never itself
   * persisted as a component's grade. */
  gradeText: string | null
}

/** Reads Classification + Grade out of an already-parsed header, using
 * the requested locale's label names. Falls back to 'en' when the
 * requested locale has no configured label set. */
export function extractClassificationAndGrade(header: Map<string, string>, locale: string = 'en'): DescriptionClassificationResult {
  const labels = DESCRIPTION_HEADER_LABELS[locale] ?? DESCRIPTION_HEADER_LABELS.en
  return {
    classification: header.get(labels.classification) ?? null,
    gradeText: header.get(labels.grade) ?? null,
  }
}

/**
 * CAT-002 — which description-header label carries a component's single
 * "operationally distinguishing" identity value, by family. Core
 * Components use "Class" (CAT-001); Weapons and Missiles use a
 * differently-named label in CIG's own template ("Item Type" and
 * "Tracking Signal" respectively) — confirmed live against LIVE
 * Data.p4k: e.g. `BEHR_BallisticCannon_S4`'s description header is
 * `{Manufacturer, "Item Type": "Ballistic Cannon", Size}` (no "Class"
 * line at all), and `MISL_S01_EM_THCN_TaskForce`'s is `{Manufacturer,
 * "Tracking Signal": "Electromagnetic", Size}`. This reuses the exact
 * same bulk-queried field and header parser CAT-001 already built — no
 * new DataCore extraction, no new parsing subsystem, and the result is
 * written into the same `classification` field CAT-001 introduced
 * (family-appropriate rather than Core-only), not a new catalog field.
 */
type OperationalIdentityFamily = 'core' | 'weapon' | 'missile'

const OPERATIONAL_IDENTITY_FAMILY_BY_CATEGORY: Record<string, OperationalIdentityFamily> = {
  Cooler: 'core',
  PowerPlant: 'core',
  QuantumDrive: 'core',
  Shield: 'core',
  Radar: 'core',
  LifeSupportGenerator: 'core',
  // Real, distinct category (12 real entities) — kept in step with
  // classificationDiagnostics.ts's CORE_CLASSIFICATION_CATEGORIES, which
  // already scopes this category as Core.
  JumpDrive: 'core',
  WeaponGun: 'weapon',
  Missile: 'missile',
}

const OPERATIONAL_IDENTITY_LABEL_BY_FAMILY: Record<OperationalIdentityFamily, string> = {
  core: 'Class',
  weapon: 'Item Type',
  missile: 'Tracking Signal',
}

/** Reads the family-appropriate identity label out of an already-parsed
 * header. A category with no configured family (missile racks, utility,
 * doors, thrusters, ...) resolves to null — CAT-002 only extends
 * coverage to Core/Weapon/Missile; every other family keeps whatever
 * grammar it already has. */
export function extractOperationalIdentityValue(header: Map<string, string>, category: string | null | undefined): string | null {
  const family = category ? OPERATIONAL_IDENTITY_FAMILY_BY_CATEGORY[category] : undefined
  if (!family) return null
  return header.get(OPERATIONAL_IDENTITY_LABEL_BY_FAMILY[family]) ?? null
}

/**
 * The vocabulary CAT-001 names as the expected common case — used only for
 * diagnostics (flagging a value outside this set for engineering review),
 * never to reject, drop, or normalize an extracted value. A real sixth
 * value ("Gadget", on a WeaponPersonal gadget item — not a ship component)
 * already exists in live LIVE data, confirming this set is genuinely not
 * exhaustive.
 */
export const KNOWN_CLASSIFICATION_VOCABULARY = new Set(['Civilian', 'Industrial', 'Military', 'Competition', 'Stealth'])

/** DataCore's plain integer Grade (1-4) -> the same letter convention
 * already used throughout this app's presentation layer. Mirrors
 * src/utils/componentPresentation.ts's GRADE_LETTERS exactly — kept as a
 * separate copy rather than importing across the scripts/src boundary,
 * the same convention already used by src/generated/componentCatalog.ts
 * for CATEGORY_TO_PORT_TYPE. */
const STRUCTURED_GRADE_LETTERS: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }

export interface GradeMismatch {
  entityClass: string
  structuredGrade: number | null
  /** The structured grade converted to a letter — null when the
   * structured grade is absent or outside the recognized 1-4 range. */
  structuredGradeLetter: string | null
  textGrade: string
}

/**
 * Objective 3 — compares the description text's own Grade line against
 * the structured `AttachDef.Grade` field already extracted for this
 * record. Returns null when there's nothing to compare (no text grade) or
 * when they agree; a non-null result is a real, confirmed disagreement
 * (e.g. structured Grade 1/"A" vs. text "Bespoke", or two different
 * letters) for the caller to log and report — never to act on by itself.
 * The structured field always remains authoritative; this function never
 * mutates or overrides it.
 */
export function detectGradeMismatch(entityClass: string, structuredGrade: number | null, textGrade: string | null): GradeMismatch | null {
  if (!textGrade) return null
  const structuredGradeLetter = structuredGrade !== null ? (STRUCTURED_GRADE_LETTERS[structuredGrade] ?? null) : null
  if (structuredGradeLetter === null) return null
  if (structuredGradeLetter === textGrade) return null
  return { entityClass, structuredGrade, structuredGradeLetter, textGrade }
}
