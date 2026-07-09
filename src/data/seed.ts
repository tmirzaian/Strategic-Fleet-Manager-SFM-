import type { Ship, Build, Hardpoint, HangarItem, LogEntry } from '../types'
import { computeHardpointStatus } from '../utils/hardpointStatus'

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

/** Builds one hardpoint row, deriving status from the corrected logic. */
function row(
  shipId: string,
  buildId: string,
  slotIndex: number,
  overrides: Partial<{ factoryItem: string; installedItem: string; targetItem: string; type: string; size: string }> = {}
): Hardpoint {
  const slot = SLOTS[slotIndex]
  const factoryItem = overrides.factoryItem ?? 'Factory Component'
  const installedItem = overrides.installedItem ?? factoryItem
  const targetItem = overrides.targetItem ?? factoryItem
  return {
    id: `${buildId}-hp-${slotIndex}`,
    shipId,
    buildId,
    slotLabel: slot.slotLabel,
    type: overrides.type ?? slot.type,
    size: overrides.size ?? slot.size,
    factoryItem,
    installedItem,
    targetItem,
    status: computeHardpointStatus(installedItem, targetItem, factoryItem),
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
  row('ghost', 'ghost-stealth', 0, { factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Mass Driver' }),
  row('ghost', 'ghost-stealth', 1, { factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Mass Driver' }),
  row('ghost', 'ghost-stealth', 2, { factoryItem: 'Factory Power Plant', installedItem: 'Factory Power Plant', targetItem: 'Slipstream' }),
  row('ghost', 'ghost-stealth', 3, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('ghost', 'ghost-stealth', 4, { factoryItem: 'Factory Shield', installedItem: 'Mirage', targetItem: 'Mirage' }),
  row('ghost', 'ghost-stealth', 5, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('ghost', 'ghost-stealth', 6, { factoryItem: 'Factory Cooler', installedItem: 'Factory Cooler', targetItem: 'Snowblind' }),
  row('ghost', 'ghost-stealth', 7, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('ghost', 'ghost-stealth', 8, { factoryItem: 'Atlas', installedItem: 'Atlas', targetItem: 'Atlas' }),
  row('ghost', 'ghost-stealth', 9, { factoryItem: 'Factory Radar', installedItem: 'Factory Radar', targetItem: 'Factory Radar' }),
  row('ghost', 'ghost-stealth', 10, { factoryItem: 'Factory Life Support', installedItem: 'Factory Life Support', targetItem: 'Factory Life Support' }),
]

const ghostEscortHardpoints: Hardpoint[] = [
  row('ghost', 'ghost-escort', 0, { factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Mass Driver' }),
  row('ghost', 'ghost-escort', 1, { factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Mass Driver' }),
  // Escort Build wants the same power upgrade as Stealth — demonstrates shared fleet-wide demand.
  row('ghost', 'ghost-escort', 2, { factoryItem: 'Factory Power Plant', installedItem: 'Factory Power Plant', targetItem: 'Slipstream' }),
  row('ghost', 'ghost-escort', 3, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  // Installed is already Mirage (changed from factory), but Escort's target is a heavier shield —
  // this is an Upgrade Available, not Missing, per the corrected logic.
  row('ghost', 'ghost-escort', 4, { factoryItem: 'Factory Shield', installedItem: 'Mirage', targetItem: 'Debilitator' }),
  row('ghost', 'ghost-escort', 5, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('ghost', 'ghost-escort', 6, { factoryItem: 'Factory Cooler', installedItem: 'Factory Cooler', targetItem: 'CoolCore II' }),
  row('ghost', 'ghost-escort', 7, { factoryItem: '—', installedItem: '—', targetItem: '—' }),
  row('ghost', 'ghost-escort', 8, { factoryItem: 'Atlas', installedItem: 'Atlas', targetItem: 'Atlas' }),
  row('ghost', 'ghost-escort', 9, { factoryItem: 'Factory Radar', installedItem: 'Factory Radar', targetItem: 'Factory Radar' }),
  row('ghost', 'ghost-escort', 10, { factoryItem: 'Factory Life Support', installedItem: 'Factory Life Support', targetItem: 'Factory Life Support' }),
]

// ---------------------------------------------------------------------------
// Remaining fleet — lighter hardpoint detail, but statuses run through the
// same corrected logic so Ship Detail is reliable for every ship.
// ---------------------------------------------------------------------------

const molePlan = 'mole-mining'
const moleHardpoints: Hardpoint[] = [
  row('mole', molePlan, 0, { type: 'Mining Laser', size: 'S2', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'Helix II' }),
  row('mole', molePlan, 1, { type: 'Mining Module', size: 'S1', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'Rieger-C3' }),
  ...SLOTS.slice(2, 6).map((_, i) => row('mole', molePlan, i + 2)),
  row('mole', molePlan, 6, { type: 'Cooler', size: 'S2', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'Blizzard' }),
  ...SLOTS.slice(7).map((_, i) => row('mole', molePlan, i + 7)),
]

const railenPlan = 'railen-cargo'
const railenHardpoints: Hardpoint[] = [
  row('railen', railenPlan, 0, { type: 'Utility', size: 'S2', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'Tractor Beam' }),
  ...SLOTS.slice(1).map((_, i) => row('railen', railenPlan, i + 1)),
]

const cutlassBlackPlan = 'cutlass-black-utility'
const cutlassBlackHardpoints: Hardpoint[] = [
  row('cutlass-black', cutlassBlackPlan, 0, { type: 'Missile Rack', size: 'S3', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'FR-86' }),
  ...SLOTS.slice(1, 6).map((_, i) => row('cutlass-black', cutlassBlackPlan, i + 1)),
  row('cutlass-black', cutlassBlackPlan, 6, { type: 'Cooler', size: 'S2', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'Military Cooler' }),
  ...SLOTS.slice(7).map((_, i) => row('cutlass-black', cutlassBlackPlan, i + 7)),
]

const cutlassRedPlan = 'cutlass-red-medical'
const cutlassRedHardpoints: Hardpoint[] = [
  ...SLOTS.slice(0, 4).map((_, i) => row('cutlass-red', cutlassRedPlan, i)),
  row('cutlass-red', cutlassRedPlan, 4, { type: 'Shield', size: 'S2', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'Shield Array' }),
  ...SLOTS.slice(5).map((_, i) => row('cutlass-red', cutlassRedPlan, i + 5)),
]

const m80Plan = 'm80-speed'
const m80Hardpoints: Hardpoint[] = [
  ...SLOTS.slice(0, 8).map((_, i) => row('m80', m80Plan, i)),
  row('m80', m80Plan, 8, { factoryItem: 'Atlas', installedItem: '—', targetItem: 'Atlas' }),
  ...SLOTS.slice(9).map((_, i) => row('m80', m80Plan, i + 9)),
]

const starlitePlan = 'starlite-default'
const starliteHardpoints: Hardpoint[] = [
  row('starlite', starlitePlan, 0, { type: 'Unknown', size: 'S1', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'Unidentified Component' }),
  ...SLOTS.slice(1).map((_, i) => row('starlite', starlitePlan, i + 1)),
]

const vulturePlan = 'vulture-salvage'
const vultureHardpoints: Hardpoint[] = [
  row('vulture', vulturePlan, 0, { type: 'Salvage Module', size: 'S2', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'Salvage Head (RM Series)' }),
  ...SLOTS.slice(1).map((_, i) => row('vulture', vulturePlan, i + 1)),
]

const prospectorPlan = 'prospector-mining'
const prospectorHardpoints: Hardpoint[] = [
  row('prospector', prospectorPlan, 0, { type: 'Mining Laser', size: 'S1', factoryItem: 'Factory Component', installedItem: 'Factory Component', targetItem: 'Mining Laser (Arbor MH1)' }),
  ...SLOTS.slice(1).map((_, i) => row('prospector', prospectorPlan, i + 1)),
]

export const hardpoints: Hardpoint[] = [
  ...ghostStealthHardpoints,
  ...ghostEscortHardpoints,
  ...moleHardpoints,
  ...railenHardpoints,
  ...defaultBuildHardpoints('corsair', 'corsair-gunship'),
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
    .filter((h) => h.buildId === buildId && h.status !== 'OK')
    .map((h) => h.targetItem)
}

export const builds: Build[] = [
  { id: 'ghost-stealth', shipId: 'ghost', name: 'Stealth Build', role: 'Stealth Fighter', readiness: 82, isActive: true, missing: missingFor('ghost-stealth') },
  { id: 'ghost-escort', shipId: 'ghost', name: 'Escort Build', role: 'Escort / Close Support', readiness: 55, isActive: false, missing: missingFor('ghost-escort') },
  { id: 'corsair-gunship', shipId: 'corsair', name: 'Gunship Build', role: 'Gunship / Ground Support', readiness: 96, isActive: true, missing: missingFor('corsair-gunship') },
  { id: 'mole-mining', shipId: 'mole', name: 'Mining Build', role: 'Mining', readiness: 71, isActive: true, missing: missingFor('mole-mining') },
  { id: 'railen-cargo', shipId: 'railen', name: 'Cargo Build', role: 'Cargo Hauler', readiness: 89, isActive: true, missing: missingFor('railen-cargo') },
  { id: '135c-shuttle', shipId: '135c', name: 'Shuttle Build', role: 'Stealth Shuttle', readiness: 88, isActive: true, missing: missingFor('135c-shuttle') },
  { id: 'cutlass-black-utility', shipId: 'cutlass-black', name: 'Military Utility Build', role: 'Daily Driver', readiness: 74, isActive: true, missing: missingFor('cutlass-black-utility') },
  { id: 'cutlass-red-medical', shipId: 'cutlass-red', name: 'Medical Support Build', role: 'Rescue / Medical', readiness: 80, isActive: true, missing: missingFor('cutlass-red-medical') },
  { id: 'm80-speed', shipId: 'm80', name: 'Speed Build', role: 'Fast Interceptor', readiness: 70, isActive: true, missing: missingFor('m80-speed') },
  { id: 'starlite-default', shipId: 'starlite', name: 'Default Build', role: 'Future Gameplay', readiness: 50, isActive: true, missing: missingFor('starlite-default') },
  { id: 'utv-default', shipId: 'utv', name: 'Default Build', role: 'Utility Vehicle', readiness: 100, isActive: true, missing: missingFor('utv-default') },
  { id: 'vulture-salvage', shipId: 'vulture', name: 'Salvage Build', role: 'Salvage', readiness: 65, isActive: true, missing: missingFor('vulture-salvage') },
  { id: 'prospector-mining', shipId: 'prospector', name: 'Mining Build', role: 'Solo Mining', readiness: 60, isActive: true, missing: missingFor('prospector-mining') },
]

function buildFor(shipId: string): Build {
  return builds.find((b) => b.shipId === shipId && b.isActive) ?? builds.find((b) => b.shipId === shipId)!
}

export const ships: Ship[] = [
  {
    id: 'ghost', name: 'F7C-S Hornet Ghost Mk II', manufacturer: 'Anvil', ownership: 'Owned', career: 'Combat',
    role: 'Stealth Fighter', activeBuildId: 'ghost-stealth', readiness: buildFor('ghost').readiness, priority: 1,
    missing: buildFor('ghost').missing, location: 'Orison Hangar', lastUpdated: '2 hours ago',
  },
  {
    id: 'corsair', name: 'Corsair', manufacturer: 'Drake', ownership: 'Owned', career: 'Combat / Exploration',
    role: 'Gunship / Ground Support', activeBuildId: 'corsair-gunship', readiness: buildFor('corsair').readiness, priority: 3,
    missing: buildFor('corsair').missing, location: 'Orison Hangar', lastUpdated: '3 days ago',
  },
  {
    id: 'mole', name: 'MOLE', manufacturer: 'Argo', ownership: 'Owned', career: 'Industrial',
    role: 'Mining', activeBuildId: 'mole-mining', readiness: buildFor('mole').readiness, priority: 2,
    missing: buildFor('mole').missing, location: 'Orison Hangar', lastUpdated: '1 day ago',
  },
  {
    id: 'railen', name: 'Railen', manufacturer: 'Gatac', ownership: 'Owned', career: 'Cargo',
    role: 'Cargo Hauler', activeBuildId: 'railen-cargo', readiness: buildFor('railen').readiness, priority: 4,
    missing: buildFor('railen').missing, location: 'Orison Hangar', lastUpdated: '5 days ago',
  },
  {
    id: '135c', name: '135c', manufacturer: 'Origin', ownership: 'Owned', career: 'Transport',
    role: 'Stealth Shuttle', activeBuildId: '135c-shuttle', readiness: buildFor('135c').readiness, priority: 5,
    missing: buildFor('135c').missing, location: 'Orison Hangar', lastUpdated: '6 days ago',
  },
  {
    id: 'cutlass-black', name: 'Cutlass Black', manufacturer: 'Drake', ownership: 'Owned', career: 'Multi-role',
    role: 'Daily Driver', activeBuildId: 'cutlass-black-utility', readiness: buildFor('cutlass-black').readiness, priority: 6,
    missing: buildFor('cutlass-black').missing, location: 'Orison Hangar', lastUpdated: '1 week ago',
  },
  {
    id: 'cutlass-red', name: 'Cutlass Red', manufacturer: 'Drake', ownership: 'Owned', career: 'Medical',
    role: 'Rescue / Medical', activeBuildId: 'cutlass-red-medical', readiness: buildFor('cutlass-red').readiness, priority: 7,
    missing: buildFor('cutlass-red').missing, location: 'Orison Hangar', lastUpdated: '1 week ago',
  },
  {
    id: 'm80', name: 'M80', manufacturer: 'Mirai', ownership: 'Owned', career: 'Racing / Combat',
    role: 'Fast Interceptor', activeBuildId: 'm80-speed', readiness: buildFor('m80').readiness, priority: 8,
    missing: buildFor('m80').missing, location: 'Orison Hangar', lastUpdated: '2 weeks ago',
  },
  {
    id: 'starlite', name: 'Starlite', manufacturer: 'Crusader', ownership: 'Owned', career: 'Unknown / Future',
    role: 'Future Gameplay', activeBuildId: 'starlite-default', readiness: buildFor('starlite').readiness, priority: 9,
    missing: buildFor('starlite').missing, location: 'Orison Hangar', lastUpdated: '3 weeks ago',
  },
  {
    id: 'utv', name: 'UTV', manufacturer: 'Tumbril', ownership: 'Owned', career: 'Ground',
    role: 'Utility Vehicle', activeBuildId: 'utv-default', readiness: buildFor('utv').readiness, priority: 10,
    missing: buildFor('utv').missing, location: 'Orison Hangar', lastUpdated: '1 month ago',
  },
  {
    id: 'vulture', name: 'Vulture', manufacturer: 'Drake', ownership: 'Purchased', career: 'Salvage',
    role: 'Salvage', activeBuildId: 'vulture-salvage', readiness: buildFor('vulture').readiness, priority: 2,
    missing: buildFor('vulture').missing, location: 'Pledge Store (Pending Delivery)', lastUpdated: '4 days ago',
  },
  {
    id: 'prospector', name: 'Prospector', manufacturer: 'MISC', ownership: 'Loaner', career: 'Mining',
    role: 'Solo Mining', activeBuildId: 'prospector-mining', readiness: buildFor('prospector').readiness, priority: 11,
    missing: buildFor('prospector').missing, location: 'Orison Hangar', lastUpdated: '2 weeks ago',
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
]
