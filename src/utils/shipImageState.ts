import { SHIP_PLACEHOLDER_URL } from '../constants/shipImage'

export interface ShipImageState {
  /** The URL currently being rendered. */
  effectiveSrc: string
  /** True once we've already fallen back — guards against an infinite
   * onError loop if the fallback asset itself somehow fails to load. */
  usingFallback: boolean
}

/**
 * Given a candidate remote/approved src (possibly undefined) and an
 * explicit fallback, computes the initial state to render. Missing src
 * goes straight to the fallback — no failed network request needed to
 * find that out.
 */
export function initialShipImageState(src: string | undefined, fallbackSrc: string = SHIP_PLACEHOLDER_URL): ShipImageState {
  if (!src || src.trim() === '') {
    return { effectiveSrc: fallbackSrc, usingFallback: true }
  }
  return { effectiveSrc: src, usingFallback: false }
}

/**
 * Given the current state and an onError event, computes the next state.
 * Once `usingFallback` is true, further errors are absorbed without
 * changing `effectiveSrc` again — this is what prevents an infinite
 * error loop if the fallback asset itself fails to load (falls back to
 * `usingFallback: true` with the same src, i.e. a no-op).
 */
export function onShipImageError(state: ShipImageState, fallbackSrc: string = SHIP_PLACEHOLDER_URL): ShipImageState {
  if (state.usingFallback) {
    return state
  }
  return { effectiveSrc: fallbackSrc, usingFallback: true }
}

/**
 * Determines whether the currently-displayed image should be treated as
 * branded fallback artwork (object-contain, its own presentation) rather
 * than ship photography (object-cover) — Sprint 1.3H.
 *
 * Deliberately never inspects the URL string itself. Two structural
 * signals only:
 *   1. Explicit image metadata (`source`/`status`), when the caller has
 *      it — e.g. an imported ship's generated-data manifest entry already
 *      says `source: 'FALLBACK'` before any image even attempts to load.
 *   2. The runtime resolution state (`usingFallback`), which is true
 *      whenever `src` was missing OR failed to load — covering ships with
 *      no metadata at all (the seed fleet) and the case where a real,
 *      approved photo URL fails at runtime and we're now actually
 *      rendering the placeholder regardless of what the metadata claimed.
 */
export function deriveIsFallback(usingFallback: boolean, image?: { source?: string; status?: string }): boolean {
  if (image && (image.source === 'FALLBACK' || image.status === 'fallback')) {
    return true
  }
  return usingFallback
}
