import { describe, it, expect } from 'vitest'
import { buildClassificationDiagnostics, formatClassificationDiagnosticsSummary } from '../classificationDiagnostics'
import type { ComponentFieldMaps } from '../bulkComponentCollector'
import type { CatalogRecord } from '../catalogSchema'

function fields(overrides: Partial<ComponentFieldMaps> = {}): ComponentFieldMaps {
  return {
    type: new Map(),
    subType: new Map(),
    size: new Map(),
    grade: new Map(),
    manufacturerCode: new Map(),
    manufacturerLocKey: new Map(),
    localizationName: new Map(),
    localizationDescriptionKey: new Map(),
    ...overrides,
  }
}

function record(overrides: Partial<CatalogRecord> = {}): CatalogRecord {
  return {
    entityClass: 'TEST_Entity',
    recordName: 'EntityClassDefinition.TEST_Entity',
    category: 'Cooler',
    subtype: null,
    size: 1,
    grade: 1,
    manufacturerRef: null,
    localizationKey: null,
    displayName: 'Test Item',
    classification: null,
    provenance: { source: 'starbreaker-datacore', recordPath: null },
    ...overrides,
  }
}

describe('CAT-001 (Objective 5): buildClassificationDiagnostics', () => {
  it('counts a real classified record', () => {
    const localizationTable = new Map([['item_DescTest', 'Item Type: Cooler\\nGrade: A\\nClass: Stealth\\n\\nFlavor text.']])
    const f = fields({ localizationDescriptionKey: new Map([['TEST_Entity', '@item_DescTest']]) })
    const records = new Map([['TEST_Entity', record({ classification: 'Stealth', grade: 1 })]])
    const d = buildClassificationDiagnostics(f, localizationTable, records)
    expect(d.classifiedCount).toBe(1)
    expect(d.missingClassificationCount).toBe(0)
  })

  it('flags a Core-family record with a real header but no Class line as missing', () => {
    const localizationTable = new Map([['item_DescTest', 'Item Type: Cooler\\nSize: 4\\n\\nCapital-class cooler.']])
    const f = fields({ localizationDescriptionKey: new Map([['TEST_Entity', '@item_DescTest']]) })
    const records = new Map([['TEST_Entity', record({ category: 'Cooler', classification: null })]])
    const d = buildClassificationDiagnostics(f, localizationTable, records)
    expect(d.missingClassificationCount).toBe(1)
    expect(d.missingClassificationSample).toContain('TEST_Entity')
  })

  it('never flags a non-Core-family record as missing — a Weapon or Door never carrying a Class is not a gap', () => {
    const localizationTable = new Map([['item_DescTest', 'Item Type: Weapon\\nSize: 2\\n\\nSome weapon.']])
    const f = fields({ localizationDescriptionKey: new Map([['TEST_Entity', '@item_DescTest']]) })
    const records = new Map([['TEST_Entity', record({ category: 'WeaponGun', classification: null })]])
    const d = buildClassificationDiagnostics(f, localizationTable, records)
    expect(d.missingClassificationCount).toBe(0)
  })

  it('a record with no description at all is neither classified, missing, nor a parsing failure', () => {
    const f = fields()
    const records = new Map([['TEST_Entity', record({ classification: null })]])
    const d = buildClassificationDiagnostics(f, new Map(), records)
    expect(d.classifiedCount).toBe(0)
    expect(d.missingClassificationCount).toBe(0)
    expect(d.localizationParsingFailures).toHaveLength(0)
  })

  it('a real, non-empty description with zero parseable header lines is reported as a localization parsing failure', () => {
    const localizationTable = new Map([['item_DescTest', 'Just some plain-prose description with no header at all.']])
    const f = fields({ localizationDescriptionKey: new Map([['TEST_Entity', '@item_DescTest']]) })
    const records = new Map([['TEST_Entity', record({ classification: null })]])
    const d = buildClassificationDiagnostics(f, localizationTable, records)
    expect(d.localizationParsingFailures).toEqual(['TEST_Entity'])
  })

  it('a Core-family classification value outside the known five is reported as unrecognized/newly observed, never dropped', () => {
    const localizationTable = new Map([['item_DescTest', 'Item Type: Cooler\\nGrade: A\\nClass: Gadget\\n\\nSome cooler.']])
    const f = fields({ localizationDescriptionKey: new Map([['TEST_Entity', '@item_DescTest']]) })
    const records = new Map([['TEST_Entity', record({ category: 'Cooler', classification: 'Gadget' })]])
    const d = buildClassificationDiagnostics(f, localizationTable, records)
    expect(d.classifiedCount).toBe(1)
    expect(d.unrecognizedClassificationValues).toEqual({ Gadget: 1 })
    expect(d.newlyObservedClassificationValues).toEqual(['Gadget'])
  })

  it('CAT-002: a Weapon/Missile classification value is never checked against the fixed Core vocabulary — Weapon Type/Seeker Type are intentionally open-vocabulary', () => {
    const localizationTable = new Map([['item_DescTest', 'Manufacturer: Behring\\nItem Type: Ballistic Cannon\\nSize: 4\\n\\nSome cannon.']])
    const f = fields({ localizationDescriptionKey: new Map([['TEST_Entity', '@item_DescTest']]) })
    const records = new Map([['TEST_Entity', record({ category: 'WeaponGun', classification: 'Ballistic Cannon', grade: null })]])
    const d = buildClassificationDiagnostics(f, localizationTable, records)
    expect(d.classifiedCount).toBe(1)
    expect(d.unrecognizedClassificationValues).toEqual({})
  })

  it('a grade mismatch is reported without altering the record — structured Grade stays authoritative', () => {
    const localizationTable = new Map([['item_DescTest', 'Item Type: Shield Generator\\nGrade: Bespoke\\nClass: Industrial\\n\\nBespoke shield.']])
    const f = fields({ localizationDescriptionKey: new Map([['TEST_Entity', '@item_DescTest']]) })
    const records = new Map([['TEST_Entity', record({ category: 'Shield', grade: 1, classification: 'Industrial' })]])
    const d = buildClassificationDiagnostics(f, localizationTable, records)
    expect(d.gradeMismatches).toEqual([{ entityClass: 'TEST_Entity', structuredGrade: 1, structuredGradeLetter: 'A', textGrade: 'Bespoke' }])
    expect(records.get('TEST_Entity')!.grade).toBe(1)
  })
})

describe('CAT-001: formatClassificationDiagnosticsSummary', () => {
  it('produces a readable, deterministic console summary from a diagnostics object', () => {
    const summary = formatClassificationDiagnosticsSummary({
      classifiedCount: 336,
      missingClassificationCount: 8,
      missingClassificationSample: [],
      unrecognizedClassificationValues: { Gadget: 1 },
      newlyObservedClassificationValues: ['Gadget'],
      localizationParsingFailures: ['A', 'B'],
      gradeMismatches: [],
    })
    expect(summary).toContain('classified: 336')
    expect(summary).toContain('missing (core families, description present, no Class line): 8')
    expect(summary).toContain('"Gadget":1')
    expect(summary).toContain('localization parsing failures: 2')
    expect(summary).toContain('grade mismatches (structured Grade preserved as authoritative): 0')
  })
})
