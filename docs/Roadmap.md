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
- **EWO-022 — Local Fleet Registry Asset Pipeline**: replaces the interim
  external RSI URLs in `src/data/shipImageRegistry.ts` (EWO-021A) with
  locally generated SFM ship artwork — source art separated from
  optimized runtime derivatives, deterministic generation, assets under
  `public/assets/fleet-registry/<manufacturer-slug>/`, no runtime
  dependency on RSI availability — while preserving the same canonical
  ship-id resolution boundary `resolveShipImage()` already established,
  so no consumer changes when it lands (see docs/ASSET_PIPELINE.md)
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
