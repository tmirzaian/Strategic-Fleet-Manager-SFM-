# Strategic Fleet Manager — Roadmap

## Alpha 2.5D

### Complete

- Local repository cleanup
- VS Code and Claude Code workflow
- Git repository initialization
- Strict StarBreaker JSON output
- Legacy and `root.entity` envelope compatibility
- Stable entity-prefix normalization
- Legacy and StarBreaker loadout-node adapter
- Focused adapter and envelope tests
- Authoritative component metadata-source investigation (Mission M-006)
- Component Catalog Generator, local-only, gitignored (Mission M-007)
- Component Metadata Resolver + enrichment integration (Mission M-008)
- Deterministic DataCore-to-SFM classification translation layer (Mission
  M-009) — the real Gladius fixture now produces classified,
  player-facing equipment ports instead of zero
- Equipment relationship resolution fix + full golden fixture
  reconciliation (Mission M-010) — Quantum Drive now resolves to itself
  (Beacon) instead of its nested Jump Drive (Explorer), the Jump Drive is
  independently represented, and `goldenFixture.ts` is reconciled against
  the authoritative LIVE 4.8 result (14/14, zero failures)
- Real AEGS Avenger Titan fixture restored via StarBreaker
  `entity export --dump-hierarchy` against the frozen LIVE 4.8.184.64329
  install (Mission M-011A) — replaces the missing/synthetic fixture with
  a real one; component catalog regenerated to cover both ships (82
  entities, 0 unresolved); **full test suite passes, 508/508, zero
  failures**
- UI Port-Tree Integration and Hangar Inventory Cleanup (Mission M-011) —
  Ship Detail and Loadout Manager now share one authoritative,
  recursively-nested port tree (exposing previously-hidden hardpoints
  such as the Ghost Mk II nose mount and its two child weapon positions);
  Hangar Inventory's Qty/Owned columns removed per product decision
- Persistence incident fix + fleet ownership policy — deleting one ship,
  or every ship, now survives a genuine browser refresh; a persisted
  empty fleet is a valid state distinguishable from "no save exists yet"
  (`hasPersistedState`); Hangar Inventory, Fleet Dashboard, and Mission
  Control all render a deliberate Quartermaster-branded empty state
  instead of a blank page; see
  `docs/ADR/ADR-004-Fleet-Ownership-Sync-Authority.md` for the ownership
  model this fix was scoped against — **full test suite passes,
  547/547, zero failures**
- Quartermaster Universe Provisioning (Mission M-012) — authoritative
  ship/vehicle roster (294: 262 ships, 32 ground vehicles) and
  player-usable component universe (1,109 components across
  weapons/shields/coolers/power plants/quantum & jump drives/missile
  racks & missiles/radar/life support/relays/tractor beams/mining &
  salvage heads/bombs/mounts), discovered via bulk DataCore field
  queries against the frozen LIVE 4.8.184.64329 P4K — no per-record
  StarBreaker spawns, no hardcoded ship-name list. Wired into Add Ship
  search and component selection/validation/inventory autocomplete. See
  `docs/ADR/ADR-005-Authoritative-Application-Catalogs.md` — **full test
  suite passes, 587/587, zero failures**

### Active

- Test baseline reconciliation

### Remaining

- Complete import certification
- Component `displayName` prettification for catalog-derived components
  (currently renders as a raw entity-class string in the legacy
  narrow-path/import-pipeline scope — Mission M-012 separately resolved
  real localization for the new full-universe catalogs; the two
  mechanisms remain unmerged — documented limitation)
- `Armor` and `CargoGrid` (confirmed present in the real Avenger Titan
  fixture) and other unrecognized DataCore categories still have no
  translation rule (deliberate; needs a product decision)
- Full build/test verification
- Alpha 2.5D freeze
- Deep, per-ship port-tree normalization for the ~292 catalog-only ships
  Mission M-012 added to Add Ship's roster (each ship requires its own
  `entity export --dump-hierarchy` + classification + equipment
  resolution pass, the same multi-mission effort Gladius/Avenger Titan
  took — M-006 through M-011A) — until then, those ships materialize
  with an empty factory template (documented, honest limitation, not a
  crash)
- Full RSI/CCUGame/LTP sync + reconciliation engine (ownership-source
  authority rules, `missing_from_sync`/`loaner_expired` lifecycle,
  reconciliation summary UI) — deliberately not built by the persistence
  incident fix; see ADR-004
