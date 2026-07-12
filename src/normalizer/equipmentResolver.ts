import type { Port, ResolvedEquipmentAssignment, NormalizationWarning } from '../engine/types'
import { classifyPortRelationship } from './equipmentRelationship'

export interface EquipmentResolutionResult {
  assignments: ResolvedEquipmentAssignment[]
  warnings: NormalizationWarning[]
}

/**
 * Universal recursive resolver for nested factory equipment — gimbals,
 * turrets, missile racks, mining mounts, salvage mounts, quantum/jump
 * drives, and any future recursive item, all handled by the same
 * structural logic rather than one function per equipment kind.
 *
 * Every top-level port (no parent) becomes one or more
 * `ResolvedEquipmentAssignment`s, decided by `classifyPortRelationship()`
 * (Mission M-010):
 *
 * - A **container** port (a weapon mount, a missile rack) collapses its
 *   full descendant tree into ONE assignment — collecting every LEAF port
 *   and asking whether they all agree on one factory item, exactly as
 *   before Mission M-010. Nothing about this path changed.
 * - **Independent** equipment (e.g. a QuantumDrive hosting a nested
 *   JumpDrive) never collapses: the port's own factory item is its own
 *   assignment, and each of its direct children is resolved as its own,
 *   separate assignment root — recursively, so an independent port's
 *   child that is itself a container still collapses correctly, and an
 *   independent port's child that is itself independent still gets its
 *   own row.
 */
export function resolveEquipmentAssignments(shipId: string, ports: Port[]): EquipmentResolutionResult {
  const portById = new Map(ports.map((p) => [p.id, p]))
  const warnings: NormalizationWarning[] = []
  const assignments: ResolvedEquipmentAssignment[] = []

  const topLevelPorts = ports.filter((p) => !p.parentPortId)

  for (const top of topLevelPorts) {
    assignments.push(...resolveAssignmentsFrom(shipId, top, portById, warnings))
  }

  return { assignments, warnings }
}

function childrenOf(port: Port, portById: Map<string, Port>): Port[] {
  return (port.childPortIds ?? []).map((id) => portById.get(id)).filter((p): p is Port => Boolean(p))
}

/** Resolves one port into one or more assignments, per its relationship
 * to its own children (see module doc comment). */
function resolveAssignmentsFrom(shipId: string, port: Port, portById: Map<string, Port>, warnings: NormalizationWarning[]): ResolvedEquipmentAssignment[] {
  const relationship = classifyPortRelationship(port.canonicalPortType)

  if (relationship.kind === 'container') {
    return [buildContainerAssignment(shipId, port, portById, warnings)]
  }

  // independent (or unresolved, treated the same — see classifyPortRelationship).
  const ownAssignment = buildIndependentAssignment(shipId, port)
  const childAssignments = childrenOf(port, portById).flatMap((child) => resolveAssignmentsFrom(shipId, child, portById, warnings))
  return [ownAssignment, ...childAssignments]
}

/**
 * A container port's assignment: collects every LEAF port beneath it
 * (traversing every sibling and every level — never stopping after the
 * first child) and asks whether they all agree on one factory item. If
 * so, that's the single meaningful `resolvedItemId` to show the player.
 * If leaves disagree (a mixed-loadout rack), the raw data is preserved
 * and `mixedChildItems` is set — nothing is collapsed into an invented
 * single answer. Unchanged from pre-Mission-M-010 behavior.
 */
function buildContainerAssignment(shipId: string, top: Port, portById: Map<string, Port>, warnings: NormalizationWarning[]): ResolvedEquipmentAssignment {
  const leaves: Port[] = []
  const mountPath: string[] = []

  const collectLeaves = (port: Port, path: string[]) => {
    const nextPath = [...path, port.internalName]
    const children = childrenOf(port, portById)
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

  return {
    shipId,
    portId: top.id,
    displayName: top.displayName,
    positionLabel: top.positionLabel,
    equipmentGroup: top.equipmentGroup,
    minSize,
    maxSize,
    // A container's own item is mount hardware, not the resolved equipment.
    mountItemId: top.factoryItemId ?? null,
    resolvedItemId,
    resolvedItemIds: distinctItemIds,
    mixedChildItems,
    leafCount: leaves.length,
    mountPath,
  }
}

/**
 * An independent port's assignment: its own factory item IS the resolved
 * equipment, full stop — never replaced by a nested child's item. Also
 * used, unchanged in effect from pre-Mission-M-010 behavior, for any
 * plain childless port (a Power Plant, a Shield, a Cooler, ...).
 */
function buildIndependentAssignment(shipId: string, port: Port): ResolvedEquipmentAssignment {
  const resolvedItemId = port.factoryItemId ?? null
  return {
    shipId,
    portId: port.id,
    displayName: port.displayName,
    positionLabel: port.positionLabel,
    equipmentGroup: port.equipmentGroup,
    minSize: port.minSize,
    maxSize: port.maxSize,
    mountItemId: null,
    resolvedItemId,
    resolvedItemIds: resolvedItemId ? [resolvedItemId] : [],
    mixedChildItems: false,
    leafCount: 1,
    mountPath: [port.internalName],
  }
}
