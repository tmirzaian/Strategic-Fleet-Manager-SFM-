import type { Ship } from '../types'

export interface TileContextEntry {
  shipId: string
  name: string
}

export interface TileContextResult {
  shown: TileContextEntry[]
  overflowCount: number
}

/**
 * Builds the "which ships does this count represent" context for a
 * Mission Control tile (Alpha 2.5A, Part 2 — the "At-a-Glance Rule").
 * Shows up to `maxShown` names, deterministically ordered by priority
 * then name then id, with the rest folded into `overflowCount` ("+N").
 *
 * Names come straight from `Ship.name`, which already resolves to the
 * Fleet Asset's nickname when one was set (see
 * src/utils/fleetAssetMaterializer.ts) and falls back to the model's
 * display name otherwise — no separate nickname-preference logic needed
 * here.
 */
export function buildTileContextNames(ships: Ship[], maxShown = 3): TileContextResult {
  const sorted = [...ships].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  return {
    shown: sorted.slice(0, maxShown).map((s) => ({ shipId: s.id, name: s.name })),
    overflowCount: Math.max(0, sorted.length - maxShown),
  }
}
