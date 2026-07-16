# ADR-006 — Deep-Import Identity Aliasing

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

`generated-data/ships.json` derives each deep-imported ship's `id` from its display name (e.g. `eclipse-imported`), not from its canonical raw entity class (e.g. `AEGS_Eclipse`). The broad ship catalog (Mission M-012) keys its own records by that canonical entity class instead, and a `FleetAsset` added while a ship was still catalog-only persists `shipDefinitionId` as that same canonical class.

EWO-019 deep-imported the Aegis Eclipse — previously catalog-only — while a Commander already had a manually added, persisted Eclipse `FleetAsset` with `shipDefinitionId: "AEGS_Eclipse"`. Without a bridge between the two id spaces, that asset would stop resolving to any `ShipDefinition` the moment `AEGS_Eclipse` was added to `DEEP_IMPORTED_ENTITY_CLASSES` (which excludes it from the catalog-only list) — worse than the pre-import state, not better.

## Decision

Add `Ship.sourceEntityClass` (`src/engine/types/ship.ts`), populated by the normalizer from the already-resolved, prefix-stripped raw entity class name. This flows through `GeneratedDataWriter`'s existing pass-through into `ships.json` automatically.

`src/data/shipDefinitions.ts` derives `DEEP_IMPORTED_ENTITY_CLASSES` directly from `sourceEntityClass` (previously a hand-maintained list — a self-updating set removes a whole class of "forgot to update it" bugs). It then registers each deep-imported `ShipDefinition` in `shipDefinitionById` and `shipFactoryTemplates` under **both** its generated id and its canonical entity class, pointing at the same object/array. The canonical-class alias is never added to the `shipDefinitions` array itself, so Add Ship still lists the ship exactly once.

## Consequences

- A `FleetAsset` persisted before its ship was deep-imported self-heals to full port/factory data the next time `useFleetStore`'s existing rehydration replay (`merge`) runs — no new migration code, no change to the persisted record, verified live via an injected legacy-shaped `localStorage` fixture (EWO-019).
- No duplicate Add Ship entries: deep-import supersedes catalog-only for the same real ship.
- Two different id spaces for "the same ship" is now a documented, generalized pattern rather than an implicit assumption — future deep-imports need no manual wiring beyond running the importer.
- Known residual gap: a deep-imported ship's display name can coincidentally collide with an unrelated hand-authored seed ship of the same simple name (observed: seed `corsair` vs. deep-imported `DRAK_Corsair`, both display as "Corsair" in Add Ship). This is a naming ambiguity between two intentionally distinct data tiers, not an identity bug — left for product/UX judgment rather than papered over with ship-specific logic.
