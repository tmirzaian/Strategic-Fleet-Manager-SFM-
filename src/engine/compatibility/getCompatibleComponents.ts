import type { Component, CompatibilityRule } from '../types'
import { isCompatible } from './isCompatible'

/**
 * Returns every Component in `components` that is compatible with the
 * given Port (or standalone CompatibilityRule) — e.g. to populate a
 * future "pick a component for this slot" UI without needing to know
 * anything about compatibility rules itself.
 */
export function getCompatibleComponents(rule: CompatibilityRule, components: Component[]): Component[] {
  return components.filter((component) => isCompatible(component, rule))
}
