import { describe, it, expect } from 'vitest'
import {
  parseDescriptionHeader,
  extractClassificationAndGrade,
  extractOperationalIdentityValue,
  detectGradeMismatch,
  KNOWN_CLASSIFICATION_VOCABULARY,
  DESCRIPTION_HEADER_LABELS,
} from '../descriptionClassification'

// Real, live-fetched examples (CAT-002 investigation, LIVE Data.p4k 4.9.187.14500).
const REAL_WEAPON_DESCRIPTION = 'Manufacturer: Behring\\nItem Type: Ballistic Cannon\\nSize: 4\\n\\nHurtling high caliber rounds...'
const REAL_MISSILE_DESCRIPTION = 'Manufacturer: Thermyte Concern\\nTracking Signal: Electromagnetic\\nSize: 1\\n\\nVenturing into the weapons market...'
const REAL_TORPEDO_DESCRIPTION = 'Manufacturer: Behring\\nTracking Signal: Infrared\\nSize: 10\\n\\nBring Behring\'s expert engineering to bear...'

// Real, live-fetched examples (CAT-001 investigation, LIVE Data.p4k
// 4.9.187.14500) — the literal two-character "\n" sequence is exactly how
// this field resolves from DataCore, never a real newline byte.
const REAL_MIRAGE_DESCRIPTION =
  'Item Type: Shield Generator\\nManufacturer: Ascension Astro\\nSize: 1\\nGrade: A\\nClass: Stealth\\n\\nBy boasting a signature so faint most won’t believe it’s there...'
const REAL_BESPOKE_DESCRIPTION = 'Item Type: Shield Generator\\nManufacturer: Aegis Dynamics\\nSize: 4\\nGrade: Bespoke\\nClass: Industrial\\n\\nDesigned to defend against debris...'
const REAL_NO_HEADER_DESCRIPTION = 'Anvil Decoy Launcher'
const REAL_CAPITAL_NO_CLASS_DESCRIPTION = 'Item Type: Cooler\\nManufacturer: Aegis Dynamics\\nSize: 4\\n\\nThis capital-class cooler was designed specifically for the Idris frigate.'

describe('CAT-001: parseDescriptionHeader — structural header-block parse', () => {
  it('parses a real resolved description into its Label: Value header map, stopping at the first blank line', () => {
    const header = parseDescriptionHeader(REAL_MIRAGE_DESCRIPTION)
    expect(header.get('Item Type')).toBe('Shield Generator')
    expect(header.get('Manufacturer')).toBe('Ascension Astro')
    expect(header.get('Size')).toBe('1')
    expect(header.get('Grade')).toBe('A')
    expect(header.get('Class')).toBe('Stealth')
    // The flavor prose after the blank line is never captured as a field.
    expect(header.size).toBe(5)
  })

  it('never mistakes label-like text inside the flavor prose for a header line', () => {
    const withColonInProse = 'Item Type: Cooler\\nGrade: A\\n\\nNote: this cooler runs cold.'
    const header = parseDescriptionHeader(withColonInProse)
    expect(header.size).toBe(2)
    expect(header.has('Note')).toBe(false)
  })

  it('a description with no header structure at all (older, plain-prose items) parses to an empty map, never throws', () => {
    expect(parseDescriptionHeader(REAL_NO_HEADER_DESCRIPTION).size).toBe(0)
  })

  it('a real capital-ship description with no Grade/Class line parses only what is genuinely present', () => {
    const header = parseDescriptionHeader(REAL_CAPITAL_NO_CLASS_DESCRIPTION)
    expect(header.get('Item Type')).toBe('Cooler')
    expect(header.get('Size')).toBe('4')
    expect(header.has('Grade')).toBe(false)
    expect(header.has('Class')).toBe(false)
  })

  it('null/undefined/empty input never throws', () => {
    expect(parseDescriptionHeader(null).size).toBe(0)
    expect(parseDescriptionHeader(undefined).size).toBe(0)
    expect(parseDescriptionHeader('').size).toBe(0)
  })
})

describe('CAT-001: extractClassificationAndGrade — Objective 4 locale-driven label lookup', () => {
  it('reads Classification and Grade out of a real header using the en label set', () => {
    const header = parseDescriptionHeader(REAL_MIRAGE_DESCRIPTION)
    const result = extractClassificationAndGrade(header)
    expect(result.classification).toBe('Stealth')
    expect(result.gradeText).toBe('A')
  })

  it('a header with no Class line resolves classification to null, never fabricated', () => {
    const header = parseDescriptionHeader(REAL_CAPITAL_NO_CLASS_DESCRIPTION)
    const result = extractClassificationAndGrade(header)
    expect(result.classification).toBeNull()
    expect(result.gradeText).toBeNull()
  })

  it('an unconfigured locale falls back to the en label set rather than throwing or returning nothing', () => {
    const header = parseDescriptionHeader(REAL_MIRAGE_DESCRIPTION)
    expect(extractClassificationAndGrade(header, 'de').classification).toBe('Stealth')
  })

  it('the label table is structured per-locale, not a single hardcoded string match — a new locale needs only a new entry', () => {
    expect(DESCRIPTION_HEADER_LABELS.en).toEqual({ classification: 'Class', grade: 'Grade' })
  })
})

