export type Ownership = 'Owned' | 'Purchased' | 'Loaner'

// ======================================================
// Fleet Asset lifecycle (Sprint 1.3I)
//
// A ShipDefinition is catalog/game data — it describes a ship model and
// never implies ownership. A FleetAsset is player data — one specific
// ship a player owns, purchased in-game, or holds as a loaner. Multiple
// FleetAssets can reference the same ShipDefinition (two Cutlass Blacks),
// each with its own id, loadout, and build.
//
// The existing `Ship`/`Build`/`Hardpoint` shapes below remain the
// rendering model every page already consumes — a FleetAsset, once
// created, is materialized into exactly one `Ship` + `Build` +
// `Hardpoint[]` row set (see src/utils/fleetAssetMaterializer.ts), so
// Fleet Dashboard/Mission Control/Ship Detail need no redesign. Removing
// a FleetAsset removes its materialized rows; the ShipDefinition and any
// other FleetAsset referencing it are untouched.
// ======================================================

export type OwnershipType = 'OWNED' | 'PURCHASED' | 'LOANER'

export type AcquisitionSource = 'MANUAL' | 'RSI_IMPORT' | 'CCUGAME_IMPORT' | 'SEED_MIGRATION'

export interface ShipDefinitionImage {
  primaryUrl?: string
  source?: string
  status?: string
}

/** Catalog/game data describing a ship model. Never implies ownership. */
export interface ShipDefinition {
  id: string
  internalName: string
  displayName: string
  manufacturer: string
  classification: ShipClassification
  career: string
  role: string
  image?: ShipDefinitionImage
  imageUrl?: string
  equipmentGroups: string[]
  portIds: string[]
  factoryLoadoutId: string
  sourceMetadata: { sourceType: 'seed' | 'StarBreaker'; sourceFile?: string }
}

/** Player data — one specific ship instance a player owns/purchased/loans. */
export interface FleetAsset {
  id: string
  shipDefinitionId: string
  nickname?: string
  ownershipType: OwnershipType
  acquisitionSource: AcquisitionSource
  activeBuildId: string
  installedLoadoutId: string
  priority: number
  status: 'active' | 'removed'
  addedAt: string
  updatedAt: string
}

/**
 * Persisted, per-id overrides for the hand-authored seed fleet (Mission
 * M-012 incident fix). Seed ships' ships/builds/hardpoints stay
 * hardcoded in src/data/seed.ts and are never replayed through
 * materializeFleetAsset (that would silently discard their hand-authored
 * Mission Configurations) — but a user's removal, rename, ownership
 * change, or priority change against a seed ship must still survive a
 * refresh. This is the minimal persisted "diff" layered on top of the
 * fresh seed bake-in at rehydration time; see the `merge` function in
 * src/store/useFleetStore.ts for how it's applied.
 */
export interface SeedAssetOverride {
  status?: 'active' | 'removed'
  nickname?: string
  ownershipType?: OwnershipType
  priority?: number
  updatedAt: string
}

export interface Ship {
  id: string
  name: string
  manufacturer: string
  ownership: Ownership
  career: string
  role: string
  activeBuildId: string
  readiness: number
  priority: number
  missing: string[]
  // Fleet Profile (Alpha 2.4, Part 7) — player-editable descriptive
  // context, independent of `role` (which currently mirrors the active
  // Loadout's role text) and independent of the authoritative RSI/CIG
  // ShipClassification (Part 9 — never inferred from either). Optional;
  // unset until the player edits it via Ship Detail's Fleet Profile.
  primaryRole?: string
  secondaryRole?: string
  // Ships are claimable anywhere and are not location-bound — only
  // Components are (see HangarItem below). Ship location is intentionally
  // not modeled here.
  imageUrl?: string
  lastUpdated?: string
}

export type BuildKind = 'FACTORY' | 'CUSTOM' | 'MISSION' | 'TEMPLATE'

export interface Build {
  id: string
  shipId: string
  name: string
  role: string
  readiness: number
  isActive: boolean
  missing: string[]
  /** FACTORY = generated from Factory Loadout, immutable/protected, never
   * treated as a completed customization project. MISSION = a real,
   * ship-specific Mission Configuration (Alpha 2.2 terminology; 'CUSTOM'
   * is kept as a recognized legacy value with identical meaning, so
   * pre-2.2 persisted data and seed fixtures don't need a hard rewrite —
   * see src/utils/fleetBuildState.ts, which treats them the same).
   * TEMPLATE = a reusable Quartermaster Template, not itself assigned to
   * any Fleet Asset. Defaults to 'MISSION' for any build that doesn't
   * specify it. */
  kind?: BuildKind
}

