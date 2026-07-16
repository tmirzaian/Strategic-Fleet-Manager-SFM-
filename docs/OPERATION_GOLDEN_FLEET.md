# Operation Golden Fleet — GF-001: Canonical Fleet Coverage Audit

**Status:** Read-only audit, complete. No production code, generated data, or raw data was modified.
**Audit date:** 2026-07-15
**HEAD at audit time:** `dab0195` ("feat(assets): complete Beta Mission Control artwork integration")
**Branch:** `main`

## Objective

Establish a complete, repository-grounded inventory of every canonical selectable ship in Strategic Fleet Manager (SFM), classify each hull's source and mechanical-data completeness, and define the exact GF-002 regeneration scope. This document measures the current state; it does not change it.

## 1. Current source architecture (as implemented, not just as documented)

```
Raw authoritative sources
  raw-data/*.json (6 files — real StarBreaker `entity export --dump-hierarchy`
  exports, requires a local StarBreaker.exe + Data.p4k install to produce)
        |
        v
Import / catalog generators
  npm run import:ships        -> deterministic, reads only raw-data/*.json
                                  already on disk, no external tool needed
  npm run generate:ship-catalog       -> requires StarBreaker.exe + Data.p4k
  npm run generate:component-catalog  -> requires StarBreaker.exe + Data.p4k
        |
        v
Normalizer and metadata enrichment
  src/engine/importer/starBreakerImporter.ts -> src/normalizer/shipNormalizer.ts
  -> src/normalizer/componentMetadataEnrichment.ts -> validation
        |
        v
Generated artifacts (generated-data/*.json — ships, ports, factory-loadouts,
  installed-loadouts, target-builds, equipment-assignments, components,
  ship-images, ship-catalog, import-report, display-name-map)
        |
        v
ShipDefinition consolidation (src/data/shipDefinitions.ts)
  seedDefinitions (src/data/seed.ts) + importedDefinitions
  (src/generated/importedShips.ts) + catalogDefinitions
  (src/generated/shipCatalog.ts, minus anything already deep-imported)
  -> deduplicated by bareHullName + definitionCompletenessRank (EWO-021/ADR-008)
        |
        v
selectableShipDefinitions (what Add Ship actually offers)
        |
        v
FleetAsset materialization (src/utils/fleetAssetMaterializer.ts) — pure
  function, definition + factory template in, {asset, ship, build,
  hardpoints} out, no store/localStorage coupling
        |
        v
Commander workflows (Fleet Dashboard, Mission Control, Ship Detail,
  Loadout Manager, Quick Update, Decision Center — all read the same
  materialized `ships`/`fleetAssets` state)
```

