/**
 * EWO-038 (Task 10) — builds the machine-readable coverage report JSON
 * (data-maintenance/ship-images/ship-image-import-report.json). Pure
 * function: takes the already-computed pipeline results and produces the
 * exact totals/lists the mission's Required Final Report enumerates.
 */
import type { CanonicalHullRow } from './canonicalHulls'
import type { MaintenanceCsvRow } from './types'
import type { BuildMaintenanceCsvResult, BuildRegistryResult } from './pipeline'

export interface CoverageReport {
  generatedAt: string
  workbookRowCount: number
  canonicalSelectableHullCount: number
  matchCounts: {
    exactName: number
    normalizedName: number
    existingAlias: number
    manualReview: number
    ambiguous: number
    unmatched: number
  }
  ambiguousRows: Array<{ rowNumber: number; name: string; candidateIds: string[] }>
  unmatchedRows: Array<{ rowNumber: number; name: string }>
  malformedUrlRows: Array<{ rowNumber: number; name: string }>
  duplicateWorkbookNames: string[]
  duplicateWorkbookUrls: string[]
  orphanCanonicalIdsInExistingCsv: string[]
  generatedRegistryEntryCount: number
  canonicalHullsUsingRegistryImages: number
  canonicalHullsUsingImportedOfficialImages: number
  canonicalHullsUsingUniversalFallback: number
  canonicalHullsRemainingOnFallback: Array<{ canonicalId: string; displayName: string }>
  existingRegistryEntryCount: number
  existingRegistryEntriesRemoved: Array<{ registryKey: string; url: string }>
  existingRegistryEntriesReplaced: Array<{ registryKey: string; oldUrl: string; newUrl: string }>
  existingRegistryEntriesAdded: Array<{ registryKey: string; url: string }>
  existingRegistryEntriesRetained: Array<{ registryKey: string; url: string }>
  duplicateCanonicalPairs: Array<{ lesser: string; winner: string }>
  imageCoveragePercentage: number
  note: string
}

export function buildCoverageReport(params: {
  workbookRowCount: number
  canonicalHulls: CanonicalHullRow[]
  csvResult: BuildMaintenanceCsvResult
  csvRows: MaintenanceCsvRow[]
  registryResult: BuildRegistryResult
  existingRegistry: Readonly<Record<string, string>>
  duplicateCanonicalPairs: ReadonlyMap<string, string>
}): CoverageReport {
  const { workbookRowCount, canonicalHulls, csvResult, csvRows, registryResult, existingRegistry, duplicateCanonicalPairs } = params

  const registryKeysWithImage = new Set(registryResult.entries.map((e) => e.registryKey))
  const hullsUsingRegistry = canonicalHulls.filter((h) => registryKeysWithImage.has(h.registryKey))
  const hullsNotUsingRegistry = canonicalHulls.filter((h) => !registryKeysWithImage.has(h.registryKey))
  const hullsUsingImportedOfficial = hullsNotUsingRegistry.filter((h) => h.hasExistingImportedImage)
  const hullsUsingFallback = hullsNotUsingRegistry.filter((h) => !h.hasExistingImportedImage)

  const totalCovered = hullsUsingRegistry.length + hullsUsingImportedOfficial.length
  const coveragePercentage = canonicalHulls.length === 0 ? 0 : Math.round((totalCovered / canonicalHulls.length) * 1000) / 10

  return {
    generatedAt: new Date().toISOString(),
    workbookRowCount,
    canonicalSelectableHullCount: canonicalHulls.length,
    matchCounts: {
      exactName: csvResult.matchCounts.EXACT_NAME,
      normalizedName: csvResult.matchCounts.NORMALIZED_NAME,
      existingAlias: csvResult.matchCounts.EXISTING_ALIAS,
      manualReview: csvResult.matchCounts.MANUAL_REVIEW,
      ambiguous: csvResult.matchCounts.AMBIGUOUS,
      unmatched: csvResult.matchCounts.UNMATCHED,
    },
    ambiguousRows: csvResult.issues.filter((i) => i.reason === 'AMBIGUOUS').map((i) => ({ rowNumber: i.rowNumber, name: i.name, candidateIds: i.candidateIds ?? [] })),
    unmatchedRows: csvResult.issues.filter((i) => i.reason === 'UNMATCHED').map((i) => ({ rowNumber: i.rowNumber, name: i.name })),
    malformedUrlRows: csvResult.issues.filter((i) => i.reason === 'MALFORMED_URL').map((i) => ({ rowNumber: i.rowNumber, name: i.name })),
    duplicateWorkbookNames: csvResult.duplicateWorkbookNames,
    duplicateWorkbookUrls: csvResult.duplicateWorkbookUrls,
    orphanCanonicalIdsInExistingCsv: csvResult.orphanCanonicalIdsInExistingCsv,
    generatedRegistryEntryCount: registryResult.entries.length,
    canonicalHullsUsingRegistryImages: hullsUsingRegistry.length,
    canonicalHullsUsingImportedOfficialImages: hullsUsingImportedOfficial.length,
    canonicalHullsUsingUniversalFallback: hullsUsingFallback.length,
    canonicalHullsRemainingOnFallback: hullsUsingFallback.map((h) => ({ canonicalId: h.canonicalId, displayName: h.displayName })),
    existingRegistryEntryCount: Object.keys(existingRegistry).length,
    existingRegistryEntriesRemoved: registryResult.diff.removed,
    existingRegistryEntriesReplaced: registryResult.diff.replaced,
    existingRegistryEntriesAdded: registryResult.diff.added,
    existingRegistryEntriesRetained: registryResult.diff.retained,
    duplicateCanonicalPairs: Array.from(duplicateCanonicalPairs.entries()).map(([lesser, winner]) => ({ lesser, winner })),
    imageCoveragePercentage: coveragePercentage,
    note:
      'canonicalHullsRemainingOnFallback lists every canonical hull with no registry or imported/official image today. No "flight ready" field exists anywhere in current repository data, so this list is not filtered by CIG production status (per EWO-038 Task 10\'s own instruction not to infer that automatically).',
  }
}
