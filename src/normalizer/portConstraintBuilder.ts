import type { CanonicalLoadoutNode } from './loadoutNodeAdapter'
import type { NormalizationWarning } from '../engine/types'

export interface PortConstraints {
  allowedTypes: string[]
  allowedSubtypes: string[]
  minSize: number | null
  maxSize: number | null
}

export interface PortConstraintResult {
  constraints: PortConstraints
  warnings: NormalizationWarning[]
}

/**
 * `PortConstraintBuilder` — derives a port's real compatibility
 * constraints from actual source fields (`allowedTypes`, `allowedSubtypes`,
 * `minSize`, `maxSize`) when the raw export provides them.
 *
 * Explicitly does NOT infer constraints from legacy helper naming
 * conventions like "hardpoint_class_2" — a size suffix in an internal name
 * is not authoritative data. When constraints are missing, the port is
 * still created with `minSize`/`maxSize` left `null` and
 * `allowedTypes`/`allowedSubtypes` left empty (both of which
 * `isCompatible()` already treats as "unconstrained", never as
 * "compatible with nothing") plus a recorded warning — never a guessed
 * value standing in for real data.
 */
export function buildPortConstraints(node: CanonicalLoadoutNode): PortConstraintResult {
  const warnings: NormalizationWarning[] = []

  const allowedTypes = node.allowedTypes ?? []
  const allowedSubtypes = node.allowedSubtypes ?? []

  if (!node.allowedTypes) {
    warnings.push({
      severity: 'warning',
      code: 'missing-allowed-types',
      message: `No allowedTypes provided for "${node.itemPortName}" — left unconstrained rather than guessed.`,
      path: node.itemPortName,
    })
  }

  let minSize: number | null = node.minSize ?? null
  let maxSize: number | null = node.maxSize ?? null

  // A bare `size` field (no explicit min/max range) is real source data —
  // use it as an exact-size constraint. This is different from inferring
  // from a naming convention like "hardpoint_class_2": `size` is an actual
  // structured field on the raw node, not a guess parsed out of a string.
  if (minSize === null && maxSize === null && typeof node.size === 'number') {
    minSize = node.size
    maxSize = node.size
  }

  if (minSize === null || maxSize === null) {
    warnings.push({
      severity: 'warning',
      code: 'missing-size-constraint',
      message: `No size constraint available for "${node.itemPortName}" — left null rather than invented.`,
      path: node.itemPortName,
    })
  }

  return {
    constraints: { allowedTypes, allowedSubtypes, minSize, maxSize },
    warnings,
  }
}
