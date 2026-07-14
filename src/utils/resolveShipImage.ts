import { SHIP_PLACEHOLDER_URL } from '../constants/shipImage'
import type { ShipImageMetadata } from '../engine/types'
import { SHIP_IMAGE_URLS } from '../data/shipImageRegistry'
import { presentationImageKeyById } from '../data/shipDefinitions'

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

const HTTPS_URL_PATTERN = /^https:\/\/.+/i

/**
 * EWO-021A (Task 3) — a registry value only counts if it is a trimmed,
 * non-empty, absolute HTTPS URL. Anything else (a typo, a relative path,
 * an http:// link, an accidentally-empty string) is ignored safely and
 * the resolution chain continues to the next tier — never a thrown
 * error, never a startup crash from one bad Commander-pasted entry.
 */
/** Exported for direct unit testing of the validation rule itself (see
 * src/utils/__tests__/resolveShipImage.test.ts), independent of whatever
 * is actually in the live registry at test time. */
export function validRegistryUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  return HTTPS_URL_PATTERN.test(trimmed) ? trimmed : undefined
}

/**
 * Tries the input id directly first (covers a deep-imported ship's own
 * generated id, e.g. "cutlass-black-imported", and any seed id that is
 * already its hull's canonical key), then
 * `presentationImageKeyById` (src/data/shipDefinitions.ts) — the same
 * hull-grouping EWO-021/ADR-008 already computes, which also covers a
 * deep-imported ship's raw entity class, a superseded catalog-only
 * placeholder's alias, AND the seed-vs-deep-import presentation
 * convergence (EWO-021A-1, e.g. seed "corsair" -> "DRAK_Corsair") without
 * requiring every caller to canonicalize an id itself.
 */
function registryUrlFor(id: string): string | undefined {
  return validRegistryUrl(SHIP_IMAGE_URLS[id]) ?? validRegistryUrl(SHIP_IMAGE_URLS[presentationImageKeyById.get(id) ?? ''])
}

export interface ResolvableShipImage {
  /** A canonical ship/definition id — see src/data/shipImageRegistry.ts for what "canonical" means here. */
  id: string
  imageUrl?: string
  image?: Pick<ShipImageMetadata, 'primaryUrl'>
}

/**
 * EWO-021A (Task 4) — the one shared ship-image resolver every normal
 * ship-image consumer should go through, so no future feature has to
 * reimplement this precedence or bypass the Commander's registry.
 * Resolution order:
 *   1. the canonical manual image registry (src/data/shipImageRegistry.ts)
 *   2. the input's own existing image (resolveDisplayImageUrl above —
 *      already covers both a structured `image.primaryUrl` and the
 *      legacy `imageUrl`, which is itself already whatever the generated
 *      import pipeline or seed data resolved for this ship)
 *   3. `undefined`, so the caller's <ShipImage fallbackSrc=...> renders
 *      the approved Fleet Registry placeholder instead
 *
 * Accepts anything with a canonical `id` plus the existing image fields
 * — a ShipDefinition, an ImportedShipView's raw `ship`, or a materialized
 * Ship all satisfy this shape — so a caller never has to canonicalize an
 * id itself before calling in.
 */
export function resolveShipImage(input: ResolvableShipImage): string | undefined {
  const registryUrl = registryUrlFor(input.id)
  if (registryUrl) return registryUrl

  const existing = resolveDisplayImageUrl(input)
  return existing !== SHIP_PLACEHOLDER_URL ? existing : undefined
}
