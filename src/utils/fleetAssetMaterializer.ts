import type { ShipDefinition, FleetAsset, Ship, Build, Hardpoint, OwnershipType, AcquisitionSource } from '../types'
import type { FactoryHardpointTemplate } from '../data/shipDefinitions'
import { computeHardpointStatusWithValidation } from './hardpointStatus'
import { ownershipTypeToLegacy } from './ownership'
import { resolveShipImage } from './resolveShipImage'
import { resolveComponentIdentity } from '../engine/installation'

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
    // EWO-020: a structural assembly row (a mount/turret preserved only to
    // explain physical hierarchy) has no component of its own to
    // install/target — it never goes through status computation, never
    // shows Missing/Upgrade Available, and is excluded from the
    // readiness denominator below, exactly like it was excluded from
    // factory-assignment resolution during normalization.
    if (slot.isStructural) {
      return {
        id: `${buildId}-hp-${i}`,
        shipId: assetId,
        buildId,
        slotLabel: slot.slotLabel,
        type: slot.type,
        size: slot.size,
        factoryItem: '—',
        installedItem: '—',
        targetItem: '—',
        status: 'OK' as const,
        parentSlotLabel: slot.parentSlotLabel,
        groupLabel: slot.groupLabel,
        assemblyRole: slot.assemblyRole,
        isStructural: true,
        sourcePortId: slot.sourcePortId,
      }
    }
    const { status, invalidMessage } = computeHardpointStatusWithValidation(slot.factoryItem, slot.factoryItem, slot.factoryItem, slot.type, slot.size)
    // EWO-STAB-003C (ADR-010) — resolved once through
    // ComponentIdentityService, the sole identity authority (never
    // reimplemented here). A freshly materialized row's
    // factory/installed/target items are always identical by
    // construction (see above), so they share one resolved identity;
    // undefined for an uncataloged component, never a guess.
    const factoryEntityClass = resolveComponentIdentity({ displayName: slot.factoryItem })?.entityClass ?? undefined
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
      factoryEntityClass,
      installedEntityClass: factoryEntityClass,
      targetEntityClass: factoryEntityClass,
      status,
      invalidMessage,
      // Mission M-011: preserves nested mount/turret/rack structure from
      // the ShipDefinition's template — previously dropped entirely here,
      // so every newly materialized Fleet Asset (seed or imported) lost
      // all parent/child structure regardless of its source template.
      parentSlotLabel: slot.parentSlotLabel,
      // EWO-019B: presentation-only system grouping (e.g. "Weapons",
      // "Quantum Drive") for an otherwise-independent top-level port —
      // see FactoryHardpointTemplate.groupLabel / Hardpoint.groupLabel.
      groupLabel: slot.groupLabel,
      assemblyRole: slot.assemblyRole,
      sourcePortId: slot.sourcePortId,
      // EWO-043 — a freshly materialized Factory row's target is always
      // the current factory item by construction (see above); it has no
      // Commander-chosen intent to protect, so it always follows Factory.
      targetMode: 'FOLLOW_FACTORY',
    }
  })

  // EWO-020 (Task 4/13): structural rows never count toward readiness —
  // they have no configurable component, so including them would either
  // silently inflate readiness (counted as trivially "OK") or misreport
  // a physically-fine ship as incomplete. Only real, configurable rows
  // enter the denominator, same as before this mission for every ship
  // that has no structural rows at all.
  const configurableHardpoints = hardpoints.filter((h) => !h.isStructural)
  const missing = configurableHardpoints.filter((h) => h.status === 'Missing' || h.status === 'Upgrade Available').map((h) => h.targetItem)
  const okCount = configurableHardpoints.filter((h) => h.status === 'OK').length
  const readiness = configurableHardpoints.length > 0 ? Math.round((okCount / configurableHardpoints.length) * 100) : 100

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
    // EWO-021A: the canonical registry (src/data/shipImageRegistry.ts)
    // takes precedence over whatever image the ShipDefinition already
    // carries — this is the single materialization chokepoint every
    // Fleet Dashboard/Mission Control/Ship Detail card already flows
    // through, so no consumer needs its own resolution logic.
    imageUrl: resolveShipImage(definition),
    lastUpdated: 'Just now',
  }

  return { asset, ship, build, hardpoints }
}
