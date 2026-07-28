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

// ---------------------------------------------------------------------------
// Remaining fleet — lighter hardpoint detail, but statuses run through the
// same corrected logic so Ship Detail is reliable for every ship.
// ---------------------------------------------------------------------------

const m80Plan = 'm80-speed'
// EWO-031 (Task 6/7) audit note: unlike 135c/UTV/Mole/Cutlass Black/
// Vulture/Prospector (all fixed this mission — see their own comments),
// M80 is DELIBERATELY left with real, unresolved 'Unknown Factory Item'
// placeholders on slots 0-7 and 9-10, and is NOT part of that fix. It is
// the fleet's own regression fixture for genuinely unresolved factory
// data — `src/utils/__tests__/unresolvedFactoryData.test.ts` asserts M80
// has "at least one real Unresolved hardpoint in the actual seed data
// (not hand-patched away)", and Golden Scenario H (Sprint 1.3B.1) depends
// on this exact ship staying unresolved. Filling these in would silently
// remove the one real-seed-data proof that Unresolved status is reachable
// outside a synthetic fixture. This is the Task 7 carve-out in action:
// the source data here genuinely, deliberately lacks that information.
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

// ---------------------------------------------------------------------------
// SW-006 Phase 1/2 (Canonical Commander Build Model / Canonical Overlay
// Model) — every seed ship's CUSTOM build, except M80 and Starlite above,
// no longer hand-authors its own mechanical structure. Mechanical
// structure now comes exclusively from canonical topology
// (shipFactoryTemplates, the same authority Factory Loadouts already use —
// SW-005 Phase 2). What stays seed-owned, per SW-006's Identity Before
// Topology principle, is purely Commander-facing: which real canonical
// port got which installed/target choice, for demo narrative. An overlay
// entry with no `installedItem`/`targetItem` override simply reads
// factory-fresh at that port, exactly like every other unlisted port.
//
// Construction (canonical template + this overlay -> real Build/Hardpoint
// rows) happens in useFleetStore.ts's buildCanonicalSeedCustomBuilds,
// mirroring buildCanonicalSeedFactoryBuilds — seed.ts cannot import
// shipDefinitions.ts (shipDefinitions.ts imports FROM seed.ts) and so was
// never able to resolve canonical templates itself.
//
// M80 and Starlite are the sole, deliberate exceptions (see their own
// comments above): both are documented regression fixtures for genuinely
// unresolved/invalid factory data (Golden Scenario H). Real canonical data
// for both hulls is confirmed clean (GF-002B) — moving them onto it would
// destroy the one genuine, non-synthetic proof that Unresolved/Invalid
// Target states are reachable from real seed data, not just a synthetic
// fixture. They keep their original hand-authored SLOTS-based hardpoints
// above, unchanged, exactly as SW-005 already carved them out for the
// same reason.
// ---------------------------------------------------------------------------

export interface SeedCustomBuildOverlay {
  buildId: string
  shipId: string
  name: string
  role: string
  isActive: boolean
  /** Keyed by the ship's real canonical slotLabel (shipFactoryTemplates
   * vocabulary) — only ports listed here differ from a pristine Factory
   * Loadout at that port. */
  assignments: Record<string, { installedItem?: string; targetItem?: string }>
}

