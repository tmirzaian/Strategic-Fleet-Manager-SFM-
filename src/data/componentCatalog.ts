import { isCompatible } from '../engine/compatibility'
import type { Component, CompatibilityRule } from '../engine/types'
import { catalogComponentsByName } from '../generated/componentCatalog'

/**
 * Demo component catalog — category + size for the named items that
 * appear in seed hardpoint data, so target items can be validated against
 * their Port's size/type constraints using the real compatibility engine
 * (src/engine/compatibility), not a one-off ad hoc check.
 *
 * This is deliberately a small hand-authored table, not real CIG data —
 * there is no importer yet (see docs/DATA_ENGINE.md). An item that isn't
 * listed here is treated as "unknown, assume compatible" rather than
 * invalid; we only want to flag a target as INVALID TARGET when we can
 * positively confirm a mismatch, not whenever data happens to be missing.
 */
interface CatalogEntry {
  category: string
  size: number
  // EWO-STAB-003B — present only when resolution came from the generated
  // catalog (src/generated/componentCatalog.ts), never from the
  // hand-authored CATALOG table below, which predates entity-class
  // tracking and was never retrofitted with one. Reflects data that was
  // already being returned here; this widens the type to expose it, it
  // does not change what resolveCatalogEntry returns.
  entityClass?: string
}

const CATALOG: Record<string, CatalogEntry> = {
  // Quantum Drives — the sprint's explicit example: Atlas is an S1 drive.
  Atlas: { category: 'Quantum Drive', size: 1 },

  // Power Plants
  Slipstream: { category: 'Power Plant', size: 1 },

  // Shields
  Mirage: { category: 'Shield', size: 1 },
  'FR-66': { category: 'Shield', size: 1 },
  Debilitator: { category: 'Shield', size: 1 },
  'Shield Array': { category: 'Shield', size: 2 },
  // FR-86 is an S3 Shield, not a Missile Rack — Alpha 2.4 Part 10 fix
  // (it was previously miscategorized here, which would have produced an
  // incorrect INVALID TARGET result against any real S3 Shield port).
  'FR-86': { category: 'Shield', size: 3 },

  // Coolers
  Snowblind: { category: 'Cooler', size: 1 },
  'CoolCore II': { category: 'Cooler', size: 1 },
  Blizzard: { category: 'Cooler', size: 2 },
  'Military Cooler': { category: 'Cooler', size: 2 },

  // Weapons
  'Mass Driver': { category: 'Weapon', size: 4 },
  Revenant: { category: 'Weapon', size: 4 },
  // Turret child weapons (Alpha 2.5C port-tree fixtures)
  'Turret Repeater': { category: 'Weapon', size: 3 },

  // Mining
  'Helix II': { category: 'Mining Laser', size: 2 },
  'Rieger-C3': { category: 'Mining Module', size: 1 },
  'Arbor MH1': { category: 'Mining Laser', size: 1 },

  // Utility / Cargo / Salvage / Missiles
  'Tractor Beam': { category: 'Utility', size: 2 },
  'Salvage Head (RM Series)': { category: 'Salvage Module', size: 2 },

  // EWO-023 (Task 6 follow-on) — these two display names are not unique
  // across the Mission M-012 bulk catalog (generated-data/component-metadata-catalog.json):
  // multiple real entity classes at different sizes share the same
  // resolved name, and catalogComponentsByName's "first entry wins"
  // dedup can pick a differently-sized variant than the one actually
  // installed on a given ship. Overridden here with the category/size of
  // the entity class genuinely installed on the real ship that carries
  // it (confirmed against generated-data/components.json), the same
  // pattern already established above for FR-86.
  'Revenant Gatling': { category: 'Weapon', size: 4 }, // Avenger Titan's nose gun — APAR_BallisticGatling_S4
  'MSD-313 Missile Rack': { category: 'Missile Rack', size: 3 }, // Gladius's inner wing racks — MRCK_S03_BEHR_Single_S03

  // MWO-001 (Task 4/5) — the same "first entry wins" bulk-catalog dedup
  // gap, newly exercised at scale by the 4.9 Golden Fleet promotion (250
  // additional deep-imported hulls). Each entry below is the category/size
  // genuinely installed on the real ship(s) that carry it (confirmed by
  // direct compatibility audit against every deep-imported ship's own
  // Factory Loadout, generated-data/ships.json).
  'MSD-683 Missile Rack': { category: 'Missile Rack', size: 7 }, // Asgard's torpedo racks
  'Anvil F7C-M Mk II Missile Rack': { category: 'Gimbal Mount', size: 4 }, // Hornet F7CM Mk2's own remote-turret hardware
  'Tarantula GT-870 Mark 3 Cannon': { category: 'Weapon', size: 3 }, // Hornet F7C Wildfire / Lightning F8C's nose gun
  // category 'Mining' (not 'Mining Laser') — same equipmentGroup
  // fallthrough as Salvage above, confirmed against every real
  // deep-imported mining ship's own port data.
  'Arbor MH2 Mining Laser': { category: 'Mining', size: 2 }, // MOLE's mining heads
  'Pitman Mining Laser': { category: 'Mining', size: 1 }, // Golem's mining head
  'Arbor MHV Mining Laser': { category: 'Mining', size: 0 }, // ROC's mining head
  'Arbor MH1 Mining Laser': { category: 'Mining', size: 1 }, // Prospector's mining head (distinct display name from the pre-existing bare "Arbor MH1" entry above)
  'Reliant Tana Missile Launcher': { category: 'Missile Rack', size: 5 }, // Reliant Tana's own launcher hardware
  'MSD-616 Missile Rack': { category: 'Gimbal Mount', size: 4 }, // Starlancer TAC's own remote-turret hardware
  'RSI Polaris Torpedo Rack': { category: 'Missile Rack', size: 10 }, // Polaris's torpedo bays
  'RSI Polaris Remote Turret Missile Rack': { category: 'Gimbal Mount', size: 4 }, // Polaris's own remote-turret hardware
  // category 'Salvage' (not 'Salvage Module') — a Salvage port's
  // compatibilityTypeFor has no specific translation case, so it falls
  // through to the raw equipmentGroup string ("Salvage"), confirmed
  // against every real deep-imported salvage ship's own port data.
  'Salvation Salvage Head': { category: 'Salvage', size: 2 }, // Salvation's salvage heads
  'Baler Salvage Head': { category: 'Salvage', size: 2 }, // Reclaimer/MOTH/Vulture/Fortune's salvage heads
  // "Missile Rack" (bare, no brand) is a genuine in-fiction factory item
  // name for L22 AlphaWolf, not a placeholder.
  'Missile Rack': { category: 'Missile Rack', size: 2 }, // L22 AlphaWolf's own rack
  // "MSD-543 Missile Rack" cannot be safely resolved with a single entry
  // at all: it is a real, distinct S1 unit on the 325a, a real, distinct S4
  // unit on the Starlancer Max/TAC family, and a real, distinct S5 unit on
  // every other ship that carries it (Hammerhead, Tiburon, Starfighter
  // Inferno/Ion, 600i family, 890Jump) — three genuinely different real
  // components sharing one display name, not a dedup mistake. Sized here
  // for the largest group (S5); every other size's own rows are the
  // documented, narrow exceptions src/data/__tests__/shipDefinitions.test.ts
  // allow-lists rather than guessing a single size that would misclassify
  // the others. Resolving this precisely would require resolving
  // components by entity-class id instead of display name — out of this
  // mission's scope ("no redesign").
  'MSD-543 Missile Rack': { category: 'Missile Rack', size: 5 },
}

