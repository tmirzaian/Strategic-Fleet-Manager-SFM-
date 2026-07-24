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
  /** SW-013C.2B (Module Taxonomy Activation) — a real, first-class DataCore
   * equipment category (`AttachDef.Type: "Module"`, and the structurally
   * identical Hornet nose position filed under "Misc"), deliberately not
   * folded into `Utility`: unlike Utility's own family (SalvageHead/
   * SalvageModifier/TractorBeam/WeaponMining), same-category Modules are
   * NOT broadly interchangeable with each other (a Retaliator front-module
   * item and a Hornet center-mount item share a category but are never
   * swappable) — see docs/ModuleTaxonomyProposal.md's "Why not Utility"
   * section for the full reasoning. */
  | 'Modules'
  /** SW-013C.2D — Electronic Warfare (EMP generators, Quantum Dampener/
   * Interdiction devices). Its own equipment group rather than folded
   * into `Relays`/`LifeSupport`: those two share the "Support Systems"
   * top-level display section (see `topLevelGroupLabel` in
   * src/data/shipDefinitions.ts) but remain distinct groups for
   * inventory/filtering purposes — Electronic Warfare follows the exact
   * same pattern, distinct group, same display section. */
  | 'ElectronicWarfare'

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
  'Modules',
  'ElectronicWarfare',
]
