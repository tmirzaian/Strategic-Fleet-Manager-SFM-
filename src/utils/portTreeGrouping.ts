import type { PortTreeNode } from './portTree'
import type { Hardpoint } from '../types'
import { TOP_LEVEL_GROUP_ORDER, INTRA_GROUP_CHILD_PRIORITY } from './commanderSystemTaxonomy'
import { deriveDestinationCapability } from '../data/componentCatalog'

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
 * FTB-001A (Workstreams A/B) — every 'port' node now ALSO carries its own
 * fully processed `children: PortTreeDisplayNode<T>[]` (PDC-subgrouped,
 * recursively, at every depth), alongside the original `node: PortTreeNode<T>`
 * field (left completely unchanged, still the raw structural tree) for
 * backward compatibility with every existing consumer that reads
 * `node.children` directly. The new `children` field is what rendering and
 * recursive expand/collapse should use going forward — it is the one place
 * PDC subgrouping is visible, at any nesting depth.
 *
 * Reusable anywhere a `PortTreeNode[]` is rendered — Ship Detail's
 * LoadoutPortTree and MissionComposer's Target Equipment table both
 * consume this same function, so a future system (Mining Heads, Salvage
 * Heads, Tractor Beam Mounts, ...) only needs a `groupLabel` at the data
 * layer, never a new renderer (Task 9).
 */
export type PortTreeDisplayNode<T = Hardpoint> =
  | { kind: 'port'; id: string; node: PortTreeNode<T>; children: PortTreeDisplayNode<T>[] }
  | { kind: 'group'; id: string; label: string; children: PortTreeDisplayNode<T>[] }

const PDC_GROUP_LABEL = 'Point Defense Cannons'

/**
 * FTB-001A (Workstream A) — a port is PDC-capable when its own
 * factory-installed component is a native PDC turret shell, per the exact
 * same canonical entityClass/subtype signal `checkCompatibility`'s PDC
 * rules already use (ADR-010/CAT-003) — never display-name matching
 * ("PDC Top 01" vs "Pdc Bottom 04" share no common substring worth
 * matching on), never a per-ship exception list. A ship with no
 * PDC-capable ports anywhere produces no "Point Defense Cannons" group at
 * all, exactly as before this mission.
 */
function isPdcCapable<T extends { factoryEntityClass?: string | null }>(hardpoint: T): boolean {
  return deriveDestinationCapability(hardpoint.factoryEntityClass) === 'PDC_TURRET'
}

function isPdcNode<T extends { factoryEntityClass?: string | null }>(node: PortTreeDisplayNode<T>): node is Extract<PortTreeDisplayNode<T>, { kind: 'port' }> {
  return node.kind === 'port' && isPdcCapable(node.node.hardpoint)
}

/**
 * FTB-001A (Workstream A) — extracts every PDC-capable sibling out of a
 * children list into one synthetic "Point Defense Cannons" subgroup,
 * leaving every other sibling (conventional turret mounts, weapons, etc.)
 * in its original relative position. Generic over tree depth — called for
 * every children list in the tree (top-level buckets and every nested
 * parent's own children), so a PDC port is grouped correctly regardless of
 * how many turret-assembly levels sit above it on a given ship. A children
 * list with no PDC-capable port is returned completely unchanged — no
 * group ever appears where there is nothing to group.
 */
function extractPdcSubgroup<T extends { id: string; factoryEntityClass?: string | null }>(children: PortTreeDisplayNode<T>[]): PortTreeDisplayNode<T>[] {
  const pdcNodes = children.filter(isPdcNode)
  if (pdcNodes.length === 0) return children
  const rest = children.filter((c) => !isPdcNode(c))
  return [...rest, { kind: 'group' as const, id: `group-pdc-${pdcNodes[0].id}`, label: PDC_GROUP_LABEL, children: pdcNodes }]
}

function toPortNode<T extends { id: string; factoryEntityClass?: string | null }>(node: PortTreeNode<T>): PortTreeDisplayNode<T> {
  return { kind: 'port', id: node.hardpoint.id, node, children: toDisplayChildren(node.children) }
}

/** Recursively converts a raw children array into fully processed display
 * nodes — every nesting level gets the same PDC-subgrouping pass, so
 * "Manned Turrets -> Front Lower Turret -> ...seven PDC ports..." and any
 * future ship with PDCs at a different depth are both handled by the same
 * code path, never a ship-specific branch. */
