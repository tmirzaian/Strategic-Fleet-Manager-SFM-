# Strategic Fleet Manager — Import Pipeline

## Purpose

The import pipeline converts exporter-specific Star Citizen data into stable SFM domain records.

## Pipeline

```text
JSON document
   |
   v
RawShipExport parsing
   |
   v
Envelope resolution
   |
   v
Loadout-node adaptation
   |
   v
Canonical loadout tree
   |
   v
Component metadata resolution
   |
   v
Port classification and constraints
   |
   v
Normalized ship package
   |
   v
Validation and certification
```

## Stage 1 — Raw parsing

Raw TypeScript types describe external formats accurately. Separate external schemas should use separate types or discriminated unions rather than one oversized interface with loosely optional fields.

## Stage 2 — Envelope resolution

Supported forms:

```ts
doc.entity
```

and:

```ts
doc.root.entity
```

The resolver strips the `EntityClassDefinition.` prefix from either source to preserve stable ship identifiers.

Failure condition:

- neither envelope contains a usable entity class

## Stage 3 — Loadout-node adaptation

Legacy nodes combine the port and installed component:

```ts
{
  itemPortName,
  portType,
  factoryComponent,
  children
}
```

StarBreaker nodes represent mounted entity hierarchy:

```ts
{
  entity,
  port,
  parent,
  children
}
```

The adapter maps only facts supported by the source:

- `port` -> canonical `itemPortName`
- `entity` -> canonical `factoryComponent.internalName`

Missing classification and constraint fields remain undefined.

Malformed nodes without a usable port identifier are dropped with a warning. Valid children are promoted so recoverable data is not lost.

## Stage 4 — Component metadata resolution

This stage is required for new StarBreaker data.

### Prerequisite: the Component Catalog Generator (Mission M-007)

Before a `ComponentMetadataResolver` can be built, it needs an authoritative,
exact-key-matched data source to resolve against. `scripts/generateComponentCatalog.ts`
(`npm run generate:component-catalog`) is a standalone, offline tool that
produces exactly that source as `generated-data/component-metadata-catalog.json`
— it does **not** implement the resolver itself, and nothing in `src/`
reads from it yet.

- **Authoritative source:** the installed StarBreaker executable's
  `dcb query` subcommand, run against a local Star Citizen `Data.p4k`
  (LIVE channel only — see below).
- **Exact-key policy:** every lookup filters DataCore by the full record
  name (`EntityClassDefinition.<entityClass>`), never a bare or wildcard
  substring — a bare substring match returns unrelated collisions (other
  ships' manufacturer-prefixed variants, environment/ground-vehicle
  variants) that would silently corrupt a catalog entry.
- **Bounded entity set:** rather than bulk-exporting every
  `EntityClassDefinition` record in the game, the generator walks every
  `raw-data/*.json` fixture (resolving both entity envelopes and both
  legacy/StarBreaker loadout-node shapes, via its own isolated
  `scripts/componentCatalog/rawEntityCollector.ts` — not
  `src/normalizer`) and queries only the entity classes SFM has actually
  observed. This keeps the catalog reproducible and scoped to real need;
  bulk generation remains a possible future path if source inspection
  ever shows it's safe and useful.
- **Local-only generation posture:** the catalog is generated per-developer
  from their own licensed game install and is `.gitignore`d
  (`generated-data/component-metadata-catalog.json`) — it is not
  committed to the repository. Whether derived DataCore facts may ever be
  redistributed via the repo is an open licensing question (see
  ADR-003) that has **not** been resolved; this generator does not
  presume an answer.
- **Patch cadence / staleness:** every catalog records the exact game
  build it was generated against (`branch`, `version`,
  `p4ChangeNum`, read live from `build_manifest.id` — never
  hard-coded) plus a generation timestamp. `compareCatalogFreshness()`
  (`scripts/componentCatalog/buildManifest.ts`) can compare a catalog's
  recorded build against the currently installed one and report
  `current` / `stale` / `unverifiable` — CIG patches routinely rebalance
  item stats, so a catalog is only trustworthy for the build it was
  generated against. This function is unit-tested but **not yet wired
  into anything** — no automatic staleness check runs today.
