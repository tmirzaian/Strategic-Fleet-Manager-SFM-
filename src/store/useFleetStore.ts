import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Ship, Build, Hardpoint, HangarItem, LogEntry, Disposition, FleetAsset, OwnershipType, InstalledLoadoutEntry, QuartermasterTemplate, SeedAssetOverride, QuarantinedAssignment } from '../types'
import { ships as seedShips, builds as seedBuilds, hardpoints as seedHardpoints, hangarItems as seedHangarItems, initialLog } from '../data/seed'
import { computeHardpointStatusWithValidation } from '../utils/hardpointStatus'
import { shipDefinitions as allShipDefinitions, selectableShipDefinitions, shipDefinitionById, shipFactoryTemplates } from '../data/shipDefinitions'
import { migrateSeedFleetToAssets } from '../data/fleetAssetMigration'
import { materializeFleetAsset } from '../utils/fleetAssetMaterializer'
import { reconcileBuildHardpoints } from '../utils/fleetAssetReconciliation'
import { resolveShipImage } from '../utils/resolveShipImage'
import { ownershipTypeToLegacy } from '../utils/ownership'
import { seedQuartermasterTemplates } from '../data/quartermasterTemplates'
import { calculateBuildProgress } from '../utils/buildProgress'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { isComponentSelectableForPort } from '../data/componentCatalog'
import type { MissionReservation } from '../types'

const PERSIST_STORAGE_KEY = 'sfm-fleet-store'
// EWO-027 (Sea Trials Blocker): bumped 5 -> 6 to add customBuilds/
// customBuildHardpoints/activeBuildByShipId — a pre-existing save simply
// has none of these fields, which `migrate` below treats as "no custom
// Loadouts recorded yet" (an honest, correct description of that save),
// not an error.
// EWO-043: bumped 6 -> 7 to add quarantinedAssignments — a pre-7 save
// simply has none, which `migrate` below treats as "nothing has ever been
// quarantined yet" (correct for a save written before reconciliation
// existed), not an error.
// CAT-001A: bumped 7 -> 8 — not to add a field to migrate, but to detect
// one: `migrate` only ever runs when a save's own stored version differs
// from PERSIST_VERSION, so this bump is what lets a save written under
// any version <= 7 be recognized, exactly once, as a genuinely
// pre-existing installation whose Commander legitimately already had the
// demo fleet — see `seedFleetLegacyInstall` below.
const PERSIST_VERSION = 8

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

/**
 * CAT-001A (Beta release blocker) — src/data/seed.ts's 12-ship fleet,
 * hangar, and Captain's Log entries are historical Alpha-era development/
 * demo content. Commander Acceptance Testing confirmed a genuinely fresh
 * browser origin (empty Local Storage, empty Session Storage) still
 * displayed this fleet — because it was unconditionally baked into this
 * store's own default state (below) AND into `merge`'s baseline, with no
 * gate distinguishing "brand new Commander" from "developer running the
 * app locally." IndexedDB was not involved at all — this store only ever
 * uses `localStorage` (see `storage:` below).
 *
 * `VITE_SFM_DEV_SEED_FLEET` is read only from Vite's env system — set it
 * to "true" in a local, gitignored `.env.local` (never committed, never
 * present in a release package) to opt back into the demo fleet for local
 * development. Deliberately NOT `import.meta.env.DEV`: the Beta batch
 * launchers (Start Strategic Fleet Manager.bat) run `npm run dev`, so
 * `import.meta.env.DEV` is true for real Commanders too and would not
 * have fixed anything.
 */
const DEV_SEED_FLEET_ENABLED = import.meta.env.VITE_SFM_DEV_SEED_FLEET === 'true'

interface SeedFleetBaseline {
  ships: Ship[]
  builds: Build[]
  hardpoints: Hardpoint[]
  hangarItems: HangarItem[]
  log: LogEntry[]
  installedLoadouts: InstalledLoadoutEntry[]
  fleetAssets: FleetAsset[]
}

/** The full Alpha-era demo fleet, materialized fresh — used only when it should actually be shown (see DEV_SEED_FLEET_ENABLED and `merge`'s `includeSeedBaseline` below). */
function buildSeedFleetBaseline(): SeedFleetBaseline {
  return {
    ships: withResolvedSeedImages(seedShips),
    builds: [...seedBuilds],
    hardpoints: [...seedHardpoints],
    hangarItems: [...seedHangarItems],
    log: [...initialLog],
    installedLoadouts: deriveInitialInstalledLoadouts(seedShips, seedHardpoints),
    fleetAssets: migrateSeedFleetToAssets(),
  }
}

