import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Ship, Build, Hardpoint, HangarItem, LogEntry, Disposition, FleetAsset, OwnershipType, InstalledLoadoutEntry, QuartermasterTemplate, SeedAssetOverride } from '../types'
import { ships as seedShips, builds as seedBuilds, hardpoints as seedHardpoints, hangarItems as seedHangarItems, initialLog } from '../data/seed'
import { computeHardpointStatusWithValidation } from '../utils/hardpointStatus'
import { shipDefinitions as allShipDefinitions, selectableShipDefinitions, shipDefinitionById, shipFactoryTemplates } from '../data/shipDefinitions'
import { migrateSeedFleetToAssets } from '../data/fleetAssetMigration'
import { materializeFleetAsset } from '../utils/fleetAssetMaterializer'
import { resolveShipImage } from '../utils/resolveShipImage'
import { ownershipTypeToLegacy } from '../utils/ownership'
import { seedQuartermasterTemplates } from '../data/quartermasterTemplates'
import { calculateBuildProgress } from '../utils/buildProgress'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import type { MissionReservation } from '../types'

const PERSIST_STORAGE_KEY = 'sfm-fleet-store'
// EWO-027 (Sea Trials Blocker): bumped 5 -> 6 to add customBuilds/
// customBuildHardpoints/activeBuildByShipId — a pre-existing save simply
// has none of these fields, which `migrate` below treats as "no custom
// Loadouts recorded yet" (an honest, correct description of that save),
// not an error.
const PERSIST_VERSION = 6

/**
 * Derives the initial shared Installed Loadout for every ship from the
 * seed Hardpoint data (Alpha 2.2 migration) — one entry per ship+slot,
 * taken from that ship's ACTIVE build's row, since that's the value every
 * page already displayed as "installed" before this fix existed. This
 * runs once at store construction; all subsequent installs/removes/moves
 * go through `applyInstalledChange` below, which is the only mutation
 * path from here on.
 */
/**
 * EWO-021A-1 — the seed fleet's own hardcoded `imageUrl` (src/data/seed.ts)
 * is only ever the *fallback* now, not the runtime source of truth: every
 * seed Ship is re-resolved through the same canonical
 * src/data/shipImageRegistry.ts a manually-added FleetAsset already goes
 * through (src/utils/fleetAssetMaterializer.ts), so the Commander never
 * has to maintain image URLs in two files. Nothing else about the seed
 * Ship object changes — Build/Hardpoint/ownership/priority/nickname stay
 * exactly as src/data/seed.ts and any applied seedAssetOverrides define
 * them. Idempotent — re-running this on the same seed data always
 * produces the same result, so it is safe to call on every fresh store
 * construction (first load and every rehydration alike).
 */
function withResolvedSeedImages(ships: Ship[]): Ship[] {
  return ships.map((s) => ({ ...s, imageUrl: resolveShipImage({ id: s.id, imageUrl: s.imageUrl }) ?? s.imageUrl }))
}

function deriveInitialInstalledLoadouts(ships: Ship[], hardpoints: Hardpoint[]): InstalledLoadoutEntry[] {
  const entries: InstalledLoadoutEntry[] = []
  for (const ship of ships) {
    const activeRows = hardpoints.filter((h) => h.buildId === ship.activeBuildId)
    for (const row of activeRows) {
      entries.push({ shipId: ship.id, slotLabel: row.slotLabel, installedItem: row.installedItem })
    }
  }
  return entries
}

interface FleetState {
  ships: Ship[]
  builds: Build[]
  hardpoints: Hardpoint[]
  hangarItems: HangarItem[]
  log: LogEntry[]

  // Installed Loadout (Alpha 2.2) — real, shared, per-ship physical
  // equipment state. See applyInstalledChange for the single mutation
  // path; every Hardpoint.installedItem stays in sync with this.
  installedLoadouts: InstalledLoadoutEntry[]

  // Quartermaster Templates (Alpha 2.2) — reusable mission intent,
  // never assigned directly to a Fleet Asset.
  quartermasterTemplates: QuartermasterTemplate[]

  // Fleet Asset lifecycle — see src/types/index.ts for the
  // ShipDefinition/FleetAsset split. `shipDefinitions` is catalog data
  // (never mutated at runtime); `fleetAssets` is player data. `ships`
  // above stays the materialized join every existing page renders from.
  shipDefinitions: typeof allShipDefinitions
  // EWO-021 — the de-duplicated subset Add Ship should offer (exactly
  // one entry per real hull); `shipDefinitions` above remains the full
  // registry every other id-validity check should keep using.
  selectableShipDefinitions: typeof selectableShipDefinitions
  fleetAssets: FleetAsset[]
  // Mission M-012 incident fix — see SeedAssetOverride's doc comment.
  // Persisted per-id diff against the hardcoded seed fleet (removal,
  // rename, ownership, priority), applied on top of the fresh seed
  // bake-in at rehydration time rather than replayed through
  // materializeFleetAsset (which would discard hand-authored builds).
  seedAssetOverrides: Record<string, SeedAssetOverride>
  // True once real persisted user state has been merged in (i.e. this is
  // not the very first-ever load). Lets the UI and tests distinguish "no
  // localStorage entry exists yet" from "a save exists and the fleet is
  // intentionally empty" — both cases can legitimately show zero ships.
  hasPersistedState: boolean
  addFleetAsset: (
    shipDefinitionId: string,
    ownershipType: OwnershipType,
    nickname?: string,
    priority?: number
  ) => { success: boolean; assetId?: string; message?: string }
  removeFleetAsset: (assetId: string) => { success: boolean; message?: string }
  updateFleetAssetNickname: (assetId: string, nickname: string | undefined) => { success: boolean; message?: string }
  updateFleetAssetOwnership: (assetId: string, ownershipType: OwnershipType) => { success: boolean; message?: string }
  /** Fleet Profile (Alpha 2.4, Part 7) — Priority drives Mission Control
   * and Fleet Dashboard sorting; Primary/Secondary Role are descriptive
   * only, independent of the authoritative Ship Classification. */
  updateFleetProfile: (assetId: string, updates: { priority?: number; primaryRole?: string; secondaryRole?: string }) => { success: boolean; message?: string }

  // Quartermaster Logistics Engine (Alpha 2.3) — see src/engine/logistics/.
  // Reservations are player data, persisted like everything else. They
  // never move equipment on their own; installComponent below fulfills a
  // matching ACTIVE reservation atomically when one exists for the exact
  // (Mission, slot, component) being installed.
  reservations: MissionReservation[]
  reserveComponent: (params: {
    missionConfigurationId: string
    fleetAssetId: string
    targetSlotLabel: string
    componentName: string
    quantity?: number
  }) => { success: boolean; reservationId?: string; message?: string }
  releaseReservation: (reservationId: string) => { success: boolean; message?: string }

  // Ship Detail
  setActiveBuild: (shipId: string, buildId: string) => void

  // Mission Composer (Alpha 2.2) — the central deliverable. Creates or
  // updates a real, ship-specific Mission Configuration (a Build with
  // kind: 'MISSION') from a chosen starting state, optionally seeded from
  // a Quartermaster Template, with per-slot target edits applied on top.
  saveMissionConfiguration: (params: {
    shipId: string
    name: string
    startingState: 'FACTORY' | 'INSTALLED' | 'EMPTY' | 'EXISTING'
    existingBuildId?: string
    quartermasterTemplateId?: string
    targetOverrides: Record<string, string>
    setActive: boolean
    /** EWO-024 (Task 4) — decouples "use this Loadout as today's baseline"
     * (startingState/existingBuildId, unchanged) from "save into that same
     * Loadout" (previously the same thing, the exact ambiguity Task 4
     * reported). When true, always mints a new Build even though
     * startingState is 'EXISTING' with a real existingBuildId — lets the
     * UI offer an explicit "Save as New Loadout" action from an edit in
     * progress without requiring a separate baseline-only mechanism.
     * Defaults to false, preserving every existing call's behavior. */
    saveAsNew?: boolean
  }) => { success: boolean; buildId?: string; message?: string }

  // Build Manager / Quartermaster Templates
  addBuild: (shipId: string) => void
  editBuild: (buildId: string, updates: { name?: string; role?: string }) => void
  duplicateBuild: (buildId: string) => void
  deleteBuild: (buildId: string) => void

