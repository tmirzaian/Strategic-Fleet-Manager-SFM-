export type ShipImageSource = 'RSI' | 'MANUAL_OVERRIDE' | 'FALLBACK'
export type ShipImageStatus = 'resolved' | 'manual' | 'fallback' | 'failed'

/**
 * Structured image metadata for a normalized ship. Distinct from the
 * legacy flat `imageUrl` string still present on both the engine and UI
 * Ship types for backward compatibility — see
 * src/utils/resolveShipImage.ts for how the two coexist.
 */
export interface ShipImageMetadata {
  primaryUrl?: string
  source: ShipImageSource
  /** Stable key used to look this ship up in a manual override map, when
   * the ship id itself isn't a good enough alias (e.g. across re-imports). */
  sourceKey?: string
  lastVerified?: string
  status: ShipImageStatus
}