/**
 * Quartermaster Template (Alpha 2.2) — reusable MISSION INTENT, not tied
 * to any one Fleet Asset. Applying a template to a specific ship creates
 * or updates a real, ship-specific Mission Configuration (a `Build`);
 * the template itself is never assigned as anyone's activeBuildId.
 * Assignments are keyed by slotLabel so a template can be offered to any
 * ship whose hardpoints happen to share that slot naming (a real
 * per-model compatibility check still runs at apply time).
 */
export interface QuartermasterTemplate {
  id: string
  name: string
  description?: string
  category?: string
  targetAssignments: { slotLabel: string; targetItem: string }[]
  createdAt: string
  updatedAt: string
}

/**
 * The real, ship-specific "what's physically on this Fleet Asset right
 * now" record (Alpha 2.2) — one per Fleet Asset, shared by every Mission
 * Configuration that ship has. This is what fixes the Alpha 2.1-era bug
 * where `Hardpoint.installedItem` was silently duplicated once per Build:
 * switching Active Mission, or installing a component while a non-active
 * Mission Context is selected, must never leave two different "what's
 * installed" answers for the same physical slot. Hardpoint.installedItem
 * remains the value every existing page reads (no rendering-pipeline
 * rewrite), but it is now always kept in sync FROM this shared record at
 * every mutation site — see src/store/useFleetStore.ts's
 * `syncInstalledLoadout` helper.
 */
export interface InstalledLoadoutEntry {
  shipId: string
  slotLabel: string
  installedItem: string
  /** EWO-STAB-003D (ADR-010) — the canonical identity of `installedItem`,
   * when resolvable. Additive and optional: a pre-existing entry from
   * before this mission simply has none, and every reader falls back to
   * name-only matching exactly as before. Kept in sync with the owning
   * Hardpoint row's own `installedEntityClass` at every mutation site. */
  entityClass?: string
}

// ======================================================
// Ship classification (Alpha 2.1) — normalized RSI-style role taxonomy,
// centralized so Fleet Dashboard filters never depend on custom Build
// names or free-text Ship.role strings. See src/data/shipClassification.ts
// for the actual mapping.
// ======================================================

export type RsiRole = 'Combat' | 'Transport' | 'Exploration' | 'Industrial' | 'Support' | 'Competition' | 'Ground' | 'Multi-role'

export interface ShipClassification {
  rsiRoles: RsiRole[]
  focusTags: string[]
  vehicleKind?: 'Ship' | 'Ground Vehicle'
  source: 'RSI' | 'CIG_DATA' | 'MANUAL_SEED' | 'UNKNOWN'
}

/**
 * Derived (never stored as authoritative) per-Fleet-Asset state — see
 * src/utils/fleetBuildState.ts. FACTORY_ONLY and MISSION_READY look
 * similar at 100% Installed=Target, but are not the same thing: one has
 * no player-intentional customization at all, the other is a finished
 * custom project.
 */
export type FleetBuildState = 'FACTORY_ONLY' | 'BUILD_ASSIGNED' | 'BUILD_IN_PROGRESS' | 'MISSION_READY' | 'INVALID_BUILD'

// ======================================================
// Validation (Alpha 2.1) — see src/engine/validation/. Structured,
// queryable issues rather than console noise or silent bad data.
// ======================================================

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO'

export interface ValidationIssue {
  severity: ValidationSeverity
  code: string
  entityType: string
  entityId: string
  message: string
  relatedIds?: string[]
  suggestedAction?: string
}

export type HardpointStatus = 'OK' | 'Missing' | 'Upgrade Available' | 'Invalid Target' | 'Unresolved'

// ======================================================
// Quartermaster Logistics Engine (Alpha 2.3) — see
// src/engine/logistics/. Three separate truths, never collapsed:
// OWNED (Hangar quantity), RESERVED (committed to one Mission target),
// INSTALLED (physically mounted). A Mission Reservation commits exactly
// one physical unit to exactly one target requirement on one Mission
// Configuration; it is player data, persisted like everything else in
// src/store/useFleetStore.ts.
// ======================================================

export type ReservationStatus = 'ACTIVE' | 'FULFILLED' | 'RELEASED' | 'INVALID'

