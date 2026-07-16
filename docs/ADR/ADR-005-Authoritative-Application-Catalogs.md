# ADR-005 — Authoritative Application Catalogs (Ship/Vehicle and Component Universe Provisioning)

- **Status:** Proposed (licensing/redistribution unresolved — see below)
- **Date:** 2026-07-12

## Context

Founder Operational Readiness Testing needs to add any legitimate
player-ownable ship/ground vehicle, select any legitimate
player-installable component, and build target loadouts without being
blocked by SFM's narrow seed/imported roster (12 seed ships + 2
deep-imported ships; a ~20-entry hand-authored component validation
table). Mission M-012 populates two full-universe catalogs from the
frozen LIVE 4.8.184.64329 P4K to unblock that testing.

## Decision

**Two authoritative application catalogs, not a family of per-category
files:**

1. **Ship catalog** (`generated-data/ship-catalog.json`) — every
   player-ownable ship and ground vehicle: identity, manufacturer,
   career/role, dimensions, crew size. A lightweight *roster*, not a
   port-tree — see "Scope boundary" below.
2. **Component catalog** (`generated-data/component-metadata-catalog.json`,
   the same file M-007 introduced) — every player-usable component
   across all requested categories (weapons, shields, coolers, power
   plants, quantum/jump drives, missile racks/missiles, radar, life
   support, relays, tractor beams, mining/salvage heads, bombs,
   mounts/gimbals), filtered from DataCore's own `AttachDef.Type` field
   via one reviewed allowlist
   (`scripts/componentCatalog/componentTaxonomy.ts`) — never a separate
   file per weapon/shield/cooler/etc.

Both reuse and extend the M-007 generator architecture
(`scripts/componentCatalog/`) rather than introducing a second,
competing pipeline.

## Discovery mechanism: bulk DataCore field queries

StarBreaker's `dcb query <Type>.<property>` supports a polymorphic
property-path form —
`EntityClassDefinition.Components[SomeComponent].someField` — that
extracts one field across **every** matching `EntityClassDefinition`
record in a single process invocation, emitting tab-separated
`<RecordName>\t<value>` lines. Confirmed empirically against the real
frozen P4K: a single such query resolves in ~3.5s whether it matches 1
or 25,544 records. This is the "bulk or bounded authoritative query" the
mission called for, replacing what would otherwise be one StarBreaker
process spawn per entity (infeasible at full-universe scale — hundreds
to tens of thousands of records).

- **Ship/vehicle discovery:** `Components[VehicleComponentParams].movementClass`
  — 970 raw candidates, joined against six further bulk field queries
  (manufacturer code/localization key, vehicle name, career, role, crew
  size, bounding box) via `scripts/generateShipCatalog.ts`.
- **Component discovery:** `Components[SAttachableComponentParams].AttachDef.Type`
  — 25,544 raw candidates, joined against six further bulk field
  queries (SubType, Size, Grade, manufacturer code/localization key,
  item localization name) via the extended `scripts/generateComponentCatalog.ts`.
- A single bulk query for the whole `Manufacturer` object (rather than
  just its `.Code`/`.Localization.Name` leaves) was found to overflow
  Node's maximum string length across the full component universe (each
  entity repeats the same deeply-nested manufacturer object, including
  irrelevant dashboard-UI config) — fixed by querying the two specific
  leaf fields actually needed instead of the whole object.

## Inclusion / exclusion policy

### Ships and vehicles

**Primary (field-based) rule:** has a `VehicleComponentParams`
component; its `movementClass` is `"Spaceship"` (-> `ship`) or
`"ArcadeWheeled"` (-> `ground_vehicle`). `"Dummy"` (debris props, e.g.
`SalvageableDebris*`) is excluded as unresolved.

**Secondary (reviewed name-taxonomy) rule** — DataCore does not expose a
single reliable "is this player-purchasable" field:

