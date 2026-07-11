import type { Port } from '../types'

/**
 * Ports are recursive (see src/engine/types/port.ts). Most consumers —
 * lookups by id, compatibility checks, validation — want a flat list.
 * This walks `children` and returns every Port in the tree, parents and
 * descendants alike, in depth-first order.
 */
export function flattenPorts(ports: Port[]): Port[] {
  const result: Port[] = []
  for (const port of ports) {
    result.push(port)
    if (port.children && port.children.length > 0) {
      result.push(...flattenPorts(port.children))
    }
  }
  return result
}
