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

**Deliberately not touched in EWO-STAB-003B/003C, resolved in
EWO-STAB-003D (below):** `computeHardpointStatusWithValidation`
(hardpoint status: OK/Missing/Invalid Target) and
`calculateComponentAvailability` (Hangar Inventory's Available/Reserved/
Installed columns, procurement lists) were display-name-based at the end
of EWO-STAB-003C. Both are widely-shared, heavily-tested foundations used
far outside the installation engine's boundary, so making them
identity-aware was scoped as a separate follow-up mission rather than
folded into 003C.

### Identity-aware status and availability (EWO-STAB-003D)

EWO-STAB-003D closed the residual risk above. `computeHardpointStatus`
(`src/utils/hardpointStatus.ts`) and `calculateComponentAvailability`
(`src/engine/logistics/availability.ts`) both gained an **additional,
optional** identity parameter and now apply the same rule everywhere a
comparison happens: when both sides being compared carry a resolved
`entityClass`, they're compared by `entityClass` alone; when either side
lacks one, the exact original name-only comparison runs, byte for byte.
Neither function calls `identitiesMatch()`'s own display-name fallback
branch directly for this purpose — it is case-insensitive, and these two
functions' pre-existing name comparisons were case-sensitive `===`;
reusing it unconditionally would have silently loosened legacy behavior
these two functions have always had. Instead each defines its own local
`componentsMatch`/`componentRowMatches` helper that calls into
`identitiesMatch` only for the entityClass-present branch (where its
result is identical to a direct `===` on entityClass) and preserves the
original `===` string comparison for every other branch.

**Import boundary note:** both files import `identitiesMatch` directly
from `src/engine/installation/componentIdentityService.ts`, not from the
engine's public barrel (`index.ts`). `inventoryTransactionService.ts`
(reached from the barrel via `installationEngine.ts`) itself calls
`calculateComponentAvailability` — importing the barrel from
`availability.ts` would close a real cycle. `componentIdentityService.ts`
has no dependency back into either file, so it is the one safe, leaf-only
import; this is a deliberate, narrow exception to "only import the
barrel," not a precedent for reaching into other engine internals.

**Callers updated to pass entityClass they already possessed** (no new
catalog resolution added to any UI caller): `checkReservationOwnership`'s
internal availability check, `HangarInventory.tsx` (both the table row and
the Reserve panel), `missionPackage.ts`, `portTree.ts`, `reserveComponent`
(reordered so the identity it already resolves for the reservation record
is available for the availability check too), and `procurement.ts` (the
per-group entityClass of the row that first created an aggregation
group — see Known Risks for what this does and does not fix).