export const customBuildOverlays: SeedCustomBuildOverlay[] = [
  {
    buildId: 'ghost-stealth', shipId: 'ghost', name: 'Stealth Build', role: 'Stealth Fighter', isActive: true,
    assignments: {
      'Power Plant': { targetItem: 'Slipstream' },
      'Left Shield Generator': { installedItem: 'Mirage', targetItem: 'Mirage' },
      'Left Cooler': { targetItem: 'SnowBlind' },
    },
  },
  {
    // Escort Build wants the same power upgrade as Stealth — demonstrates
    // shared fleet-wide demand (preserved from the original narrative) —
    // but is mid-upgrade on Shield (Upgrade Available, not Missing, target
    // FR-66 — the fleet's own established reservation-testing fixture item)
    // and has already finished its own Cooler swap, distinguishing it from
    // Stealth rather than being a duplicate.
    buildId: 'ghost-escort', shipId: 'ghost', name: 'Escort Build', role: 'Escort / Close Support', isActive: false,
    assignments: {
      'Power Plant': { targetItem: 'Slipstream' },
      'Left Shield Generator': { installedItem: 'Mirage', targetItem: 'FR-66' },
      'Left Cooler': { installedItem: 'Glacier', targetItem: 'Glacier' },
    },
  },
  {
    // A real, finished custom Build (not a Factory-only stand-in) — every
    // relevant slot fully matched, deliberately zero overlay entries. This
    // is the "player customized and finished the project" case (Golden
    // Scenario D), distinct from a Factory-only ship that merely happens
    // to read 100% because nothing has been targeted yet.
    buildId: 'corsair-gunship', shipId: 'corsair', name: 'Gunship Build', role: 'Gunship / Ground Support', isActive: true,
    assignments: {},
  },
  {
    buildId: 'mole-mining', shipId: 'mole', name: 'Mining Build', role: 'Mining', isActive: true,
    assignments: { Cooler: { targetItem: 'Galinstan' } },
  },
  {
    buildId: 'railen-cargo', shipId: 'railen', name: 'Cargo Build', role: 'Cargo Hauler', isActive: true,
    assignments: { 'Shield Generator 1': { targetItem: 'Stronghold' } },
  },
  {
    buildId: 'cutlass-black-utility', shipId: 'cutlass-black', name: 'Military Utility Build', role: 'Daily Driver', isActive: true,
    assignments: { 'Left Cooler': { targetItem: 'Avalanche' } },
  },
  {
    buildId: 'cutlass-red-medical', shipId: 'cutlass-red', name: 'Medical Support Build', role: 'Rescue / Medical', isActive: true,
    assignments: { 'Right Shield Generator': { targetItem: 'Citadel' } },
  },
  {
    buildId: 'vulture-salvage', shipId: 'vulture', name: 'Salvage Build', role: 'Salvage', isActive: true,
    assignments: { 'Left Shield Generator': { targetItem: 'Mirage' } },
  },
  {
    buildId: 'prospector-mining', shipId: 'prospector', name: 'Mining Build', role: 'Solo Mining', isActive: true,
    assignments: { Cooler: { targetItem: 'Avalanche' } },
  },
]

// SW-006 Phase 5 (Vocabulary Elimination) — this array now holds only
// M80 and Starlite's hand-authored hardpoints (the sole documented
// exceptions above). Every other ship's Factory Loadout AND CUSTOM
// build(s) are constructed fresh from canonical topology in
// useFleetStore.ts (buildCanonicalSeedFactoryBuilds /
// buildCanonicalSeedCustomBuilds). No demo customization is lost — see
// customBuildOverlays above for where it now lives.

export const hardpoints: Hardpoint[] = [...m80Hardpoints, ...starliteHardpoints]

function missingFor(buildId: string): string[] {
  return hardpoints
    .filter((h) => h.buildId === buildId && (h.status === 'Missing' || h.status === 'Upgrade Available'))
    .map((h) => h.targetItem)
}

// SW-006 Phase 1/2/5 — this array now holds only M80 and Starlite's real,
// hand-authored CUSTOM builds (the sole documented exceptions — see
// customBuildOverlays above). Every other seed ship's CUSTOM build(s), and
// every seed ship's Factory Loadout (SW-005 Phase 2), are constructed
// fresh from canonical topology in useFleetStore.ts — mechanical topology
// is no longer hand-authored anywhere else in this file.
export const builds: Build[] = [
  { id: 'm80-speed', shipId: 'm80', name: 'Speed Build', role: 'Fast Interceptor', readiness: 70, isActive: true, missing: missingFor('m80-speed'), kind: 'CUSTOM' },
  { id: 'starlite-default', shipId: 'starlite', name: 'Default Build', role: 'Future Gameplay', readiness: 50, isActive: true, missing: missingFor('starlite-default'), kind: 'CUSTOM' },
]

// SW-005/SW-006 — every seed ship except M80/Starlite now has no
// seed-authored Build at all; both their Factory Loadout and their
// CUSTOM build(s) are constructed fresh from canonical topology in
// useFleetStore.ts. The 100%/nothing-missing placeholder here is
// provisional only: useFleetStore.ts's buildCanonicalSeedFactoryBuilds /
// buildCanonicalSeedCustomBuilds overwrite every affected ship's real
// readiness/missing with its actual freshly-constructed values before the
// store's `ships` array is ever read by the app.
function buildFor(shipId: string): Pick<Build, 'readiness' | 'missing'> {
  return builds.find((b) => b.shipId === shipId && b.isActive) ?? builds.find((b) => b.shipId === shipId) ?? { readiness: 100, missing: [] }
}

