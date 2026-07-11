import type { DisplayNameMap } from '../types'

/**
 * Resolves an internalName to its UI-safe displayName using a
 * DisplayNameMap (the future Normalizer's output, loaded from
 * generated-data/display-name-map.json). Falls back to a readable
 * best-effort transform of the internalName itself if no mapping exists
 * yet, rather than ever surfacing the raw internalName unchanged — the UI
 * should never display internal names directly, even in a data-gap edge
 * case.
 */
export function resolveDisplayName(internalName: string, map: DisplayNameMap): string {
  const mapped = map[internalName]
  if (mapped) return mapped
  return humanizeFallback(internalName)
}

/**
 * Best-effort fallback: "hardpoint_gun_left_wing" -> "Hardpoint Gun Left Wing".
 * This is intentionally crude — it exists only so an unmapped internalName
 * never leaks into the UI verbatim while the real DisplayNameMap is still
 * being built out by the future Normalizer.
 */
function humanizeFallback(internalName: string): string {
  return internalName
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
