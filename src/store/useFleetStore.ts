import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Ship, Build, Hardpoint, HangarItem, LogEntry, Disposition, FleetAsset, OwnershipType, InstalledLoadoutEntry, QuartermasterTemplate, SeedAssetOverride, QuarantinedAssignment } from '../types'
import { ships as seedShips, builds as seedBuilds, hardpoints as seedHardpoints, hangarItems as seedHangarItems, initialLog, customBuildOverlays } from '../data/seed'
import { computeHardpointStatusWithValidation } from '../utils/hardpointStatus'
import { shipDefinitions as allShipDefinitions, selectableShipDefinitions, shipDefinitionById, shipFactoryTemplates } from '../data/shipDefinitions'
import { migrateSeedFleetToAssets } from '../data/fleetAssetMigration'
import { materializeFleetAsset } from '../utils/fleetAssetMaterializer'
import { reconcileBuildHardpoints } from '../utils/fleetAssetReconciliation'
import { resolveShipImage } from '../utils/resolveShipImage'
import { selectActiveShips, isActiveShip, activeReservationsForShip, resolvePurgeConfirmationPhrase, matchesPurgeConfirmationPhrase } from '../utils/fleetLifecycle'
import { ownershipTypeToLegacy } from '../utils/ownership'
import { seedQuartermasterTemplates } from '../data/quartermasterTemplates'
import { calculateBuildProgress } from '../utils/buildProgress'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { executeInstallation, resolveComponentIdentity } from '../engine/installation'
import type { InstallationEffects, InstallationStateSnapshot } from '../engine/installation'
import type { MissionReservation } from '../types'
import { componentOwnedChildSlotSpec, type ComponentOwnedSlotSpec } from '../utils/componentOwnedSlots'
import { resolveShipDefinitionId } from '../utils/loadoutEditorModel'
import { resolveShipEntityClass } from '../utils/shipIdentityLine'
import { swapGroupEligibleEntityClassesFor } from '../generated/configurableSlots'
import type { FactoryHardpointTemplate } from '../data/shipDefinitions'
import { normalizeFleetPriorities, reorderFleetPriority, closePriorityGapOnRemoval } from '../utils/fleetPriority'
import {
  reconcileArray,
  reconcileHardpointComponentIdentity,
  reconcileInstalledLoadoutEntryIdentity,
  reconcileHangarItemIdentity,
  reconcileReservationIdentity,
} from './persistedComponentIdentityReconciliation'
import { buildFleetPersistencePayload, buildFleetExportEnvelope, type FleetPersistenceSource, type FleetExportEnvelope } from '../utils/fleetSerialization'
import { parseFleetImportFile, buildFleetImportSummary, computeFleetImportWarnings, type FleetImportSummary } from '../utils/fleetImport'
import { APP_VERSION } from '../config/appVersion'

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
// UX-005A: bumped 8 -> 9 to add FleetAsset.customImageRef /
// SeedAssetOverride.customImageRef — a pre-9 save simply has neither
// field, which `isValidPersistedFleetAsset`/`isValidSeedAssetOverride`
// below treat as "no custom image ever set" (correct for a save written
// before this feature existed), not an error.
// SW-015C: bumped 9 -> 10 to replace `status: 'active' | 'removed'` with
// `lifecycleStatus: 'active' | 'retired'` (+ `retiredAt`) on both
// FleetAsset and SeedAssetOverride. Unlike every prior bump, a pre-10
// save's old field genuinely needs a VALUE translation, not just "treat
// as absent" — `migrate` below maps `status: 'removed'` ->
// `lifecycleStatus: 'retired'` and `'active'`/missing -> `'active'`
// for both collections before validation runs, so no existing vessel
// (active or already-removed) is lost or reidentified.
// EWO-097: bumped 10 -> 11 to add SeedAssetOverride.purged — a pre-11
// save simply has none, which `isValidSeedAssetOverride` below and
// `mergeFleetPersistedState`'s purge-exclusion filter both treat as
// "never purged" (correct for a save written before this feature
// existed), not an error. Purely additive, like customImageRef before
// it — no value translation required.
const PERSIST_VERSION = 11

/**
 * EWO-093 — Fleet Export. `PERSIST_VERSION` is deliberately kept private
 * to this file (never duplicated into a second "export schema version"
 * constant — see docs/Beta-2.1-Fleet-Export-Architecture.md §3), so this
 * is the one place the live store, the persistence version, and the
 * portable export envelope all meet. `fleetSerialization.ts` itself has
 * no knowledge of PERSIST_VERSION or the store — it only builds the
 * payload/envelope shapes from whatever numbers/state it's handed.
 */
export function buildFleetExportSnapshot(source: FleetPersistenceSource): FleetExportEnvelope {
  return buildFleetExportEnvelope(buildFleetPersistencePayload(source), PERSIST_VERSION, APP_VERSION.productVersion)
}

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
      entries.push({ shipId: ship.id, slotLabel: row.slotLabel, installedItem: row.installedItem, entityClass: row.installedEntityClass })
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
// EWO-062A — exported so other local-developer-only UI (Ship Management's
// Developer Mode toggle) can gate on this exact same flag rather than
// `import.meta.env.DEV`, for the identical reason documented above.
export const DEV_SEED_FLEET_ENABLED = import.meta.env.VITE_SFM_DEV_SEED_FLEET === 'true'

interface SeedFleetBaseline {
  ships: Ship[]
  builds: Build[]
  hardpoints: Hardpoint[]
  hangarItems: HangarItem[]
  log: LogEntry[]
  installedLoadouts: InstalledLoadoutEntry[]
  fleetAssets: FleetAsset[]
}

/**
 * SW-005 Phase 2 (Canonical Factory Construction) — the stable Build id
 * every seed ship's Factory Loadout has always used (kept unchanged from
 * the ids already established by earlier missions, including the two
 * ships — 135c, UTV — whose Factory Loadout used to be their only,
 * hand-authored, seed.ts Build). Only the mechanical *content* changes:
 * every one of these Build/Hardpoint sets is now produced fresh by
 * `materializeFleetAsset` against the ship's own canonical
 * `shipFactoryTemplates` entry — the exact same authority a manually-added
 * Fleet Asset already used — never hand-typed in src/data/seed.ts.
 */
const SEED_FACTORY_BUILD_ID: Record<string, string> = {
  ghost: 'ghost-factory',
  corsair: 'corsair-factory',
  mole: 'mole-factory',
  railen: 'railen-factory',
  '135c': '135c-shuttle',
  'cutlass-black': 'cutlass-black-factory',
  'cutlass-red': 'cutlass-red-factory',
  m80: 'm80-factory',
  starlite: 'starlite-factory',
  utv: 'utv-default',
  vulture: 'vulture-factory',
  prospector: 'prospector-factory',
}

/**
 * SW-005 Phase 2 — the set of Build ids `SEED_FACTORY_BUILD_ID` produces.
 * A seed ship's Factory Loadout has no "Commander already installed
 * something different" concept at all — it is always freshly regenerated,
 * pure Installed = Target = Factory by construction (`materializeFleetAsset`'s
 * own contract) — so it must never be overlaid with `installedLoadouts`
 * (see the EWO-043 overlay in `merge()` below, and its own comment there).
 */
const SEED_CANONICAL_FACTORY_BUILD_IDS = new Set(Object.values(SEED_FACTORY_BUILD_ID))

/**
 * SW-005 Phase 2 — constructs every seed ship's Factory Loadout Build +
 * Hardpoints fresh, via `materializeFleetAsset` against the ship's real
 * canonical `shipFactoryTemplates` entry (`shipDefinitionById`/
 * `shipFactoryTemplates` already resolve every seed id through
 * `supersededByCanonical` to the richest available deep-import data — see
 * SW-004). A minimal synthetic `existingAsset` stub forces
 * `materializeFleetAsset` to reuse the ship's own stable id and this
 * mission's stable Factory Build id, rather than minting a fresh unique
 * one as it would for a genuinely new manual asset — everything else
 * about the returned `asset`/`ship` is discarded; seed ships already have
 * their own real identity via `migrateSeedFleetToAssets()`/`seed.ts`
 * (Phase 5: identity/demonstration data stays seed-owned, only mechanical
 * topology moves to canonical authority). `isActive` is set to match
 * whichever build src/data/seed.ts's own `ships` array actually has
 * active — true only for 135c/UTV, which have no custom Build at all.
 */
