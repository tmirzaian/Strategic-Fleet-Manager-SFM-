import { assetPath } from './assetPaths'
import type { ShipManagementIllustrationDefinition, ShipManagementIllustrationId } from './types'

function definition(id: ShipManagementIllustrationId, label: string, overrides: Partial<Omit<ShipManagementIllustrationDefinition, 'id' | 'label'>> = {}): ShipManagementIllustrationDefinition {
  return { id, label, enabled: false, ...overrides }
}

/**
 * EWO-062 — Quartermaster Bay Empty-State Integration. Only
 * `quartermaster-bay-empty` is enabled this mission; `ship-management-
 * active` and `ship-management-engineering` have real files on disk
 * already (delivered as a set) but stay disabled/unreferenced until a
 * future mission explicitly wires each one in.
 */
export const SHIP_MANAGEMENT_ILLUSTRATIONS: Record<ShipManagementIllustrationId, ShipManagementIllustrationDefinition> = {
  'quartermaster-bay-empty': definition('quartermaster-bay-empty', 'Quartermaster Bay — No Ship Selected', {
    src: assetPath('environments/ship-management/quartermaster-bay-empty.webp'),
    enabled: true,
  }),
  'ship-management-active': definition('ship-management-active', 'Quartermaster Bay — Ship Selected (reserved, not yet integrated)'),
  'ship-management-engineering': definition('ship-management-engineering', 'Quartermaster Bay — Engineering View (reserved, not yet integrated)'),
}

export function getShipManagementIllustration(id: ShipManagementIllustrationId): ShipManagementIllustrationDefinition {
  return SHIP_MANAGEMENT_ILLUSTRATIONS[id]
}

/** Resolved src, or undefined when this id isn't enabled/approved yet — callers must render their existing neutral fallback rather than a broken image. */
export function resolveShipManagementIllustration(id: ShipManagementIllustrationId): string | undefined {
  const def = SHIP_MANAGEMENT_ILLUSTRATIONS[id]
  return def.enabled && def.src ? def.src : undefined
}
