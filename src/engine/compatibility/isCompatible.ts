import type { Component, CompatibilityRule } from '../types'

/**
 * Checks whether a Component may legally be installed against a set of
 * compatibility constraints (either a `Port` directly — it's structurally
 * a superset of `CompatibilityRule` — or a standalone rule).
 *
 * Matching rules:
 *   - An empty `allowedTypes`/`allowedSubtypes` list means "no constraint
 *     on this axis" rather than "nothing is allowed" — an unconstrained
 *     rule shouldn't silently reject every component.
 *   - A null `minSize`/`maxSize` means the same thing for size: "unknown
 *     constraint", not "size zero". A real StarBreaker export that's
 *     missing size data must never cause every component to look
 *     incompatible — see src/normalizer/portConstraintBuilder.ts.
 *   - `category` is checked against `allowedTypes`, `subtype` against
 *     `allowedSubtypes`.
 *   - When both bounds are known, size must fall within the inclusive
 *     [minSize, maxSize] range.
 */
export function isCompatible(component: Component, rule: CompatibilityRule): boolean {
  const typeOk = rule.allowedTypes.length === 0 || rule.allowedTypes.includes(component.category)
  const subtypeOk = rule.allowedSubtypes.length === 0 || rule.allowedSubtypes.includes(component.subtype)
  const sizeOk = rule.minSize === null || rule.maxSize === null || (component.size >= rule.minSize && component.size <= rule.maxSize)
  return typeOk && subtypeOk && sizeOk
}