- "Computer/Avionics" component category (no distinct DataCore `Type`
  value maps to it cleanly — see ADR-005)

## Beta

- **EWO-038 — Commander RSI Ship Image Registry Import & Maintenance
  Pipeline (complete)**: `src/data/shipImageRegistry.ts` is now a
  generated file, regenerated deterministically from a Commander-editable
  CSV (`data-maintenance/ship-images/ship-image-master.csv`) rather than
  hand-edited — no TypeScript editing required for any future coverage
  update. Imported the Commander's own 221-row RSI URL workbook
  (`data-maintenance/ship-images/Commander RSI URL Master.xlsx`,
  read-only, no images downloaded or redistributed) against all 258
  canonical selectable hulls via a controlled, non-fuzzy name-matching
  precedence (`scripts/shipImages/`) that never collapses legitimate
  variants (600i Explorer vs Touring, Hercules A2/C2/M2, Cutlass Black vs
  Red, ...). Result: 214 of 258 hulls (82.9%) now resolve a real
  Commander-supplied image, up from 12; the remaining 44 (including 7
  workbook rows with no canonical counterpart today — ATLS, Basher,
  Pitbull, and others, correctly reported rather than invented) use the
  existing universal fallback, unchanged. Three permanent npm commands
  (`ship-images:import:xlsx` / `:generate` / `:check`) make future
  coverage updates a CSV edit + one command, never a code change. The
  known pre-existing Prospector/MISC_Prospector and
  Starlite/MISC_Starlite duplicate-canonical-hull pairs (Operation Golden
  Fleet, GF-002B-V1) were explicitly accounted for — image resolves only
  to the completeness-ranked winner, no duplicate runtime entry for the
  catalog-only sibling — without implementing the separate, still-pending
  GF-002D identity merge. See `docs/ASSET_PIPELINE.md`'s "EWO-038"
  section and `docs/OPERATION_GOLDEN_FLEET.md`'s EWO-038 addendum.
- **EWO-035 — Mission Control Visual Completion & Beta Artwork Integration
  (complete)**: the first real production artwork lands in the app.
  Mission Control's Fleet Operations region now renders the
  Commander-supplied "Operations Wall" hero (`mission-control-operations-wall.webp`)
  through the existing, previously-dormant `PageEnvironment`/
  `environmentAssets.ts` pipeline (Mission M-022) — `enabled: true`, one
  `sources.desktop` entry, no component or CSS change. The "Found Loot?
  Check It." and "Something Changed?" `WorkflowDestinationCard`s (EWO-011)
  likewise now render Commander-supplied illustrations
  (`decision-center-found-loot.webp`, `quick-update-maintenance.webp`)
  through the existing `workflowAssets.ts` registry — both flipped from
  `enabled: false` to `enabled: true` with a real `src`, no change to
  `WorkflowDestinationCard.tsx` itself. All three files live under
  `public/assets/environments/mission-control/`, the canonical Beta
  artwork location. This is Beta 1.0 artwork; a future Release 2.0
  Quartermaster Edition commission may replace any of the three files
  later with no consumer changes, same resolution-boundary guarantee as
  every other asset registry in this pipeline. See
  `docs/ASSET_PIPELINE.md`'s "EWO-035 — Beta Artwork Integration" and
  `docs/UI_ARCHITECTURE.md` §11–12.
- **EWO-033A — Beta Ship Image Coverage & Universal Fallback Standardization
  (complete)**: real registered ship photography and the universal fallback
  artwork now share the exact same frame-filling `object-cover` presentation
  and the exact same fixed hero/card dimensions — the fallback previously
  rendered `object-contain` (a small object inside a disproportionately large
  blank region, root-caused to both candidate fallback PNGs being square
  1024×1024 assets) and `ShipHeroFrame` grew taller for a fallback than for a
  real photo. Confirmed `SHIP_PLACEHOLDER_URL` (via `resolveShipImage()`) is
  Beta 1.0's one universal fallback source — the separate, unused
  `FLEET_REGISTRY_PLACEHOLDER`/`resolveFleetRegistryImage()` path is now
  explicitly marked `@deprecated` (zero live callers, confirmed by exhaustive
  grep), not deleted. `src/data/shipImageRegistry.ts` remains the Commander's
  one file to maintain (one canonical id, one HTTPS URL, no generation step);
  end-to-end resolution precedence (registry → existing image → fallback) was
  audited across seed, deep-imported, catalog-only, aliased, and freshly-added
  Fleet Assets with no bypass found. Coverage as of this mission: 258 total
  canonical selectable hulls, 12 resolving a registered image, 246 to the
  universal fallback, 0 orphan/duplicate/malformed registry keys — Beta 1.0
  ships with a **production-ready universal fallback and a stable visual
  presentation**, not full photo coverage; incremental Commander-supplied URL
  coverage continues after this mission. See `docs/UI_ARCHITECTURE.md` §19.2
  and `docs/ASSET_PIPELINE.md`.
