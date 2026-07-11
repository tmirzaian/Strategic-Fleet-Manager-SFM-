/**
 * Display name support.
 *
 * StarBreaker/CIG internal identifiers (e.g. "hardpoint_gun_left_wing")
 * are never fit for UI display. A `DisplayNameMap` is the mapping the
 * Normalizer will eventually generate (into
 * generated-data/display-name-map.json) so every internalName in the game
 * data has a human-readable counterpart before it ever reaches a Port,
 * Component, or Ship record.
 *
 * Example:
 *   "hardpoint_gun_left_wing" → "Left Wing Weapon"
 */
export interface DisplayNameEntry {
  internalName: string
  displayName: string
  /** Optional: which kind of record this entry resolves names for. */
  scope?: 'port' | 'component' | 'ship' | 'other'
}

export type DisplayNameMap = Record<string, string>
