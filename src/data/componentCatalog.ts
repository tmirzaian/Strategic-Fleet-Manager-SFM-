import { isCompatible } from '../engine/compatibility'
import type { Component, CompatibilityRule } from '../engine/types'

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
 * Validates a hardpoint's targetItem against its Port's type/size, via the
 * real compatibility engine (isCompatible). Only returns `valid: false`
 * when the item is in the catalog AND its category/size positively
 * conflicts with the port — an uncataloged item is always treated as
 * valid, since we can't disprove compatibility we have no data for.
 */
export function validateTargetCompatibility(targetItem: string | null | undefined, portType: string, portSize: string): TargetValidation {
  const item = (targetItem ?? '').trim()
  if (!item || item === '—') return { valid: true }

  const entry = CATALOG[item]
  if (!entry) return { valid: true }

  const size = parsePortSize(portSize)
  if (Number.isNaN(size)) return { valid: true }

  const component: Component = {
    id: item,
    internalName: item,
    displayName: item,
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

  if (isCompatible(component, rule)) return { valid: true }

  return {
    valid: false,
    message: `${item} is not compatible with this ${portSize} ${portType} port.`,
  }
}
