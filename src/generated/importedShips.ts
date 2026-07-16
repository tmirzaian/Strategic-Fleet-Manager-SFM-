import type { Ship, Port, Component, FactoryLoadout, InstalledLoadout, TargetBuild, DisplayNameMap, ResolvedEquipmentAssignment } from '../engine/types'
import shipsJson from '../../generated-data/ships.json'
import portsJson from '../../generated-data/ports.json'
import componentsJson from '../../generated-data/components.json'
import factoryLoadoutsJson from '../../generated-data/factory-loadouts.json'
import installedLoadoutsJson from '../../generated-data/installed-loadouts.json'
import targetBuildsJson from '../../generated-data/target-builds.json'
import displayNameMapJson from '../../generated-data/display-name-map.json'
import equipmentAssignmentsJson from '../../generated-data/equipment-assignments.json'
import shipImagesJson from '../../generated-data/ship-images.json'
import importReportJson from '../../generated-data/import-report.json'
import type { ShipImageManifestEntry } from '../normalizer/shipImageManifest'

/**
 * Browser-side loader for the generalized import pipeline's output.
 *
 * Deliberately does NOT run StarBreakerImporter/ShipNormalizer live in the
 * browser (the earlier Gladius proof-of-concept did) — "the React dev
 * server must not be required to run the importer" means generated-data
 * is produced offline by `npm run import:ships` (scripts/importShips.ts)
 * and simply read back here via a static Vite JSON import, same trick the
 * proof-of-concept used for its raw-data read, now pointed at real
 * pipeline output instead.
 *
 * If generated-data hasn't been produced yet, `npm run import:ships`
 * needs to run first — see docs/DATA_ENGINE.md.
 */

const ships = shipsJson as Ship[]
const ports = portsJson as Port[]
const components = componentsJson as Component[]
const factoryLoadouts = factoryLoadoutsJson as FactoryLoadout[]
const installedLoadouts = installedLoadoutsJson as InstalledLoadout[]
const targetBuilds = targetBuildsJson as TargetBuild[]
const equipmentAssignments = equipmentAssignmentsJson as ResolvedEquipmentAssignment[]
const shipImages = shipImagesJson as ShipImageManifestEntry[]
export const displayNameMap = displayNameMapJson as DisplayNameMap
export const importReport = importReportJson

export interface ImportedShipView {
  ship: Ship
  ports: Port[]
  flatPorts: Port[] // kept for API parity with the old gladius.ts loader; ports are already flat now
  components: Component[]
  componentById: Map<string, Component>
  factoryLoadout: FactoryLoadout | undefined
  installedLoadout: InstalledLoadout | undefined
  targetBuild: TargetBuild | undefined
  rawInternalNames: string[]
  /** Collapsed, user-facing rows — gimbal-mounted weapons and missile
   * racks resolved to one row each. This is what Ship Detail renders. */
  equipmentAssignments: ResolvedEquipmentAssignment[]
  /** This ship's entry from generated-data/ship-images.json, if any — lets
   * the UI know a ship is on fallback artwork from metadata (source/status)
   * rather than ever inspecting the resolved URL as text. */
  imageManifestEntry: ShipImageManifestEntry | undefined
}

function buildView(ship: Ship): ImportedShipView {
  const shipPorts = ports.filter((p) => p.shipId === ship.id)
  const usedComponentIds = new Set(shipPorts.map((p) => p.factoryItemId).filter((id): id is string => Boolean(id)))
  const shipComponents = components.filter((c) => usedComponentIds.has(c.id))
  return {
    ship,
    ports: shipPorts,
    flatPorts: shipPorts,
    components: shipComponents,
    componentById: new Map(shipComponents.map((c) => [c.id, c])),
    factoryLoadout: factoryLoadouts.find((f) => f.shipId === ship.id),
    installedLoadout: installedLoadouts.find((l) => l.shipId === ship.id),
    targetBuild: targetBuilds.find((t) => t.shipId === ship.id),
    rawInternalNames: shipPorts.map((p) => p.internalName),
    equipmentAssignments: equipmentAssignments.filter((a) => a.shipId === ship.id),
    imageManifestEntry: shipImages.find((e) => e.shipId === ship.id),
  }
}

/** Every imported ship currently available in generated-data, keyed by ship id. */
export const importedShips: Record<string, ImportedShipView> = Object.fromEntries(ships.map((s) => [s.id, buildView(s)]))

export const importedShipList: ImportedShipView[] = Object.values(importedShips)

/**
 * Global lookup from a resolved Component's own `displayName` back to the
 * full Component record (internalName, grade, class, manufacturer), across
 * every deep-imported ship. `factoryItemFor()`/`nameFor()` (src/data/shipDefinitions.ts,
 * src/pages/ShipDetail.tsx) copy `Component.displayName` verbatim into
 * `Hardpoint.factoryItem`/`installedItem`/`targetItem` — plain strings by
 * the time they reach a render site — so this is an exact, non-guessed
 * join key back to the record that produced that string (EWO-019A
 * component-presentation contract), not a reverse-engineered/heuristic one.
 * First entry for a given displayName wins, same determinism policy as
 * src/generated/componentCatalog.ts's catalogComponentsByName.
 */
export const componentByDisplayName: Map<string, Component> = new Map()
for (const c of components) {
  if (!componentByDisplayName.has(c.displayName)) componentByDisplayName.set(c.displayName, c)
}
