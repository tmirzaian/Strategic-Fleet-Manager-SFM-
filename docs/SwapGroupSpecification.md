# Swap Group Specification (Configurable Slot Runtime Model)

> **Status: design only.** Companion to `docs/ADR/ADR-014-Configurable-Slot-Architecture.md` (evidence) and `docs/ImportPipeline-v2.md` (where this model is produced — Stages 7-9). No implementation authorized.

## Purpose

Define the canonical runtime model for a Configurable Slot and the algorithm that resolves its eligible-component set from `AttachDef.Tags` (Authority 3). This is the shape a future `SwapGroupResolver` (see `ImportPipeline-v2.md`) must produce, and the shape a future UI would consume — no UI is authorized or designed here.

## Canonical Configurable Slot Model

```ts
interface ConfigurableSlot {
  /** Stable identity for this slot, scoped to one ship entity class —
   * never a display name. Derived from the port's own itemPortName,
   * exactly like every other SFM port id today. */
  portName: string                     // e.g. "hardpoint_weapon_center"

  /** Resolved via the same itemPort_* localization namespace confirmed
   * live (`port_NameConfigurableSlot` = "Configurable Slot"). Null when
   * no localization key resolves — never fabricated from portName. */
  localizedSlotName: string | null

  /** The real DataCore entity class currently the factory default for
   * this slot, when Stage 7 found an inline entityClassName, OR the
   * entity class the entityClassReference resolves to. Null only when
   * genuinely unresolvable (diagnostic recorded). */
  defaultComponentEntityClass: string | null

  /** The swap-group tag this slot's default component carries (Authority
   * 3), e.g. "$ANVL_Hornet_Mk2_Center". Null when the default component
   * has no tag at all — see "Unknown-family behavior" below. */
  swapGroupId: string | null

  /** Every entity class sharing swapGroupId, INCLUDING the default —
   * never excludes the current default from its own eligible set. Empty
   * when swapGroupId is null, or when swapGroupId resolved to exactly
   * one member (see Duplicate/single-member handling). */
  eligibleComponents: string[]

  /** The entity class actually installed right now, per the existing
   * Physical Port Graph (Authority 1) — independent of
   * defaultComponentEntityClass, which describes the FACTORY default,
   * not the Commander's current state. Null for an empty slot. */
  currentInstalledEntityClass: string | null

  /** Which authority produced this record, for diagnostics/debugging —
   * never surfaced as Commander-facing text. */
  sourceAuthority: 'geometry-and-configuration' | 'configuration-only'

  /** See Confidence Model below. */
  confidence: 'confirmed-bidirectional' | 'tag-co-membership' | 'unresolved'

  /** Every diagnostic emitted while resolving this exact slot — never
   * cleared on success, since a low-confidence resolution deserves a
   * visible trail even when it "worked." */
  diagnostics: SlotDiagnostic[]
}

interface SlotDiagnostic {
  code: string          // e.g. "swap-group-single-member", "swap-group-unknown-family"
  message: string       // human-readable, engineering-facing (not Commander-facing copy)
  severity: 'info' | 'warning'
}
```

### Ownership and lifecycle

- **Created:** once per ship, during Stage 9 of Import Pipeline v2 (`CanonicalTopologyBuilder`), from Stage 7 (existence) and Stage 8 (eligible set) output.
- **Never mutated at runtime by UI interaction.** Exactly like every other canonical port fact in this app, a `ConfigurableSlot`'s `eligibleComponents`/`swapGroupId`/`confidence` are import-time, catalog-generation-time facts — a Commander's target selection changes `currentInstalledEntityClass`-adjacent state (via the existing `Hardpoint.targetItem` mechanism), never the slot definition itself.
- **Regenerated on catalog regeneration**, exactly like every other generated-data artifact (`npm run generate:component-catalog`-class tooling) — never hand-edited, never persisted as a Commander-owned record.
- **Confidence and diagnostics travel with the slot permanently** — a Commander-facing surface (out of scope here) would be expected to visibly distinguish a `confirmed-bidirectional` slot from a `tag-co-membership` one, not silently present both with equal certainty.

## Confidence Model

| Value | Meaning | Confirmed to occur in current data? |
|---|---|---|
| `confirmed-bidirectional` | Both a port-side declaration (`RequiredPortTags` or equivalent) AND component-side tag co-membership agree | Not yet observed — no populated port-side declaration was found during the ADR-014 investigation (see Risk R-001/R-003) |
| `tag-co-membership` | Component-side tag co-membership only — the mechanism actually proven live for every example in ADR-014 | Yes — every confirmed swap group in ADR-014 is this tier |
| `unresolved` | A real Configurable Slot exists (Authority 2 confirms it) but no swap-group tag was found on its default component | Occurs whenever a slot's default item has no `$`-prefixed (or otherwise shared) tag — a real, expected outcome, not an error |

