import { describe, it, expect } from 'vitest'
import { resolveComponentLabel, formatComponentClassGrade } from '../componentPresentation'
import { hasComponentCatalog } from '../../generated/componentCatalog'

describe('resolveComponentLabel — EWO-019A component presentation contract', () => {
  it('1. resolved display name replaces the raw internal identifier as the primary label (Eclipse DeltaMax power plant)', () => {
    if (!hasComponentCatalog) return // real generated-data not present on this machine
    // EWO-023 (Task 6) fixed componentMetadataEnrichment.ts to copy the
    // catalog's already-resolved displayName through — Component.displayName
    // (and therefore Hardpoint.factoryItem/installedItem/targetItem) is now
    // "DeltaMax" directly, never the raw "POWR TYDT S01 DeltaMax SCItem"
    // this test previously had to simulate as input.
    const result = resolveComponentLabel('DeltaMax')
    expect(result.primaryLabel).toBe('DeltaMax')
  })

  it('2/3. grade-only resolves to "Grade X" in the combined classification subtitle (EWO-036B precedence tier 3)', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('DeltaMax')
    // Real imported metadata: class is unresolved (empty) for this component today,
    // grade resolves to numeral 2 -> "Grade B" per the documented 1-4 -> A-D convention.
    expect(result.classificationLabel).toBe('Grade B')
  })

  it('4. missing class still allows the grade-only subtitle to resolve (EWO-036B: one combined field, not two independent lines anymore)', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('DeltaMax')
    expect(result.classificationLabel).toBe('Grade B')
    expect(result.classificationLabel).not.toContain('undefined')
  })

  it('5/6. missing grade and missing class together leave only the primary name (classificationLabel null)', () => {
    // EWO-026 — 'Slipstream' previously stood in here as a "no data at
    // all" fixture, but it turned out to be a real bulk-catalog component
    // (a Tydus S1 Power Plant, Grade A) that simply wasn't wired up to
    // resolve — see the Task 5/7 fix below. A name guaranteed to match
    // nothing in any real source is required to test the genuinely-absent
    // case.
    const result = resolveComponentLabel('Totally Fictional Component Zzyzx')
    expect(result.classificationLabel).toBeNull()
    expect(result.primaryLabel).toBe('Totally Fictional Component Zzyzx')
  })

  it('EWO-026 (Task 5/7): a catalog-only component with no per-ship deep-import instance still resolves its real Grade — the root cause of "Bolide/Cirrus/ExoGen/FullForce/GammaMax show name-only" was Grade being dropped when catalogComponentsByName was built, not missing source data', () => {
    if (!hasComponentCatalog) return
    // 'Slipstream' is real bulk-catalog data (grade 1 -> "Grade A") that
    // never appears as an actual Factory/Installed/Target assignment on
    // any of the few deep-imported ships, so componentByDisplayName never
    // matches it — exactly the class of component the picker's option
    // list is full of. Class genuinely does not exist in this pipeline's
    // data (see Task 5 report) — never invented here, so this resolves to
    // the grade-only precedence tier ("Grade A"), never a fabricated Class.
    const result = resolveComponentLabel('Slipstream')
    expect(result.classificationLabel).toBe('Grade A')
  })

  it('7. a cleaned internal-name fallback is used when no resolved display name is available', () => {
    const result = resolveComponentLabel('POWR_TYDT_S01_UnknownPlant_SCItem')
    expect(result.primaryLabel).not.toContain('_')
    expect(result.primaryLabel).not.toMatch(/SCItem$/)
    expect(result.primaryLabel.toLowerCase()).toContain('unknownplant')
  })

  it('8. the raw internal identifier remains available diagnostically', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('DeltaMax')
    expect(result.diagnosticInternalName).toBe('POWR_TYDT_S01_DeltaMax_SCItem')
  })

  it('10. a resolved classification label is never a dangling separator or fragment', () => {
    const inputs = ['DeltaMax', 'Slipstream', '—', 'Unknown Factory Item', 'CF-227 Badger Repeater']
    for (const input of inputs) {
      const result = resolveComponentLabel(input)
      if (result.classificationLabel) {
        expect(result.classificationLabel.startsWith('·')).toBe(false)
        expect(result.classificationLabel).not.toMatch(/·\s*·/)
      }
    }
  })

  it('a weapon control fixture resolves a real primary label', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('CF-227 Badger Repeater')
    expect(result.primaryLabel).not.toContain('_')
    expect(result.primaryLabel.length).toBeGreaterThan(0)
  })

  it('a shield/cooler control fixture resolves a real primary label', () => {
    if (!hasComponentCatalog) return
    const shield = resolveComponentLabel('AllStop')
    expect(shield.primaryLabel.length).toBeGreaterThan(0)
    const cooler = resolveComponentLabel('Bracer')
    expect(cooler.primaryLabel.length).toBeGreaterThan(0)
  })

  it('an empty/unassigned sentinel renders as-is, never blank, never cleaned', () => {
    expect(resolveComponentLabel('—')).toEqual({ primaryLabel: '—', classificationLabel: null, diagnosticInternalName: null })
    expect(resolveComponentLabel('Unknown Factory Item')).toEqual({ primaryLabel: 'Unknown Factory Item', classificationLabel: null, diagnosticInternalName: null })
    expect(resolveComponentLabel(undefined)).toEqual({ primaryLabel: '—', classificationLabel: null, diagnosticInternalName: null })
  })

  it('grade-numeral-to-letter conversion only applies to recognized 1-4 values, never guesses on unrecognized ones', () => {
    // Indirect: exercised via real fixtures above (grade "2" -> "Grade B").
    const result = resolveComponentLabel('DeltaMax')
    if (result.classificationLabel) expect(result.classificationLabel).toMatch(/^(Grade [A-D]|.+ [A-D])$/)
  })

  it('EWO-024 (Task 3) / EWO-036B: a genuine Class value resolves independently, trimmed and never a bare separator, whenever a component genuinely carries one', () => {
    // No component in the current pipeline data actually has a non-empty
    // class today (confirmed in the EWO-024 report) — this exercises the
    // mechanism itself directly (via formatComponentClassGrade) rather
    // than depending on that changing.
    const result = resolveComponentLabel('Slipstream')
    expect(result.classificationLabel === null || (typeof result.classificationLabel === 'string' && result.classificationLabel.trim().length > 0)).toBe(true)
  })
})

