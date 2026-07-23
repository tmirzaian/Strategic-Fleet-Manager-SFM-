/**
 * SW-010A — Configurable Slot Adapter (Phase I).
 *
 * Runtime model types for the Configurable Slot pipeline (ADR-014,
 * ImportPipeline-v2.md Stages 7-9, SwapGroupSpecification.md). This file
 * is the one shared shape every stage (extractor, resolver, merge) reads
 * and writes — no stage defines its own competing shape.
 */

/**
 * One entry from `SEntityComponentDefaultLoadoutParams.loadout.entries[]`,
 * normalized. Produced by the Default Loadout Extractor (Objective 1) for
 * EVERY entry it walks — both the ones the geometry exporter would also
 * capture (a real inline `entityClassName`) and the ones it silently
 * drops (an `entityClassReference`-only entry with no nested materialized
 * children — the configurable-slot shape ADR-014 confirmed live for
 * `hardpoint_weapon_center`/`hardpoint_front_module`/`hardpoint_rear_module`).
 */
export interface DefaultLoadoutConfigurationEntry {
  /** The exact DataCore `itemPortName` — e.g. "hardpoint_weapon_center". Never a display name. NOT globally unique on its own — see `ancestorPortNames`. */
  itemPortName: string
  /** Null for a top-level entry; the parent's own `itemPortName` for a nested one — mirrors the raw `entries[]` recursion exactly, never flattened. */
  parentItemPortName: string | null
  /** Every ancestor `itemPortName` from the root down to (not including) this entry itself, root-first. Empty for a top-level entry. SW-010B fleet-wide certification finding: `itemPortName` alone is NOT a unique identity — DataCore reuses generic sub-port names (`turret_left`, `hardpoint_class_2`, `Screen_Left_Top`) across structurally repeated sibling assemblies (confirmed live: the real `AEGS_Retaliator` record declares 5 distinct turret mounts, each with its own `turret_left`/`turret_right` children, each of THOSE with its own `hardpoint_class_2` grandchild — same names, 5 physically distinct mounts). `parentItemPortName` alone is insufficient too (the 5 `turret_left` parents are themselves same-named at their own level in some ships) — only the FULL ancestor chain disambiguates. This is what the Canonical Merge stage's duplicate-detection keys on, never `itemPortName` alone. */
  ancestorPortNames: string[]
  /** The inline default entity class, when the raw entry carries one directly (`entityClassName !== ""`). Null otherwise — never guessed from the reference. */
  factoryEntityClassName: string | null
  /** The `file://...` reference DataCore carries when there is no inline default — present or absent independently of `factoryEntityClassName` (both can theoretically be set; only one is ever populated in every real example seen so far). */
  factoryEntityClassReference: string | null
  /** True when this entry's own raw `loadout.entries` is non-empty — i.e. the geometry exporter would also have captured this port (it has something concretely installed inside it, even if this exact entry itself has no inline `entityClassName`). This is the flag `ImportPipeline-v2.md` Stage 7 uses to decide "configurable-slot candidate" vs. "already handled by geometry." */
  hasNestedEntries: boolean
}

/** Objective 1 diagnostics — one per Default Loadout Extractor run. */
export interface DefaultLoadoutDiagnostic {
  code:
    | 'configuration-entry-found'
    | 'configuration-reference-unresolvable'
    | 'configuration-entry-conflicts-with-geometry'
  message: string
  itemPortName: string
  severity: 'info' | 'warning'
}

export interface DefaultLoadoutExtractionResult {
  entries: DefaultLoadoutConfigurationEntry[]
  /** Entries whose `entityClassName` is empty and `entityClassReference`
   * is set — a NECESSARY but explicitly NOT SUFFICIENT condition for
   * "this is a Configurable Slot invisible to geometry." Live-verified
   * during SW-010A implementation: `hasNestedEntries === false` does
   * *not* reliably distinguish a true configurable slot from an ordinary
   * leaf component whose factory default just happens to be expressed by
   * reference rather than inline name — confirmed directly against the
   * real Argo MOTH fixture, where `hardpoint_cooler`/`hardpoint_power_plant`
   * both have this exact reference-only, no-nested-entries shape in the
   * DCB record, yet both materialize fully in the real geometry export
   * (`raw-data/ARGO_MOTH.json`) with a real installed item — they are
   * ordinary, fully-resolved ports, not configurable slots. The TRUE
   * distinguishing signal is only available by cross-referencing the
   * ship's real Physical Port Graph, which this module deliberately does
   * not have access to (per its own "independent of geometry parsing"
   * responsibility) — that cross-check is Stage 9's job
   * (`canonicalMerge.ts`), not this stage's. Consumers must not treat
   * this list as "the configurable slots" — only as candidates to merge. */
  referenceOnlyEntries: DefaultLoadoutConfigurationEntry[]
  diagnostics: DefaultLoadoutDiagnostic[]
}

/** SwapGroupSpecification.md's confidence tiers — see that document for the full model. */
export type SwapGroupConfidence = 'confirmed-bidirectional' | 'tag-co-membership' | 'unresolved'

export interface SlotDiagnostic {
  code:
    | 'swap-group-resolved'
    | 'swap-group-single-member'
    | 'swap-group-unknown-family'
    | 'swap-group-unresolved-reference'
    | 'swap-group-default-not-self-member'
    | 'swap-group-shared-across-slots'
    | 'swap-group-duplicate-member'
    | 'swap-group-membership-implausible'
  message: string
  severity: 'info' | 'warning'
}

/** One resolved swap group — SwapGroupSpecification.md's canonical shape. */
export interface SwapGroup {
  /** The raw AttachDef.Tags token, used verbatim — never normalized/case-folded (SwapGroupSpecification.md §3). */
  swapGroupId: string
  /** Every entity class sharing swapGroupId, deduplicated by entity class, always including the default. */
  eligibleComponents: string[]
  confidence: SwapGroupConfidence
  diagnostics: SlotDiagnostic[]
}

/** The runtime Configurable Slot model — SwapGroupSpecification.md's `ConfigurableSlot`. */
export interface ConfigurableSlot {
  portName: string
  parentPortName: string | null
  localizedSlotName: string | null
  defaultComponentEntityClass: string | null
  swapGroupId: string | null
  eligibleComponents: string[]
  /** Independent of defaultComponentEntityClass — the FACTORY default is
   * not necessarily what's currently targeted/installed. Phase I never
   * populates this from live Hardpoint state (Objective 4: "no UI
   * consumption yet") — always null until a future phase wires it up. */
  currentInstalledEntityClass: string | null
  sourceAuthority: 'geometry-and-configuration' | 'configuration-only'
  confidence: SwapGroupConfidence
  diagnostics: SlotDiagnostic[]
}

/** One physical port fact the merge stage must never duplicate or override — the minimum shape Stage 9 needs from the existing Physical Port Graph (Authority 1). Deliberately narrower than the real `Hardpoint`/`Port` types so this module stays decoupled from `src/normalizer` (mirrors `docs/ImportPipeline.md`'s established isolation principle for catalog-generation-time tooling). */
export interface PhysicalPortFact {
  itemPortName: string
  hasFactoryItem: boolean
}

export interface MergeDiagnostic {
  code:
    | 'configurable-slot-merged-into-existing-port'
    | 'configurable-slot-synthesized'
    | 'configuration-duplicate-port-name'
  message: string
  itemPortName: string
  severity: 'info' | 'warning'
}

export interface CanonicalConfigurableTopology {
  shipEntityClass: string
  configurableSlots: ConfigurableSlot[]
  diagnostics: MergeDiagnostic[]
}
