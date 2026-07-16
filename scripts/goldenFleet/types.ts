/**
 * Operation Golden Fleet — GF-002B shared types.
 *
 * This tool acquires and validates StarBreaker raw exports for every
 * canonical selectable hull. It never writes into `raw-data/` or
 * `generated-data/` — see `docs/OPERATION_GOLDEN_FLEET.md`'s GF-002B
 * section for the full mission scope and the reserved GF-002C promotion
 * step this tool's output feeds into.
 */

export type SourceClass = 'SEED-BACKED' | 'DEEP-IMPORTED' | 'CATALOG-ONLY' | 'HYBRID' | 'UNCLASSIFIED'

export type AcquisitionStatus =
  | 'PENDING'
  | 'EXPORTED_VALID'
  | 'ALREADY_VALIDATED'
  | 'NO_MECHANICAL_ENTITY'
  | 'AMBIGUOUS_MATCH'
  | 'EXPORT_FAILED'
  | 'MALFORMED_OUTPUT'
  | 'IDENTITY_MISMATCH'
  | 'IMPORTER_REJECTED'
  | 'OTHER'

export interface ManifestEntry {
  /** Commander-facing ship name (ShipDefinition.displayName). */
  displayName: string
  manufacturer: string
  /** Canonical ShipDefinition.id — the exact key selectableShipDefinitions uses. */
  canonicalId: string
  sourceClass: SourceClass
  /** The exact entity identifier this tool will request from StarBreaker. */
  requestedEntityId: string
  /** How requestedEntityId was determined. */
  requestedEntityIdSource: 'sourceEntityClass' | 'catalogEntityClassId' | 'seedNameMatch' | 'unresolved'
  /** The matched generated-data/ship-catalog.json record, if any. */
  matchedCatalogEntityClass: string | null
  matchedCatalogDisplayName: string | null
  /** Other catalog records that could plausibly match the same seed hull — ambiguity evidence, never silently picked. */
  alternateCandidates: Array<{ entityClass: string; displayName: string | null }>
  aliasNotes: string | null
  expectedOutputFilename: string
  /** True if one of the 6 already-approved raw-data/*.json files already covers this hull. */
  alreadyInRawData: boolean
  acquisitionStatus: AcquisitionStatus
  failureReason: string | null
}

export interface IdentityCheckResult {
  ok: boolean
  requestedEntityId: string
  observedEntityId: string | null
  reason?: string
}

export interface ExportAttemptResult {
  canonicalId: string
  requestedEntityId: string
  command: string
  exitCode: number | null
  stdoutTail: string
  stderrTail: string
  timedOut: boolean
  elapsedMs: number
  outputPath: string
  outputExists: boolean
  outputSize: number
}

export interface ValidationRecord {
  canonicalId: string
  file: string
  jsonReadable: boolean
  usedTrailingCommaFallback: boolean
  identityMatch: boolean
  observedEntityId: string | null
  normalizeSucceeded: boolean
  normalizeError: string | null
  portCount: number
  structuralCount: number
  unknownFactoryItemCount: number
  duplicateSlotLabelCount: number
  normalizationWarningCount: number
  normalizationErrorCount: number
  compatibilityWarningCount: number
}

export interface HullAcquisitionRecord {
  manifest: ManifestEntry
  exportAttempt: ExportAttemptResult | null
  validation: ValidationRecord | null
  finalStatus: AcquisitionStatus
  elapsedMs: number
}

export interface AcquisitionReport {
  generatedAt: string
  p4k: { path: string; sizeBytes: number; mtime: string; branch: string; version: string; p4ChangeNum: string }
  starbreaker: { path: string; version: string; sha256: string }
  targetCanonicalHullCount: number
  totalRuntimeMs: number
  stagingDirectory: string
  totalStagingBytes: number
  statusCounts: Record<AcquisitionStatus, number>
  hulls: HullAcquisitionRecord[]
}