**Documentation-vs-implementation discrepancies found: none material.** `docs/DataModel.md`, `docs/ImportPipeline.md`, `docs/DATA_ENGINE.md`, and the ADR series were cross-checked directly against the running code and generated data; every claim checked (role/career gap on deep-imported ships, the 262/294 ship-catalog resolution rate, the M80/Starlite documented exceptions, EWO-021's dedup rule) matches the current repository exactly.

## 2. Canonical selectable-hull set

- **Runtime source of truth:** `selectableShipDefinitions` (`src/data/shipDefinitions.ts`), the exact array Add Ship renders from.
- **Total: 258** — confirmed live against the current repository (matches the total EWO-033/EWO-033A both independently reported; no drift).
- Deduplication (`bareHullName` + `definitionCompletenessRank`) is confirmed still active and correct: 0 duplicate hull entries found in `selectableShipDefinitions`; legitimate distinct variants (e.g. every named Gladius/Avenger Titan skin from Mission M-012's catalog) remain separately selectable, each with its own real hull name.
- 0 selectable definitions failed to resolve by id (`shipDefinitionById` lookup succeeded for all 258; `materializeFleetAsset` threw for 0 of 258 — see §4).

## 3. Source-classification totals (all 258)

| Classification | Count |
|---|---|
| SEED-BACKED | 10 |
| DEEP-IMPORTED | 6 |
| CATALOG-ONLY | 242 |
| HYBRID | 0 |
| UNCLASSIFIED | 0 |

Every hull traced cleanly to exactly one classification from `ShipDefinition.sourceMetadata` (`sourceType`/`sourceFile`) — no case required guessing from the display name, and no hull exhibited genuinely mixed identity/mechanical provenance (0 HYBRID). The **10 seed-backed** hulls are: 135c, Cutlass Red, F7C-S Hornet Ghost Mk II, M80, MOLE, Prospector, Railen, Starlite, UTV, Vulture. The **6 deep-imported** hulls are: Avenger Titan, Corsair, Cutlass Black, Eclipse, Gladius, Valkyrie.

## 4. Mechanical-support totals (Task 4 categories)

| Category | Count | Definition |
|---|---|---|
| A — FULL MECHANICAL SUPPORT | 13 | Real factory hierarchy exists and every factory row resolves cleanly |
| B — PARTIAL MECHANICAL SUPPORT | 3 | Real mechanical data exists, but with Unknown Factory Item and/or Invalid Target gaps |
| C — PRESENTATION-ONLY SUPPORT | 242 | `portIds: []` by design — identity/catalog metadata only, no factory port tree |
| D — INVALID | 0 | None — no selectable definition currently fails to materialize |

The 3 **PARTIAL** hulls (all seed-backed, all previously documented in `docs/ImportPipeline.md`'s known-gaps list): **M80** (10 Unknown Factory Item rows, 1 Invalid Target), **MOLE** (1 Invalid Target, 0 Unknown Factory Item), **Starlite** (11 Unknown Factory Item rows). Both **Category C is never conflated with mechanical completeness** in this audit's tooling — a catalog-only hull's `portIds: []` is counted as presentation-only, never as "full support with zero requirements."

## 5. Workflow-readiness totals

| State | Count | Criteria |
|---|---|---|
| 1. BETA FULL | 16 | Materializes cleanly, real factory port tree exists (mechanical support A or B) — supports Add Ship, both dashboards, Ship Detail, Factory Loadout display, and custom Loadout creation/editing/saving |
| 2. BETA LIMITED — presentation/fleet management only | 242 | Materializes cleanly with an honest empty factory template (mechanical support C) — supports Add Ship, both dashboards, Ship Detail, persistence, priority, and imagery, but Factory Loadout/Loadout Manager have nothing to display or edit |
| 3. BLOCKED — data defect | 0 | Would be any hull whose materialization itself throws — none found |
| 4. UNKNOWN — audit could not determine | 0 | None — every one of the 258 hulls was resolved statically this session |

**16 = 13 (mechanical A) + 3 (mechanical B)** — a Loadout-workflow-capable hull only needs a *real* port tree, not a *clean* one; M80/MOLE/Starlite still let a Commander open Loadout Manager and see genuine (if partially unresolved) rows, which is meaningfully different from a catalog-only hull's true empty tree.

## 6. Raw-source file coverage (Task 7 — critical finding)

- **Total raw StarBreaker exports: 6** — `AEGS Avenger Titan.json`, `AEGS Eclipse.json`, `AEGS Gladius.json`, `ANVL Valkyrie.json`, `DRAK Corsair.json`, `DRAK Cutlass Black.json`.
- **Naming convention:** consistent, `<MANUFACTURER_CODE> <Ship Name>.json`, matching `docs/ImportPipeline.md`'s documented `starbreaker.exe entity export ... --dump-hierarchy` command exactly.
- **Envelope format:** all 6 use the StarBreaker `root` envelope (metadata-less — confirmed this is *why* all 6 deep-imported ships show empty `role`/`career`, a genuine upstream gap, not an SFM defect).
- **Malformed/unreadable files:** 2 of 6 (`AEGS Eclipse.json`, `ANVL Valkyrie.json`) contain trailing commas and are not strict JSON — **not a defect**: `src/engine/importer/trailingCommaJson.ts` is a dedicated, tested (`trailingCommaJson.test.ts`) fallback specifically for this StarBreaker output quirk, and both files import successfully through the real pipeline (confirmed: Eclipse resolves 15 ports, Valkyrie resolves 37, both are already in `generated-data/ships.json`).
- **Duplicate exports for the same hull:** 0.
- **Source files absent for selectable hulls:** **252 of 258** (every CATALOG-ONLY hull) has **no raw-data file at all**.

**This is decisive: full deep import of all 258 selectable hulls is not currently possible from what exists in this repository.** Only 6 raw exports exist, and all 6 are already imported. Producing a raw export for any of the remaining 252 hulls requires running StarBreaker's `entity export --dump-hierarchy` against a local, licensed Star Citizen LIVE install (`Data.p4k`) — external tooling this environment does not have and this audit did not attempt to acquire, exactly as GF-001's authorization forbids. `docs/Roadmap.md` already documents this as "the same multi-mission effort Gladius/Avenger Titan took" per hull — i.e., this is a large, one-ship-at-a-time undertaking, not a bulk regeneration.

## 7. Generator capability inventory (Task 8 — none executed)

| Command | Reads | Writes | Deterministic | External tool required | Safe to run now | Tests |
|---|---|---|---|---|---|---|
| `npm run import:ships` | `raw-data/*.json` | `generated-data/*.json` (ships, ports, factory/installed/target, equipment-assignments, ship-images, import-report) | Yes | No | Yes (would only reprocess the same 6 files already in `raw-data/`) | Yes (normalizer/importer test suite) |
| `npm run generate:ship-catalog` | Live `Data.p4k` via StarBreaker bulk query | `generated-data/ship-catalog.json` | Yes, given identical P4K build | **Yes** — `STARBREAKER_EXE` + `SC_DATA_P4K`, both local, non-repo paths | **No** — would fail immediately (paths don't exist in this environment) | Yes (`scripts/shipCatalog/`, `scripts/universeCatalog/` test suites) |
| `npm run generate:component-catalog` | Live `Data.p4k` via StarBreaker bulk query + narrow per-entity path | `generated-data/component-metadata-catalog.json` | Yes, given identical P4K build | **Yes** | **No** | Yes (`scripts/componentCatalog/` test suite) |
| `npm run generate:branding-assets` | `public/assets/branding/logo/sfm-logo-master-1024.png` | Derived logo/favicon sizes | Yes | No | Yes, but unrelated to fleet data | Untested by this audit (out of scope) |
| `npm test` | n/a | n/a | Yes | No | Yes | 1081/1081 passing |
| `npm run build` | n/a | `dist/` (gitignored) | Yes | No | Yes | Clean |

**No generator was executed this mission.** None are safe to run for *new* deep-import coverage in this environment, since the two that could produce new raw data both require a local StarBreaker.exe + Data.p4k install this sandbox does not have.

## 8. Identity and image coverage

- **Complete identity metadata (manufacturer + stock role/focus both present): 258 of 258 (100%)** — confirmed via `resolveStockRoleFocusForDefinition()`, the same resolver EWO-033 built and certified.
- **Missing manufacturer: 0.**
- **Missing stock role/focus: 0.**
- **Missing model/variant:** not tracked as a failure per this audit's own instruction (optional field; Mission M-012 catalog records carry it inconsistently by design, not audited as a gap).
- **Commander registry image coverage: 12 of 258.**
- **Universal fallback coverage: 246 of 258.**
- **Duplicate/malformed identity:** 0 duplicate selectable entries; 0 duplicate slot labels found within any single hull's own factory template.

## 9. Unknown Factory Item / zero-port / invalid-definition findings

- **Hulls with ≥1 Unknown Factory Item row: 2** (M80, Starlite — both seed-backed, both pre-existing documented exceptions, see `docs/ImportPipeline.md` known-gap #7).
- **Hulls with zero ports: 242** (all CATALOG-ONLY by design — `portIds: []` is the intentional Mission M-012 placeholder shape, not a defect).
- **Hulls whose factory loadout validates with zero unresolved/invalid/duplicate rows: 255 of 258** (the 3 exceptions are M80/MOLE/Starlite, per §4).
- **Invalid/unmaterializable definitions: 0 of 258** — every selectable hull's `materializeFleetAsset()` call and `buildLoadoutEditorModel()` call completed without throwing, including all 242 zero-port catalog-only hulls (confirmed no crash from an empty template).

## 10. Representative examples

- **Fully supported (Category A):** 135c, Avenger Titan, Corsair, Cutlass Black, Cutlass Red, Eclipse (and 7 more: F7C-S Hornet Ghost Mk II, Gladius, Prospector, Railen, UTV, Valkyrie, Vulture).
- **Limited (Category B, partial mechanical):** M80 (10 Unknown Factory Item, 1 Invalid Target), MOLE (1 Invalid Target), Starlite (11 Unknown Factory Item).
- **Presentation-only (Category C, representative sample):** Aegis Avenger Stalker, Aegis Avenger Titan Renegade, Aegis Avenger Warlock, Aegis Gladius Dunlevy, Aegis Gladius Pirate, Aegis Gladius Valiant — all real Mission M-012 catalog variants with complete identity metadata and zero port data.
- **Blocked:** none found.

## 11. Can all 258 selectable hulls currently be deep-imported? No.

Only 6 raw StarBreaker exports exist in this repository, and all 6 are already fully imported. The remaining 252 hulls have no raw source at all. Full deep import requires, per hull: a working StarBreaker.exe + a licensed local Star Citizen LIVE `Data.p4k` install, a manual `entity export --dump-hierarchy` run, then `npm run import:ships`. This is a per-ship, human-driven effort (confirmed by `docs/Roadmap.md`'s own framing of the historical Gladius/Avenger Titan effort as "the same multi-mission effort... M-006 through M-011A"), not a single bulk regeneration this repository's tooling can perform unattended.

## 12. GF-002 recommended scope

**Recommendation: split GF-002, do not run it as one mission.**

- **Safe deterministic regeneration (repo-only, no external tool):** re-running `npm run import:ships` against the existing 6 `raw-data/*.json` files is safe, deterministic, and requires no new inputs — but it would only reproduce the current `generated-data/*.json` state (no new hulls gained). Useful only as a verification/idempotency check, not a coverage expansion.
- **Transformations requiring code fixes first:** none identified — the importer/normalizer pipeline itself has no known blocking defect against any of the 6 currently-available raw files.
- **Source files that must be obtained before regeneration:** raw StarBreaker exports for any of the 252 catalog-only hulls the Commander wants promoted to DEEP-IMPORTED — this requires the Commander (or whoever holds the licensed game install + StarBreaker) to run `entity export --dump-hierarchy` per hull, external to this repository and this audit's authority.
- **Outputs that must be backed up/diffed before any regeneration:** all of `generated-data/*.json` — currently uncommitted/dirty in the working tree from prior missions; regenerating over this state without a diff step risks silently discarding whatever the Commander's own local edits or in-progress work represent.
- **Files that should not be regenerated:** `src/data/seed.ts` (hand-authored, reviewed fixture data — never overwritten by any generator), `src/data/shipImageRegistry.ts` (Commander-maintained, no generator writes to it).
- **Generated artifacts currently dirty for unrelated reasons:** all ten `generated-data/*.json` files show as modified in `git status` from earlier, already-reported missions (EWO-030/031 catalog work) — none of this dirt originates from GF-001.

**Recommended split:**
1. **GF-002a — Source Acquisition** (Commander-driven, outside SFM tooling): obtain additional raw StarBreaker exports for a Commander-prioritized subset of the 252 catalog-only hulls.
2. **GF-002b — Importer Correction** (only if GF-002a's new raw files expose a pipeline gap the current 6 files never exercised — cannot be predicted without real new input).
3. **GF-002c — Regeneration** (`npm run import:ships` against the expanded `raw-data/` set, plus `npm run generate:component-catalog` / `generate:ship-catalog` only if new component/ship types are introduced).

Proposed terminal commands for GF-002c (**not run by this mission**):
```
npm run import:ships
npm test
npx tsc -b
npm run build
```

## 13. GF-003 proposed stress-test architecture (design only, not executed)

- **(A) Safe for all 258 hulls, no browser, fast (<5s):** canonical definition resolution (`shipDefinitionById` lookup), in-memory `materializeFleetAsset()` call, `buildLoadoutEditorModel()` call, image resolution (`resolveShipImage`), manufacturer/stock-role resolution (`resolveStockRoleFocusForDefinition`), duplicate-id / duplicate-slot-label checks, zero-port safety (no throw). This is exactly what GF-001's own disposable audit script already exercised — promoting it to a permanent, reviewed test would need separate authorization (per this mission's own Verification section) but the design is proven working today.
- **(B) Requiring real mechanical port data (a strict subset — the 16 hulls with mechanical support A/B: the 13 in §4's Category A plus the 3 in Category B):** `overlayCanonicalHierarchy`/`buildPortTree` construction, `computeHardpointStatusWithValidation` status distribution, compatibility-type resolution (`compatibilityTypeFor`).
- **(C) Requiring manual Commander browser verification (not automatable safely):** actual Fleet Dashboard/Mission Control/Ship Detail visual rendering across a representative sample (not all 258 — would be an excessive, slow browser-test suite), persistence across a real reload, and Quick Update/Decision Center end-to-end flows for at least one hull per mechanical-support category.

**Recommended architecture:** one Vitest file iterating all 258 definitions for tier (A) (sub-second runtime, matches this audit's own script — under 3 seconds observed), a second small Vitest file scoped to the 16 mechanically-real hulls for tier (B), and a short manual Commander checklist (4-6 representative hulls, one per category) for tier (C) — not hundreds of browser tests.

## Required exact counts (reproducible from repository data)

| Metric | Count |
|---|---|
| Selectable canonical hulls | 258 |
| Seed-backed hulls | 10 |
| Deep-imported hulls | 6 |
| Catalog-only hulls | 242 |
| Hybrid hulls | 0 |
| Unclassified hulls | 0 |
| Hulls with full mechanical support (A) | 13 |
| Hulls with partial mechanical support (B) | 3 |
| Presentation-only hulls (C) | 242 |
| Invalid hulls (D) | 0 |
| Hulls with raw StarBreaker files | 6 |
| Hulls with zero ports | 242 |
| Hulls with Unknown Factory Item values | 2 |
| Hulls whose factory loadout validates cleanly | 255 |
| Hulls with Commander registry images | 12 |
| Hulls using universal fallback | 246 |
| BETA FULL hulls | 16 |
| BETA LIMITED hulls | 242 |
| BLOCKED hulls | 0 |
| UNKNOWN hulls | 0 |

## Explicit limitations of this audit

- Counts reflect a single point-in-time snapshot (`generated-data/*.json` and `raw-data/*.json` as they exist right now, uncommitted). Any future regeneration invalidates these exact numbers.
- "BETA LIMITED" hulls (242) are not broken — they are honest, by-design placeholders (Mission M-012's own stated scope boundary), not a bug queue.
- This audit did not attempt any browser-level rendering verification (Task 6 explicitly forbids creating 258 persisted Fleet Assets in real storage) — workflow-readiness states are derived from static analysis and in-memory materialization only, not visual confirmation.
- No CIG marketing status (Flight Ready/Concept/In Production) is reported anywhere in this document — no authoritative repository source currently carries that field.

## Commander decision gates

1. **Does the Commander want to pursue additional raw-data acquisition (GF-002a) at all**, given it is a manual, per-hull, external-tooling effort outside this repository's own automation — or is the current 6-hull deep-import set considered sufficient for Beta?
2. **If yes, which hulls are prioritized** for the next raw export batch — Commander's owned/most-relevant fleet, or a broader manufacturer-balanced sample?
3. **Should GF-003's tier (A) audit script be promoted to a permanent, committed regression test** (this mission's own script proved the concept in under 3 seconds) — requires separate authorization per GF-001's own Verification section.
4. **Should M80/MOLE/Starlite's known Category B gaps be scheduled for a dedicated fix mission**, or remain documented exceptions indefinitely (as `docs/ImportPipeline.md` currently treats them)?

## Recommended commit message (if this document is approved)

```
docs(golden-fleet): add GF-001 canonical fleet coverage audit
```

---

# GF-002A — Automated Authoritative Source Acquisition Recon

**Status:** Investigation and feasibility mission, complete. No bulk export performed. No raw-data, generated-data, or Commander data modified.
**Recon date:** 2026-07-15
**HEAD at recon time:** `dab0195` (unchanged from GF-001/GF-001-V1)

## Recon objective

Determine whether SFM can automatically acquire authoritative mechanical ship data for every ship entity in the Commander's local Star Citizen `Data.p4k`, without manual per-ship guesswork, and define the safest acquisition path for GF-002B.

## Local tool availability (Task 1)

| Tool | Found | Path | Detail |
|---|---|---|---|
| StarBreaker.exe | **Yes** | `D:\StarBreaker-main\StarBreaker-main\target\release\starbreaker.exe` | Version `0.3.2` (confirmed via `--version`), 17,108,480 bytes, built 2026-07-11. Readable and executable from this environment. |
| Data.p4k | **Yes** | `C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Data.p4k` | 162,736,189,440 bytes (~151.6 GB), last modified 2026-07-02 11:18. |
| Channel | **LIVE** (public) | — | `build_manifest.id` confirms `Branch: sc-alpha-4.8.0`, `Version: 4.8.184.64329`, `P4ChangeNum: 12122953` — the exact same build already used to generate `generated-data/ship-catalog.json` (`source.gameVersion` matches exactly). No drift between the currently-installed game and the previously-generated catalog. |

Neither `Data.p4k` nor the Star Citizen installation was copied, moved, or modified. Both paths match the hardcoded defaults already present in `scripts/generateShipCatalog.ts`/`scripts/generateComponentCatalog.ts`, confirming this machine is the same one those generators were originally run from.

## StarBreaker CLI capability (Task 2)

Full command tree recovered via `--help` at every level (`entity`, `p4k`, `dcb`), all non-destructive, all exit code 0:

- **`entity export <NAME> [OUTPUT]`** — exports ONE entity per invocation. `<NAME>` is a **case-insensitive substring match**, not an exact key (`entity export "AEGS_Gladius" ...` reported "Found 46 candidates, using shortest match" before resolving correctly) — a real automation risk, addressed in the Task 7 design below. `--dump-hierarchy` produces the same JSON hierarchy format already used by every existing `raw-data/*.json` file. `--p4k` accepts a path directly (also settable via `SC_DATA_P4K` env var, already how the existing generator scripts consume it).
- **`entity loadout <NAME>`** — prints the same hierarchy to stdout without writing a file (useful for a pre-export dry-run/verification step).
- **`dcb query <PATH>`** — bulk DataCore field queries with glob `--filter`; this is the exact mechanism `scripts/universeCatalog/dcbBulkQuery.ts` already uses to build `generated-data/ship-catalog.json`'s 294 records from 970 raw candidates.
- **`dcb extract`** / **`p4k list`** / **`p4k extract`** — bulk record/file extraction with glob/regex filters, JSON/XML/unp4k output formats, and content converters (`cryxml`, `dds-png`).

**Answering Task 2's lettered options: (B) — export by entity class**, confirmed working. There is no (A) export-all-ships flag. Repeated scripted invocation (one `entity export` call per known entity class, looped) is fully possible — the tool has no interactive prompts, clean argument parsing, and real exit codes.

## Current ship catalog entity identifier coverage (Task 3)

- **All 258 selectable hulls already carry a resolvable entity-class-shaped identifier** in SFM today:
  - 6 DEEP-IMPORTED hulls: `ShipDefinition.sourceEntityClass` (e.g. `AEGS_Gladius`).
  - 242 CATALOG-ONLY hulls: their `ShipDefinition.id` **is** the raw entity class directly (`catalogDefinitions` in `shipDefinitions.ts` sets `id: r.entityClass` verbatim).
  - 10 SEED-BACKED hulls: **no entity class was previously recorded**, but every one was matched this recon to a real catalog entity class by display name (see table below) — a genuine new finding, not previously documented.
- **Selectable hulls with a source entity class or equivalent: 258 of 258.**
- **Selectable hulls lacking any exportable identifier: 0.**
- **Duplicate entity classes across selectable hulls: 0.**
- **Multiple canonical hulls mapping to one entity class: 0.**
- **One canonical hull mapping to multiple entities:** not applicable in the current selectable set, but the substring-match risk above means a *future* automated run must verify the resolved entity by name, not just by exit code.

**New finding — seed-backed hulls' real entity classes (name-matched against `generated-data/ship-catalog.json`, not previously tracked anywhere in SFM):**

| Seed hull | Matched entity class | Catalog display name |
|---|---|---|
| Ghost (F7C-S Hornet Ghost Mk II) | `ANVL_Hornet_F7CS_Mk2` | Anvil F7C-S Hornet Ghost Mk II |
| Corsair | `DRAK_Corsair` | (already deep-imported under this same class) |
| MOLE | `ARGO_MOLE` | Argo MOLE |
| Railen | `GAMA_Railen` | Gatac Railen |
| 135c | `ORIG_135c` | Origin 135c |
| Cutlass Black | `DRAK_Cutlass_Black` | (already deep-imported under this same class) |
| Cutlass Red | (catalog entry exists; already seed-registry-covered) | Drake Cutlass Red |
| M80 | `ORIG_m80` | Origin M80 |
| Starlite | `MISC_Starlite` | MISC Starlite |
| UTV | (catalog entry exists) | Tumbril UTV |
| Vulture | (catalog entry exists) | Drake Vulture |
| Prospector | (catalog entry exists) | MISC Prospector |

**Side finding, out of GF-002A's scope to fix:** `src/data/seed.ts`'s own hand-authored `manufacturer` field is factually wrong for at least two hulls — M80 is tagged `'Mirai'` (not a real Star Citizen manufacturer at all) but its real manufacturer is **Origin**; Starlite is tagged `'Crusader'` but its real manufacturer is **MISC**. This is a pre-existing seed data-quality issue, unrelated to mechanical import, flagged for a future Commander decision — not corrected by this recon (`NOT AUTHORIZED` forbids modifying Commander/canonical data).

## P4K enumeration feasibility (Task 4)

**Already solved and already proven in production** — `generate:ship-catalog`'s existing `dcb query`-based bulk pipeline enumerates every `EntityClassDefinition` record in `Data.p4k` (970 total candidates found), classifies each by `movementClass` (`classifyMovementClass`), and excludes 669 non-player variants (NPC/AI, wrecks, test entities, paint-swap duplicates) via `isNonPlayerVariantName` — a real, already-tested filter (`scripts/shipCatalog/__tests__/playerVehicleTaxonomy.test.ts`) — leaving exactly the 294 real player-ownable records already in `generated-data/ship-catalog.json` (7 remain genuinely unresolved). This same entity-class list is directly reusable as a GF-002B export manifest with zero new enumeration work required. Concept-only hulls (identity known, no confirmed mechanical entity) are **not** distinguished from mechanically-real ones by this existing pipeline — that distinction can only be established by actually attempting `entity export --dump-hierarchy` per class (see Task 5).

## Mechanical availability classification (Task 5)

Repository-grounded classification, per the mission's required scheme:

1. **MECHANICAL_ENTITY_AVAILABLE** — a real entity with ports/factory structure exists. Confirmed for all 3 proof-of-concept hulls below (including one, `ORIG_m80`, that SFM currently treats as a documented gap).
2. **CATALOG_IDENTITY_ONLY** — identity exists, no confirmed exportable mechanical entity. Cannot yet be distinguished from case 3 without attempting export.
3. **ENTITY_VARIANT_OR_ALIAS** — data exists under a related entity requiring aliasing (e.g. the substring-match ambiguity noted in Task 2).
4. **UNKNOWN** — tooling cannot yet determine availability (the default state for all 242 currently-catalog-only hulls, pending an actual export attempt).

**This classification cannot yet be produced automatically for all 258 hulls** — it requires attempting `entity export --dump-hierarchy` per hull (a real, if fast, per-hull operation) and inspecting the result, not a static lookup. GF-002A did not attempt this at scale (out of scope; that is GF-002B's job). **No authoritative CIG Flight Ready/Concept metadata was found anywhere in `generated-data/ship-catalog.json`'s schema** — confirmed by direct inspection of its field list; no such field exists. This audit does not substitute marketing status for mechanical availability anywhere.

## Proof-of-concept results (Task 6 — authorized, tools confirmed present, behavior understood)

Three hulls exported to a temporary scratch directory **outside tracked project data** (`%LOCALAPPDATA%\Temp\claude\...\scratchpad\gf002a_poc\`, never `raw-data/`):

| # | Hull | Entity class | Command | Exit | Time | Output size |
|---|---|---|---|---|---|---|
| 1 | Gladius (control, already deep-imported) | `AEGS_Gladius` | `starbreaker.exe entity export "AEGS_Gladius" "<scratch>/AEGS_Gladius_poc.json" --p4k "<Data.p4k>" --dump-hierarchy` | 0 | 6.4s | 149,540 bytes |
| 2 | Sabre (catalog-only, expected real) | `AEGS_Sabre` | same pattern | 0 | 4.7s | 130,637 bytes |
| 3 | M80 (seed-backed, documented gap hull) | `ORIG_m80` | same pattern | 0 | 4.9s | 147,559 bytes |

**Result 1 (control) — byte-for-byte identical** to the already-committed `raw-data/AEGS Gladius.json` (`diff` produced zero output). This proves the export is fully deterministic/reproducible given the same P4K build.

**Result 2 (Sabre)** — real hierarchy with 25 hardpoints/ports resolved (thrusters, gimbal mounts, missile racks, shield generators, etc.), confirming a genuinely popular, long-established ship has full mechanical data available.

**Result 3 (M80)** — real hierarchy with 42 hardpoints/ports resolved (thrusters, cargo ramp, entrance ramp, fuel ports). **This is the most significant single finding of GF-002A**: SFM's own seed fixture for M80 has been showing "Unknown Factory Item" for 10 of its hardpoint rows (documented in `docs/ImportPipeline.md` as a known gap) purely because it was hand-authored before the deep-import pipeline existed — **not** because CIG lacks the data. The real entity class (`ORIG_m80`) has always been fully exportable.

**Importer compatibility (all 3):** all three exports were run through the real `StarBreakerImporter` → `ShipNormalizer` → `validateNormalizedPackage` pipeline in-memory (never invoking `GeneratedDataWriter`, never touching `generated-data/`). All three normalized cleanly: Gladius (26 ports, 0 warnings — matches its existing tracked import exactly), Sabre (25 ports, 0 warnings), M80 (42 ports, 0 warnings). Zero normalization or compatibility warnings on any of the three.

Temporary proof output was left in place in the session scratchpad (outside the repository, outside `raw-data/`, never staged) — fully reported above; it does not need separate deletion since it was never inside tracked project data to begin with.

## Manual vs. automated acquisition comparison (Task 8)

| Strategy | Commander actions | Engineering effort | Runtime | Repeatability | Reliability | Patch-update suitability | Risk |
|---|---|---|---|---|---|---|---|
| **A. Manual per-ship export** | One manual command per hull, ~252 times | None beyond current tooling | ~5s/hull hands-on, but Commander-paced (hours of attention) | Low — depends on Commander repeating exact steps correctly every patch | Medium — manual transcription errors possible | Poor — repeats fully by hand every patch | Commander must guess which ships matter (violates Commander Intent #3) |
| **B. Scripted repeated invocation** | None per-hull; one approval to run a script | Small (a loop script over the existing entity-class manifest) | ~5s × 252 ≈ **21 minutes** total, unattended | High — same script, same manifest, every patch | High — deterministic, proven byte-identical in this recon's own control test | Good — re-run after any patch bump | Substring-match ambiguity (Task 2) requires a verification step; large capital ships untested for runtime/size outliers |
| **C. Direct P4K enumeration + export through existing tooling** | Same as B, plus zero manual manifest curation | Small-to-moderate (join the already-existing `dcb query` enumeration to the export loop) | Same as B, entity list generation adds seconds | Highest — manifest itself regenerates from live P4K, never hand-maintained | High | Best — the manifest source (`dcb query`) is itself already patch-agnostic | Manifest could pick up entities the mechanical exporter can't yet handle (concept-only) — must be tolerated as expected `CATALOG_IDENTITY_ONLY`/`UNKNOWN`, not treated as failure |

**Recommended: C**, which is B built on top of the manifest the existing `generate:ship-catalog` pipeline already produces — this is the only strategy that satisfies Commander Intent #3 ("must not manually choose a small subset") and #5 ("should ideally enumerate and export all available ship entities automatically").

## GF-002B automation design (Task 7)

```
Canonical selectable hulls (or, better, the full 294-record ship-catalog manifest,
so newly-flyable ships are picked up even before Add Ship lists them)
        |
        v
Resolve exportable entity identifiers — already present verbatim as
generated-data/ship-catalog.json's own `entityClass` keys; no new resolution work
        |
        v
Generate export manifest — one row per entity class, with a resumable
"already exported" checkbox (see below)
        |
        v
Invoke StarBreaker automatically per entity — `entity export "<exact class>"
"<staging>/<class>.json" --p4k <path> --dump-hierarchy`, sequentially or with
a small thread pool
        |
        v
Write raw exports to a controlled staging directory (NOT raw-data/ directly)
        |
        v
Validate each file — JSON parses (with the existing trailing-comma fallback),
importer/normalizer accepts it with 0 errors, output hierarchy's own header
line names the exact requested entity class (guards the substring-match risk)
        |
        v
Deduplicate canonical hulls / variants — reuse the existing bareHullName +
definitionCompletenessRank logic unchanged, never reimplemented
        |
        v
Produce an acquisition report (per-hull success/failure/skip reason)
        |
        v
Only then promote approved exports into raw-data/ (a separate, reviewed step —
never automatic)
```

Addressing each required design point:
- **Safe output directory:** a new, gitignored `staging-data/raw-imports/` (or equivalent), never `raw-data/` directly — promotion to `raw-data/` is a distinct, reviewed step.
- **Deterministic filenames:** `<entityClass>.json` (e.g. `AEGS_Sabre.json`) — matches the entity class exactly, unambiguous, no manual naming judgment.
- **Overwrite protection:** skip any staging file that already exists unless a `--force` flag is passed; never touch `raw-data/` at all from this stage.
- **Resume capability:** the manifest tracks per-entity status (pending/done/failed); a re-run only processes `pending` rows.
- **Retry behavior:** one automatic retry on a non-zero exit before marking `failed`; no infinite retry loop.
- **Per-hull failure reporting:** every entity gets one manifest row with exit code, stderr excerpt, and output file size (0 if none).
- **Duplicate entity handling:** post-export, parse the hierarchy file's own "Loadout tree for EntityClassDefinition.X" header line and assert it matches the requested class exactly — reject/flag a mismatch rather than trust the CLI's own "shortest match" silently.
- **Concept/no-entity handling:** a StarBreaker "no entity found" result (non-zero exit or empty output) is recorded as `CATALOG_IDENTITY_ONLY`/`UNKNOWN`, never treated as a script failure.
- **Trailing-comma JSON handling:** already solved — reuse `stripTrailingCommas`/the importer's existing fallback unchanged.
- **Malformed-output quarantine:** any file that fails strict-or-fallback JSON parsing moves to a `quarantine/` subfolder with the raw stderr, never silently dropped.
- **Patch/channel metadata:** record the `build_manifest.id` contents (branch/version/P4ChangeNum) alongside the acquisition report, exactly as `generate:ship-catalog` already does in its own `source` block.
- **Data.p4k timestamp/version capture:** record the file's mtime and size alongside the report (this recon's own §Task 1 table is the template).
- **Command logging:** every invoked command line logged verbatim (redacting nothing — no secrets are involved) to an `acquisition-log.txt`.
- **Dry-run mode:** a `--dry-run` flag that prints the planned command list without invoking StarBreaker at all.
- **Maximum runtime:** a configurable overall timeout (e.g. 60 minutes) with graceful partial-completion reporting rather than an indefinite hang.
- **Disk-space estimate:** ~150KB per hull-hierarchy JSON (this recon's own 3 samples) × up to 252 new hulls ≈ **under 40MB total** — negligible. (Full GLB/mesh export, which GF-002B does NOT need, would be vastly larger; `--dump-hierarchy` is metadata-only.)
- **Windows PowerShell compatibility:** the underlying tool and paths are already Windows-native (this entire recon ran on this Windows machine); a Node/tsx script (matching every existing `scripts/*.ts` convention) avoids any PowerShell-specific scripting risk entirely.

## SPPV / external-source conclusions (Task 9)

- **SFM does not currently depend on SPPV data anywhere.** Repository-wide search found exactly two references: `docs/Roadmap.md`'s Post-Beta roadmap ("SPPV integration evaluation" — not started) and one code comment in `src/utils/componentPresentation.ts` describing a **display convention** (converting DataCore's numeric `Grade` field to a letter, "the in-game/Erkul/SPPV convention") — not a data dependency.
- **SPPV is not necessary for mechanical ship extraction** — this recon's own proof-of-concept demonstrates real hardpoint/factory data extraction directly from `Data.p4k` via StarBreaker alone, with zero SPPV involvement.
- **No evidence found, either way, that SPPV uses a private CIG API** — this recon did not investigate SPPV itself (not authorized to), and the repository contains no claim about SPPV's own data source.
- **The same class of data (component grade/quality) can plausibly be derived from Data.p4k directly** — confirmed: `SItemDefinition.Grade` is already a real DataCore field the existing component catalog pipeline reads.
- **Remaining metadata that may still require another source:** authoritative CIG marketing/Flight-Ready status has no confirmed DataCore field found in this recon (see Task 5) — if the Commander wants that specific metadata, it may require a source this recon did not investigate. This is a documented open question, not a claim that SPPV is required.

## Beta release gate recommendation (Task 10)

- **Beta packaging should remain on hold for a "fully deep-imported fleet" claim, but should NOT be blocked from shipping presentation/fleet-management coverage for all 258 hulls** — those two things are separable. GF-001 already confirmed all 258 hulls materialize safely today.
- **Recommended gate: 100% of MECHANICAL_ENTITY_AVAILABLE hulls should be deep-imported before Beta claims "every ship with real mechanical data is deeply imported."** This recon proved the mechanism works and is fast (~21 minutes for the full remaining set) — the remaining work is running GF-002B, not further feasibility study.
- **Catalog-only ships without a confirmed mechanical entity (concept/UNKNOWN) should remain selectable in a clearly identified planning-only state** — Commander Intent #2 explicitly allows this; GF-001 already found 0 crashes/invalid states among all 242 current catalog-only hulls, so this is already safe today, just not yet visually distinguished.
- **A Planning Mode indicator is required** to satisfy Commander Intent #2's "clearly identified" language — not implemented by this recon (UI change, out of scope) but flagged as a concrete GF-002B/UI follow-on requirement.
- **Unsupported Loadout actions should be disabled or explained**, not silently empty — same rationale, same out-of-scope flag for a follow-on UI mission.
- **Image coverage threshold:** GF-001 already reported 12/258 Commander-registry images, 246/258 on the universal fallback — this recon found no new image-source mechanism, so this threshold is unaffected by GF-002A and remains a separate, ongoing Commander-artwork-supply concern (`docs/ASSET_PIPELINE.md`).

## Commander decision points

1. **Authorize GF-002B** (scripted, manifest-driven acquisition per the Task 7 design) — the recon found no blocking technical obstacle; the only remaining question is Commander approval to spend the ~21-minute runtime and review the resulting raw-data promotion.
2. **Should GF-002B target all 294 ship-catalog records, or only the 242 currently-selectable catalog-only hulls?** The broader set future-proofs against ships that become flyable/catalog-listed later but aren't in `selectableShipDefinitions` yet.
3. **Should the M80/Starlite/MOLE seed-manufacturer data-quality errors (found incidentally in Task 3) be corrected in a dedicated small fix**, separate from mechanical re-import?
4. **Should a Planning Mode UI indicator be scheduled now**, given GF-002A confirms it's needed for full Commander-Intent compliance regardless of how much of GF-002B's import work is eventually done?

## Exact commands proposed for GF-002B (not run by this mission)

```
# 1. Generate/confirm the current entity-class manifest (already exists, read-only re-run):
npm run generate:ship-catalog

# 2. (New GF-002B script, not yet written) loop the manifest's entityClass values:
tsx scripts/acquireShipExports.ts --staging staging-data/raw-imports --manifest generated-data/ship-catalog.json

# 3. After Commander review of the acquisition report, promote approved files:
#    (manual copy or a small promotion script — not run by GF-002A or GF-002B automatically)

# 4. Only after promotion:
npm run import:ships
npm test
npx tsc -b
npm run build
```

## Documentation created

This GF-002A section, appended to the existing `docs/OPERATION_GOLDEN_FLEET.md` (the same file GF-001 created — no new file).

## Recommended commit message (if this section is approved)

```
docs(golden-fleet): add GF-002A source acquisition feasibility recon
```

---

# GF-002B — Canonical Fleet Batch Source Acquisition

**Status:** Complete. Every one of the 258 canonical selectable hulls now has a validated, staged StarBreaker export. Nothing was promoted into `raw-data/`, nothing in `generated-data/` changed, no Commander data touched.
**Acquisition date:** 2026-07-15 → 2026-07-16 (per-hull timestamps captured in the report; batch completed 2026-07-16T00:10:15.186Z)
**HEAD at mission time:** `e028962` (unchanged throughout — nothing committed by this mission)

## Objective

Turn GF-002A's proven feasibility into a deterministic, resumable, auditable tool that acquires and validates a real StarBreaker mechanical export for all 258 canonical selectable hulls — never writing into `raw-data/` or `generated-data/`. Promotion is reserved for GF-002C.

## Permanent tooling created

All under `scripts/goldenFleet/`, run via `vite-node` (not plain `tsx` — `selectableShipDefinitions` transitively imports `src/generated/shipCatalog.ts`, which uses Vite-only `import.meta.glob`; `vite-node` is already a transitive dependency of this project's `vitest` devDependency, formalized as a direct devDependency by this mission, not a new install):

- `types.ts` — shared types (`ManifestEntry`, `AcquisitionStatus`, `AcquisitionReport`, etc.)
- `manifest.ts` — builds the deterministic 258-row manifest from `selectableShipDefinitions` + `generated-data/ship-catalog.json`, including a lenient-but-ambiguity-honest seed-hull name resolver (`resolveSeedEntityClass`)
- `identityCheck.ts` — Task 4's exact-entity match protection, reusing the real importer's own `resolveShipEntity()` prefix-normalization rule
- `validator.ts` — runs a staged file through the real `StarBreakerImporter` → `ShipNormalizer` → `validateNormalizedPackage` pipeline in memory only
- `acquisitionRunner.ts` — orchestrates export → identity check → validation → classification, with resume/retry/timeout/overwrite-protection/quarantine, via an injectable `SpawnFn` for testability
- `realSpawn.ts` — the one real `child_process.spawnSync` call site
- `report.ts` — builds the machine-readable acquisition report
- `acquire.ts` — CLI entry point (dry-run, staging path, StarBreaker/P4K path, timeout, retries, force, limit flags)
- `__tests__/manifest.test.ts`, `__tests__/identityCheck.test.ts`, `__tests__/acquisitionRunner.test.ts` — 35 tests, all mocked process execution, zero real StarBreaker invocations in the normal suite

## Package commands added

```json
"golden-fleet:acquire": "vite-node scripts/goldenFleet/acquire.ts",
"golden-fleet:acquire:dry-run": "vite-node scripts/goldenFleet/acquire.ts -- --dry-run"
```

Plus `vite-node` promoted from an implicit transitive dependency to an explicit devDependency (`^2.1.2`, matching the already-installed version — no new package fetched).

## Staging directory

`staging-data/golden-fleet/` (project-local, newly gitignored this mission — see `.gitignore`). Contains one `<entityClass>.json` per exported hull, `acquisition-state.json` (resume bookkeeping), `acquisition-report.json` (the full machine-readable report), and an empty `quarantine/` subdirectory (nothing was ever quarantined this run).

## Data.p4k / StarBreaker metadata

| | |
|---|---|
| Data.p4k path | `C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Data.p4k` |
| Size | 162,736,189,440 bytes (~151.6 GB) |
| Modified | 2026-07-02T16:18:05.646Z |
| Branch / Version / P4ChangeNum | `sc-alpha-4.8.0` / `4.8.184.64329` / `12122953` (identical to GF-001/GF-002A — no drift) |
| StarBreaker path | `D:\StarBreaker-main\StarBreaker-main\target\release\starbreaker.exe` |
| StarBreaker version | `0.3.2` |
| StarBreaker SHA-256 | `7a6cba8a79a55ae0e247fdad08e35517158e3a877a2335355de6974c801eaa87` |

## Batch export results — every canonical hull reconciled to 258

| Status | Count |
|---|---|
| EXPORTED_VALID | 246 |
| ALREADY_VALIDATED | 12 (6 already covered by the approved `raw-data/*.json` files + 6 carried over from this mission's own earlier incremental test runs, both correctly resumed rather than re-exported) |
| NO_MECHANICAL_ENTITY | 0 |
| AMBIGUOUS_MATCH | 0 |
| EXPORT_FAILED | 0 |
| MALFORMED_OUTPUT | 0 |
| IDENTITY_MISMATCH | 0 |
| IMPORTER_REJECTED | 0 |
| OTHER | 0 |
| **Total** | **258** |

**Total runtime:** 2,064.3 seconds (~34.4 minutes) for the 246 freshly-exported hulls (~8.4s/hull average — real-world hulls vary more than GF-002A's 3-hull sample suggested). **Total staging size:** 79.62 MB.

**This is a clean, unqualified result: zero hulls hit any failure classification.** Every canonical selectable hull — including all 242 previously catalog-only hulls and all 10 seed-backed hulls — has a real, validated, identity-confirmed mechanical export.

## Port-count distribution (246 freshly-validated hulls)

| Ports | Count |
|---|---|
| 1–10 | 37 |
| 11–20 | 59 |
| 21–30 | 50 |
| 31–50 | 65 |
| 51–100 | 28 |
| 100+ | 7 |

Min 3, max 107, average 29.9 ports per hull. Zero hulls had 0 ports (the "0" bucket is empty by construction — a hull that reached validation always had a real, non-trivial port tree).

## Unknown Factory Item / normalization findings

- **Hulls with any Unknown Factory Item count > 0: 0** — every single one of the 246 fresh exports resolved 100% of its non-structural factory item references to a real component.
- **Duplicate slot labels: 0.**
- **Normalization errors: 0.** Normalization warnings and compatibility warnings: 0 across the board.

## Seed-backed hull comparison (Task 8)

All 10 seed-backed hulls now have a validated authoritative export:

| Hull | Entity class | Port count | Structural rows | Unknown Factory Item (fresh source) |
|---|---|---|---|---|
| 135c | `ORIG_135c` | 16 | 0 | 0 |
| Cutlass Red | `DRAK_Cutlass_Red` | 18 | 0 | 0 |
| F7C-S Hornet Ghost Mk II | `ANVL_Hornet_F7CS_Mk2` | 25 | 0 | 0 |
| M80 | `ORIG_m80` | 42 | 4 | **0** |
| MOLE | `ARGO_MOLE` | 16 | 2 | **0** |
| Prospector | `MISC_Prospector` | 14 | 2 | 0 |
| Railen | `GAMA_Railen` | 54 | 2 | 0 |
| Starlite | `MISC_Starlite` | 25 | 5 | **0** |
| UTV | `GRIN_UTV` | 4 | 0 | 0 |
| Vulture | `DRAK_Vulture` | 16 | 2 | 0 |

**M80 result:** 42 real ports (thrusters, cargo ramp, entrance ramp, fuel systems), **zero** Unknown Factory Item entries in the fresh source — SFM's current seed fixture's 10 Unknown Factory Item rows are entirely an SFM staleness artifact, not a CIG data gap.

**MOLE result:** 16 real ports, zero Unknown Factory Item, zero Invalid Target in the fresh source — the current seed fixture's 1 Invalid Target case does not reproduce against real, current mechanical data.

**Starlite result:** 25 real ports, **zero** Unknown Factory Item in the fresh source — the current seed fixture's 11 Unknown Factory Item rows are, like M80, entirely an SFM staleness artifact.

**Is current seed factory data stale? Yes, unambiguously**, for all three (M80, MOLE, Starlite) — real, complete, clean mechanical data is now available and staged for every one of them. **Should GF-002C promote deep-import data above seed mechanical data for these hulls?** This audit recommends yes for mechanical/factory data specifically — see the Commander decision points below; this mission does not decide it. **Should presentation metadata remain seed-backed?** Yes — nothing about this finding touches identity/presentation (name, ownership, priority, nickname), which stay correctly seed-authoritative per ADR-008's existing ruling; only the *mechanical* factory template is stale.

## Canonical and variant reconciliation (Task 7)

- **Total ship-catalog records with a resolved display name:** 288 (of 294 raw candidates — 6 have no resolved localization string and are excluded from `shipCatalogRecords`, unrelated to this mission).
- **Catalog records represented among the 258 selectable hulls' requested entity ids:** 256 unique entity ids (258 manifest rows resolve to 256 unique ids — see the duplicate finding below).
- **Legitimate extra variants not currently selectable:** 32 (e.g. `AEGS_Hammerhead_GS`, `AEGS_Idris_P_FW_25`, `ANVL_Ballista_EA_Outlaw`, various Fleet Week/tutorial/collector-edition variants) — these are real, named catalog records that EWO-021's own canonical-selection logic correctly did not surface as separate Add Ship entries (each already has a canonical sibling selected instead). **Add Ship was not expanded from 258 to 294/288 — confirmed.**
- **Multiple entities competing for one canonical hull:** none found.
- **Canonical hulls with no valid mechanical entity:** none (0 of 258).
- **A genuine, previously-undocumented finding — two canonical hulls independently resolve to the same entity class, never deduped by the existing canonical-selection logic:**
  - `prospector` (seed-backed) and `MISC_Prospector` (catalog-only) both resolve to entity class `MISC_Prospector`.
  - `starlite` (seed-backed) and `MISC_Starlite` (catalog-only) both resolve to entity class `MISC_Starlite`.

  **Root cause:** `src/data/shipDefinitions.ts`'s own `bareHullName()` dedup requires the definition's `.manufacturer` field to corroborate a stripped displayName prefix before trusting it — but Mission M-012's catalog `manufacturer.name` for these two ("Musashi Industrial & Starflight Concern") and `.code` ("MIS") both disagree with the literal "MISC" prefix embedded in the catalog's own `displayName` ("MISC Prospector", "MISC Starlite"). This is a **real, pre-existing SFM canonical-identity gap** (both hulls are separately selectable in Add Ship today), not introduced or worsened by this mission, and **not fixed here** — `NOT AUTHORIZED` explicitly forbids changing canonical selection/alias rules and `shipDefinitions.ts`. Flagged as a Commander decision point below. Both entries exported cleanly to the identical underlying file with no conflict (the second one triggered ordinary overwrite protection and reused the already-valid export).

## GF-002C readiness gate (Task 11)

All required gate criteria are met:

- ✅ Every canonical hull has a final classified status (258/258, zero `PENDING` remaining).
- ✅ All successful files pass identity validation (0 `IDENTITY_MISMATCH`).
- ✅ All successful files pass importer parsing (0 `IMPORTER_REJECTED`).
- ✅ Ambiguous matches are isolated (0 `AMBIGUOUS_MATCH` — none occurred, so there is nothing to isolate).
- ✅ No `raw-data/` or `generated-data/` file changed (confirmed via `git status` — both directories show only their pre-existing, unrelated dirty state).
- ✅ The promotion candidate set is explicit: **250 unique staged files** (corrected by GF-002B-V1 — see that section below; the original 246 figure only counted `EXPORTED_VALID` rows and missed 6 additional validated files this mission's own earlier tool-development runs had already staged under `ALREADY_VALIDATED`).
- ✅ Failures are reproducible and documented: there are zero failures to reproduce.
- ✅ The Commander can review coverage totals before promotion: this document + `staging-data/golden-fleet/acquisition-report.json` together provide a full per-hull audit trail.

## Exact GF-002C promotion candidate count

**Corrected by GF-002B-V1 to 250 unique files** (see that section below for the full reconciliation) — the figure below is preserved as originally written for the historical record, but undercounted by not including 6 hulls this mission's own earlier tool-development test runs (before the final full batch) had already validated and staged under `ALREADY_VALIDATED` rather than `EXPORTED_VALID`.

~~246 files~~ — every `EXPORTED_VALID` hull in `staging-data/golden-fleet/*.json`, excluding the 6 already covered by the approved `raw-data/*.json` files and excluding `acquisition-report.json`/`acquisition-state.json` themselves. The full per-hull list (name, entity class, port count) is in `acquisition-report.json`.

## Commander decision points

1. **Authorize GF-002C** (the actual promotion of the 250 unique staged, validated exports into `raw-data/`, followed by `npm run import:ships` regeneration) — this mission found zero blocking defects.
2. **Should the `prospector`/`MISC_Prospector` and `starlite`/`MISC_Starlite` duplicate-canonical-hull pairs be resolved** (a `shipDefinitions.ts` fix, out of GF-002B's authorized scope) before or independently of GF-002C's promotion?
3. **Should GF-002C promote the fresh M80/MOLE/Starlite mechanical data over the current stale seed fixtures**, given the clean, complete, zero-gap real data now staged for all three? (Recommended: yes, mechanically; presentation/identity stays seed-authoritative regardless per ADR-008.)
4. **Given the exceptionally clean batch result (zero failures across 246 exports), is a full GF-002C promotion in one pass acceptable**, or does the Commander want a smaller reviewed batch first despite the clean result?

## Recommended commit message (if this section and the tooling are approved)

```
feat(golden-fleet): add GF-002B batch source acquisition tooling and complete export
```

---

# GF-002B-V1 — Promotion Set and Duplicate Identity Reconciliation

**Status:** Verification and decision-support only, complete. No files promoted, no staged exports deleted, no `raw-data`/`generated-data`/canonical-identity/production-code changes made.
**HEAD at verification time:** `e028962` (unchanged).

## Reconciliation of all 258 acquisition records (Task 1)

Every one of the 258 canonical selectable definitions was cross-referenced against the live manifest, `staging-data/golden-fleet/acquisition-report.json`, the staging directory, and `raw-data/` directly (by searching each raw-data file's own content for its exact `EntityClassDefinition.<class>` string — not by filename guessing).

| Metric | Count |
|---|---|
| Validated files physically in `raw-data/` | 6 |
| Validated files physically in `staging-data/` | 250 unique (252 manifest rows reference staging-data; 2 of those rows point to a file already counted, see below) |
| Validated files elsewhere | 0 |
| Canonical definitions with no physical validated file | 0 |
| Unique validated physical files (total) | 256 |
| Unique mechanical entity identities | 256 |
| Duplicate canonical definitions sharing an entity | 2 pairs (4 canonical ids) |
| Total canonical definitions represented | 258 |

**All totals reconcile:** 258 canonical rows → 256 unique physical files (6 in `raw-data/`, 250 in `staging-data/`) → 256 unique entity identities, with exactly 2 entity identities each claimed by 2 canonical definitions (the Prospector and Starlite pairs below), accounting for the 258 − 256 = 2 "extra" rows.

## ALREADY_VALIDATED — full list and explanation (Task 2)

All 12 `ALREADY_VALIDATED` records, individually:

| # | Hull name | Canonical id | File path | Location | Why ALREADY_VALIDATED | Origin |
|---|---|---|---|---|---|---|
| 1 | 135c | `135c` | `staging-data/golden-fleet/ORIG_135c.json` | staging-data | Resume logic found a prior, still-valid staged file (`acquisition-state.json`) from this mission's own earlier `--limit 3` tool-development test run | GF-002B tool testing (this mission, prior to the final full batch) |
| 2 | Aegis Avenger Stalker | `AEGS_Avenger_Stalker` | `staging-data/golden-fleet/AEGS_Avenger_Stalker.json` | staging-data | Same — resumed from prior test run | GF-002B tool testing |
| 3 | Aegis Avenger Titan Renegade | `AEGS_Avenger_Titan_Renegade` | `staging-data/golden-fleet/AEGS_Avenger_Titan_Renegade.json` | staging-data | Same | GF-002B tool testing |
| 4 | Aegis Avenger Warlock | `AEGS_Avenger_Warlock` | `staging-data/golden-fleet/AEGS_Avenger_Warlock.json` | staging-data | Same | GF-002B tool testing |
| 5 | Aegis Gladius Dunlevy | `AEGS_Gladius_Dunlevy` | `staging-data/golden-fleet/AEGS_Gladius_Dunlevy.json` | staging-data | Same | GF-002B tool testing |
| 6 | Aegis Gladius Pirate | `AEGS_Gladius_PIR` | `staging-data/golden-fleet/AEGS_Gladius_PIR.json` | staging-data | Same | GF-002B tool testing |
| 7 | Avenger Titan | `avenger-titan-imported` | `raw-data/AEGS Avenger Titan.json` | raw-data | Manifest marks every `DEEP-IMPORTED` hull `alreadyInRawData: true` — already an approved source, never re-exported | Pre-existing repository data |
| 8 | Corsair | `corsair-imported` | `raw-data/DRAK Corsair.json` | raw-data | Same | Pre-existing repository data |
| 9 | Cutlass Black | `cutlass-black-imported` | `raw-data/DRAK Cutlass Black.json` | raw-data | Same | Pre-existing repository data |
| 10 | Eclipse | `eclipse-imported` | `raw-data/AEGS Eclipse.json` | raw-data | Same | Pre-existing repository data |
| 11 | Gladius | `gladius-imported` | `raw-data/AEGS Gladius.json` | raw-data | Same | Pre-existing repository data |
| 12 | Valkyrie | `valkyrie-imported` | `raw-data/ANVL Valkyrie.json` | raw-data | Same | Pre-existing repository data |

**Two distinct sub-populations, not one:** 6 are genuinely "already an approved raw-data source, nothing to do" (rows 7–12). The other 6 (rows 1–6) are **not** in `raw-data/` at all — they are real, validated, staged exports that this mission's own incremental tool-development runs (before the final unattended full batch) already produced and correctly resumed rather than re-exporting. **These 6 must be copied during GF-002C exactly like the 246 `EXPORTED_VALID` files** — they were never redundant with the 6 raw-data files, only misfiled by status label.

**Is the reported 246 promotion-candidate count correct? No.** Corrected count: **250** (246 `EXPORTED_VALID` + 6 `ALREADY_VALIDATED`-but-staged, minus 2 for the Prospector/Starlite duplicate pairs, which already share one physical file each rather than requiring two copies).

## Complete GF-002C source set (Task 3)

**A. Existing approved raw files to retain (6, unchanged):** `AEGS Avenger Titan.json`, `AEGS Eclipse.json`, `AEGS Gladius.json`, `ANVL Valkyrie.json`, `DRAK Corsair.json`, `DRAK Cutlass Black.json`.

**B. Staged files to promote (250 unique files):** all `staging-data/golden-fleet/*.json` files except `acquisition-report.json` and `acquisition-state.json`, which is 252 files on disk, minus 2 because the Prospector and Starlite pairs each already share one physical file (no second copy exists to promote).

**C. Staged files that duplicate an existing approved raw file:** **0** — the 6 raw-data files and the 250 staged files represent entirely disjoint entity classes; no overlap.

**D. Canonical definitions sharing one authoritative entity export:** 2 pairs — `prospector`/`MISC_Prospector` (both → `MISC_Prospector.json`) and `starlite`/`MISC_Starlite` (both → `MISC_Starlite.json`). Promoting one physical file serves both canonical ids' `shipFactoryTemplates` lookups once GF-002C's regeneration wires the lookup (a `shipDefinitions.ts` concern, not a file-count concern).

**E. Files that should not be promoted:** none identified — every staged file passed identity verification and importer validation with zero warnings.

**F. Missing files:** none — 0 of 258 canonical definitions lack a physical validated file.

| Metric | Value |
|---|---|
| Canonical-definition count represented | 258 |
| Unique entity count represented | 256 |
| Unique physical-file count | 256 |
| Files to copy into `raw-data/` during GF-002C | 250 |
| Expected final `raw-data/` file count after promotion | 256 (6 existing + 250 newly promoted) |

## Prospector duplicate audit (Task 4)

| Field | `prospector` (seed) | `MISC_Prospector` (catalog-only) |
|---|---|---|
| Display name | Prospector | MISC Prospector |
| Manufacturer | MISC (correct) | Musashi Industrial & Starflight Concern |
| Source category | SEED-BACKED | CATALOG-ONLY |
| Entity class (now known) | `MISC_Prospector` | `MISC_Prospector` |
| Stock role/focus | Solo Mining | Light Mining |
| Image key / source | `prospector` — **real Commander registry image** (`7rfmcpg9qcpmm/slideshow.jpg`) | `MISC_Prospector` — **no registry entry, falls to universal fallback** |
| Factory-template source (current, pre-GF-002C) | Seed-authored, 11 rows | Empty (`portIds: []`, Mission M-012 placeholder) |
| Seed-fleet relationship | Yes — one of the 12 original seed ships, migrated via the generic `migrateSeedFleetToAssets()` (id `prospector-asset-seed`) | No |
| Current Add Ship visibility | Visible | Visible (separately, as a second entry) |
| Existing aliases | None recorded | None recorded |
| Referenced in seed fleet / migration / image registry / tests / generated data / docs | seed fleet: yes; migration: yes (generic); image registry: yes (`SHIP_IMAGE_URLS.prospector`); tests: yes (existing seed-ship test coverage); generated data: no; docs: yes (seed ship lists) | seed fleet: no; migration: no; image registry: no; tests: no dedicated coverage found; generated data: yes (`ship-catalog.json` only); docs: only this Golden Fleet document |
| Materializes independently | Yes | Yes |
| Creates a distinct FleetAsset identity | Yes (`prospector-asset-seed` if seed-migrated, or a fresh `MANUAL` asset if separately added via Add Ship) | Yes (a separate `MANUAL` FleetAsset if a Commander ever added it via Add Ship) |

**Recommended canonical winner: `prospector` (the seed-backed id).** This is not a new judgment call — it is the exact outcome `definitionCompletenessRank()` already produces for every other seed-vs-catalog duplicate in the app (seed rank 1 beats catalog-placeholder rank 2); the only reason it didn't happen here is `bareHullName()`'s manufacturer-prefix-verification failing to strip "MISC" (displayName prefix) because neither the catalog's `manufacturer.name` ("Musashi Industrial & Starflight Concern") nor `.code` ("MIS") textually matches it — a pure string-matching gap, not a genuine identity ambiguity.

## Starlite duplicate audit (Task 5)

| Field | `starlite` (seed) | `MISC_Starlite` (catalog-only) |
|---|---|---|
| Display name | Starlite | MISC Starlite |
| Manufacturer | **Crusader (incorrect — see GF-002A's own finding)** | Musashi Industrial & Starflight Concern |
| Source category | SEED-BACKED | CATALOG-ONLY |
| Entity class (now known) | `MISC_Starlite` | `MISC_Starlite` |
| Stock role/focus | Future Gameplay | Light Refueling |
| Image key / source | `starlite` — **real Commander registry image** (`6cdv5u7nvigrn/slideshow.jpg`) | `MISC_Starlite` — **no registry entry, falls to universal fallback** |
| Factory-template source (current, pre-GF-002C) | Seed-authored, 11 rows | Empty (`portIds: []`) |
| Seed-fleet relationship | Yes — migrated via `migrateSeedFleetToAssets()` (id `starlite-asset-seed`) | No |
| Current Add Ship visibility | Visible | Visible (separately) |
| Existing aliases | None recorded | None recorded |
| Referenced in seed fleet / migration / image registry / tests / generated data / docs | seed fleet: yes; migration: yes (generic); image registry: yes (`SHIP_IMAGE_URLS.starlite`); tests: yes; generated data: no; docs: yes | seed fleet: no; migration: no; image registry: no; tests: none found; generated data: yes (`ship-catalog.json`); docs: only this document |
| Materializes independently | Yes | Yes |
| Creates a distinct FleetAsset identity | Yes | Yes |

**Recommended canonical winner: `starlite` (the seed-backed id)** — identical reasoning to Prospector. Note the seed's own `manufacturer: 'Crusader'` field is itself factually wrong (real manufacturer is MISC, per GF-002A) — a separate, pre-existing data-quality issue not fixed by this verification (no seed-data modification authorized).

## MOLE confirmation (Task 6)

**Confirmed: MOLE is not part of either duplicate-identity pair.** Direct search of `docs/OPERATION_GOLDEN_FLEET.md` shows every MOLE mention occurs only in the separate, correct context of the **M80/MOLE/Starlite mechanical-support-gap trio** (Task 4/8's Category B partial-mechanical-support finding — an entirely different issue: real port-tree gaps in the current seed fixture, not duplicate canonical identity). MOLE is never mentioned near the Prospector/Starlite duplicate-identity discussion anywhere in the document. **"Prospector/MOLE-Starlite pairs" was a writing typo in this mission's own prior chat-response prose** (not in the document itself) — no document correction was required, since the document never contained the incorrect phrase.

## Persistence and Commander-data risks (Task 21 context)

- Neither `prospector` nor `MISC_Prospector`, nor `starlite`/`MISC_Starlite`, currently has any special-cased persistence, migration, or test logic beyond the fully generic mechanisms every seed/catalog hull already goes through — confirmed via direct search (zero references to `MISC_Prospector`/`MISC_Starlite` anywhere in `src/` before this verification).
- **Risk to existing Commander data if a canonical fix is later implemented:** low but non-zero. If a real Commander has ever added `MISC_Prospector` or `MISC_Starlite` via Add Ship (browsing the full catalog, not just the common picks), that FleetAsset's `shipDefinitionId` would need the same safe-supersession aliasing (`supersededByCanonical`) EWO-021 already built for exactly this scenario — self-healing on next rehydration, no data loss, no manual migration needed. This is the existing, proven mechanism, not a new risk.
- No seed-ship FleetAsset (`prospector-asset-seed`, `starlite-asset-seed`) is at any risk — a seed-vs-catalog merge only ever aliases the *catalog* loser (per `supersededByCanonical`'s own established rule), never a seed winner's data.

## GF-002C decision options (Task 7)

**Option A — Resolve duplicate canonical identities before promotion.**
- Benefits: `raw-data/`/`generated-data/` end up clean from the start; no dual-entity confusion ever reaches Add Ship.
- Risks: requires a `shipDefinitions.ts` code change (fixing `bareHullName()`'s prefix-verification or adding a targeted alias) — out of this mission's authorization, needs its own reviewed mission.
- Effect on raw-data: promotion would only add 250 files (not 252), since the loser's file is simply skipped from the start.
- Effect on generated-data: `MISC_Prospector`/`MISC_Starlite` would never appear as separate `ships.json`/`ship-catalog.json`-sourced definitions once aliased.
- Effect on Add Ship: shows one Prospector, one Starlite — matches every other hull's behavior.
- Effect on persistence: none for existing data; the alias mechanism already handles a hypothetical existing `MISC_Prospector`/`MISC_Starlite` FleetAsset safely.
- Effect on Commander FleetAssets: none negative; only improves consistency.
- Test requirements: update/extend `shipDefinitions.test.ts`'s dedup coverage for this specific manufacturer-abbreviation case.
- **Recommendation: preferred long-term, but requires a separate, explicitly authorized code-change mission — not doable inside GF-002C's own promotion-only scope.**

**Option B — Promote all validated unique entities first, then resolve canonical duplicates before regeneration.**
- Benefits: unblocks GF-002C's file-promotion work immediately without waiting on a code-review cycle; the duplicate-identity fix becomes a smaller, independent follow-up.
- Risks: a short window where `raw-data/` contains a file serving two still-separate canonical ids — cosmetically odd but functionally harmless (both already materialize correctly today, just twice).
- Effect on raw-data: 250 files added, exactly as documented above.
- Effect on generated-data: unaffected until `import:ships` actually runs (GF-002C itself, separately gated).
- Effect on Add Ship: unchanged in this mission (still shows both) until the follow-up fix lands.
- Effect on persistence: none.
- Effect on Commander FleetAssets: none.
- Test requirements: none beyond GF-002C's own existing verification gate.
- **Recommendation: pragmatic, lowest-friction path — matches this mission's own "verification only, no promotion yet" charter and lets GF-002C proceed without being gated on an unrelated identity-ruling mission.**

**Option C — Preserve both canonical definitions while intentionally sharing one mechanical source.**
- Benefits: zero code change required at all; both hulls simply both resolve to real, complete mechanical data once GF-002C promotes the one shared file.
- Risks: perpetuates the confusing "same real ship listed twice" Add Ship experience indefinitely — the actual Commander-facing symptom that prompted this audit in the first place.
- Effect on raw-data/generated-data: identical to Option B.
- Effect on Add Ship: two entries remain, permanently, for the same real hull.
- Effect on persistence/Commander FleetAssets: none.
- Test requirements: none.
- **Recommendation: not recommended as a permanent end-state** — acceptable only as the short-term shape Option B temporarily produces, not as a deliberate final decision.

## Recommended sequencing

**Option B**, immediately followed by a small, separately authorized Option-A fix mission — promote now (GF-002C, using the corrected 250-file set), regenerate, verify; then fix the `bareHullName()` manufacturer-abbreviation gap as its own small, independently reviewed change.

---

# EWO-038 — Commander RSI Ship Image Registry import: Prospector/Starlite handling

EWO-038 (Commander RSI Ship Image Registry Import & Maintenance Pipeline)
imported the Commander's own RSI image workbook and, per its own Task 5,
was explicitly required to account for — but not resolve — the two known
duplicate-canonical-hull pairs documented above, using the exact
completeness-ranked winner already established here (`prospector`,
`starlite`).

- The workbook's "Prospector" and "Starlite" rows matched the seed-backed
  winner ids directly (`prospector`, `starlite`) and now carry a real
  Commander-supplied registry URL each — superseding the older registry
  values referenced in the tables above (the "Image key / source" rows'
  specific slideshow URLs are now historical; the resolution mechanism
  and winner identity they describe are unchanged).
- `MISC_Prospector` and `MISC_Starlite` (the catalog-only lesser siblings)
  each received their own row in the new
  `data-maintenance/ship-images/ship-image-master.csv` (one row per
  canonical selectable hull, per that mission's Task 3), but with `
  rsi_image_url` deliberately left blank and `match_method: EXISTING_ALIAS`
  — no duplicate runtime registry entry was generated for either, exactly
  as this document's Prospector/Starlite audits already established should
  happen once a winner is chosen.
- This does not implement GF-002D. The two lesser siblings remain
  separately visible in Add Ship, as documented above — only their image
  resolution was addressed, not their canonical-definition duplication.
  See `scripts/shipImages/duplicateCanonicalPairs.ts` for the exact,
  reviewed mapping and `docs/ASSET_PIPELINE.md`'s "EWO-038" section for
  the full pipeline this ran through.
