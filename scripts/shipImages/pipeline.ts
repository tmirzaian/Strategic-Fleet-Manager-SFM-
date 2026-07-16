/**
 * EWO-038 (Task 3/4/8/9) — the pure, file-system-free core of the import
 * pipeline: build the canonical maintenance CSV rows from workbook +
 * canonical-hull data (preserving any already-entered CSV values), and
 * build the final runtime registry entries + diff from a maintenance CSV.
 * Kept separate from cli.ts so every rule here is unit-testable without
 * touching a real file or the real 258-hull dataset.
 */
import type { CanonicalHullRow } from './canonicalHulls'
import { matchShipName, type MatchOutcome } from './matcher'
import { validateImageUrl } from './urlValidation'
import { DUPLICATE_CANONICAL_PAIRS } from './duplicateCanonicalPairs'
import type { WorkbookRow, MaintenanceCsvRow, CoverageStatus, MaintenanceMatchMethod } from './types'

export interface WorkbookRowIssue {
  rowNumber: number
  name: string
  reason: 'AMBIGUOUS' | 'UNMATCHED' | 'MALFORMED_URL' | 'DUPLICATE_NAME' | 'DUPLICATE_URL'
  candidateIds?: string[]
}

export interface BuildMaintenanceCsvResult {
  rows: MaintenanceCsvRow[]
  issues: WorkbookRowIssue[]
  matchCounts: Record<MatchOutcome, number>
  duplicateWorkbookNames: string[]
  duplicateWorkbookUrls: string[]
  orphanCanonicalIdsInExistingCsv: string[]
}

function detectDuplicates(values: string[]): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const v of values) {
    if (!v) continue
    if (seen.has(v)) dupes.add(v)
    seen.add(v)
  }
  return dupes
}

/**
 * Builds one maintenance CSV row per canonical hull (Task 3). Workbook rows
 * are matched via `matchShipName`; a hull with an existing CSV value (a
 * prior import, or a Commander's own direct CSV edit) keeps it untouched
 * unless it is currently blank, in which case a fresh workbook match seeds
 * it — re-running the xlsx import can never silently discard a
 * Commander-entered URL (Task 12).
 */
export function buildMaintenanceCsvRows(
  workbookRows: WorkbookRow[],
  canonicalHulls: CanonicalHullRow[],
  aliasLookupRows: CanonicalHullRow[],
  existingUrlByCanonicalId: ReadonlyMap<string, string>
): BuildMaintenanceCsvResult {
  const issues: WorkbookRowIssue[] = []
  const matchCounts: Record<MatchOutcome, number> = {
    EXACT_NAME: 0,
    NORMALIZED_NAME: 0,
    EXISTING_ALIAS: 0,
    MANUAL_REVIEW: 0,
    AMBIGUOUS: 0,
    UNMATCHED: 0,
  }

  const duplicateNames = detectDuplicates(workbookRows.map((r) => r.name.trim()))
  const duplicateUrls = detectDuplicates(workbookRows.map((r) => r.url.trim()))
  for (const row of workbookRows) {
    if (duplicateNames.has(row.name.trim())) issues.push({ rowNumber: row.rowNumber, name: row.name, reason: 'DUPLICATE_NAME' })
    if (duplicateUrls.has(row.url.trim())) issues.push({ rowNumber: row.rowNumber, name: row.name, reason: 'DUPLICATE_URL' })
  }

  // canonicalId -> the single workbook row resolved to it (a real
  // duplicate-name workbook error could otherwise silently pick one).
  const resolvedUrlByCanonicalId = new Map<string, { row: WorkbookRow; method: MaintenanceMatchMethod }>()

  for (const row of workbookRows) {
    const trimmedName = row.name.trim()
    if (trimmedName === '') continue // a blank name cell is reported as MALFORMED via the caller's row validation, not matched
    const result = matchShipName(trimmedName, canonicalHulls, aliasLookupRows)
    matchCounts[result.outcome]++

    if (result.outcome === 'AMBIGUOUS') {
      issues.push({ rowNumber: row.rowNumber, name: row.name, reason: 'AMBIGUOUS', candidateIds: result.candidateIds })
      continue
    }
    if (result.outcome === 'UNMATCHED') {
      issues.push({ rowNumber: row.rowNumber, name: row.name, reason: 'UNMATCHED' })
      continue
    }

    const urlValidation = validateImageUrl(row.url)
    if (!urlValidation.valid) {
      issues.push({ rowNumber: row.rowNumber, name: row.name, reason: 'MALFORMED_URL' })
      continue
    }

    resolvedUrlByCanonicalId.set(result.canonicalId!, { row: { ...row, url: urlValidation.trimmed }, method: result.outcome })
  }

  const canonicalIdSet = new Set(canonicalHulls.map((h) => h.canonicalId))
  const orphanCanonicalIdsInExistingCsv = Array.from(existingUrlByCanonicalId.keys()).filter((id) => !canonicalIdSet.has(id))

  const rows: MaintenanceCsvRow[] = canonicalHulls.map((hull) => {
    const duplicateAliasOf = DUPLICATE_CANONICAL_PAIRS.get(hull.canonicalId)
    const existingUrl = existingUrlByCanonicalId.get(hull.canonicalId) ?? ''
    const resolved = resolvedUrlByCanonicalId.get(hull.canonicalId)

    if (duplicateAliasOf) {
      // Task 5 — never write a URL into the lesser sibling's own row, even
      // if a workbook row happened to name-match it directly; the winner's
      // row is the only one that may carry this hull's real image.
      const winnerHasUrl = Boolean(existingUrlByCanonicalId.get(duplicateAliasOf)) || resolvedUrlByCanonicalId.has(duplicateAliasOf)
      return {
        manufacturer: hull.manufacturer,
        ship_name: hull.displayName,
        canonical_id: hull.canonicalId,
        source_entity_class: hull.registryKey,
        rsi_image_url: '',
        coverage_status: winnerHasUrl ? 'REGISTRY' : 'FALLBACK',
        match_method: 'EXISTING_ALIAS',
        notes: `Known duplicate of canonical hull "${duplicateAliasOf}" (EWO-038 Task 5) — resolves through that hull's own image at runtime; never edit this row directly, edit "${duplicateAliasOf}" instead. Pending permanent merge under GF-002D.`,
      }
    }

    const url = existingUrl || resolved?.row.url || ''
    const method: MaintenanceMatchMethod = existingUrl && !resolved ? 'MANUAL_REVIEW' : resolved?.method ?? 'UNMATCHED'
    const coverageStatus: CoverageStatus = url ? 'REGISTRY' : 'FALLBACK'

    return {
      manufacturer: hull.manufacturer,
      ship_name: hull.displayName,
      canonical_id: hull.canonicalId,
      source_entity_class: hull.registryKey,
      rsi_image_url: url,
      coverage_status: coverageStatus,
      match_method: method,
      notes: '',
    }
  })

  return {
    rows,
    issues,
    matchCounts,
    duplicateWorkbookNames: Array.from(duplicateNames),
    duplicateWorkbookUrls: Array.from(duplicateUrls),
    orphanCanonicalIdsInExistingCsv,
  }
}

