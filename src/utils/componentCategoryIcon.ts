import { Wind, Zap, Rocket, ArrowUpRight, Shield, Telescope, Package, CircleDot, Crosshair, Target, Radio, Gem, Anvil, Magnet, Heart, Box, type LucideIcon } from 'lucide-react'

/**
 * SW-007B Revision 1 — Commander Glyph Language. One bold, simple-
 * silhouette identity glyph per major component category, keyed off the
 * exact same canonical signals every other Commander taxonomy decision in
 * this app already uses (`assemblyRole`, then `Hardpoint.type` — see
 * `commanderSystemTaxonomy.ts`, `shipDefinitions.ts`'s
 * `topLevelGroupLabel`), never a second, independently-maintained
 * classification table. `assemblyRole` is checked first because a turret
 * assembly's own row shares the exact `type` string ('Gimbal Mount') with
 * an ordinary Pilot Weapon mount — only `assemblyRole` (or `groupLabel`)
 * tells them apart, confirmed against real canonical data across Ghost/
 * Railen/MOLE/Vulture/Cutlass Black/Corsair.
 *
 * Revision 1 replaced the original picks (Snowflake, Orbit, Waypoints,
 * Boxes, Crosshair-only-set, UserRound, SatelliteDish, Pickaxe, Recycle,
 * HeartPulse, ...) after Commander review found them too illustrative —
 * good silhouette at icon-gallery size, too much internal detail to read
 * as a glyph at this component's real 13px inline size. Wherever SFM
 * already had a proven, reused dashboard glyph for a concept, this
 * revision reuses it directly (Zap — Power, already used for the
 * quick-action concept on QuickUpdate's Save button; Rocket — already
 * used as the "go to Ship Detail" navigation glyph, repurposed here for
 * Quantum Drive's own propulsion concept, no page ever shows both
 * meanings at once; Telescope/Target — already used on Fleet Roadmap's
 * Future/Now tiles for "sensing ahead"/"current focus," reused here for
 * Radar and Manned Turret). Plain `Shield` (not `ShieldCheck`) is
 * deliberate — the checkmark baked into `ShieldCheck` reads as a status
 * signal ("verified"), which this module must never imply regardless of
 * a given shield port's actual status; the design principle that icons
 * never duplicate status outranks reuse here. Every remaining category
 * with no existing SFM precedent (confirmed by a full repo icon audit)
 * gets a fresh pick from the same plain-geometric, single-shape family
 * the app's own proven icons already belong to — never an illustrative
 * or multi-detail glyph.
 *
 * Identity only — this module has no opinion on status, readiness, or
 * validation; those remain exclusively the province of the existing
 * Badge/validation pill system. A type this table has never seen (Relay,
 * or any future port type) resolves to the generic `Box` — Miscellaneous
 * — rather than guessing or leaving a gap.
 *
 * UX-001B.1 — Canonical Component Taxonomy. This module is now the one
 * place Strategic Fleet Manager defines glyph + display label + display
 * order for a component *system* (Cooler, Power Plant, Quantum Drive,
 * Shield, Weapon, ...), elevated from a Ship Workspace-only icon picker
 * to an app-wide taxonomy per the Design System Amendment: "Component
 * systems shall use the same glyph, ordering, terminology, and semantic
 * meaning regardless of page." `canonicalComponentCategoryKey()` is the
 * one classification switch (unchanged from the original
 * `componentCategoryIcon` body, just factored out so nothing else has to
 * duplicate this matching logic); `CANONICAL_COMPONENT_CATEGORY_ICON`,
 * `CANONICAL_COMPONENT_CATEGORY_LABEL`, and
 * `CANONICAL_COMPONENT_CATEGORY_ORDER` are plain lookups keyed off its
 * result, so `componentCategoryIcon()` itself becomes a one-line
 * composition of the two and every existing call site (Ship Workspace's
 * Systems table, `LoadoutPortTree`) keeps its exact prior behavior byte-
 * for-byte. Mission Control's Quartermaster Logistics (UX-001B.1) is the
 * first consumer of the label/order exports; future consumers (Fleet
 * Dashboard analytics, Decision Center, Manufacturing, Procurement,
 * Inventory, Analytics, Reporting, Notifications) should import from here
 * rather than inventing a parallel category list.
 */