- A confirmed AI/mission-spawn variant (`AEGS_Avenger_Titan_PU_AI_CIV`)
  carries a Tag whose resolved path is `/AI/Spawning/GameMode/PU` —
  found via a full-record tag diff against its real base ship. This
  confirms the underlying signal exists, but StarBreaker's bulk
  field-query mode does not support array-typed leaf fields (confirmed
  empirically: `EntityClassDefinition.tags` returns zero rows even
  though the type query matches all records), so full per-entity tag
  verification across all ~970 candidates was not performed.
- A byte-identical AI clone (`AEGS_Avenger_Titan_AI_Template`) was found
  to carry **no** distinguishing DataCore field at all versus its real,
  purchasable base ship — every field checked, including
  `SCItemPurchasableParams` and `SEntityInsuranceProperties`, was
  identical.
- Given no single reliable field, `scripts/shipCatalog/playerVehicleTaxonomy.ts`
  applies a reviewed, deterministic list of Star Citizen's own
  well-documented internal non-player-variant naming conventions
  (`_AI_`/`_PU_`/`_Unmanned`/`_Template`/`_Wreck`/`_Hijacked`/`_TEMP`/
  `_Derelict`/etc. — used only to *exclude*, never to discover or invent
  a ship). Of 970 raw candidates: 669 excluded by this taxonomy, 7
  excluded as non-vehicle (`Dummy`), **294 included** (262 ships, 32
  ground vehicles).

**Known limitation:** this taxonomy is reviewed but not perfect —
edge-case judgment calls (e.g., "Collector Edition"/"Emerald"/"Renegade"
variants kept as real distinct sellable ships; "_Indestructible" demo
copies excluded) are documented in the taxonomy file's own comments, not
hidden.

### Components

`AttachDef.Type` — DataCore's own authoritative category field, never
inferred from names — filtered against a reviewed allowlist mapping
exactly the categories Mission M-012 requested (`WeaponGun`, `Shield`,
`Cooler`, `PowerPlant`, `QuantumDrive`, `JumpDrive`, `MissileLauncher`/
`GroundVehicleMissileLauncher`, `Missile`, `Radar`,
`LifeSupportGenerator`, `Relay`, `TractorBeam`/`TowingBeam`,
`SalvageHead`, `Bomb`/`BombLauncher`, `WeaponMount`, `WeaponMining`,
`WeaponDefensive`). Every other observed `Type` value (character
wearables/cosmetics, seats, dashboards, controllers, ATC managers,
docking internals, thrusters, fuel systems, personal FPS weapons,
geometry/UI/audio internals) is excluded by omission from this
minimum-scope allowlist — of 25,544 raw candidates, **1,109 are
player-usable** (mining heads mount as `WeaponMining`; ground-vehicle
missile racks as a distinct `GroundVehicleMissileLauncher` Type).

**Known gap:** no distinct DataCore `Type` value maps cleanly to
"Computer/Avionics" — not fabricated or force-mapped to an unrelated
category; simply absent from this catalog pending a clearer signal.

## Localization

DataCore localization keys are always `@`-prefixed references (e.g.
`@vehicle_NameAEGS_Gladius`) into Star Citizen's own English string
table, shipped inside the P4K at `Data/Localization/english/global.ini`
— a `key=value` (UTF-8 BOM, CRLF) file, extracted once via
`p4k extract` (`scripts/universeCatalog/localization.ts`) and parsed
into a lookup table. Stripping the `@` and looking the key up there is
the full authoritative resolution path — no translation, no templating,
no guessing. A missing key (or a known DataCore placeholder —
`LOC_PLACEHOLDER`/`LOC_UNINITIALIZED`/`LOC_EMPTY`) resolves to an
explicit `null`, never a fallback string. Result: 262/294 ships (89%)
and 969/1,109 components (87%) — plus every career/role/manufacturer
name — have a real resolved English display name.

## Manufacturer resolution

A manufacturer reference resolved via bulk query (`.manufacturer.Code`,
`.AttachDef.Manufacturer.Code`) comes back as DataCore's own stable
short code (e.g. `"AEGS"`, `"ARGO"`) plus a localization key for the
full name. `Code` is itself an authoritative, never-invented DataCore
field, so it doubles as both the stable identifier and the
provenance-preserving raw reference every record carries
(`scripts/universeCatalog/manufacturerResolver.ts`).

