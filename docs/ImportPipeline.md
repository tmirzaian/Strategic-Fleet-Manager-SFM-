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
- real AEGS Avenger Titan fixture
- equivalence cases where both formats represent the same equipment
- malformed-node recovery
- missing entity envelope
- missing metadata
- absent fixture detection

### Real fixture provenance (Mission M-011A)

Both `raw-data/AEGS Gladius.json` and `raw-data/AEGS Avenger Titan.json`
are real exports from the frozen LIVE 4.8.184.64329 install, produced
with:

```
starbreaker.exe entity export "<entity class>" "raw-data/<Ship Name>.json" --p4k "<Data.p4k path>" --dump-hierarchy
```

For the Avenger Titan specifically: the exact base-ship entity class was
confirmed via `dcb query` before export (`EntityClassDefinition.AEGS_Avenger_Titan`,
distinct from `_Renegade`/`_AI_Template`/`_PU_AI_*` variants also present
in DataCore) —

```
starbreaker.exe dcb query "EntityClassDefinition" --p4k "<Data.p4k path>" --filter "*AEGS_Avenger*"
```

— then exported with:

```
starbreaker.exe entity export "AEGS_Avenger_Titan" "raw-data/AEGS Avenger Titan.json" --p4k "<Data.p4k path>" --dump-hierarchy
```

Both fixtures use the identical `root`/`root_nmc`/`loadout`/`interiors`
envelope. Neither is hand-authored, and neither was edited after export.
`npm run generate:component-catalog` was re-run afterward so the local
Component Metadata Catalog covers both fixtures' entity classes together
(82 distinct entities collected across both files, all 82 resolved, 0
unresolved).

**Synthetic-only scenarios deliberately kept out of the real fixtures:**
missing size/allowedTypes constraints, a Cargo-classified port, and
specific exclusion examples are covered by dedicated hand-built fixtures
in `shipNormalizer.test.ts`/`validation.test.ts`, not forced into either
real ship export. (The real Avenger Titan does have a real `CargoGrid`
entity, `AEGS_Avenger_CargoGrid_Titan` — it stays unclassified today
because the classification translation table has no `CargoGrid` rule
yet, the same honest "no rule, no guess" outcome as `Armor` — not
because anything was suppressed to avoid it appearing.)

## Stage 4c — Equipment relationship resolution (Mission M-010)

`src/normalizer/equipmentRelationship.ts` + the refactored `src/normalizer/equipmentResolver.ts`.

**Root cause this stage fixes:** `equipmentResolver.ts` previously treated "this port has children" as the *only* signal that a port is a mount/rack container whose own factory item is incidental (mount hardware), with the real resolved item coming from its leaf descendants. That is correct for a weapon mount hosting a gun and a missile rack hosting missiles, but wrong for a `QuantumDrive` port hosting a nested `JumpDrive` port — DataCore nests the jump-drive entity under the quantum-drive entity in the raw export, but both are independently real, separately-named ship equipment, not a mount-and-its-cargo relationship. Unconditional leaf-collapsing showed the Jump Drive's item ("Explorer") where the Quantum Drive's own item ("Beacon") belonged.

**The fix:** `Port` now carries `canonicalPortType` (the exact string `classifyPort()` was given — a legacy export's verified `portType`, or Stage 4b's translated value) forward from `shipNormalizer.ts`. `classifyPortRelationship(canonicalPortType)` decides, from that string alone — never a name — whether a port-with-children is:

