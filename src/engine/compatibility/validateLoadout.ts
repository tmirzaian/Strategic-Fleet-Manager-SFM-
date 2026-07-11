import type { Port, Component, InstalledLoadout } from '../types'
import { isCompatible } from './isCompatible'
import { flattenPorts } from './flattenPorts'

export type LoadoutIssueStatus = 'ok' | 'empty' | 'incompatible' | 'invalid'

export interface LoadoutValidationResult {
  portId: string
  status: LoadoutIssueStatus
  message?: string
}

/**
 * Checks an InstalledLoadout's port assignments against each Port's own
 * compatibility rules (allowedTypes/allowedSubtypes/min-maxSize). This is
 * a data-integrity check — "is this component even legally allowed in
 * this slot" — and is deliberately separate from the existing UI-level
 * hardpoint status logic in src/utils/hardpointStatus.ts, which answers a
 * different question ("does Installed match Target/Factory"). A
 * validateLoadout "incompatible" result would mean something is wrong
 * with the data or the assignment itself, not just that the player hasn't
 * finished a build yet.
 */
export function validateLoadout(loadout: InstalledLoadout, ports: Port[], components: Component[]): LoadoutValidationResult[] {
  const flatPorts = flattenPorts(ports)
  const portById = new Map(flatPorts.map((p) => [p.id, p]))
  const componentById = new Map(components.map((c) => [c.id, c]))

  return loadout.portAssignments.map(({ portId, componentId }): LoadoutValidationResult => {
    const port = portById.get(portId)
    if (!port) {
      return { portId, status: 'invalid', message: 'Port not found for this ship.' }
    }

    if (componentId === null || componentId === undefined) {
      return { portId, status: 'empty' }
    }

    const component = componentById.get(componentId)
    if (!component) {
      return { portId, status: 'invalid', message: 'Installed component not found in the component catalog.' }
    }

    if (!isCompatible(component, port)) {
      return {
        portId,
        status: 'incompatible',
        message: `${component.displayName} is not compatible with ${port.displayName}.`,
      }
    }

    return { portId, status: 'ok' }
  })
}