function buildCanonicalSeedFactoryBuilds(): { builds: Build[]; hardpoints: Hardpoint[] } {
  const builds: Build[] = []
  const hardpoints: Hardpoint[] = []
  for (const [shipId, factoryBuildId] of Object.entries(SEED_FACTORY_BUILD_ID)) {
    const definition = shipDefinitionById.get(shipId)
    if (!definition) continue
    const template = shipFactoryTemplates[shipId] ?? []
    const stub: FleetAsset = {
      id: shipId,
      shipDefinitionId: shipId,
      ownershipType: 'OWNED',
      acquisitionSource: 'SEED_MIGRATION',
      activeBuildId: factoryBuildId,
      installedLoadoutId: `${shipId}-installed`,
      priority: null,
      lifecycleStatus: 'active',
      addedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const materialized = materializeFleetAsset({ definition, template, existingAsset: stub })
    const seedShip = seedShips.find((s) => s.id === shipId)
    builds.push({ ...materialized.build, isActive: seedShip?.activeBuildId === factoryBuildId })
    hardpoints.push(...materialized.hardpoints)
  }
  return { builds, hardpoints }
}

/**
 * SW-006 Phase 1/2 (Canonical Commander Build Model / Canonical Overlay
 * Model) — constructs every seed ship's CUSTOM build(s) fresh from real
 * canonical topology (`shipFactoryTemplates`), applying `seed.ts`'s
 * `customBuildOverlays` (the only remaining Commander-facing, seed-owned
 * data — which real canonical port got which installed/target choice) on
 * top. Mirrors `buildCanonicalSeedFactoryBuilds`'s row-construction rules
 * exactly (structural rows pass through untouched; a configurable row's
 * status is computed the same way `materializeFleetAsset` computes it),
 * the difference being only that a row's installed/target values come
 * from the overlay when present, factory-fresh otherwise — never a guess,
 * never fuzzy-matched (SW-006's No Silent Conversion principle): an
 * overlay slotLabel that doesn't exist on the current canonical template
 * is simply inert (no such port to apply it to), not a crash or a
 * best-effort substitution.
 *
 * M80 and Starlite are absent from `customBuildOverlays` by design (see
 * its own doc comment in seed.ts) — their real, hand-authored builds keep
 * flowing through unchanged via `seedBuilds`/`seedHardpoints`.
 */
function buildCanonicalSeedCustomBuilds(): { builds: Build[]; hardpoints: Hardpoint[] } {
  const builds: Build[] = []
  const hardpoints: Hardpoint[] = []
  for (const overlay of customBuildOverlays) {
    const definition = shipDefinitionById.get(overlay.shipId)
    if (!definition) continue
    const template = shipFactoryTemplates[overlay.shipId] ?? []
    const rows: Hardpoint[] = template.map((slot, i) => {
      if (slot.isStructural) {
        return {
          id: `${overlay.buildId}-hp-${i}`,
          shipId: overlay.shipId,
          buildId: overlay.buildId,
          slotLabel: slot.slotLabel,
          type: slot.type,
          size: slot.size,
          factoryItem: '—',
          installedItem: '—',
          targetItem: '—',
          status: 'OK' as const,
          parentSlotLabel: slot.parentSlotLabel,
          groupLabel: slot.groupLabel,
          assemblyRole: slot.assemblyRole,
          isStructural: true,
          sourcePortId: slot.sourcePortId,
          sourceItemPortName: slot.sourceItemPortName,
          sourceParentItemPortName: slot.sourceParentItemPortName,
        }
      }
      const assignment = overlay.assignments[slot.slotLabel]
      const installedItem = assignment?.installedItem ?? slot.factoryItem
      const targetItem = assignment?.targetItem ?? slot.factoryItem
      const factoryEntityClass = slot.factoryEntityClass ?? resolveComponentIdentity({ displayName: slot.factoryItem })?.entityClass ?? undefined
      const installedEntityClass = assignment?.installedItem ? (resolveComponentIdentity({ displayName: assignment.installedItem })?.entityClass ?? undefined) : factoryEntityClass
      const targetEntityClass = assignment?.targetItem ? (resolveComponentIdentity({ displayName: assignment.targetItem })?.entityClass ?? undefined) : factoryEntityClass
      const { status, invalidMessage } = computeHardpointStatusWithValidation(installedItem, targetItem, slot.factoryItem, slot.type, slot.size, {
        installedEntityClass,
        targetEntityClass,
        factoryEntityClass,
      })
      return {
        id: `${overlay.buildId}-hp-${i}`,
        shipId: overlay.shipId,
        buildId: overlay.buildId,
        slotLabel: slot.slotLabel,
        type: slot.type,
        size: slot.size,
        factoryItem: slot.factoryItem,
        installedItem,
        targetItem,
        factoryEntityClass,
        installedEntityClass,
        targetEntityClass,
        status,
        invalidMessage,
        parentSlotLabel: slot.parentSlotLabel,
        groupLabel: slot.groupLabel,
        assemblyRole: slot.assemblyRole,
        // SW-013C.2G Amendment A — this row-construction path
        // (buildCanonicalSeedCustomBuilds) duplicates
        // materializeFleetAsset's own row shape rather than reusing it
        // (see this function's own doc comment), so the isDormant/
        // dormantDonorShipEntityClass passthrough added to
        // materializeFleetAsset and overlayCanonicalHierarchy for
        // SW-013C.2G was missed here. This is the root cause of the
        // Ghost Mk II Nose Turret never appearing as a candidate on the
        // seed 'ghost' fixture specifically: without isDormant on the
        // row, ShipWorkspacePrototype.tsx's configurableSlotFor never
        // takes its donor-ship swap-group fallback, so the port resolves
        // as unconfigurable and only "Intentional Empty" is offered.
        isDormant: slot.isDormant,
        dormantDonorShipEntityClass: slot.dormantDonorShipEntityClass,
        dormantAllowedComponentEntityClasses: slot.dormantAllowedComponentEntityClasses,
        sourcePortId: slot.sourcePortId,
        sourceItemPortName: slot.sourceItemPortName,
        sourceParentItemPortName: slot.sourceParentItemPortName,
        targetMode: assignment?.targetItem ? ('EXPLICIT_TARGET' as const) : ('FOLLOW_FACTORY' as const),
      }
    })
    // EWO-085 — previously a second, independent readiness formula
    // (denominator = every non-structural row, missing the canonical
    // engine's own exclusion of Unresolved-status and truly-untargeted
    // rows). Calling `calculateBuildProgress` directly reproduces the old
    // structural exclusion for free (a structural row's target/installed/
    // factory are always the '—' sentinel by construction) and closes the
    // gap the old formula missed. See fleetAssetMaterializer.ts's own
    // EWO-085 comment for the identical fix applied there.
    const missing = rows.filter((r) => r.status === 'Missing' || r.status === 'Upgrade Available').map((r) => r.targetItem)
    const readiness = calculateBuildProgress(rows).percentage
    builds.push({ id: overlay.buildId, shipId: overlay.shipId, name: overlay.name, role: overlay.role, readiness, isActive: overlay.isActive, missing, kind: 'CUSTOM' })
    hardpoints.push(...rows)
  }
  return { builds, hardpoints }
}

/** The full Alpha-era demo fleet, materialized fresh — used only when it should actually be shown (see DEV_SEED_FLEET_ENABLED and `merge`'s `includeSeedBaseline` below). */
function buildSeedFleetBaseline(): SeedFleetBaseline {
  const canonicalFactory = buildCanonicalSeedFactoryBuilds()
  const canonicalCustom = buildCanonicalSeedCustomBuilds()
  const factoryBuildById = new Map(canonicalFactory.builds.map((b) => [b.id, b]))
  const customBuildById = new Map(canonicalCustom.builds.map((b) => [b.id, b]))
  // SW-005/SW-006 — seed.ts's own hardcoded readiness/missing (both
  // Factory and now CUSTOM builds) are provisional placeholders,
  // overwritten here with the real, freshly-constructed values for
  // whichever build is actually active. Only M80/Starlite (still
  // seed-authored, unaffected) fall through to their own real numbers.
  const ships = withResolvedSeedImages(seedShips).map((s) => {
    const activeBuild = factoryBuildById.get(s.activeBuildId) ?? customBuildById.get(s.activeBuildId)
    return activeBuild ? { ...s, readiness: activeBuild.readiness, missing: activeBuild.missing } : s
  })
  const allHardpoints = [...seedHardpoints, ...canonicalFactory.hardpoints, ...canonicalCustom.hardpoints]
  return {
    ships,
    builds: [...seedBuilds, ...canonicalFactory.builds, ...canonicalCustom.builds],
    hardpoints: allHardpoints,
    hangarItems: [...seedHangarItems],
    log: [...initialLog],
    installedLoadouts: deriveInitialInstalledLoadouts(ships, allHardpoints),
    fleetAssets: migrateSeedFleetToAssets(),
  }
}

/** A genuinely new Commander's starting state — zero ships, zero inventory, zero log — per CAT-001A's required product behavior. */
const EMPTY_FLEET_BASELINE: SeedFleetBaseline = { ships: [], builds: [], hardpoints: [], hangarItems: [], log: [], installedLoadouts: [], fleetAssets: [] }

/**
 * EWO-STAB-004B (ADR-010) — a target override that carries the
 * Commander's actually-selected canonical identity, not just the display
 * name text. `targetEntityClass` is optional and only ever set when a
 * catalog picker option with a known entityClass was chosen; an
 * uncataloged/free-text selection omits it entirely (never a guess).
 */
export interface TargetOverrideValue {
  targetItem: string
  targetEntityClass?: string
}

/** A per-slot override accepted by `saveMissionConfiguration` — either the
 * legacy bare display-name string (resolved by name, exactly as before
 * EWO-STAB-004B) or the richer `TargetOverrideValue` shape. */
export type TargetOverrideInput = string | TargetOverrideValue

// EWO-094 — exported so Fleet Import's preview pipeline (buildFleetImportPreview,
// replaceFleetFromImport, both below) can be typed against the real store
// shape rather than a duplicated one.
export interface FleetState {
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
    priority?: number | null
  ) => { success: boolean; assetId?: string; message?: string }
  /** SW-015C — moves a vessel out of active service (Fleet Registry
   * lifecycle). Never destructive: no Ship/Build/Hardpoint/
   * InstalledLoadout row is touched, no custom image is deleted. Closes
   * the retiring ship's own gap in the active priority sequence and
   * releases its ACTIVE reservations back to unreserved inventory. See
   * `recommissionFleetAsset` for the reverse transition. */
  retireFleetAsset: (assetId: string) => { success: boolean; message?: string; releasedReservationCount?: number }
  /** SW-015C — the reverse of `retireFleetAsset`. Restores the exact same
   * vessel record to active service (never a duplicate); resets Priority
   * to Unprioritized rather than reinstating a possibly-stale rank; never
   * recreates reservations released at retirement time. */
  recommissionFleetAsset: (assetId: string) => { success: boolean; message?: string }
  /** EWO-097 — Fleet Registry Lifecycle's third and only destructive
   * transition. Permanently removes a RETIRED vessel's own Fleet
   * Asset/Ship/Build/Hardpoint/InstalledLoadout/reservation/quarantine
   * records, returning any genuinely installed owned component to Hangar
   * Inventory first via the existing canonical installation engine
   * (never a parallel inventory mutation). Captures a pre-purge recovery
   * snapshot (the same EWO-093 export mechanism) before any mutation —
   * returned to the caller, held in memory only for the remainder of the
   * session (no download, no in-app restore UI; both explicitly out of
   * scope). Refuses an active vessel outright — retire first. A future
   * acquisition of the same ship model is an entirely new Fleet Asset;
   * nothing about this purge is keyed by `shipDefinitionId`, so it can
   * never implicitly revive or collide with the purged record.
   *
   * EWO-097 Amendment (Canonical Purge Confirmation Phrase) —
   * `confirmationInput` is required and independently validated here via
   * the same `resolvePurgeConfirmationPhrase`/`matchesPurgeConfirmationPhrase`
   * helpers the UI's own button-enablement predicate uses (Requirement 7:
   * "Do not rely only on disabled-button protection"). A mismatched or
   * missing confirmation fails cleanly with zero mutation, exactly like
   * calling this against an active vessel already does — a caller can
   * never bypass the typed-confirmation safeguard by skipping the UI. */
  purgeFleetAsset: (
    assetId: string,
    confirmationInput: string
  ) => { success: boolean; message?: string; returnedComponentCount?: number; recoverySnapshot?: FleetExportEnvelope }
  updateFleetAssetNickname: (assetId: string, nickname: string | undefined) => { success: boolean; message?: string }
  updateFleetAssetOwnership: (assetId: string, ownershipType: OwnershipType) => { success: boolean; message?: string }
  /** UX-005A (Deliverable 1/4) — sets or clears this specific vessel's
   * custom image reference (`undefined` = Restore Default). Never touches
   * `shipDefinitionId`-level or Loadout-level data — two FleetAssets
   * sharing a model are unaffected by each other's calls to this action.
   * Does not itself write to managed storage (see
   * src/utils/shipImageStorage.ts) — callers store/delete the blob first,
   * then call this to persist the reference. */
  updateFleetAssetCustomImage: (assetId: string, customImageRef: string | undefined) => { success: boolean; message?: string }
  /** Fleet Profile (Alpha 2.4, Part 7) — Primary/Secondary Role are
   * descriptive only, independent of the authoritative Ship
   * Classification. Priority is no longer part of this action (EWO-066
   * Part E) — see `setFleetPriority`, the one path that mutates it, so
   * the unique-ranking invariant can never be bypassed. */
  updateFleetProfile: (assetId: string, updates: { primaryRole?: string; secondaryRole?: string }) => { success: boolean; message?: string }
  /** EWO-066 (Part E) — the sole entry point for changing a ship's Fleet
   * Priority. `priority: null` means "Unprioritized." Every other ranked
   * ship is automatically reordered (see src/utils/fleetPriority.ts's
   * `reorderFleetPriority`) to keep the 1..N sequence unique and
   * gap-free — this one call can therefore change more than one ship's
   * stored priority. */
  setFleetPriority: (shipId: string, priority: number | null) => { success: boolean; message?: string }

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
    // EWO-STAB-004B (ADR-010) — a per-slot override may still be a plain
    // display-name string (legacy shape, resolved by name exactly as
    // before) or the richer { targetItem, targetEntityClass? } shape a
    // catalog picker selection now supplies. Not a parallel system: the
    // same field, the same precedence ("explicit per-slot edits always
    // win last"), just a wider value type — see TargetOverrideValue.
    targetOverrides: Record<string, TargetOverrideInput>
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
  /** EWO-094 — Replace step of the Fleet Import workflow. `mergedState` is
   * the exact already-validated, already-migrated, already-merged state
   * `buildFleetImportPreview` computed for the Preview — this action never
   * re-derives or re-validates anything, it only commits it (Step 6/7:
   * capture an in-memory recovery snapshot of the CURRENT state via the
   * same canonical export mechanism, then replace). `set()` triggers the
   * existing `persist` middleware's own `partialize`/storage write
   * automatically, exactly like every other mutation — Import never
   * touches `localStorage` directly. Returns the recovery snapshot so the
   * caller can hold it in memory for the rest of the session. */
  replaceFleetFromImport: (mergedState: FleetState) => FleetExportEnvelope
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
/** Exported (UX-005A) so the shared ship-image resolver hook
 * (src/utils/useResolvedShipImage.ts) can go from a rendered `Ship.id` to
 * its owning `FleetAsset.id` the same way every other per-asset store
 * action already does, rather than re-deriving the `-asset-seed` suffix
 * convention itself. */
export function resolveFleetAssetId(shipId: string, fleetAssets: FleetAsset[]): string | undefined {
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
    // EWO-066 (Part E) — `null` is a valid, first-class "Unprioritized" value.
    (typeof r.priority === 'number' || r.priority === null) &&
    // SW-015C — by the time this runs, `migrateLegacyLifecycleStatus`
    // (called from `migrate` below) has already translated any
    // pre-existing `status` value into `lifecycleStatus` for every raw
    // record, active or retired alike — a record that still lacks a
    // valid value here is genuinely malformed, not just old.
    (r.lifecycleStatus === 'active' || r.lifecycleStatus === 'retired')
  )
}

function isValidSeedAssetOverride(raw: unknown): raw is SeedAssetOverride {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  if (typeof r.updatedAt !== 'string') return false
  if (r.lifecycleStatus !== undefined && r.lifecycleStatus !== 'active' && r.lifecycleStatus !== 'retired') return false
  if (r.retiredAt !== undefined && typeof r.retiredAt !== 'string') return false
  if (r.nickname !== undefined && typeof r.nickname !== 'string') return false
  if (r.ownershipType !== undefined && r.ownershipType !== 'OWNED' && r.ownershipType !== 'PURCHASED' && r.ownershipType !== 'LOANER') return false
  if (r.priority !== undefined && r.priority !== null && typeof r.priority !== 'number') return false
  // UX-005A — same permissive-optional-string shape as `nickname` above.
  if (r.customImageRef !== undefined && typeof r.customImageRef !== 'string') return false
  // EWO-097 — a purged override's own field.
  if (r.purged !== undefined && typeof r.purged !== 'boolean') return false
  return true
}