This tiering exists specifically so that if a future investigation (see ADR-014's Open Investigations) locates a genuine port-side declaration, the model does not need to change shape — only the `confidence` value for already-modeled slots would be promoted.

## Swap Group Resolution Algorithm

**Starting point:** `AttachDef.Tags`, bulk-queried once per catalog generation run across the full entity universe — the exact mechanism already proven in the ADR-014 investigation (`runBulkFieldQuery(exe, p4k, 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Tags')`, confirmed to return ~29,108 entities in ~6 seconds).

### 1. Discovery

For every entity in the bulk tag result, split `Tags` on whitespace into individual tokens. A token is a **swap-group candidate** if:
- it is non-empty, and
- (heuristic, see below) it looks like a family identifier rather than a generic descriptor.

**Explicit non-heuristic requirement:** discovery does not attempt to algorithmically distinguish a "family" tag from an ordinary descriptive tag (`flightReady`, `weaponMountUsable`, a manufacturer code) by pattern alone — that would be exactly the "infer from naming" approach every phase of this investigation was explicitly instructed to avoid. Instead:

### 2. Grouping

Build a `Map<tag, entityClass[]>` over **every** token seen, with no filtering at discovery time. A tag naturally used by only one entity (e.g. a manufacturer code shared by hundreds of entities, which is a real, common, non-swap-group case) is structurally indistinguishable from a genuine 2-4-member swap-group tag at this stage — grouping alone cannot tell them apart.

### 3. Normalization

No case-folding, no stripping of the `$` prefix, no synonym resolution. The tag is used verbatim as `swapGroupId`. The `$`-prefix *observation* (Risk R-002) is documented, not encoded as a normalization rule, specifically because it is not proven to be a universal CIG convention — treating it as load-bearing (e.g. "only `$`-prefixed tags are real groups") would silently exclude the confirmed real `ANVL_Hornet_Center` group (no `$` prefix) from the very evidence base this spec is built on.

### 4. The actual filter: cardinality + cross-reference against Authority 2

A tag becomes a **relevant** swap group only when:
1. It is the tag carried by a `defaultComponentEntityClass` that Stage 7 (Configuration Topology) already identified as a real Configurable Slot's factory default, **and**
2. At least one other entity in the global tag map shares that exact tag.

This is the actual, provable filter used throughout ADR-014: never "does this tag look important," always "is this the tag on a confirmed slot's own default item." A tag that happens to be shared by unrelated entities but is never a slot's own default is irrelevant to any specific ship's configurable topology and is never surfaced.

### 5. Lookup

Per ship, per confirmed Configurable Slot (from Stage 7): look up `defaultComponentEntityClass`'s tags in the global map (built once), take the relevant tag (step 4), and its full member list becomes `eligibleComponents`.

### 6. Caching

The global tag map (all ~29,108 entities × their tag lists) is built **once per catalog generation run**, not once per ship — identical in spirit to how `generateComponentCatalog.ts` already runs its bulk field queries once and resolves every entity/ship against the shared in-memory result (see `docs/ImportPipeline.md`'s Mission M-012/FTB-001F Part C notes on this exact pattern). No implementation may re-query per ship.

### 7. Validation

- **Every `eligibleComponents` entry must itself resolve to a real, currently-cataloged entity class** (cross-checked against the existing component catalog, exactly like every other entityClass reference in this app) — an entity that shares a tag but has since been removed from the live catalog is excluded from the eligible set and recorded as a diagnostic, not silently included as a dead reference.
- **The slot's own current default must always be a member of its own eligible set** — if it isn't (a genuine data anomaly), this is a hard validation failure for that specific slot (`confidence: 'unresolved'`, diagnostic `swap-group-default-not-self-member`), never silently corrected.

### 8. Conflict detection

Two different Configurable Slots on the **same ship** whose default components carry the **same** tag is not itself a conflict (a ship could plausibly have two independent slots drawing from the same family, though none was observed in the investigated sample) — but is logged (`swap-group-shared-across-slots`) for engineering visibility, since it was never observed and would warrant manual confirmation before being trusted.

### 9. Duplicate handling

If the same entity class appears more than once in a tag's member list (should not happen given DataCore's own record uniqueness, but not assumed impossible), it is deduplicated by entity class, never by display name — consistent with every other identity rule in this app (`resolveComponentByName`'s own ambiguity-aware, entityClass-first design, ADR-010/EWO-STAB-004A).

### 10. Single-member handling

A tag with exactly one member (the default component itself, no alternatives found) resolves to `eligibleComponents: [thatOneEntity]`, `confidence: 'tag-co-membership'`, with an `info`-level diagnostic (`swap-group-single-member`) — not an error, not `unresolved` (the slot and its tag are both real; there simply is no alternative captured in current data, which may itself be accurate — not every configurable mount necessarily has more than one real option shipped yet).

### 11. Unknown-family behavior

A confirmed Configurable Slot (Authority 2 says it's real) whose default component's `AttachDef.Tags` contains no candidate tag at all resolves to `swapGroupId: null`, `eligibleComponents: []`, `confidence: 'unresolved'`, diagnostic `swap-group-unknown-family` — per ADR-014 Decision D4, this is always surfaced as an honestly-empty slot, never hidden and never silently widened to "every Size/Type-compatible catalog item" (which would reintroduce the exact over-broad-compatibility problem this whole investigation exists to prevent).