- **LIVE-only support:** only the LIVE channel install is supported by
  this generator today. PTU/EPTU are not part of the normal workflow —
  there's no PTU install on the machine this was built against, and nothing
  here special-cases a PTU/EPTU branch name.

Input:

- exact mounted entity class
- canonical node
- optional embedded legacy metadata

Output should be an explicit result:

```ts
type MetadataResolution =
  | {
      status: "resolved";
      metadata: ComponentMetadata;
      provenance: MetadataProvenance;
    }
  | {
      status: "unresolved";
      entityClass: string;
      reason: string;
    };
```

Resolution must be based on authoritative imported data keyed by exact entity class.

Prohibited behavior:

- certifying data from name-pattern guesses
- silently assigning default port types
- inventing size constraints
- treating every geometry child as configurable equipment

## Stage 4b — Classification Translation (Mission M-009)

`src/normalizer/classificationTranslator.ts` + `src/normalizer/classificationEnrichment.ts`, inserted between metadata enrichment and `classifyPort()`:

```
Canonical Nodes
  → Component Metadata Resolver
  → Metadata Enrichment
  → Classification Translation   (new)
  → classifyPort()
  → Normalized Ship Package
```

**Why this stage exists:** `classifyPort()` only ever reads `node.portType`, and a StarBreaker-schema node never has one (see Stage 3) — Metadata Enrichment fills in `category`/`subtype`/`size`/`grade` but deliberately does not touch `portType` (that would be exactly the untranslated-taxonomy problem this stage exists to solve correctly). Without this stage, every real StarBreaker fixture certifies to zero classified ports, as every mission through M-008 documented.

**DataCore taxonomy remains source truth.** `classificationTranslator.ts` never rewrites a catalog record's `category`/`subtype` — it only ever produces a *separate*, additional `canonicalPortType` string for `classifyPort()` to consume. `portClassifier.ts` remains the sole authority over which canonical port types map to which `EquipmentGroup`.

