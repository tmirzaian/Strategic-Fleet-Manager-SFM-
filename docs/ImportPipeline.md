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

### Deep-import roster expansion (EWO-019)

A controlled 5-ship proof group certified the pipeline against real DataCore/`Data.p4k` source data beyond the original Gladius/Avenger Titan pair: **Aegis Eclipse**, **Drake Corsair**, and **Drake Cutlass Black**, chosen for structural diversity (Eclipse: nested weapon mount + torpedo rack + nested jump drive; Corsair: multi-crew, nested turrets, dual-slot missile racks, max port depth 4; Cutlass Black: manned turret, max port depth 8). All five ships: 0 normalization errors, Gladius's golden fixture unchanged (14/14), determinism confirmed byte-for-byte across two full pipeline runs.

**Trailing-comma tolerance (general-purpose importer fix):** the `starbreaker.exe` build used for this proof group's `--dump-hierarchy` exports emits a trailing comma after the last element of every array/object it writes — JSON5-legal, not strict JSON. `StarBreakerImporter.read()` (`src/engine/importer/starBreakerImporter.ts`) now retries once with `stripTrailingCommas()` (`src/engine/importer/trailingCommaJson.ts`, string/escape-aware so it never touches a comma inside a string value) if strict `JSON.parse` fails, before giving up. This only ever runs on the already-failing path, so an export that already parses cleanly (Gladius, Avenger Titan) is untouched.

**Deep-import identity aliasing (Task 7/8 — see [ADR-006](ADR/ADR-006-Deep-Import-Identity-Aliasing.md)):** `Ship.sourceEntityClass` now carries the canonical raw entity class (e.g. `AEGS_Eclipse`) through to `generated-data/ships.json`. `src/data/shipDefinitions.ts` derives `DEEP_IMPORTED_ENTITY_CLASSES` from this field (previously hand-maintained) and aliases each deep-imported `ShipDefinition`/factory template under both its generated id (`eclipse-imported`) and its canonical entity class (`AEGS_Eclipse`) — so a `FleetAsset` persisted while its ship was still catalog-only self-heals to real port/factory data on its next rehydration replay, with no change to the persisted record and no duplicate Add Ship entry.

### Port hierarchy grouping and a known mount-orphaning gap (EWO-019B)

A sixth ship, **Anvil Valkyrie**, was added to validate presentation-layer hierarchy work against a genuinely complex multi-turret vessel (8 top-level weapon-family ports: fixed pilot guns, two wing remote turrets, a top manned turret, a bottom "bubble" manned turret, two door gunner positions).

Inspecting `generated-data/ports.json` directly across all six ships surfaced a real, pre-existing normalization characteristic: **a mount-level port sometimes fails to survive as its own row, leaving only its child leaf port as an orphaned top-level entry** (`parentPortId: null`) with no way to recover the mount's own position label. Confirmed via side-by-side comparison:

- **Gladius**: every weapon mount (`hardpoint_gun_nose`, canonicalPortType `WeaponTurret`) survives as its own port, correctly linking to its child gun (`parentPortId` populated, child row's `parentPortId` matches). Quantum Drive same story (`hardpoint_quantum_drive` survives with a real `childPortIds` entry for `hardpoint_jump_drive`).
- **Eclipse**: the equivalent weapon mounts (`hardpoint_weapon_left`/`_right`, entity `Mount_Gimbal_S2`) and the Quantum Drive mount (`hardpoint_quantum_drive`, entity `QDRV_RACO_S01_Drift_SCItem`) do **not** survive as their own rows — only their children (`Class 2` gun ×2, `Jump Drive`) exist, each orphaned to top-level with `parentPortId: null`. The raw StarBreaker export for both ships uses an identical nested-entity structure, so this is not a source-data difference; it is a normalization-stage outcome that was not investigated further, per this mission's explicit "do not modify Ship normalization" scope.
- **Valkyrie** confirms the pattern is genuinely inconsistent, not merely "some ships lose the mount": of 8 weapon-family top-level ports, some retain a real position-named parent (`Left Turret`, `Right Turret`, `Left Weapon`, `Right Weapon` — children of an orphaned `hardpoint_turret_top`/`hardpoint_turret_bottom`), while the pilot's two fixed guns (`hardpoint_turret_pilot`'s children) surface with only generic `Left`/`Right` labels.

