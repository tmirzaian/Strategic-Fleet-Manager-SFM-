import type { ShipDefinition, FleetAsset, Ship, Build, Hardpoint, OwnershipType, AcquisitionSource } from '../types'
import type { FactoryHardpointTemplate } from '../data/shipDefinitions'
import { computeHardpointStatusWithValidation } from './hardpointStatus'
import { ownershipTypeToLegacy } from './ownership'

let counter = 0
function uniqueSuffix(): string {
  counter += 1
  return `${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 7)}`
}

export interface MaterializeAssetParams {
  definition: ShipDefinition
  template: FactoryHardpointTemplate[]
  /** When provided (rehydration replay), the asset's own id/build id/
   * nickname/ownership/priority/timestamps are reused verbatim so a
   * persisted Fleet Asset keeps a stable identity across reloads, instead
   * of minting a new id every time the page loads. */
  existingAsset?: FleetAsset
  ownershipType?: OwnershipType
  nickname?: string
  priority?: number
  acquisitionSource?: AcquisitionSource
}

export interface MaterializedAsset {
  asset: FleetAsset
  ship: Ship
  build: Build
  hardpoints: Hardpoint[]
}

/**
 * The single place a FleetAsset is turned into the rendering rows every
 * existing page already knows how to display (Ship/Build/Hardpoint) —
 * used both by the live "Add Ship" action (fresh id) and, on
 * rehydration, by the persisted-asset replay in
 * src/store/useFleetStore.ts (stable, reused id via `existingAsset`), so
 * there is exactly one implementation of "what a Fleet Asset looks like."
 *
 * Installed Loadout is initialized from Factory (every hardpoint's
 * installedItem/targetItem starts equal to its factoryItem), so a fresh
 * Factory Build is 100% ready by construction — status for each row goes
 * through the same shared `computeHardpointStatusWithValidation` the rest
 * of the app uses, not a separate readiness calculation.
 */
export function materializeFleetAsset({ definition, template, existingAsset, ownershipType, nickname, priority, acquisitionSource }: MaterializeAssetParams): MaterializedAsset {
  const assetId = existingAsset?.id ?? `${definition.id}-asset-${uniqueSuffix()}`
  const buildId = existingAsset?.activeBuildId ?? `${assetId}-build-factory`
  const resolvedOwnership = existingAsset?.ownershipType ?? ownershipType ?? 'OWNED'
  const resolvedNickname = existingAsset?.nickname ?? nickname
  const resolvedPriority = existingAsset?.priority ?? priority ?? 0
  const resolvedSource = existingAsset?.acquisitionSource ?? acquisitionSource ?? 'MANUAL'
  const now = new Date().toISOString()

  const hardpoints: Hardpoint[] = template.map((slot, i) => {
    const { status, invalidMessage } = computeHardpointStatusWithValidation(slot.factoryItem, slot.factoryItem, slot.factoryItem, slot.type, slot.size)
    return {
      id: `${buildId}-hp-${i}`,
      shipId: assetId,
      buildId,
      slotLabel: slot.slotLabel,
      type: slot.type,
      size: slot.size,
      factoryItem: slot.factoryItem,
      installedItem: slot.factoryItem,
      targetItem: slot.factoryItem,
      status,
      invalidMessage,
      // Mission M-011: preserves nested mount/turret/rack structure from
      // the ShipDefinition's template — previously dropped entirely here,
      // so every newly materialized Fleet Asset (seed or imported) lost
      // all parent/child structure regardless of its source template.
      parentSlotLabel: slot.parentSlotLabel,
    }
  })

  const missing = hardpoints.filter((h) => h.status === 'Missing' || h.status === 'Upgrade Available').map((h) => h.targetItem)
  const okCount = hardpoints.filter((h) => h.status === 'OK').length
  const readiness = hardpoints.length > 0 ? Math.round((okCount / hardpoints.length) * 100) : 100

  const build: Build = {
    id: buildId,
    shipId: assetId,
    name: 'Factory Loadout',
    role: definition.role,
    readiness,
    isActive: true,
    missing,
    // A freshly materialized Fleet Asset starts on its Factory Loadout —
    // Installed = Target = Factory by construction, but that is NOT the
    // same thing as a finished custom project. `kind: 'FACTORY'` is what
    // keeps deriveFleetBuildState() from mislabeling this MISSION_READY
    // (Alpha 2.1, Part 9's stated bug).
    kind: 'FACTORY',
  }

  const asset: FleetAsset = existingAsset ?? {
    id: assetId,
    shipDefinitionId: definition.id,
    nickname: resolvedNickname,
    ownershipType: resolvedOwnership,
    acquisitionSource: resolvedSource,
    activeBuildId: buildId,
    installedLoadoutId: `${assetId}-installed`,
    priority: resolvedPriority,
    status: 'active',
    addedAt: now,
    updatedAt: now,
  }

  // Card-compatible nickname presentation without redesigning ShipCard:
  // the nickname becomes the card's bold title, and the model name folds
  // into the existing manufacturer/role subtitle line as supporting text.
  const ship: Ship = {
    id: assetId,
    name: resolvedNickname ?? definition.displayName,
    manufacturer: definition.manufacturer,
    ownership: ownershipTypeToLegacy(resolvedOwnership),
    career: definition.career,
    role: resolvedNickname ? `${definition.displayName} · ${definition.role}` : definition.role,
    activeBuildId: buildId,
    readiness,
    priority: resolvedPriority,
    missing,
    imageUrl: definition.imageUrl ?? definition.image?.primaryUrl,
    lastUpdated: 'Just now',
  }

  return { asset, ship, build, hardpoints }
}
