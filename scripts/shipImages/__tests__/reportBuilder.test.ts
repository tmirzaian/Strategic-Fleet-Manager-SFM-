import { describe, it, expect } from 'vitest'
import { buildCoverageReport } from '../reportBuilder'
import type { CanonicalHullRow } from '../canonicalHulls'

function hull(overrides: Partial<CanonicalHullRow> & Pick<CanonicalHullRow, 'canonicalId' | 'displayName'>): CanonicalHullRow {
  return {
    manufacturer: 'Test',
    sourceType: 'seed',
    bareDisplayName: overrides.displayName,
    registryKey: overrides.canonicalId,
    hasExistingImportedImage: false,
    ...overrides,
  }
}

describe('buildCoverageReport — EWO-038 (Task 10/11)', () => {
  it('computes coverage percentage from registry + imported/official hulls over all canonical hulls', () => {
    const canonicalHulls = [
      hull({ canonicalId: 'a', displayName: 'A' }), // registry
      hull({ canonicalId: 'b', displayName: 'B', hasExistingImportedImage: true }), // imported/official
      hull({ canonicalId: 'c', displayName: 'C' }), // fallback
      hull({ canonicalId: 'd', displayName: 'D' }), // fallback
    ]
    const report = buildCoverageReport({
      workbookRowCount: 1,
      canonicalHulls,
      csvResult: {
        rows: [],
        issues: [],
        matchCounts: { EXACT_NAME: 1, NORMALIZED_NAME: 0, EXISTING_ALIAS: 0, MANUAL_REVIEW: 0, AMBIGUOUS: 0, UNMATCHED: 0 },
        duplicateWorkbookNames: [],
        duplicateWorkbookUrls: [],
        orphanCanonicalIdsInExistingCsv: [],
      },
      csvRows: [],
      registryResult: {
        entries: [{ registryKey: 'a', url: 'https://robertsspaceindustries.com/i/1/source.webp' }],
        diff: { retained: [], replaced: [], removed: [], added: [{ registryKey: 'a', url: 'https://robertsspaceindustries.com/i/1/source.webp' }] },
        skippedReviewRequired: [],
        duplicateRegistryKeys: [],
      },
      existingRegistry: {},
      duplicateCanonicalPairs: new Map(),
    })
    expect(report.canonicalSelectableHullCount).toBe(4)
    expect(report.canonicalHullsUsingRegistryImages).toBe(1)
    expect(report.canonicalHullsUsingImportedOfficialImages).toBe(1)
    expect(report.canonicalHullsUsingUniversalFallback).toBe(2)
    expect(report.canonicalHullsRemainingOnFallback.map((h) => h.canonicalId)).toEqual(['c', 'd'])
    // 2 of 4 hulls covered (registry + imported/official) = 50%
    expect(report.imageCoveragePercentage).toBe(50)
  })

  it('lists ambiguous and unmatched rows by name', () => {
    const report = buildCoverageReport({
      workbookRowCount: 2,
      canonicalHulls: [],
      csvResult: {
        rows: [],
        issues: [
          { rowNumber: 5, name: 'Same Name', reason: 'AMBIGUOUS', candidateIds: ['a', 'b'] },
          { rowNumber: 9, name: 'Unknown Ship', reason: 'UNMATCHED' },
        ],
        matchCounts: { EXACT_NAME: 0, NORMALIZED_NAME: 0, EXISTING_ALIAS: 0, MANUAL_REVIEW: 0, AMBIGUOUS: 1, UNMATCHED: 1 },
        duplicateWorkbookNames: [],
        duplicateWorkbookUrls: [],
        orphanCanonicalIdsInExistingCsv: [],
      },
      csvRows: [],
      registryResult: { entries: [], diff: { retained: [], replaced: [], removed: [], added: [] }, skippedReviewRequired: [], duplicateRegistryKeys: [] },
      existingRegistry: {},
      duplicateCanonicalPairs: new Map([['MISC_Prospector', 'prospector']]),
    })
    expect(report.ambiguousRows).toEqual([{ rowNumber: 5, name: 'Same Name', candidateIds: ['a', 'b'] }])
    expect(report.unmatchedRows).toEqual([{ rowNumber: 9, name: 'Unknown Ship' }])
    expect(report.duplicateCanonicalPairs).toEqual([{ lesser: 'MISC_Prospector', winner: 'prospector' }])
  })
})
