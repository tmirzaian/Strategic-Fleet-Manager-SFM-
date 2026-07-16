/**
 * Player-ownable ship/vehicle inclusion & exclusion taxonomy (Mission M-012
 * Universe Provisioning).
 *
 * PRIMARY (field-based, authoritative) rule:
 *   An EntityClassDefinition is a candidate vehicle if and only if it has a
 *   `VehicleComponentParams` component. Its `movementClass` field —
 *   confirmed against the real frozen LIVE 4.8 P4K — takes exactly three
 *   values in this build: "Spaceship" (ship/snub craft), "ArcadeWheeled"
 *   (ground vehicle), and "Dummy" (non-vehicle debris props, e.g.
 *   `SalvageableDebris*` — excluded).
 *
 * SECONDARY (documented, reviewed name-taxonomy) rule:
 *   DataCore does not expose a single reliable "is this player-purchasable"
 *   boolean. Investigation confirmed candidate AI/mission-spawn variants
 *   (e.g. `AEGS_Avenger_Titan_PU_AI_CIV`) carry a Tag whose resolved path is
 *   under `/AI/Spawning/GameMode/PU` — but StarBreaker's bulk field-query
 *   mode does not support array-typed leaf fields (confirmed empirically:
 *   `EntityClassDefinition.tags` returns zero rows even though the type
 *   query matches all records), so per-entity full-record tag verification
 *   across all ~970 candidates was not performed (it would require one
 *   process spawn per entity, defeating the bulk-query approach this
 *   mission asks generation to use). A byte-identical AI clone
 *   (`AEGS_Avenger_Titan_AI_Template`) was also found to carry *no*
 *   distinguishing DataCore component/field at all versus its real,
 *   player-purchasable base ship — every field checked, including
 *   `SCItemPurchasableParams` and `SEntityInsuranceProperties`, was
 *   identical.
 *
 *   Given no single reliable field, this list is a reviewed, deterministic
 *   name-taxonomy of Star Citizen's own well-documented internal
 *   non-player-variant conventions (AI/mission/test/temporary/demo
 *   spawn markers) — used only to EXCLUDE, never to discover or invent a
 *   ship. Spot-checked against the `/AI/Spawning/` tag for the `_PU_AI`/
 *   `_Unmanned` cases (confirmed present); the `_Template` case is a known,
 *   documented residual limitation (see docs/ADR-005).
 */
export const NON_PLAYER_VARIANT_PATTERNS: RegExp[] = [
  /_AI(_|$)/, // AI-piloted spawn variant (confirmed via /AI/Spawning/ tag for _PU_AI cases)
  /_PU(_|$)/, // Persistent-universe mission/NPC spawn variant (subsumes _PU_AI, _PU_Hijacked, _PU_Pirate, _PU_Criminal, _PU_NineTails, _PU_UEE, _PU_HOS, _PU_GameMaster)
  /_Unmanned/, // Unmanned/drone AI variant
  /_Template/, // Base AI-spawn/geometry template (residual limitation — no distinguishing DataCore field found; see ADR-005)
  /_Wreck/, // Wreck/salvage-mission entity
  /_Destroyed/, // Destroyed-state entity
  /^SalvageableDebris/, // Debris entity (movementClass "Dummy" already excludes these; kept as defense-in-depth)
  /_Test/i, // Test entity
  /_DEBUG/i, // Debug entity
  /_OLD$/, // Deprecated/retired entity
  /_NPC/, // Explicit NPC marker
  /_ShipShowdown/, // Community-event one-off ship
  /_BIS\d+/, // Internal build-tagged one-off
  /_Mission_/, // Mission-specific scripted variant
  /_Teach/, // Tutorial-only variant
  /_Crewless/, // Crewless AI-piloted variant
  /_Exec_/, // Internal executive/producer build variant
  /_LowFuel/, // Scripted low-fuel mission-state variant
  /_Hijacked/, // Mission-state "hijacked" variant
  /_Boarded/, // Mission-state "boarded" variant
  /_Derelict/, // Derelict/wreck mission-body variant
  /_TEMP/, // Temporary/placeholder test variant
  /^EAObjectiveDestructable/, // Engagement-arena objective prop
  /^Orbital_Sentry/, // AI sentry/turret defense platform
  /^probe_comms/, // Mission comms-probe object
  /_Indestructible/, // Demo/showfloor invulnerable copy
]

export type VehicleMovementClass = 'Spaceship' | 'ArcadeWheeled' | 'Dummy' | string

export type VehicleCategory = 'ship' | 'ground_vehicle'

/** Maps a raw `movementClass` to SFM's ship-vs-ground-vehicle category, or null if it's not a player-operable movement class at all. */
export function classifyMovementClass(movementClass: VehicleMovementClass): VehicleCategory | null {
  if (movementClass === 'Spaceship') return 'ship'
  if (movementClass === 'ArcadeWheeled') return 'ground_vehicle'
  return null
}

/** True if this entity class name matches a reviewed non-player-variant marker. */
export function isNonPlayerVariantName(entityClass: string): boolean {
  return NON_PLAYER_VARIANT_PATTERNS.some((p) => p.test(entityClass))
}
