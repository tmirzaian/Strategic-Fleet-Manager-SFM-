/**
 * Operation Golden Fleet — GF-002B (Task 6) staged-export validation.
 *
 * Runs a staged export file through the exact real importer/normalizer/
 * validation pipeline `npm run import:ships` itself uses — in memory
 * only. Never calls `GeneratedDataWriter` and never writes to
 * `generated-data/` — this module's only side effect is reading the one
 * staged file it's given.
 */
import { readFileSync } from 'node:fs'
import { StarBreakerImporter } from '../../src/engine/importer/starBreakerImporter'
import { ShipNormalizer } from '../../src/normalizer/shipNormalizer'
import { validateNormalizedPackage } from '../../src/normalizer/validation'
import type { RawFileReader } from '../../src/engine/importer/rawFileReader'
import { checkIdentity } from './identityCheck'
import type { ValidationRecord } from './types'

class SingleFileReader implements RawFileReader {
  constructor(private path: string) {}
  listFiles(): string[] {
    return [this.path]
  }
  readFile(): string {
    return readFileSync(this.path, 'utf-8')
  }
}

export async function validateStagedExport(canonicalId: string, requestedEntityId: string, filePath: string): Promise<ValidationRecord> {
  const rawText = readFileSync(filePath, 'utf-8')

  const identity = checkIdentity(requestedEntityId, rawText)

  const base: ValidationRecord = {
    canonicalId,
    file: filePath,
    jsonReadable: identity.observedEntityId !== null || identity.reason === undefined,
    usedTrailingCommaFallback: false,
    identityMatch: identity.ok,
    observedEntityId: identity.observedEntityId,
    normalizeSucceeded: false,
    normalizeError: null,
    portCount: 0,
    structuralCount: 0,
    unknownFactoryItemCount: 0,
    duplicateSlotLabelCount: 0,
    normalizationWarningCount: 0,
    normalizationErrorCount: 0,
    compatibilityWarningCount: 0,
  }

  // A mismatched or unreadable identity is never marked successful,
  // regardless of what the normalizer would do with it (Task 4).
  if (!identity.ok) return base

  try {
    const reader = new SingleFileReader(filePath)
    const importer = new StarBreakerImporter(reader)
    const normalizer = new ShipNormalizer()
    const raw = await importer.read(filePath)
    const pkg = normalizer.normalize(raw, filePath)
    const validation = validateNormalizedPackage(pkg)

    const slotLabels = pkg.ports.map((p) => p.id)
    const dupCount = slotLabels.length - new Set(slotLabels).size

    // Mirrors src/data/shipDefinitions.ts's own factoryItemFor(): a
    // non-structural port with a factoryItemId that doesn't resolve to a
    // real component in pkg.components is exactly what later renders as
    // "Unknown Factory Item" once shipDefinitions.ts builds its
    // FactoryHardpointTemplate from this same package.
    const componentIds = new Set(pkg.components.map((c) => c.id))
    const unknownFactoryItemCount = pkg.ports.filter((p) => !p.isStructural && p.factoryItemId && !componentIds.has(p.factoryItemId)).length

    return {
      ...base,
      normalizeSucceeded: true,
      portCount: pkg.ports.length,
      structuralCount: pkg.ports.filter((p) => p.isStructural).length,
      unknownFactoryItemCount,
      duplicateSlotLabelCount: dupCount,
      normalizationWarningCount: validation.normalizationWarnings.length,
      normalizationErrorCount: validation.normalizationWarnings.filter((w) => w.severity === 'error').length,
      compatibilityWarningCount: validation.compatibilityWarnings.length,
    }
  } catch (e) {
    return { ...base, normalizeSucceeded: false, normalizeError: String(e) }
  }
}