export interface MissionReservation {
  id: string
  /** The Mission Configuration this reservation commits to — a Build id. */
  missionConfigurationId: string
  fleetAssetId: string
  /** Stand-in for targetPortId in the legacy Hardpoint model. */
  targetSlotLabel: string
  /** Stand-in for componentDefinitionId — components are matched by
   * display name throughout this codebase (Hardpoint.targetItem,
   * ProcurementLine.itemName, HangarItem.name); a reservation follows
   * that same established convention rather than inventing a parallel
   * catalog id scheme. */
  componentName: string
  quantity: number
  status: ReservationStatus
  createdAt: string
  updatedAt: string
  /** EWO-STAB-003C (ADR-010) — canonical identity alongside componentName,
   * additive and optional; populated only when resolvable at reservation
   * creation time. Absent for any reservation created before this
   * mission, or for an uncataloged component — never a guess. */
  componentEntityClass?: string
}

/** Per-target-row logistics state (Alpha 2.3, Part 9) — distinct from
 * HardpointStatus, which only knows about Installed vs Target. This adds
 * the ownership/commitment dimension on top. */
export type LogisticsState = 'INSTALLED' | 'RESERVED' | 'AVAILABLE' | 'MISSING' | 'INVALID'

export interface ComponentAvailability {
  componentName: string
  ownedQuantity: number
  installedQuantity: number
  reservedQuantity: number
  availableQuantity: number
}

/** Derived per-Mission-Configuration package state (Part 8). FACTORY_LOADOUT
 * is not really a "package" state — Factory-only assets never get one. */
export type MissionPackageState = 'PLANNING' | 'COLLECTING_PARTS' | 'PACKAGE_STAGED' | 'MISSION_READY' | 'INVALID' | 'FACTORY_LOADOUT'

export interface MissionPackageResult {
  missionConfigurationId: string
  totalRequiredAssignments: number
  installedMatches: number
  reservedMatches: number
  availableUnreservedMatches: number
  missingAssignments: string[]
  invalidAssignments: string[]
  /** "Is this Fleet Asset physically configured for the Mission?" */
  installedPercentage: number
  /** "Does the player own and commit everything required?" */
  packagePercentage: number
  packageState: MissionPackageState
  isMissionReady: boolean
  isPackageStaged: boolean
}

// Hardpoints belong to a specific Build (not just a ship) so that switching
// the Active Build on Ship Detail swaps in a different set of targets/status
// without mutating the ship's other builds. Factory Loadout seeds Installed
// Loadout when a ship/build is first created; Installed can later drift from
// both Factory and Target.
export interface Hardpoint {
  id: string
  shipId: string
  buildId: string
  slotLabel: string
  type: string
  size: string
  factoryItem: string
  installedItem: string
  targetItem: string
  status: HardpointStatus
  /** Set only when status is 'Invalid Target' — explains the mismatch. */
  invalidMessage?: string
  /** When set, this row is a child of the row in the same Build whose
   * slotLabel matches this value (Alpha 2.5C) — the real physical port
   * graph (gimbal → weapon, turret → child weapons, mining turret → head
   * → modules, missile rack → missile) expressed directly on the
   * existing flat Hardpoint array rather than a parallel data model.
   * Undefined/absent means this is a top-level physical port. See
   * src/utils/portTree.ts for the generic tree-building logic that reads
   * this — nothing renders per-ship special cases. */
  parentSlotLabel?: string
  /** EWO-019B — a top-level (no parentSlotLabel) physical port's real-world
   * system grouping (e.g. "Weapons", "Turrets", "Quantum Drive"), when the
   * source data resolves one. Presentation-only: never set on a nested
   * child row (its parent's own group already covers it), never affects
   * compatibility/readiness/persistence — src/utils/portTreeGrouping.ts
   * is the sole consumer, used to render a synthetic header the same way
   * a real parent port already renders one. Absent means "render as a
   * flat top-level row," today's behavior, unchanged. */
  groupLabel?: string
  /** EWO-020 — a conservative, source-evidenced physical-assembly role
   * (see src/normalizer/assemblyRole.ts's AssemblyRole union — this field
   * carries the same string values, kept loosely typed here since the app
   * layer doesn't otherwise depend on the normalizer). Set on every
   * imported hardpoint, structural or real. */
  assemblyRole?: string
  /** EWO-020 — true only for a mount/turret/assembly row that exists
   * purely to explain physical hierarchy (see Port.isStructural). A
   * structural hardpoint always has factoryItem/installedItem/targetItem
   * `'—'`, is excluded from readiness/procurement denominators
   * (src/utils/buildProgress.ts, src/engine/logistics/*), and never
   * renders an editable target selector (src/pages/MissionComposer.tsx). */
  isStructural?: boolean
  /** EWO-043 — the originating authoritative Port's own stable canonical id
   * (only ever set for a deep-imported row; a hand-authored seed row has no
   * such id and leaves this undefined). This is the strongest identity
   * signal the reconciliation engine uses to re-match a Commander's
   * persisted row against a changed authoritative template — see
   * src/utils/fleetAssetReconciliation.ts. Never used for display. */
  sourcePortId?: string
  /** EWO-043 — explicit Commander-intent semantics for this row's
   * `targetItem`. FOLLOW_FACTORY means the Commander never deliberately
   * chose this target — it should keep tracking whatever the authoritative
   * Factory item is (set on every freshly materialized Factory row, and on
   * any Mission row slot saveMissionConfiguration filled from FACTORY
   * without an explicit override). EXPLICIT_TARGET (or absent, for any
   * pre-EWO-043 persisted row) means the Commander's literal choice must
   * never be silently replaced by a template change — see
   * src/utils/fleetAssetReconciliation.ts. */
  targetMode?: 'FOLLOW_FACTORY' | 'EXPLICIT_TARGET'
  /** EWO-STAB-003C (ADR-010) — canonical component identity, additive
   * alongside the existing display-name fields above. Populated only
   * when src/engine/installation/componentIdentityService.ts can
   * resolve a real entityClass for the corresponding string field;
   * absent (not a guess) for an uncataloged component or any row
   * persisted before this mission. Never used for display — the
   * existing installedItem/targetItem/factoryItem strings remain the
   * presentation and legacy-compatibility layer. */
  installedEntityClass?: string
  targetEntityClass?: string
  factoryEntityClass?: string
}

