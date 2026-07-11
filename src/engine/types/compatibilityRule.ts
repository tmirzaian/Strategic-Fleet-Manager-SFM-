/**
 * `CompatibilityRule` — the constraint shape shared by a Port's own
 * allowed-type/size fields and any standalone rule set the future
 * Normalizer or Validator wants to check a Component against, independent
 * of a specific Port instance (e.g. bulk-validating an entire
 * FactoryLoadout against a rules table).
 *
 * `minSize`/`maxSize` are nullable (Sprint: generalized import pipeline):
 * when a real StarBreaker export doesn't carry size constraint data for a
 * port, the importer must leave that unknown rather than inventing a
 * value — `null` means "no size constraint known", not "size zero".
 * Compatibility checks treat a null bound the same way they already treat
 * an empty allowedTypes/allowedSubtypes list: unconstrained on that axis.
 */
export interface CompatibilityRule {
  allowedTypes: string[]
  allowedSubtypes: string[]
  minSize: number | null
  maxSize: number | null
}
