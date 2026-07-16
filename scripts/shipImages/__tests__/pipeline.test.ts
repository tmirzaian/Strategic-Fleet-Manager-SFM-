import { describe, it, expect } from 'vitest'
import { buildMaintenanceCsvRows, buildRegistryEntries } from '../pipeline'
import type { CanonicalHullRow } from '../canonicalHulls'
import type { MaintenanceCsvRow } from '../types'

function hull(overrides: Partial<CanonicalHullRow> & Pick<CanonicalHullRow, 'canonicalId' | 'displayName'>): CanonicalHullRow {
  return {
    manufacturer: 'Test Manufacturer',
    sourceType: 'seed',
    bareDisplayName: overrides.displayName,
    registryKey: overrides.canonicalId,
    hasExistingImportedImage: false,
    ...overrides,
  }
}

const VALID_URL = 'https://robertsspaceindustries.com/i/abc/source.webp'
const VALID_URL_2 = 'https://robertsspaceindustries.com/i/def/source.webp'

describe('buildMaintenanceCsvRows — EWO-038 (Task 3/4/11)', () => {
  it('produces exactly one row per canonical hull', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'F7C-S Hornet Ghost Mk II' }), hull({ canonicalId: 'mole', displayName: 'MOLE' })]
    const result = buildMaintenanceCsvRows([], hulls, [], new Map())
    expect(result.rows).toHaveLength(2)
  })

  it('a matched workbook row populates rsi_image_url, coverage_status REGISTRY, and the real match method', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'F7C-S Hornet Ghost Mk II' })]
    const result = buildMaintenanceCsvRows([{ rowNumber: 1, name: 'F7C-S Hornet Ghost Mk II', url: VALID_URL }], hulls, [], new Map())
    expect(result.rows[0]).toMatchObject({ canonical_id: 'ghost', rsi_image_url: VALID_URL, coverage_status: 'REGISTRY', match_method: 'EXACT_NAME' })
  })

  it('an unmatched canonical hull (no workbook row, no existing CSV value) remains a blank FALLBACK row', () => {
    const hulls = [hull({ canonicalId: 'mole', displayName: 'MOLE' })]
    const result = buildMaintenanceCsvRows([], hulls, [], new Map())
    expect(result.rows[0]).toMatchObject({ rsi_image_url: '', coverage_status: 'FALLBACK', match_method: 'UNMATCHED' })
  })

  it('an ambiguous workbook row is never written into any canonical row\'s URL', () => {
    const hulls = [hull({ canonicalId: 'a', displayName: 'Same Name' }), hull({ canonicalId: 'b', displayName: 'Same Name' })]
    const result = buildMaintenanceCsvRows([{ rowNumber: 1, name: 'Same Name', url: VALID_URL }], hulls, [], new Map())
    expect(result.rows.every((r) => r.rsi_image_url === '')).toBe(true)
    expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'AMBIGUOUS', candidateIds: ['a', 'b'] }))
  })

  it('re-running the import preserves an already-entered CSV URL untouched, even if the workbook has no row for it', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'F7C-S Hornet Ghost Mk II' })]
    const existing = new Map([['ghost', VALID_URL]])
    const result = buildMaintenanceCsvRows([], hulls, [], existing)
    expect(result.rows[0]).toMatchObject({ rsi_image_url: VALID_URL, coverage_status: 'REGISTRY', match_method: 'MANUAL_REVIEW' })
  })

  it('a blank existing CSV entry is seeded from a fresh workbook match', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'F7C-S Hornet Ghost Mk II' })]
    const existing = new Map([['ghost', '']])
    const result = buildMaintenanceCsvRows([{ rowNumber: 1, name: 'F7C-S Hornet Ghost Mk II', url: VALID_URL }], hulls, [], existing)
    expect(result.rows[0].rsi_image_url).toBe(VALID_URL)
  })

  it('a malformed workbook URL is reported and never written', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'F7C-S Hornet Ghost Mk II' })]
    const result = buildMaintenanceCsvRows([{ rowNumber: 1, name: 'F7C-S Hornet Ghost Mk II', url: 'not-a-url' }], hulls, [], new Map())
    expect(result.rows[0].rsi_image_url).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'MALFORMED_URL' }))
  })

  it('duplicate workbook ship names are reported for every occurrence', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'Ghost' })]
    const result = buildMaintenanceCsvRows(
      [
        { rowNumber: 1, name: 'Ghost', url: VALID_URL },
        { rowNumber: 2, name: 'Ghost', url: VALID_URL_2 },
      ],
      hulls,
      [],
      new Map()
    )
    expect(result.duplicateWorkbookNames).toEqual(['Ghost'])
    expect(result.issues.filter((i) => i.reason === 'DUPLICATE_NAME')).toHaveLength(2)
  })

  it('duplicate workbook URLs (two different ships sharing one image URL) are reported', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'Ghost' }), hull({ canonicalId: 'mole', displayName: 'MOLE' })]
    const result = buildMaintenanceCsvRows(
      [
        { rowNumber: 1, name: 'Ghost', url: VALID_URL },
        { rowNumber: 2, name: 'MOLE', url: VALID_URL },
      ],
      hulls,
      [],
      new Map()
    )
    expect(result.duplicateWorkbookUrls).toEqual([VALID_URL])
  })

  it('EWO-038 (Task 5): the Prospector duplicate-canonical sibling never gets its own URL — it inherits REGISTRY coverage only through the winner', () => {
    const hulls = [hull({ canonicalId: 'prospector', displayName: 'Prospector' }), hull({ canonicalId: 'MISC_Prospector', displayName: 'MISC Prospector', registryKey: 'prospector' })]
    const result = buildMaintenanceCsvRows([{ rowNumber: 1, name: 'Prospector', url: VALID_URL }], hulls, [], new Map())
    const winnerRow = result.rows.find((r) => r.canonical_id === 'prospector')!
    const siblingRow = result.rows.find((r) => r.canonical_id === 'MISC_Prospector')!
    expect(winnerRow.rsi_image_url).toBe(VALID_URL)
    expect(siblingRow.rsi_image_url).toBe('')
    expect(siblingRow.match_method).toBe('EXISTING_ALIAS')
    expect(siblingRow.coverage_status).toBe('REGISTRY') // via the winner, per the note
  })

  it('EWO-038 (Task 5): the Starlite duplicate-canonical sibling behaves identically', () => {
    const hulls = [hull({ canonicalId: 'starlite', displayName: 'Starlite' }), hull({ canonicalId: 'MISC_Starlite', displayName: 'MISC Starlite', registryKey: 'starlite' })]
    const result = buildMaintenanceCsvRows([{ rowNumber: 1, name: 'Starlite', url: VALID_URL }], hulls, [], new Map())
    const siblingRow = result.rows.find((r) => r.canonical_id === 'MISC_Starlite')!
    expect(siblingRow.rsi_image_url).toBe('')
    expect(siblingRow.coverage_status).toBe('REGISTRY')
  })

  it('reports an orphan canonical id present in an existing CSV but no longer a real canonical hull', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'Ghost' })]
    const existing = new Map([
      ['ghost', VALID_URL],
      ['retired-ship-id', VALID_URL_2],
    ])
    const result = buildMaintenanceCsvRows([], hulls, [], existing)
    expect(result.orphanCanonicalIdsInExistingCsv).toEqual(['retired-ship-id'])
  })
})

