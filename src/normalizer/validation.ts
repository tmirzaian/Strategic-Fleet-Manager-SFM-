import type { NormalizedShipPackage, NormalizationWarning, CompatibilityWarning } from '../engine/types'
import { isCompatible } from '../engine/compatibility'

export interface ValidationResult {
  normalizationWarnings: NormalizationWarning[]
  compatibilityWarnings: CompatibilityWarning[]
}

function assignmentsEqual(
  a: readonly { portId: string; componentId: string | null }[],
  b: readonly { portId: string; componentId: string | null }[]
): boolean {
  if (a.length !== b.length) return false
  const bySet = new Map(b.map((x) => [x.portId, x.componentId]))
  return a.every((x) => bySet.has(x.portId) && bySet.get(x.portId) === x.componentId)
}

/**
 * Runs the full post-normalization validation checklist against one
 * `NormalizedShipPackage`. Never throws — incomplete or inconsistent
 * source data becomes a warning or error entry, not a crash. Structural
 * problems (dangling references, duplicate ids, mismatched
 * initialization) are `normalizationWarnings`; anything about whether an
 * assignment is actually a legal fit for its port is a
 * `compatibilityWarnings` entry.
 */
export function validateNormalizedPackage(pkg: NormalizedShipPackage): ValidationResult {
  const normalizationWarnings: NormalizationWarning[] = []
  const compatibilityWarnings: CompatibilityWarning[] = []

  const portById = new Map(pkg.ports.map((p) => [p.id, p]))
  const componentById = new Map(pkg.components.map((c) => [c.id, c]))

  // 1 & 2: every factory assignment references an existing port and component.
  for (const a of pkg.factoryLoadout.portAssignments) {
    if (!portById.has(a.portId)) {
      normalizationWarnings.push({ severity: 'error', code: 'dangling-factory-port', message: `Factory assignment references unknown port "${a.portId}".`, path: a.portId })
    }
    if (a.componentId && !componentById.has(a.componentId)) {
      normalizationWarnings.push({ severity: 'error', code: 'dangling-factory-component', message: `Factory assignment references unknown component "${a.componentId}".`, path: a.componentId })
    }
  }

  // 3: child ports reference valid parents.
  for (const port of pkg.ports) {
    if (port.parentPortId && !portById.has(port.parentPortId)) {
      normalizationWarnings.push({ severity: 'error', code: 'dangling-parent-port', message: `Port "${port.id}" references unknown parent "${port.parentPortId}".`, path: port.id })
    }
  }

  // 4: port IDs unique.
  const portIdCounts = new Map<string, number>()
  for (const p of pkg.ports) portIdCounts.set(p.id, (portIdCounts.get(p.id) ?? 0) + 1)
  for (const [id, count] of portIdCounts) {
    if (count > 1) normalizationWarnings.push({ severity: 'error', code: 'duplicate-port-id', message: `Port id "${id}" appears ${count} times.`, path: id })
  }

  // 5: component IDs unique.
  const componentIdCounts = new Map<string, number>()
  for (const c of pkg.components) componentIdCounts.set(c.id, (componentIdCounts.get(c.id) ?? 0) + 1)
  for (const [id, count] of componentIdCounts) {
    if (count > 1) normalizationWarnings.push({ severity: 'error', code: 'duplicate-component-id', message: `Component id "${id}" appears ${count} times.`, path: id })
  }

  // 6: Installed initialization matches Factory.
  if (!assignmentsEqual(pkg.installedLoadout.portAssignments, pkg.factoryLoadout.portAssignments)) {
    normalizationWarnings.push({ severity: 'error', code: 'installed-mismatch', message: 'Installed Loadout does not match Factory Loadout on first import.' })
  }

  // 7: Default Target Build matches Factory.
  if (!assignmentsEqual(pkg.defaultTargetBuild.portAssignments, pkg.factoryLoadout.portAssignments)) {
    normalizationWarnings.push({ severity: 'error', code: 'target-mismatch', message: 'Default Target Build does not match Factory Loadout.' })
  }

  // 8: known port constraints are internally valid (min <= max when both known).
  for (const port of pkg.ports) {
    if (port.minSize !== null && port.maxSize !== null && port.minSize > port.maxSize) {
      compatibilityWarnings.push({ severity: 'error', code: 'invalid-size-range', message: `Port "${port.displayName}" has minSize (${port.minSize}) greater than maxSize (${port.maxSize}).`, portId: port.id })
    }
  }

  // 9: imported target/factory assignments are compatible when enough data exists.
  // Ports with children are mount/rack containers (a gimbal, a missile
  // rack) — their own factoryItemId is mount hardware, not a leaf
  // component subject to the port's own allowedTypes/size. The
  // meaningful compatibility check for what's actually installed happens
  // at the leaf ports themselves, which this loop still covers.
  for (const port of pkg.ports) {
    if (port.childPortIds && port.childPortIds.length > 0) continue
    if (!port.targetItemId) continue
    const component = componentById.get(port.targetItemId)
    if (!component) continue
    if (!isCompatible(component, port)) {
      compatibilityWarnings.push({
        severity: 'error',
        code: 'incompatible-target',
        message: `"${component.displayName}" is not compatible with port "${port.displayName}".`,
        portId: port.id,
      })
    }
  }

  return { normalizationWarnings, compatibilityWarnings }
}
