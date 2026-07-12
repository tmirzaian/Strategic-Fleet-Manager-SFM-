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
  /** When set, this row is a child of the row in the same template whose
   * slotLabel matches this value (Mission M-011) — mirrors
   * Hardpoint.parentSlotLabel so nested mount/turret/rack structure
   * survives from a ShipDefinition's template all the way through
   * materializeFleetAsset into real Hardpoint rows. See
   * src/utils/portTree.ts for the generic tree-building logic that reads
   * this on the materialized side. */
  parentSlotLabel?: string
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
    .map((h) => ({ slotLabel: h.slotLabel, type: h.type, size: h.size, factoryItem: h.factoryItem, parentSlotLabel: h.parentSlotLabel }))
}

/**
 * Builds one template row per authoritative normalized Port — every
 * physical port from the normalized pipeline (`view.ports`), not the
 * collapsed one-row-per-mount `equipmentAssignments` view (Mission
 * M-011). Using the collapsed view here was the root cause of Loadout
 * Manager never being able to target a mount's child weapon/missile/
 * jump-drive slots at all: a materialized FleetAsset's hardpoints came
 * from `equipmentAssignments` alone, so the underlying child ports never
 * existed as their own rows once a Fleet Asset was created from this
 * template.
 *
 * The existing `Hardpoint`/`buildPortTree` mechanism (Alpha 2.5C) links
 * parent->child purely by matching `parentSlotLabel` against the
 * parent's own `slotLabel` string — there is no ID-based link. Real
 * normalized port `displayName`s are NOT unique across different parents
 * (confirmed directly against the generated catalog: every Gladius
 * weapon mount's child gun port is literally named "Class 2", and every
 * missile rack's first child is "01 Attach Missile") — joining on the
 * raw displayName would silently merge unrelated subtrees the moment any
 * of them gained their own children. Each port's template `slotLabel` is
 * therefore built top-down as `<parent's already-unique label> — <this
 * port's displayName>`, which is unique by construction (top-level
 * labels are the ship's own distinct hardpoint names) without inventing
 * or guessing anything — every segment is still a real, authoritative
 * displayName, just disambiguated by real tree position rather than
 * joined on a colliding raw string. `Hardpoint.id`/`Port.id` (the
 * genuinely stable canonical id) is preserved unchanged as the row's own
 * `id` in `materializeFleetAsset` regardless of this label.
 */
function importedFactoryTemplate(shipId: string): FactoryHardpointTemplate[] {
  const view = importedShipList.find((v) => v.ship.id === shipId)
  if (!view) return []

  const ports = view.ports
  const componentById = view.componentById
  type PortT = (typeof ports)[number]

  const childrenByParentId = new Map<string | null, PortT[]>()
  for (const p of ports) {
    const key = p.parentPortId ?? null
    if (!childrenByParentId.has(key)) childrenByParentId.set(key, [])
    childrenByParentId.get(key)!.push(p)
  }

  const factoryItemFor = (p: PortT) => (p.factoryItemId ? componentById.get(p.factoryItemId)?.displayName ?? 'Unknown Factory Item' : '—')

  const rows: FactoryHardpointTemplate[] = []
  function walk(port: PortT, uniqueParentLabel: string | undefined) {
    const uniqueLabel = uniqueParentLabel ? `${uniqueParentLabel} — ${port.displayName}` : port.displayName
    rows.push({
      slotLabel: uniqueLabel,
      type: port.equipmentGroup,
      size: port.minSize !== null ? `S${port.minSize}` : 'S1',
      factoryItem: factoryItemFor(port),
      parentSlotLabel: uniqueParentLabel,
    })
    for (const child of childrenByParentId.get(port.id) ?? []) {
      walk(child, uniqueLabel)
    }
  }
  for (const top of childrenByParentId.get(null) ?? []) {
    walk(top, undefined)
  }

  return rows
}

/** Factory hardpoint template per ShipDefinition id — see FactoryHardpointTemplate. */
export const shipFactoryTemplates: Record<string, FactoryHardpointTemplate[]> = Object.fromEntries(
  shipDefinitions.map((d) => [d.id, d.sourceMetadata.sourceType === 'seed' ? seedFactoryTemplate(d.id) : importedFactoryTemplate(d.id)])
)