/**
 * SW-015C — translates a pre-PERSIST_VERSION-10 record's old
 * `status: 'active' | 'removed'` field into the new
 * `lifecycleStatus`/`retiredAt` shape, in place, before validation runs.
 * Applied to both `fleetAssets` and `seedAssetOverrides` raw records in
 * `migrate` below. A record that already has `lifecycleStatus` (a
 * genuinely post-10 save, or one this function already touched) is left
 * alone. `retiredAt` can't be reconstructed for a legacy 'removed'
 * record (the original removal timestamp was never recorded under the
 * old model) — left `undefined`, which is purely administrative/display
 * metadata and never gates any business rule.
 */
function migrateLegacyLifecycleStatus(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const r = raw as Record<string, unknown>
  if ('lifecycleStatus' in r) return raw
  if (!('status' in r)) return raw
  const { status, ...rest } = r
  return { ...rest, lifecycleStatus: status === 'removed' ? 'retired' : 'active' }
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
// EWO-STAB-003C (ADR-010) — `entityClass` carries the canonical identity
// the installation engine already resolved for `newInstalledItem`
// (undefined for an uncataloged component, or for a '—' removal — both
// correctly clear any previously stored value rather than leaving it
// stale). Additive: every existing caller/behavior is unchanged for a
// row that never gains one.
function applyInstalledChange(get: () => FleetState, set: (partial: Partial<FleetState>) => void, shipId: string, slotLabel: string, newInstalledItem: string, entityClass?: string): string[] {
  const state = get()

  const installedLoadouts = (() => {
    const existing = state.installedLoadouts.find((e) => e.shipId === shipId && e.slotLabel === slotLabel)
    if (existing) {
      return state.installedLoadouts.map((e) => (e === existing ? { ...e, installedItem: newInstalledItem, entityClass } : e))
    }
    return [...state.installedLoadouts, { shipId, slotLabel, installedItem: newInstalledItem, entityClass }]
  })()
  set({ installedLoadouts })

  const affectedBuildIds = new Set<string>()
  const hardpoints = state.hardpoints.map((h) => {
    if (h.shipId !== shipId || h.slotLabel !== slotLabel) return h
    affectedBuildIds.add(h.buildId)
    // EWO-STAB-003D (ADR-010) — identity now threaded into the status
    // calculation itself, not just stored on the row: `entityClass` is the
    // newly installed item's own resolved identity (undefined for a
    // removal or an uncataloged component); h.targetEntityClass/
    // factoryEntityClass are this row's own persisted identity for the
    // other two sides of the comparison.
    const { status, invalidMessage } = computeHardpointStatusWithValidation(newInstalledItem, h.targetItem, h.factoryItem, h.type, h.size, {
      installedEntityClass: entityClass,
      targetEntityClass: h.targetEntityClass,
      factoryEntityClass: h.factoryEntityClass,
    })
    return { ...h, installedItem: newInstalledItem, installedEntityClass: entityClass, status, invalidMessage }
  })
  set({ hardpoints })

  for (const buildId of affectedBuildIds) {
    recomputeBuildDerivedState(get, set, buildId)
  }
  return Array.from(affectedBuildIds)
}

/**
 * EWO-STAB-003B — wires src/engine/installation's state snapshot and
 * injected effects for the current `get`/`set`. The engine itself never
 * imports Zustand or FleetState (EWO-STAB-003A §1) — this is the one
 * place that boundary is crossed, and it crosses in the direction the
 * store depending on the engine, never the reverse. `applyShipMutation`
 * and `returnToInventory` delegate to the exact same, unchanged
 * `applyInstalledChange`/`addHangarItem` every pre-existing caller already
 * used — nothing about those two is reimplemented here.
 */
function buildInstallationContext(get: () => FleetState, set: (partial: Partial<FleetState>) => void): { state: InstallationStateSnapshot; effects: InstallationEffects } {
  return {
    state: {
      ships: get().ships,
      builds: get().builds,
      hardpoints: get().hardpoints,
      hangarItems: get().hangarItems,
      reservations: get().reservations,
      installedLoadouts: get().installedLoadouts,
    },
    effects: {
      applyShipMutation: (shipId, slotLabel, newInstalledItem, entityClass) => applyInstalledChange(get, set, shipId, slotLabel, newInstalledItem, entityClass),
      commitHangarItems: (hangarItems) => set({ hangarItems }),
      commitReservations: (reservations) => set({ reservations }),
      returnToInventory: (item) => {
        const { entityClass, ...rest } = item
        get().addHangarItem({ ...rest, entityClass, qty: 1, neededBy: 'None', disposition: 'Store' })
      },
    },
  }
}

/** The exact return shape `migrateFleetPersistedState` produces — every
 * field always present, though `hangarItems`/`installedLoadouts` may be
 * `undefined` (meaning "no persisted value at all; let `merge` keep its
 * own fresh defaults" — see that field's own comment inside the function
 * below). EWO-094 — named so Fleet Import can call the exact same
 * function `persist()`'s own `migrate` option calls, rather than a
 * second, parallel migration implementation. */
interface FleetMigratedPersistedState {
  fleetAssets: FleetAsset[]
  hangarItems: HangarItem[] | undefined
  reservations: MissionReservation[]
  installedLoadouts: InstalledLoadoutEntry[] | undefined
  seedAssetOverrides: Record<string, SeedAssetOverride>
  customBuilds: Build[]
  customBuildHardpoints: Hardpoint[]
  activeBuildByShipId: Record<string, string>
  quarantinedAssignments: QuarantinedAssignment[]
  seedFleetLegacyInstall: boolean
}

/**
 * EWO-094 — extracted verbatim (unchanged logic) from `persist()`'s own
 * `migrate` option below, so Fleet Import's preview pipeline can call the
 * EXACT SAME validation/migration logic a real browser reload already
 * runs, in memory, without touching `localStorage`. See that option's own
 * doc comment for the full field-by-field migration history — nothing
 * about the logic itself changed, only that it is now reachable by name.
 */
function migrateFleetPersistedState(persistedState: unknown, version: number): FleetMigratedPersistedState {
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
  for (const rawAsset of Array.isArray(state.fleetAssets) ? state.fleetAssets : []) {
    // SW-015C — translate a pre-10 `status` value before validating.
    const raw = migrateLegacyLifecycleStatus(rawAsset)
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
    for (const [id, rawOverride] of Object.entries(state.seedAssetOverrides as Record<string, unknown>)) {
      // SW-015C — translate a pre-10 `status` value before validating.
      const raw = migrateLegacyLifecycleStatus(rawOverride)
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
}

/**
 * EWO-094 — extracted verbatim (unchanged logic) from `persist()`'s own
 * `merge` option below, for the exact same reason as
 * `migrateFleetPersistedState` above: Fleet Import's preview pipeline
 * calls this directly, in memory, to compute the would-be hydrated
 * `FleetState` a Replace would actually produce — without ever calling
 * `set()` or touching `localStorage`. See that option's own doc comment
 * for the full reconciliation history.
 */
function mergeFleetPersistedState(persistedState: unknown, currentState: FleetState): FleetState {
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

  // A seed FleetAsset's own `id` (e.g. "ghost-asset-seed") is NOT the
  // same as the ship id its materialized Ship/Build/Hardpoint rows
  // use (e.g. "ghost" — see resolveFleetAssetId's doc comment above).
  // `seedAssetOverrides` is keyed by the asset id, so it must be
  // resolved back to the ship id before it can be applied to `ships`.
  // Computed once, up front, so both the purge-exclusion filter below
  // and the existing per-field override loop can share it.
  const seedShipIdByAssetId = new Map(seedBaseline.fleetAssets.map((a) => [a.id, a.shipDefinitionId]))

  // EWO-097 — a purged seed-migrated asset is the one override that
  // does NOT stay "fully present" like every other field below. Every
  // other override (retired/nickname/ownership/priority/customImage)
  // is deliberately non-destructive (SW-015C removed the old "splice
  // the seed ship out" path entirely for exactly that reason — see the
  // comment this replaces). Purge is the one intentionally destructive
  // exception the Fleet Registry lifecycle now has: `purged: true`
  // means this seed ship's Ship/Build/Hardpoint/FleetAsset rows must
  // never be re-baked in on a future load, exactly as if it had never
  // shipped as part of the demo fleet. Filtered out here, before
  // anything else touches `fleetAssets`/`ships`/`builds`/`hardpoints`,
  // so a purged seed asset can never accidentally receive (or need) any
  // of the other override fields.
  const purgedSeedShipIds = new Set(
    Object.entries(seedAssetOverrides)
      .filter(([, o]) => o.purged)
      .map(([assetId]) => seedShipIdByAssetId.get(assetId))
      .filter((id): id is string => Boolean(id))
  )

  // Mission M-012: apply the persisted seed-fleet diff on top of the
  // fresh seed bake-in BEFORE replaying manual assets. The seed
  // ships/builds/hardpoints themselves always come from
  // src/data/seed.ts verbatim — only presence (removed) and a few
  // player-editable fields (nickname/ownership/priority) are
  // overridden here, mirroring what removeFleetAsset/
  // updateFleetAssetNickname/updateFleetAssetOwnership/
  // updateFleetProfile already do live.
  let ships = seedBaseline.ships.filter((s) => !purgedSeedShipIds.has(s.id))
  let builds = seedBaseline.builds.filter((b) => !purgedSeedShipIds.has(b.shipId))
  let hardpoints = seedBaseline.hardpoints.filter((h) => !purgedSeedShipIds.has(h.shipId))
  const fleetAssets = seedBaseline.fleetAssets
    .filter((a) => !seedAssetOverrides[a.id]?.purged)
    .map((a) => {
      const override = seedAssetOverrides[a.id]
      if (!override) return a
      return {
        ...a,
        // SW-015C — replaces the old `status: override.status ?? a.status`.
        // A retired seed ship's Ship/Build/Hardpoint rows are no
        // longer spliced out below (see the removed
        // `removedSeedShipIds` block this replaces) — they stay
        // fully present, mirrored with `lifecycleStatus`/`retiredAt`
        // in the override-application loop just below, exactly like
        // nickname/ownership/priority already are. (A `purged`
        // override is the one exception — filtered out above, before
        // this map runs at all.)
        lifecycleStatus: override.lifecycleStatus ?? a.lifecycleStatus,
        retiredAt: 'retiredAt' in override ? override.retiredAt : a.retiredAt,
        nickname: 'nickname' in override ? override.nickname : a.nickname,
        ownershipType: override.ownershipType ?? a.ownershipType,
        priority: override.priority ?? a.priority,
        // UX-005A — same key-presence check as nickname (not `??`):
        // an explicit `undefined` override (Restore Default) must win
        // over the seed baseline, which is always `undefined` too
        // (no seed ship ships with a hardcoded custom image) and so
        // couldn't otherwise be distinguished from "never overridden."
        customImageRef: 'customImageRef' in override ? override.customImageRef : a.customImageRef,
        updatedAt: override.updatedAt,
      }
    })

  for (const [assetId, override] of Object.entries(seedAssetOverrides)) {
    if (override.purged) continue // already excluded above — no per-field override to apply
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
      // SW-015C — mirrors the fleetAssets override above onto the
      // materialized Ship row every business-logic surface reads.
      if (override.lifecycleStatus) next.lifecycleStatus = override.lifecycleStatus
      if ('retiredAt' in override) next.retiredAt = override.retiredAt
      return next
    })
  }

  // Persisted Hangar/Reservations/InstalledLoadout replace the fresh
  // defaults outright when present — they're the full authoritative
  // player record, not something to merge item-by-item. SW-015C —
  // no longer filtered by a "removed seed ship" set: a retired
  // seed ship's InstalledLoadout rows stay attached to it (see
  // FleetAsset.lifecycleStatus's own doc comment on why nothing is
  // ever spliced for retirement).
  // EWO-084 (R-004) — each array below is reconciled ONLY in the
  // branch where it's genuinely persisted data, never the seed
  // baseline/currentState fallback: the seed baseline is rebuilt
  // fresh from src/data/seed.ts every load (not persisted state that
  // can drift), and reconciling it anyway was confirmed during this
  // mission's own test pass to cause a real regression —
  // `addHangarItem`'s merge precedence treats "exactly one side
  // carries entityClass" as "never the same record," so retroactively
  // giving a previously-entityClass-less seed item a fresh
  // entityClass changes how a same-session addition of that exact
  // item merges against it. See
  // src/store/persistedComponentIdentityReconciliation.ts for the
  // full contract.
  let installedLoadouts = persisted?.installedLoadouts
    ? reconcileArray(persisted.installedLoadouts, reconcileInstalledLoadoutEntryIdentity)
    : [...seedBaseline.installedLoadouts]
  const hangarItems = persisted?.hangarItems ? reconcileArray(persisted.hangarItems, reconcileHangarItemIdentity) : seedBaseline.hangarItems
  const reservations = persisted?.reservations ? reconcileArray(persisted.reservations, reconcileReservationIdentity) : currentState.reservations

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
    const { hardpoints: reconciled, quarantined, slotLabelMigrations } = reconcileBuildHardpoints(
      build.shipId,
      build.id,
      oldRowsForBuild,
      template,
      resolveShipEntityClass(build.shipId, fleetAssets)
    )
    reconciledCustomHardpoints.push(...reconciled)
    quarantinedAssignments.push(...quarantined)
    if (slotLabelMigrations.length > 0) {
      const list = slotLabelMigrationsByShipId.get(build.shipId) ?? []
      list.push(...slotLabelMigrations)
      slotLabelMigrationsByShipId.set(build.shipId, list)
    }
  }
  builds = [...builds.filter((b) => !customBuildIds.has(b.id)), ...customBuilds]
  // EWO-084 (R-004) — `reconciledCustomHardpoints` is genuinely
  // Commander-persisted data (sourced from `persisted.customBuildHardpoints`,
  // reconciled against the current port template above by
  // `reconcileBuildHardpoints`) — safe and correct to identity-reconcile
  // here, unlike the seed-baseline factory rows already in `hardpoints`
  // (see the installedLoadouts/hangarItems/reservations comment above
  // for why those stay separate).
  const identityReconciledCustomHardpoints = reconcileArray(reconciledCustomHardpoints, reconcileHardpointComponentIdentity)
  hardpoints = [...hardpoints.filter((h) => !customBuildIds.has(h.buildId)), ...identityReconciledCustomHardpoints]

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
  //
  // SW-005 Phase 2 — this overlay assumes `shipId::slotLabel` is a
  // stable cross-build port identity, which only holds when every
  // build for that ship shares one construction vocabulary (true for
  // a manually-added asset, whose every Build always derives from
  // the same canonical template). A seed ship's `installedLoadouts`
  // is derived from its own CUSTOM build's old, hand-authored
  // slotLabels (deriveInitialInstalledLoadouts); its Factory
  // Loadout's slotLabels are the real canonical vocabulary
  // (buildCanonicalSeedFactoryBuilds, above) — a different
  // namespace that only coincidentally shares a generic label like
  // "Radar" or "Quantum Drive" with the old one. Applying the
  // overlay there would silently contaminate a freshly-canonical,
  // always-factory-fresh row with an unrelated port's stale value —
  // exactly the class of bug this mission exists to eliminate.
  // Excluded here; a seed ship's Factory Loadout has no "Commander
  // installed something different" concept to protect in the first
  // place (see SEED_CANONICAL_FACTORY_BUILD_IDS's own comment).
  const installedByShipAndSlot = new Map(installedLoadouts.map((e) => [`${e.shipId}::${e.slotLabel}`, { installedItem: e.installedItem, entityClass: e.entityClass }]))
  hardpoints = hardpoints.map((h) => {
    if (h.isStructural || SEED_CANONICAL_FACTORY_BUILD_IDS.has(h.buildId)) return h
    const authoritative = installedByShipAndSlot.get(`${h.shipId}::${h.slotLabel}`)
    if (authoritative === undefined || authoritative.installedItem === h.installedItem) return h
    // EWO-STAB-003D (ADR-010) — the overlay's own entityClass (when
    // recorded) replaces the row's stale installedEntityClass, since
    // the installedItem itself is changing here; target/factory
    // identity are this row's own and unaffected by the overlay.
    const { status, invalidMessage } = computeHardpointStatusWithValidation(authoritative.installedItem, h.targetItem, h.factoryItem, h.type, h.size, {
      installedEntityClass: authoritative.entityClass,
      targetEntityClass: h.targetEntityClass,
      factoryEntityClass: h.factoryEntityClass,
    })
    return { ...h, installedItem: authoritative.installedItem, installedEntityClass: authoritative.entityClass, status, invalidMessage }
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

  // EWO-066 (Part G) — self-heals Fleet Priority into a clean,
  // unique 1..N sequence on every hydration, repairing duplicates
  // (the seed baseline's own MOLE/Vulture both `priority: 2` in
  // seed.ts included), gaps, and invalid values without a
  // persisted-schema version bump — see fleetPriority.ts's own doc
  // comment for why this runs here rather than as a one-time
  // migration.
  //
  // SW-015C — scoped to ACTIVE ships only. A retired ship's
  // priority is frozen administrative metadata ("for potential
  // future restoration," never a live rank — see
  // `retireFleetAsset`'s own doc comment) and must never be folded
  // into the active 1..N sequence just because it's still present
  // in `ships`.
  const normalizedActivePriorities = new Map(normalizeFleetPriorities(selectActiveShips(ships)).map((s) => [s.id, s.priority]))
  ships = ships.map((s) => (isActiveShip(s) ? { ...s, priority: normalizedActivePriorities.get(s.id) ?? s.priority } : s))

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
}

/**
 * EWO-094 — "Fleet Import Preview & Replace Workflow." One import
 * pipeline, per the work order's own architectural principle: envelope
 * validation (`parseFleetImportFile`, pure/store-agnostic) → schema
 * version compatibility (the one PERSIST_VERSION-aware check that must
 * live here) → `migrateFleetPersistedState` → `mergeFleetPersistedState`
 * — the EXACT SAME two functions `persist()`'s own `migrate`/`merge`
 * options call for a real browser reload — all in memory, `localStorage`
 * never touched. The returned Preview IS the already-validated,
 * already-hydrated state; there is no separate preview-only validator.
 */
export type FleetImportOutcome =
  | { ok: false; stage: 'ENVELOPE' | 'SCHEMA_VERSION'; message: string; migrationAttempted: false }
  | { ok: true; envelope: FleetExportEnvelope; mergedState: FleetState; summary: FleetImportSummary; warnings: string[]; wasMigrated: boolean }

export function buildFleetImportPreview(rawFileText: string, currentState: FleetState): FleetImportOutcome {
  const parsed = parseFleetImportFile(rawFileText)
  if (!parsed.valid) {
    return { ok: false, stage: 'ENVELOPE', message: parsed.error.message, migrationAttempted: false }
  }
  const { envelope } = parsed
  if (envelope.schemaVersion > PERSIST_VERSION) {
    return {
      ok: false,
      stage: 'SCHEMA_VERSION',
      message: `This file requires a newer version of SFM (file schema ${envelope.schemaVersion}; this build supports up to schema ${PERSIST_VERSION}). Update SFM before importing it.`,
      migrationAttempted: false,
    }
  }

  const migrated = migrateFleetPersistedState(envelope.payload, envelope.schemaVersion)
  const mergedState = mergeFleetPersistedState(migrated, currentState)

  const summary = buildFleetImportSummary(mergedState)
  const warnings = computeFleetImportWarnings(envelope.payload, {
    fleetAssets: migrated.fleetAssets.length,
    reservations: migrated.reservations.length,
    customBuilds: migrated.customBuilds.length,
    customBuildHardpoints: migrated.customBuildHardpoints.length,
    quarantinedAssignments: migrated.quarantinedAssignments.length,
    seedAssetOverrideKeys: Object.keys(migrated.seedAssetOverrides).length,
  })

  return { ok: true, envelope, mergedState, summary, warnings, wasMigrated: envelope.schemaVersion < PERSIST_VERSION }
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
        // EWO-066 (Part E) — a freshly-added ship defaults to
        // Unprioritized, never auto-appended to the end of the fleet
        // ranking; the Commander assigns a real priority explicitly
        // (Ship Priority panel) if and when they want one.
        const { asset, ship, build, hardpoints } = materializeFleetAsset({
          definition,
          template,
          ownershipType,
          nickname,
          priority: priority ?? null,
          acquisitionSource: 'MANUAL',
        })

        set({
          fleetAssets: [...get().fleetAssets, asset],
          ships: [...get().ships, ship],
          builds: [...get().builds, build],
          hardpoints: [...get().hardpoints, ...hardpoints],
          installedLoadouts: [...get().installedLoadouts, ...hardpoints.map((h) => ({ shipId: ship.id, slotLabel: h.slotLabel, installedItem: h.installedItem, entityClass: h.installedEntityClass }))],
        })

        get().addLogEntry({
          action: 'Ship added to fleet',
          shipName: ship.name,
          details: `Added ${ship.name} (${definition.displayName}) to fleet as ${ownershipType}`,
        })

        return { success: true, assetId: asset.id }
      },

      // SW-015C — replaces the old destructive `removeFleetAsset`
      // ("soft-delete" in name only — it spliced Build/Hardpoint/
      // InstalledLoadout data immediately and manual assets were then
      // excluded from `partialize` outright, so nothing beyond the bare
      // FleetAsset record actually survived even within the same
      // session). Retirement is a pure registry-state change: no Ship/
      // Build/Hardpoint/InstalledLoadout row is touched, no custom image
      // is deleted, no inventory is fabricated — only `lifecycleStatus`/
      // `retiredAt` change, the retiring ship's own priority rank is
      // vacated from the active sequence (its value is left on the
      // record, never nulled, so it's available "for potential future
      // restoration" per the work order), and its ACTIVE reservations are
      // released back to unreserved inventory (Deliverable 6) since a
      // retired vessel can't hold operational reservations.
      retireFleetAsset: (assetId) => {
        const resolvedAssetId = resolveFleetAssetId(assetId, get().fleetAssets)
        const asset = resolvedAssetId ? get().fleetAssets.find((a) => a.id === resolvedAssetId) : undefined
        const ship = get().ships.find((s) => s.id === assetId)
        if (!asset || !ship) return { success: false, message: 'Fleet asset not found.' }
        if (asset.lifecycleStatus === 'retired') return { success: false, message: 'This vessel is already retired.' }

        const now = new Date().toISOString()

        // Close the gap the retiring ship leaves in the ACTIVE priority
        // sequence for every OTHER active ship — its own entry is
        // deliberately not in this map, so its own `priority` field is
        // left completely untouched below (see doc comment above).
        const priorityByShipId = new Map(
          closePriorityGapOnRemoval(selectActiveShips(get().ships), assetId).map((entry) => [entry.id, entry.priority])
        )

        const releasedReservationIds = new Set(activeReservationsForShip(assetId, get().builds, get().reservations).map((r) => r.id))

        set({
          fleetAssets: get().fleetAssets.map((a) => (a.id === resolvedAssetId ? { ...a, lifecycleStatus: 'retired' as const, retiredAt: now, updatedAt: now } : a)),
          ships: get().ships.map((s) => {
            if (s.id === assetId) return { ...s, lifecycleStatus: 'retired' as const, retiredAt: now }
            return priorityByShipId.has(s.id) ? { ...s, priority: priorityByShipId.get(s.id)! } : s
          }),
          reservations: get().reservations.map((r) => (releasedReservationIds.has(r.id) ? { ...r, status: 'RELEASED' as const, updatedAt: now } : r)),
        })

        if (asset.acquisitionSource === 'SEED_MIGRATION') {
          set({
            seedAssetOverrides: {
              ...get().seedAssetOverrides,
              [resolvedAssetId!]: { ...get().seedAssetOverrides[resolvedAssetId!], lifecycleStatus: 'retired', retiredAt: now, updatedAt: now },
            },
          })
        }

        get().addLogEntry({ action: 'Vessel retired', shipName: ship.name, details: `"${ship.name}" retired from active service.` })
        return { success: true, releasedReservationCount: releasedReservationIds.size }
      },

      // SW-015C (Deliverable 8) — the only other lifecycle transition.
      // Restores the exact same vessel record (never a duplicate):
      // nothing was ever deleted, so there is nothing to rebuild. Priority
      // deliberately resets to Unprioritized (`null`) rather than
      // reinstating its pre-retirement rank — the active 1..N sequence
      // may have shifted during its absence, and silently reinserting it
      // at a stale position could collide with or bump a ship the
      // Commander ranked while this vessel was retired; the Commander can
      // re-rank it explicitly. Released reservations are never recreated
      // (explicit work-order requirement) — only a fresh reservation
      // against real current stock can re-commit inventory.
      recommissionFleetAsset: (assetId) => {
        const resolvedAssetId = resolveFleetAssetId(assetId, get().fleetAssets)
        const asset = resolvedAssetId ? get().fleetAssets.find((a) => a.id === resolvedAssetId) : undefined
        const ship = get().ships.find((s) => s.id === assetId)
        if (!asset || !ship) return { success: false, message: 'Fleet asset not found.' }
        if (asset.lifecycleStatus !== 'retired') return { success: false, message: 'This vessel is already in active service.' }

        const now = new Date().toISOString()
        set({
          fleetAssets: get().fleetAssets.map((a) => (a.id === resolvedAssetId ? { ...a, lifecycleStatus: 'active' as const, retiredAt: undefined, priority: null, updatedAt: now } : a)),
          ships: get().ships.map((s) => (s.id === assetId ? { ...s, lifecycleStatus: 'active' as const, retiredAt: undefined, priority: null } : s)),
        })

        if (asset.acquisitionSource === 'SEED_MIGRATION') {
          set({
            seedAssetOverrides: {
              ...get().seedAssetOverrides,
              [resolvedAssetId!]: { ...get().seedAssetOverrides[resolvedAssetId!], lifecycleStatus: 'active', retiredAt: undefined, priority: null, updatedAt: now },
            },
          })
        }

        get().addLogEntry({ action: 'Vessel recommissioned', shipName: ship.name, details: `"${ship.name}" returned to active service.` })
        return { success: true }
      },

      // EWO-097 — see the interface's own doc comment for the full
      // contract. Sequencing matters: every genuinely installed
      // component is returned to Hangar Inventory (Step 2) WHILE the
      // hull's own Ship/Build/Hardpoint rows still exist, since
      // `removeComponent` (the canonical installation engine) needs them
      // to resolve the slot it's returning. Only after that is the hull
      // itself deleted (Step 4) — never the other order.
      purgeFleetAsset: (assetId, confirmationInput) => {
        const resolvedAssetId = resolveFleetAssetId(assetId, get().fleetAssets)
        const asset = resolvedAssetId ? get().fleetAssets.find((a) => a.id === resolvedAssetId) : undefined
        const ship = get().ships.find((s) => s.id === assetId)
        if (!asset || !ship) return { success: false, message: 'Fleet asset not found.' }
        if (asset.lifecycleStatus !== 'retired') return { success: false, message: 'Only a retired vessel can be purged. Retire it first.' }

        // EWO-097 Amendment — validated here independently of whatever
        // the UI's own button-enablement check already did (Requirement
        // 7), using the exact same canonical phrase/comparison helpers.
        const expectedPhrase = resolvePurgeConfirmationPhrase(asset)
        if (!matchesPurgeConfirmationPhrase(confirmationInput ?? '', expectedPhrase)) {
          return { success: false, message: 'Confirmation text does not match. Purge was not performed.' }
        }

        const shipId = ship.id
        const shipName = ship.name

        // Step 2 (EWO-093) — captured before any mutation below. Held in
        // memory only by the caller; no download, no in-app restore UI.
        const recoverySnapshot = buildFleetExportSnapshot(get())

        // Step 3/Installed Component Policy — `installedLoadouts` is the
        // single per-ship-per-slot physical truth (unlike `hardpoints`,
        // which has one row per Build sharing that same slot) — iterating
        // it, rather than hardpoints, returns each physically-occupied
        // slot exactly once regardless of how many Builds this hull has.
        // A composite/child-vehicle sub-slot (Hardpoint.parentSlotLabel)
        // is just another row in this same flat list — no cascade logic
        // is needed, it's returned independently like any other slot.
        // `removeComponent` itself already refuses a slot with nothing
        // physically installed (factory-only/target-only/missing never
        // reach here), and delegates the actual inventory write to the
        // existing `addHangarItem` merge/dedup rules — never a parallel
        // inventory mutation.
        const occupiedSlots = get().installedLoadouts.filter((e) => e.shipId === shipId && e.installedItem && e.installedItem !== '—')
        let returnedComponentCount = 0
        for (const entry of occupiedSlots) {
          const result = get().removeComponent(shipId, entry.slotLabel, true)
          if (result.matched) returnedComponentCount += 1
        }

        // Reservations tied exclusively to this hull or one of its own
        // Builds (never any other hull's — see activeReservationsForShip's
        // own doc comment: `fleetAssetId` holds a Ship.id, not a
        // FleetAsset.id). Every status is removed here, not just ACTIVE —
        // purge is permanent, so a RELEASED/FULFILLED row that still
        // names this hull would itself be the exact orphaned reference
        // Required Behavior 8 forbids, not a preserved historical record.
        const purgedBuildIds = new Set(get().builds.filter((b) => b.shipId === shipId).map((b) => b.id))

        const now = new Date().toISOString()
        set({
          fleetAssets: get().fleetAssets.filter((a) => a.id !== resolvedAssetId),
          ships: get().ships.filter((s) => s.id !== shipId),
          builds: get().builds.filter((b) => b.shipId !== shipId),
          hardpoints: get().hardpoints.filter((h) => h.shipId !== shipId),
          installedLoadouts: get().installedLoadouts.filter((e) => e.shipId !== shipId),
          reservations: get().reservations.filter((r) => r.fleetAssetId !== shipId && !purgedBuildIds.has(r.missionConfigurationId)),
          // EWO-097 (Quarantine and Historical Data) — treated as
          // ship-owned planning data, not immutable historical evidence:
          // a QuarantinedAssignment exists solely so the Commander can
          // one day resolve a port that disappeared out from under a
          // still-existing hull (its own doc comment: "no UI/workflow for
          // that resolution exists yet"). Once the hull itself is gone,
          // that resolution is permanently impossible — keeping the row
          // would only be a guaranteed-orphaned shipId/buildId reference,
          // not evidence of anything. Captain's Log is the system's real
          // immutable history and is deliberately untouched (its entries
          // carry only a free-text `shipName` snapshot, never a live id).
          quarantinedAssignments: get().quarantinedAssignments.filter((q) => q.shipId !== shipId),
        })

        if (asset.acquisitionSource === 'SEED_MIGRATION') {
          // EWO-097 — see mergeFleetPersistedState's own comment on
          // `purgedSeedShipIds` for why this is the one override field
          // that replaces the whole record rather than merging into it:
          // every other override describes a live, still-present seed
          // ship; a purged one no longer exists to have any other field
          // meaningfully apply to.
          set({ seedAssetOverrides: { ...get().seedAssetOverrides, [resolvedAssetId!]: { purged: true, updatedAt: now } } })
        }

        get().addLogEntry({
          action: 'Vessel purged',
          shipName,
          details:
            returnedComponentCount > 0
              ? `"${shipName}" was permanently removed from the Fleet Registry. ${returnedComponentCount} installed component${returnedComponentCount === 1 ? '' : 's'} returned to Hangar Inventory.`
              : `"${shipName}" was permanently removed from the Fleet Registry.`,
        })

        return { success: true, returnedComponentCount, recoverySnapshot }
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

      // UX-005A (Deliverable 1/4/5) — identical shape to
      // updateFleetAssetOwnership above: resolve by id, mutate the
      // FleetAsset record, and for a seed-migrated ship also stamp the
      // persisted override diff. No `ships` array mutation — unlike
      // ownership/nickname, the resolved image is never materialized onto
      // `Ship` (it's async/session-scoped, see shipImageCache.ts), so
      // every consumer reads `customImageRef` from `fleetAssets` directly
      // via the shared resolver hook instead.
      updateFleetAssetCustomImage: (assetId, customImageRef) => {
        const resolvedAssetId = resolveFleetAssetId(assetId, get().fleetAssets)
        const asset = resolvedAssetId ? get().fleetAssets.find((a) => a.id === resolvedAssetId) : undefined
        const ship = get().ships.find((s) => s.id === assetId)
        if (!asset || !ship) return { success: false, message: 'Fleet asset not found.' }

        const now = new Date().toISOString()
        set({
          fleetAssets: get().fleetAssets.map((a) => (a.id === resolvedAssetId ? { ...a, customImageRef, updatedAt: now } : a)),
        })

        if (asset.acquisitionSource === 'SEED_MIGRATION') {
          set({
            seedAssetOverrides: {
              ...get().seedAssetOverrides,
              [resolvedAssetId!]: { ...get().seedAssetOverrides[resolvedAssetId!], customImageRef, updatedAt: now },
            },
          })
        }

        get().addLogEntry({
          action: customImageRef ? 'Custom ship image set' : 'Custom ship image removed',
          shipName: ship.name,
          details: customImageRef ? `${ship.name} now uses a custom image` : `${ship.name} reverted to the default image`,
        })
        return { success: true }
      },

      updateFleetProfile: (assetId, updates) => {
        const ship = get().ships.find((s) => s.id === assetId)
        const resolvedAssetId = resolveFleetAssetId(assetId, get().fleetAssets)
        const asset = resolvedAssetId ? get().fleetAssets.find((a) => a.id === resolvedAssetId) : undefined
        if (!ship || !asset) return { success: false, message: 'Fleet asset not found.' }

        set({
          ships: get().ships.map((s) =>
            s.id === assetId ? { ...s, primaryRole: updates.primaryRole ?? s.primaryRole, secondaryRole: updates.secondaryRole ?? s.secondaryRole } : s
          ),
        })

        get().addLogEntry({ action: 'Fleet Profile updated', shipName: ship.name, details: `Updated Fleet Profile for ${ship.name}` })
        return { success: true }
      },

      // EWO-066 (Part E) — the sole entry point for changing Fleet
      // Priority. `reorderFleetPriority` (src/utils/fleetPriority.ts)
      // returns every ship whose rank actually changed as a side effect
      // of this one re-rank — often more than just `shipId` itself — so
      // this applies the same dual/triple-write persistence pattern
      // (ships + fleetAssets + seedAssetOverrides for a seed-migrated
      // asset) that updateFleetAssetNickname/Ownership already use,
      // across every affected ship, not only the one the Commander
      // directly edited.
      setFleetPriority: (shipId, priority) => {
        const ship = get().ships.find((s) => s.id === shipId)
        if (!ship) return { success: false, message: 'Fleet asset not found.' }
        if (priority !== null && (!Number.isInteger(priority) || priority < 1)) {
          return { success: false, message: 'Priority must be a positive whole number, or Unprioritized.' }
        }
        // EWO-066A (Part D) — re-selecting the same position is a no-op:
        // nothing to reorder, nothing worth a Captain's Log entry.
        if (priority === ship.priority) return { success: true }

        const previousPriority = ship.priority
        const updates = reorderFleetPriority(get().ships, shipId, priority)
        // A raw request can still clamp back to no real change (e.g.
        // requesting a rank far beyond the fleet size when this ship is
        // already last) — `reorderFleetPriority` already filters those
        // out, so an empty result means genuinely nothing to do.
        if (updates.length === 0) return { success: true }
        const priorityByShipId = new Map(updates.map((u) => [u.id, u.priority]))
        // The target's own actual resulting rank, post-clamp — never the
        // raw `priority` argument, which the Captain's Log must never
        // show if it didn't actually take effect.
        const resultingPriority = priorityByShipId.get(shipId) ?? previousPriority
        const now = new Date().toISOString()
        const fleetAssets = get().fleetAssets

        const assetIdByShipId = new Map<string, string>()
        for (const shipIdKey of priorityByShipId.keys()) {
          const resolved = resolveFleetAssetId(shipIdKey, fleetAssets)
          if (resolved) assetIdByShipId.set(shipIdKey, resolved)
        }
        const shipIdByAssetId = new Map<string, string>()
        for (const [sid, aid] of assetIdByShipId) shipIdByAssetId.set(aid, sid)

        const nextSeedOverrides = { ...get().seedAssetOverrides }
        for (const [aid, sid] of shipIdByAssetId) {
          const asset = fleetAssets.find((a) => a.id === aid)
          if (asset?.acquisitionSource === 'SEED_MIGRATION') {
            nextSeedOverrides[aid] = { ...nextSeedOverrides[aid], priority: priorityByShipId.get(sid)!, updatedAt: now }
          }
        }

        set({
          ships: get().ships.map((s) => (priorityByShipId.has(s.id) ? { ...s, priority: priorityByShipId.get(s.id)! } : s)),
          fleetAssets: fleetAssets.map((a) => {
            const sid = shipIdByAssetId.get(a.id)
            return sid ? { ...a, priority: priorityByShipId.get(sid)!, updatedAt: now } : a
          }),
          seedAssetOverrides: nextSeedOverrides,
        })

        // EWO-066A (Part E) — the log records the actual reorder (a
        // From → To transition), not just the new value, since a single
        // Commander choice can shift the whole fleet, not just this ship.
        const label = (p: number | null) => (p === null ? 'Unprioritized' : `Priority ${p}`)
        get().addLogEntry({
          action: 'Fleet Priority Updated',
          shipName: ship.name,
          details: `${ship.name}: ${label(previousPriority)} → ${label(resultingPriority)}`,
        })
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

    // EWO-STAB-003C (ADR-010) — canonical identity, resolved through
    // ComponentIdentityService (never reimplemented here). Prefers the
    // target row's own stored targetEntityClass (the most authoritative
    // source for this exact slot's requirement) and falls back to a
    // fresh resolution from componentName for a legacy row that predates
    // this mission. Absent (never a guess) for an uncataloged component.
    // Resolved here, before the availability check (EWO-STAB-003D), so
    // the same identity feeds both the availability lookup and the
    // reservation record itself rather than being derived twice.
    const componentEntityClass = targetRow.targetEntityClass ?? resolveComponentIdentity({ displayName: componentName })?.entityClass ?? undefined

    // Never allow reserving more than is actually free — one physical
    // unit can never satisfy two commitments (Part 4, rules 3-4).
    const availability = calculateComponentAvailability(componentName, get().hangarItems, get().installedLoadouts, get().reservations, componentEntityClass)
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
      componentEntityClass,
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

    // SW-005 Phase 1 (Commander Safety) — the Loadout Manager UI renders
    // its editable row set from the ship's canonical Factory template
    // (shipFactoryTemplates), not from `referenceRows` above. Whenever a
    // FleetAsset's own persisted rows haven't yet converged onto that same
    // template (a topology change since this build was last saved), an
    // override keyed by a canonical slotLabel `referenceRows` doesn't have
    // must never be silently dropped — see SW-004's confirmed no-op-save
    // finding. `canonicalTemplateBySlot` is the deterministic authority
    // used below to either self-heal (materialize the real port fresh) or
    // fail loudly (a slotLabel that isn't real anywhere).
    const definitionId = resolveShipDefinitionId(shipId, get().fleetAssets)
    const canonicalTemplateBySlot = new Map<string, FactoryHardpointTemplate>(
      (definitionId ? (shipFactoryTemplates[definitionId] ?? []) : []).map((t) => [t.slotLabel, t])
    )

    const installedBySlot = new Map(get().installedLoadouts.filter((e) => e.shipId === shipId).map((e) => [e.slotLabel, e.installedItem]))
    const installedEntityClassBySlot = new Map(get().installedLoadouts.filter((e) => e.shipId === shipId).map((e) => [e.slotLabel, e.entityClass]))

    // SW-013C.2D (Objective 3) — resolved once per save, not per row: a
    // rack (or any other) port's own certified swap-group members are
    // authoritatively valid targets even when their translated category
    // doesn't match the port's own type (e.g. the Eclipse's confirmed Bomb
    // Rack alternates, DataCore category BombLauncher, on a port whose
    // type is "Missile Rack") — see `CompatibilityIdentityHint.knownCompatibleEntityClasses`'s
    // own doc comment. `undefined` for a port with no confirmed group,
    // which defers entirely to the pre-existing generic sweep.
    const shipEntityClassForSwapGroups = resolveShipEntityClass(shipId, get().fleetAssets)
    const swapGroupEligibleFor = (row: { sourceParentItemPortName?: string; sourceItemPortName?: string }) =>
      swapGroupEligibleEntityClassesFor(shipEntityClassForSwapGroups, row.sourceParentItemPortName, row.sourceItemPortName)

    const baseTargets = new Map<string, string>()
    // EWO-STAB-003D (ADR-010) — the target's canonical identity, tracked
    // alongside baseTargets through every one of the same sources below
    // (starting state, Quartermaster Template, targetOverrides). Additive:
    // undefined wherever the source itself has none to offer (a legacy
    // name-only row, or a name that doesn't resolve in the catalog) —
    // never a guess, and the resulting Hardpoint row's targetItem string
    // is completely unaffected either way.
    const baseTargetEntityClasses = new Map<string, string | undefined>()
    // EWO-043 (Task 8) — tracks whether the Commander ever deliberately
    // chose this slot's target, independent of what value it resolves to.
    // FOLLOW_FACTORY rows are the ones a future authoritative Factory
    // change should keep tracking automatically (src/utils/
    // fleetAssetReconciliation.ts); every other source is a genuine
    // Commander decision and must never be silently replaced.
    const baseTargetModes = new Map<string, 'FOLLOW_FACTORY' | 'EXPLICIT_TARGET'>()
    // SW-013C.2C (Objective 6) — the component-owned-child carry-over
    // logic below needs each PARENT slot's own real, previously-effective
    // spec (what turret/rack was targeted there before THIS save) to
    // decide whether a swap between two independent-equipment parents can
    // preserve sibling targets. `referenceRows` (used throughout this
    // function as a generic structural template) is NOT reliably this
    // exact build's own data — it's keyed to the SHIP's active build,
    // which may be a different build entirely. Populated only in the
    // `EXISTING` branch below, from `existingBuildId`'s own real rows —
    // the one array that IS guaranteed to be this exact build's own
    // pre-save state.
    const priorEffectiveSpecBySlotLabel = new Map<string, ComponentOwnedSlotSpec | null>()
    // SW-013C.2C — this exact build's own real, pre-save component-owned
    // child rows, keyed by PARENT slotLabel then child position number.
    // Same "existingBuildId is the only reliable source" reasoning as
    // `priorEffectiveSpecBySlotLabel` above.
    const priorChildTargetsByParentSlotLabel = new Map<string, Map<number, { targetItem: string; targetEntityClass: string | undefined }>>()
    if (startingState === 'FACTORY') {
      for (const row of referenceRows) {
        baseTargets.set(row.slotLabel, row.factoryItem)
        baseTargetEntityClasses.set(row.slotLabel, row.factoryEntityClass)
        baseTargetModes.set(row.slotLabel, 'FOLLOW_FACTORY')
      }
    } else if (startingState === 'INSTALLED') {
      for (const row of referenceRows) {
        const installed = installedBySlot.get(row.slotLabel)
        baseTargets.set(row.slotLabel, installed ?? row.factoryItem)
        baseTargetEntityClasses.set(row.slotLabel, installed !== undefined ? installedEntityClassBySlot.get(row.slotLabel) : row.factoryEntityClass)
        baseTargetModes.set(row.slotLabel, 'EXPLICIT_TARGET')
      }
    } else if (startingState === 'EMPTY') {
      for (const row of referenceRows) {
        baseTargets.set(row.slotLabel, '—')
        baseTargetEntityClasses.set(row.slotLabel, undefined)
        baseTargetModes.set(row.slotLabel, 'EXPLICIT_TARGET')
      }
    } else {
      const existingRows = get().hardpoints.filter((h) => h.shipId === shipId && h.buildId === existingBuildId)
      if (existingRows.length === 0) return { success: false, message: 'Existing Loadout not found for this Fleet Asset.' }
      for (const row of existingRows) {
        baseTargets.set(row.slotLabel, row.targetItem)
        baseTargetEntityClasses.set(row.slotLabel, row.targetEntityClass)
        // A pre-EWO-043 persisted row has no targetMode at all — treated
        // as EXPLICIT_TARGET, the safe default (never silently start
        // auto-following Factory for a row the Commander never tagged).
        baseTargetModes.set(row.slotLabel, row.targetMode ?? 'EXPLICIT_TARGET')
        priorEffectiveSpecBySlotLabel.set(row.slotLabel, componentOwnedChildSlotSpec(row.targetEntityClass ?? row.factoryEntityClass))
        if (row.parentSlotLabel) {
          const match = /Slot (\d+)$/.exec(row.slotLabel)
          if (match) {
            if (!priorChildTargetsByParentSlotLabel.has(row.parentSlotLabel)) priorChildTargetsByParentSlotLabel.set(row.parentSlotLabel, new Map())
            priorChildTargetsByParentSlotLabel.get(row.parentSlotLabel)!.set(Number(match[1]), { targetItem: row.targetItem, targetEntityClass: row.targetEntityClass })
          }
        }
      }
    }

    // A Quartermaster Template applies its intent on top of the starting
    // state, matched by slotLabel — it never invents a slot this ship
    // doesn't actually have. EWO-STAB-003D: a template assignment is a raw
    // typed/selected display name (QuartermasterTemplate carries no
    // entityClass of its own), so its identity is resolved fresh through
    // the one canonical ComponentIdentityService, never fabricated.
    if (quartermasterTemplateId) {
      const template = get().quartermasterTemplates.find((t) => t.id === quartermasterTemplateId)
      if (template) {
        for (const assignment of template.targetAssignments) {
          if (baseTargets.has(assignment.slotLabel)) {
            baseTargets.set(assignment.slotLabel, assignment.targetItem)
            baseTargetEntityClasses.set(assignment.slotLabel, resolveComponentIdentity({ displayName: assignment.targetItem })?.entityClass ?? undefined)
            baseTargetModes.set(assignment.slotLabel, 'EXPLICIT_TARGET')
          }
        }
      }
    }

    // Explicit per-slot edits from the Composer UI always win last.
    // EWO-STAB-004B (ADR-010) — an override may now carry the Commander's
    // actually-selected entityClass (TargetOverrideValue), not just
    // display-name text. That supplied identity is preferred — verified
    // through the same ComponentIdentityService exact-lookup every other
    // entityClass reference uses, never trusted blindly — over re-deriving
    // it from a name that can be genuinely ambiguous (`M2C "Swarm"`, the
    // exact case CAT-003/EWO-STAB-004A certified). A legacy bare-string
    // override (or one with no entityClass — an uncataloged/free-text
    // selection) falls back to name resolution exactly as before
    // EWO-STAB-004B. A cleared target ('—') never carries an entityClass
    // regardless of what was supplied — defensive, not reachable through
    // the current UI, but never trusted either way.
    // SW-005 Phase 1 — every slotLabel synthesized below because a
    // reference-row-less canonical port needed a home for the Commander's
    // override; used after the loop to materialize a real Hardpoint row
    // for each (never left as target-only bookkeeping with no row).
    const synthesizedFromCanonical = new Map<string, FactoryHardpointTemplate>()
    const unrecognizedOverrideSlots: string[] = []
    for (const [slotLabel, override] of Object.entries(targetOverrides)) {
      if (!baseTargets.has(slotLabel)) {
        // Deterministic reconciliation, never a silent drop (SW-005 Phase
        // 1): if this slotLabel is a real port on the ship's own current
        // canonical Factory template, materialize it fresh — factory-
        // anchored, exactly like a genuinely new port reconcileBuildHardpoints
        // already appends elsewhere — so the override below has somewhere
        // to land. If it isn't real anywhere, this is a genuine anomaly,
        // not a legitimate structural drift; collected below and the whole
        // save fails loudly rather than silently discarding Commander intent.
        const templateRow = canonicalTemplateBySlot.get(slotLabel)
        if (!templateRow) {
          // Not resolvable here, but not yet a confirmed failure either —
          // a component-owned child slot (a mining module/missile slot)
          // never appears in the static canonical template at all; it's
          // legitimately resolved a few steps below by the dedicated
          // materializedChildStubs mechanism instead. Deferred to a final
          // check after that mechanism runs (see below), so the two
          // resolution paths never race each other.
          unrecognizedOverrideSlots.push(slotLabel)
          continue
        }
        baseTargets.set(slotLabel, templateRow.factoryItem)
        baseTargetEntityClasses.set(slotLabel, undefined)
        baseTargetModes.set(slotLabel, 'FOLLOW_FACTORY')
        synthesizedFromCanonical.set(slotLabel, templateRow)
      }
      const targetItem = typeof override === 'string' ? override : override.targetItem
      const suppliedEntityClass = typeof override === 'string' ? undefined : override.targetEntityClass

      let resolvedEntityClass: string | undefined
      if (targetItem === '—') {
        resolvedEntityClass = undefined
      } else if (suppliedEntityClass) {
        // Verified exactly, never blindly trusted — an unresolvable
        // supplied entityClass is dropped, not re-resolved by name (that
        // would be exactly the "silently substitute a same-name
        // component" CAT-003 found causing the Polaris PDC bug).
        resolvedEntityClass = resolveComponentIdentity({ entityClass: suppliedEntityClass })?.entityClass ?? undefined
      } else {
        resolvedEntityClass = resolveComponentIdentity({ displayName: targetItem })?.entityClass ?? undefined
      }

      baseTargets.set(slotLabel, targetItem)
      baseTargetEntityClasses.set(slotLabel, resolvedEntityClass)
      baseTargetModes.set(slotLabel, 'EXPLICIT_TARGET')
    }

    // FTB-001B/FTB-001E — a component-owned port's real child slots
    // (missile rack missiles, mining module slots — see
    // componentOwnedSlots.ts) may already exist as real, saved rows baked
    // in at ship-generation time for whichever component was originally
    // factory-installed (true for missile racks; mining heads never have
    // real ship-baked children at all, per FTB-001A). Mirrors
    // `withComponentOwnedChildSlots`'s own three-way branch exactly, so
    // save-time persistence and display-time synthesis never disagree:
    //   - real existing children + unswapped -> leave completely alone
    //     (an untouched missile rack keeps its real ship-baked rows).
    //   - real existing children + swapped -> mark stale (they describe a
    //     component that's no longer there) and materialize the newly-
    //     targeted component's own real children fresh.
    //   - NO existing children at all (always true for a mining head,
    //     swapped or not) -> materialize fresh whenever a real spec is
    //     known, REGARDLESS of swap status — there is nothing to "leave
    //     alone" for a family that never has real ship-baked children to
    //     begin with, so an unswapped mining laser's module slots still
    //     need real rows for a Commander's assignment to persist into.
    // Every materialized slotLabel is keyed by the exact same "<port> —
    // <Label> Slot N" scheme the live preview already uses, so a
    // Commander's target choice for one of ITS slots has somewhere to
    // land. Generic over every component-owned family
    // `componentOwnedChildSlotSpec` recognizes — never gated to one
    // label, so a future family gets this for free. Gated first on
    // `oldSpec || newSpec` so an ordinary (non-component-owned) port's
    // real children (e.g. a gimbal mount's own "— Weapon" child) are never
    // touched, swapped or not.
    // SW-013C.2G — `!row.factoryEntityClass` used to also skip this row
    // entirely, which was safe only because every pre-existing component-
    // owned family (missile racks, mining heads, ball turrets) always
    // ships with SOME real factory identity, even on a ship that later
    // swaps it. A materialized dormant hardpoint (see
    // src/generated/dormantHardpoints.ts) is the first case that breaks
    // that assumption BY DESIGN — Objective 6's own explicit "must not
    // make dormant ports appear occupied by default" means
    // `factoryEntityClass` is genuinely, permanently undefined for it,
    // yet it must still become component-owned the moment a Commander
    // targets a real turret onto it. Dropped the factoryEntityClass
    // requirement entirely — `oldSpec`/`newSpec` below already derive
    // independently from `row.factoryEntityClass`/`currentEntityClass`
    // and correctly resolve to `null` for either when there's nothing to
    // derive from, so an ordinary, never-component-owned port is
    // unaffected either way (confirmed by the full regression suite).
    const staleChildSlotLabels = new Set<string>()
    const materializedChildStubs: { slotLabel: string; type: string; size: string; parentSlotLabel: string }[] = []
    for (const row of referenceRows) {
      if (row.isStructural) continue
      const finalTargetEntityClass = baseTargetEntityClasses.get(row.slotLabel)
      const currentEntityClass = finalTargetEntityClass ?? row.factoryEntityClass
      const oldSpec = componentOwnedChildSlotSpec(row.factoryEntityClass)
      const newSpec = componentOwnedChildSlotSpec(currentEntityClass)
      // SW-013C.2C — `oldSpec` above is keyed to the ship's permanent
      // FACTORY identity (correct for the pre-existing `swapped` check,
      // unchanged). Carry-over eligibility (below) needs a different
      // question: what spec was in effect the LAST time THIS EXACT BUILD
      // saved this row — read from `priorEffectiveSpecBySlotLabel`
      // (sourced from `existingBuildId`'s own real rows, hoisted above),
      // never from `referenceRows` (a generic structural template that
      // may belong to a completely different build sharing the same
      // slotLabel).
      const previousEffectiveSpec = priorEffectiveSpecBySlotLabel.get(row.slotLabel) ?? null
      // SW-013C.2G — a materialized dormant hardpoint (see
      // src/generated/dormantHardpoints.ts) has NO factory identity by
      // design (`row.factoryEntityClass` permanently undefined), so
      // `swapped`'s original definition — comparing the new target
      // against the ship's own permanent FACTORY baseline — can never
      // fire true for it: reverting its Commander-chosen turret back to
      // Intentional Empty produces `finalTargetEntityClass: undefined`,
      // and `Boolean(undefined && ...)` is always false regardless of
      // what the row USED to be targeted at. Confirmed live: the Ghost's
      // own 2 weapon children survived a revert-to-empty + save
      // untouched, because this row fell straight through the "leave
      // completely alone" branch below. `droppedToEmpty` catches
      // specifically the case the original definition couldn't: real
      // component-owned children existed as of the LAST save
      // (`previousEffectiveSpec`), but nothing is component-owned here
      // anymore (`!newSpec`) — a genuine topology change the Commander
      // made, regardless of what the ship's own permanent factory default
      // is or was. This is not dormant-port-specific — the identical gap
      // existed for any REAL component-owned port too (e.g. the Center
      // Ball Turret) once swapped away from its factory default and later
      // reverted to Intentional Empty; simply never exercised by an
      // existing test, since every pre-existing component-owned family
      // always has a real, non-empty factory identity as its OWN
      // fallback baseline to revert to instead of empty.
      const droppedToEmpty = previousEffectiveSpec !== null && !newSpec
      const swapped = Boolean((finalTargetEntityClass && finalTargetEntityClass !== row.factoryEntityClass) || droppedToEmpty)
      if (!oldSpec && !newSpec && !previousEffectiveSpec) continue // an ordinary component (e.g. a gimbal-mounted weapon) — nothing component-owned about this port, now or previously — never touch its real children
      const childPrefix = `${row.slotLabel} — `
      const existingChildren = referenceRows.filter((candidate) => candidate.slotLabel.startsWith(childPrefix))
      if (existingChildren.length > 0 && !swapped) continue // real, untouched children (an unswapped rack) — leave completely alone

      // SW-013C.2C (Objective 6, Independent-Equipment Parent Replacement)
      // — this exact build's own real, pre-save child targets (from
      // `priorChildTargetsByParentSlotLabel`, same "existingBuildId is the
      // only reliable source" reasoning), used only when BOTH the old and
      // new parent are Mode B (`independent-equipment`) — e.g. swapping
      // between two turret variants. Mode A (payload-array — missile
      // racks, mining heads) is deliberately excluded from this map and
      // keeps its existing, unchanged "always restart empty" behavior —
      // "existing missile-rack semantics remain the primary precedent"
      // (the amendment's own words); this is additive, never a behavior
      // change for Mode A.
      const priorIndependentEquipmentTargetByPosition =
        previousEffectiveSpec?.mode === 'independent-equipment' ? (priorChildTargetsByParentSlotLabel.get(row.slotLabel) ?? new Map()) : new Map()

      if (existingChildren.length > 0 && swapped) {
        for (const candidate of existingChildren) staleChildSlotLabels.add(candidate.slotLabel)
      }
      if (!newSpec) continue // swapped away to an uncataloged component — old real children removed, nothing fabricated: an honest "unknown structure" state
      // SW-013C.2C/SW-013C.2D — `label` IS the type string for every
      // family except mining modules (see canonicalHardpointPreparation.ts's
      // identical fix for why).
      const childType = newSpec.label === 'Module' ? 'Mining Module' : newSpec.label
      const carryOverEligible = newSpec.mode === 'independent-equipment' && previousEffectiveSpec?.mode === 'independent-equipment'
      for (let n = 1; n <= newSpec.count; n++) {
        const slotLabel = `${childPrefix}${newSpec.label} Slot ${n}`
        materializedChildStubs.push({ slotLabel, type: childType, size: newSpec.size ? `S${newSpec.size}` : row.size, parentSlotLabel: row.slotLabel })

        // SW-013C.2C — Mode B (independent-equipment) on a genuine parent
        // swap always explicitly decides this slot's value, even when
        // `baseTargets` already holds an entry for the same slotLabel:
        // position-based labels ("Weapon Slot 1") are NOT globally unique
        // identity — two different turret variants both use "Slot 1" for
        // their own first weapon position, so a stale value surviving
        // only because the label string happens to match a PRIOR,
        // now-incompatible turret's own slot 1 would be exactly the kind
        // of un-diagnosed, silent migration Objective 6 forbids. Mode A
        // (Missile/Module) keeps the pre-existing `!baseTargets.has(...)`
        // gate completely unchanged — "existing missile-rack semantics
        // remain the primary precedent."
        if (newSpec.mode === 'independent-equipment' && swapped) {
          const prior = carryOverEligible ? priorIndependentEquipmentTargetByPosition.get(n) : undefined
          const priorSizeCompatible = prior !== undefined && previousEffectiveSpec?.size === newSpec.size
          if (prior && priorSizeCompatible) {
            baseTargets.set(slotLabel, prior.targetItem)
            baseTargetEntityClasses.set(slotLabel, prior.targetEntityClass)
          } else {
            // No authoritative correspondence (new turret, or an
            // incompatible size at this position) — an honest, empty
            // slot, never a guess.
            baseTargets.set(slotLabel, '—')
            baseTargetEntityClasses.set(slotLabel, undefined)
          }
          baseTargetModes.set(slotLabel, 'EXPLICIT_TARGET')
        } else if (!baseTargets.has(slotLabel)) {
          baseTargets.set(slotLabel, '—')
          baseTargetEntityClasses.set(slotLabel, undefined)
          baseTargetModes.set(slotLabel, 'EXPLICIT_TARGET')
        }
      }
    }
    // A Commander's own Target choice for one of these freshly-materialized
    // slots, resolved the exact same way the main override loop above
    // already resolves every other row's — only reachable now that
    // baseTargets has a seeded default for each new slotLabel to overwrite.
    for (const stub of materializedChildStubs) {
      const override = targetOverrides[stub.slotLabel]
      if (!override) continue
      const targetItem = typeof override === 'string' ? override : override.targetItem
      const suppliedEntityClass = typeof override === 'string' ? undefined : override.targetEntityClass
      const resolvedEntityClass =
        targetItem === '—'
          ? undefined
          : suppliedEntityClass
            ? (resolveComponentIdentity({ entityClass: suppliedEntityClass })?.entityClass ?? undefined)
            : (resolveComponentIdentity({ displayName: targetItem })?.entityClass ?? undefined)
      baseTargets.set(stub.slotLabel, targetItem)
      baseTargetEntityClasses.set(stub.slotLabel, resolvedEntityClass)
      baseTargetModes.set(stub.slotLabel, 'EXPLICIT_TARGET')
    }

    // SW-005 Phase 1 (Commander Safety) — final determination, now that
    // both resolution paths (canonical-template self-heal above, and the
    // component-owned-child materialization just above) have had their
    // chance. An override slotLabel still unresolved by either named a
    // port that is real nowhere — a genuine anomaly, not a legitimate
    // structural case. The whole save fails explicitly rather than
    // silently applying only the recognized subset; Commander intent must
    // never be partially, invisibly honored.
    const stillUnresolved = unrecognizedOverrideSlots.filter((slotLabel) => !baseTargets.has(slotLabel))
    if (stillUnresolved.length > 0) {
      return {
        success: false,
        message: `Could not save — ${stillUnresolved.length} assignment(s) referenced a port that no longer exists on this ship: ${stillUnresolved.join(', ')}.`,
      }
    }

    const isEditingExisting = !saveAsNew && startingState === 'EXISTING' && Boolean(existingBuildId)
    const buildId = isEditingExisting ? existingBuildId! : `${shipId}-mission-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const newRows: Hardpoint[] = referenceRows
      .filter((r) => !staleChildSlotLabels.has(r.slotLabel))
      .map((refRow, i) => {
        const target = baseTargets.get(refRow.slotLabel) ?? '—'
        const targetEntityClass = baseTargetEntityClasses.get(refRow.slotLabel)
        const installed = installedBySlot.get(refRow.slotLabel) ?? refRow.factoryItem
        const installedEntityClass = installedBySlot.has(refRow.slotLabel) ? installedEntityClassBySlot.get(refRow.slotLabel) : refRow.factoryEntityClass
        const { status, invalidMessage } = computeHardpointStatusWithValidation(installed, target, refRow.factoryItem, refRow.type, refRow.size, {
          installedEntityClass,
          targetEntityClass,
          factoryEntityClass: refRow.factoryEntityClass,
          knownCompatibleEntityClasses: swapGroupEligibleFor(refRow),
        })
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
          factoryEntityClass: refRow.factoryEntityClass,
          installedEntityClass,
          targetEntityClass,
          status,
          invalidMessage,
          // Mission-kind rows deliberately do NOT carry groupLabel/
          // assemblyRole here (EWO-025/EWO-026) — presentation hierarchy
          // for a saved Loadout is reconstructed at render time from the
          // current canonical template (see src/pages/ShipDetail.tsx's
          // overlayCanonicalHierarchy / src/pages/MissionComposer.tsx),
          // never persisted redundantly.
          // sourcePortId IS carried, since it costs nothing and lets
          // src/utils/fleetAssetReconciliation.ts's strongest match tier
          // work on a saved row exactly like a fresh Factory one.
          //
          // EWO-053 (B12-RB-001) — parentSlotLabel/isStructural ARE
          // carried through, UNLIKE groupLabel/assemblyRole above. Root
          // cause: this map runs over EVERY row in `referenceRows`,
          // including a component-owned child (a mining module or missile
          // rack slot — see componentOwnedSlots.ts) that already exists
          // from a prior save and was correctly left untouched by the
          // materialization step above (existingChildren.length > 0 &&
          // !swapped). Such a row's parentSlotLabel is NEVER reconstructable
          // from the canonical template the way an ordinary row's is — the
          // template has no entry for it at all (it isn't a real ship
          // port). Previously this map silently dropped it anyway,
          // stripping it down to `undefined` on every re-save of an
          // EXISTING build — which made fleetAssetReconciliation.ts's own
          // `isComponentOwnedChild` check (parentSlotLabel !== undefined)
          // fail the very next reload, quarantining the row outright: a
          // Commander's saved mining module selection would vanish
          // entirely, not merely revert to unassigned. `refRow.parentSlotLabel`/
          // `refRow.isStructural` are `undefined`/falsy for every ordinary
          // row (EWO-025's own rule — never set on a Mission-kind row to
          // begin with), so carrying them through here is a no-op for
          // every row this concern doesn't apply to.
          parentSlotLabel: refRow.parentSlotLabel,
          isStructural: refRow.isStructural,
          sourcePortId: refRow.sourcePortId,
          sourceItemPortName: refRow.sourceItemPortName,
          sourceParentItemPortName: refRow.sourceParentItemPortName,
          targetMode: baseTargetModes.get(refRow.slotLabel) ?? 'EXPLICIT_TARGET',
        }
      })

    // FTB-001B/FTB-001E — a freshly-materialized component-owned child
    // slot is the one exception to "hierarchy is reconstructed at render
    // time from the canonical template" immediately above: the canonical
    // template only ever describes the ship's ORIGINAL factory
    // component's own children, so a swapped-to component's new slots
    // have no template entry to be reconstructed from. parentSlotLabel/
    // isStructural must be set directly on these specific rows, or the
    // Loadout & Port Tree/Loadout Manager would never recognize them as
    // this port's children on the next load and would synthesize a
    // second, colliding set on top of them (see componentOwnedSlots.ts's
    // `withComponentOwnedChildSlots`).
    const materializedRows: Hardpoint[] = materializedChildStubs.map((stub, i) => {
      const target = baseTargets.get(stub.slotLabel) ?? '—'
      const targetEntityClass = baseTargetEntityClasses.get(stub.slotLabel)
      const { status, invalidMessage } = computeHardpointStatusWithValidation('—', target, '—', stub.type, stub.size, {
        installedEntityClass: undefined,
        targetEntityClass,
        factoryEntityClass: undefined,
      })
      return {
        id: `${buildId}-hp-owned-child-${i}`,
        shipId,
        buildId,
        slotLabel: stub.slotLabel,
        type: stub.type,
        size: stub.size,
        factoryItem: '—',
        installedItem: '—',
        targetItem: target,
        factoryEntityClass: undefined,
        installedEntityClass: undefined,
        targetEntityClass,
        status,
        invalidMessage,
        parentSlotLabel: stub.parentSlotLabel,
        isStructural: false,
        sourcePortId: undefined,
        targetMode: baseTargetModes.get(stub.slotLabel) ?? 'EXPLICIT_TARGET',
      }
    })
    newRows.push(...materializedRows)

    // SW-005 Phase 1 — materializes a real Hardpoint row for every
    // slotLabel `synthesizedFromCanonical` self-healed above (a canonical
    // port this Fleet Asset's reference rows didn't have yet). Mirrors
    // `materializedRows` immediately above: never left as target-only
    // bookkeeping with no physical row for the rest of the app to render
    // or reconcile against. Excludes anything already covered by the
    // component-owned-child materialization, which owns that slotLabel
    // namespace already.
    const canonicalOnlyRows: Hardpoint[] = [...synthesizedFromCanonical.entries()]
      .filter(([slotLabel]) => !materializedChildStubs.some((stub) => stub.slotLabel === slotLabel))
      .map(([slotLabel, templateRow], i) => {
        const target = baseTargets.get(slotLabel) ?? templateRow.factoryItem
        const targetEntityClass = baseTargetEntityClasses.get(slotLabel)
        const factoryEntityClass = resolveComponentIdentity({ displayName: templateRow.factoryItem })?.entityClass ?? undefined
        const { status, invalidMessage } = computeHardpointStatusWithValidation(templateRow.factoryItem, target, templateRow.factoryItem, templateRow.type, templateRow.size, {
          installedEntityClass: factoryEntityClass,
          targetEntityClass,
          factoryEntityClass,
        })
        return {
          id: `${buildId}-hp-canonical-${i}`,
          shipId,
          buildId,
          slotLabel,
          type: templateRow.type,
          size: templateRow.size,
          factoryItem: templateRow.factoryItem,
          installedItem: templateRow.factoryItem,
          targetItem: target,
          factoryEntityClass,
          installedEntityClass: factoryEntityClass,
          targetEntityClass,
          status,
          invalidMessage,
          parentSlotLabel: templateRow.parentSlotLabel,
          groupLabel: templateRow.groupLabel,
          assemblyRole: templateRow.assemblyRole,
          isStructural: templateRow.isStructural,
          sourcePortId: templateRow.sourcePortId,
          sourceItemPortName: templateRow.sourceItemPortName,
          sourceParentItemPortName: templateRow.sourceParentItemPortName,
          targetMode: baseTargetModes.get(slotLabel) ?? 'EXPLICIT_TARGET',
        }
      })
    newRows.push(...canonicalOnlyRows)

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

  // EWO-STAB-003B — moveToShip is now a thin adapter over the shared
  // installation engine (src/engine/installation), which owns identity
  // resolution, compatibility validation, the reservation-ownership
  // check, and inventory bookkeeping in one place. The EWO-STAB-002
  // containment guard (no valid slotLabel -> no mutation) is preserved
  // here as a fast, defensive pre-check as well as inside the engine
  // itself — the method never forwards an unvalidated slot even one
  // layer down.
  moveToShip: (itemId, shipId, slotLabel) => {
    const item = get().hangarItems.find((i) => i.id === itemId)
    const ship = get().ships.find((s) => s.id === shipId)
    if (!item || !ship) return { success: false, message: 'Item or ship not found.' }
    const validSlot = get().hardpoints.some((h) => h.buildId === ship.activeBuildId && h.slotLabel === slotLabel && h.status !== 'OK')
    if (!slotLabel || !validSlot) {
      return { success: false, message: 'A valid, open destination slot is required to move a component to a ship.' }
    }

    const { state, effects } = buildInstallationContext(get, set)
    const result = executeInstallation(
      { operation: 'INSTALL', component: { hangarItemId: itemId }, destination: { shipId, slotLabel }, hangarItemId: itemId },
      state,
      effects
    )

    if (!result.ok) {
      if (result.reason === 'reserved-elsewhere') {
        return { success: false, message: `${item.name} has no Available stock — the remaining unit(s) are reserved for a different Fleet Asset/Build. Release that reservation first, or install using its own Fleet Asset and Loadout.` }
      }
      if (result.reason === 'incompatible') {
        return { success: false, message: `${item.name} is not compatible with that slot.` }
      }
      return { success: false, message: `${ship.name}'s active Loadout has no open slot for ${item.name}.` }
    }

    get().addLogEntry({ action: 'Component moved to ship', shipName: ship.name, itemName: item.name, details: `Moved ${item.name} from Hangar to ${ship.name}` })
    return { success: true, message: `${item.name} installed on ${ship.name}.` }
  },

  // EWO-STAB-003B — thin adapter. Identity resolution, the EWO-STAB-002
  // no-slot / compatibility guards, reservation-ownership validation, and
  // hangar bookkeeping all now live in src/engine/installation; this
  // method only translates its existing args into an InstallationCommand
  // and reshapes the result back to its pre-existing return shape, so
  // Quick Update (its only reachable caller) needs zero changes.
  installComponent: (shipId, itemName, slotLabel, buildIdOverride) => {
    const { state, effects } = buildInstallationContext(get, set)
    const result = executeInstallation(
      { operation: 'INSTALL', component: { displayName: itemName }, destination: { shipId, buildId: buildIdOverride, slotLabel } },
      state,
      effects
    )
    if (!result.ok) {
      if (result.reason === 'reserved-elsewhere') return { matched: false, blocked: 'reserved-elsewhere' }
      if (result.reason === 'incompatible') return { matched: false, blocked: 'incompatible' }
      return { matched: false }
    }
    return { matched: true, reservationFulfilled: result.reservationFulfilled }
  },

  // EWO-STAB-003B — thin adapter over the shared engine's REMOVE
  // operation. Return-to-Inventory still delegates to the store's own
  // addHangarItem (unchanged, already the single correct implementation
  // — see InstallationEffects.returnToInventory).
  removeComponent: (shipId, slotLabel, returnToHangar, buildIdOverride) => {
    const { state, effects } = buildInstallationContext(get, set)
    const result = executeInstallation({ operation: 'REMOVE', destination: { shipId, buildId: buildIdOverride, slotLabel }, returnToInventory: returnToHangar }, state, effects)
    if (!result.ok) return { matched: false }
    return { matched: true, itemName: result.resolvedDisplayName }
  },

  // EWO-STAB-003B — thin adapter over the shared engine's TRANSFER
  // operation. Its own, deliberately different compatibility rule (the
  // destination must match the donor hardpoint's own type/size, not the
  // catalog) is preserved verbatim via `compatibilityMode:
  // 'exact-slot-match'` — see compatibilityEngine.ts. Unreachable from
  // any UI today (EWO-030); converted for architectural consistency, not
  // because any live caller needed it.
  moveComponentBetweenShips: (fromShipId, fromSlotLabel, toShipId, toSlotLabel) => {
    const { state, effects } = buildInstallationContext(get, set)
    const result = executeInstallation(
      {
        operation: 'TRANSFER',
        source: { shipId: fromShipId, slotLabel: fromSlotLabel },
        destination: { shipId: toShipId, slotLabel: toSlotLabel },
        compatibilityMode: 'exact-slot-match',
      },
      state,
      effects
    )
    if (!result.ok) return { matched: false, message: result.message }

    get().addLogEntry({
      action: 'Component moved to ship',
      shipName: get().ships.find((s) => s.id === toShipId)?.name,
      itemName: result.resolvedDisplayName,
      details: `Moved ${result.resolvedDisplayName} from ${get().ships.find((s) => s.id === fromShipId)?.name ?? fromShipId} (${fromSlotLabel}) to ${get().ships.find((s) => s.id === toShipId)?.name ?? toShipId} (${result.slotLabel})`,
    })

    return { matched: true, itemName: result.resolvedDisplayName }
  },

      addLogEntry: (entry) => {
        const newEntry: LogEntry = { ...entry, id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: 'Just now' }
        set({ log: [newEntry, ...get().log] })
      },

      // EWO-094 — see this action's own interface doc comment above.
      replaceFleetFromImport: (mergedState) => {
        const recoverySnapshot = buildFleetExportEnvelope(buildFleetPersistencePayload(get()), PERSIST_VERSION, APP_VERSION.productVersion)
        set(mergedState)
        get().addLogEntry({ action: 'Fleet imported', details: `Replaced the current fleet from an imported file — ${mergedState.ships.length} ships, ${mergedState.hangarItems.length} hangar items.` })
        return recoverySnapshot
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
      //
      // EWO-094 — the logic itself now lives in migrateFleetPersistedState
      // (defined above, right before this store's creation), so Fleet
      // Import's preview pipeline can call the exact same function this
      // option calls, in memory, rather than a second, parallel migration
      // implementation. See that function's own doc comment for the full
      // field-by-field migration history — unchanged.
      migrate: (persistedState, version) => migrateFleetPersistedState(persistedState, version),
      // Fleet Assets added via "Add Ship" (or any future non-seed source)
      // still round-trip via replay (see merge below). The hardcoded seed
      // fleet is never replayed this way — replaying it through
      // materializeFleetAsset would silently discard its hand-authored
      // Mission Configurations — so seedAssetOverrides carries only the
      // minimal diff (removed / renamed / re-owned / re-prioritized) a
      // user can apply to a seed ship. Hangar Inventory, Reservations, and
      // the Installed Loadout persist directly in full.
      // EWO-093 — the field-selection logic itself now lives in
      // `buildFleetPersistencePayload` (src/utils/fleetSerialization.ts),
      // not inline here, so Fleet Export can call the exact same function
      // rather than a second, parallel implementation. See that module's
      // own doc comment and docs/Beta-2.1-Fleet-Export-Architecture.md.
      partialize: (state) => buildFleetPersistencePayload(state),
      // Replays every persisted manual Fleet Asset back into ships/builds/
      // hardpoints using the exact same materializeFleetAsset() the live
      // "Add Ship" action uses — `existingAsset` reuses the persisted id
      // verbatim so identity survives a refresh instead of minting a new one.
      //
      // `merge` only ever runs when a persisted value actually exists in
      // storage (zustand skips it entirely on a true first-ever load) —
      // so reaching this function at all is itself the "persisted user
      // state exists" signal (Mission M-012, `hasPersistedState`).
      //
      // EWO-094 — the logic itself now lives in mergeFleetPersistedState
      // (defined above, right before this store's creation), so Fleet
      // Import's preview pipeline can call the exact same function this
      // option calls, in memory, to compute the would-be hydrated state a
      // Replace would actually produce — without ever calling `set()` or
      // touching `localStorage`. See that function's own doc comment for
      // the full reconciliation history — unchanged.
      merge: (persistedState, currentState) => mergeFleetPersistedState(persistedState, currentState),
    }
  )
)