/**
 * EWO-043 — a Commander assignment whose port no longer exists in the
 * current authoritative template for its ship. Removed ports must never
 * silently destroy Commander intent (Task 7): the assignment is pulled out
 * of the active, rendered Hardpoint list but preserved here in full,
 * recoverable until the Commander explicitly resolves it (no UI/workflow
 * for that resolution exists yet — this is the durable record it would
 * act on). Never auto-deleted, never auto-restored.
 */
export interface QuarantinedAssignment {
  id: string
  shipId: string
  buildId: string
  /** The full row as it existed the moment its port disappeared upstream. */
  hardpoint: Hardpoint
  reason: 'PORT_REMOVED'
  quarantinedAt: string
}

// Allowed dispositions for Hangar items. "Vendor" is intentionally excluded —
// vendor trash is not tracked in the Hangar Inventory.
export type Disposition = 'Install' | 'Store' | 'Stockpile' | 'Trade' | 'Ignore'

export interface HangarItem {
  id: string
  name: string
  type: string
  size: string
  qty: number
  neededBy: string
  disposition: Disposition
  /** EWO-028 (Design Authority Ruling 1) — the canonical DataCore entity
   * class (e.g. "COOL_AEGS_S02_Avalanche_SCItem"), when the record was
   * added through the catalog-driven Add workflow. Two records sharing a
   * display name are NEVER treated as the same component unless this
   * also matches (or is absent on both — see the merge logic in
   * addHangarItem for the full precedence). Absent on legacy/pre-EWO-028
   * records and on anything hand-typed outside the catalog — those keep
   * matching by name+type+size only, exactly as before; never
   * retroactively assigned without a Commander re-adding the item
   * through the catalog. EWO-STAB-003D (ADR-010): calculateComponentAvailability
   * (src/engine/logistics/availability.ts) now prefers this field when both
   * this record AND the component it's being matched against resolve an
   * entityClass; either side lacking one falls back to the original
   * name-only comparison, unchanged. This field still identifies an
   * inventory RECORD — it does not re-key InstalledLoadoutEntry/
   * MissionReservation matching (src/utils/inventoryDependencies.ts),
   * which remains name-only under Design Authority Ruling 12. */
  entityClass?: string
  // Future-ready: Components are location-bound (ships are not). Optional
  // and unused in the UI this sprint — reserved for a later Location column.
  location?: string
}

// A Build Library entry is a reference template — not tied to any one ship —
// shown above the Assigned Ship Builds table in Build Manager.
export interface BuildLibraryEntry {
  id: string
  name: string
  category: string
  description: string
}

export interface LogEntry {
  id: string
  timestamp: string
  action: string
  shipName?: string
  itemName?: string
  details: string
  readinessBefore?: number
  readinessAfter?: number
}