/**
 * EWO-021A-1: each ship's `imageUrl` below is legacy fallback data only —
 * it is never the runtime source of truth. src/store/useFleetStore.ts
 * re-resolves every seed ship's image through the canonical registry
 * (src/data/shipImageRegistry.ts, via resolveShipImage()) at store
 * construction, and the registry always wins when it has an entry for
 * that ship. This field only renders as-is if the registry has no entry
 * for that hull — kept (Design Authority Ruling 3) as a safety net rather
 * than removed, so an ever-blanked/edited registry entry can never regress
 * an already-working seed photo to the placeholder. The Commander should
 * never need to edit this file to change a live ship image — see
 * shipImageRegistry.ts's header for the one-file editing contract.
 */
export const ships: Ship[] = [
  {
    id: 'ghost', name: 'F7C-S Hornet Ghost Mk II', manufacturer: 'Anvil', ownership: 'Owned', career: 'Combat',
    role: 'Stealth Fighter', activeBuildId: 'ghost-stealth', readiness: buildFor('ghost').readiness, priority: 1,
    missing: buildFor('ghost').missing, imageUrl: 'https://media.robertsspaceindustries.com/thvu42fxnagbh/slideshow.jpg', lastUpdated: '2 hours ago', lifecycleStatus: 'active',
  },
  {
    id: 'corsair', name: 'Corsair', manufacturer: 'Drake', ownership: 'Owned', career: 'Combat / Exploration',
    role: 'Gunship / Ground Support', activeBuildId: 'corsair-gunship', readiness: buildFor('corsair').readiness, priority: 3,
    missing: buildFor('corsair').missing, imageUrl: 'https://media.robertsspaceindustries.com/9y19hajivybqc/slideshow.jpg', lastUpdated: '3 days ago', lifecycleStatus: 'active',
  },
  {
    id: 'mole', name: 'MOLE', manufacturer: 'Argo', ownership: 'Owned', career: 'Industrial',
    role: 'Mining', activeBuildId: 'mole-mining', readiness: buildFor('mole').readiness, priority: 2,
    missing: buildFor('mole').missing, imageUrl: 'https://media.robertsspaceindustries.com/wgai60tvwa3vs/slideshow.jpg', lastUpdated: '1 day ago', lifecycleStatus: 'active',
  },
  {
    id: 'railen', name: 'Railen', manufacturer: 'Gatac', ownership: 'Owned', career: 'Cargo',
    role: 'Cargo Hauler', activeBuildId: 'railen-cargo', readiness: buildFor('railen').readiness, priority: 4,
    missing: buildFor('railen').missing, imageUrl: 'https://media.robertsspaceindustries.com/3hlrf4bj6k5r7/slideshow.jpg', lastUpdated: '5 days ago', lifecycleStatus: 'active',
  },
  {
    id: '135c', name: '135c', manufacturer: 'Origin', ownership: 'Owned', career: 'Transport',
    role: 'Stealth Shuttle', activeBuildId: '135c-shuttle', readiness: buildFor('135c').readiness, priority: 5,
    missing: buildFor('135c').missing, imageUrl: 'https://media.robertsspaceindustries.com/ftaf8t452ad1o/slideshow.jpg', lastUpdated: '6 days ago', lifecycleStatus: 'active',
  },
  {
    id: 'cutlass-black', name: 'Cutlass Black', manufacturer: 'Drake', ownership: 'Owned', career: 'Multi-role',
    role: 'Daily Driver', activeBuildId: 'cutlass-black-utility', readiness: buildFor('cutlass-black').readiness, priority: 6,
    missing: buildFor('cutlass-black').missing, imageUrl: 'https://media.robertsspaceindustries.com/56iszc92bl9oi/slideshow.jpg', lastUpdated: '1 week ago', lifecycleStatus: 'active',
  },
  {
    id: 'cutlass-red', name: 'Cutlass Red', manufacturer: 'Drake', ownership: 'Owned', career: 'Medical',
    role: 'Rescue / Medical', activeBuildId: 'cutlass-red-medical', readiness: buildFor('cutlass-red').readiness, priority: 7,
    missing: buildFor('cutlass-red').missing, imageUrl: 'https://media.robertsspaceindustries.com/wqa6lfco4amc0/slideshow.jpg', lastUpdated: '1 week ago', lifecycleStatus: 'active',
  },
  {
    id: 'm80', name: 'M80', manufacturer: 'Mirai', ownership: 'Owned', career: 'Racing / Combat',
    role: 'Fast Interceptor', activeBuildId: 'm80-speed', readiness: buildFor('m80').readiness, priority: 8,
    missing: buildFor('m80').missing, imageUrl: 'https://media.robertsspaceindustries.com/nledgsyyzmjov/slideshow.jpg', lastUpdated: '2 weeks ago', lifecycleStatus: 'active',
  },
  {
    id: 'starlite', name: 'Starlite', manufacturer: 'Crusader', ownership: 'Owned', career: 'Unknown / Future',
    role: 'Future Gameplay', activeBuildId: 'starlite-default', readiness: buildFor('starlite').readiness, priority: 9,
    missing: buildFor('starlite').missing, imageUrl: 'https://media.robertsspaceindustries.com/6cdv5u7nvigrn/slideshow.jpg', lastUpdated: '3 weeks ago', lifecycleStatus: 'active',
  },
  {
    id: 'utv', name: 'UTV', manufacturer: 'Tumbril', ownership: 'Owned', career: 'Ground',
    role: 'Utility Vehicle', activeBuildId: 'utv-default', readiness: buildFor('utv').readiness, priority: 10,
    missing: buildFor('utv').missing, imageUrl: 'https://media.robertsspaceindustries.com/szj2zc8m5hair/slideshow.jpg', lastUpdated: '1 month ago', lifecycleStatus: 'active',
  },
  {
    id: 'vulture', name: 'Vulture', manufacturer: 'Drake', ownership: 'Purchased', career: 'Salvage',
    role: 'Salvage', activeBuildId: 'vulture-salvage', readiness: buildFor('vulture').readiness, priority: 2,
    missing: buildFor('vulture').missing, imageUrl: 'https://media.robertsspaceindustries.com/jggtvws2rhu3y/slideshow.jpg', lastUpdated: '4 days ago', lifecycleStatus: 'active',
  },
  {
    id: 'prospector', name: 'Prospector', manufacturer: 'MISC', ownership: 'Loaner', career: 'Mining',
    role: 'Solo Mining', activeBuildId: 'prospector-mining', readiness: buildFor('prospector').readiness, priority: 11,
    missing: buildFor('prospector').missing, imageUrl: 'https://media.robertsspaceindustries.com/7rfmcpg9qcpmm/slideshow.jpg', lastUpdated: '2 weeks ago', lifecycleStatus: 'active',
  },
]

