# ADR-010 — Unified Component Installation and Inventory Transactions

- **Status:** Accepted
- **Date:** 2026-07-18

## Context

EWO-STAB-001 (Compatibility & Installation Audit) mapped four fragmented
foundational systems behind a class of bugs the Commander observed
against components including SnowBlind, Slipstream, Veil, and Hemera:

1. **Compatibility resolution** — three independent implementations. A
   dead, zero-caller `Port`/`Component`-by-id engine
   (`src/engine/compatibility/`); the real catalog-based chain
   (`src/data/componentCatalog.ts`'s `isComponentSelectableForPort` /
   `validateTargetCompatibility`, built on `isCompatible`); and a third,
   disjoint raw type/size equality check inside
   `moveComponentBetweenShips`. Critically, **Hangar Inventory's Move to
   Ship called `installComponent` with no slot label at all**, which fell
   back to "the first non-`OK` hardpoint anywhere in the build" — no
   type/size check whatsoever. A Shield could land in a Power Plant slot.
2. **Inventory transaction ownership** — hangar-quantity bookkeeping was
   duplicated three separate ways: `installComponent`'s
   reservation-quantity-spread decrement, `moveToShip`'s own
   single-hangarItemId decrement (with its own guard against
   double-decrementing the first), and `removeComponent`'s
   add-back-via-merge.
3. **Component identity** — at least four independently-applied
   mechanisms (entity-class exact lookup in the generated catalog and
   `ComponentMetadataResolver`; a lossy "first entityClass wins"
   display-name dedup in the same generated catalog; Hangar Inventory's
   own entityClass-aware merge; and plain case-insensitive display-name
   string equality in `installComponent`'s slot-matching, and in
   reservation/availability matching everywhere else). The install/target
   matching path — the one place a name collision causes a real,
   physical wrong-component bug — used the *weakest* of the four.
4. Ship normalization was already solved by prior missions and is
   unaffected by this ADR.

EWO-STAB-002 (Contain Unsafe Installation Paths) applied the smallest
safe containment patch ahead of the architecture work: Move to Ship was
disabled in the UI; `moveToShip` and `installComponent` were hardened to
refuse any operation without an explicit, validated destination slot; and
a defensive catalog-based compatibility re-check was added at the one
mutation entry point both paths shared. This closed the "any open slot,
any category" hole immediately, without waiting for the engine below.

## Decision

### The unified installation engine (EWO-STAB-003B)

A single module, `src/engine/installation/`, is now the sole authority
for every component installation operation (INSTALL / REMOVE /
TRANSFER). It exposes exactly one public entry point,
`executeInstallation()`, plus its command/result types, from `index.ts`
— internal collaborators (`ComponentIdentityService`,
`CompatibilityEngine`, `InventoryTransactionService`) are never imported
outside the module. The engine has zero dependency on Zustand or
`FleetState`: it reads a plain `InstallationStateSnapshot` and mutates
only through injected `InstallationEffects` callbacks, so any future
caller (a Ship Detail inline action, a future RSI synchronization
process) can use it without depending on the store.

**Pipeline, validation strictly before mutation:** Resolve Identity →
Resolve Destination → Validate Compatibility → Validate Ownership →
Apply Ship Mutation → Apply Inventory Transaction → Recalculate
Readiness → Commit. A failure at any validation stage returns
`{ ok: false }` having invoked no effect callback at all — there is no
partial commit to roll back, because nothing is written until every
check has already passed.

**Legacy adapters, not a rewrite.** `installComponent`, `removeComponent`,
`moveToShip`, and `moveComponentBetweenShips` remain in
`src/store/useFleetStore.ts`, now as thin translators: build an
`InstallationCommand`, call `executeInstallation`, reshape the result
back to each function's pre-existing return shape. Every existing caller
(Quick Update, the disabled Hangar Inventory action) required zero
changes. `applyInstalledChange` and `addHangarItem` — already the
correct, shared, tested implementations before EWO-STAB-001 found
anything to fix — are not moved into the engine; they are invoked from
it via dependency injection, preserving the one direction of dependency
(store depends on engine, never the reverse) without requiring already-
correct code to be relocated.

**`moveComponentBetweenShips`'s own, intentionally different
compatibility rule** (destination must equal the donor hardpoint's own
type/size, no catalog lookup) is preserved verbatim via a second
`CompatibilityEngine` mode (`exact-slot-match`) rather than silently
switched onto the catalog rule — a second mode of one engine, not a
second engine.

### Canonical component identity (EWO-STAB-003C, this ADR)

**`entityClass` is the canonical identity.** It is the stable,
DataCore-sourced identifier the generated catalog and
`ComponentMetadataResolver` already treated as authoritative before this
work. **Display names are presentation and legacy-fallback only** — never
compared as identity once a stronger signal is available on both sides
being compared.

`Hardpoint` gains three new **optional** fields —
`installedEntityClass?`, `targetEntityClass?`, `factoryEntityClass?` —
alongside the unchanged `installedItem`/`targetItem`/`factoryItem`
strings. `MissionReservation` gains one — `componentEntityClass?` —
alongside the unchanged `componentName`. No existing field is renamed,
retyped, or removed.

