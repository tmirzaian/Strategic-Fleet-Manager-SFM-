/**
 * `Component` — a single piece of equipment that can be installed into a
 * Port (a weapon, shield generator, cooler, quantum drive, etc.).
 * Normalized shape; the future Normalizer is responsible for producing
 * these from raw CIG/StarBreaker item records.
 */
export interface Component {
  id: string
  /** Raw CIG identifier — never shown in the UI. */
  internalName: string
  /** UI-safe name. See src/engine/displayNames. */
  displayName: string
  manufacturer: string
  /** e.g. "WeaponGun", "Shield", "Cooler", "PowerPlant". */
  category: string
  /** e.g. "Ballistic", "Laser", "Military", "Stealth". */
  subtype: string
  size: number
  /** e.g. "A", "B", "C". */
  grade: string
  /** e.g. "Civilian", "Military", "Competition", "Stealth". */
  class: string
  tags: string[]
}
