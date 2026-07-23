# Strategic Fleet Manager — Import Pipeline v2 (Configurable Topology Blueprint)

> **Status: design only.** This document extends `docs/ImportPipeline.md` (Stages 1-6, unchanged and still authoritative for physical topology, classification, and validation). Nothing here is implemented. See `docs/ADR/ADR-014-Configurable-Slot-Architecture.md` for the provenance evidence this design is built from.

## Purpose

`docs/ImportPipeline.md` converts a ship's **geometry export** (Authority 1) into a normalized port tree. That pipeline answers "what is concretely attached and materialized?" It cannot answer "what configuration points exist, including ones nothing is currently installed into?" — the geometry exporter itself drops that information (confirmed: `hardpoint_weapon_center`, Retaliator's `hardpoint_front_module`/`hardpoint_rear_module` are silently absent from `entity export --dump-hierarchy`'s own `loadout` output, despite being real DataCore entries — see ADR-014, Authority 1).

Import Pipeline v2 adds two new, independent extraction stages and one merge stage, without changing anything in Stages 1-6.

## Logical Flow

```text
Geometry Hierarchy Export  (existing, Stages 1-6)
         │
         ▼
  Physical Port Graph  (existing normalized output — Hardpoint[], Port[])
         │
         ├───────────────────────────┐
         ▼                           ▼
Default Loadout Configuration   AttachDef Tags / Swap Groups
   (Stage 7 — new)                  (Stage 8 — new)
         │                           │
         └─────────────┬─────────────┘
                        ▼
         Canonical Configurable Topology
                (Stage 9 — new, merge)
                        │
                        ▼
              Canonical Ship Import
         (existing normalized package, extended)
```

## Stage 7 — Default Loadout Configuration Extraction

**Responsibility:** read Authority 2 (`SEntityComponentDefaultLoadoutParams.loadout.entries[]`) for a ship's own entity class, and produce a flat list of **Configurable Slot** candidates — every entry whose `entityClassName` is empty and whose `entityClassReference` is non-null, regardless of whether the geometry exporter also produced a row for the same port.

**Authority:** DataCore, via `dcb query <exact entity class>` (the same per-entity mechanism `scripts/componentCatalog/dcbQuery.ts` already implements for the deprecated narrow-path M-007 generator — this stage revives that exact call shape for a new purpose, not a new query mechanism).

