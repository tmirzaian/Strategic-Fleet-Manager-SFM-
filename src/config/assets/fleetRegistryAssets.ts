import { assetPath } from './assetPaths'
import { shipImageOverrides } from '../../data/shipImageOverrides'
import { resolveDisplayImageUrl } from '../../utils/resolveShipImage'
import { SHIP_PLACEHOLDER_URL } from '../../constants/shipImage'
import type { FleetRegistryImageRequest, FleetRegistryImageResult, FleetRegistryManufacturerSlug } from './types'

/**
 * Manufacturer badge code (as produced by src/utils/manufacturerLogo.ts,
 * and confirmed against the real Mission M-012 ship catalog) -> the
 * fleet-registry directory slug it maps to. A separate table from
 * manufacturerLogo.ts's alias map on purpose — that one resolves a
 * display badge, this one resolves a directory that must exactly match
 * public/assets/fleet-registry/'s required structure. Any code not
 * listed here (a manufacturer with no dedicated directory yet) resolves
 * to 'misc-manufacturers', never an invented directory.
 */
const MANUFACTURER_CODE_TO_SLUG: Record<string, FleetRegistryManufacturerSlug> = {
  AEGS: 'aegis',
  ANVL: 'anvil',
  ARGO: 'argo',
  CNOU: 'consolidated-outland',
  CRUS: 'crusader',
  DRAK: 'drake',
  ESPR: 'esperia',
  GATC: 'gatac',
  GATAC: 'gatac',
  GRIN: 'greycat',
  KRIG: 'kruger',
  MISC: 'misc',
  ORIG: 'origin',
  RSI: 'rsi',
  TMBL: 'tumbril',
}

export function manufacturerSlugForCode(manufacturerCode: string): FleetRegistryManufacturerSlug {
  return MANUFACTURER_CODE_TO_SLUG[manufacturerCode.trim().toUpperCase()] ?? 'misc-manufacturers'
}

/**
 * Approved Fleet Registry images, keyed by `<manufacturer-slug>/<ship-slug>[-<variant-slug>]`.
 * Empty by design — Mission M-022 is infrastructure only; it does not
 * generate or copy any registry artwork (see public/assets/fleet-registry/README.md).
 * A future Quartermaster Fleet Registry handoff adds entries here, each
 * one going through `assetPath()` like every other asset reference.
 */
const FLEET_REGISTRY_MANIFEST: Partial<Record<string, string>> = {}

/**
 * @deprecated EWO-033A (Task 3) — NOT the live Beta 1.0 fallback path.
 * `FLEET_REGISTRY_PLACEHOLDER`, `FLEET_REGISTRY_MANIFEST`, and
 * `resolveFleetRegistryImage()` below have no live callers anywhere in
 * the app (confirmed by exhaustive grep — the only references are this
 * file's own definition and the barrel re-export in
 * `src/config/assets/index.ts`). `ShipCard` and `ShipHeroFrame` — every
 * live ship-image consumer — go through `src/utils/resolveShipImage.ts`
 * and its default `fallbackSrc` (`SHIP_PLACEHOLDER_URL`,
 * `public/images/ship-placeholder.png`) instead, confirmed as Beta
 * 1.0's one universal fallback source (see that file's own header and
 * `docs/ASSET_PIPELINE.md`). Both PNG assets referenced here and there
 * are, as of this audit, the identical "IMAGE UNAVAILABLE / DATA LINK
 * PENDING" composition — there was never a visual difference to choose
 * between, only an unused second code path. Kept in place (not deleted)
 * as scaffolding for a possible future Fleet Registry manifest-driven
 * asset pipeline (Release 2.0 Quartermaster Edition), per Ruling 3's
 * "may remain if required by non-live tooling, but must be clearly
 * documented."
 *
 * The approved Fleet Registry placeholder (Commander-approved asset
 * BA-003A-01, "Fleet Registry Placeholder", Revision v1.0). Delivered
 * (EWO-006A) at public/assets/fleet-registry/placeholders/
 * ship-placeholder-master-1024.png — referenced here as the master
 * itself (no derivative pipeline for this asset category; see EWO-006A
 * verification report for why that's an acceptable, explicit choice).
 */
export const FLEET_REGISTRY_PLACEHOLDER: string | undefined = assetPath('fleet-registry/placeholders/ship-placeholder-master-1024.png')

function registryKey(manufacturerSlug: string, shipSlug: string, variantSlug?: string): string {
  return variantSlug ? `${manufacturerSlug}/${shipSlug}-${variantSlug}` : `${manufacturerSlug}/${shipSlug}`
}

export interface ResolveFleetRegistryImageParams extends FleetRegistryImageRequest {
  /**
   * Existing resolved ship image data for tier 3 (the current official/
   * imported ship image) — optional, since not every caller has already
   * loaded it. Shape matches resolveDisplayImageUrl's input exactly so
   * this never re-implements that resolution logic.
   */
  existingShipImage?: { image?: { primaryUrl?: string }; imageUrl?: string }
}

/**
 * @deprecated EWO-033A (Task 3) — unused by any live page; see the
 * deprecation note on `FLEET_REGISTRY_PLACEHOLDER` above. Live ship-image
 * resolution goes through `src/utils/resolveShipImage.ts` instead.
 *
 * Resolves a Fleet Registry ship image through the required fallback
 * order — never generates or invents a URL:
 *   1. an approved Fleet Registry asset (this mission ships none yet);
 *   2. the existing manual ship-image override (shipImageOverrides.ts);
 *   3. the existing official/imported ship image, when the caller
 *      supplies it (resolveDisplayImageUrl — unmodified, reused as-is);
 *   4. the approved Fleet Registry placeholder (FLEET_REGISTRY_PLACEHOLDER
 *      above) — the real BA-003A-01 asset as of EWO-006A, never the
 *      deprecated presentation-board artwork.
 * Never throws — a request for an unknown ship simply falls through to
 * tier 4, exactly like the existing ship-image system already does.
 */
export function resolveFleetRegistryImage(params: ResolveFleetRegistryImageParams): FleetRegistryImageResult {
  const manufacturerSlug = manufacturerSlugForCode(params.manufacturerCode)
  const key = registryKey(manufacturerSlug, params.shipSlug, params.variantSlug)

  const registryEntry = FLEET_REGISTRY_MANIFEST[key]
  if (registryEntry) {
    return { url: assetPath(registryEntry), source: 'fleet-registry' }
  }

  const overrideUrl = shipImageOverrides[params.shipSlug]
  if (overrideUrl) {
    return { url: overrideUrl, source: 'ship-override' }
  }

  if (params.existingShipImage) {
    const resolved = resolveDisplayImageUrl(params.existingShipImage)
    if (resolved !== SHIP_PLACEHOLDER_URL) {
      return { url: resolved, source: 'ship-image' }
    }
  }

  return { url: FLEET_REGISTRY_PLACEHOLDER, source: 'generic-fallback' }
}