describe('buildRegistryEntries — EWO-038 (Task 8/9/11)', () => {
  function csvRow(overrides: Partial<MaintenanceCsvRow> & Pick<MaintenanceCsvRow, 'canonical_id'>): MaintenanceCsvRow {
    return {
      manufacturer: 'Test',
      ship_name: overrides.canonical_id,
      canonical_id: overrides.canonical_id,
      source_entity_class: overrides.canonical_id,
      rsi_image_url: '',
      coverage_status: 'FALLBACK',
      match_method: 'UNMATCHED',
      notes: '',
      ...overrides,
    }
  }

  it('generates one entry per populated, valid CSV row', () => {
    const rows = [csvRow({ canonical_id: 'ghost', rsi_image_url: VALID_URL, coverage_status: 'REGISTRY' })]
    const result = buildRegistryEntries(rows, {})
    expect(result.entries).toEqual([{ registryKey: 'ghost', url: VALID_URL }])
  })

  it('never emits a blank entry for a FALLBACK row', () => {
    const rows = [csvRow({ canonical_id: 'mole', rsi_image_url: '', coverage_status: 'FALLBACK' })]
    const result = buildRegistryEntries(rows, {})
    expect(result.entries).toHaveLength(0)
  })

  it('skips a REVIEW_REQUIRED row, even if it has a URL, and reports it', () => {
    const rows = [csvRow({ canonical_id: 'ghost', rsi_image_url: VALID_URL, coverage_status: 'REVIEW_REQUIRED' })]
    const result = buildRegistryEntries(rows, {})
    expect(result.entries).toHaveLength(0)
    expect(result.skippedReviewRequired).toEqual(['ghost'])
  })

  it('reports retained/replaced/removed/added against the current registry (Task 9 diff)', () => {
    const rows = [
      csvRow({ canonical_id: 'ghost', source_entity_class: 'ghost', rsi_image_url: VALID_URL, coverage_status: 'REGISTRY' }), // unchanged
      csvRow({ canonical_id: 'mole', source_entity_class: 'mole', rsi_image_url: VALID_URL_2, coverage_status: 'REGISTRY' }), // replaced
      csvRow({ canonical_id: 'railen', source_entity_class: 'railen', rsi_image_url: VALID_URL, coverage_status: 'REGISTRY' }), // added
    ]
    const current = { ghost: VALID_URL, mole: 'https://robertsspaceindustries.com/i/old/source.webp', vulture: VALID_URL }
    const result = buildRegistryEntries(rows, current)
    expect(result.diff.retained).toEqual([{ registryKey: 'ghost', url: VALID_URL }])
    expect(result.diff.replaced).toEqual([{ registryKey: 'mole', oldUrl: 'https://robertsspaceindustries.com/i/old/source.webp', newUrl: VALID_URL_2 }])
    expect(result.diff.added).toEqual([{ registryKey: 'railen', url: VALID_URL }])
    expect(result.diff.removed).toEqual([{ registryKey: 'vulture', url: VALID_URL }])
  })

  it('a duplicate registry key across two different CSV rows is detected and reported', () => {
    const rows = [
      csvRow({ canonical_id: 'a', source_entity_class: 'shared-key', rsi_image_url: VALID_URL, coverage_status: 'REGISTRY' }),
      csvRow({ canonical_id: 'b', source_entity_class: 'shared-key', rsi_image_url: VALID_URL_2, coverage_status: 'REGISTRY' }),
    ]
    const result = buildRegistryEntries(rows, {})
    expect(result.duplicateRegistryKeys).toEqual(['shared-key'])
  })
})
