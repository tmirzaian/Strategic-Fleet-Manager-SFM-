import type { EquipmentGroup } from '../engine/types'
import { generateDisplayName } from './displayNameGenerator'

export interface PortClassification {
  include: boolean
  equipmentGroup: EquipmentGroup | null
  displayName: string
  positionLabel?: string
  /** Why this decision was made — surfaced in the debug panel / import report. */
  reason: string
}

/**
 * Maps a raw StarBreaker `portType` to the SFM `EquipmentGroup` it belongs
 * to. This is the ONE place that decides "is this port something a player
 * manages" — nothing else in the pipeline should scatter its own
 * string-matching against port types or names.
 *
 * Kept intentionally conservative: only port types explicitly called out
 * as user-manageable/readiness-relevant are included. Anything else
 * (doors, seats, lights, ATC managers, landing systems, controllers,
 * thrusters, fuel tanks/intakes, mesh helpers, animation joints) is
 * excluded — some explicitly listed below, everything else via the
 * default `include: false` fallback, so a raw port type nobody has seen
 * yet fails safe (excluded) rather than being guessed into the UI.
 */
const INCLUDED_TYPE_TO_GROUP: Record<string, EquipmentGroup> = {
  WeaponGun: 'Weapons',
  WeaponTurret: 'Weapons',
  GimbalMount: 'Weapons',
  Missile: 'Missiles',
  MissileRack: 'Missiles',
  Bomb: 'Missiles',
  Shield: 'Shields',
  PowerPlant: 'Power',
  Cooler: 'Coolers',
  QuantumDrive: 'QuantumDrive',
  Radar: 'Radar',
  LifeSupport: 'LifeSupport',
  Avionics: 'Avionics',
  Relay: 'Relays',
  MiningLaser: 'Mining',
  MiningModule: 'Mining',
  SalvageHead: 'Salvage',
  SalvageModule: 'Salvage',
  Utility: 'Utility',
  TractorBeam: 'Utility',
  Cargo: 'Cargo',
  CargoGrid: 'Cargo',
  Turret: 'Defense',
  PointDefense: 'Defense',
  Paint: 'Customization',
  Livery: 'Customization',
}

/** Explicitly excluded raw port types — listed for clarity/debugging even
 * though the default fallback (anything not in INCLUDED_TYPE_TO_GROUP) is
 * already excluded. */
const EXCLUDED_TYPES = new Set([
  'Door',
  'Light',
  'Seat',
  'Dashboard',
  'ATCManager',
  'LandingSystem',
  'LandingGear',
  'Controller',
  'Thruster',
  'FuelTank',
  'FuelIntake',
  'MeshHelper',
  'Joint',
  'Animation',
  'Geometry',
])

/**
 * Classifies a single raw loadout node. Pure function — no I/O, no
 * dependency on the rest of the raw document — so it's trivially unit
 * testable in isolation.
 */
export function classifyPort(
  internalName: string,
  portType: string | undefined,
  overrideMap?: Record<string, string>
): PortClassification {
  const { displayName, positionLabel } = generateDisplayName(internalName, overrideMap)

  if (!portType) {
    return { include: false, equipmentGroup: null, displayName, positionLabel, reason: 'No portType on raw node — cannot classify safely.' }
  }

  if (EXCLUDED_TYPES.has(portType)) {
    return { include: false, equipmentGroup: null, displayName, positionLabel, reason: `portType "${portType}" is explicitly excluded (non-user-manageable).` }
  }

  const group = INCLUDED_TYPE_TO_GROUP[portType]
  if (!group) {
    return { include: false, equipmentGroup: null, displayName, positionLabel, reason: `portType "${portType}" is not a recognized equipment group — excluded by default (fail safe).` }
  }

  return { include: true, equipmentGroup: group, displayName, positionLabel, reason: `portType "${portType}" maps to equipment group "${group}".` }
}