export interface RegistryDiffEntry {
  registryKey: string
  url?: string
}

export interface RegistryDiff {
  retained: RegistryDiffEntry[]
  replaced: Array<{ registryKey: string; oldUrl: string; newUrl: string }>
  removed: RegistryDiffEntry[]
  added: RegistryDiffEntry[]
}

export interface BuildRegistryResult {
  entries: Array<{ registryKey: string; url: string }>
  diff: RegistryDiff
  skippedReviewRequired: string[]
  duplicateRegistryKeys: string[]
}

/** Builds the final runtime registry entries from the (Commander-editable)
 * maintenance CSV rows, diffed against the current runtime registry
 * (Task 9). A REVIEW_REQUIRED row is never written to the registry. */
export function buildRegistryEntries(csvRows: MaintenanceCsvRow[], currentRegistry: Readonly<Record<string, string>>): BuildRegistryResult {
  const skippedReviewRequired: string[] = []
  const byKey = new Map<string, string>()

  for (const row of csvRows) {
    if (row.coverage_status === 'REVIEW_REQUIRED') {
      skippedReviewRequired.push(row.canonical_id)
      continue
    }
    if (!row.rsi_image_url) continue
    const validation = validateImageUrl(row.rsi_image_url)
    if (!validation.valid) continue
    byKey.set(row.source_entity_class, validation.trimmed)
  }

  const duplicateRegistryKeys = Array.from(
    new Set(csvRows.filter((r) => r.rsi_image_url && byKey.get(r.source_entity_class) !== undefined).map((r) => r.source_entity_class))
  ).filter((key) => csvRows.filter((r) => r.source_entity_class === key && r.rsi_image_url).length > 1)

  const entries = Array.from(byKey.entries())
    .map(([registryKey, url]) => ({ registryKey, url }))
    .sort((a, b) => a.registryKey.localeCompare(b.registryKey))

  const oldKeys = new Set(Object.keys(currentRegistry))
  const newKeys = new Set(entries.map((e) => e.registryKey))

  const retained: RegistryDiffEntry[] = []
  const replaced: Array<{ registryKey: string; oldUrl: string; newUrl: string }> = []
  const added: RegistryDiffEntry[] = []
  for (const entry of entries) {
    if (!oldKeys.has(entry.registryKey)) {
      added.push({ registryKey: entry.registryKey, url: entry.url })
    } else if (currentRegistry[entry.registryKey] === entry.url) {
      retained.push({ registryKey: entry.registryKey, url: entry.url })
    } else {
      replaced.push({ registryKey: entry.registryKey, oldUrl: currentRegistry[entry.registryKey], newUrl: entry.url })
    }
  }
  const removed: RegistryDiffEntry[] = Object.keys(currentRegistry)
    .filter((key) => !newKeys.has(key))
    .map((key) => ({ registryKey: key, url: currentRegistry[key] }))

  return {
    entries,
    diff: { retained, replaced, removed, added },
    skippedReviewRequired,
    duplicateRegistryKeys,
  }
}
