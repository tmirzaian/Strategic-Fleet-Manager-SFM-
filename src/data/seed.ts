import type { Ship, Build, Hardpoint, HangarItem, LogEntry, BuildLibraryEntry } from '../types'
import { computeHardpointStatusWithValidation } from '../utils/hardpointStatus'

const SLOTS: Array<{ slotLabel: string; type: string; size: string }> = [
  { slotLabel: 'Weapon 1', type: 'Weapon', size: 'S4' },
  { slotLabel: 'Weapon 2', type: 'Weapon', size: 'S4' },
  { slotLabel: 'Power 1', type: 'Power Plant', size: 'S1' },
  { slotLabel: 'Power 2', type: 'Power Plant', size: 'S1' },
  { slotLabel: 'Shield 1', type: 'Shield', size: 'S1' },
  { slotLabel: 'Shield 2', type: 'Shield', size: 'S1' },
  { slotLabel: 'Cooler 1', type: 'Cooler', size: 'S1' },
  { slotLabel: 'Cooler 2', type: 'Cooler', size: 'S1' },
  { slotLabel: 'Quantum Drive', type: 'Quantum Drive', size: 'S2' },
  { slotLabel: 'Radar', type: 'Radar', size: 'S1' },
  { slotLabel: 'Life Support', type: 'Life Support', size: 'S1' },
]

/**
 * Builds one hardpoint row, deriving status from the corrected + compatibility-
 * validated logic (src/utils/hardpointStatus.ts).
 *
 * Factory fallback is 'Unknown Factory Item', never a bare "Factory
 * Component" placeholder (Sprint 1.3B.1 fix) — that string must never
 * reach the UI. Installed always seeds from Factory unless a caller
 * explicitly overrides it (e.g. to represent a player-removed part), so
 * Installed is only ever blank when the factory slot is itself genuinely
 * empty ('—') or the player intentionally cleared it.
 */
function row(
  shipId: string,
  buildId: string,
  slotIndex: number,
  overrides: Partial<{ factoryItem: string; installedItem: string; targetItem: string; type: string; size: string; parentSlotLabel: string }> = {}
): Hardpoint {
  const slot = SLOTS[slotIndex]
  const factoryItem = overrides.factoryItem ?? 'Unknown Factory Item'
  const installedItem = overrides.installedItem ?? factoryItem
  const targetItem = overrides.targetItem ?? factoryItem
  const type = overrides.type ?? slot.type
  const size = overrides.size ?? slot.size
  const { status, invalidMessage } = computeHardpointStatusWithValidation(installedItem, targetItem, factoryItem, type, size)
  return {
    id: `${buildId}-hp-${slotIndex}`,
    shipId,
    buildId,
    slotLabel: slot.slotLabel,
    type,
    size,
    factoryItem,
    installedItem,
    targetItem,
    status,
    invalidMessage,
    parentSlotLabel: overrides.parentSlotLabel,
  }
}

/**
 * Builds an arbitrary hardpoint row outside the fixed SLOTS array —
 * needed for ships with non-standard physical ports (turrets, gimbals,
 * mining heads, tractor beams, missile racks) that the 11-slot SLOTS
 * template can't express, and for nested child rows via `parentSlotLabel`
 * (Alpha 2.5C). Uses the same status/validation logic as `row()`.
 */
