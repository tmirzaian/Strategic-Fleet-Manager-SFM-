/**
 * Data Engine `Ship`.
 *
 * IMPORTANT: this is intentionally a separate type from the UI-facing
 * `Ship` in `src/types/index.ts`. The two represent different layers:
 *   - This one is Layer 2 (Normalized Game Data) plus a couple of
 *     Layer 3 (Player Data) fields the spec asked to include directly on
 *     Ship (`ownership`) for convenience.
 *   - The UI type is a flattened shape the existing React pages already
 *     depend on and this sprint is not allowed to touch.
 * Do not merge or alias these two without a deliberate migration — that's
 * future importer/adapter work, not this sprint.
 */

// Kept local to the engine rather than imported from the UI types module,
// so the two layers can evolve independently.
export type EngineOwnership = 'Owned' | 'Purchased' | 'Loaner' | 'Unowned'

/**
 * Placeholder structure for imported RSI/CIG classification data.
 * Left empty when the source data doesn't carry it — never fabricated.
 * A later sprint will wire this into Fleet Dashboard filters once the
 * `source` field's provenance is confirmed.
 */
export interface ShipClassification {
  rsiRoles: string[]
  focusTags: string[]
  vehicleKind?: string
  source?: string
}

import type { ShipImageMetadata } from './shipImage'

export interface Ship {
  id: string
  manufacturer: string
  name: string
  career: string
  role: string
  /** @deprecated legacy flat field — prefer `image.primaryUrl`. Kept for
   * backward compatibility; see src/utils/resolveShipImage.ts. */
  imageUrl?: string
  /** Structured image metadata (Sprint 1.3G). Optional so existing
   * packages/fixtures without it keep working. */
  image?: ShipImageMetadata
  /**
   * Insurance term/status (e.g. "LTI", "6 Months", "None"). Shape is a
   * placeholder — CIG/StarBreaker's actual insurance representation isn't
   * known yet since no importer exists. Kept as a plain string until real
   * data defines a better structure.
   */
  insurance?: string
  ownership: EngineOwnership
  /** Foreign key into FactoryLoadout — the ship's stock/default loadout. */
  factoryLoadoutId: string
  /** Model/family, when derivable from source data (e.g. "Gladius" vs. the
   * class name "AEGS_Gladius"). Left undefined when not derivable. */
  model?: string
  /** Canonical raw entity class name (e.g. "AEGS_Gladius"), stripped of the
   * `EntityClassDefinition.` prefix — the same identity the broad ship
   * catalog (Mission M-012, `ship-catalog.json`) keys its records by. This
   * is the join key the app layer uses to recognize that a deep-imported
   * ship and a catalog-only entry describe the same real vessel, and to
   * resolve a FleetAsset added before deep-import data existed once it
   * does. Left undefined only if the source truly carried no class name. */
  sourceEntityClass?: string
  classification: ShipClassification
}

export function emptyClassification(): ShipClassification {
  return { rsiRoles: [], focusTags: [] }
}