**Schema addition:** `InstalledLoadoutEntry` gained an optional
`entityClass?: string` field (`src/types/index.ts`) — it previously had no
identity at all, which meant `calculateComponentAvailability`'s
`installedQuantity` could never be identity-aware regardless of what the
Hardpoint/HangarItem side offered. Populated at every one of its existing
mutation sites (`applyInstalledChange`, seed derivation, ship
materialization, the persisted-state merge's installedLoadouts overlay)
from the corresponding Hardpoint's own `installedEntityClass`. Additive,
no `PERSIST_VERSION` bump.

**Mission Target Identity Gap closed:** `saveMissionConfiguration` now
tracks a `targetEntityClass` alongside every `baseTargets` entry, through
all four starting-state branches, the Quartermaster Template override,
and `targetOverrides` — the last two resolve fresh through
`resolveComponentIdentity` (a Quartermaster Template assignment and a
Commander's typed/selected override are both raw display-name strings
with no identity of their own to begin with). Resolution failure (an
uncataloged or misspelled name) leaves `targetEntityClass` `undefined` —
the target string itself is always preserved verbatim; nothing is ever
rejected or silently altered because identity couldn't be resolved.

**`fleetAssetReconciliation.ts` also updated:** a reconciled Hardpoint row
previously dropped `installedEntityClass`/`targetEntityClass`/
`factoryEntityClass` entirely, even though the old row (installed/target
side) and a fresh catalog resolution (factory side, since
`FactoryHardpointTemplate` itself carries no entityClass) could supply
them. This was a genuine identity-loss gap surfaced during 003D's audit,
not called out by name in the mission's own two named functions, but
directly within "every shared component-matching path" — fixed alongside
the two named functions rather than deferred.

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

### Reservation lookup and procurement demand identity (EWO-STAB-003E)

EWO-STAB-003D's own Known Risks flagged a triplicated inline "find the
active reservation for this slot" lookup in `procurement.ts`, `portTree.ts`,
and `missionPackage.ts`, and a procurement demand-aggregation pass that
grouped strictly by raw target display name. EWO-STAB-003E's audit
(Assignment 2) confirmed the three reservation-lookup copies were
byte-for-byte identical predicates (`missionConfigurationId` + slot +
`status === 'ACTIVE'` + name-only component match) — three independent
decisions that happened to agree, not one shared one.

**Reservation lookup authority: `src/engine/logistics/reservationLookup.ts`
— `findActiveSlotReservation(reservations, query)`.** `query` is
`{ missionConfigurationId, targetSlotLabel, componentName, componentEntityClass? }`.
Scope is unchanged from every original copy: `missionConfigurationId` +
`targetSlotLabel` + `status === 'ACTIVE'`. `shipId` was never checked
separately in any original copy — `missionConfigurationId` already
uniquely identifies one Fleet Asset's Mission Configuration — and there is
no "mission identifier" narrower than that in this codebase. Component
matching follows the same rule as everywhere else in this ADR: both sides
resolve entityClass → compare entityClass only; either side lacks one →
fall back to the *exact* original case-sensitive `componentName === ...`
comparison (never `identitiesMatch`'s own case-insensitive fallback, for
the same reason noted in EWO-STAB-003D — these callers never had
case-insensitive behavior and this mission does not introduce it).
`procurement.ts`, `portTree.ts` (`derivePortLogistics`), and
`missionPackage.ts` (`calculateMissionPackage`) all now call this one
function; none contains its own comparison logic anymore.

**Procurement demand-key policy.** `buildProcurementList`'s demand
grouping (`src/utils/procurement.ts`) changed from a `Map` keyed by raw
target display name to a linear scan against a small `UnresolvedGroup[]`,
using a local `demandMatchesGroup` predicate with the same
entityClass-first/name-fallback rule. This is deliberately **not** a
`Map<entityClassOrName, Group>` — a single string key can't correctly
express both required outcomes at once: two rows with the *same*
entityClass must merge even if their display-name formatting differs, AND
a row with a resolved entityClass must still merge with a legacy row of
the same name that has none (the identity rule's own "either side missing
entityClass falls back to name" branch) — while two rows with genuinely
*different* entityClass values must never merge even though their names
match. The array+predicate form reproduces the same pairwise
`identitiesMatch`-style comparison used everywhere else in this ADR,
rather than approximating it with a key scheme that can't represent it.
Display names remain the only thing ever shown to the Commander; no
internal key (entityClass or otherwise) is exposed in `ProcurementLine`.

**Legacy fallback confirmed unchanged:** a fleet with no entityClass data
anywhere groups and matches exactly as it did before this mission — proven
by regression test 9 (procurement) and test 4 (reservation lookup).

**Quantity semantics unchanged:** `qtyNeeded`/`availableToReserve`
computation, `calculateComponentAvailability`'s own math, and
`calculateMissionPackage`'s percentages are untouched — only which rows
are grouped together, or which reservation counts as "the" active one, can
now differ from before. Verified by the full existing test suite (no
regressions) plus new tests 7/8/10/11.

**`src/utils/inventoryDependencies.ts` remains untouched**, still governed
by Design Authority Ruling 12, exactly as EWO-STAB-003D left it. No ruling
was sought or granted to change that during this mission.

## Known Risks and Future Follow-Up

- **Resolved by EWO-STAB-003D:** the two risks recorded here at the end of
  EWO-STAB-003C — `calculateComponentAvailability`/hardpoint status
  remaining display-name-only, and `targetEntityClass` only being
  populated at ship materialization time — are addressed above. Both
  functions are now identity-aware wherever both sides of a comparison
  have one, and `targetEntityClass` is now tracked through every source
  `saveMissionConfiguration` can pull a target from, including Loadout
  Manager's own target-override workflow. Kept below for historical
  record rather than deleted.
- **`src/utils/inventoryDependencies.ts` (`resolveInventoryDependencies`)
  remains, and must remain, display-name-only.** Its own doc comment cites
  a pre-existing **Design Authority Ruling 12**, which explicitly withholds
  authorization to re-key `InstalledLoadoutEntry`/`MissionReservation`
  matching in this specific helper off anything but display name.
  EWO-STAB-003D's audit (Assignment 1) surfaced this explicitly rather
  than working around it: this file is genuinely outside both this ADR's
  and EWO-STAB-003D's authorization, and needs a fresh ruling superseding
  #12 before it can be touched — not a silent identity upgrade.
- **Resolved by EWO-STAB-003E:** the triplicated inline reservation lookup
  (`procurement.ts`/`portTree.ts`/`missionPackage.ts`) and procurement's
  raw-display-name demand grouping, both recorded here at the end of
  EWO-STAB-003D, are addressed above. Kept below for historical record.
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
- **The entityClass-first/name-fallback comparison rule now has four
  independent physical implementations** — `hardpointStatus.ts`'s
  `componentsMatch`, `availability.ts`'s `componentRowMatches`,
  `reservationLookup.ts`'s `reservationMatchesComponent`, and
  `procurement.ts`'s `demandMatchesGroup` — each a thin, intentionally
  separate wrapper around the one real underlying authority
  (`identitiesMatch`), added at different times to avoid the same import
  cycle each file would otherwise create through
  `inventoryTransactionService.ts`. The *decision* is one (`identitiesMatch`
  is the sole comparison authority everywhere); the *wrapper code* is not.
  Not a bug — every regression test across EWO-STAB-003D/003E confirms
  they agree — but a legitimate candidate for a future, narrowly-scoped
  cleanup mission if that duplication is ever judged worth removing.

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