/** A genuinely new Commander's starting state — zero ships, zero inventory, zero log — per CAT-001A's required product behavior. */
const EMPTY_FLEET_BASELINE: SeedFleetBaseline = { ships: [], builds: [], hardpoints: [], hangarItems: [], log: [], installedLoadouts: [], fleetAssets: [] }

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
  // CAT-001A — true only for an installation that was already running
  // BEFORE this fix shipped (detected once, during `migrate`, via the
  // persisted save's own stored schema version predating
  // SEED_FLEET_GATE_VERSION) — never for a save newly created afterward,
  // no matter how many real sessions/reloads it then accumulates. This is
  // deliberately NOT the same signal as `hasPersistedState`: a brand-new
  // Commander's very first Add Ship action also makes `hasPersistedState`
  // true on their next load, but must never bring the demo fleet back.
  // Persisted forward via `partialize` once set, so it survives every
  // future save/reload for that installation.
  seedFleetLegacyInstall: boolean
  // EWO-043 — Commander assignments whose port no longer exists in the
  // current authoritative template (see src/utils/fleetAssetReconciliation.ts).
  // Never auto-deleted, never auto-restored; preserved here until the
  // Commander explicitly resolves them.
  quarantinedAssignments: QuarantinedAssignment[]
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
  // EWO-STAB-002 (containment) — `slotLabel` is now a required, explicit,
  // validated destination. Its UI trigger (Hangar Inventory's Move to
  // Ship) is disabled during Beta stabilization; this signature change is
  // the store-level guard so the method itself cannot silently guess a
  // slot even if called directly.
  moveToShip: (itemId: string, shipId: string, slotLabel: string) => { success: boolean; message: string }

  // Quick Update
  installComponent: (
    shipId: string,
    itemName: string,
    slotLabel?: string,
    buildIdOverride?: string
  ) => { matched: boolean; reservationFulfilled?: boolean; blocked?: 'reserved-elsewhere' | 'incompatible' }
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

/** EWO-043 — mirrors the other persisted-record validators' defensive
 * pattern: a malformed quarantined record is dropped with a console
 * warning, never crashes, never wipes the rest of the player's saved state. */
