import type { RawLoadoutNode, LegacyLoadoutNode, StarBreakerLoadoutNode, RawComponentNode } from './rawTypes'
import type { NormalizationWarning } from '../engine/types'

/**
 * The one loadout-node shape every downstream consumer (the normalizer's
 * `walk`, `portConstraintBuilder`, `factoryLoadoutBuilder`) reads. Whatever
 * raw schema StarBreaker exported gets converted to this shape at the
 * adapter boundary — nothing past this point branches on which raw schema
 * a node came from.
 */
export interface CanonicalLoadoutNode {
  itemPortName: string
  portType?: string
  size?: number
  allowedTypes?: string[]
  allowedSubtypes?: string[]
  minSize?: number
  maxSize?: number
  factoryComponent: RawComponentNode | null
  children: CanonicalLoadoutNode[]
}

export function isLegacyLoadoutNode(node: RawLoadoutNode): node is LegacyLoadoutNode {
  return typeof (node as Partial<LegacyLoadoutNode>).itemPortName === 'string'
}

function rawChildrenOf(node: RawLoadoutNode): RawLoadoutNode[] {
  return (node.children as RawLoadoutNode[] | undefined) ?? []
}

/** The port identifier for either schema — `itemPortName` (legacy) or
 * `port` (StarBreaker). `undefined` when the node carries neither, or the
 * field present is empty/non-string. */
function extractPortId(node: RawLoadoutNode): string | undefined {
  const portId = isLegacyLoadoutNode(node) ? node.itemPortName : node.port
  return typeof portId === 'string' && portId.length > 0 ? portId : undefined
}

/**
 * Maps a node's own (non-`children`) fields into the canonical shape.
 * Legacy nodes carry their constraints and factory component directly.
 * StarBreaker nodes carry none of that — only the mounted entity's class
 * name, which becomes the canonical `factoryComponent.internalName` (the
 * one identity fact this schema actually gives us); every classification
 * and constraint field is left `undefined` rather than guessed, so
 * `portClassifier` and `buildPortConstraints` fail safe on it exactly as
 * they already do for any raw node missing that data.
 */
function adaptOwnFields(node: RawLoadoutNode, portId: string): Omit<CanonicalLoadoutNode, 'children'> {
  if (isLegacyLoadoutNode(node)) {
    return {
      itemPortName: portId,
      portType: node.portType,
      size: node.size,
      allowedTypes: node.allowedTypes,
      allowedSubtypes: node.allowedSubtypes,
      minSize: node.minSize,
      maxSize: node.maxSize,
      factoryComponent: node.factoryComponent ?? null,
    }
  }
  const sb = node as StarBreakerLoadoutNode
  return {
    itemPortName: portId,
    factoryComponent: sb.entity ? { internalName: sb.entity } : null,
  }
}

/**
 * Converts a list of raw loadout nodes (either schema, possibly mixed)
 * into canonical nodes, recursing into `children`.
 *
 * A node with no resolvable port identifier is malformed — rather than
 * inventing a placeholder id or passing an empty string downstream (which
 * `displayNameGenerator` is not responsible for guarding against), it is
 * dropped and a warning is recorded; its own children are promoted to the
 * level it would have occupied, since they may still carry valid data of
 * their own.
 */
export function adaptLoadoutNodes(
  nodes: RawLoadoutNode[],
  sourcePathPrefix: string,
  warnings: NormalizationWarning[]
): CanonicalLoadoutNode[] {
  const result: CanonicalLoadoutNode[] = []

  for (const node of nodes) {
    const portId = extractPortId(node)

    if (!portId) {
      warnings.push({
        severity: 'warning',
        code: 'malformed-loadout-node',
        message: `Raw loadout node under "${sourcePathPrefix || '/'}" has no resolvable port identifier (itemPortName/port) — excluded; its children were promoted to the parent level.`,
        path: sourcePathPrefix,
      })
      result.push(...adaptLoadoutNodes(rawChildrenOf(node), sourcePathPrefix, warnings))
      continue
    }

    const own = adaptOwnFields(node, portId)
    const children = adaptLoadoutNodes(rawChildrenOf(node), `${sourcePathPrefix}/${portId}`, warnings)
    result.push({ ...own, children })
  }

  return result
}
