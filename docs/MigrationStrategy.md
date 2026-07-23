# Configurable Slot Migration Strategy

> **Status: design only.** Companion to `docs/ADR/ADR-014-Configurable-Slot-Architecture.md`. No implementation, no migration code, and no catalog regeneration authorized by this document.

## Principle

**Migration shall require zero Commander intervention.** This mirrors the existing, already-proven discipline in `useFleetStore.ts`'s persistence `migrate()` function (structural validation only — `isValidPersistedFleetAsset`/`isValidPersistedBuild`/`isValidPersistedHardpoint` — never a destructive rewrite) and CAT-001A's own hard-won rule ("an existing Commander's persisted profile is never reset by this fix"). The Configurable Slot feature adds new, additive facts to the canonical topology; it does not require rewriting anything a Commander already owns.

## What does and does not need migration

### Does NOT need migration (additive only)

- **Existing ships.** A ship's `Port[]`/`Hardpoint[]` rows produced by Stages 1-6 of the import pipeline are completely unchanged by Import Pipeline v2 (Stage 9's merge only *adds* `ConfigurableSlot` nodes for ports the geometry graph never had a row for at all — see `ImportPipeline-v2.md`'s Merge Strategy, Authority Precedence). A ship with zero configurable slots (the overwhelming majority, until a fresh catalog-generation sweep runs) is byte-for-byte unaffected.
- **Existing inventory.** Hangar Inventory records are keyed by component identity (entityClass-first, per ADR-010/EWO-STAB-004A), never by slot. Nothing about Configurable Slots changes how an owned component is identified, counted, or reserved.
- **Existing builds / target loadouts.** A `Hardpoint.targetItem`/`targetEntityClass` already set (by a Commander, by Factory default, or by a saved Build) is never touched by this feature. A Configurable Slot only becomes relevant the moment a Commander looks at a port that previously had **no row at all** — for every port that already has one, today's behavior is the whole story.

### DOES need a one-time regeneration (not a data migration)

- **The generated component/ship catalogs** (`generated-data/component-metadata-catalog.json`, `generated-data/ship-catalog.json` and their committed runtime subsets) need `npm run generate:component-catalog`/`generate:ship-catalog`-class tooling extended (Stages 7-9) and re-run — exactly the same "developer runs a generator, commits the small runtime subset" pattern already established for CAT-001/CAT-002's classification work. This is generation, not migration: no Commander-owned data is read or written by this step.

## Persisted Commander Data — explicit risk analysis

Per the Chief Architect's own required inclusion, this migration strategy explicitly folds in **R-004 — Persisted Component Reference Drift** (full detail in `EngineeringRiskRegister.md`):

`useFleetStore.ts`'s `migrate()` validates the *shape* of a persisted `Hardpoint`/`FleetAsset`/`Build` record (via `isValidPersistedHardpoint` and siblings) but never re-resolves a persisted component name string against the *current* catalog. This is a pre-existing characteristic of the persistence layer, not something Configurable Slot support introduces — it was directly observed during the ADR-004/SW-009A Amendment 1 relic investigation (a hand-typed seed value, "Snowblind," persisted with a casing mismatch against the real catalog's "SnowBlind," went undetected by every existing migration check because those checks never compare component identity, only record shape).

**Relevance to this feature specifically:** once Configurable Slots exist, a Commander's chosen `targetItem` for a newly-surfaced slot becomes a real, persisted `Hardpoint.targetItem`/`targetEntityClass` pair exactly like any other target selection today — subject to the exact same drift risk as every other persisted component reference, no better and no worse. This feature does not create a new category of risk; it adds new instances of an existing, already-documented one.

**This ADR does not propose fixing R-004** (out of scope — Non-Goal, "no data migration"). It requires that R-004 be explicitly visible to whoever eventually plans Configurable Slot implementation, since a Configurable Slot's swap-group eligible-set (`SwapGroupSpecification.md`) is itself catalog-generation-time data subject to the same "regenerated, never migrated" characteristic — a stale local catalog would show a stale eligible set, not corrupt any persisted Commander data.

## Rollback

Because the feature is purely additive (new `ConfigurableSlot` nodes attached to the existing normalized package, new optional fields, no schema version bump required for existing `Hardpoint`/`Build`/`FleetAsset` shapes), rollback is a code revert plus a catalog regeneration — no persisted-state rollback procedure is needed. A Commander's browser storage requires no special handling to move backward across a Configurable Slot implementation/rollback boundary.

## Recommended sequencing (non-binding — implementation's call)

1. Ship Import Pipeline v2 (Stages 7-9) and regenerate catalogs for the small, hand-verified vessel sample already proven in ADR-014 (Hornet Mk II, Retaliator, Scorpius, MOTH) — Commander-visible effect: zero, until UI work (separately authorized) consumes the new data.
2. Only after the full-hull sweep (ADR-014's Open Investigations) is complete and reviewed, regenerate catalogs for the full fleet.
3. UI exposure (separately authorized, not designed here) can then be enabled without any further data-side migration step.

## Non-Goals

No migration code, no schema version bump, no catalog regeneration performed by this document, and no resolution of R-004 (documented, not fixed).