- **`container`** — `WeaponTurret`, `GimbalMount`, `Turret`, `MissileRack`. Unchanged behavior: collapses every descendant leaf into one assignment (mount+gun, rack+missiles).
- **`independent`** — everything else (`QuantumDrive`, `JumpDrive`, `PowerPlant`, `Shield`, `Cooler`, `Missile`, `WeaponGun`, `Radar`, `LifeSupport`, `Avionics`, `Relay`, `Bomb`, ...). The port's own item is its own assignment; each direct child is resolved as its own separate assignment root (recursively), never collapsed into its parent's row.
- **`unresolved`** — no canonical port type recorded (shouldn't happen in practice); treated the same as `independent` — preserving a port's own item is the safe default, collapsing it away is not.

**Result:** Quantum Drive now resolves to `QDRV_WETK_S01_Beacon_SCItem` ("Beacon"), and Jump Drive appears as its own, separate, correctly-resolved equipment row (`JDRV_TARS_S01_Explorer_SCItem`, "Explorer") — both real, both visible, neither invented nor hidden.

## Golden fixture reconciliation (Mission M-010)

`goldenFixture.ts` has been reconciled against the authoritative LIVE 4.8 result (real `raw-data/AEGS Gladius.json`, the generated Component Metadata Catalog, and the now-corrected classification/equipment-resolution pipeline). Every change below is verified against that real data, not invented:

| Row | Previous (Sprint 1.3F, hand-authored) | Authoritative replacement | Evidence | Kind |
|---|---|---|---|---|
| Nose Weapon | `CF-337 Panther Repeater` | `GATS BallisticGatling S3` | real catalog entity `GATS_BallisticGatling_S3`, category `WeaponGun`/`Gun` | factual |
| Left/Right Wing Weapon | `CF-337 Panther Repeater` | `KLWE LaserRepeater S3` | real catalog entity `KLWE_LaserRepeater_S3` (a laser, not ballistic) mounted at both wings | factual |
| Power Plant | `Regulus` | `POWR AEGS S01 Regulus SCItem` | same real component (`POWR_AEGS_S01_Regulus_SCItem`); only the display string differs | display-only |
| Left/Right Cooler | `Bracer` | `COOL AEGS S01 Bracer SCItem` | same real component (`COOL_AEGS_S01_Bracer_SCItem`) | display-only |
| Left/Right Shield Generator | `AllStop` | `SHLD GODI S01 AllStop SCItem` | same real component (`SHLD_GODI_S01_AllStop_SCItem`) | display-only |
| Quantum Drive | `Beacon` | `QDRV WETK S01 Beacon SCItem` | same real component; **also the structural fix** — before Mission M-010 this row incorrectly resolved to the nested Jump Drive's item instead | display-only naming, but validates a structural fix |
| Jump Drive *(new row)* | — did not exist | `JDRV TARS S01 Explorer SCItem` | real nested `JDRV_TARS_S01_Explorer_SCItem`, now independently represented | structural (new row) |
| Left/Right Inner Missile Rack | displayName `"...Missile Rack"`, size 2-2, `Tempest Missile` | displayName `"...Wing Missile Rack"`, size 3-3, `MISL S03 CS FSKI Arrester`, single-slot rack (`MRCK_S03_BEHR_Single_S03`) | real raw port names include "wing"; real rack is a single-slot, size-3 rack carrying the Arrester missile | factual + display |
| Left/Right Outer Missile Rack | displayName `"...Missile Rack"`, `Tempest Missile` / one deliberately `MIXED` | displayName `"...Wing Missile Rack"`, `MISL S02 IR FSKI Ignite`, dual-slot rack (`MRCK_S03_BEHR_Dual_S02`), **uniformly loaded, never mixed** | real rack has two Ignite missiles, not a mixed loadout — the old fixture's mixed-rack scenario was invented, not observed | factual + structural (removes an invented scenario) |

The full comparison now runs 14/14 (13 original rows plus the new Jump Drive row) with zero failures.

## Current known gaps

1. ~~Real StarBreaker nodes contain no direct classification fields.~~ Resolved by Mission M-009.
2. ~~Quantum Drive/Jump Drive parent-child equipment resolution collapsed to the wrong item.~~ Resolved by Mission M-010.
3. ~~Golden fixture disagreed with authoritative DataCore-derived results.~~ Reconciled by Mission M-010 (table above).
4. ~~`raw-data/AEGS Avenger Titan.json` is referenced by tests but absent.~~ Restored by Mission M-011A as a real StarBreaker export (see "Real fixture provenance" above) — all 508 tests pass, 0 failures.
5. `Armor` and `CargoGrid` (and any other unrecognized category) have no translation rule (deliberate — see Stage 4b; `CargoGrid` newly confirmed absent by the real Avenger Titan fixture, which has a real cargo grid entity that stays honestly unclassified).
6. Component `displayName` is not prettified for catalog-derived components (`displayNameGenerator.ts`'s heuristics were built for port internal names, not entity class names) — a documented display-only limitation, deliberately not addressed through Mission M-011A (out of scope: "do not solve general localization or display-name prettification").