function toDisplayChildren<T extends { id: string; factoryEntityClass?: string | null }>(nodes: PortTreeNode<T>[]): PortTreeDisplayNode<T>[] {
  return extractPdcSubgroup(nodes.map(toPortNode))
}

/** Stable-sorts a group's direct children per the shared Commander Taxonomy
 * Authority's `INTRA_GROUP_CHILD_PRIORITY` (`src/utils/commanderSystemTaxonomy.ts`)
 * when that group's label has an approved sibling order; every other
 * group's children are returned untouched, in their original order. A
 * non-'port' child (a nested PDC subgroup) always sorts last — it's never
 * one of the ordered siblings. */
function applyIntraGroupChildOrder<T extends { type: string }>(node: PortTreeDisplayNode<T>): PortTreeDisplayNode<T> {
  if (node.kind !== 'group') return node
  const priorityFor = INTRA_GROUP_CHILD_PRIORITY[node.label]
  if (!priorityFor) return node
  const ranked = node.children
    .map((child, index) => ({ child, index, priority: child.kind === 'port' ? priorityFor(child.node.hardpoint.type) : Infinity }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(({ child }) => child)
  return { ...node, children: ranked }
}

export function groupPortTree<T extends { id: string; type: string; groupLabel?: string; factoryEntityClass?: string | null }>(nodes: PortTreeNode<T>[]): PortTreeDisplayNode<T>[] {
  const result: PortTreeDisplayNode<T>[] = []
  const groupIndexByLabel = new Map<string, number>()

  for (const node of nodes) {
    const displayNode = toPortNode(node)
    const label = node.hardpoint.groupLabel
    if (!label) {
      result.push(displayNode)
      continue
    }

    const existingIndex = groupIndexByLabel.get(label)
    if (existingIndex !== undefined) {
      const group = result[existingIndex]
      if (group.kind === 'group') group.children.push(displayNode)
      continue
    }

    groupIndexByLabel.set(label, result.length)
    result.push({
      kind: 'group',
      id: `group-${label}-${node.hardpoint.id}`,
      label,
      children: [displayNode],
    })
  }

  // SW-007A — sibling order within Core Components/Utility, applied before
  // PDC extraction so a PDC subgroup (if one is ever pulled out of either
  // category) still sorts last relative to its ordered siblings.
  const withIntraGroupOrder = result.map((node) => applyIntraGroupChildOrder(node))

  // FTB-001A (Workstream A) — PDC extraction also applies within each
  // top-level groupLabel bucket (e.g. "Manned Turrets"), AND across bare
  // top-level ungrouped ports, in case a future ship ever carries a PDC
  // port directly at that level rather than nested beneath an
  // intermediate turret-assembly mount (every real ship certified so far
  // nests PDCs one level deeper, handled by toDisplayChildren above; this
  // is defense in depth, not dead code) — fully generic, same capability
  // check, same function, regardless of nesting depth.
  const withNestedPdcGroups = withIntraGroupOrder.map((node) => (node.kind === 'group' ? { ...node, children: extractPdcSubgroup(node.children) } : node))
  const withTopLevelPdcGroup = extractPdcSubgroup(withNestedPdcGroups)

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
  return withTopLevelPdcGroup
    .map((node, index) => ({ node, index }))
    .sort((a, b) => rank(a.node) - rank(b.node) || a.index - b.index)
    .map(({ node }) => node)
}

/** Every node id in display order, depth-first — group headers included —
 * for "Expand All" (mirrors flattenPortTree's role for the ungrouped tree). */
export function flattenDisplayTree<T extends { id: string }>(nodes: PortTreeDisplayNode<T>[]): PortTreeDisplayNode<T>[] {
  return nodes.flatMap((node) => [node, ...flattenDisplayTree(node.children)])
}

/**
 * FTB-001A (Workstream B) — this node's own id plus every descendant id,
 * depth-first. The one shared primitive recursive expand/collapse is built
 * on: a caller expanding or collapsing a single row toggles exactly this
 * set, not just the row's immediate children, so "expand a category" always
 * reveals its complete descendant tree (subcategories, turret mounts,
 * weapon slots, missile racks, installed component children, mining module
 * slots, and any future nested component-owned ports) in one action, and
 * "collapse a category" always hides all of them again. Generic over the
 * tree shape — never hardcodes PDC, mining, turret, or ship-specific cases;
 * it only ever walks whatever `children` the tree actually has.
 */
export function displayNodeIds<T extends { id: string }>(node: PortTreeDisplayNode<T>): string[] {
  return [node.id, ...node.children.flatMap(displayNodeIds)]
}
