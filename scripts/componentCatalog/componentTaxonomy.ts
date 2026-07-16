/**
 * Player-usable component category taxonomy (Mission M-012 Universe
 * Provisioning).
 *
 * The M-007 generator resolved metadata for a closed set of ~90 entity
 * classes SFM's raw-data ship fixtures happened to mount. This mission
 * widens scope to every player-usable component in the full LIVE 4.8
 * universe — discovered via one bulk DataCore query
 * (`EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Type`,
 * confirmed empirically to match 25,544 entity classes across the whole
 * game in ~3.5s) rather than a raw-data-fixture-scoped, per-entity walk.
 *
 * `AttachDef.Type` is DataCore's own authoritative category field — never
 * inferred from entity names. This allowlist maps it to the categories
 * Mission M-012 explicitly asks for; every other `Type` value observed in
 * the full-universe query (character wearables, cosmetics, seats,
 * dashboards, controllers, ATC managers, docking internals, thrusters,
 * fuel systems, geometry/UI/audio internals, personal FPS weapons, etc.)
 * is deliberately left out of this allowlist — not silently dropped, but
 * excluded by omission from a reviewed minimum-scope list, consistent
 * with Mission M-012's own exclusion examples. See docs/ADR-005 for the
 * full observed-Type-value breakdown and rationale per excluded category.
 */
export const PLAYER_USABLE_COMPONENT_TYPES: Record<string, string> = {
  WeaponGun: 'Weapon',
  WeaponDefensive: 'Countermeasure', // chaff/flare launchers — ship utility equipment
  WeaponMining: 'Mining Head', // mining lasers mount like weapons in this game
  WeaponMount: 'Mount/Gimbal',
  Shield: 'Shield',
  Cooler: 'Cooler',
  PowerPlant: 'Power Plant',
  QuantumDrive: 'Quantum Drive',
  JumpDrive: 'Jump Drive',
  MissileLauncher: 'Missile Rack',
  GroundVehicleMissileLauncher: 'Missile Rack', // ground-vehicle equivalent
  Missile: 'Missile',
  Radar: 'Radar',
  LifeSupportGenerator: 'Life Support',
  Relay: 'Relay',
  TractorBeam: 'Tractor Beam',
  TowingBeam: 'Tractor Beam', // functionally the same player-facing category
  SalvageHead: 'Salvage Head',
  /** EWO-041 (CWO-001 Task 3 follow-on) — the salvage head's own child
   * modifiers (e.g. `Salvage_Modifier_Scraper_Small`,
   * `Salvage_Modifier_Tractor_Small`) carry this distinct DataCore
   * category, confirmed via a direct live DataCore query — previously
   * absent from this allowlist, so no such record ever reached the
   * generated catalog even though the real data exists. */
  SalvageModifier: 'Salvage Module',
  Bomb: 'Bomb',
  BombLauncher: 'Bomb Launcher',
}

export function isPlayerUsableComponentType(attachDefType: string): boolean {
  return attachDefType in PLAYER_USABLE_COMPONENT_TYPES
}

export function componentCategoryForType(attachDefType: string): string | null {
  return PLAYER_USABLE_COMPONENT_TYPES[attachDefType] ?? null
}
