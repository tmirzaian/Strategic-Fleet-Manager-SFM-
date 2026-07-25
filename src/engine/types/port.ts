import type { EquipmentGroup } from './equipmentGroup'

/**
 * `Port` — THE HEART OF THE DATA MODEL.
 *
 * A Port represents a single mount point on a ship (a hardpoint, a bay, a
 * turret gimbal, an internal component slot, etc.). Parent-child
 * relationships are preserved via `parentPortId` (child -> parent) and
 * `childPortIds` (parent -> children) — a flat, doubly-linked structure
 * rather than nested embedding, so `ports: Port[]` from a normalizer is
 * always a flat, directly-indexable array. `children` is kept only for
 * backward compatibility with the earlier Gladius proof-of-concept's
 * nested-tree shape; new normalizer code should not populate it.
 *
 * `internalName` is the raw CIG/StarBreaker identifier (e.g.
 * "hardpoint_gun_left_wing"); `displayName` is what the UI is allowed to
 * show. See `src/normalizer/displayNameGenerator.ts` — the UI should
 * NEVER render `internalName` directly.
 */
export interface Port {
  id: string
  shipId: string
  /** Null/undefined for a top-level port with no parent. */
  parentPortId?: string | null
  equipmentGroup: EquipmentGroup

  internalName: string
  displayName: string
  /** Human-facing position, e.g. "Left Wing", "Nose", "Turret 1". */
  positionLabel?: string

  /** The canonical port type `classifyPort()` included this port under
   * (e.g. "WeaponTurret", "MissileRack", "QuantumDrive") — the same value
   * passed to `classifyPort()`, whether it came from a legacy export's own
   * `portType` or from the classification translation layer (Mission
   * M-009). Preserved here (Mission M-010) so `equipmentResolver.ts` can
   * tell a mount/rack container port apart from independently real
   * equipment without inspecting any name. */
  canonicalPortType?: string

  /** Compatibility constraints for what can be installed in this Port.
   * Empty arrays / null bounds mean "unknown/unconstrained", never
   * "nothing allowed" — see CompatibilityRule. */
  allowedTypes: string[]
  allowedSubtypes: string[]
  minSize: number | null
  maxSize: number | null

  /** Foreign keys into Component. Null/undefined = empty. */
  installedItemId?: string | null
  factoryItemId?: string | null
  targetItemId?: string | null

  /** Flat list of this port's direct children's ids (new, normalized shape). */
  childPortIds?: string[]
  /** @deprecated legacy nested-tree shape from the Gladius proof-of-concept. */
  children?: Port[]

  /** Optional debug metadata: where in the raw source this port came from. */
  sourcePath?: string

  /** EWO-020 — the raw CIG/StarBreaker entity class mounted at this port
   * (e.g. "Mount_Gimbal_S2", "ANVL_Valkyrie_Turret_Top"), when known.
   * Diagnostic identity only, same spirit as `internalName` — never
   * rendered as a primary UI label. Also the evidence
   * `deriveAssemblyRole()` reasons from. */
  sourceEntityClass?: string

  /** EWO-020 — a conservative, source-evidenced physical-assembly role
   * (see src/normalizer/assemblyRole.ts). Set on every port, included or
   * structural, so downstream consumers (grouping, presentation) never
   * need to re-derive it from a name. */
  assemblyRole?: string

  /** EWO-020 — true only for a mount/turret/assembly node that
   * `classifyPort()` would normally exclude (no configurable component of
   * its own — the assembly itself isn't something a Commander installs or
   * replaces) but that was preserved anyway because it has a real,
   * included descendant needing a parent to explain the physical
   * hierarchy. A structural port never receives a factory/installed/
   * target assignment, never counts toward readiness/procurement, and
   * never renders an editable target selector — see
   * src/utils/buildProgress.ts and src/utils/procurement.ts. */
  isStructural?: boolean

  /** SW-013C.2G — true only for a Port synthesized at runtime by
   * `src/generated/dormantHardpoints.ts`'s materialization step
   * (`src/generated/importedShips.ts`'s `buildView`), never present in
   * `generated-data/ports.json` itself (that raw artifact is never
   * mutated). See `Hardpoint.isDormant`'s own doc comment for the full
   * provenance and evidence model. */
  isDormant?: boolean
  /** SW-013C.2G — only set alongside `isDormant`. The real DataCore ship
   * entity class of a donor ship that actually earns this port's own
   * confirmed swap-group entry — see `DormantHardpointSpec.donorShipEntityClassForCompatibility`'s
   * own doc comment for why the dormant port's own ship can never have
   * one of its own. */
  dormantDonorShipEntityClass?: string
  /** SW-013C.2G Amendment C — only set alongside `isDormant`. When present,
   * restricts this dormant port's own candidate list to ONLY these entity
   * classes, even though `dormantDonorShipEntityClass`'s own confirmed swap
   * group may list more members. A confirmed swap group proves "these
   * components are interchangeable on SOME ship" — it does not by itself
   * prove every member is valid on THIS specific (dormant) ship's own
   * variant/family. See `DormantHardpointSpec.restrictCandidatesToEntityClasses`'s
   * own doc comment for the evidence model (DataCore `AttachDef.RequiredTags`
   * divergence + factory-installation-pattern + independent SPPV
   * corroboration). Undefined/absent means no restriction beyond the swap
   * group itself — the pre-Amendment-C default. */
  dormantAllowedComponentEntityClasses?: string[]
}