  // Hangar Inventory
  // EWO-028 (Task 3) — merges into an existing record by canonical
  // identity (entityClass when both sides have one, else name+type+size)
  // rather than always minting a new row; see the implementation's own
  // doc comment for the full precedence.
  addHangarItem: (item: Omit<HangarItem, 'id'>) => { success: boolean; message?: string; merged: boolean }
  updateHangarDisposition: (itemId: string, disposition: Disposition) => void
  // EWO-028 (Task 4) — Beta scope is Quantity only; canonical identity
  // and catalog metadata are read-only once a record exists (Design
  // Authority Ruling 3) — the Commander deletes and re-adds instead of
  // "reclassifying" a record into a different component.
  updateHangarItemQuantity: (itemId: string, qty: number) => { success: boolean; message?: string }
  // EWO-028 (Task 5) — the caller (HangarInventory.tsx) is responsible
  // for surfacing resolveInventoryDependencies()'s result and getting
  // explicit Commander confirmation first; this action itself performs
  // the deletion unconditionally once called — it never silently deletes
  // a reservation or installed-loadout record as a side effect (Ruling 9).
  deleteHangarItem: (itemId: string) => { success: boolean; message?: string }
  moveToShip: (itemId: string, shipId: string) => { success: boolean; message: string }

  // Quick Update
  installComponent: (
    shipId: string,
    itemName: string,
    slotLabel?: string,
    buildIdOverride?: string
  ) => { matched: boolean; reservationFulfilled?: boolean; blocked?: 'reserved-elsewhere' }
  removeComponent: (shipId: string, slotLabel: string, returnToHangar?: boolean, buildIdOverride?: string) => { matched: boolean; itemName?: string }
  moveComponentBetweenShips: (
    fromShipId: string,
    fromSlotLabel: string,
    toShipId: string,
    toSlotLabel?: string
  ) => { matched: boolean; itemName?: string; message?: string }
  addLogEntry: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
}

/**
 * Resolves the real FleetAsset record for a given materialized Ship id
 * (Alpha 2.4 bug fix). For manually-added assets, `ship.id === asset.id`
 * (both minted together by materializeFleetAsset). For the original
 * seed-migrated fleet, `ship.id` is the plain seed id ("ghost") but
 * `asset.id` is `"ghost-asset-seed"` (see migrateSeedFleetToAssets) — a
 * pre-existing mismatch that silently broke Remove/Edit Fleet Asset for
 * every seed ship, since those actions looked up `fleetAssets` by the
 * same id passed in as the ship id. This checks both conventions rather
 * than assuming either one.
 */
function resolveFleetAssetId(shipId: string, fleetAssets: FleetAsset[]): string | undefined {
  if (fleetAssets.some((a) => a.id === shipId)) return shipId
  const seedAssetId = `${shipId}-asset-seed`
  if (fleetAssets.some((a) => a.id === seedAssetId)) return seedAssetId
  return undefined
}

function isValidPersistedFleetAsset(raw: unknown): raw is FleetAsset {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.shipDefinitionId === 'string' &&
    (r.ownershipType === 'OWNED' || r.ownershipType === 'PURCHASED' || r.ownershipType === 'LOANER') &&
    typeof r.activeBuildId === 'string' &&
    typeof r.priority === 'number'
  )
}

function isValidSeedAssetOverride(raw: unknown): raw is SeedAssetOverride {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  if (typeof r.updatedAt !== 'string') return false
  if (r.status !== undefined && r.status !== 'active' && r.status !== 'removed') return false
  if (r.nickname !== undefined && typeof r.nickname !== 'string') return false
  if (r.ownershipType !== undefined && r.ownershipType !== 'OWNED' && r.ownershipType !== 'PURCHASED' && r.ownershipType !== 'LOANER') return false
  if (r.priority !== undefined && typeof r.priority !== 'number') return false
  return true
}

function isValidPersistedReservation(raw: unknown): raw is MissionReservation {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.missionConfigurationId === 'string' &&
    typeof r.fleetAssetId === 'string' &&
    typeof r.targetSlotLabel === 'string' &&
    typeof r.componentName === 'string' &&
    typeof r.quantity === 'number' &&
    (r.status === 'ACTIVE' || r.status === 'FULFILLED' || r.status === 'RELEASED' || r.status === 'INVALID')
  )
}

/**
 * EWO-027 — a saved custom Loadout (`Build.kind !== 'FACTORY'`) was never
 * included in `partialize` at all, for any ship, seed or manually added —
 * confirmed directly against real `localStorage` output: no `builds` or
 * `hardpoints` key existed there whatsoever. Every refresh silently
 * reverted every ship to its Factory Loadout, because `merge` (below)
 * only ever knew how to *reconstruct* the canonical Factory Loadout via
 * `materializeFleetAsset`, never a Commander's actual saved assignments.
 * These two validators mirror `isValidPersistedFleetAsset`'s defensive
 * pattern exactly — a malformed record is dropped with a console warning,
 * never crashes, never wipes the rest of the player's saved state.
 */
function isValidPersistedBuild(raw: unknown): raw is Build {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.shipId === 'string' &&
    typeof r.name === 'string' &&
    typeof r.readiness === 'number' &&
    typeof r.isActive === 'boolean' &&
    Array.isArray(r.missing) &&
    typeof r.kind === 'string' &&
    r.kind !== 'FACTORY'
  )
}

function isValidPersistedHardpoint(raw: unknown): raw is Hardpoint {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.shipId === 'string' &&
    typeof r.buildId === 'string' &&
    typeof r.slotLabel === 'string' &&
    typeof r.type === 'string' &&
    typeof r.size === 'string' &&
    typeof r.factoryItem === 'string' &&
    typeof r.installedItem === 'string' &&
    typeof r.targetItem === 'string' &&
    typeof r.status === 'string'
  )
}

function recomputeBuildDerivedState(get: () => FleetState, set: (partial: Partial<FleetState>) => void, buildId: string) {
  const state = get()
  const buildHardpoints = state.hardpoints.filter((h) => h.buildId === buildId)
  // Reuse the single shared Build Progress engine — never a second,
  // ad-hoc readiness calculation. This also correctly excludes Unresolved
  // (unknown factory data) rows from the denominator.
  const progress = calculateBuildProgress(buildHardpoints)
  const missing = buildHardpoints.filter((h) => h.status === 'Missing' || h.status === 'Upgrade Available').map((h) => h.targetItem)
  const readiness = progress.percentage

  const builds = state.builds.map((b) => (b.id === buildId ? { ...b, missing, readiness } : b))
  set({ builds })

  const build = builds.find((b) => b.id === buildId)
  if (!build) return
  const ships = state.ships.map((s) =>
    s.id === build.shipId && s.activeBuildId === buildId
      ? { ...s, missing, readiness, lastUpdated: 'Just now' }
      : s
  )
  set({ ships })
}

/**
 * The single mutation path for "what's physically installed" (Alpha
 * 2.2). Updates the shared per-ship InstalledLoadout AND every Mission
 * Configuration's hardpoint row for that ship+slot together, so there is
 * never a moment where two Missions disagree about the same physical
 * slot — the exact bug this sprint's Installed Loadout separation fixes.
 * Each affected row's status is recomputed against *its own* targetItem
 * (different Missions can legitimately want different things there), and
 * every affected Build's derived readiness/missing cache is refreshed.
 * Returns the affected buildIds so callers can log/report against the
 * one the user actually asked about.
 */
function applyInstalledChange(get: () => FleetState, set: (partial: Partial<FleetState>) => void, shipId: string, slotLabel: string, newInstalledItem: string): string[] {
  const state = get()

  const installedLoadouts = (() => {
    const existing = state.installedLoadouts.find((e) => e.shipId === shipId && e.slotLabel === slotLabel)
    if (existing) {
      return state.installedLoadouts.map((e) => (e === existing ? { ...e, installedItem: newInstalledItem } : e))
    }
    return [...state.installedLoadouts, { shipId, slotLabel, installedItem: newInstalledItem }]
  })()
  set({ installedLoadouts })

  const affectedBuildIds = new Set<string>()
  const hardpoints = state.hardpoints.map((h) => {
    if (h.shipId !== shipId || h.slotLabel !== slotLabel) return h
    affectedBuildIds.add(h.buildId)
    const { status, invalidMessage } = computeHardpointStatusWithValidation(newInstalledItem, h.targetItem, h.factoryItem, h.type, h.size)
    return { ...h, installedItem: newInstalledItem, status, invalidMessage }
  })
  set({ hardpoints })

  for (const buildId of affectedBuildIds) {
    recomputeBuildDerivedState(get, set, buildId)
  }
  return Array.from(affectedBuildIds)
}

