import { resolveComponentByEntityClass, resolveComponentByName } from '../generated/componentCatalog'

/**
 * EWO-104 Amendment 3 (Part D) — "what am I actually hunting?" Reuses the
 * canonical component catalog resolvers directly (entityClass-preferred,
 * name fallback, matching this app's own established identity-resolution
 * convention) — no new metadata, no new authority, presentation-only
 * formatting of fields the catalog already carries (`size`, `category`,
 * `classification`).
 *
 * Weapons omit the redundant category word — their own `classification`
 * text already reads as a complete weapon description (e.g. "Ballistic
 * Repeater", "Laser Cannon"), matching the work order's own example
 * ("S2 Ballistic Repeater", never "S2 Weapon • Ballistic Repeater").
 * Every other category shows `S{size} {Category}` plus `• {classification}`
 * when the catalog actually has one — never a fabricated placeholder.
 *
 * Returns `undefined` when the component can't be resolved (ambiguous or
 * unknown) — callers must render the component name alone in that case,
 * never a broken/guessed metadata line.
 */
const SINGULAR_CATEGORY_LABEL: Record<string, string> = {
  Cooler: 'Cooler',
  PowerPlant: 'Power Plant',
  QuantumDrive: 'Quantum Drive',
  Shield: 'Shield',
  Weapon: 'Weapon',
}

/**
 * `category` is the caller's own already-normalized SFM category key
 * (`TargetIntelligenceComponentMatch.category`, from
 * `canonicalComponentCategoryKey`) — deliberately NOT the catalog record's
 * own `category` field, which carries DataCore's raw, unnormalized Type
 * string (e.g. `"WeaponGun"`) rather than this app's own "Weapon"/"Shield"
 * vocabulary. Only `size` and `classification` are read from the catalog
 * lookup itself.
 */
export function describeComponentIdentity(componentName: string, componentEntityClass: string | null, category: string): string | undefined {
  const resolution = componentEntityClass ? resolveComponentByEntityClass(componentEntityClass) : resolveComponentByName(componentName)
  if (resolution.status !== 'resolved') return undefined

  const { size, classification } = resolution.record
  const categoryLabel = SINGULAR_CATEGORY_LABEL[category] ?? category

  if (category === 'Weapon' && classification) {
    return `S${size} ${classification}`
  }
  return classification ? `S${size} ${categoryLabel} • ${classification}` : `S${size} ${categoryLabel}`
}
