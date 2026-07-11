import type { ShipDefinition } from '../types'
import { ships as seedShips, hardpoints as seedHardpoints } from './seed'
import { importedShipList } from '../generated/importedShips'
import { classificationFor } from './shipClassification'

/**
 * A minimal, ship-model-agnostic factory hardpoint template — every new
 * FleetAsset for a given ShipDefinition starts by cloning this list, with
 * installed/target initialized to match factory (see
 * src/utils/fleetAssetMaterializer.ts). This is deliberately NOT the same
 * as any one existing ship's *current* (possibly player-customized)
 * hardpoint state — a brand new copy of a Ghost should start factory-fresh,
 * not with another Ghost's Mirage already installed.
 */
export interface FactoryHardpointTemplate {
  slotLabel: string
  type: string
  size: string
  factoryItem: string
}

const seedDefinitions: ShipDefinition[] = seedShips.map((s) => ({
  id: s.id,
  internalName: s.id,
  displayName: s.name,
  manufacturer: s.manufacturer,
  classification: classificationFor(s.id),
  career: s.career,
  role: s.role,
  imageUrl: s.imageUrl,
  equipmentGroups: [],
  portIds: [],
  factoryLoadoutId: `${s.id}-factory-loadout`,
  sourceMetadata: { sourceType: 'seed' },
}))

const importedDefinitions: ShipDefinition[] = importedShipList.map((v) => ({
  id: v.ship.id,
  internalName: v.ship.id,
  displayName: v.ship.name,
  manufacturer: v.ship.manufacturer,
  classification: classificationFor(v.ship.id),
  career: v.ship.career,
  role: v.ship.role,
  imageUrl: v.ship.imageUrl,
  image: v.imageManifestEntry ? { primaryUrl: v.imageManifestEntry.primaryUrl ?? undefined, source: v.imageManifestEntry.source, status: v.imageManifestEntry.status } : undefined,
  equipmentGroups: Array.from(new Set(v.ports.map((p) => p.equipmentGroup))),
  portIds: v.ports.map((p) => p.id),
  factoryLoadoutId: v.factoryLoadout?.id ?? `${v.ship.id}-factory-loadout`,
  sourceMetadata: { sourceType: 'StarBreaker', sourceFile: undefined },
}))

/** Every ship model available to "Add Ship" — the seed fleet's models
 * plus every imported ship definition, sorted alphabetically. */
export const shipDefinitions: ShipDefinition[] = [...seedDefinitions, ...importedDefinitions].sort((a, b) => a.displayName.localeCompare(b.displayName))

export const shipDefinitionById: Map<string, ShipDefinition> = new Map(shipDefinitions.map((d) => [d.id, d]))

function seedFactoryTemplate(shipId: string): FactoryHardpointTemplate[] {
  const ship = seedShips.find((s) => s.id === shipId)
  if (!ship) return []
  return seedHardpoints
    .filter((h) => h.buildId === ship.activeBuildId)
    .map((h) => ({ slotLabel: h.slotLabel, type: h.type, size: h.size, factoryItem: h.factoryItem }))
}

function importedFactoryTemplate(shipId: string): FactoryHardpointTemplate[] {
  const view = importedShipList.find((v) => v.ship.id === shipId)
  if (!view) return []
  return view.equipmentAssignments.map((a) => {
    const factoryComponentId = a.mountItemId ?? a.resolvedItemId
    const factoryItem = factoryComponentId ? view.componentById.get(factoryComponentId)?.displayName ?? 'Unknown Factory Item' : '—'
    return {
      slotLabel: a.displayName,
      type: a.equipmentGroup,
      size: a.minSize !== null ? `S${a.minSize}` : 'S1',
      factoryItem,
    }
  })
}

/** Factory hardpoint template per ShipDefinition id — see FactoryHardpointTemplate. */
export const shipFactoryTemplates: Record<string, FactoryHardpointTemplate[]> = Object.fromEntries(
  shipDefinitions.map((d) => [d.id, d.sourceMetadata.sourceType === 'seed' ? seedFactoryTemplate(d.id) : importedFactoryTemplate(d.id)])
)
