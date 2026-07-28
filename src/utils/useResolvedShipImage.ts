import { useEffect } from 'react'
import { useFleetStore, resolveFleetAssetId } from '../store/useFleetStore'
import { useShipImageCacheStore } from '../store/shipImageCache'

export interface ResolvedShipImage {
  /** The best available image to render right now. */
  src: string | undefined
  /** True when `src` is this specific vessel's own custom image. */
  isCustom: boolean
  /** True when a custom image is on record for this vessel but the
   * managed file couldn't be loaded (deleted, corrupted, storage
   * unavailable) — `src` has already fallen back safely; this flag is
   * only for surfaces (Ship Management Settings) that want to say so
   * explicitly (Deliverable 3). */
  customUnavailable: boolean
}

/**
 * UX-005A (Deliverable 3) — the one canonical resolver every applicable
 * ship-image surface should call, together with `resolveShipImage()`
 * (src/utils/resolveShipImage.ts, unchanged) which it wraps. Resolution
 * order:
 *   1. This vessel's own valid custom image (IndexedDB-backed, see
 *      src/utils/shipImageStorage.ts / src/store/shipImageCache.ts)
 *   2. `fallbackSrc` — whatever the caller already resolved via the
 *      existing official/override chain (`ship.imageUrl`, already
 *      computed once at materialization time — see
 *      fleetAssetMaterializer.ts). This hook never re-derives that
 *      chain itself; it only layers the new custom-image tier on top.
 *   3. `undefined` — the caller's own `<ShipImage fallbackSrc=...>`
 *      renders the standard placeholder, exactly as today.
 *
 * `vesselId` is a rendered `Ship.id` (== `FleetAsset.id` for every
 * non-seed asset; resolved via `resolveFleetAssetId` for a seed ship,
 * whose Ship.id and FleetAsset.id differ — see that function's own doc
 * comment). A vessel with no matching FleetAsset at all (e.g. an
 * unowned deep-import preview) simply never has a `customImageRef` to
 * find, so this hook is a safe no-op passthrough to `fallbackSrc` for
 * every such caller — "existing fleets without customImageRef load
 * unchanged" holds by construction, not by a special case.
 *
 * A custom image's bytes are only ever resolved asynchronously
 * (IndexedDB) and cached as a page-session-scoped `blob:` object URL —
 * this hook subscribes to that reactive cache (shipImageCache.ts) and
 * triggers the load itself, so a component using this hook needs no
 * async code of its own.
 */
export function useResolvedShipImage(vesselId: string, fallbackSrc: string | undefined): ResolvedShipImage {
  const customImageRef = useFleetStore((s) => {
    const assetId = resolveFleetAssetId(vesselId, s.fleetAssets)
    return assetId ? s.fleetAssets.find((a) => a.id === assetId)?.customImageRef : undefined
  })

  const cacheEntry = useShipImageCacheStore((s) => (customImageRef ? s.entries[vesselId] : undefined))
  const ensureLoaded = useShipImageCacheStore((s) => s.ensureLoaded)

  useEffect(() => {
    if (customImageRef) ensureLoaded(vesselId, customImageRef)
  }, [vesselId, customImageRef, ensureLoaded])

  if (!customImageRef) {
    return { src: fallbackSrc, isCustom: false, customUnavailable: false }
  }
  if (cacheEntry?.status === 'ready') {
    return { src: cacheEntry.objectUrl, isCustom: true, customUnavailable: false }
  }
  if (cacheEntry?.status === 'missing') {
    return { src: fallbackSrc, isCustom: false, customUnavailable: true }
  }
  // Loading (or not yet kicked off this render) — show the fallback
  // optimistically rather than a blank frame; the cache subscription
  // above will trigger a re-render the moment the real result lands.
  return { src: fallbackSrc, isCustom: false, customUnavailable: false }
}
