import type { Hardpoint, MissionReservation, HangarItem, InstalledLoadoutEntry } from '../types'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { findActiveSlotReservation } from '../engine/logistics/reservationLookup'

export interface PortTreeNode<T = Hardpoint> {
  hardpoint: T
  children: PortTreeNode<T>[]
}

/**
 * Builds the complete normalized port hierarchy from a flat row array
 * (Alpha 2.5C) — purely structural, driven entirely by `parentSlotLabel`
 * links. Works identically for every ship; there is no per-ship branching
 * here. A row with no `parentSlotLabel` is a top-level physical port;
 * every top-level port is always included, regardless of how many (or how
 * few) children it has.
 *
 * Generic over the row shape (EWO-025) — Ship Detail still calls this with
 * real `Hardpoint[]`, unchanged; MissionComposer's Loadout Manager instead
 * calls it with `LoadoutEditorRow[]` (see `utils/loadoutEditorModel.ts`) so
 * CREATE and EDIT both build hierarchy from the canonical ship template
 * rather than a saved Build's own (possibly hierarchy-stripped) rows. One
 * tree-construction implementation either way (Design Authority Ruling 4).
 */
export function buildPortTree<T extends { slotLabel: string; parentSlotLabel?: string }>(hardpoints: T[]): PortTreeNode<T>[] {
  const byParent = new Map<string | undefined, T[]>()
  for (const hp of hardpoints) {
    const key = hp.parentSlotLabel
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(hp)
  }

  function buildChildren(parentSlotLabel: string | undefined): PortTreeNode<T>[] {
    const rows = byParent.get(parentSlotLabel) ?? []
    return rows.map((hardpoint) => ({ hardpoint, children: buildChildren(hardpoint.slotLabel) }))
  }

  return buildChildren(undefined)
}

/** Flattens a tree back into every node it contains, depth-first — used
 * for "Expand All" (collect every node id) and counting descendants. */
export function flattenPortTree<T>(nodes: PortTreeNode<T>[]): PortTreeNode<T>[] {
  const result: PortTreeNode<T>[] = []
  for (const node of nodes) {
    result.push(node)
    result.push(...flattenPortTree(node.children))
  }
  return result
}

export type PortLogisticsState = 'Installed' | 'Reserved' | 'Unreserved' | 'Missing' | 'Not Required'

/**
 * Per-row LOGISTICS column (Alpha 2.5C, Part 7) — distinct from
 * HardpointStatus (Installed-vs-Target only); this adds the
 * ownership/commitment dimension the Quartermaster Logistics Engine
 * tracks (Alpha 2.3).
 */
export function derivePortLogistics(
  hp: Hardpoint,
  reservations: MissionReservation[],
  hangarItems: HangarItem[],
  installedLoadouts: InstalledLoadoutEntry[]
): PortLogisticsState {
  if (!hp.targetItem || hp.targetItem === '—') return 'Not Required'
  if (hp.status === 'OK') return 'Installed'

  const activeReservation = findActiveSlotReservation(reservations, {
    missionConfigurationId: hp.buildId,
    targetSlotLabel: hp.slotLabel,
    componentName: hp.targetItem,
    componentEntityClass: hp.targetEntityClass,
  })
  if (activeReservation) return 'Reserved'

  const availability = calculateComponentAvailability(hp.targetItem, hangarItems, installedLoadouts, reservations, hp.targetEntityClass)
  if (availability.availableQuantity > 0) return 'Unreserved'

  return 'Missing'
}

export type PortValidationState = 'OK' | 'Unresolved' | 'Invalid Target' | 'Missing Data'

/**
 * Per-row VALIDATION column — never renders "OK" for unresolved
 * placeholder equality (Part 13) or an incompatible target; both are
 * surfaced honestly instead of silently passing.
 */
export function derivePortValidation(hp: Hardpoint): PortValidationState {
  if (hp.status === 'Unresolved') return 'Unresolved'
  if (hp.status === 'Invalid Target') return 'Invalid Target'
  if (!hp.factoryItem) return 'Missing Data'
  return 'OK'
}