- **EWO-033 — Beta Ship Card Lock Correction & Stock Role Normalization
  (complete)**: Fleet Dashboard now shows a Priority wrapper above every
  card in Card view, always (previously none, despite Priority sort
  already existing); Mission Control now shows the Top 4 Priority Fleet
  Assets (was 3), in a responsive grid using the same breakpoint
  thresholds Fleet Dashboard's own grid uses. `ShipCard` gained one
  canonical dimension contract — four structural regions (image,
  identity, Active Loadout, readiness/status), each with a reserved
  minimum height, present identically regardless of `buildState` — so
  cards never render at different heights within the same grid based on
  content alone. Traced and fixed why the secondary identity line
  ("Manufacturer · Stock Role/Focus") was populated for some hulls
  (Cutlass Red, 135c) but blank for others (Cutlass Black, Eclipse,
  Gladius): `Ship.role` mirrors the active Build's role text, not stock
  metadata, and three deep-imported hulls' own `ShipDefinition.role` is
  genuinely empty (a real gap in the raw StarBreaker export envelope, not
  a wiring bug). Added `resolveShipStockRoleFocus()`, a documented
  precedence resolver falling back to Mission M-012's own catalog data for
  those exact hulls — **100% of the 258 canonical selectable hull
  definitions now resolve a real stock role/focus.** See
  `docs/UI_ARCHITECTURE.md` §19.1, `docs/DataModel.md`'s "Stock role/focus
  vs. operational role," and `docs/ImportPipeline.md`'s "Current known
  gaps" #8. **Approved next mission: EWO-034 — Unique Fleet Priority
  Ranking** (not implemented by this mission — existing duplicate/gapped
  priorities are deliberately left as-is per Design Authority Ruling 7).