export function canonicalComponentCategoryKey(hp: { type: string; assemblyRole?: string }): string {
  if (hp.assemblyRole === 'MANNED_TURRET') return 'MannedTurret'
  if (hp.assemblyRole === 'REMOTE_TURRET') return 'RemoteTurret'

  switch (hp.type) {
    case 'Cooler':
      return 'Cooler'
    case 'Power Plant':
      return 'PowerPlant'
    case 'Quantum Drive':
    case 'QuantumDrive':
      return 'QuantumDrive'
    case 'Jump Drive':
      return 'JumpDrive'
    case 'Shield':
      return 'Shield'
    case 'Radar':
      return 'Radar'
    case 'Missile Rack':
      return 'MissileRack'
    case 'Missile':
      return 'Missile'
    case 'Gimbal Mount':
    case 'Weapon':
      return 'Weapon'
    case 'Mining Laser':
      return 'MiningLaser'
    case 'Salvage Module':
    case 'Salvage Modifier':
      return 'Salvage'
    case 'Utility':
      return 'Utility'
    case 'Life Support':
      return 'LifeSupport'
    default:
      return 'Other'
  }
}

/** Required categories (UX-001B.1 Deliverable 1) lead the order; the
 * remaining categories are the explicitly-approved "additive, same
 * pattern" future set (Deliverable 1: "Future categories (Missiles,
 * Utility, Mining, Salvage, Tractor Systems, etc.)"). `MannedTurret`/
 * `RemoteTurret`/`Other` trail — assemblies and fallbacks, not individual
 * procurable component systems a Quartermaster shops for. */
export const CANONICAL_COMPONENT_CATEGORY_ORDER: string[] = [
  'Cooler',
  'PowerPlant',
  'QuantumDrive',
  'Shield',
  'Weapon',
  'MissileRack',
  'Missile',
  'JumpDrive',
  'Radar',
  'MiningLaser',
  'Salvage',
  'Utility',
  'LifeSupport',
  'MannedTurret',
  'RemoteTurret',
  'Other',
]

/** UX-001B.3 (Deliverable 3/4) — the stable, always-visible core set: a
 * Quartermaster should learn a fixed 5-card layout through repetition,
 * regardless of current fleet demand. The remaining "additive, same
 * pattern" categories above stay demand-driven (a fleet with zero Mining
 * or Salvage demand should not carry a permanent Mining/Salvage card) —
 * only this required set is exempt from that omission rule. */
export const CANONICAL_STABLE_CATEGORY_KEYS: string[] = ['Cooler', 'PowerPlant', 'QuantumDrive', 'Shield', 'Weapon']

export const CANONICAL_COMPONENT_CATEGORY_LABEL: Record<string, string> = {
  Cooler: 'Coolers',
  PowerPlant: 'Power Plants',
  QuantumDrive: 'Quantum Drives',
  Shield: 'Shields',
  Weapon: 'Weapons',
  MissileRack: 'Missile Racks',
  Missile: 'Missiles',
  JumpDrive: 'Jump Drives',
  Radar: 'Radar',
  MiningLaser: 'Mining',
  Salvage: 'Salvage',
  Utility: 'Utility',
  LifeSupport: 'Life Support',
  MannedTurret: 'Manned Turrets',
  RemoteTurret: 'Remote Turrets',
  Other: 'Other Systems',
}

export const CANONICAL_COMPONENT_CATEGORY_ICON: Record<string, LucideIcon> = {
  Cooler: Wind,
  PowerPlant: Zap,
  QuantumDrive: Rocket,
  Shield: Shield,
  Weapon: Crosshair,
  MissileRack: Package,
  Missile: CircleDot,
  JumpDrive: ArrowUpRight,
  Radar: Telescope,
  MiningLaser: Gem,
  Salvage: Anvil,
  Utility: Magnet,
  LifeSupport: Heart,
  MannedTurret: Target,
  RemoteTurret: Radio,
  Other: Box,
}

/** The canonical display label for a component's system, e.g. "Power
 * Plants" — plural, since every consumer so far (Mission Control's
 * demand cards) presents this as a fleet-wide aggregate, never a
 * per-unit label. */
export function canonicalComponentCategoryLabel(hp: { type: string; assemblyRole?: string }): string {
  return CANONICAL_COMPONENT_CATEGORY_LABEL[canonicalComponentCategoryKey(hp)] ?? CANONICAL_COMPONENT_CATEGORY_LABEL.Other
}

export function componentCategoryIcon(hp: { type: string; assemblyRole?: string }): LucideIcon {
  return CANONICAL_COMPONENT_CATEGORY_ICON[canonicalComponentCategoryKey(hp)] ?? Box
}