**Compatibility and ownership remain separate validation concerns** in
the pipeline (as they already were in EWO-STAB-003B): a component can be
physically compatible with a slot and still be blocked from installing
there because a different Fleet Asset/Build already owns the only
available unit (EWO-029, Design Authority Ruling 8). Adding canonical
identity does not merge these two questions into one.

**Identity-aware matching**, added via a new `identitiesMatch()` helper
in `ComponentIdentityService`:

```
identitiesMatch(a, b):
  if both a.entityClass and b.entityClass are present -> compare entityClass only
  otherwise -> fall back to case-insensitive display-name equality
```

This directly addresses the Slipstream/Snowblind/shared-name-missile-rack
collision class: once both sides of a comparison carry a resolved
entityClass, two components that merely *happen* to share a display name
are never treated as the same component again. Applied specifically to
the installation engine's own reservation-matching step (finding "the
active reservation for this exact slot and this exact component" during
INSTALL) and to `checkReservationOwnership`'s competing-reservation
check — both self-contained within `src/engine/installation/`.

**Deliberately not touched, and why:** `computeHardpointStatusWithValidation`
(hardpoint status: OK/Missing/Invalid Target) and
`calculateComponentAvailability` (Hangar Inventory's Available/Reserved/
Installed columns, procurement lists) remain display-name-based,
unchanged. Both are widely-shared, heavily-tested foundations used far
outside the installation engine's boundary; making them identity-aware
is a larger, separate undertaking explicitly out of this mission's
additive, "do not redesign installation behavior" scope. This is a
documented, accepted residual risk — see below.

**The uncataloged-component fallback policy is unchanged and reaffirmed.**
An item with no resolvable `entityClass` — because it isn't in the
catalog at all — is never treated as a compatibility violation or an
identity mismatch by default. "We can't disprove compatibility (or
identity) we have no data for" (EWO-024's original phrasing) continues
to govern both the compatibility check and the new identity matching.

### Additive schema, no destructive migration

Every new field is optional. `isValidPersistedHardpoint` and the
reservation-equivalent validator already check only required-field
presence/type (not an exhaustive allowlist) — an object carrying extra,
unrecognized fields already passed through Zustand's `persist` merge
path untouched before this change existed. A **pre-existing save simply
lacks these fields**, which is the correct, valid "no known canonical
identity yet for this record" state, not an error condition requiring a
migration branch. `PERSIST_VERSION` is therefore **not** incremented by
this mission — see the Persistence Versioning section of the EWO-STAB-003C
report for the full rationale.

**Required fallback order, applied everywhere identity is compared:**
1. `entityClass`, when present on both sides being compared.
2. The existing normalized legacy identity tuple (name + type + size),
   where entityClass is unavailable on one or both sides — unchanged
   from Hangar Inventory's pre-existing merge behavior.
3. Display name alone, only when no stronger signal exists at all.

No historical component is eagerly re-resolved. Identity is populated
opportunistically, going forward, at the points already responsible for
creating or mutating the relevant record (ship materialization, the
installation engine's mutation step, reservation creation) — never by a
bulk migration pass over existing data.

## Known Risks and Future Follow-Up

- **`calculateComponentAvailability` and hardpoint status computation
  remain display-name-only.** A component sharing a display name with a
  different real component could still be miscounted in Hangar
  Inventory's Available/Reserved columns or misjudged as
  `Invalid Target`, even after this ADR. Recommended as its own follow-up
  mission once the identity fields have accumulated real coverage across
  a Commander's actual saved data.
- **`targetEntityClass` is populated at ship materialization time only**
  (factory-fresh rows). A target subsequently edited through Loadout
  Manager's own target-override workflow does not yet gain a resolved
  `targetEntityClass` — deliberately out of scope ("do not redesign
  Loadout Manager"). A target row edited that way keeps working exactly
  as before, via display-name matching.
- **Two genuinely different real components that share both a display
  name and lack any entityClass in the catalog** (the residual class
  `componentCatalog.ts` already documents, e.g. certain Missile Rack
  variants) remain indistinguishable — this ADR does not, and could not
  without new source data, resolve a collision the catalog itself cannot
  disambiguate. No one-off override was added for Veil or Hemera:
  neither appears anywhere in this codebase's source, generated, or raw
  data, so there is no metadata defect to correct, only a class of bug to
  contain — consistent with EWO-STAB-003C's explicit instruction not to
  add such overrides without evidence.

## Consequences

A component's identity now has a canonical, stable representation
available wherever the installation engine, ship materialization, or
reservation creation resolves one — closing the specific collision class
(same display name, different real component) at the exact point
(install/reservation matching) EWO-STAB-001 identified as using the
weakest identity mechanism in the codebase. Existing Commander data,
including every save written before this ADR, continues to load and
operate exactly as before; canonical identity accumulates going forward
without any destructive rewrite.