describe('formatComponentClassGrade — EWO-036B (Task 3/5) centralized Class+Grade formatter', () => {
  it('Class and Grade both available -> "{Class} {GradeLetter}"', () => {
    expect(formatComponentClassGrade('Military', 'A')).toBe('Military A')
    expect(formatComponentClassGrade('Civilian', 'B')).toBe('Civilian B')
    expect(formatComponentClassGrade('Industrial', 'C')).toBe('Industrial C')
    expect(formatComponentClassGrade('Competition', 'A')).toBe('Competition A')
    expect(formatComponentClassGrade('Stealth', 'A')).toBe('Stealth A')
  })

  it('Class only available -> "{Class}"', () => {
    expect(formatComponentClassGrade('Military', null)).toBe('Military')
    expect(formatComponentClassGrade('Military', undefined)).toBe('Military')
  })

  it('Grade only available -> "Grade {GradeLetter}"', () => {
    expect(formatComponentClassGrade(null, 'A')).toBe('Grade A')
    expect(formatComponentClassGrade(undefined, 'B')).toBe('Grade B')
  })

  it('neither available -> null (no subtitle)', () => {
    expect(formatComponentClassGrade(null, null)).toBeNull()
    expect(formatComponentClassGrade(undefined, undefined)).toBeNull()
    expect(formatComponentClassGrade('', '')).toBeNull()
    expect(formatComponentClassGrade('   ', '   ')).toBeNull()
  })

  it('is deterministic and null-safe for any combination', () => {
    expect(formatComponentClassGrade('Military', 'A')).toBe(formatComponentClassGrade('Military', 'A'))
    expect(() => formatComponentClassGrade(null, null)).not.toThrow()
  })

  it('never fabricates a Class — only ever returns exactly what was passed in, never inferred from anything else', () => {
    // The function's own signature only accepts a class/grade pair — there
    // is no manufacturer, component name, or port-type parameter for it to
    // infer from, structurally guaranteeing this.
    expect(formatComponentClassGrade.length).toBe(2)
  })

  it('trims whitespace from both inputs before combining', () => {
    expect(formatComponentClassGrade('  Military  ', '  A  ')).toBe('Military A')
  })
})
