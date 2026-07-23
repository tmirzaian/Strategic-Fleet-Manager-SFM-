/**
 * CAT-001 (Objective 5), extended by CAT-002 — generation-time-only
 * diagnostics for the Component Classification extraction. Never
 * consumed by the runtime app; printed to the console and written to a
 * gitignored, developer-only file so Engineering can review real
 * coverage after every regeneration. `classifiedCount` now reflects
 * every family CAT-002 covers (Core Classification, Weapon Type, Missile
 * Seeker Type); `missingClassificationCount`/`unrecognizedClassificationValues`
 * stay scoped to Core, whose vocabulary is fixed and whose "should have
 * one" expectation is well-defined — Weapon/Missile values are
 * intentionally open-vocabulary.
 */
import { parseDescriptionHeader, extractClassificationAndGrade, extractOperationalIdentityValue, detectGradeMismatch, KNOWN_CLASSIFICATION_VOCABULARY, type GradeMismatch } from './descriptionClassification'
import { resolveLocalizedName } from '../universeCatalog/localization'
import type { ComponentFieldMaps } from './bulkComponentCollector'
import type { CatalogRecord } from './catalogSchema'

/**
 * Core Component families — the ones CAT-001's Objective 3 names
 * (Coolers, Power Plants, Quantum Drives, Shields, Radar, Life Support,
 * Jump Modules) — confirmed against real DataCore category strings
 * (`LifeSupportGenerator`, not `LifeSupport`; Jump Modules have no
 * distinct category of their own, see componentPresentation.ts). Used
 * only to scope the "missing classification" diagnostic to families where
 * a classification is actually expected — a Door or CargoGrid never
 * carrying one is not a gap worth reporting.
 */
const CORE_CLASSIFICATION_CATEGORIES = new Set(['Cooler', 'PowerPlant', 'QuantumDrive', 'Shield', 'Radar', 'LifeSupportGenerator', 'JumpDrive'])

export interface ClassificationDiagnostics {
  /** Records (any category) with a real, resolved classification value. */
  classifiedCount: number
  /** Core-family records with real description text and a parseable
   * header, but no Classification line in it. */
  missingClassificationCount: number
  /** Core-family entity classes behind missingClassificationCount, capped
   * for console/file readability. */
  missingClassificationSample: string[]
  /** Extracted classification values outside KNOWN_CLASSIFICATION_VOCABULARY, value -> occurrence count. */
  unrecognizedClassificationValues: Record<string, number>
  /** The distinct set of those unrecognized values alone — CAT-001's own
   * separate "newly observed classification values" bullet. */
  newlyObservedClassificationValues: string[]
  /** A description key resolved to something other than a known "empty"
   * sentinel, decoded to non-null text, yet produced zero parseable header
   * lines at all — a genuine template shape this parser doesn't
   * recognize, worth engineering review (distinct from the many records
   * that simply have no description, which is not a failure). */
  localizationParsingFailures: string[]
  gradeMismatches: GradeMismatch[]
}

export function buildClassificationDiagnostics(fields: ComponentFieldMaps, localizationTable: Map<string, string>, records: Map<string, CatalogRecord>): ClassificationDiagnostics {
  let classifiedCount = 0
  let missingClassificationCount = 0
  const missingClassificationSample: string[] = []
  const unrecognizedClassificationValues: Record<string, number> = {}
  const localizationParsingFailures: string[] = []
  const gradeMismatches: GradeMismatch[] = []

  for (const [entityClass, record] of records) {
    const descriptionKey = fields.localizationDescriptionKey.get(entityClass) ?? null
    const descriptionText = resolveLocalizedName(descriptionKey, localizationTable)
    if (!descriptionText) continue

    const header = parseDescriptionHeader(descriptionText)
    if (header.size === 0) {
      localizationParsingFailures.push(entityClass)
      continue
    }

    // CAT-002 — the same family-aware extraction the record itself was
    // built from (Core reads "Class", Weapon reads "Item Type", Missile
    // reads "Tracking Signal"), so this diagnostic never disagrees with
    // what's actually in the generated catalog. Grade-text stays a
    // Core-only concept (`extractClassificationAndGrade`'s own "Grade"
    // label lookup) — no family carries a Grade line other than Core.
    const classification = extractOperationalIdentityValue(header, record.category)
    const { gradeText } = extractClassificationAndGrade(header)
    const isCoreFamily = CORE_CLASSIFICATION_CATEGORIES.has(record.category ?? '')

    if (classification) {
      classifiedCount++
      // Weapon Type / Seeker Type are intentionally open-vocabulary
      // (CAT-002) — only Core's fixed five-value set is checked here.
      if (isCoreFamily && !KNOWN_CLASSIFICATION_VOCABULARY.has(classification)) {
        unrecognizedClassificationValues[classification] = (unrecognizedClassificationValues[classification] ?? 0) + 1
      }
    } else if (isCoreFamily) {
      missingClassificationCount++
      if (missingClassificationSample.length < 25) missingClassificationSample.push(entityClass)
    }

    const mismatch = detectGradeMismatch(entityClass, record.grade, gradeText)
    if (mismatch) gradeMismatches.push(mismatch)
  }

  return {
    classifiedCount,
    missingClassificationCount,
    missingClassificationSample,
    unrecognizedClassificationValues,
    newlyObservedClassificationValues: Object.keys(unrecognizedClassificationValues).sort(),
    localizationParsingFailures,
    gradeMismatches,
  }
}

/** Console-formatted summary — the printed counterpart to the full
 * `ClassificationDiagnostics` object written to disk. */
export function formatClassificationDiagnosticsSummary(d: ClassificationDiagnostics): string {
  const lines = [
    `Classification diagnostics:`,
    `  classified: ${d.classifiedCount}`,
    `  missing (core families, description present, no Class line): ${d.missingClassificationCount}`,
    `  unrecognized classification values: ${Object.keys(d.unrecognizedClassificationValues).length ? JSON.stringify(d.unrecognizedClassificationValues) : '(none)'}`,
    `  localization parsing failures: ${d.localizationParsingFailures.length}`,
    `  grade mismatches (structured Grade preserved as authoritative): ${d.gradeMismatches.length}`,
  ]
  return lines.join('\n')
}
