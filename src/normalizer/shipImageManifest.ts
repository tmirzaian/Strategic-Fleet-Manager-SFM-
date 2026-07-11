import type { ShipImageSource, ShipImageStatus } from '../engine/types'

export interface ShipImageManifestEntry {
  shipId: string
  primaryUrl: string | null
  source: ShipImageSource
  status: ShipImageStatus
  sourceKey?: string
  lastVerified?: string
}

export interface ImageManifestSummary {
  resolved: number
  manual: number
  preservedExisting: number
  fallback: number
  failed: number
  ambiguous: number
}

export interface ShipImageManifestResult {
  manifest: ShipImageManifestEntry[]
  summary: ImageManifestSummary
}

/**
 * Builds (or updates) the ship image manifest for a set of ship ids.
 * Pure — no filesystem access, so it's directly unit-testable; the CLI
 * script is responsible for reading any existing manifest file and
 * writing the result back out.
 *
 * Precedence per ship, matching the ShipImageResolver merge rule:
 *   1. A manual override (src/data/shipImageOverrides.ts) always wins —
 *      "never overwrite working manual image URLs".
 *   2. An existing manifest entry that's already `resolved` or `manual`
 *      is preserved as-is (a re-run must never downgrade a working image
 *      just because this run didn't have fresh data for it).
 *   3. Otherwise, the ship falls back to the local placeholder.
 *
 * No resolver runs in this sprint, so `resolved`/`failed`/`ambiguous` in
 * the summary are always 0 — those categories exist for when
 * ShipImageResolver.resolveImage() has a real implementation.
 */
export function buildShipImageManifest(
  shipIds: string[],
  overrides: Record<string, string>,
  existingManifest: ShipImageManifestEntry[] = []
): ShipImageManifestResult {
  const existingByShipId = new Map(existingManifest.map((e) => [e.shipId, e]))
  const manifest: ShipImageManifestEntry[] = []
  const summary: ImageManifestSummary = { resolved: 0, manual: 0, preservedExisting: 0, fallback: 0, failed: 0, ambiguous: 0 }

  for (const shipId of shipIds) {
    const overrideUrl = overrides[shipId]
    if (overrideUrl) {
      manifest.push({ shipId, primaryUrl: overrideUrl, source: 'MANUAL_OVERRIDE', status: 'manual' })
      summary.manual += 1
      summary.preservedExisting += 1
      continue
    }

    const existing = existingByShipId.get(shipId)
    if (existing && (existing.status === 'resolved' || existing.status === 'manual') && existing.primaryUrl) {
      manifest.push(existing)
      summary.preservedExisting += 1
      if (existing.status === 'resolved') summary.resolved += 1
      if (existing.status === 'manual') summary.manual += 1
      continue
    }

    manifest.push({ shipId, primaryUrl: null, source: 'FALLBACK', status: 'fallback' })
    summary.fallback += 1
  }

  return { manifest, summary }
}
