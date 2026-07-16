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