export const useFleetStore = create<FleetState>()(
  persist(
    (set, get) => ({
      ships: withResolvedSeedImages(seedShips),
      builds: [...seedBuilds],
      hardpoints: [...seedHardpoints],
      hangarItems: seedHangarItems,
      log: initialLog,
      installedLoadouts: deriveInitialInstalledLoadouts(seedShips, seedHardpoints),
      reservations: [],
      quartermasterTemplates: seedQuartermasterTemplates,
      shipDefinitions: allShipDefinitions,
      selectableShipDefinitions,
      fleetAssets: migrateSeedFleetToAssets(),
      seedAssetOverrides: {},
      hasPersistedState: false,

      addFleetAsset: (shipDefinitionId, ownershipType, nickname, priority) => {
        const definition = shipDefinitionById.get(shipDefinitionId)
        if (!definition) return { success: false, message: 'Unknown ship definition.' }

        const template = shipFactoryTemplates[shipDefinitionId] ?? []
        const existingPriorities = get().ships.map((s) => s.priority)
        const resolvedPriority = priority ?? (existingPriorities.length > 0 ? Math.max(...existingPriorities) + 1 : 1)

        const { asset, ship, build, hardpoints } = materializeFleetAsset({
          definition,
          template,
          ownershipType,
          nickname,
          priority: resolvedPriority,
          acquisitionSource: 'MANUAL',
        })

        set({
          fleetAssets: [...get().fleetAssets, asset],
          ships: [...get().ships, ship],
          builds: [...get().builds, build],
          hardpoints: [...get().hardpoints, ...hardpoints],
          installedLoadouts: [...get().installedLoadouts, ...hardpoints.map((h) => ({ shipId: ship.id, slotLabel: h.slotLabel, installedItem: h.installedItem }))],
        })

        get().addLogEntry({
          action: 'Ship added to fleet',
          shipName: ship.name,
          details: `Added ${ship.name} (${definition.displayName}) to fleet as ${ownershipType}`,
        })

        return { success: true, assetId: asset.id }
      },

      removeFleetAsset: (assetId) => {
        const resolvedAssetId = resolveFleetAssetId(assetId, get().fleetAssets)
        const asset = resolvedAssetId ? get().fleetAssets.find((a) => a.id === resolvedAssetId) : undefined
        const ship = get().ships.find((s) => s.id === assetId)
        if (!asset || !ship) return { success: false, message: 'Fleet asset not found.' }

        const now = new Date().toISOString()

        // Soft-delete the asset record (status: 'removed') rather than
        // splicing it out — Ship Definition and every other Fleet Asset
        // referencing it are completely untouched either way, but this
        // keeps a record that the asset existed rather than erasing history.
        set({
          fleetAssets: get().fleetAssets.map((a) => (a.id === resolvedAssetId ? { ...a, status: 'removed' as const, updatedAt: now } : a)),
          ships: get().ships.filter((s) => s.id !== assetId),
          builds: get().builds.filter((b) => b.shipId !== assetId),
          hardpoints: get().hardpoints.filter((h) => h.shipId !== assetId),
          installedLoadouts: get().installedLoadouts.filter((e) => e.shipId !== assetId),
        })

        // Mission M-012: the seed fleet's ships/builds/hardpoints are
        // hardcoded and reconstructed fresh on every load — they're never
        // persisted directly. Recording the removal here is what lets a
        // seed ship's deletion survive a refresh (see `merge` below).
        if (asset.acquisitionSource === 'SEED_MIGRATION') {
          set({
            seedAssetOverrides: {
              ...get().seedAssetOverrides,
              [resolvedAssetId!]: { ...get().seedAssetOverrides[resolvedAssetId!], status: 'removed', updatedAt: now },
            },
          })
        }

        get().addLogEntry({ action: 'Ship removed from fleet', shipName: ship.name, details: `Removed ${ship.name} from fleet` })
        return { success: true }
      },

      updateFleetAssetNickname: (assetId, nickname) => {
        const resolvedAssetId = resolveFleetAssetId(assetId, get().fleetAssets)
        const asset = resolvedAssetId ? get().fleetAssets.find((a) => a.id === resolvedAssetId) : undefined
        const ship = get().ships.find((s) => s.id === assetId)
        if (!asset || !ship) return { success: false, message: 'Fleet asset not found.' }
        const definition = shipDefinitionById.get(asset.shipDefinitionId)
        const trimmed = nickname?.trim() || undefined
        const previousName = ship.name
        const now = new Date().toISOString()

        set({
          fleetAssets: get().fleetAssets.map((a) => (a.id === resolvedAssetId ? { ...a, nickname: trimmed, updatedAt: now } : a)),
          ships: get().ships.map((s) =>
            s.id === assetId
              ? {
                  ...s,
                  name: trimmed ?? definition?.displayName ?? s.name,
                  role: trimmed && definition ? `${definition.displayName} · ${definition.role}` : definition?.role ?? s.role,
                }
              : s
          ),
        })

        if (asset.acquisitionSource === 'SEED_MIGRATION') {
          set({
            seedAssetOverrides: {
              ...get().seedAssetOverrides,
              [resolvedAssetId!]: { ...get().seedAssetOverrides[resolvedAssetId!], nickname: trimmed, updatedAt: now },
            },
          })
        }

        get().addLogEntry({ action: 'Ship nickname changed', shipName: trimmed ?? previousName, details: `Renamed "${previousName}" to "${trimmed ?? definition?.displayName ?? previousName}"` })
        return { success: true }
      },

      updateFleetAssetOwnership: (assetId, ownershipType) => {
        const resolvedAssetId = resolveFleetAssetId(assetId, get().fleetAssets)
        const asset = resolvedAssetId ? get().fleetAssets.find((a) => a.id === resolvedAssetId) : undefined
        const ship = get().ships.find((s) => s.id === assetId)
        if (!asset || !ship) return { success: false, message: 'Fleet asset not found.' }

        const now = new Date().toISOString()
        set({
          fleetAssets: get().fleetAssets.map((a) => (a.id === resolvedAssetId ? { ...a, ownershipType, updatedAt: now } : a)),
          ships: get().ships.map((s) => (s.id === assetId ? { ...s, ownership: ownershipTypeToLegacy(ownershipType) } : s)),
        })

        if (asset.acquisitionSource === 'SEED_MIGRATION') {
          set({
            seedAssetOverrides: {
              ...get().seedAssetOverrides,
              [resolvedAssetId!]: { ...get().seedAssetOverrides[resolvedAssetId!], ownershipType, updatedAt: now },
            },
          })
        }

        get().addLogEntry({ action: 'Ownership changed', shipName: ship.name, details: `${ship.name} ownership set to ${ownershipType}` })
        return { success: true }
      },

      updateFleetProfile: (assetId, updates) => {
        const ship = get().ships.find((s) => s.id === assetId)
        const resolvedAssetId = resolveFleetAssetId(assetId, get().fleetAssets)
        const asset = resolvedAssetId ? get().fleetAssets.find((a) => a.id === resolvedAssetId) : undefined
        if (!ship || !asset) return { success: false, message: 'Fleet asset not found.' }

        const nextPriority = updates.priority ?? ship.priority
        const now = new Date().toISOString()
        set({
          ships: get().ships.map((s) =>
            s.id === assetId
              ? { ...s, priority: nextPriority, primaryRole: updates.primaryRole ?? s.primaryRole, secondaryRole: updates.secondaryRole ?? s.secondaryRole }
              : s
          ),
          fleetAssets: get().fleetAssets.map((a) => (a.id === resolvedAssetId ? { ...a, priority: nextPriority, updatedAt: now } : a)),
        })

        if (asset.acquisitionSource === 'SEED_MIGRATION') {
          set({
            seedAssetOverrides: {
              ...get().seedAssetOverrides,
              [resolvedAssetId!]: { ...get().seedAssetOverrides[resolvedAssetId!], priority: nextPriority, updatedAt: now },
            },
          })
        }

        get().addLogEntry({ action: 'Fleet Profile updated', shipName: ship.name, details: `Updated Fleet Profile for ${ship.name}` })
        return { success: true }
      },

  setActiveBuild: (shipId, buildId) => {
    const build = get().builds.find((b) => b.id === buildId)
    const ship = get().ships.find((s) => s.id === shipId)
    if (!build || !ship) return
    const previousBuildName = get().builds.find((b) => b.id === ship.activeBuildId)?.name
    set({
      builds: get().builds.map((b) => (b.shipId === shipId ? { ...b, isActive: b.id === buildId } : b)),
      ships: get().ships.map((s) =>
        s.id === shipId ? { ...s, activeBuildId: buildId, missing: build.missing, readiness: build.readiness } : s
      ),
    })
    if (previousBuildName && previousBuildName !== build.name) {
      get().addLogEntry({
        action: 'Operational Assignment Updated',
        shipName: ship.name,
        itemName: build.name,
        details: `${ship.name} switched from ${previousBuildName} to ${build.name}`,
      })
    }
  },

  reserveComponent: ({ missionConfigurationId, fleetAssetId, targetSlotLabel, componentName, quantity = 1 }) => {
    // EWO-029 (Task 5) — quantity must be a positive whole number; this
    // was never actually enforced here before (only "not more than
    // Available" was checked), so an explicit `quantity: 0` (or a
    // negative one) silently created a real reservation record.
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, message: 'Reservation quantity must be a positive whole number.' }
    }
    const build = get().builds.find((b) => b.id === missionConfigurationId)
    const ship = get().ships.find((s) => s.id === fleetAssetId)
    if (!build || !ship) return { success: false, message: 'Loadout or Fleet Asset not found.' }

    const targetRow = get().hardpoints.find((h) => h.buildId === missionConfigurationId && h.slotLabel === targetSlotLabel)
    if (!targetRow) return { success: false, message: 'Target requirement not found on this Loadout.' }
    if (targetRow.targetItem !== componentName) {
      return { success: false, message: `"${componentName}" does not match this slot's target ("${targetRow.targetItem}").` }
    }
    if (targetRow.status === 'Invalid Target') {
      return { success: false, message: 'Cannot reserve against an invalid target — fix the target assignment first.' }
    }

    const existingForSlot = get().reservations.find(
      (r) => r.missionConfigurationId === missionConfigurationId && r.targetSlotLabel === targetSlotLabel && r.status === 'ACTIVE'
    )
    if (existingForSlot) return { success: false, message: 'This target requirement already has an active reservation. Release it first.' }

    // Never allow reserving more than is actually free — one physical
    // unit can never satisfy two commitments (Part 4, rules 3-4).
    const availability = calculateComponentAvailability(componentName, get().hangarItems, get().installedLoadouts, get().reservations)
    if (availability.availableQuantity < quantity) {
      return { success: false, message: `Only ${availability.availableQuantity} "${componentName}" available to reserve (requested ${quantity}).` }
    }

    const now = new Date().toISOString()
    const reservation: MissionReservation = {
      id: `reservation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      missionConfigurationId,
      fleetAssetId,
      targetSlotLabel,
      componentName,
      quantity,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    }
    set({ reservations: [...get().reservations, reservation] })

    get().addLogEntry({
      action: 'Component reserved',
      shipName: ship.name,
      itemName: componentName,
      details: `Reserved ${componentName} for ${ship.name} — ${build.name} (${targetSlotLabel})`,
    })

    return { success: true, reservationId: reservation.id }
  },

  releaseReservation: (reservationId) => {
    const reservation = get().reservations.find((r) => r.id === reservationId)
    if (!reservation || reservation.status !== 'ACTIVE') {
      return { success: false, message: 'Reservation not found or already inactive.' }
    }

    set({
      reservations: get().reservations.map((r) => (r.id === reservationId ? { ...r, status: 'RELEASED' as const, updatedAt: new Date().toISOString() } : r)),
    })

    const ship = get().ships.find((s) => s.id === reservation.fleetAssetId)
    const build = get().builds.find((b) => b.id === reservation.missionConfigurationId)
    get().addLogEntry({
      action: 'Component Returned to Quartermaster Stores',
      shipName: ship?.name,
      itemName: reservation.componentName,
      details: `Returned ${reservation.componentName} to Quartermaster Stores (${ship?.name ?? 'ship'} — ${build?.name ?? 'Loadout'}, ${reservation.targetSlotLabel})`,
    })

    return { success: true }
  },

  saveMissionConfiguration: ({ shipId, name, startingState, existingBuildId, quartermasterTemplateId, targetOverrides, setActive, saveAsNew }) => {
    const ship = get().ships.find((s) => s.id === shipId)
    if (!ship) return { success: false, message: 'Fleet Asset not found.' }
    if (!name.trim()) return { success: false, message: 'Name the Loadout before saving.' }

    // Every Mission Configuration for a ship shares the same slot
    // structure (they all trace back to the same Factory template), so
    // any existing build's rows are a safe structural reference.
    const referenceRows = get().hardpoints.filter((h) => h.shipId === shipId && h.buildId === ship.activeBuildId)
    if (referenceRows.length === 0) return { success: false, message: 'No reference equipment data exists for this Fleet Asset.' }

    const installedBySlot = new Map(get().installedLoadouts.filter((e) => e.shipId === shipId).map((e) => [e.slotLabel, e.installedItem]))

    const baseTargets = new Map<string, string>()
    if (startingState === 'FACTORY') {
      for (const row of referenceRows) baseTargets.set(row.slotLabel, row.factoryItem)
    } else if (startingState === 'INSTALLED') {
      for (const row of referenceRows) baseTargets.set(row.slotLabel, installedBySlot.get(row.slotLabel) ?? row.factoryItem)
    } else if (startingState === 'EMPTY') {
      for (const row of referenceRows) baseTargets.set(row.slotLabel, '—')
    } else {
      const existingRows = get().hardpoints.filter((h) => h.shipId === shipId && h.buildId === existingBuildId)
      if (existingRows.length === 0) return { success: false, message: 'Existing Loadout not found for this Fleet Asset.' }
      for (const row of existingRows) baseTargets.set(row.slotLabel, row.targetItem)
    }

    // A Quartermaster Template applies its intent on top of the starting
    // state, matched by slotLabel — it never invents a slot this ship
    // doesn't actually have.
    if (quartermasterTemplateId) {
      const template = get().quartermasterTemplates.find((t) => t.id === quartermasterTemplateId)
      if (template) {
        for (const assignment of template.targetAssignments) {
          if (baseTargets.has(assignment.slotLabel)) baseTargets.set(assignment.slotLabel, assignment.targetItem)
        }
      }
    }

    // Explicit per-slot edits from the Composer UI always win last.
    for (const [slotLabel, targetItem] of Object.entries(targetOverrides)) {
      if (baseTargets.has(slotLabel)) baseTargets.set(slotLabel, targetItem)
    }

    const isEditingExisting = !saveAsNew && startingState === 'EXISTING' && Boolean(existingBuildId)
    const buildId = isEditingExisting ? existingBuildId! : `${shipId}-mission-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const newRows: Hardpoint[] = referenceRows.map((refRow, i) => {
      const target = baseTargets.get(refRow.slotLabel) ?? '—'
      const installed = installedBySlot.get(refRow.slotLabel) ?? refRow.factoryItem
      const { status, invalidMessage } = computeHardpointStatusWithValidation(installed, target, refRow.factoryItem, refRow.type, refRow.size)
      return {
        id: `${buildId}-hp-${i}`,
        shipId,
        buildId,
        slotLabel: refRow.slotLabel,
        type: refRow.type,
        size: refRow.size,
        factoryItem: refRow.factoryItem,
        installedItem: installed,
        targetItem: target,
        status,
        invalidMessage,
      }
    })

    const missing = newRows.filter((h) => h.status === 'Missing' || h.status === 'Upgrade Available').map((h) => h.targetItem)
    // Reuse the single shared Build Progress engine for readiness — never
    // a second, ad-hoc calculation (Alpha 2.0/2.1 principle still holds).
    // This also correctly excludes Unresolved (unknown factory data) rows
    // from the denominator, the same way every other page's readiness does.
    const readiness = calculateBuildProgress(newRows).percentage

    const missionBuild: Build = { id: buildId, shipId, name: name.trim(), role: ship.role, readiness, isActive: false, missing, kind: 'MISSION' }

    // Changing a target assignment must never let a stale reservation
    // silently satisfy the new target (Part 4 rule 10 / Golden Scenario
    // F) — release any ACTIVE reservation on this Mission+slot whose
    // committed component no longer matches the new target.
    const staleReservations = isEditingExisting
      ? get().reservations.filter((r) => {
          if (r.missionConfigurationId !== buildId || r.status !== 'ACTIVE') return false
          const newTarget = baseTargets.get(r.targetSlotLabel)
          return newTarget !== r.componentName
        })
      : []

    set({
      hardpoints: isEditingExisting ? [...get().hardpoints.filter((h) => h.buildId !== buildId), ...newRows] : [...get().hardpoints, ...newRows],
      builds: isEditingExisting ? get().builds.map((b) => (b.id === buildId ? missionBuild : b)) : [...get().builds, missionBuild],
      reservations:
        staleReservations.length > 0
          ? get().reservations.map((r) => (staleReservations.some((s) => s.id === r.id) ? { ...r, status: 'RELEASED' as const, updatedAt: new Date().toISOString() } : r))
          : get().reservations,
    })

    for (const stale of staleReservations) {
      get().addLogEntry({
        action: 'Component Returned to Quartermaster Stores',
        shipName: ship.name,
        itemName: stale.componentName,
        details: `Returned ${stale.componentName} to Quartermaster Stores — target for ${stale.targetSlotLabel} changed on "${name.trim()}"`,
      })
    }

    if (setActive) {
      get().setActiveBuild(shipId, buildId)
    }

    get().addLogEntry({
      action: isEditingExisting ? 'Loadout Updated' : 'New Loadout Entered into Fleet Registry',
      shipName: ship.name,
      itemName: name.trim(),
      details: `${isEditingExisting ? 'Updated' : 'Recorded'} Loadout "${name.trim()}" for ${ship.name}${setActive ? ' and set it as the Active Loadout' : ''}`,
    })

    return { success: true, buildId }
  },

  addBuild: (shipId) => {
    const ship = get().ships.find((s) => s.id === shipId)
    if (!ship) return
    const id = `${shipId}-build-${Date.now()}`
    const newBuild: Build = { id, shipId, name: 'New Loadout', role: ship.role, readiness: 100, isActive: false, missing: [], kind: 'CUSTOM' }
    const slots: Array<{ slotLabel: string; type: string; size: string }> = [
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
    const newHardpoints: Hardpoint[] = slots.map((slot, i) => {
      const { status } = computeHardpointStatusWithValidation('Unknown Factory Item', 'Unknown Factory Item', 'Unknown Factory Item', slot.type, slot.size)
      return {
        id: `${id}-hp-${i}`,
        shipId,
        buildId: id,
        slotLabel: slot.slotLabel,
        type: slot.type,
        size: slot.size,
        factoryItem: 'Unknown Factory Item',
        installedItem: 'Unknown Factory Item',
        targetItem: 'Unknown Factory Item',
        status,
      }
    })
    set({ builds: [...get().builds, newBuild], hardpoints: [...get().hardpoints, ...newHardpoints] })
    get().addLogEntry({ action: 'New Loadout Entered into Fleet Registry', shipName: ship.name, itemName: newBuild.name, details: `Recorded ${newBuild.name} for ${ship.name}` })
  },

  editBuild: (buildId, updates) => {
    const build = get().builds.find((b) => b.id === buildId)
    if (!build) return
    set({ builds: get().builds.map((b) => (b.id === buildId ? { ...b, ...updates } : b)) })
    const ship = get().ships.find((s) => s.id === build.shipId)
    get().addLogEntry({ action: 'Loadout Updated', shipName: ship?.name, itemName: updates.name ?? build.name, details: `Updated ${build.name}${updates.name ? ` → renamed to ${updates.name}` : ''}` })
  },

  duplicateBuild: (buildId) => {
    const build = get().builds.find((b) => b.id === buildId)
    if (!build) return
    const id = `${build.id}-copy-${Date.now()}`
    const newBuild: Build = { ...build, id, name: `${build.name} (Copy)`, isActive: false, kind: 'CUSTOM' }
    const sourceHardpoints = get().hardpoints.filter((h) => h.buildId === buildId)
    const newHardpoints: Hardpoint[] = sourceHardpoints.map((h, i) => ({ ...h, id: `${id}-hp-${i}`, buildId: id }))
    set({ builds: [...get().builds, newBuild], hardpoints: [...get().hardpoints, ...newHardpoints] })
    const ship = get().ships.find((s) => s.id === build.shipId)
    get().addLogEntry({ action: 'Loadout Duplicated', shipName: ship?.name, itemName: newBuild.name, details: `Duplicated ${build.name} as ${newBuild.name}` })
  },

  deleteBuild: (buildId) => {
    const build = get().builds.find((b) => b.id === buildId)
    if (!build) return
    const remaining = get().builds.filter((b) => b.id !== buildId)
    const ship = get().ships.find((s) => s.id === build.shipId)
    set({
      builds: remaining,
      hardpoints: get().hardpoints.filter((h) => h.buildId !== buildId),
      // Removing a Mission Configuration must safely release its
      // reservations (Part 4, rule 9) — the committed inventory returns
      // to AVAILABLE rather than becoming orphaned/unaccounted-for.
      reservations: get().reservations.map((r) =>
        r.missionConfigurationId === buildId && r.status === 'ACTIVE' ? { ...r, status: 'RELEASED' as const, updatedAt: new Date().toISOString() } : r
      ),
      ships: get().ships.map((s) => {
        if (s.id !== build.shipId || s.activeBuildId !== buildId) return s
        const fallback = remaining.find((b) => b.shipId === build.shipId)
        return fallback ? { ...s, activeBuildId: fallback.id, missing: fallback.missing, readiness: fallback.readiness } : s
      }),
    })
    get().addLogEntry({ action: 'Loadout Removed', shipName: ship?.name, itemName: build.name, details: `Removed ${build.name} from ${ship?.name ?? 'ship'} — any active reservations were returned to Quartermaster Stores` })
  },

  // EWO-028 (Task 2/3) — quantity must be a positive whole number
  // (Design Authority Ruling 4); a caller that violates this gets an
  // honest rejection rather than a silently-created malformed record.
  //
  // Merge precedence for "is this the same inventory record":
  //   1. Both sides carry a canonical `entityClass` -> match on that
  //      alone (Ruling 1/6 — two distinct canonical components must
  //      never merge even if their display names collide).
  //   2. Exactly one side carries `entityClass` -> never merge (Task 3:
  //      "do not silently merge legacy duplicates unless canonical
  //      identity is proven identical" — an unmatched canonical id is
  //      not proof).
  //   3. Neither side carries `entityClass` (both legacy/hand-typed) ->
  //      match on name+type+size, the same identity the rest of the
  //      logistics engine already uses.
  addHangarItem: (item) => {
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      return { success: false, message: 'Quantity must be a positive whole number.', merged: false }
    }
    const existing = get().hangarItems.find((h) => {
      if (item.entityClass && h.entityClass) return h.entityClass === item.entityClass
      if (item.entityClass || h.entityClass) return false
      return h.name === item.name && h.type === item.type && h.size === item.size
    })
    if (existing) {
      const mergedQty = existing.qty + item.qty
      set({ hangarItems: get().hangarItems.map((h) => (h.id === existing.id ? { ...h, qty: mergedQty } : h)) })
      get().addLogEntry({
        action: 'Hangar item quantity increased',
        itemName: existing.name,
        details: `Added ${item.qty} more ${existing.name} — quantity now ${mergedQty}`,
      })
      return { success: true, merged: true }
    }
    const newItem: HangarItem = { ...item, id: `item-${Date.now()}` }
    set({ hangarItems: [newItem, ...get().hangarItems] })
    get().addLogEntry({ action: 'Hangar item added', itemName: newItem.name, details: `Added ${newItem.name} to Hangar` })
    return { success: true, merged: false }
  },

  // EWO-028 (Task 4) — Quantity-only edit. Never reduces quantity below
  // zero (Ruling 7); the caller is responsible for the Task 6
  // below-allocation confirmation UX — this action performs the write
  // once called, exactly like deleteHangarItem below.
  updateHangarItemQuantity: (itemId, qty) => {
    if (!Number.isInteger(qty) || qty < 0) {
      return { success: false, message: 'Quantity must be a non-negative whole number.' }
    }
    const item = get().hangarItems.find((i) => i.id === itemId)
    if (!item) return { success: false, message: 'Inventory record not found.' }
    set({ hangarItems: get().hangarItems.map((i) => (i.id === itemId ? { ...i, qty } : i)) })
    get().addLogEntry({ action: 'Hangar item quantity changed', itemName: item.name, details: `${item.name} quantity changed from ${item.qty} to ${qty}` })
    return { success: true }
  },

  deleteHangarItem: (itemId) => {
    const item = get().hangarItems.find((i) => i.id === itemId)
    if (!item) return { success: false, message: 'Inventory record not found.' }
    set({ hangarItems: get().hangarItems.filter((i) => i.id !== itemId) })
    get().addLogEntry({ action: 'Hangar item deleted', itemName: item.name, details: `Removed ${item.name} from Hangar Inventory` })
    return { success: true }
  },

  updateHangarDisposition: (itemId, disposition) => {
    const item = get().hangarItems.find((i) => i.id === itemId)
    set({ hangarItems: get().hangarItems.map((i) => (i.id === itemId ? { ...i, disposition } : i)) })
    if (item) {
      get().addLogEntry({ action: 'Disposition changed', itemName: item.name, details: `${item.name} disposition set to ${disposition}` })
    }
  },

  moveToShip: (itemId, shipId) => {
    const item = get().hangarItems.find((i) => i.id === itemId)
    const ship = get().ships.find((s) => s.id === shipId)
    if (!item || !ship) return { success: false, message: 'Item or ship not found.' }
    const result = get().installComponent(shipId, item.name)
    // EWO-029 (Task 7, Scenario F) — a unit already reserved for a
    // different Fleet Asset/Build is never silently installed here.
    if (result.blocked === 'reserved-elsewhere') {
      return { success: false, message: `${item.name} has no Available stock — the remaining unit(s) are reserved for a different Fleet Asset/Build. Release that reservation first, or install using its own Fleet Asset and Loadout.` }
    }
    if (!result.matched) {
      return { success: false, message: `${ship.name}'s active Loadout has no open slot for ${item.name}.` }
    }
    // EWO-029 (Task 7, Scenario E) — when installComponent already
    // fulfilled this exact slot's own reservation, it already deducted
    // Hangar quantity itself; deducting again here would double-count
    // the same physical unit.
    if (!result.reservationFulfilled) {
      set({
        hangarItems: get().hangarItems.map((i) => (i.id === itemId ? { ...i, qty: Math.max(0, i.qty - 1) } : i)),
      })
    }
    get().addLogEntry({ action: 'Component moved to ship', shipName: ship.name, itemName: item.name, details: `Moved ${item.name} from Hangar to ${ship.name}` })
    return { success: true, message: `${item.name} installed on ${ship.name}.` }
  },

  installComponent: (shipId, itemName, slotLabel, buildIdOverride) => {
    const ship = get().ships.find((s) => s.id === shipId)
    if (!ship) return { matched: false }
    // Mission Context (Alpha 2.1/2.2): install can target any Mission
    // Configuration assigned to this Fleet Asset, not only the currently
    // Active one — but Installed Loadout is shared physical state, so the
    // actual mutation always goes through applyInstalledChange, which
    // updates every Mission's row for this slot together and only lets
    // the ship-facing cache change when the mutated Mission IS active.
    const buildId = buildIdOverride ?? ship.activeBuildId
    const candidates = get().hardpoints.filter((h) => h.buildId === buildId && (slotLabel ? h.slotLabel === slotLabel : true))
    const target = candidates.find((h) => h.targetItem.toLowerCase() === itemName.toLowerCase() && h.status !== 'OK') ?? candidates.find((h) => h.status !== 'OK')
    if (!target) return { matched: false }

    // Installing a reserved component fulfills the reservation atomically
    // as part of this same operation (Alpha 2.3, Part 12 / Golden C) — the
    // committed unit's Hangar quantity is consumed here too, since it was
    // only ever "available" pending this exact install.
    const reservation = get().reservations.find(
      (r) => r.missionConfigurationId === buildId && r.targetSlotLabel === target.slotLabel && r.componentName === itemName && r.status === 'ACTIVE'
    )

    // EWO-029 (Task 7, Scenario F / Design Authority Ruling 8) — a
    // physical unit already committed to a DIFFERENT Fleet Asset/Build's
    // active reservation must never be silently consumed by installing
    // here instead. Deliberately scoped to only fire when a genuine
    // competing reservation exists for this component — installing
    // without ever having tracked any Hangar stock or reservation for it
    // at all (a long-supported, pre-existing Quick Update use: directly
    // recording an install with no inventory bookkeeping involved) must
    // keep working exactly as before; `availableQuantity <= 0` alone is
    // not evidence of a steal, only a competing ACTIVE reservation is.
    if (!reservation) {
      const hasCompetingReservation = get().reservations.some((r) => r.componentName === itemName && r.status === 'ACTIVE')
      if (hasCompetingReservation) {
        const availability = calculateComponentAvailability(itemName, get().hangarItems, get().installedLoadouts, get().reservations)
        if (availability.availableQuantity <= 0) {
          return { matched: false, blocked: 'reserved-elsewhere' }
        }
      }
    }

    applyInstalledChange(get, set, shipId, target.slotLabel, itemName)

    if (reservation) {
      set({
        reservations: get().reservations.map((r) => (r.id === reservation.id ? { ...r, status: 'FULFILLED' as const, updatedAt: new Date().toISOString() } : r)),
      })
      let remaining = reservation.quantity
      const hangarItems = get().hangarItems
        .map((h) => {
          if (h.name !== itemName || remaining <= 0) return h
          const take = Math.min(remaining, h.qty)
          remaining -= take
          return { ...h, qty: h.qty - take }
        })
        .filter((h) => h.qty > 0)
      set({ hangarItems })
      return { matched: true, reservationFulfilled: true }
    }

    return { matched: true, reservationFulfilled: false }
  },

  removeComponent: (shipId, slotLabel, returnToHangar, buildIdOverride) => {
    const ship = get().ships.find((s) => s.id === shipId)
    if (!ship) return { matched: false }
    const buildId = buildIdOverride ?? ship.activeBuildId
    const target = get().hardpoints.find((h) => h.buildId === buildId && h.slotLabel === slotLabel)
    if (!target || target.installedItem === '—' || !target.installedItem) return { matched: false }
    const removedItem = target.installedItem

    applyInstalledChange(get, set, shipId, slotLabel, '—')

    if (returnToHangar) {
      get().addHangarItem({ name: removedItem, type: target.type, size: target.size, qty: 1, neededBy: 'None', disposition: 'Store' })
    }

    return { matched: true, itemName: removedItem }
  },

  moveComponentBetweenShips: (fromShipId, fromSlotLabel, toShipId, toSlotLabel) => {
    const fromShip = get().ships.find((s) => s.id === fromShipId)
    const toShip = get().ships.find((s) => s.id === toShipId)
    if (!fromShip || !toShip) return { matched: false, message: 'Ship not found.' }

    const donorHardpoint = get().hardpoints.find((h) => h.buildId === fromShip.activeBuildId && h.slotLabel === fromSlotLabel)
    if (!donorHardpoint || donorHardpoint.installedItem === '—' || !donorHardpoint.installedItem) {
      return { matched: false, message: `${fromShip.name}'s ${fromSlotLabel} has nothing installed to move.` }
    }
    const itemName = donorHardpoint.installedItem

    // Validate compatibility BEFORE touching anything — a real transfer
    // must never partially apply. Compatible here means the same slot
    // type AND size as the donor's own hardpoint (the granularity the
    // legacy Hardpoint model actually carries); an explicit toSlotLabel
    // must still match on both axes, not just be requested by name.
    const recipientCandidates = get().hardpoints.filter((h) => h.buildId === toShip.activeBuildId && (toSlotLabel ? h.slotLabel === toSlotLabel : true))
    const compatible = recipientCandidates.filter((h) => h.type === donorHardpoint.type && h.size === donorHardpoint.size)
    const destination = compatible.find((h) => h.status !== 'OK') ?? (toSlotLabel ? compatible[0] : undefined)

    if (!destination) {
      return {
        matched: false,
        message: toSlotLabel
          ? `${toShip.name}'s ${toSlotLabel} is not compatible with ${itemName} (${donorHardpoint.size} ${donorHardpoint.type}).`
          : `${toShip.name} has no open ${donorHardpoint.size} ${donorHardpoint.type} slot for ${itemName}.`,
      }
    }

    // Atomic: donor removal and recipient installation applied via the
    // same shared-InstalledLoadout mutation path, back to back with no
    // intermediate state where the item exists on neither ship or both —
    // both calls resolve synchronously before this function returns.
    applyInstalledChange(get, set, fromShipId, fromSlotLabel, '—')
    applyInstalledChange(get, set, toShipId, destination.slotLabel, itemName)

    get().addLogEntry({
      action: 'Component moved to ship',
      shipName: toShip.name,
      itemName,
      details: `Moved ${itemName} from ${fromShip.name} (${fromSlotLabel}) to ${toShip.name} (${destination.slotLabel})`,
    })

    return { matched: true, itemName }
  },

      addLogEntry: (entry) => {
        const newEntry: LogEntry = { ...entry, id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: 'Just now' }
        set({ log: [newEntry, ...get().log] })
      },
    }),
    {
      name: PERSIST_STORAGE_KEY,
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Alpha 2.3 (Part 24, schemaVersion 4): now also persists real
      // player logistics state — Hangar Inventory, Reservations, and the
      // shared Installed Loadout — alongside Fleet Assets. Every record
      // is still validated defensively; a malformed one is dropped with a
      // console warning rather than crashing the app or wiping the rest
      // of the player's saved state ("preserve it, emit a development
      // warning, do not crash or wipe user state").
      //
      // Only DERIVED values are excluded — available quantity, package
      // readiness percentage, mission readiness percentage, procurement
      // shortage totals, and package state are never stored; they're
      // always recomputed fresh from the authoritative records above
      // (Part 24: "Do not persist derived... Derive those from
      // authoritative player state").
      migrate: (persistedState) => {
        const state = persistedState as
          | {
              fleetAssets?: unknown
              hangarItems?: unknown
              reservations?: unknown
              installedLoadouts?: unknown
              seedAssetOverrides?: unknown
              customBuilds?: unknown
              customBuildHardpoints?: unknown
              activeBuildByShipId?: unknown
            }
          | null
          | undefined
        if (!state) {
          return {
            fleetAssets: [],
            hangarItems: undefined,
            reservations: [],
            installedLoadouts: undefined,
            seedAssetOverrides: {},
            customBuilds: [],
            customBuildHardpoints: [],
            activeBuildByShipId: {},
          }
        }

        const validAssets: FleetAsset[] = []
        for (const raw of Array.isArray(state.fleetAssets) ? state.fleetAssets : []) {
          if (isValidPersistedFleetAsset(raw)) validAssets.push(raw)
          else console.warn('[SFM] Skipping a persisted Fleet Asset record that failed migration validation:', raw)
        }

        const validReservations: MissionReservation[] = []
        for (const raw of Array.isArray(state.reservations) ? state.reservations : []) {
          if (isValidPersistedReservation(raw)) validReservations.push(raw)
          else console.warn('[SFM] Skipping a persisted Reservation record that failed migration validation:', raw)
        }

        // EWO-027 — a pre-6 save has neither field at all (custom
        // Loadouts were never persisted in the first place) — an empty
        // array/object is the honest, correct description of that save,
        // not a data-loss event to warn about.
        const validCustomBuilds: Build[] = []
        for (const raw of Array.isArray(state.customBuilds) ? state.customBuilds : []) {
          if (isValidPersistedBuild(raw)) validCustomBuilds.push(raw)
          else console.warn('[SFM] Skipping a persisted custom Build record that failed migration validation:', raw)
        }
        const validCustomBuildIds = new Set(validCustomBuilds.map((b) => b.id))
        const validCustomBuildHardpoints: Hardpoint[] = []
        for (const raw of Array.isArray(state.customBuildHardpoints) ? state.customBuildHardpoints : []) {
          if (isValidPersistedHardpoint(raw) && validCustomBuildIds.has(raw.buildId)) validCustomBuildHardpoints.push(raw)
          else console.warn('[SFM] Skipping a persisted custom Build Hardpoint record that failed migration validation:', raw)
        }
        const validActiveBuildByShipId: Record<string, string> = {}
        if (state.activeBuildByShipId && typeof state.activeBuildByShipId === 'object') {
          for (const [shipId, buildId] of Object.entries(state.activeBuildByShipId as Record<string, unknown>)) {
            if (typeof buildId === 'string') validActiveBuildByShipId[shipId] = buildId
            else console.warn('[SFM] Skipping a persisted Active Build reference that failed migration validation:', shipId, buildId)
          }
        }

        // Mission M-012 (schemaVersion 5): pre-existing saves have no
        // seedAssetOverrides field at all — an empty object is the
        // correct default for those, since the full seed fleet was, in
        // fact, still fully present and untouched when they were written.
        const validOverrides: Record<string, SeedAssetOverride> = {}
        if (state.seedAssetOverrides && typeof state.seedAssetOverrides === 'object') {
          for (const [id, raw] of Object.entries(state.seedAssetOverrides as Record<string, unknown>)) {
            if (isValidSeedAssetOverride(raw)) validOverrides[id] = raw
            else console.warn('[SFM] Skipping a persisted Seed Asset Override record that failed migration validation:', id, raw)
          }
        }

        // Pre-Alpha-2.3 saves have no hangarItems/installedLoadouts field
        // at all — `undefined` here tells `merge` to keep the freshly
        // constructed defaults rather than overwriting them with nothing
        // (Part 24 migration rule: "existing Hangar Inventory becomes
        // AVAILABLE unless Installed elsewhere" / "existing Installed
        // Loadouts remain Installed" — the fresh defaults already satisfy
        // both, so there's nothing to transform for an old save).
        return {
          fleetAssets: validAssets,
          hangarItems: Array.isArray(state.hangarItems) ? state.hangarItems : undefined,
          reservations: validReservations,
          installedLoadouts: Array.isArray(state.installedLoadouts) ? state.installedLoadouts : undefined,
          seedAssetOverrides: validOverrides,
          customBuilds: validCustomBuilds,
          customBuildHardpoints: validCustomBuildHardpoints,
          activeBuildByShipId: validActiveBuildByShipId,
        }
      },
      // Fleet Assets added via "Add Ship" (or any future non-seed source)
      // still round-trip via replay (see merge below). The hardcoded seed
      // fleet is never replayed this way — replaying it through
      // materializeFleetAsset would silently discard its hand-authored
      // Mission Configurations — so seedAssetOverrides carries only the
      // minimal diff (removed / renamed / re-owned / re-prioritized) a
      // user can apply to a seed ship. Hangar Inventory, Reservations, and
      // the Installed Loadout persist directly in full.
      partialize: (state) => ({
        fleetAssets: state.fleetAssets.filter((a) => a.acquisitionSource !== 'SEED_MIGRATION' && a.status === 'active'),
        hangarItems: state.hangarItems,
        reservations: state.reservations,
        installedLoadouts: state.installedLoadouts,
        seedAssetOverrides: state.seedAssetOverrides,
        // EWO-027 — the actual custom Loadout content, for ANY ship (seed
        // or manually added). Factory builds are deliberately excluded:
        // they're always correctly, deterministically regenerated fresh
        // (materializeFleetAsset for manual assets, src/data/seed.ts for
        // seed ones) — persisting them would only be redundant bytes.
        customBuilds: state.builds.filter((b) => b.kind !== 'FACTORY'),
        customBuildHardpoints: state.hardpoints.filter((h) => state.builds.some((b) => b.id === h.buildId && b.kind !== 'FACTORY')),
        // A ship's actual selected Active Build. For a manually-added
        // asset this duplicates FleetAsset.activeBuildId (already
        // persisted above), but a seed ship's Ship object is baked in
        // fresh every session and previously had no way at all to
        // remember a Commander's setActiveBuild() choice — this single
        // small map covers both sources uniformly.
        activeBuildByShipId: Object.fromEntries(state.ships.map((s) => [s.id, s.activeBuildId])),
      }),
      // Replays every persisted manual Fleet Asset back into ships/builds/
      // hardpoints using the exact same materializeFleetAsset() the live
      // "Add Ship" action uses — `existingAsset` reuses the persisted id
      // verbatim so identity survives a refresh instead of minting a new one.
      //
      // `merge` only ever runs when a persisted value actually exists in
      // storage (zustand skips it entirely on a true first-ever load) —
      // so reaching this function at all is itself the "persisted user
      // state exists" signal (Mission M-012, `hasPersistedState`).
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | {
              fleetAssets?: FleetAsset[]
              hangarItems?: HangarItem[]
              reservations?: MissionReservation[]
              installedLoadouts?: InstalledLoadoutEntry[]
              seedAssetOverrides?: Record<string, SeedAssetOverride>
              customBuilds?: Build[]
              customBuildHardpoints?: Hardpoint[]
              activeBuildByShipId?: Record<string, string>
            }
          | null
          | undefined
        // zustand's persist middleware calls `merge` unconditionally —
        // even on a true first-ever load, with `persistedState` itself
        // `undefined` (there was nothing in storage to migrate). That is
        // the actual "no persisted state yet" signal (Mission M-012,
        // `hasPersistedState`) — not whether this function ran at all.
        const hadPersistedState = persistedState !== null && persistedState !== undefined
        const persistedAssets = persisted?.fleetAssets ?? []
        const seedAssetOverrides = persisted?.seedAssetOverrides ?? {}

        // Mission M-012: apply the persisted seed-fleet diff on top of the
        // fresh seed bake-in BEFORE replaying manual assets. The seed
        // ships/builds/hardpoints themselves always come from
        // src/data/seed.ts verbatim — only presence (removed) and a few
        // player-editable fields (nickname/ownership/priority) are
        // overridden here, mirroring what removeFleetAsset/
        // updateFleetAssetNickname/updateFleetAssetOwnership/
        // updateFleetProfile already do live.
        let ships = [...currentState.ships]
        let builds = [...currentState.builds]
        let hardpoints = [...currentState.hardpoints]
        const fleetAssets = currentState.fleetAssets.map((a) => {
          const override = seedAssetOverrides[a.id]
          if (!override) return a
          return {
            ...a,
            status: override.status ?? a.status,
            nickname: 'nickname' in override ? override.nickname : a.nickname,
            ownershipType: override.ownershipType ?? a.ownershipType,
            priority: override.priority ?? a.priority,
            updatedAt: override.updatedAt,
          }
        })

        // A seed FleetAsset's own `id` (e.g. "ghost-asset-seed") is NOT the
        // same as the ship id its materialized Ship/Build/Hardpoint rows
        // use (e.g. "ghost" — see resolveFleetAssetId's doc comment above).
        // `seedAssetOverrides` is keyed by the asset id, so it must be
        // resolved back to the ship id — via shipDefinitionId, which for
        // every seed-migrated asset equals the plain seed ship id — before
        // it can be used to filter ships/builds/hardpoints/installedLoadouts.
        const seedShipIdByAssetId = new Map(currentState.fleetAssets.map((a) => [a.id, a.shipDefinitionId]))
        const removedSeedShipIds = new Set(
          Object.entries(seedAssetOverrides)
            .filter(([, override]) => override.status === 'removed')
            .map(([assetId]) => seedShipIdByAssetId.get(assetId) ?? assetId)
        )
        if (removedSeedShipIds.size > 0) {
          ships = ships.filter((s) => !removedSeedShipIds.has(s.id))
          builds = builds.filter((b) => !removedSeedShipIds.has(b.shipId))
          hardpoints = hardpoints.filter((h) => !removedSeedShipIds.has(h.shipId))
        }
        for (const [assetId, override] of Object.entries(seedAssetOverrides)) {
          if (override.status === 'removed') continue
          const shipId = seedShipIdByAssetId.get(assetId)
          if (!shipId) continue
          const asset = fleetAssets.find((a) => a.id === assetId)
          const definition = asset ? shipDefinitionById.get(asset.shipDefinitionId) : undefined
          ships = ships.map((s) => {
            if (s.id !== shipId) return s
            const next = { ...s }
            if ('nickname' in override) {
              next.name = override.nickname ?? definition?.displayName ?? s.name
              next.role = override.nickname && definition ? `${definition.displayName} · ${definition.role}` : definition?.role ?? s.role
            }
            if (override.ownershipType) next.ownership = ownershipTypeToLegacy(override.ownershipType)
            if (override.priority !== undefined) next.priority = override.priority
            return next
          })
        }

        // Persisted Hangar/Reservations/InstalledLoadout replace the fresh
        // defaults outright when present — they're the full authoritative
        // player record, not something to merge item-by-item.
        let installedLoadouts = persisted?.installedLoadouts ?? [...currentState.installedLoadouts]
        if (removedSeedShipIds.size > 0) {
          installedLoadouts = installedLoadouts.filter((e) => !removedSeedShipIds.has(e.shipId))
        }
        const hangarItems = persisted?.hangarItems ?? currentState.hangarItems
        const reservations = persisted?.reservations ?? currentState.reservations

        for (const existingAsset of persistedAssets) {
          if (fleetAssets.some((a) => a.id === existingAsset.id)) continue // already present, don't duplicate
          const definition = shipDefinitionById.get(existingAsset.shipDefinitionId)
          if (!definition) continue // ship definition no longer exists — skip rather than crash
          const template = shipFactoryTemplates[existingAsset.shipDefinitionId] ?? []
          const { asset, ship, build, hardpoints: hp } = materializeFleetAsset({ definition, template, existingAsset })
          fleetAssets.push(asset)
          ships.push(ship)
          builds.push(build)
          hardpoints.push(...hp)
          // Only seed a fresh InstalledLoadout entry for this replayed
          // ship if the persisted logistics blob didn't already cover it
          // (an older save might predate this asset's InstalledLoadout
          // rows; a newer one already carries them via `persisted.installedLoadouts`).
          if (!installedLoadouts.some((e) => e.shipId === ship.id)) {
            installedLoadouts = [...installedLoadouts, ...hp.map((row) => ({ shipId: ship.id, slotLabel: row.slotLabel, installedItem: row.installedItem }))]
          }
        }

        // EWO-027 — restore the Commander's actual custom Loadouts. The
        // replay loop above (and the fresh seed bake-in before it) only
        // ever knows how to reconstruct each ship's canonical Factory
        // Loadout — a real saved Build (kind !== 'FACTORY') is never
        // rebuilt that way. Filtered to ships that still exist after the
        // seed-removal/replay steps above, so a Loadout for a ship
        // that's since been removed is never resurrected. A persisted
        // custom Build's id can collide with a placeholder FACTORY-kind
        // build the replay above minted under the same id (when a
        // manually-added asset's own `activeBuildId` already pointed at
        // a custom build, since `materializeFleetAsset` always labels
        // whatever it builds `kind: 'FACTORY'`) — the real, persisted
        // record always wins over that placeholder.
        const survivingShipIds = new Set(ships.map((s) => s.id))
        const customBuilds = (persisted?.customBuilds ?? []).filter((b) => survivingShipIds.has(b.shipId))
        const customBuildIds = new Set(customBuilds.map((b) => b.id))
        builds = [...builds.filter((b) => !customBuildIds.has(b.id)), ...customBuilds]
        const customBuildHardpoints = (persisted?.customBuildHardpoints ?? []).filter((h) => customBuildIds.has(h.buildId))
        hardpoints = [...hardpoints.filter((h) => !customBuildIds.has(h.buildId)), ...customBuildHardpoints]

        // Restore each ship's actual selected Active Build. For a
        // replayed manually-added asset this is already correct (
        // materializeFleetAsset used existingAsset.activeBuildId), but a
        // seed ship's Ship object is baked in fresh every session and had
        // no other mechanism to remember a live setActiveBuild() choice.
        // Only applied when the referenced build genuinely exists for
        // this ship after the restoration above — never left dangling.
        const activeBuildByShipId = persisted?.activeBuildByShipId ?? {}
        ships = ships.map((s) => {
          const activeId = activeBuildByShipId[s.id]
          if (!activeId) return s
          const activeBuildRecord = builds.find((b) => b.id === activeId && b.shipId === s.id)
          if (!activeBuildRecord) return s
          return { ...s, activeBuildId: activeId, missing: activeBuildRecord.missing, readiness: activeBuildRecord.readiness }
        })

        return { ...currentState, ships, builds, hardpoints, fleetAssets, installedLoadouts, hangarItems, reservations, seedAssetOverrides, hasPersistedState: hadPersistedState }
      },
    }
  )
)