**A true Turret-vs-Weapon-mount distinction was investigated and found not reliably derivable from already-generated data.** The raw entity class at each mount (`Mount_Gimbal_S4` for Valkyrie's wing remote turrets vs. `ANVL_Valkyrie_Turret_Top`/`ANVL_Valkyrie_Turret_Bubble` for its two genuine manned turrets vs. `WeaponMount_Gun_S1_ANVL_Asgard_Door_*` for its door guns) is the only signal that actually distinguishes them — and the raw export's own port-path naming is not a reliable proxy for it (a wing mount hosting a plain gimbal is named `turret_gun`; a door-mounted fixed gun is named `hardpoint_turret_door_*`; both contain "turret" despite neither being one). That entity class is never written to `ports.json`/`components.json` for an orphaned mount, so recovering it would require a normalizer change — explicitly out of scope for EWO-019B. `src/utils/portTreeGrouping.ts`'s grouping mechanism is generic and ready to add a `'Turrets'` bucket the moment a reliable signal is captured; until then, all weapon-family top-level ports (mounts and turrets alike) render under one `Weapons` group.

**Resolved by EWO-020** — see [ADR-007](ADR/ADR-007-Compound-Assembly-Identity-Model.md) for the full architectural decision. In short: the "normalizer change" this section called out of scope turned out to be exactly what was needed, and the Chief Architect authorized it. `ShipNormalizer.walk()` now preserves an otherwise-excluded mount/turret node as a structural `Port` when it has a real included descendant, carrying a conservative `assemblyRole` (`src/normalizer/assemblyRole.ts`) derived from the mount's own entity class naming convention — never the port/hardpoint name this section already proved unreliable. Verified live: Valkyrie's wing mounts correctly separate into `REMOTE_TURRET` (their own entity class is explicitly `ANVL_Valkyrie_SCItem_Remote_Turret_Left/Right`), its top/bottom assemblies into `MANNED_TURRET`, and its door guns/nose gun into plain fixed mounts — with zero ship-specific code. Two additional general classification-translation fixes (a `subtype: null`/`"UNDEFINED"` equivalence bug, and a missing `WeaponMount` → `WeaponGun` rule) were found and fixed in the same pass; both apply to every ship, not just this proof group.

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
6. ~~Component `displayName` is not prettified for catalog-derived components.~~ Partially resolved by Mission M-012: the component/ship catalogs now resolve real English display names via DataCore's own localization keys and the P4K's `global.ini` string table (see "Mission M-012" section below and ADR-005) — 969/1,109 catalog components and 262/294 catalog ships have a real resolved name. This is authoritative localization lookup, not the heuristic name-prettification `displayNameGenerator.ts` still applies to legacy port internal names — those two mechanisms remain separate and are not unified by this mission.
7. ~~Origin 135c (and, discovered during the same audit, UTV/Mole/Cutlass Black (seed)/Vulture/Prospector) showed "Unknown Factory Item" for Factory and Installed while Target resolved to a real component.~~ Resolved by EWO-031's Canonical Factory Template Audit (Task 6/7) — **root cause was outside this pipeline entirely**: these are hand-authored `src/data/seed.ts` fixtures, not deep-imported ships, and six of them supplied zero `factoryItem`/`installedItem`/`targetItem` overrides for most of their hardpoint rows, so every one fell through to the `'Unknown Factory Item'` placeholder (`row()`'s default, `src/data/seed.ts`) — while `targetItem` resolved anyway because Target is fed independently through Loadout Manager/Quartermaster template selections, not from the same seed row. Fixed with real, already-proven-compatible component overrides, the same pattern EWO-023 already used for Cutlass Red. Starlite and M80 are deliberate, documented exceptions (Starlite is explicitly "Unknown / Future"; M80 is the fleet's own regression fixture proving genuine Unresolved status is reachable from real seed data, not just a synthetic one — see `src/utils/__tests__/unresolvedFactoryData.test.ts`) and were left as-is. See `docs/UI_ARCHITECTURE.md`'s canonical catalog notes and `src/data/__tests__/seedFactoryResolution.test.ts`.
8. **Deep-imported ships genuinely carry no `role`/`career` text.** Confirmed by direct inspection: every one of the 6 deep-imported ships' raw source files (`raw-data/*.json`) uses the metadata-less StarBreaker `root` envelope, which "only carries the entity class identifier... none of the metadata fields `RawEntity` exposes" (`src/normalizer/rawTypes.ts`) — `shipNormalizer.ts`'s `career: entity.career ?? '', role: entity.role ?? ''` fallback is exactly what produces the empty strings recorded in `generated-data/ships.json` for Eclipse, Gladius, Cutlass Black, Corsair, Avenger Titan, and Valkyrie. This is a real, honest gap in the deep-import envelope, not fixable inside the normalizer — but Mission M-012's separate catalog pipeline (below) independently has real `roleName`/`careerName` text for these same real hulls. EWO-033 (Task 6/7) wired that catalog data in as a fallback for the UI's stock role/focus display only (`src/utils/shipIdentityLine.ts`) — it does not and cannot backfill `role`/`career` on the deep-imported records themselves, since the raw per-ship export simply doesn't have that text. **No further importer/catalog synchronization mission is required for role/focus text coverage** — see `docs/DataModel.md`'s "Stock role/focus vs. operational role" section and the EWO-033 final report's coverage totals (100% of 258 canonical hulls resolve).

## Mission M-012 — Ship & component universe catalogs (separate from this pipeline)

This pipeline (Stages 1-6 above) produces a deep, per-ship normalized
port tree — currently for exactly two ships (Gladius, Avenger Titan).
Mission M-012 added a **separate** discovery mechanism — full-universe
bulk DataCore field queries, not per-ship `entity export
--dump-hierarchy` — that produces:

- `generated-data/ship-catalog.json`: 294 player-ownable ships/ground
  vehicles (262 ships, 32 ground vehicles), discovered via
  `VehicleComponentParams.movementClass` and filtered by a reviewed
  non-player-variant name taxonomy (see ADR-005).
- `generated-data/component-metadata-catalog.json` (the same file
  Mission M-007 introduced, now widened): 1,109 player-usable
  components across weapons/shields/coolers/power plants/quantum &
  jump drives/missile racks & missiles/radar/life support/relays/
  tractor beams/mining & salvage heads/bombs/mounts, discovered via
  `SAttachableComponentParams.AttachDef.Type` filtered against a
  reviewed category allowlist.

These catalogs power Add Ship's roster and component
selection/validation breadth in the live application — they do **not**
replace or extend this pipeline's per-ship depth. A ship added from the
catalog with no deep import has an empty factory template (zero
hardpoints) until it goes through Stages 1-6 above. See ADR-005 for the
full inclusion/exclusion policy, localization strategy, and known
coverage gaps.
