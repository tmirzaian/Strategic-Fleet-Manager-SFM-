import { assetPath } from './assetPaths'
import type { ShipManagementCardAccentDefinition, ShipManagementCardAccentId } from './types'

function definition(id: ShipManagementCardAccentId, label: string, overrides: Partial<Omit<ShipManagementCardAccentDefinition, 'id' | 'label'>> = {}): ShipManagementCardAccentDefinition {
  return { id, label, sources: {}, enabled: false, ...overrides }
}

/**
 * EWO-101 — Ship Management's two Commander Intent workstation cards' own
 * low-opacity CSS background accents. See `ShipManagementCardAccentId`'s
 * own doc comment (types.ts) for why this is a distinct registry from
 * `CaptainsLogAccentId`/`ShipManagementIllustrationId`. Masters delivered
 * at 1672x940 — below the 1600 tier's own precedent width from
 * `CAPTAINS_LOG_ACCENTS`, so only `wide` (1600) and `narrow` (1200)
 * sources exist per scripts/generateEnvironmentAssets.ts's no-upscale
 * rule.
 */
export const SHIP_MANAGEMENT_CARD_ACCENTS: Record<ShipManagementCardAccentId, ShipManagementCardAccentDefinition> = {
  'loadout-workstation': definition('loadout-workstation', 'Ship Management — Manage Loadout Card Accent', {
    sources: {
      wide: assetPath('illustrations/ship-management/loadout-workstation-accent-1600.webp'),
      narrow: assetPath('illustrations/ship-management/loadout-workstation-accent-1200.webp'),
    },
    enabled: true,
  }),
  'maintenance-bay': definition('maintenance-bay', 'Ship Management — Change Installed Components Card Accent', {
    sources: {
      wide: assetPath('illustrations/ship-management/maintenance-bay-accent-1600.webp'),
      narrow: assetPath('illustrations/ship-management/maintenance-bay-accent-1200.webp'),
    },
    enabled: true,
  }),
}

export function getShipManagementCardAccent(id: ShipManagementCardAccentId): ShipManagementCardAccentDefinition {
  return SHIP_MANAGEMENT_CARD_ACCENTS[id]
}

/** Widest-available-first, mirroring `resolveCaptainsLogAccentSource`'s
 * own convention. Resolved src, or undefined when this id isn't
 * enabled/has no usable source yet — callers must render their existing
 * plain-card styling in that case, never a broken background. */
export function resolveShipManagementCardAccentSource(id: ShipManagementCardAccentId): string | undefined {
  const def = SHIP_MANAGEMENT_CARD_ACCENTS[id]
  if (!def.enabled) return undefined
  return def.sources.wide || def.sources.narrow || undefined
}