**Inputs:** one ship entity class (the same identifier Stage 2's envelope resolution already produces).

**Outputs:**
```ts
interface DefaultLoadoutConfigurationEntry {
  itemPortName: string            // e.g. "hardpoint_weapon_center"
  parentItemPortName: string | null   // recursive nesting, mirrors the raw entries[] shape
  factoryEntityClassName: string | null    // inline default, when present
  factoryEntityClassReference: string | null  // file:// reference, when the default has no inline class
  hasNestedEntries: boolean       // true when this entry's own loadout.entries is non-empty (i.e. Authority 1 would have captured it)
}
```

**Validation:**
- A port already present in the Physical Port Graph with a real `factoryItem` is cross-checked, never overwritten — this stage only ever *adds* ports the geometry graph is missing, keyed by `itemPortName`.
- An entry whose `entityClassReference` cannot be resolved to any known file path shape is recorded as a diagnostic (`configuration-reference-unresolvable`), never dropped silently and never treated as "not configurable."

**Diagnostics emitted:** `configuration-entry-found` (informational, one per new slot discovered), `configuration-reference-unresolvable`, `configuration-entry-conflicts-with-geometry` (the rare case where geometry and configuration disagree about whether a port has a factory item at all — surfaced for manual review, never auto-resolved).

## Stage 8 — Swap Group Resolution

**Responsibility:** build the tag-co-membership index described in `SwapGroupSpecification.md`, restricted to the entity classes actually referenced by Stage 7's output for this ship (never a blind full-catalog join per ship — the full-catalog tag index is built once, globally, and looked up per ship).

**Authority:** DataCore, via the existing bulk field-query mechanism (`scripts/universeCatalog/dcbBulkQuery.ts`), reading `EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Tags` — already proven at full-catalog scale (~29,108 entities, ~6 second query) during the ADR-014 investigation. No new query mechanism.

**Inputs:** the global swap-group tag index (built once per catalog generation run, not per ship) plus Stage 7's list of `factoryEntityClassReference` targets for this ship.

**Outputs:** see `SwapGroupSpecification.md`'s Canonical Configurable Slot Model — one `SwapGroup` record per distinct tag discovered among this ship's configurable slots' default items.

**Validation:** see `SwapGroupSpecification.md`'s own validation/conflict-detection rules (duplicate tags, unknown families, single-member groups).

**Diagnostics emitted:** `swap-group-resolved`, `swap-group-single-member` (a tag with exactly one member — technically not "swappable," surfaced for review, never treated as an error), `swap-group-unknown-family` (a referenced default item has no tag at all — the slot is real but its alternative set cannot be determined; degrades per ADR-014 Decision D4).

## Stage 9 — Merge into Canonical Configurable Topology

**Responsibility:** combine the existing Physical Port Graph, Stage 7's Configuration entries, and Stage 8's Swap Groups into one `ConfigurableTopology` structure attached to the ship's normalized package.

### Authority precedence

1. **Physical Port Graph (Authority 1) is authoritative for anything it actually contains.** If a port has a real, materialized factory item today, that value is never second-guessed by Stage 7/8 — those stages only ever *add* slots the geometry graph has no row for at all.
2. **Configuration Topology (Authority 2, Stage 7) is authoritative for slot *existence*.** A slot's presence, its port name, and its localized name (via the same `itemPort_*` localization key resolution already proven for `port_NameConfigurableSlot`) come only from here.
3. **Compatibility (Authority 3, Stage 8) is authoritative for the eligible-set only.** It never determines whether a slot exists, only what may fill it.

### Merge algorithm (informal)

```text
for each ship:
  ports := PhysicalPortGraph(ship)              # Stages 1-6, unchanged
  configEntries := Stage7(ship.entityClass)      # new
  for entry in configEntries:
    if entry.itemPortName in ports (by stable port id, not display name):
      # Already materialized — attach configuration metadata (localized
      # slot name, factory reference) to the EXISTING port row; never a
      # second, competing row for the same physical port.
      ports[entry.itemPortName].configuration := entry
    else:
      # Geometry graph never saw this port — synthesize a new,
      # non-structural ConfigurableSlot node (Stage 7's own explicit
      # output, never guessed), attached at the same parent the raw
      # entries[] recursion implies.
      ports.add(ConfigurableSlot.from(entry))
  for port in ports where port.configuration is set:
    port.swapGroup := Stage8.resolve(port.configuration.factoryEntityClassReference)
```

### Failure behavior

- A ship with no `SEntityComponentDefaultLoadoutParams` component at all (should not happen for a real vehicle, but not assumed impossible) produces zero Stage 7 output and the merge is a no-op — the ship's Physical Port Graph passes through completely unchanged. This is not a failure; it is the expected behavior for a hull with no configurable assemblies at all, or one not yet swept.
- A Stage 7 entry that cannot be matched to any port and cannot be resolved to a swap group is retained as a `ConfigurableSlot` with `eligibleComponents: []` and a diagnostic explaining why (D4, ADR-014) — never dropped, never silently merged into a sibling.

### Duplicate handling

Two Stage 7 entries with the same `itemPortName` (should not occur given DataCore's own uniqueness within one `entries[]` array, but the same port name is legitimately reused across *different* ships/mount families — e.g. every gimbal mount's gun sits at `hardpoint_class_2`) are scoped per-ship, never merged across ships. Within one ship, a genuine duplicate is a diagnostic (`configuration-duplicate-port-name`), not a silent last-write-wins.

### Missing references

An `entityClassReference` that does not resolve to any entity class Stage 8's tag index recognizes is recorded (`swap-group-unresolved-reference`) and the slot still exists in the output — with an empty eligible set — rather than being excluded from the topology entirely. A Commander should be able to see "this ship has a configurable slot here" even when SFM cannot yet tell them what goes in it.

## Runtime Adapter Interfaces (Objective 7)

Named per the Chief Architect's own suggested set. These are interface *specifications* — no implementation, no chosen language-level module boundaries beyond what's needed to state inputs/outputs/ownership unambiguously.

### `GeometryImporter`
- **Inputs:** a ship entity class; a `Data.p4k` path; a StarBreaker executable path.
- **Outputs:** the existing normalized `Port[]`/`Hardpoint[]` structures Stages 1-6 already produce. Unchanged by this design.
- **Ownership:** existing code (`src/normalizer`, `scripts/goldenFleet`) — not touched by this ADR.
- **Dependencies:** StarBreaker `entity export --dump-hierarchy`.

### `DefaultLoadoutImporter` (new — Stage 7)
- **Inputs:** a ship entity class; StarBreaker `dcb query` access.
- **Outputs:** `DefaultLoadoutConfigurationEntry[]` (shape above).
- **Ownership:** a new, isolated module — mirrors `scripts/componentCatalog/dcbQuery.ts`'s existing isolation from `src/normalizer` (per `docs/ImportPipeline.md` Stage 4's own established principle: the catalog-generation side stays decoupled from ship-normalization behavior).
- **Dependencies:** `GeometryImporter`'s output, for cross-checking only (never a hard dependency — Stage 7 can run standalone for diagnostics/certification).

### `SwapGroupResolver` (new — Stage 8)
- **Inputs:** the global tag index (built once via bulk query, cached); a set of entity class references to resolve for one ship.
- **Outputs:** `SwapGroup[]` (see `SwapGroupSpecification.md`).
- **Ownership:** a new, isolated module, generic over any ship — takes no ship-specific configuration.
- **Dependencies:** none beyond the bulk-tag-query mechanism already proven in `scripts/universeCatalog/dcbBulkQuery.ts`.

### `ModuleClassifier` (new)
- **Inputs:** a component's raw `AttachDef.Type`/`SubType`.
- **Outputs:** a canonical SFM category (extends `CATEGORY_TO_PORT_TYPE`) — see `ModuleTaxonomyProposal.md`.
- **Ownership:** extends the existing translation boundary (`src/generated/componentCatalog.ts`'s `CATEGORY_TO_PORT_TYPE`, per ADR-011's established principle of one translation boundary, never a caller-side special case).
- **Dependencies:** none — a pure lookup extension.

### `CanonicalTopologyBuilder` (new — Stage 9)
- **Inputs:** `GeometryImporter` output, `DefaultLoadoutImporter` output, `SwapGroupResolver` output, `ModuleClassifier`.
- **Outputs:** the merged `ConfigurableTopology` structure (per Stage 9's algorithm above), attached to the existing normalized ship package.
- **Ownership:** a new orchestration module — the only stage permitted to know about all four other components; none of the others depend on it.
- **Dependencies:** all four stages above.

## Non-Goals

No code in this document is intended for direct implementation without further review — signatures here are illustrative of shape and responsibility, not a final API contract. No change to Stages 1-6 of the existing pipeline. No catalog generation script changes authorized by this document alone.
