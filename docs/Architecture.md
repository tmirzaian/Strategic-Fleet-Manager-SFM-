# Strategic Fleet Manager — Architecture

## Mission

Strategic Fleet Manager (SFM) is a Star Citizen fleet-management platform designed to reduce cognitive load while preserving data integrity. It tracks owned ships, installed equipment, target builds, missing components, and future operational roles.

## Architectural principles

1. **Truth over convenience**  
   Unknown or unverified game data remains unresolved. SFM does not present guesses as facts.

2. **Stable canonical model**  
   External formats may change. SFM isolates those changes behind adapters and resolvers so downstream business logic remains stable.

3. **One responsibility per layer**  
   Each layer has a narrow purpose and must not absorb concerns belonging to another layer.

4. **Fail safe**  
   Malformed or incomplete data is excluded, warned about, or represented explicitly as unresolved.

5. **Main remains releasable**  
   Changes should build, test, and represent a known-good state before being committed to `main`.

6. **One architectural change per commit**  
   Commits should be small enough to review and revert independently.

## System layers

```text
External export / game data
        |
        v
Raw schema types
        |
        v
Compatibility adapters
        |
        v
Canonical normalization model
        |
        v
Authoritative metadata resolution
        |
        v
Classification and validation
        |
        v
Fleet / inventory / target-build domain logic
        |
        v
Application UI
```

## Current importer architecture

### Raw input

SFM currently supports:

- Legacy exports with a top-level `entity`
- StarBreaker exports with `root.entity`
- Legacy loadout nodes containing embedded structured component metadata
- StarBreaker loadout nodes containing entity identity and hierarchy

### Entity resolution

`resolveShipEntity(doc)` resolves either envelope and normalizes the `EntityClassDefinition.` prefix so stable IDs do not change when the exporter format changes.

### Loadout adaptation

`adaptLoadoutNodes()` is the sole branching boundary between legacy and StarBreaker loadout-node schemas.

Downstream normalization consumes `CanonicalLoadoutNode` only.

### Metadata gap

StarBreaker loadout nodes identify mounted entity classes and hierarchy but do not provide complete classification metadata such as:

- port type
- component category
- subtype
- size constraints
- grade
- class

This data must be resolved from an authoritative catalog. It must not be guessed from entity names.

## Domain boundaries

### Import and normalization

Responsible for:

- validating raw shape
- adapting versioned schemas
- producing stable canonical records
- recording warnings and unresolved data

Not responsible for:

- UI decisions
- fleet ownership
- inventory counts
- target-build comparison
- guessed component classification

### Metadata resolution

Responsible for:

- exact entity-class lookup
- verified component metadata
- provenance
- unresolved results
- filtering geometry or internal subcomponents when authoritative data supports that distinction

### Fleet domain

Responsible for:

- pledged and in-game ships
- ship roles and states
- current loadouts
- target loadouts
- missing-component calculations
- inventory allocation

### UI

Responsible for presenting domain state without reinterpreting raw exporter data.

Component search/selection (catalog-driven "add or install a component") and component display (an already-assigned Factory/Installed/Target value) are each governed by one shared, reused rendering contract rather than being reformatted independently per page — see `docs/UI_ARCHITECTURE.md` §16 ("Component presentation contract") and §16.1 ("Canonical component search renderer"). The Commander-facing install/remove workflow itself (Quick Update's Component → Ship → Loadout → Compatible Slot install path; Ship Detail's Loadout & Port Tree as the uninstall path) is documented in `docs/UI_ARCHITECTURE.md` §18.

**The generated component catalog (`src/generated/componentCatalog.ts`'s `catalogComponentsByName`, sourced from `generated-data/component-metadata-catalog.json`, Mission M-012) is the single authoritative component list for every Commander-facing selection workflow** — Hangar Inventory, Quick Update, the Loadout Manager, and Decision Center all search and resolve against this exact same map; no page maintains its own separate or demo-only component list (EWO-031, Task 1). `CatalogComponentSearch` (§16.1) additionally never truncates it — a blank search browses the complete, alphabetically sorted catalog, and typed search is filtered from that same complete set (EWO-031, Task 2/3). See `docs/UI_ARCHITECTURE.md` §16.2–16.3.

**`src/components/ShipCard.tsx` is the single canonical Ship Card for Beta 1.0** (EWO-032) — Fleet Dashboard, Mission Control, and every future ship-grid surface (Fleet Roadmap, Squadron views) render this one component; no page maintains its own card layout. The prior Mission Control-only card (`ShipRecordCard`/`PriorityCard`) is retired (kept on disk, not deleted, pending Commander verification). See `docs/UI_ARCHITECTURE.md` §19.

## Fleet ownership and persistence

The hand-authored seed fleet (`src/data/seed.ts`) is demo/sample data, not
user data — but a user can remove, rename, or re-own a seed ship, and
that action is real user data the moment it happens. The store persists
these as a small per-id diff (`seedAssetOverrides`, see
`src/store/useFleetStore.ts`) layered on top of the seed bake-in at
rehydration time, rather than replaying the seed fleet's hand-authored
Builds through the generic Fleet Asset materializer (which would discard
them).

**A persisted-but-empty fleet is a valid state, not a sign of missing or
corrupted storage.** `localStorage` having no entry at all for
`sfm-fleet-store` (a true first-ever load) is architecturally
distinguishable from an entry that exists and legitimately describes zero
ships — the store exposes this as `hasPersistedState`. Demo data is only
ever loaded fresh on that true first-ever case; once real persisted state
exists, nothing may silently repopulate it.

## Authoritative application catalogs (Mission M-012)

Two full-universe catalogs, generated from the frozen LIVE 4.8 P4K via
bulk DataCore field queries (see
`docs/ADR/ADR-005-Authoritative-Application-Catalogs.md`), widen Add Ship
and component selection/validation beyond the original narrow seed/demo
scope: a ship/ground-vehicle roster (`generated-data/ship-catalog.json`,
294 records) and the full player-usable component universe
(`generated-data/component-metadata-catalog.json`, widened from M-007's
~90-entity scope to 1,109 player-usable records). Both stay gitignored
pending the same licensing decision ADR-003 already tracks, and the
browser app degrades gracefully (falls back to the pre-existing narrower
roster/table) when a local machine hasn't generated them.

The ship catalog is a lightweight identity/classification roster, not a
replacement for the deep, per-ship normalized port-tree pipeline below —
see ADR-005's "Scope boundary" section.

**Fleet ownership source and sync authority** (see
`docs/ADR/ADR-004-Fleet-Ownership-Sync-Authority.md`): every Fleet Asset
will eventually carry an `ownershipSource` (`rsi` / `in_game` / `loaner` /
`manual`) that determines who is authoritative when a future
RSI/CCUGame/LTP sync runs — RSI-sourced assets reconcile automatically
(including pledge upgrades), in-game and loaner assets go through an
explicit missing/expired review step rather than a hard delete, and
manual assets are never touched by sync. The reconciliation engine itself
is future work; this repo currently only implements the narrower
persistence guarantee above.

## Engineering roles

- **Founder / Product Owner:** Todd Mirzaian
- **Chief Architect:** ChatGPT
- **Implementation Engineer:** Claude Code

## Version-control standard

- Branch: `main`
- `main` should remain buildable and reviewable.
- Commit messages should describe one coherent change.

Examples:

```text
fix(normalizer): support StarBreaker root.entity envelope
feat(normalizer): adapt StarBreaker loadout nodes
feat(metadata): resolve component entities from catalog
test(import): certify Gladius StarBreaker fixture
docs(architecture): record metadata resolution decision
```
