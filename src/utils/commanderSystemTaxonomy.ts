import type { Hardpoint } from '../types'

/**
 * SW-007C — Commander Taxonomy Authority.
 *
 * Every Commander-facing ship presentation (Ship Detail's Loadout Tree,
 * Ship Workspace's Systems Workspace, and any future one) must describe a
 * FleetAsset's ports using the exact same top-level categories, the same
 * category order, the same display labels, and the same child-ordering
 * rules — "one taxonomy, multiple workspaces, one Commander." This module
 * is that one place; nothing else in the app may define its own competing
 * category list or classification table.
 *
 * `TOP_LEVEL_GROUP_ORDER` and `intraGroupChildPriority` are consumed by
 * `src/utils/portTreeGrouping.ts`'s `groupPortTree()` — the actual
 * grouping/ordering engine both Ship Detail's LoadoutPortTree and Ship
 * Workspace's Systems Workspace call directly. `groupPortTree()` keys
 * every port off `Hardpoint.groupLabel`, the real, already-computed
 * top-level bucket (`topLevelGroupLabel()` in `src/data/shipDefinitions.ts`)
 * every canonically-constructed Hardpoint carries. A Hardpoint with no
 * `groupLabel` at all (Avionics/Cargo/Defense/Customization-classified
 * ports, or the two deliberately-unconverted regression fixtures, M80 and
 * Starlite — see SW-006) renders ungrouped rather than being forced into
 * an approximate bucket; that is the correct, shared behavior. Only Ship
 * Workspace additionally applies `legacyPortGroupLabel` below as a
 * presentation-layer choice (SW-007C Objective 3: "Ship Workspace remains
 * free to present information differently") to still offer a category
 * header for that groupLabel-less data rather than an orphan row — the
 * bucket it resolves into is always one of this module's own canonical
 * labels, never a workspace-invented one.
 */

/** The Chief-Architect-approved fixed display order for top-level system
 * categories (originally EWO-020 Task 10, realigned by SW-007A to the
 * Commander's in-game mental model). Moved here from
 * `src/data/shipDefinitions.ts` by SW-007C so the ordering itself lives in
 * exactly one place — `topLevelGroupLabel()` still owns the (import-
 * pipeline-specific) equipmentGroup -> label mapping, but never the order. */
export const TOP_LEVEL_GROUP_ORDER: string[] = [
  'Core Components',
  'Detection / Navigation',
  'Missile Racks',
  'Pilot Weapons',
  'Manned Turrets',
  'Remote Turrets',
  'Utility',
  'Support Systems',
]

/**
 * SW-007A — within two specific top-level categories, the Chief-Architect-
 * approved in-game loadout sequence orders *siblings*, not just categories:
 * Core Components reads Coolers, Power Plant, Quantum Drive, Shields; Utility
 * reads Mining, Salvage, Tractor Systems. Keyed on each port's own
 * `Hardpoint.type` string (the only per-port field that survives into
 * display and still distinguishes these siblings — `equipmentGroup` itself
 * is never carried past normalization). `'QuantumDrive'` (no space) is a
 * real, audited second form of the Quantum Drive type string, produced for
 * a handful of ships whose only top-level drive port is a structural
 * docking-tube wrapper (Caterpillar/Ironclad) rather than the ordinary
 * `assemblyRole`-driven `'Quantum Drive'` string every other ship gets —
 * both must rank identically here. Every other category's siblings keep
 * their original relative order (no priority list requested for them).
 */
const CORE_COMPONENT_CHILD_ORDER: Record<string, number> = {
  Cooler: 0,
  'Power Plant': 1,
  'Quantum Drive': 2,
  QuantumDrive: 2,
  Shield: 3,
}

function utilityChildPriority(type: string): number {
  if (type.includes('Mining')) return 0
  if (type.includes('Salvage')) return 1
  return 2 // Tractor Systems, or a genuinely generic Utility port (indistinguishable today).
}

/** Per-top-level-group sibling priority, consumed by `groupPortTree()` to
 * sort a group's direct children; a group not listed here keeps its
 * children in their original relative order (no approved sibling order
 * exists for it). */
export const INTRA_GROUP_CHILD_PRIORITY: Record<string, (type: string) => number> = {
  'Core Components': (type) => CORE_COMPONENT_CHILD_ORDER[type] ?? Infinity,
  Utility: utilityChildPriority,
}

type ClassifiableHardpoint = Pick<Hardpoint, 'type'> & { assemblyRole?: string }

/**
 * The narrow legacy-type-string fallback — used ONLY by a caller
 * classifying a Hardpoint that carries no real `groupLabel` at all (today,
 * exclusively M80 and Starlite's deliberately-unconverted CUSTOM builds;
 * see SW-006). Resolves to one of this module's own canonical
 * `TOP_LEVEL_GROUP_ORDER` labels, never an invented category, so a
 * groupLabel-less port still lands in the exact bucket it WOULD have if
 * it carried the real canonical signal. Ship Detail's own LoadoutPortTree
 * never calls this — it leaves a groupLabel-less port ungrouped by design
 * (`groupPortTree()`'s own documented behavior); this exists only for
 * Ship Workspace's presentation choice to still offer a category header
 * for that data (SW-007C Objective 3).
 */
export function legacyPortGroupLabel(hp: ClassifiableHardpoint): string {
  if (hp.assemblyRole === 'MANNED_TURRET') return 'Manned Turrets'
  if (hp.assemblyRole === 'REMOTE_TURRET') return 'Remote Turrets'

  switch (hp.type) {
    case 'Power Plant':
    case 'Cooler':
    case 'Shield':
    case 'Quantum Drive':
    case 'QuantumDrive':
    case 'Jump Drive':
    case 'Life Support':
      return 'Core Components'

    case 'Radar':
    case 'Avionics':
      return 'Detection / Navigation'

    case 'Missile':
    case 'Missile Rack':
    case 'Missiles':
      return 'Missile Racks'
    case 'Weapon':
    case 'Weapons':
    case 'Gimbal Mount':
      return 'Pilot Weapons'
    case 'Turret Mount':
      return 'Manned Turrets'

    case 'Mining Laser':
    case 'Mining':
    case 'Mining Mount':
    case 'Mining Module':
    case 'Salvage Modifier':
    case 'Salvage Module':
    case 'Salvage':
    case 'Utility':
      return 'Utility'

    case 'Relay':
    case 'Relays':
      return 'Support Systems'

    default:
      // Fail SAFE, never fail SILENT — an unrecognized type (Cargo,
      // Customization, or any future port type this table hasn't seen
      // yet) still renders under a real category rather than vanishing
      // from Ship Workspace's presentation-layer grouping.
      return 'Support Systems'
  }
}