- **EWO-032 — Universal Ship Card Standardization (Beta UI Lock)
  (complete)**: Mission Control's Priority Cards now render the exact same
  `ShipCard` component Fleet Dashboard uses (verified byte-identical via
  an automated `outerHTML` comparison test) — no duplicate card
  implementation anywhere in the app. `ShipCard` is declared the
  application's one canonical Ship Card (Fleet Dashboard, Mission Control,
  and any future Fleet Roadmap/Squadron view). A lightweight "PRIORITY N"
  label now renders above each card (the only Mission-Control-specific
  concept) instead of as a badge inside it; the whole card is the
  navigation target (the old "Ship Detail →" hyperlink is gone, matching
  Fleet Dashboard's existing click-anywhere behavior exactly); Priority
  ordering/slicing logic is unchanged (presentation-only migration). The
  prior Mission Control-only card (`ShipRecordCard`/`PriorityCard`) is
  retired — kept on disk, not deleted, pending Commander verification.
  Quartermaster Edition visual enhancements remain deliberately deferred
  to a future Beta sprint. See `docs/UI_ARCHITECTURE.md` §19.
- **EWO-031 — Canonical Catalog Completion & Final Workflow Validation
  (complete)**: `CatalogComponentSearch`'s blank-search listbox no longer
  truncates at 40 entries — it browses the complete, alphabetically
  sorted 679-component canonical catalog, with typed search filtered from
  that same complete set (both confirmed discoverable across
  Weapons/Shields/Coolers/Power Plants/Quantum Drives/Missile
  Racks/Missiles/Mining/Salvage). Decision Center's ~8-item hand-authored
  demo lookup (`decisionCatalog`/`decisionCatalogNames`) is removed
  entirely — it now searches the same canonical catalog as every other
  page and recommends KEEP/Reserve/Needed By or Already
  Satisfied/Store-in-Hangar against real, live Active-Loadout demand
  (`resolveNeededByBuilds()`), never a static guess. Canonical Factory
  Template Audit: traced and fixed the root cause of Origin 135c's
  "Unknown Factory Item" bug — a hand-authored `seed.ts` gap, not an
  importer defect — and found + fixed the identical gap on five more seed
  ships (UTV, Mole, Cutlass Black, Vulture, Prospector); Starlite and M80
  remain deliberate, documented exceptions. See `docs/UI_ARCHITECTURE.md`
  §16.2–16.3 and `docs/ImportPipeline.md`'s "Current known gaps" #7.
- **EWO-030 — Quick Update Workflow Simplification & Ship Detail Component
  Removal (complete)**: Install Component now walks Component → Ship →
  Loadout → Compatible Slot (filtered to type/size-compatible,
  not-yet-fulfilled hardpoints via `isComponentSelectableForPort()`; a
  single compatible slot auto-selects); the canonical catalog search
  renderer (`CatalogComponentSearch`, extracted from Hangar Inventory's
  own Add New Item search) now backs both Quick Update's Install
  Component and Add Component to Hangar steps, so the search experience
  never drifts between pages. "Remove Component" is hidden from Quick
  Update — Ship Detail's Loadout & Port Tree is now the official
  uninstall workflow (Remove → optional Return to Hangar → Save, on
  every installed row). "Move Component Between Ships" is likewise
  hidden pending the roadmap item below; both hidden workflows'
  implementation is untouched, only unreachable through Quick Update's
  own UI. See `docs/UI_ARCHITECTURE.md` §16.1 and §18.
- Fleet dashboard stabilization
- Current-versus-target build workflows
- Missing-target aggregation
- Inventory integration
- **EWO-022 — Local Fleet Registry Asset Pipeline / Release 2.0
  Quartermaster Edition imagery** (not started; deferred past Beta 1.0 —
  do not describe this as "Beta 2.0"): replaces the interim external RSI
  URLs in `src/data/shipImageRegistry.ts` (EWO-021A) with locally managed,
  commissioned SFM ship artwork and a richer branded presentation — source
  art separated from optimized runtime derivatives, deterministic
  generation, assets under
  `public/assets/fleet-registry/<manufacturer-slug>/`, no runtime
  dependency on RSI availability — while preserving the same canonical
  ship-id resolution boundary `resolveShipImage()` already established,
  so no consumer changes when it lands. Beta 1.0 (EWO-033A) ships RSI URL
  coverage plus a universal production fallback and a stable, locked
  visual presentation; Release 2.0 is the commissioned-imagery upgrade on
  top of that same resolution boundary (see docs/ASSET_PIPELINE.md)
- Import UX and warning presentation
- User-data persistence and migration strategy
- **Move Component Between Ships** — hidden from Quick Update's UI as of
  EWO-030 (implementation intact, unreachable through the page's own
  buttons); re-exposing it is a UI-only change when prioritized.

## Post-Beta

- Additional exporter/API integrations
- P4K catalog refresh workflow
- SPPV integration evaluation
- Organization logistics
- Crafted-quality support when the game data is stable enough
- Insurance/loadout-state evolution
- **SUP-001 — Support & About Framework**: Captain's Log evolves from a
  pure activity log into the app's support/about hub — About, Support,
  Discord, GitHub, Release Notes, Roadmap, Known Issues, and
  Documentation sections.
- **UI-008 — Improved Search Experience**: when a search returns no
  results, show a real, informative empty state instead of a blank list —
  "No ships found. Catalog Certified: Star Citizen 4.9.186. Try another
  search." Smarter matching and suggestions are a longer-term follow-up
  (see RWO-005).
- **RWO-003 — Progressive Release Strategy**: the intended distribution
  path for SFM over time — Development (VS Code/npm) → Beta (GitHub ZIP
  download + `Setup.bat`/`Start.bat`) → Release 1.0 (Windows installer,
  desktop shortcut) → Mature Product (auto-updater, support portal,
  optional Discord integration, optional update notifications, community
  ecosystem).
- **RWO-004 — Privacy & Telemetry Policy**: SFM remains local-first — no
  telemetry, no fleet uploads, no analytics, no account required. If
  optional anonymous analytics are ever introduced, they must be opt-in,
  clearly documented, and must never include fleet or inventory data.
- **RWO-005 — Search Experience Improvements**: better "no results"
  messaging (see UI-008), fuzzy matching, search by manufacturer, search
  by nickname, search by class, and highlighting newly added ships after
  a catalog update.
- **ARCH-007 — Dedicated Test Fixtures**: replace tests that depend on
  real, live ship coverage (e.g. a test asserting a specific hull has no
  registry image, which breaks the moment the Commander's own workbook
  gains a real entry for it — observed in practice with AEGS_Javelin)
  with stable synthetic fixtures, so expanding the Commander workbook or
  promoting new Golden Fleet content never requires updating unrelated
  tests.
- **ARCH-008 — Countermeasure Launchers (Chaff/Flare/Decoy/Noise)**:
  reconnaissance (SW-013C.2E) confirmed real, currently-invisible
  equipment on every single ship in the Architectural Certification Fleet
  (Ghost, Eclipse, Retaliator, Guardian Qi, Mantis, Warlock) — DataCore
  category `WeaponDefensive`, one or two real launcher ports per ship
  (e.g. `hardpoint_countermeasure_launcher_left`/`_right`), consistently
  unclassified. This is the clearest, best-evidenced next-mission
  candidate from that audit: a real, ship-level, Commander-relevant
  survivability system, not a cosmetic/habitation item (unlike the
  audit's other findings — personal lockers, fire extinguishers, cockpit
  MFDs — which were correctly NOT recommended). Candidate presentation:
  a new canonical port type/equipment group under the existing "Support
  Systems" top-level section (alongside Relay/Life Support/Electronic
  Warfare), reading Chaff/Flare/Noise/Decoy per the specific real device
  installed — following the exact same activation pattern already proven
  for Module (SW-013C.2B) and Electronic Warfare (SW-013C.2D): one or two
  new `classificationTranslator.ts` rules, no importer redesign. Not yet
  scoped or approved for implementation — reconnaissance only.
