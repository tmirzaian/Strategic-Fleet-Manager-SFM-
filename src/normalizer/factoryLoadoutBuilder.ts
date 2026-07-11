import type { RawComponentNode } from './rawTypes'
import type { Component, PortAssignment, NormalizationWarning } from '../engine/types'
import { generateDisplayName } from './displayNameGenerator'

/** Richer intermediate shape (per spec) kept alongside the final
 * `PortAssignment[]` stored on FactoryLoadout — useful for debugging and
 * for the import report, even though the persisted loadout only needs
 * portId/componentId. */
export interface FactoryLoadoutAssignment {
  shipId: string
  portId: string
  itemId: string | null
  sourceInternalName: string | null
}

export interface FactoryLoadoutBuildResult {
  assignments: PortAssignment[]
  detailedAssignments: FactoryLoadoutAssignment[]
  components: Component[]
  warnings: NormalizationWarning[]
}

function componentIdFor(raw: RawComponentNode): string {
  return `component-${raw.internalName}`
}

/**
 * `FactoryLoadoutBuilder` — extracts the actual stock/default component
 * installed in each relevant port. Never substitutes a generic placeholder
 * like "Factory Component" (a defect fixed in an earlier sprint and
 * deliberately not allowed to regress here) — a port with no
 * `factoryComponent` in the raw data is recorded as a real, explicit empty
 * assignment (`itemId: null`), not a fabricated stock item.
 */
export function buildFactoryLoadout(
  shipId: string,
  relevantPorts: Array<{ portId: string; internalName: string; factoryComponent: RawComponentNode | null | undefined }>,
  overrideMap?: Record<string, string>
): FactoryLoadoutBuildResult {
  const assignments: PortAssignment[] = []
  const detailedAssignments: FactoryLoadoutAssignment[] = []
  const components: Component[] = []
  const warnings: NormalizationWarning[] = []
  const seenComponentIds = new Set<string>()

  for (const port of relevantPorts) {
    const raw = port.factoryComponent
    if (!raw) {
      assignments.push({ portId: port.portId, componentId: null })
      detailedAssignments.push({ shipId, portId: port.portId, itemId: null, sourceInternalName: null })
      continue
    }

    const componentId = componentIdFor(raw)
    assignments.push({ portId: port.portId, componentId })
    detailedAssignments.push({ shipId, portId: port.portId, itemId: componentId, sourceInternalName: raw.internalName })

    if (seenComponentIds.has(componentId)) continue
    seenComponentIds.add(componentId)

    if (!raw.category) {
      warnings.push({
        severity: 'warning',
        code: 'missing-component-category',
        message: `Factory component "${raw.internalName}" has no category — best-effort parsing only, not authoritative.`,
        path: raw.internalName,
      })
    }

    const displayName = raw.displayName ?? generateDisplayName(raw.internalName, overrideMap).displayName

    components.push({
      id: componentId,
      internalName: raw.internalName,
      displayName,
      manufacturer: raw.manufacturer ?? '',
      category: raw.category ?? '',
      subtype: raw.subtype ?? '',
      size: raw.size ?? 0,
      grade: raw.grade ?? '',
      class: raw.class ?? '',
      tags: raw.tags ?? [],
    })

    if (raw.size === undefined) {
      warnings.push({
        severity: 'warning',
        code: 'missing-component-size',
        message: `Factory component "${raw.internalName}" has no size field — defaulted to 0, not a real value.`,
        path: raw.internalName,
      })
    }
  }

  return { assignments, detailedAssignments, components, warnings }
}
