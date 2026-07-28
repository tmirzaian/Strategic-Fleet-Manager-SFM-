import { create } from 'zustand'
import { getShipImageBlob } from '../utils/shipImageStorage'

/**
 * UX-005A — the reactive half of the shared ship-image resolver
 * (src/utils/useResolvedShipImage.ts). A custom image's bytes live in
 * IndexedDB (async, session-scoped once loaded), while every other
 * resolution tier (registry/existing/fallback, resolveShipImage.ts) is
 * synchronous and stable — this store bridges the two: it loads a
 * vessel's blob once, converts it to an `URL.createObjectURL()` string
 * components can drop straight into an `<img src>`, and caches that
 * result in memory only. Never persisted (Zustand `create`, no
 * `persist` middleware) — an object URL is only valid for the current
 * page session and must never be written to `localStorage`.
 */

export type ShipImageCacheEntry =
  | { status: 'loading'; ref: string }
  | { status: 'ready'; ref: string; objectUrl: string }
  | { status: 'missing'; ref: string }

interface ShipImageCacheState {
  entries: Record<string, ShipImageCacheEntry>
  /** Kicks off (or reuses) the async load for a vessel's custom image.
   * Safe to call on every render — it no-ops once an entry for the same
   * `ref` already exists, and automatically re-triggers if `ref` changed
   * (a new image was chosen since the last load). */
  ensureLoaded: (vesselId: string, ref: string) => void
  /** Forces a fresh load on the next `ensureLoaded` call, revoking any
   * cached object URL first — called immediately after choosing a new
   * image or restoring the default so the preview updates without
   * waiting for an unrelated re-render to notice a `ref` change. */
  invalidate: (vesselId: string) => void
}

export const useShipImageCacheStore = create<ShipImageCacheState>((set, get) => ({
  entries: {},

  ensureLoaded: (vesselId, ref) => {
    const existing = get().entries[vesselId]
    if (existing && existing.ref === ref) return // already loading/loaded for this exact ref

    set({ entries: { ...get().entries, [vesselId]: { status: 'loading', ref } } })

    getShipImageBlob(vesselId).then((blob) => {
      // The ref may have changed again while this load was in flight —
      // only commit the result if it's still the one being awaited.
      if (get().entries[vesselId]?.ref !== ref) return
      if (!blob) {
        set({ entries: { ...get().entries, [vesselId]: { status: 'missing', ref } } })
        return
      }
      const objectUrl = URL.createObjectURL(blob)
      set({ entries: { ...get().entries, [vesselId]: { status: 'ready', ref, objectUrl } } })
    })
  },

  invalidate: (vesselId) => {
    const existing = get().entries[vesselId]
    if (existing?.status === 'ready') URL.revokeObjectURL(existing.objectUrl)
    const { [vesselId]: _removed, ...rest } = get().entries
    set({ entries: rest })
  },
}))