function customRow(
  shipId: string,
  buildId: string,
  params: {
    slotLabel: string
    type: string
    size: string
    factoryItem: string
    installedItem?: string
    targetItem?: string
    parentSlotLabel?: string
  }
): Hardpoint {
  const { slotLabel, type, size, factoryItem, parentSlotLabel } = params
  const installedItem = params.installedItem ?? factoryItem
  const targetItem = params.targetItem ?? factoryItem
  const { status, invalidMessage } = computeHardpointStatusWithValidation(installedItem, targetItem, factoryItem, type, size)
  return {
    id: `${buildId}-hp-${slotLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    shipId,
    buildId,
    slotLabel,
    type,
    size,
    factoryItem,
    installedItem,
    targetItem,
    status,
    invalidMessage,
    parentSlotLabel,
  }
}

/** Fleet-wide default: every slot factory-fresh and satisfied (OK). */
function defaultBuildHardpoints(shipId: string, buildId: string): Hardpoint[] {
  return SLOTS.map((_, i) => row(shipId, buildId, i))
}

// ---------------------------------------------------------------------------
// Ghost Mk II — the ship with full, hand-authored hardpoint detail.
// Two builds: Stealth (current focus) and Escort (new in Sprint 1.1).
// ---------------------------------------------------------------------------

const ghostStealthHardpoints: Hardpoint[] = [
  // Nose mount (Mission M-011): the Hornet Ghost's nose gimbal, with its
  // two weapon positions nested as children — authored through the same
  // generic customRow/parentSlotLabel mechanism Mole/Railen/Cutlass
  // Black/Corsair already use for their own turrets, not a UI special
  // case. The mount itself is always fully matched (factory = installed
  // = target) so adding it doesn't manufacture a new Missing/Upgrade
  // item for a ship that previously had none at these two slots.
  customRow('ghost', 'ghost-stealth', { slotLabel: 'Nose Mount', type: 'Gimbal Mount', size: 'S4', factoryItem: 'S4 Gimbal Mount' }),
  row('ghost', 'ghost-stealth', 0, { factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Mass Driver', parentSlotLabel: 'Nose Mount' }),
  row('ghost', 'ghost-stealth', 1, { factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Mass Driver', parentSlotLabel: 'Nose Mount' }),
  row('ghost', 'ghost-stealth', 2, { factoryItem: 'Regulus', installedItem: 'Regulus', targetItem: 'Slipstream' }),
  row('ghost', 'ghost-stealth', 3, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('ghost', 'ghost-stealth', 4, { factoryItem: 'AllStop', installedItem: 'Mirage', targetItem: 'Mirage' }),
  row('ghost', 'ghost-stealth', 5, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('ghost', 'ghost-stealth', 6, { factoryItem: 'CoolCore I', installedItem: 'CoolCore I', targetItem: 'Snowblind' }),
  row('ghost', 'ghost-stealth', 7, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  // Ghost Mk II ships an S1 Quantum Drive — Atlas (S1) is a correct, compatible target here.
  row('ghost', 'ghost-stealth', 8, { factoryItem: 'Atlas', installedItem: 'Atlas', targetItem: 'Atlas', size: 'S1' }),
  row('ghost', 'ghost-stealth', 9, { factoryItem: 'Bloodhound', installedItem: 'Bloodhound', targetItem: 'Bloodhound' }),
  row('ghost', 'ghost-stealth', 10, { factoryItem: 'Vector LS-4', installedItem: 'Vector LS-4', targetItem: 'Vector LS-4' }),
]

const ghostEscortHardpoints: Hardpoint[] = [
  // Same Nose Mount + two child weapon positions as the Stealth build —
  // every Loadout for a given ship shares the same physical port
  // structure, only target/installed selections differ between builds.
  customRow('ghost', 'ghost-escort', { slotLabel: 'Nose Mount', type: 'Gimbal Mount', size: 'S4', factoryItem: 'S4 Gimbal Mount' }),
  row('ghost', 'ghost-escort', 0, { factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Mass Driver', parentSlotLabel: 'Nose Mount' }),
  row('ghost', 'ghost-escort', 1, { factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Mass Driver', parentSlotLabel: 'Nose Mount' }),
  // Escort Build wants the same power upgrade as Stealth — demonstrates shared fleet-wide demand.
  row('ghost', 'ghost-escort', 2, { factoryItem: 'Regulus', installedItem: 'Regulus', targetItem: 'Slipstream' }),
  row('ghost', 'ghost-escort', 3, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  // Installed is already Mirage (changed from factory), but Escort's target is FR-66 —
  // this is an Upgrade Available, not Missing, per the corrected logic. The Upgrade
  // Opportunity recommendation always reads this targetItem directly (Sprint 1.3B.1) —
  // never a separately-guessed alternative.
  row('ghost', 'ghost-escort', 4, { factoryItem: 'AllStop', installedItem: 'Mirage', targetItem: 'FR-66' }),
  row('ghost', 'ghost-escort', 5, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('ghost', 'ghost-escort', 6, { factoryItem: 'CoolCore I', installedItem: 'CoolCore I', targetItem: 'CoolCore II' }),
  row('ghost', 'ghost-escort', 7, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('ghost', 'ghost-escort', 8, { factoryItem: 'Atlas', installedItem: 'Atlas', targetItem: 'Atlas', size: 'S1' }),
  row('ghost', 'ghost-escort', 9, { factoryItem: 'Bloodhound', installedItem: 'Bloodhound', targetItem: 'Bloodhound' }),
  row('ghost', 'ghost-escort', 10, { factoryItem: 'Vector LS-4', installedItem: 'Vector LS-4', targetItem: 'Vector LS-4' }),
]

// ---------------------------------------------------------------------------
// Remaining fleet — lighter hardpoint detail, but statuses run through the
// same corrected logic so Ship Detail is reliable for every ship.
// ---------------------------------------------------------------------------

const molePlan = 'mole-mining'
const moleHardpoints: Hardpoint[] = [
  // Two mining turret assemblies, each with a real mining head child —
  // turret 1's head also has a mining module grandchild (Alpha 2.5C).
  customRow('mole', molePlan, { slotLabel: 'Mining Turret 1', type: 'Mining Mount', size: 'S2', factoryItem: 'S2 Mining Turret' }),
  customRow('mole', molePlan, {
    slotLabel: 'Mining Head 1',
    type: 'Mining Laser',
    size: 'S2',
    factoryItem: 'Arbor MH1',
    installedItem: 'Arbor MH1',
    targetItem: 'Helix II',
    parentSlotLabel: 'Mining Turret 1',
  }),
  customRow('mole', molePlan, {
    slotLabel: 'Mining Module 1',
    type: 'Mining Module',
    size: 'S1',
    factoryItem: '—',
    installedItem: '—',
    targetItem: 'Rieger-C3',
    parentSlotLabel: 'Mining Head 1',
  }),
  customRow('mole', molePlan, { slotLabel: 'Mining Turret 2', type: 'Mining Mount', size: 'S2', factoryItem: 'S2 Mining Turret' }),
  customRow('mole', molePlan, {
    slotLabel: 'Mining Head 2',
    type: 'Mining Laser',
    size: 'S1',
    factoryItem: 'Arbor MH1',
    installedItem: 'Arbor MH1',
    targetItem: 'Arbor MH1',
    parentSlotLabel: 'Mining Turret 2',
  }),
  // Core ship components.
  ...SLOTS.slice(2, 6).map((_, i) => row('mole', molePlan, i + 2)),
  row('mole', molePlan, 6, { type: 'Cooler', size: 'S2', factoryItem: 'CoolCore I', installedItem: 'CoolCore I', targetItem: 'Blizzard' }),
  ...SLOTS.slice(7).map((_, i) => row('mole', molePlan, i + 7)),
]

const railenPlan = 'railen-cargo'
const railenHardpoints: Hardpoint[] = [
  // Four pilot-controlled S4 weapons (Alpha 2.5C, Part 8 golden fixture).
  customRow('railen', railenPlan, { slotLabel: 'Pilot Weapon 1', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' }),
  customRow('railen', railenPlan, { slotLabel: 'Pilot Weapon 2', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' }),
  customRow('railen', railenPlan, { slotLabel: 'Pilot Weapon 3', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' }),
  customRow('railen', railenPlan, { slotLabel: 'Pilot Weapon 4', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' }),
  // Two side turret assemblies, each with two real S3 child weapon ports.
  customRow('railen', railenPlan, { slotLabel: 'Port Turret', type: 'Turret Mount', size: 'S3', factoryItem: 'S3 Turret Mount' }),
  customRow('railen', railenPlan, { slotLabel: 'Port Turret Left Weapon', type: 'Weapon', size: 'S3', factoryItem: 'Turret Repeater', parentSlotLabel: 'Port Turret' }),
  customRow('railen', railenPlan, { slotLabel: 'Port Turret Right Weapon', type: 'Weapon', size: 'S3', factoryItem: 'Turret Repeater', parentSlotLabel: 'Port Turret' }),
  customRow('railen', railenPlan, { slotLabel: 'Starboard Turret', type: 'Turret Mount', size: 'S3', factoryItem: 'S3 Turret Mount' }),
  customRow('railen', railenPlan, { slotLabel: 'Starboard Turret Left Weapon', type: 'Weapon', size: 'S3', factoryItem: 'Turret Repeater', parentSlotLabel: 'Starboard Turret' }),
  customRow('railen', railenPlan, { slotLabel: 'Starboard Turret Right Weapon', type: 'Weapon', size: 'S3', factoryItem: 'Turret Repeater', parentSlotLabel: 'Starboard Turret' }),
  // Tractor beam hardpoints — Railen doesn't ship with them stocked, genuinely empty from factory.
  customRow('railen', railenPlan, { slotLabel: 'Fore Tractor Beam', type: 'Utility', size: 'S2', factoryItem: '—', installedItem: '—', targetItem: 'Tractor Beam' }),
  customRow('railen', railenPlan, { slotLabel: 'Aft Tractor Beam', type: 'Utility', size: 'S2', factoryItem: '—', installedItem: '—', targetItem: 'Tractor Beam' }),
  // Core ship components.
  customRow('railen', railenPlan, { slotLabel: 'Power Plant', type: 'Power Plant', size: 'S1', factoryItem: 'Regulus' }),
  customRow('railen', railenPlan, { slotLabel: 'Shield Generator', type: 'Shield', size: 'S1', factoryItem: 'Mirage' }),
  customRow('railen', railenPlan, { slotLabel: 'Cooler', type: 'Cooler', size: 'S1', factoryItem: 'CoolCore I' }),
  customRow('railen', railenPlan, { slotLabel: 'Quantum Drive', type: 'Quantum Drive', size: 'S1', factoryItem: 'Atlas' }),
  customRow('railen', railenPlan, { slotLabel: 'Radar', type: 'Radar', size: 'S1', factoryItem: 'Bloodhound' }),
  customRow('railen', railenPlan, { slotLabel: 'Life Support', type: 'Life Support', size: 'S1', factoryItem: 'Vector LS-4' }),
]

const cutlassBlackPlan = 'cutlass-black-utility'
const cutlassBlackHardpoints: Hardpoint[] = [
  // Missile Rack target corrected to a real missile-rack-compatible item
  // (Alpha 2.4, Part 10) — this previously targeted FR-86, which is
  // actually an S3 Shield, not a missile rack item. That mismatch was
  // masked by FR-86 itself being miscategorized in the component catalog
  // until this sprint's data-validation pass fixed it there too.
  row('cutlass-black', cutlassBlackPlan, 0, { type: 'Missile Rack', size: 'S3', factoryItem: 'CS-12', installedItem: 'CS-12', targetItem: 'CS-12' }),
  ...SLOTS.slice(1, 6).map((_, i) => row('cutlass-black', cutlassBlackPlan, i + 1)),
  row('cutlass-black', cutlassBlackPlan, 6, { type: 'Cooler', size: 'S2', factoryItem: 'CoolCore I', installedItem: 'CoolCore I', targetItem: 'Military Cooler' }),
  ...SLOTS.slice(7).map((_, i) => row('cutlass-black', cutlassBlackPlan, i + 7)),
  // Top turret with two real child weapon ports, plus a tractor beam
  // utility port (Alpha 2.5C, Part 9 golden fixture).
  customRow('cutlass-black', cutlassBlackPlan, { slotLabel: 'Top Turret', type: 'Turret Mount', size: 'S2', factoryItem: 'S2 Turret Mount' }),
  customRow('cutlass-black', cutlassBlackPlan, { slotLabel: 'Top Turret Left Weapon', type: 'Weapon', size: 'S2', factoryItem: 'Bulldog Repeater', parentSlotLabel: 'Top Turret' }),
  customRow('cutlass-black', cutlassBlackPlan, { slotLabel: 'Top Turret Right Weapon', type: 'Weapon', size: 'S2', factoryItem: 'Bulldog Repeater', parentSlotLabel: 'Top Turret' }),
  customRow('cutlass-black', cutlassBlackPlan, { slotLabel: 'Tractor Beam', type: 'Utility', size: 'S2', factoryItem: '—', installedItem: '—', targetItem: 'Tractor Beam' }),
]

const cutlassRedPlan = 'cutlass-red-medical'
const cutlassRedHardpoints: Hardpoint[] = [
  ...SLOTS.slice(0, 4).map((_, i) => row('cutlass-red', cutlassRedPlan, i)),
  row('cutlass-red', cutlassRedPlan, 4, { type: 'Shield', size: 'S2', factoryItem: 'AllStop', installedItem: 'AllStop', targetItem: 'Shield Array' }),
  ...SLOTS.slice(5).map((_, i) => row('cutlass-red', cutlassRedPlan, i + 5)),
]

const m80Plan = 'm80-speed'
const m80Hardpoints: Hardpoint[] = [
  ...SLOTS.slice(0, 8).map((_, i) => row('m80', m80Plan, i)),
  // Deliberately invalid seed data (Sprint 1.3B.1 P0 Defect 3 example): M80's Quantum
  // Drive port is S2 (SLOTS default, not overridden), but Atlas is an S1 drive — an
  // impossible target. This is intentionally left as-is so the compatibility
  // engine's INVALID TARGET status has a real case to catch; see the sprint summary
  // for why this isn't "fixed" by simply swapping the item.
  row('m80', m80Plan, 8, { factoryItem: 'Atlas', installedItem: '—', targetItem: 'Atlas' }),
  ...SLOTS.slice(9).map((_, i) => row('m80', m80Plan, i + 9)),
]

const starlitePlan = 'starlite-default'
const starliteHardpoints: Hardpoint[] = [
  // Starlite is explicitly "Unknown / Future" — Unknown Factory Item is the
  // honest placeholder here, not a data gap to paper over.
  row('starlite', starlitePlan, 0, { type: 'Unknown', size: 'S1', factoryItem: 'Unknown Factory Item', installedItem: 'Unknown Factory Item', targetItem: 'Unidentified Component' }),
  ...SLOTS.slice(1).map((_, i) => row('starlite', starlitePlan, i + 1)),
]

const vulturePlan = 'vulture-salvage'
const vultureHardpoints: Hardpoint[] = [
  customRow('vulture', vulturePlan, { slotLabel: 'Salvage Mount', type: 'Salvage Mount', size: 'S2', factoryItem: 'S2 Salvage Mount' }),
  customRow('vulture', vulturePlan, {
    slotLabel: 'Salvage Head',
    type: 'Salvage Module',
    size: 'S2',
    factoryItem: 'Stock Salvage Head',
    installedItem: 'Stock Salvage Head',
    targetItem: 'Salvage Head (RM Series)',
    parentSlotLabel: 'Salvage Mount',
  }),
  customRow('vulture', vulturePlan, { slotLabel: 'Tractor Beam', type: 'Utility', size: 'S2', factoryItem: '—', installedItem: '—', targetItem: 'Tractor Beam' }),
  ...SLOTS.slice(1).map((_, i) => row('vulture', vulturePlan, i + 1)),
]

const prospectorPlan = 'prospector-mining'
const prospectorHardpoints: Hardpoint[] = [
  // Prospector ships stock with Arbor MH1 — the target is a genuine upgrade
  // away from that, not a re-statement of the same stock item.
  row('prospector', prospectorPlan, 0, { type: 'Mining Laser', size: 'S1', factoryItem: 'Arbor MH1', installedItem: 'Arbor MH1', targetItem: 'Helix I' }),
  ...SLOTS.slice(1).map((_, i) => row('prospector', prospectorPlan, i + 1)),
]

// ---------------------------------------------------------------------------
// Corsair — a real, finished custom Build (not a Factory-only stand-in).
// Every relevant slot has an actual named component, fully matched —
// this is the "player customized and finished the project" case, distinct
// from a Factory-only ship that merely happens to read 100% because
// nothing has been targeted yet.
// ---------------------------------------------------------------------------
const corsairPlan = 'corsair-gunship'
const corsairHardpoints: Hardpoint[] = [
  row('corsair', corsairPlan, 0, { factoryItem: 'Bulldog Repeater', installedItem: 'Bulldog Repeater', targetItem: 'Bulldog Repeater' }),
  row('corsair', corsairPlan, 1, { factoryItem: 'Bulldog Repeater', installedItem: 'Bulldog Repeater', targetItem: 'Bulldog Repeater' }),
  row('corsair', corsairPlan, 2, { factoryItem: 'Atlas PP', installedItem: 'Atlas PP', targetItem: 'Atlas PP' }),
  row('corsair', corsairPlan, 3, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('corsair', corsairPlan, 4, { factoryItem: 'AllStop', installedItem: 'AllStop', targetItem: 'AllStop' }),
  row('corsair', corsairPlan, 5, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('corsair', corsairPlan, 6, { factoryItem: 'CoolCore I', installedItem: 'CoolCore I', targetItem: 'CoolCore I' }),
  row('corsair', corsairPlan, 7, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('corsair', corsairPlan, 8, { factoryItem: 'Atlas', installedItem: 'Atlas', targetItem: 'Atlas', size: 'S1' }),
  row('corsair', corsairPlan, 9, { factoryItem: 'Bloodhound', installedItem: 'Bloodhound', targetItem: 'Bloodhound' }),
  row('corsair', corsairPlan, 10, { factoryItem: 'Vector LS-4', installedItem: 'Vector LS-4', targetItem: 'Vector LS-4' }),
  // Manned remote turret — both child weapons fully matched, so this
  // addition never disturbs Corsair's genuine Mission Ready status
  // (Golden Scenario D from Alpha 2.0/2.1 still holds).
  customRow('corsair', corsairPlan, { slotLabel: 'Remote Turret', type: 'Turret Mount', size: 'S2', factoryItem: 'S2 Remote Turret' }),
  customRow('corsair', corsairPlan, { slotLabel: 'Remote Turret Left Weapon', type: 'Weapon', size: 'S2', factoryItem: 'Bulldog Repeater', parentSlotLabel: 'Remote Turret' }),
  customRow('corsair', corsairPlan, { slotLabel: 'Remote Turret Right Weapon', type: 'Weapon', size: 'S2', factoryItem: 'Bulldog Repeater', parentSlotLabel: 'Remote Turret' }),
]

export const hardpoints: Hardpoint[] = [
  ...ghostStealthHardpoints,
  ...ghostEscortHardpoints,
  ...moleHardpoints,
  ...railenHardpoints,
  ...corsairHardpoints,
  ...defaultBuildHardpoints('135c', '135c-shuttle'),
  ...cutlassBlackHardpoints,
  ...cutlassRedHardpoints,
  ...m80Hardpoints,
  ...starliteHardpoints,
  ...defaultBuildHardpoints('utv', 'utv-default'),
  ...vultureHardpoints,
  ...prospectorHardpoints,
]

function missingFor(buildId: string): string[] {
  return hardpoints
    .filter((h) => h.buildId === buildId && (h.status === 'Missing' || h.status === 'Upgrade Available'))
    .map((h) => h.targetItem)
}

export const builds: Build[] = [
  { id: 'ghost-stealth', shipId: 'ghost', name: 'Stealth Build', role: 'Stealth Fighter', readiness: 82, isActive: true, missing: missingFor('ghost-stealth'), kind: 'CUSTOM' },
  { id: 'ghost-escort', shipId: 'ghost', name: 'Escort Build', role: 'Escort / Close Support', readiness: 55, isActive: false, missing: missingFor('ghost-escort'), kind: 'CUSTOM' },
  { id: 'corsair-gunship', shipId: 'corsair', name: 'Gunship Build', role: 'Gunship / Ground Support', readiness: 100, isActive: true, missing: missingFor('corsair-gunship'), kind: 'CUSTOM' },
  { id: 'mole-mining', shipId: 'mole', name: 'Mining Build', role: 'Mining', readiness: 71, isActive: true, missing: missingFor('mole-mining'), kind: 'CUSTOM' },
  { id: 'railen-cargo', shipId: 'railen', name: 'Cargo Build', role: 'Cargo Hauler', readiness: 89, isActive: true, missing: missingFor('railen-cargo'), kind: 'CUSTOM' },
  { id: '135c-shuttle', shipId: '135c', name: 'Factory Loadout', role: 'Stealth Shuttle', readiness: 100, isActive: true, missing: missingFor('135c-shuttle'), kind: 'FACTORY' },
  { id: 'cutlass-black-utility', shipId: 'cutlass-black', name: 'Military Utility Build', role: 'Daily Driver', readiness: 74, isActive: true, missing: missingFor('cutlass-black-utility'), kind: 'CUSTOM' },
  { id: 'cutlass-red-medical', shipId: 'cutlass-red', name: 'Medical Support Build', role: 'Rescue / Medical', readiness: 80, isActive: true, missing: missingFor('cutlass-red-medical'), kind: 'CUSTOM' },
  { id: 'm80-speed', shipId: 'm80', name: 'Speed Build', role: 'Fast Interceptor', readiness: 70, isActive: true, missing: missingFor('m80-speed'), kind: 'CUSTOM' },
  { id: 'starlite-default', shipId: 'starlite', name: 'Default Build', role: 'Future Gameplay', readiness: 50, isActive: true, missing: missingFor('starlite-default'), kind: 'CUSTOM' },
  { id: 'utv-default', shipId: 'utv', name: 'Factory Loadout', role: 'Utility Vehicle', readiness: 100, isActive: true, missing: missingFor('utv-default'), kind: 'FACTORY' },
  { id: 'vulture-salvage', shipId: 'vulture', name: 'Salvage Build', role: 'Salvage', readiness: 65, isActive: true, missing: missingFor('vulture-salvage'), kind: 'CUSTOM' },
  { id: 'prospector-mining', shipId: 'prospector', name: 'Mining Build', role: 'Solo Mining', readiness: 60, isActive: true, missing: missingFor('prospector-mining'), kind: 'CUSTOM' },
]

function buildFor(shipId: string): Build {
  return builds.find((b) => b.shipId === shipId && b.isActive) ?? builds.find((b) => b.shipId === shipId)!
}

export const ships: Ship[] = [
  {
    id: 'ghost', name: 'F7C-S Hornet Ghost Mk II', manufacturer: 'Anvil', ownership: 'Owned', career: 'Combat',
    role: 'Stealth Fighter', activeBuildId: 'ghost-stealth', readiness: buildFor('ghost').readiness, priority: 1,
    missing: buildFor('ghost').missing, imageUrl: 'https://media.robertsspaceindustries.com/thvu42fxnagbh/slideshow.jpg', lastUpdated: '2 hours ago',
  },
  {
    id: 'corsair', name: 'Corsair', manufacturer: 'Drake', ownership: 'Owned', career: 'Combat / Exploration',
    role: 'Gunship / Ground Support', activeBuildId: 'corsair-gunship', readiness: buildFor('corsair').readiness, priority: 3,
    missing: buildFor('corsair').missing, imageUrl: 'https://media.robertsspaceindustries.com/9y19hajivybqc/slideshow.jpg', lastUpdated: '3 days ago',
  },
  {
    id: 'mole', name: 'MOLE', manufacturer: 'Argo', ownership: 'Owned', career: 'Industrial',
    role: 'Mining', activeBuildId: 'mole-mining', readiness: buildFor('mole').readiness, priority: 2,
    missing: buildFor('mole').missing, imageUrl: 'https://media.robertsspaceindustries.com/wgai60tvwa3vs/slideshow.jpg', lastUpdated: '1 day ago',
  },
  {
    id: 'railen', name: 'Railen', manufacturer: 'Gatac', ownership: 'Owned', career: 'Cargo',
    role: 'Cargo Hauler', activeBuildId: 'railen-cargo', readiness: buildFor('railen').readiness, priority: 4,
    missing: buildFor('railen').missing, imageUrl: 'https://media.robertsspaceindustries.com/3hlrf4bj6k5r7/slideshow.jpg', lastUpdated: '5 days ago',
  },
  {
    id: '135c', name: '135c', manufacturer: 'Origin', ownership: 'Owned', career: 'Transport',
    role: 'Stealth Shuttle', activeBuildId: '135c-shuttle', readiness: buildFor('135c').readiness, priority: 5,
    missing: buildFor('135c').missing, imageUrl: 'https://media.robertsspaceindustries.com/ftaf8t452ad1o/slideshow.jpg', lastUpdated: '6 days ago',
  },
  {
    id: 'cutlass-black', name: 'Cutlass Black', manufacturer: 'Drake', ownership: 'Owned', career: 'Multi-role',
    role: 'Daily Driver', activeBuildId: 'cutlass-black-utility', readiness: buildFor('cutlass-black').readiness, priority: 6,
    missing: buildFor('cutlass-black').missing, imageUrl: 'https://media.robertsspaceindustries.com/56iszc92bl9oi/slideshow.jpg', lastUpdated: '1 week ago',
  },
  {
    id: 'cutlass-red', name: 'Cutlass Red', manufacturer: 'Drake', ownership: 'Owned', career: 'Medical',
    role: 'Rescue / Medical', activeBuildId: 'cutlass-red-medical', readiness: buildFor('cutlass-red').readiness, priority: 7,
    missing: buildFor('cutlass-red').missing, imageUrl: 'https://media.robertsspaceindustries.com/wqa6lfco4amc0/slideshow.jpg', lastUpdated: '1 week ago',
  },
  {
    id: 'm80', name: 'M80', manufacturer: 'Mirai', ownership: 'Owned', career: 'Racing / Combat',
    role: 'Fast Interceptor', activeBuildId: 'm80-speed', readiness: buildFor('m80').readiness, priority: 8,
    missing: buildFor('m80').missing, imageUrl: 'https://media.robertsspaceindustries.com/nledgsyyzmjov/slideshow.jpg', lastUpdated: '2 weeks ago',
  },
  {
    id: 'starlite', name: 'Starlite', manufacturer: 'Crusader', ownership: 'Owned', career: 'Unknown / Future',
    role: 'Future Gameplay', activeBuildId: 'starlite-default', readiness: buildFor('starlite').readiness, priority: 9,
    missing: buildFor('starlite').missing, imageUrl: 'https://media.robertsspaceindustries.com/6cdv5u7nvigrn/slideshow.jpg', lastUpdated: '3 weeks ago',
  },
  {
    id: 'utv', name: 'UTV', manufacturer: 'Tumbril', ownership: 'Owned', career: 'Ground',
    role: 'Utility Vehicle', activeBuildId: 'utv-default', readiness: buildFor('utv').readiness, priority: 10,
    missing: buildFor('utv').missing, imageUrl: 'https://media.robertsspaceindustries.com/szj2zc8m5hair/slideshow.jpg', lastUpdated: '1 month ago',
  },
  {
    id: 'vulture', name: 'Vulture', manufacturer: 'Drake', ownership: 'Purchased', career: 'Salvage',
    role: 'Salvage', activeBuildId: 'vulture-salvage', readiness: buildFor('vulture').readiness, priority: 2,
    missing: buildFor('vulture').missing, imageUrl: 'https://media.robertsspaceindustries.com/jggtvws2rhu3y/slideshow.jpg', lastUpdated: '4 days ago',
  },
  {
    id: 'prospector', name: 'Prospector', manufacturer: 'MISC', ownership: 'Loaner', career: 'Mining',
    role: 'Solo Mining', activeBuildId: 'prospector-mining', readiness: buildFor('prospector').readiness, priority: 11,
    missing: buildFor('prospector').missing, imageUrl: 'https://media.robertsspaceindustries.com/7rfmcpg9qcpmm/slideshow.jpg', lastUpdated: '2 weeks ago',
  },
]

// ---------------------------------------------------------------------------
// Hangar Inventory — vendor trash is never stored here (Sprint 1.1).
// ---------------------------------------------------------------------------

export const hangarItems: HangarItem[] = [
  { id: 'item-1', name: 'Slipstream', type: 'Power Plant', size: 'S1', qty: 0, neededBy: 'Ghost Mk II — Stealth Build, Escort Build', disposition: 'Install' },
  { id: 'item-2', name: 'Snowblind', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'Ghost Mk II — Stealth Build', disposition: 'Install' },
  { id: 'item-3', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'Ghost Mk II — Stealth Build', disposition: 'Install' },
  { id: 'item-4', name: 'Helix II', type: 'Mining Laser', size: 'S2', qty: 0, neededBy: 'MOLE — Mining Build', disposition: 'Install' },
  { id: 'item-5', name: 'Rieger-C3', type: 'Mining Module', size: 'S1', qty: 0, neededBy: 'MOLE — Mining Build', disposition: 'Install' },
  { id: 'item-6', name: 'Blizzard', type: 'Cooler', size: 'S2', qty: 0, neededBy: 'MOLE — Mining Build', disposition: 'Install' },
  { id: 'item-7', name: 'Tractor Beam', type: 'Utility', size: 'S2', qty: 0, neededBy: 'Railen — Cargo Build', disposition: 'Install' },
  { id: 'item-9', name: 'FR-86', type: 'Missile Rack', size: 'S3', qty: 0, neededBy: 'Cutlass Black — Military Utility Build', disposition: 'Store' },
  { id: 'item-10', name: 'Military Cooler', type: 'Cooler', size: 'S2', qty: 0, neededBy: 'Cutlass Black — Military Utility Build', disposition: 'Install' },
  { id: 'item-11', name: 'Spare Ballistic Gimbal', type: 'Gimbal', size: 'S3', qty: 2, neededBy: 'None', disposition: 'Store' },
  { id: 'item-12', name: 'Salvage Head (RM Series)', type: 'Salvage Module', size: 'S2', qty: 0, neededBy: 'Vulture — Salvage Build', disposition: 'Install' },
]

export const initialLog: LogEntry[] = [
  {
    id: 'log-1',
    timestamp: '2 hours ago',
    action: 'Installed component',
    shipName: 'F7C-S Hornet Ghost Mk II',
    itemName: 'Mirage',
    details: 'Installed Mirage shield on Ghost',
    readinessBefore: 72,
    readinessAfter: 82,
  },
  {
    id: 'log-2',
    timestamp: '1 day ago',
    action: 'Added to Hangar',
    itemName: 'Snowblind',
    details: 'Added Snowblind to Hangar',
  },
  {
    id: 'log-3',
    timestamp: '3 days ago',
    action: 'Build created',
    shipName: 'F7C-S Hornet Ghost Mk II',
    itemName: 'Escort Build',
    details: 'Created Escort Build for Ghost Mk II',
  },
  {
    id: 'log-4',
    timestamp: '2 hours ago',
    action: 'Readiness update',
    shipName: 'F7C-S Hornet Ghost Mk II',
    details: 'Ghost readiness increased 72% to 82%',
    readinessBefore: 72,
    readinessAfter: 82,
  },
]

export const findItemCatalog: Array<{ path: string; item: string }> = [
  { path: 'VEH. COMP. S1 → POWERPLANT → Slipstream', item: 'Slipstream' },
  { path: 'VEH. COMP. S1 → SHIELD → Mirage', item: 'Mirage' },
  { path: 'VEH. COMP. S1 → COOLER → Snowblind', item: 'Snowblind' },
  { path: 'VEH. WEAPONS S4 → BALLISTIC → Revenant', item: 'Revenant' },
  { path: 'VEH. COMP. S3 → SHIELD → FR-86', item: 'FR-86' },
]

// Build Library — reusable reference templates shown in Build Manager,
// independent of any one ship's Assigned Ship Builds.
export const buildLibrary: BuildLibraryEntry[] = [
  { id: 'lib-stealth', name: 'Stealth Build', category: 'Combat', description: 'Low emissions / stealth components' },
  { id: 'lib-military', name: 'Military Build', category: 'Combat', description: 'Tougher shields / military components' },
  { id: 'lib-mining', name: 'Mining Build', category: 'Industrial', description: 'Mining heads/modules/coolers' },
  { id: 'lib-daily', name: 'Daily Driver', category: 'Utility', description: 'General purpose everyday use' },
  { id: 'lib-cargo', name: 'Cargo Build', category: 'Cargo', description: 'Cargo hauling and support' },
  { id: 'lib-salvage', name: 'Salvage Build', category: 'Industrial', description: 'Salvage loop support' },
]

// Decision Center typeahead catalog. Each entry can carry a decision so the
// UI can show a recommendation the moment an item is selected, not just for
// the four originally-scripted demo items.
export interface CatalogItem {
  name: string
  headline: 'KEEP' | 'IGNORE'
  stars: number
  reason: string
  disposition: string
}

export const decisionCatalog: CatalogItem[] = [
  { name: 'Mirage', headline: 'KEEP', stars: 5, reason: 'Needed by Ghost Stealth Build', disposition: 'Install / Store' },
  { name: 'Slipstream', headline: 'KEEP', stars: 5, reason: 'Needed by Ghost Stealth Build', disposition: 'Install' },
  { name: 'Snowblind', headline: 'KEEP', stars: 4, reason: 'Needed by Ghost Stealth Build', disposition: 'Install' },
  { name: 'FR-86', headline: 'KEEP', stars: 4, reason: 'Needed by Corsair or Cutlass Black', disposition: 'Store' },
  { name: 'Revenant Gatling', headline: 'IGNORE', stars: 2, reason: 'No active build requires this item.', disposition: '—' },
  { name: 'Helix II', headline: 'KEEP', stars: 4, reason: 'Needed by MOLE Mining Build', disposition: 'Install' },
  { name: 'Rieger-C3', headline: 'KEEP', stars: 4, reason: 'Needed by MOLE Mining Build', disposition: 'Install' },
  { name: 'Blizzard', headline: 'KEEP', stars: 3, reason: 'Needed by MOLE Mining Build', disposition: 'Install' },
]

// Items in the typeahead list with no scripted decision still surface as
// suggestions, but resolve to "CHECK BUILD" rather than a KEEP/IGNORE guess.
export const decisionCatalogNames: string[] = [
  ...decisionCatalog.map((c) => c.name),
  'JS-300',
  'Civilian Grade A Power Plant',
  'Military Grade A Shield',
]