- **ARCH-009 — Fleet-Wide Dormant Hardpoint Candidates**: SW-013C.2G
  built and certified a generic Dormant Hardpoint Materialization
  mechanism (see `docs/ADR/ADR-014-Configurable-Slot-Architecture.md`'s
  own SW-013C.2G amendment) against exactly one individually-proven case
  — the F7C-S Hornet Ghost Mk II's Nose Weapon mount — and then ran a
  fleet-wide reconnaissance audit (`scripts/generateDormantHardpointAudit.ts`,
  output `generated-data/dormant-hardpoint-audit.json`) to find every
  OTHER ship in the corpus with a real geometry node absent from its own
  `loadout`. Per the work order's own explicit instruction, none of these
  were activated merely because the mechanism now exists — each requires
  its own per-candidate evidence review and dedicated test coverage
  before implementation. Current audit totals: 31 Confirmed, 498
  Probable, 3,278 Needs Investigation (plus 1,984 suppressed as known
  non-equipment / fleet-wide system markers — antennae, seats, paint,
  landing gear, etc.). Highest-value next candidates, by evidence
  strength:
  - **Confirmed tier (swap group + consistent-category donor)** — e.g.
    the Idris-P's `hardpoint_nose_railgun` (Military/Collector variants,
    donor: Idris-M's S10 mass driver, swap group `$AEGS_Idris_Nose`, 5
    eligible members) and the Hornet F7C/Wildfire's own
    `hardpoint_class_4_nose` (donor: F7A Mk I's confirmed nose turret,
    swap group `ANVL_Hornet_Center`, 4 eligible members) are the
    strongest-evidenced candidates after the Ghost — both are the exact
    same evidentiary shape SW-013C.2G already proved out.
  - **Probable tier (consistent-category donor, no confirmed swap
    group)** — e.g. `hardpoint_scanner` (Radar) appears dormant on
    several ships with a consistent single-category donor family
    (`ARGO_MPUV` variants) but lacks swap-group confirmation; would need
    that confirmation gathered before it could ever reach Confirmed.
  - **Known audit limitations to account for before treating ANY entry as
    ready to implement** — the audit's blind cross-fleet `internalName`
    matching produces both false positives (e.g. the Asgard's
    `hardpoint_weapon_wing_left`/`_right` mixes a Valkyrie remote turret
    donor with an unrelated family of VariPuck gimbal mounts sharing the
    same node name coincidentally — a human must resolve which, if
    either, is the right shape before materializing) and at least one
    false negative (the Ghost's own `hardpoint_weapon_nose` itself scored
    only "Needs Investigation" in the generic audit, because its donor
    set includes an unrelated Vanduul Mauler cannon; SW-013C.2G's actual
    Confirmed status required additional manual narrowing to the
    Hornet-specific swap group that the generic audit does not do
    automatically). Treat the audit as a triage tool for human review,
    never an auto-activation list.