## Scope boundary: roster breadth vs. deep loadout normalization

The ship catalog is deliberately **not** a replacement for the deep,
per-ship normalized port-tree pipeline
(`generated-data/ships.json`/`ports.json`/`factory-loadouts.json` —
currently Gladius and Avenger Titan only). That pipeline's real,
authoritative port/loadout resolution (`entity export --dump-hierarchy`,
port classification, equipment resolution) is a substantial, multi-mission
undertaking *per ship* (see M-006 through M-011A) — doing it for the
full ~294-ship roster is explicitly out of this mission's scope
("catalog breadth and application integration," not a new sync/import
engine).

A ship added from the catalog that has no deep import materializes with
an **empty factory template** (zero hardpoints) — confirmed safe in
`materializeFleetAsset` and verified via manual browser testing (Ship
Detail and Loadout Manager both render correctly, no crash, just an
empty port tree). This is a documented, honest limitation, not a silent
gap: the Commander can add, name, own, and track the ship immediately;
detailed per-port target-build editing for it awaits a future deep
import.

## Application integration

- **Add Ship:** `src/data/shipDefinitions.ts` now concatenates seed +
  deep-imported + catalog-derived `ShipDefinition`s (deduplicated
  against the two deep-imported entity classes via a small, documented
  exclusion set — not a rediscovery mechanism).
- **Component validation / target-build / inventory autocomplete:**
  `src/data/componentCatalog.ts`'s compatibility check now falls back to
  the full catalog (`src/generated/componentCatalog.ts`) beyond its
  original ~20-entry hand-authored demo table. Loadout Manager's target
  input and Hangar Inventory's "Add New Item" field gained a native
  `<datalist>` autocomplete against the same catalog — an HTML
  attribute addition to an existing input, not a new UI component.
- Both browser-side loaders (`src/generated/shipCatalog.ts`,
  `src/generated/componentCatalog.ts`) use Vite's `import.meta.glob`
  rather than a static import, so a machine that hasn't run the
  generators locally gets an empty catalog (Add Ship/validation simply
  falls back to the existing narrower roster/table) instead of a broken
  build — mirroring how `componentMetadataResolver.ts` already treats a
  missing catalog on the Node/generator side.

## Licensing / output treatment

Unchanged from ADR-003's still-unresolved posture: both catalogs are
**gitignored** (`generated-data/ship-catalog.json`,
`generated-data/component-metadata-catalog.json`, plus the
`.localization-cache/` extraction scratch directory). Only generator
code, schemas, tests, and documentation are committed. The application
consumes the local, developer-generated artifact via the graceful
`import.meta.glob` pattern above — the app is not weakened to route
around the licensing question; it degrades to its pre-M-012 roster/
validation scope when the local catalog is absent.

## Regeneration cadence

Manual, on demand: `npm run generate:ship-catalog` and
`npm run generate:component-catalog`, run against the currently
installed StarBreaker + `Data.p4k`. Both embed the exact game
branch/version/`RequestedP4ChangeNum`/StarBreaker version/generation
timestamp in their `source` block for provenance — re-running against a
different game build produces a distinguishable, not silently
overwritten, catalog.

## Known coverage gaps

- No distinct "Computer/Avionics" component category (see above).
- Ship-taxonomy edge cases (see "Known limitation" above) — reviewed,
  not exhaustively game-verified against every one of 294 entries.
- Catalog-only ships have no port/loadout data until deep-imported.
- Production bundle size grew (~420KB -> ~1.0MB gzip 150KB) from
  bundling both catalogs via `import.meta.glob`; code-splitting was not
  pursued (mission: "performance optimization is secondary to
  correctness").

## Consequences

Founder Operational Readiness Testing can now add any of 294 real
ships/ground vehicles and validate against any of 1,109 real components
— a substantial, verified breadth increase over the prior 14-ship/
~20-component scope — without a new sync engine, UI redesign, or
persistence change. The deep-loadout-normalization gap for the ~292
catalog-only ships remains explicit future work.