**Exact mapping policy — every rule is an exact (category, subtype) pair, or an exact category alone when no subtype was specified.** No substring, prefix, or case-insensitive matching anywhere. The initial table (verified against the real catalog and against `portClassifier.ts`'s existing `INCLUDED_TYPE_TO_GROUP` before being written):

| DataCore category | DataCore subtype | Canonical port type | Note |
|---|---|---|---|
| `WeaponGun` | `Gun` | `WeaponGun` | exact existing spelling |
| `Shield` | `UNDEFINED` | `Shield` | exact existing spelling |
| `Cooler` | `UNDEFINED` | `Cooler` | exact existing spelling |
| `PowerPlant` | `Power` | `PowerPlant` | exact existing spelling |
| `QuantumDrive` | `UNDEFINED` | `QuantumDrive` | exact existing spelling |
| `JumpDrive` | `UNDEFINED` | `JumpDrive` | **new** — see below |
| `MissileLauncher` | `MissileRack` | `MissileRack` | targets the *existing* `MissileRack` spelling, not `MissileLauncher` — see deviation note below |
| `Missile` | `Missile` | `Missile` | exact existing spelling |
| `Radar` | (any) | `Radar` | exact existing spelling |
| `LifeSupportGenerator` | (any) | `LifeSupport` | DataCore's real spelling differs from the existing `LifeSupport` type |
| `Computer` | (any) | `Avionics` | closest existing analog; **dormant** — the one real "computer" entity (`COMP_BEHR_S01_CSR-RP`) has DataCore category `Misc`, which correctly stays unresolved |
| `Relay` | (any) | `Relay` | exact existing spelling |
| `Turret` | `GunTurret` | `WeaponTurret` **or** `Turret` | structural rule — see Mount_Gimbal_S3 below |
| `WeaponAttachment` | (any) | — *excluded* | internal weapon subassembly, not equipment |
| `Armor` | — | — *unresolved* | no existing SFM destination — see below |

**Two deliberate deviations from illustrative names, both because an exact existing `portClassifier.ts` spelling took precedence:** `MissileLauncher`/`MissileRack` targets the pre-existing `MissileRack` canonical type (not a new `MissileLauncher` spelling), and `LifeSupportGenerator` targets the pre-existing `LifeSupport` spelling.

**The one new canonical port type this mission adds:** `JumpDrive`, folded into the *existing* `QuantumDrive` equipment group in `portClassifier.ts` (not a new group) — DataCore models jump drives as a distinct entity type nested under a quantum drive (`JDRV_TARS_S01_Explorer_SCItem` under `QDRV_WETK_S01_Beacon_SCItem` in the real Gladius fixture), and the mission's own nested-equipment-handling instruction ("do not exclude JumpDrive... merely because it is a child node") made clear it should classify, not just avoid wrongful exclusion.

**`Armor` is deliberately left unresolved**, unlike `JumpDrive`. DataCore's `Armor` category (confirmed via `ARMR_AEGS_Gladius`) has no natural pairing with any existing `EquipmentGroup` the way `JumpDrive` pairs with `QuantumDrive` — inventing a new group is a product-surfacing decision (it would add a new UI section) beyond a translation mission's scope. Left `unresolved` with that exact reasoning, for a future mission to decide explicitly.

**The Mount_Gimbal_S3 decision.** DataCore categorizes every Gladius gimbal weapon mount as `Turret`/`GunTurret` — identical to how it would categorize a genuinely crewed/remote turret, and `portClassifier.ts` already treats `Turret` as mapping to the "Defense" group, not "Weapons". Blindly translating `Turret` → the existing `Turret` type would misroute every Gladius weapon mount into Defense. The catalog schema has no field distinguishing "fixed gimbal" from "crewed turret" directly, and the mission explicitly forbids resolving this from the entity name `Mount_Gimbal_S3` or from any string contains/startsWith logic. The verified, structural fact that *is* available: every `Turret`-categorized mount in the real fixture has a direct child whose own resolved DataCore category is `WeaponGun` — obtained via the same exact-key resolver used everywhere else, not from any name. When that holds, the mount translates to the existing `WeaponTurret` canonical type (already mapped to "Weapons"); when it doesn't, it keeps the existing `Turret` → "Defense" translation, unchanged. This is Option A from the mission's decision menu — a choice between two pre-existing spellings using verified tree structure, not an invented one.

**Inclusion/exclusion policy:** `WeaponAttachment` (any subtype — `Barrel`, `FiringMechanism`, `PowerArray`, `Ventilation` all confirmed in the real catalog) is excluded by *category*, not by depth or by enumerating every subtype — a node several levels deep that resolves to `Missile`/`MissileLauncher`/`JumpDrive`/`WeaponGun` is never excluded just because it's nested.

**Unresolved behavior:** an unrecognized category, a recognized category with an unsupported subtype, and `Armor` all return `unresolved`, distinct from `excluded` (a deliberate non-equipment decision) — both leave `node.portType` unset and record a warning (`classification-unresolved` vs `classification-excluded`), and normalization continues either way. A node's own already-verified legacy `portType` is never overwritten by a translation.

**A side effect this stage exposed, fixed as a minimal, non-classification port-ID scoping bug:** `shipNormalizer.ts` previously derived a port's id from its bare `itemPortName` alone. StarBreaker's raw export reuses generic, mount-local child port names (every gimbal mount's gun sits at `hardpoint_class_2`; every missile rack's slots at `missile_01_attach`/`missile_02_attach`) across otherwise-unrelated sibling subtrees — invisible until this stage started including those nodes as real ports at all. Port ids now derive from the full ancestor path instead of the bare leaf name.

## Stage 5 — Classification

Existing port classifiers and constraint builders operate only after canonical adaptation, metadata enrichment, and classification translation.

Unknown nodes must continue to fail safe.

## Stage 6 — Validation

Validation should report:

- malformed raw nodes
- unresolved entity classes
- missing authoritative metadata
- duplicate stable IDs
- unsupported categories
- excluded geometry/internal entities
- fixture or catalog inconsistencies

## Certification fixtures

Certification should include:

- synthetic legacy fixture
- synthetic StarBreaker fixture
- real AEGS Gladius fixture
- equivalence cases where both formats represent the same equipment
- malformed-node recovery
- missing entity envelope
- missing metadata
- absent fixture detection

## Current known gaps

1. ~~Real StarBreaker nodes contain no direct classification fields.~~ Resolved by Mission M-009's classification translation layer — the real Gladius fixture now certifies to 26 classified ports across 9 equipment groups with zero validation errors.
2. `raw-data/AEGS Avenger Titan.json` is referenced by tests but absent (unchanged, pre-existing — not a classification concern).
3. `Armor` and unrecognized categories have no translation rule (deliberate — see Stage 4b).
4. **Golden fixture reconciliation needed.** The authoritative DataCore-derived result differs from several Sprint 1.3F hand-authored `goldenFixture.ts` expectations:
   - Component identities differ entirely (e.g. the old fixture invented `CF-337 Panther Repeater`/`Regulus`/`Bracer`/`AllStop`/`Beacon`; real DataCore names are `GATS_BallisticGatling_S3` (nose) / `KLWE_LaserRepeater_S3` (both wings) / `POWR_AEGS_S01_Regulus_SCItem` / `COOL_AEGS_S01_Bracer_SCItem` / `SHLD_GODI_S01_AllStop_SCItem`).
   - Component `displayName` is not prettified for catalog-derived components — `displayNameGenerator.ts`'s heuristics were built for port internal names (`hardpoint_...`), not entity class names, so a catalog component with no legacy `displayName` renders as e.g. `"POWR AEGS S01 Regulus SCItem"`. Not addressed by this mission (out of scope for classification translation); flagged for a future mission.
   - **A real mapping problem, not just a naming difference:** the "Quantum Drive" equipment assignment resolves to the nested jump drive (`JDRV_TARS_S01_Explorer_SCItem`, "Explorer") rather than the quantum drive itself (`QDRV_WETK_S01_Beacon_SCItem`, "Beacon"), because `equipmentResolver.ts`'s existing leaf-collapsing logic (built for mount+gun and rack+missiles, where the parent has no item of its own) shows the leaf child's resolved item for *any* parent/child pair — including this one, where both levels are independently real, separately-named equipment. Not fixed here (out of scope for a translation-focused mission); needs a future mission's attention.
   - The real fixture's missile racks are **uniformly loaded** (no mixed-type rack), unlike the old golden fixture's deliberately-invented mixed-rack scenario (`Right Outer Missile Rack` → `MIXED`) — real inner racks are size-3 `MRCK_S03_BEHR_Dual_S02` racks carrying `MISL_S03_CS_FSKI_Arrester`, real outer racks are size-2 racks carrying `MISL_S02_IR_FSKI_Ignite`, uniformly.
   - Generated missile-rack display names include an extra "Wing" token (e.g. `"Left Inner Wing Missile Rack"`) that the old fixture's hand-typed labels didn't anticipate, so `compareToGoldenFixture`'s displayName-based lookup fails to find a match at all for these rows (not "wrong value", but "no row found under that exact label").

   None of this was force-passed. `goldenFixture.ts` was **not modified** by Mission M-009 — deciding whether to update it (and to keep, replace, or design new mixed-loadout test coverage) is an explicit product/test-design decision for a future mission, not something to resolve unilaterally inside a translation-layer change.