// ---------------------------------------------------------------------------
// Hangar Inventory — vendor trash is never stored here (Sprint 1.1).
// ---------------------------------------------------------------------------

// SW-006 Phase 2 — names/types/sizes below updated to match
// customBuildOverlays' real canonical-topology targets (the old entries
// referenced ports/items that no longer exist anywhere in the fleet, e.g.
// Helix II/Rieger-C3 mining-laser targets and the Tractor Beam/Salvage
// Head narratives this mission's simplified overlay set doesn't use).
export const hangarItems: HangarItem[] = [
  { id: 'item-1', name: 'Slipstream', type: 'Power Plant', size: 'S1', qty: 0, neededBy: 'Ghost Mk II — Stealth Build, Escort Build', disposition: 'Install' },
  { id: 'item-2', name: 'SnowBlind', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'Ghost Mk II — Stealth Build', disposition: 'Install' },
  { id: 'item-3', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'Ghost Mk II — Stealth Build', disposition: 'Install' },
  { id: 'item-4', name: 'Galinstan', type: 'Cooler', size: 'S3', qty: 0, neededBy: 'MOLE — Mining Build', disposition: 'Install' },
  { id: 'item-7', name: 'Stronghold', type: 'Shield', size: 'S3', qty: 0, neededBy: 'Railen — Cargo Build', disposition: 'Install' },
  { id: 'item-9', name: 'FR-86', type: 'Missile Rack', size: 'S3', qty: 0, neededBy: 'Cutlass Black — Military Utility Build', disposition: 'Store' },
  { id: 'item-10', name: 'Avalanche', type: 'Cooler', size: 'S2', qty: 0, neededBy: 'Cutlass Black — Military Utility Build', disposition: 'Install' },
  { id: 'item-11', name: 'Spare Ballistic Gimbal', type: 'Gimbal', size: 'S3', qty: 2, neededBy: 'None', disposition: 'Store' },
  { id: 'item-12', name: 'Mirage', type: 'Shield', size: 'S1', qty: 0, neededBy: 'Vulture — Salvage Build', disposition: 'Install' },
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
    itemName: 'SnowBlind',
    details: 'Added SnowBlind to Hangar',
  },
  {
    id: 'log-3',
    timestamp: '3 days ago',
    action: 'New Loadout Entered into Fleet Registry',
    shipName: 'F7C-S Hornet Ghost Mk II',
    itemName: 'Escort Build',
    details: 'Recorded Escort Build for Ghost Mk II',
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
  { path: 'VEH. COMP. S1 → COOLER → SnowBlind', item: 'SnowBlind' },
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

