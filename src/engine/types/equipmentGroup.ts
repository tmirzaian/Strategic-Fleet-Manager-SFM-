/**
 * EquipmentGroup — the logical grouping the UI uses to organize Ports and
 * Components (e.g. a Ship Detail hardpoint table section, a Hangar
 * Inventory filter). This is a UI/organizational concept layered on top of
 * the raw CIG data, not a field that exists in StarBreaker exports —
 * the Normalizer (via src/normalizer/portClassifier.ts) is responsible for
 * assigning each relevant Port one of these based on its raw port type.
 *
 * Expanded (generalized import pipeline sprint) to cover every
 * user-manageable/readiness-relevant category the importer is expected to
 * recognize, not just the original ten.
 */
export type EquipmentGroup =
  | 'Weapons'
  | 'Missiles'
  | 'Shields'
  | 'Power'
  | 'Coolers'
  | 'QuantumDrive'
  | 'Radar'
  | 'LifeSupport'
  | 'Avionics'
  | 'Relays'
  | 'Mining'
  | 'Salvage'
  | 'Utility'
  | 'Cargo'
  | 'Defense'
  | 'Customization'

export const EQUIPMENT_GROUPS: EquipmentGroup[] = [
  'Weapons',
  'Missiles',
  'Shields',
  'Power',
  'Coolers',
  'QuantumDrive',
  'Radar',
  'LifeSupport',
  'Avionics',
  'Relays',
  'Mining',
  'Salvage',
  'Utility',
  'Cargo',
  'Defense',
  'Customization',
]
