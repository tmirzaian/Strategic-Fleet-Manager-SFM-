import type { Ship, ShipImageMetadata } from '../types'

export interface ImageResolutionResult {
  primaryUrl?: string
  source: ShipImageMetadata['source']
  status: ShipImageMetadata['status']
  sourceKey?: string
}

/**
 * `ShipImageResolver` — contract for resolving a ship's image from an
 * external source (e.g. the RSI website). Interface only in this sprint;
 * no implementation exists yet. `resolveImage`/`verifyImage` require
 * actual network access (out of scope — see the sprint brief's "Do not
 * scrape the RSI website" / "Do not query an RSI API"). `mergeWithExisting`
 * is pure merge logic with no network dependency, so it IS implemented for
 * real below — a future resolver implementation will call it, but it's
 * already usable and tested on its own.
 */
export interface ShipImageResolver {
  resolveImage(ship: Ship): Promise<ImageResolutionResult>
  verifyImage(url: string): Promise<boolean>
  mergeWithExisting(existing: ShipImageMetadata | undefined, resolved: ImageResolutionResult): ShipImageMetadata
}

/**
 * Merge rule (real logic, no network access required):
 *   - A working MANUAL_OVERRIDE or already-`resolved` image is never
 *     erased by a lookup that produces something worse.
 *   - If the new lookup failed/fell back but something valid already
 *     existed, the previous image is preserved rather than downgraded.
 *   - The local fallback is only used when there is no valid image at all
 *     — neither a new resolution nor a preserved existing one.
 *   - Status and source are always recorded, whichever value wins.
 */
export function mergeWithExisting(existing: ShipImageMetadata | undefined, resolved: ImageResolutionResult): ShipImageMetadata {
  const resolvedIsValid = Boolean(resolved.primaryUrl) && (resolved.status === 'resolved' || resolved.status === 'manual')
  const existingIsValid = Boolean(existing?.primaryUrl) && (existing?.status === 'resolved' || existing?.status === 'manual')

  if (resolvedIsValid) {
    // A fresh valid resolution always wins over whatever existed before —
    // it's still real data, not a downgrade.
    return {
      primaryUrl: resolved.primaryUrl,
      source: resolved.source,
      status: resolved.status,
      sourceKey: resolved.sourceKey,
      lastVerified: new Date().toISOString(),
    }
  }

  if (existingIsValid) {
    // The new lookup didn't produce anything usable — never erase a
    // working approved/manual image because of that.
    return existing!
  }

  // Neither the new lookup nor any prior state has anything valid.
  return {
    primaryUrl: undefined,
    source: 'FALLBACK',
    status: 'fallback',
    sourceKey: resolved.sourceKey ?? existing?.sourceKey,
  }
}
