import { SHIP_PLACEHOLDER_URL } from '../constants/shipImage'
import type { ShipImageMetadata } from '../engine/types'

/**
 * Resolves the final URL to display for a ship, in priority order:
 *   1. `image.primaryUrl`, when present and non-empty (structured metadata)
 *   2. legacy `imageUrl`, when present and non-empty (backward compatibility)
 *   3. the local placeholder
 *
 * Accepts a loosely-shaped input rather than the full engine `Ship` type
 * so it works equally well for the UI-level `Ship` (imageUrl only, no
 * `image` field) and the engine `Ship` (both). `<ShipImage>` itself still
 * handles a load *failure* at runtime — this helper only decides what to
 * try first.
 */
export function resolveDisplayImageUrl(input: { image?: Pick<ShipImageMetadata, 'primaryUrl'>; imageUrl?: string }): string {
  if (input.image?.primaryUrl && input.image.primaryUrl.trim() !== '') {
    return input.image.primaryUrl
  }
  if (input.imageUrl && input.imageUrl.trim() !== '') {
    return input.imageUrl
  }
  return SHIP_PLACEHOLDER_URL
}