/**
 * Parses a Hardpoint's `size` field (e.g. "S2") into the numeric size the
 * compatibility engine and catalog use (e.g. 2). Falls back to NaN for a
 * malformed value, which will simply never match — treated as "unknown".
 */
function parsePortSize(size: string): number {
  const match = /(\d+)/.exec(size)
  return match ? Number(match[1]) : NaN
}

export interface TargetValidation {
  valid: boolean
  message?: string
}

/**
 * The one shared catalog lookup — hand-authored demo table first
 * (preserves existing, already-tested behavior for the seed fleet's known
 * items), then the full authoritative component catalog (Mission M-012 —
 * see src/generated/componentCatalog.ts). Both `validateTargetCompatibility`
 * (below) and the Loadout Manager's Target picker filtering
 * (EWO-024, Task 2) resolve a component's category/size through this exact
 * function, so "what's shown as selectable" and "what validates" can never
 * silently disagree with each other.
 */
function resolveCatalogEntry(item: string): CatalogEntry | undefined {
  return CATALOG[item] ?? catalogComponentsByName.get(item)
}

/**
 * EWO-STAB-003B — a public entry point onto the exact same resolution
 * chain `validateTargetCompatibility`/`isComponentSelectableForPort`
 * already use, for src/engine/installation/componentIdentityService.ts.
 * No new lookup, no new rule — this only exposes what was already being
 * computed here so the installation engine can resolve identity through
 * the one existing catalog, rather than re-deriving its own.
 */
export function resolveComponentCatalogEntry(item: string): CatalogEntry | undefined {
  return resolveCatalogEntry(item)
}

function checkCompatibility(entry: CatalogEntry, portType: string, portSize: string): boolean {
  const size = parsePortSize(portSize)
  if (Number.isNaN(size)) return true

  const component: Component = {
    id: '',
    internalName: '',
    displayName: '',
    manufacturer: '',
    category: entry.category,
    subtype: '',
    size: entry.size,
    grade: '',
    class: '',
    tags: [],
  }
  const rule: CompatibilityRule = {
    allowedTypes: [portType],
    allowedSubtypes: [],
    minSize: size,
    maxSize: size,
  }
  return isCompatible(component, rule)
}

/**
 * Validates a hardpoint's targetItem against its Port's type/size, via the
 * real compatibility engine (isCompatible). Only returns `valid: false`
 * when the item is in the catalog AND its category/size positively
 * conflicts with the port — an uncataloged item is always treated as
 * valid, since we can't disprove compatibility we have no data for.
 */
export function validateTargetCompatibility(targetItem: string | null | undefined, portType: string, portSize: string): TargetValidation {
  const item = (targetItem ?? '').trim()
  if (!item || item === '—') return { valid: true }

  const entry = resolveCatalogEntry(item)
  if (!entry) return { valid: true }

  if (checkCompatibility(entry, portType, portSize)) return { valid: true }

  return {
    valid: false,
    message: `${item} is not compatible with this ${portSize} ${portType} port.`,
  }
}

/**
 * EWO-024 (Task 2) — "the Commander should not be able to choose obviously
 * incompatible equipment through normal UI interaction." Used to filter
 * the Target picker's suggestion list down to components that are not
 * POSITIVELY known to be incompatible with a given port — an uncataloged
 * component is still shown (same "never disprove compatibility we have no
 * data for" philosophy `validateTargetCompatibility` already applies), so
 * this never hides a legitimate but uncataloged choice. Free-text entry
 * and full compatibility re-validation both remain unchanged — this only
 * narrows what's SUGGESTED, never what CAN be typed or saved.
 */
export function isComponentSelectableForPort(item: string, portType: string, portSize: string): boolean {
  const entry = resolveCatalogEntry(item)
  if (!entry) return true
  return checkCompatibility(entry, portType, portSize)
}
