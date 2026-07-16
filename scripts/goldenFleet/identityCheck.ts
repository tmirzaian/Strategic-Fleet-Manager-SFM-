/**
 * Operation Golden Fleet — GF-002B (Task 4) exact-entity match protection.
 *
 * StarBreaker's `entity export <NAME>` performs a case-insensitive
 * substring match (confirmed during GF-002A: "Found 46 candidates, using
 * shortest match"). A successful process exit is never sufficient proof
 * the correct entity was exported — this module re-reads the exported
 * file's own declared root entity and compares it against what was
 * actually requested, reusing the *same* prefix-normalization rule the
 * real importer (`src/normalizer/shipNormalizer.ts`'s `resolveShipEntity`)
 * already applies, so this check can never disagree with what the
 * importer itself would treat as the ship's identity.
 */
import { resolveShipEntity } from '../../src/normalizer/shipNormalizer'
import { stripTrailingCommas } from '../../src/engine/importer/trailingCommaJson'
import type { IdentityCheckResult } from './types'

/** Parses raw export text the same way `StarBreakerImporter.read()` does — strict JSON first, trailing-comma fallback second — so an identity check never rejects a file the real importer would have accepted. */
export function parseExportText(text: string): { parsed: unknown; usedTrailingCommaFallback: boolean } {
  try {
    return { parsed: JSON.parse(text), usedTrailingCommaFallback: false }
  } catch {
    return { parsed: JSON.parse(stripTrailingCommas(text)), usedTrailingCommaFallback: true }
  }
}

export function checkIdentity(requestedEntityId: string, rawExportText: string): IdentityCheckResult {
  let parsed: unknown
  try {
    parsed = parseExportText(rawExportText).parsed
  } catch (e) {
    return { ok: false, requestedEntityId, observedEntityId: null, reason: `Export text is not valid JSON even after trailing-comma normalization: ${String(e)}` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entity = resolveShipEntity(parsed as any)
  const observedEntityId = entity?.className ?? null

  if (!observedEntityId) {
    return { ok: false, requestedEntityId, observedEntityId: null, reason: 'Export contains no resolvable root/legacy entity envelope.' }
  }
  if (observedEntityId !== requestedEntityId) {
    return { ok: false, requestedEntityId, observedEntityId, reason: `Requested "${requestedEntityId}" but the export's own declared entity is "${observedEntityId}" — StarBreaker's substring match likely resolved to a different entity.` }
  }
  return { ok: true, requestedEntityId, observedEntityId }
}