function isValidPersistedQuarantinedAssignment(raw: unknown): raw is QuarantinedAssignment {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.shipId === 'string' &&
    typeof r.buildId === 'string' &&
    typeof r.quarantinedAt === 'string' &&
    r.reason === 'PORT_REMOVED' &&
    Boolean(r.hardpoint) &&
    typeof r.hardpoint === 'object'
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
      // CAT-001A — this is only the pre-hydration scaffold; `persist`
      // rehydrates synchronously from localStorage before first render for
      // every real session, and `merge` below (not this initializer) is
      // what actually decides whether the demo fleet appears. Kept
      // consistent with that same decision regardless, so no seed content
      // is ever observable even in an edge case where hydration is skipped.
      ...(DEV_SEED_FLEET_ENABLED ? buildSeedFleetBaseline() : EMPTY_FLEET_BASELINE),
      reservations: [],
      quartermasterTemplates: seedQuartermasterTemplates,
      shipDefinitions: allShipDefinitions,
      selectableShipDefinitions,
      seedAssetOverrides: {},
      hasPersistedState: false,
      seedFleetLegacyInstall: DEV_SEED_FLEET_ENABLED,
      quarantinedAssignments: [],

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
    // EWO-043 (Task 8) — tracks whether the Commander ever deliberately
    // chose this slot's target, independent of what value it resolves to.
    // FOLLOW_FACTORY rows are the ones a future authoritative Factory
    // change should keep tracking automatically (src/utils/
    // fleetAssetReconciliation.ts); every other source is a genuine
    // Commander decision and must never be silently replaced.
    const baseTargetModes = new Map<string, 'FOLLOW_FACTORY' | 'EXPLICIT_TARGET'>()
    if (startingState === 'FACTORY') {
      for (const row of referenceRows) {
        baseTargets.set(row.slotLabel, row.factoryItem)
        baseTargetModes.set(row.slotLabel, 'FOLLOW_FACTORY')
      }
    } else if (startingState === 'INSTALLED') {
      for (const row of referenceRows) {
        baseTargets.set(row.slotLabel, installedBySlot.get(row.slotLabel) ?? row.factoryItem)
        baseTargetModes.set(row.slotLabel, 'EXPLICIT_TARGET')
      }
    } else if (startingState === 'EMPTY') {
      for (const row of referenceRows) {
        baseTargets.set(row.slotLabel, '—')
        baseTargetModes.set(row.slotLabel, 'EXPLICIT_TARGET')
      }
    } else {
      const existingRows = get().hardpoints.filter((h) => h.shipId === shipId && h.buildId === existingBuildId)
      if (existingRows.length === 0) return { success: false, message: 'Existing Loadout not found for this Fleet Asset.' }
      for (const row of existingRows) {
        baseTargets.set(row.slotLabel, row.targetItem)
        // A pre-EWO-043 persisted row has no targetMode at all — treated
        // as EXPLICIT_TARGET, the safe default (never silently start
        // auto-following Factory for a row the Commander never tagged).
        baseTargetModes.set(row.slotLabel, row.targetMode ?? 'EXPLICIT_TARGET')
      }
    }

    // A Quartermaster Template applies its intent on top of the starting
    // state, matched by slotLabel — it never invents a slot this ship
    // doesn't actually have.
    if (quartermasterTemplateId) {
      const template = get().quartermasterTemplates.find((t) => t.id === quartermasterTemplateId)
      if (template) {
        for (const assignment of template.targetAssignments) {
          if (baseTargets.has(assignment.slotLabel)) {
            baseTargets.set(assignment.slotLabel, assignment.targetItem)
            baseTargetModes.set(assignment.slotLabel, 'EXPLICIT_TARGET')
          }
        }
      }
    }

    // Explicit per-slot edits from the Composer UI always win last.
    for (const [slotLabel, targetItem] of Object.entries(targetOverrides)) {
      if (baseTargets.has(slotLabel)) {
        baseTargets.set(slotLabel, targetItem)
        baseTargetModes.set(slotLabel, 'EXPLICIT_TARGET')
      }
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
        // Mission-kind rows deliberately do NOT carry parentSlotLabel/
        // groupLabel/assemblyRole/isStructural here (EWO-025/EWO-026) —
        // presentation hierarchy for a saved Loadout is reconstructed at
        // render time from the current canonical template (see
        // src/pages/ShipDetail.tsx's overlayCanonicalHierarchy /
        // src/pages/MissionComposer.tsx), never persisted redundantly.
        // sourcePortId IS carried, since it costs nothing and lets
        // src/utils/fleetAssetReconciliation.ts's strongest match tier
        // work on a saved row exactly like a fresh Factory one.
        sourcePortId: refRow.sourcePortId,
        targetMode: baseTargetModes.get(refRow.slotLabel) ?? 'EXPLICIT_TARGET',
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

  moveToShip: (itemId, shipId, slotLabel) => {
    const item = get().hangarItems.find((i) => i.id === itemId)
    const ship = get().ships.find((s) => s.id === shipId)
    if (!item || !ship) return { success: false, message: 'Item or ship not found.' }
    // EWO-STAB-002 (containment) — refuse outright unless slotLabel names
    // a real, currently-open hardpoint on this ship's active build. This
    // is deliberately checked here too, not only inside installComponent,
    // so this method never silently forwards a bad/empty slot and relies
    // on the callee to catch it — no first-open-slot scan happens
    // anywhere in this call chain any longer.
    const validSlot = get().hardpoints.some((h) => h.buildId === ship.activeBuildId && h.slotLabel === slotLabel && h.status !== 'OK')
    if (!slotLabel || !validSlot) {
      return { success: false, message: 'A valid, open destination slot is required to move a component to a ship.' }
    }
    const result = get().installComponent(shipId, item.name, slotLabel)
    // EWO-029 (Task 7, Scenario F) — a unit already reserved for a
    // different Fleet Asset/Build is never silently installed here.
    if (result.blocked === 'reserved-elsewhere') {
      return { success: false, message: `${item.name} has no Available stock — the remaining unit(s) are reserved for a different Fleet Asset/Build. Release that reservation first, or install using its own Fleet Asset and Loadout.` }
    }
    // EWO-STAB-002 (containment) — the same defensive catalog check
    // installComponent now performs for every caller.
    if (result.blocked === 'incompatible') {
      return { success: false, message: `${item.name} is not compatible with that slot.` }
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
    // EWO-STAB-002 (containment) — a slot is the Commander's (or the
    // calling UI's) own explicit destination choice; this method must
    // never guess one on its own. Previously, an absent/empty slotLabel
    // fell back to "the first non-OK hardpoint anywhere in the build,"
    // which is how Move To Ship could land a component in a completely
    // unrelated slot with no type/size check at all. No open slot is ever
    // scanned here now — a missing slot is an immediate, no-mutation
    // failure.
    if (!slotLabel) return { matched: false }
    // Mission Context (Alpha 2.1/2.2): install can target any Mission
    // Configuration assigned to this Fleet Asset, not only the currently
    // Active one — but Installed Loadout is shared physical state, so the
    // actual mutation always goes through applyInstalledChange, which
    // updates every Mission's row for this slot together and only lets
    // the ship-facing cache change when the mutated Mission IS active.
    const buildId = buildIdOverride ?? ship.activeBuildId
    const target = get().hardpoints.find((h) => h.buildId === buildId && h.slotLabel === slotLabel && h.status !== 'OK')
    if (!target) return { matched: false }

    // EWO-STAB-002 (containment) — defense-in-depth re-validation of the
    // exact same catalog-based check Quick Update's own UI already uses
    // to filter its Slot dropdown (isComponentSelectableForPort). The UI
    // filtering was never the actual enforcement point — nothing stopped
    // a caller that skips the UI (Move To Ship's former no-slot path,
    // direct store access) from installing a positively-known-incompatible
    // component into an explicit slot too. Only rejects a POSITIVE,
    // cataloged conflict (a real Shield into a real Power Plant slot,
    // etc.) — an uncataloged item is still permitted, same as everywhere
    // else this check is already used (EWO-024).
    if (!isComponentSelectableForPort(itemName, target.type, target.size)) {
      return { matched: false, blocked: 'incompatible' }
    }

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
      migrate: (persistedState, version) => {
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
              quarantinedAssignments?: unknown
            }
          | null
          | undefined
        // CAT-001A — `migrate` only ever runs for a save whose OWN stored
        // version predates the current PERSIST_VERSION (8) — reaching this
        // function at all is therefore itself proof this installation
        // already existed before this fix shipped, and its Commander
        // legitimately had the demo fleet as their real baseline. `version`
        // is intentionally unused beyond this check — every prior field
        // migration below already treats "field absent" as the correct
        // description of an old save, not something to branch on by
        // number.
        const isLegacyInstall = version < PERSIST_VERSION
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
            quarantinedAssignments: [],
            seedFleetLegacyInstall: isLegacyInstall,
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

        // EWO-043: a pre-7 save has no quarantinedAssignments field at all —
        // an empty array is the honest, correct description of that save
        // (nothing had ever been quarantined yet), not an error.
        const validQuarantined: QuarantinedAssignment[] = []
        for (const raw of Array.isArray(state.quarantinedAssignments) ? state.quarantinedAssignments : []) {
          if (isValidPersistedQuarantinedAssignment(raw)) validQuarantined.push(raw)
          else console.warn('[SFM] Skipping a persisted Quarantined Assignment record that failed migration validation:', raw)
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
          quarantinedAssignments: validQuarantined,
          seedFleetLegacyInstall: isLegacyInstall,
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
        // EWO-043 — Commander assignments whose port has disappeared
        // upstream; never rebuilt from anything else, so must round-trip
        // verbatim like every other real player record.
        quarantinedAssignments: state.quarantinedAssignments,
        // CAT-001A — once true (set only by `migrate`, for a save that
        // already existed before this fix), this must keep round-tripping
        // forever: after the very first post-fix save/reload, this
        // installation's stored version already matches PERSIST_VERSION,
        // so `migrate` never runs again — this field is the only place
        // that fact survives.
        seedFleetLegacyInstall: state.seedFleetLegacyInstall,
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
              quarantinedAssignments?: QuarantinedAssignment[]
              seedFleetLegacyInstall?: boolean
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

        // CAT-001A — the demo fleet is only ever a valid baseline for an
        // installation that already existed BEFORE this fix
        // (`seedFleetLegacyInstall`, set once by `migrate` and carried
        // forward by `partialize` from then on) or an opted-in developer
        // (DEV_SEED_FLEET_ENABLED). Deliberately NOT `hadPersistedState`:
        // a brand-new Commander's very first Add Ship action also makes
        // `hadPersistedState` true on their NEXT load, but must never
        // bring the demo fleet back for them — `hadPersistedState` only
        // ever answers "is this a true first-ever load," not "did this
        // installation predate the fix." Never falls back to
        // `currentState`, which is empty-by-default in a real build (see
        // the store initializer above) and would otherwise leave a
        // legacy Commander's seed-ship overrides with nothing to apply
        // against.
        const includeSeedBaseline = Boolean(persisted?.seedFleetLegacyInstall) || DEV_SEED_FLEET_ENABLED
        const seedBaseline = includeSeedBaseline ? buildSeedFleetBaseline() : EMPTY_FLEET_BASELINE

        // Mission M-012: apply the persisted seed-fleet diff on top of the
        // fresh seed bake-in BEFORE replaying manual assets. The seed
        // ships/builds/hardpoints themselves always come from
        // src/data/seed.ts verbatim — only presence (removed) and a few
        // player-editable fields (nickname/ownership/priority) are
        // overridden here, mirroring what removeFleetAsset/
        // updateFleetAssetNickname/updateFleetAssetOwnership/
        // updateFleetProfile already do live.
        let ships = [...seedBaseline.ships]
        let builds = [...seedBaseline.builds]
        let hardpoints = [...seedBaseline.hardpoints]
        const fleetAssets = seedBaseline.fleetAssets.map((a) => {
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
        const seedShipIdByAssetId = new Map(seedBaseline.fleetAssets.map((a) => [a.id, a.shipDefinitionId]))
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
        let installedLoadouts = persisted?.installedLoadouts ?? [...seedBaseline.installedLoadouts]
        if (removedSeedShipIds.size > 0) {
          installedLoadouts = installedLoadouts.filter((e) => !removedSeedShipIds.has(e.shipId))
        }
        const hangarItems = persisted?.hangarItems ?? seedBaseline.hangarItems
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
        //
        // EWO-043 — a custom Build's rows are no longer spliced back in
        // verbatim. Each one is reconciled against the CURRENT
        // authoritative template for its ship (see
        // src/utils/fleetAssetReconciliation.ts): Factory data always
        // comes from the current template (Task 2); Installed/Target are
        // carried over from the Commander's saved row (Tasks 3/4); a row
        // whose port no longer exists is pulled into `quarantinedAssignments`
        // rather than silently disappearing (Task 7); a genuinely new port
        // is appended fresh (Task 6). A ship whose current template is
        // unavailable (e.g. its ShipDefinition no longer resolves at all)
        // falls back to the old verbatim rows rather than losing them.
        const survivingShipIds = new Set(ships.map((s) => s.id))
        const customBuilds = (persisted?.customBuilds ?? []).filter((b) => survivingShipIds.has(b.shipId))
        const customBuildIds = new Set(customBuilds.map((b) => b.id))
        const shipIdByAssetShipDefinitionId = new Map(fleetAssets.map((a) => [a.id, a.shipDefinitionId]))
        const persistedCustomBuildHardpoints = (persisted?.customBuildHardpoints ?? []).filter((h) => customBuildIds.has(h.buildId))

        const quarantinedAssignments: QuarantinedAssignment[] = [...(persisted?.quarantinedAssignments ?? [])]
        const slotLabelMigrationsByShipId = new Map<string, Array<{ oldSlotLabel: string; newSlotLabel: string }>>()
        const reconciledCustomHardpoints: Hardpoint[] = []
        for (const build of customBuilds) {
          const oldRowsForBuild = persistedCustomBuildHardpoints.filter((h) => h.buildId === build.id)
          const template = shipFactoryTemplates[shipIdByAssetShipDefinitionId.get(build.shipId) ?? ''] ?? shipFactoryTemplates[build.shipId]
          if (!template) {
            // No current authoritative template resolves for this ship at
            // all (as opposed to one that legitimately resolves to zero
            // ports) — preserve the Commander's rows exactly as before
            // rather than discarding them; there is nothing safe to
            // reconcile against.
            reconciledCustomHardpoints.push(...oldRowsForBuild)
            continue
          }
          const { hardpoints: reconciled, quarantined, slotLabelMigrations } = reconcileBuildHardpoints(build.shipId, build.id, oldRowsForBuild, template)
          reconciledCustomHardpoints.push(...reconciled)
          quarantinedAssignments.push(...quarantined)
          if (slotLabelMigrations.length > 0) {
            const list = slotLabelMigrationsByShipId.get(build.shipId) ?? []
            list.push(...slotLabelMigrations)
            slotLabelMigrationsByShipId.set(build.shipId, list)
          }
        }
        builds = [...builds.filter((b) => !customBuildIds.has(b.id)), ...customBuilds]
        hardpoints = [...hardpoints.filter((h) => !customBuildIds.has(h.buildId)), ...reconciledCustomHardpoints]

        // Migrate the shared, slotLabel-keyed installedLoadouts record for
        // any port a reconciliation above renamed (Scenario D) — otherwise
        // the Commander's real installed state would orphan under the old
        // label the instant its port's name/hierarchy changes upstream.
        for (const [shipId, migrations] of slotLabelMigrationsByShipId.entries()) {
          for (const { oldSlotLabel, newSlotLabel } of migrations) {
            installedLoadouts = installedLoadouts.map((e) => (e.shipId === shipId && e.slotLabel === oldSlotLabel ? { ...e, slotLabel: newSlotLabel } : e))
          }
        }

        // EWO-043 (Task 3) — installedLoadouts is the single authoritative
        // record of what's physically installed; every rendered Hardpoint
        // row's own installedItem is kept in sync FROM it here, exactly
        // once, for every ship (Factory rows included). Before this fix, a
        // Factory-kind build's hardpoints were always fresh-materialized
        // with installedItem reset to the current factory default, which
        // silently discarded whatever the Commander had actually installed
        // the moment that factory item wasn't already a plain factory-fresh
        // match (CWO-003, Task 2 baseline finding).
        const installedByShipAndSlot = new Map(installedLoadouts.map((e) => [`${e.shipId}::${e.slotLabel}`, e.installedItem]))
        hardpoints = hardpoints.map((h) => {
          if (h.isStructural) return h
          const authoritative = installedByShipAndSlot.get(`${h.shipId}::${h.slotLabel}`)
          if (authoritative === undefined || authoritative === h.installedItem) return h
          const { status, invalidMessage } = computeHardpointStatusWithValidation(authoritative, h.targetItem, h.factoryItem, h.type, h.size)
          return { ...h, installedItem: authoritative, status, invalidMessage }
        })

        // Recompute every affected Build's readiness/missing — reconciled
        // row counts/status can genuinely change (new ports, quarantined
        // ports, re-validated targets, the installedLoadouts overlay above).
        const affectedBuildIds = new Set([...customBuildIds, ...builds.filter((b) => survivingShipIds.has(b.shipId)).map((b) => b.id)])
        builds = builds.map((b) => {
          if (!affectedBuildIds.has(b.id)) return b
          const progress = calculateBuildProgress(hardpoints.filter((h) => h.buildId === b.id))
          const missing = hardpoints.filter((h) => h.buildId === b.id && (h.status === 'Missing' || h.status === 'Upgrade Available')).map((h) => h.targetItem)
          return { ...b, missing, readiness: progress.percentage }
        })

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
          const activeBuildRecord = builds.find((b) => b.id === (activeId ?? s.activeBuildId) && b.shipId === s.id)
          if (!activeBuildRecord) return s
          return { ...s, activeBuildId: activeBuildRecord.id, missing: activeBuildRecord.missing, readiness: activeBuildRecord.readiness }
        })

        return {
          ...currentState,
          ships,
          builds,
          hardpoints,
          fleetAssets,
          installedLoadouts,
          hangarItems,
          reservations,
          seedAssetOverrides,
          hasPersistedState: hadPersistedState,
          // CAT-001A — carries forward only the actual legacy-install fact
          // (set once by `migrate`), never re-derived from
          // DEV_SEED_FLEET_ENABLED — a developer's local opt-in must not
          // permanently stick to a save the moment it's used once.
          seedFleetLegacyInstall: Boolean(persisted?.seedFleetLegacyInstall),
          quarantinedAssignments,
          // CAT-001A — the demo Captain's Log narrates the demo fleet by
          // name; it must never outlive the fleet it describes for a
          // genuinely new Commander. Never persisted either way (see
          // partialize below), so this only ever affects what's shown
          // immediately after a reload, not anything a Commander wrote
          // during the live session via addLogEntry.
          log: seedBaseline.log,
        }
      },
    }
  )
)
