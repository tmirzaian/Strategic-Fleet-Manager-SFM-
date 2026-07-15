import type { PortTreeNode } from './portTree'
import type { Hardpoint } from '../types'
import { TOP_LEVEL_GROUP_ORDER } from '../data/shipDefinitions'

/**
 * EWO-019B/EWO-020 — a generic, presentation-only hierarchy layer built on
 * top of `buildPortTree()`'s already-correct port tree. Never special-cases
 * a system by name: any top-level `PortTreeNode` whose own hardpoint
 * carries a `groupLabel` (see Hardpoint.groupLabel) is nested under a
 * synthetic header node sharing that label, grouped with every sibling
 * top-level node carrying the same label. Nodes without a `groupLabel`
 * pass through unchanged, in their original relative position — a system
 * this mission's `topLevelGroupLabel()` doesn't recognize (Avionics,
 * Cargo, Defense, Customization today) stays visible and stable rather
 * than being forced into an approximate bucket (Task 10).
 *
 * Reusable anywhere a `PortTreeNode[]` is rendered — Ship Detail's
 * LoadoutPortTree and MissionComposer's Target Equipment table both
 * consume this same function, so a future system (Mining Heads, Salvage
 * Heads, Tractor Beam Mounts, ...) only needs a `groupLabel` at the data
 * layer, never a new renderer (Task 9).
 */
export type PortTreeDisplayNode<T = Hardpoint> =
  | { kind: 'port'; id: string; node: PortTreeNode<T> }
  | { kind: 'group'; id: string; label: string; children: PortTreeDisplayNode<T>[] }

function toPortNode<T extends { id: string }>(node: PortTreeNode<T>): PortTreeDisplayNode<T> {
  return { kind: 'port', id: node.hardpoint.id, node }
}

export function groupPortTree<T extends { id: string; groupLabel?: string }>(nodes: PortTreeNode<T>[]): PortTreeDisplayNode<T>[] {
  const result: PortTreeDisplayNode<T>[] = []
  const groupIndexByLabel = new Map<string, number>()

  for (const node of nodes) {
    const label = node.hardpoint.groupLabel
    if (!label) {
      result.push(toPortNode(node))
      continue
    }

    const existingIndex = groupIndexByLabel.get(label)
    if (existingIndex !== undefined) {
      const group = result[existingIndex]
      if (group.kind === 'group') group.children.push(toPortNode(node))
      continue
    }

    groupIndexByLabel.set(label, result.length)
    result.push({
      kind: 'group',
      id: `group-${label}-${node.hardpoint.id}`,
      label,
      children: [toPortNode(node)],
    })
  }

  // EWO-020 (Task 10): a fixed, player-oriented order for recognized
  // top-level categories — a stable sort, so anything not in
  // TOP_LEVEL_GROUP_ORDER (an ungrouped port, or a group label this
  // mission doesn't define) keeps its original relative position rather
  // than being reordered unpredictably.
  const rank = (node: PortTreeDisplayNode<T>): number => {
    if (node.kind !== 'group') return Infinity
    const index = TOP_LEVEL_GROUP_ORDER.indexOf(node.label)
    return index === -1 ? Infinity : index
  }
  return result
    .map((node, index) => ({ node, index }))
    .sort((a, b) => rank(a.node) - rank(b.node) || a.index - b.index)
    .map(({ node }) => node)
}

/** Every node id in display order, depth-first — group headers included —
 * for "Expand All" (mirrors flattenPortTree's role for the ungrouped tree). */
export function flattenDisplayTree<T extends { id: string }>(nodes: PortTreeDisplayNode<T>[]): PortTreeDisplayNode<T>[] {
  return nodes.flatMap((node) => flattenDisplayNode(node))
}

function flattenDisplayNode<T extends { id: string }>(node: PortTreeDisplayNode<T>): PortTreeDisplayNode<T>[] {
  if (node.kind === 'group') {
    return [node, ...node.children.flatMap((child) => flattenDisplayNode(child))]
  }
  const childNodes = node.node.children.map((child) => toPortNode(child))
  return [node, ...childNodes.flatMap((child) => flattenDisplayNode(child))]
}