describe('CAT-001: KNOWN_CLASSIFICATION_VOCABULARY — diagnostics-only, never used to reject a real value', () => {
  it('contains exactly the five values CAT-001 names', () => {
    expect([...KNOWN_CLASSIFICATION_VOCABULARY].sort()).toEqual(['Civilian', 'Competition', 'Industrial', 'Military', 'Stealth'])
  })

  it('extractClassificationAndGrade still returns a real value outside this set — "do not assume these are exhaustive"', () => {
    const header = parseDescriptionHeader('Item Type: Gadget\\nGrade: A\\nClass: Gadget\\n\\nSome gadget.')
    expect(extractClassificationAndGrade(header).classification).toBe('Gadget')
  })
})

describe('CAT-001 (Objective 3): detectGradeMismatch — structured Grade always stays authoritative', () => {
  it('no mismatch when the text grade and structured grade agree', () => {
    expect(detectGradeMismatch('SHLD_ASAS_S01_Mirage_SCItem', 1, 'A')).toBeNull()
  })

  it('a real confirmed disagreement (structured Grade 1/"A" vs. text "Bespoke") is reported, never silently resolved', () => {
    const mismatch = detectGradeMismatch('SHLD_AEGS_S04_Reclaimer_SCItem', 1, 'Bespoke')
    expect(mismatch).toEqual({ entityClass: 'SHLD_AEGS_S04_Reclaimer_SCItem', structuredGrade: 1, structuredGradeLetter: 'A', textGrade: 'Bespoke' })
  })

  it('no text grade to compare -> null, never a false mismatch', () => {
    expect(detectGradeMismatch('X', 1, null)).toBeNull()
  })

  it('no structured grade to compare against -> null (nothing authoritative to defend)', () => {
    expect(detectGradeMismatch('X', null, 'A')).toBeNull()
  })

  it('an out-of-range structured grade number -> null rather than a bogus letter comparison', () => {
    expect(detectGradeMismatch('X', 9, 'A')).toBeNull()
  })

  it('demonstrates the real Bespoke-description scenario never overwrites the structured field — this function only reports, it has no mutation capability at all', () => {
    const mismatch = detectGradeMismatch('Y', 1, 'Bespoke')
    // The only authoritative value ever exposed to a caller is the one
    // already passed in — this function has no return path that could be
    // mistaken for a corrected/overridden grade.
    expect(mismatch!.structuredGrade).toBe(1)
    expect(mismatch).not.toHaveProperty('correctedGrade')
  })
})

describe('CAT-002: extractOperationalIdentityValue — family-aware label lookup, reusing CAT-001\'s header parser', () => {
  it('WeaponGun reads the "Item Type" line (real value is the specific weapon type, not a generic category word)', () => {
    const header = parseDescriptionHeader(REAL_WEAPON_DESCRIPTION)
    expect(extractOperationalIdentityValue(header, 'WeaponGun')).toBe('Ballistic Cannon')
  })

  it('Missile reads the "Tracking Signal" line, for both ordinary missiles and Torpedoes', () => {
    expect(extractOperationalIdentityValue(parseDescriptionHeader(REAL_MISSILE_DESCRIPTION), 'Missile')).toBe('Electromagnetic')
    expect(extractOperationalIdentityValue(parseDescriptionHeader(REAL_TORPEDO_DESCRIPTION), 'Missile')).toBe('Infrared')
  })

  it('Core categories still read "Class", unaffected by CAT-002', () => {
    const header = parseDescriptionHeader('Item Type: Shield Generator\\nGrade: A\\nClass: Stealth\\n\\nFlavor text.')
    expect(extractOperationalIdentityValue(header, 'Shield')).toBe('Stealth')
  })

  it('a category with no configured family (Missile Rack, Utility, Door, ...) resolves to null — CAT-002 does not touch those grammars', () => {
    const header = parseDescriptionHeader(REAL_WEAPON_DESCRIPTION)
    expect(extractOperationalIdentityValue(header, 'MissileLauncher')).toBeNull()
    expect(extractOperationalIdentityValue(header, 'TractorBeam')).toBeNull()
    expect(extractOperationalIdentityValue(header, null)).toBeNull()
    expect(extractOperationalIdentityValue(header, undefined)).toBeNull()
  })

  it('a Weapon whose header has no "Item Type" line (no Class line either) resolves honestly to null, never fabricated', () => {
    const header = parseDescriptionHeader('Manufacturer: Behring\\nSize: 2\\n\\nSome weapon with a minimal header.')
    expect(extractOperationalIdentityValue(header, 'WeaponGun')).toBeNull()
  })

  it('never confuses a Weapon\'s "Item Type" value for a Core "Class" value or vice versa — reading the wrong label for a category returns nothing, not a wrong answer', () => {
    const weaponHeader = parseDescriptionHeader(REAL_WEAPON_DESCRIPTION)
    // This header has no "Class" line at all, so asking for Core's label finds nothing.
    expect(extractOperationalIdentityValue(weaponHeader, 'Cooler')).toBeNull()
  })
})
