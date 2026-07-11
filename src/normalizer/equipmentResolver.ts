import type { Port, ResolvedEquipmentAssignment, NormalizationWarning } from '../engine/types'

export interface EquipmentResolutionResult {
  assignments: ResolvedEquipmentAssignment[]
  warnings: NormalizationWarning[]
}

/**
 * Universal recursive resolver for nested factory equipment — gimbals,
 * turrets, missile racks, mining mounts, salvage mounts, and any future
 * recursive item, all handled by the same structural logic rather than
 * one function per equipment kind.
 *
 * For every top-level port (no parent), this walks its full descendant
 * tree, collecting every LEAF port (a port with no children — the actual
 * gun behind a gimbal, each missile in a rack) and asking: do all leaves
 * agree on one factory item? If so, that's the single meaningful
 * `resolvedItemId` to show the player. If leaves disagree (a mixed-loadout
 * rack), the raw data is preserved and `mixedChildItems` is set — nothing
 * is collapsed into an invented single answer.
 *
 * Traverses ALL siblings and ALL children at every level (never stops
 * after the first child), and never substitutes a generic catalog default
 * for an actual resolved item — a leaf with no factoryItemId contributes
 * nothing to `resolvedItemIds` rather than a placeholder.
 */
export function resolveEquipmentAssignments(shipId: string, ports: Port[]): EquipmentResolutionResult {
  const portById = new Map(ports.map((p) => [p.id, p]))
  const warnings: NormalizationWarning[] = []
  const assignments: ResolvedEquipmentAssignment[] = []

  const topLevelPorts = ports.filter((p) => !p.parentPortId)

  for (const top of topLevelPorts) {
    const leaves: Port[] = []
    const mountPath: string[] = []

    const collectLeaves = (port: Port, path: string[]) => {
      const nextPath = [...path, port.internalName]
      const children = (port.childPortIds ?? []).map((id) => portById.get(id)).filter((p): p is Port => Boolean(p))
      if (children.length === 0) {
        leaves.push(port)
        mountPath.push(...nextPath)
        return
      }
      // Traverse every child — never stop after the first.
      for (const child of children) {
        collectLeaves(child, nextPath)
      }
    }
    collectLeaves(top, [])

    const distinctItemIds = Array.from(new Set(leaves.map((l) => l.factoryItemId).filter((id): id is string => Boolean(id))))
    const mixedChildItems = distinctItemIds.length > 1
    const resolvedItemId = distinctItemIds.length === 1 ? distinctItemIds[0] : null

    if (mixedChildItems) {
      warnings.push({
        severity: 'warning',
        code: 'mixed-child-items',
        message: `Port "${top.displayName}" has children with ${distinctItemIds.length} different factory items — raw data preserved, no single item invented.`,
        path: top.internalName,
      })
    }

    // Size: prefer leaf-derived constraints when every leaf agrees; a
    // disagreement (including vs. the mount's own range) is a real
    // conflict worth flagging, not silently resolved either way.
    let minSize = top.minSize
    let maxSize = top.maxSize
    if (leaves.length > 0) {
      const leafMins = new Set(leaves.map((l) => l.minSize))
      const leafMaxes = new Set(leaves.map((l) => l.maxSize))
      if (leafMins.size === 1 && leafMaxes.size === 1) {
        const leafMin = leaves[0].minSize
        const leafMax = leaves[0].maxSize
        if ((top.minSize !== null && top.minSize !== leafMin) || (top.maxSize !== null && top.maxSize !== leafMax)) {
          warnings.push({
            severity: 'warning',
            code: 'size-conflict',
            message: `Port "${top.displayName}" mount size (${top.minSize}-${top.maxSize}) disagrees with its leaf port size (${leafMin}-${leafMax}) — leaf value used as authoritative.`,
            path: top.internalName,
          })
        }
        minSize = leafMin
        maxSize = leafMax
      } else if (leafMins.size > 1 || leafMaxes.size > 1) {
        warnings.push({
          severity: 'warning',
          code: 'size-conflict',
          message: `Port "${top.displayName}" has leaves with disagreeing size constraints — left as mount-level value, not guessed.`,
          path: top.internalName,
        })
      }
    }

    const hasChildren = (top.childPortIds ?? []).length > 0

    assignments.push({
      shipId,
      portId: top.id,
      displayName: top.displayName,
      positionLabel: top.positionLabel,
      equipmentGroup: top.equipmentGroup,
      minSize,
      maxSize,
      // A plain port (no children) directly holds its own component — it's
      // not "mounting" a separate item, so mountItemId stays null and the
      // component shows up as resolvedItemId instead.
      mountItemId: hasChildren ? top.factoryItemId ?? null : null,
      resolvedItemId,
      resolvedItemIds: distinctItemIds,
      mixedChildItems,
      leafCount: leaves.length,
      mountPath,
    })
  }

  return { assignments, warnings }
}
