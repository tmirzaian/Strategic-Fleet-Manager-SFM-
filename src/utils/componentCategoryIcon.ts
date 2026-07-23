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
 */
export function componentCategoryIcon(hp: { type: string; assemblyRole?: string }): LucideIcon {
  if (hp.assemblyRole === 'MANNED_TURRET') return Target
  if (hp.assemblyRole === 'REMOTE_TURRET') return Radio

  switch (hp.type) {
    case 'Cooler':
      return Wind
    case 'Power Plant':
      return Zap
    case 'Quantum Drive':
    case 'QuantumDrive':
      return Rocket
    case 'Jump Drive':
      return ArrowUpRight
    case 'Shield':
      return Shield
    case 'Radar':
      return Telescope
    case 'Missile Rack':
      return Package
    case 'Missile':
      return CircleDot
    case 'Gimbal Mount':
    case 'Weapon':
      return Crosshair
    case 'Mining Laser':
      return Gem
    case 'Salvage Module':
    case 'Salvage Modifier':
      return Anvil
    case 'Utility':
      return Magnet
    case 'Life Support':
      return Heart
    default:
      return Box
  }
}
