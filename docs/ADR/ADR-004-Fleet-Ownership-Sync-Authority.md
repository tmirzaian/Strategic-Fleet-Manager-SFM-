# ADR-004 — Fleet Ownership Source and Sync Authority

- **Status:** Proposed
- **Date:** 2026-07-11

## Context

A persistence incident (a deleted ship silently reappeared after a
browser refresh, and Hangar Inventory produced a blank page with an
empty fleet) prompted a broader product decision on how a Fleet Asset's
*origin* should determine who is allowed to add, remove, or modify it —
in particular, once a future RSI account sync, in-game/LTP sync, or
loaner-source sync exists.

## Decision

Every Fleet Asset will carry an explicit ownership source:

```ts
interface FleetAsset {
  id: string
  shipDefinitionId: string
  ownershipSource: 'rsi' | 'in_game' | 'loaner' | 'manual'
  sourceExternalId?: string
  lifecycleStatus: 'active' | 'missing_from_sync' | 'loaner_expired' | 'archived'
  lastSeenAt?: string
}
```

Authority rules by source:

1. **`rsi`** — a future RSI/CCUGame sync is authoritative. Pledge
   upgrades reconcile automatically: the obsolete pledged ship is removed
   and the new one added, without the user manually deleting anything. A
   sync summary reports added/removed/unchanged assets.
2. **`in_game`** — a future game/LTP sync *may* be authoritative, but is
   not trusted blindly. An asset missing from a sync becomes
   `missing_from_sync` rather than being hard-deleted (game wipes or
   incomplete syncs happen); the user can restore, archive, or remove it.
3. **`loaner`** — same caution as `in_game`. Absence marks
   `loaner_expired`, with a visible reconciliation summary and an
   archive/remove choice, not a silent hard delete.
4. **`manual`** — the user is authoritative. Sync must never delete or
   alter a manual asset automatically.
5. **User-facing action** is "Remove from Fleet," not "Delete Ship" —
   removing an owned Fleet Asset record never touches the underlying
   Ship Definition (catalog data) or any other Fleet Asset referencing
   it. For synced records, the UI should warn that the asset may return
   on the next sync if it's still present at the source; for manual
   records, removal is final unless the user re-adds it.

## Scope of this decision vs. what was implemented

This ADR documents the target ownership/authority *model*. The
persistence incident this ADR grew out of was fixed narrowly, without
building the sync/reconciliation engine implied above:

- `FleetAsset.ownershipType` (`OWNED` / `PURCHASED` / `LOANER`) and
  `acquisitionSource` (`MANUAL` / `RSI_IMPORT` / `CCUGAME_IMPORT` /
  `SEED_MIGRATION`) already exist and overlap significantly with the
  `ownershipSource` shape above, but are not a 1:1 match — renaming/
  remapping them touches persistence, migration, the materializer,
  ownership utilities, UI labels, and ~15 existing tests. That rename is
  deliberately deferred to a dedicated fleet-data migration rather than
  bundled into an incident fix.
- What *was* fixed: seed ships (`acquisitionSource: 'SEED_MIGRATION'`)
  are demo data whose ships/builds/hardpoints are hardcoded in
  `src/data/seed.ts` and reconstructed fresh on every load — they were
  never replayed through the Fleet Asset materializer and still aren't
  (doing so would discard their hand-authored Mission Configurations).
  What previously did **not** persist was whether the user had removed,
  renamed, or re-owned one of those seed ships. `useFleetStore.ts` now
  persists that as a small per-id diff (`seedAssetOverrides`), applied on
  top of the fresh seed bake-in at rehydration time. See
  `docs/Architecture.md`'s "Fleet ownership and persistence" section.
- `hasPersistedState` was added so the app (and tests) can tell "no save
  exists yet" apart from "a save exists and the fleet is legitimately
  empty" — required for demo data to never re-appear after a user empties
  their fleet, without also breaking the true first-ever-install
  experience.
- Hangar Inventory, Fleet Dashboard, and Mission Control each gained a
  deliberate empty-state panel so zero ships / zero inventory renders a
  clear message instead of a blank page or a crash.

## Consequences

- The full sync/reconciliation engine (automatic RSI pledge-upgrade
  reconciliation, `missing_from_sync`/`loaner_expired` lifecycle,
  reconciliation summary UI) remains unimplemented. No sync of any kind
  exists yet — there is nothing to reconcile against.
- **Mission M-012 Universe provisioning stays blocked** until the Chief
  Architect confirms fleet persistence is reliable. This session's fix
  demonstrates the specific incident is resolved (targeted + full test
  suite, build, and manual browser verification all pass), but
  unblocking M-012 is a separate decision this ADR does not make.
- The `ownershipType`/`acquisitionSource` → `ownershipSource` rename, and
  the `lifecycleStatus`/`lastSeenAt` fields, are the next fleet-data
  migration whenever sync work actually begins.
