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

### Canonical PDC compatibility and ambiguous identity resolution (EWO-STAB-004A)

CAT-003 (Polaris Point Defense Cannon Compatibility Certification)
investigated why SFM reported the Polaris's factory-installed PDC
turrets (`Turret_PDC_BEHR_A`/`Turret_PDC_VNCL`, display name
`M2C "Swarm"`) as incompatible with their own native S2 ports. Root
cause: `M2C "Swarm"` is genuinely shared by three real, differently-shaped
entityClasses — the two Turret/PDCTurret/S2 assemblies and a
WeaponGun/Gun/S1 internal gun (`BEHR_LaserRepeater_PDC_S1`) — and the
compatibility path resolved every target purely by display name, via a
catalog table that additionally had no translation for raw category
`"Turret"` at all, making the S2 assemblies unreachable by name and
leaving only the S1 gun resolvable under that shared name. EWO-STAB-004A
implements CAT-003's certified fix.

**`subtype` restored to the runtime catalog.** `component-metadata-catalog.runtime.json`
(`scripts/componentCatalog/catalogRuntimeSchema.ts`/`catalogRuntimeWriter.ts`)
now carries DataCore's raw `subtype` alongside `category`/`size`/`displayName`/
`grade`/`manufacturerRef` — RC-008 excluded it as "confirmed unread";
CAT-003 found it is the one field that distinguishes `PDCTurret` from
`GunTurret` at identical `category`/`size`. Runtime catalog record count:
5,783 (unchanged); file size grew from 1,367,272 to 1,545,604 bytes
(+13%, one new field per record) — no other field added or removed,
confirmed by `catalogRuntimeWriter.test.ts`'s own exact-shape assertion.

**EntityClass-first canonical resolution
(`src/generated/componentCatalog.ts`).** New, additive exports —
`componentsByEntityClass: Map<entityClass, CanonicalComponentRecord>` and
`resolveComponentByEntityClass`/`resolveComponentByName`, both returning
`{status: 'resolved' | 'ambiguous' | 'unresolved'}` — sit alongside the
pre-existing `catalogComponentsByName`/`catalogComponentsByEntityClass`
(left untouched, still used by Hangar Inventory's Add workflow,
presentation, and `CatalogComponentSearch`/`DecisionCenter`). Unlike
those legacy maps, the new ones are **not** restricted to the
`CATEGORY_TO_PORT_TYPE` allowlist and carry raw, untranslated
`category`/`subtype` — the exact facts the PDC rule and ambiguity
detection need, kept separate from the translated port-type vocabulary
ordinary compatibility already used.

**Ambiguous-name detection, scoped to compatibility-relevant divergence.**
`resolveComponentByName` groups every candidate sharing a display name by
a `compatibilityShapeKey` — `PDCTurret` candidates key by size alone
(their raw category is never itself compared); every other candidate
keys by its `CATEGORY_TO_PORT_TYPE`-translated category + size (an
untranslatable category collapses to one shared "untranslatable" key,
since it always resolves the same permissive way regardless of which raw
category it is). Candidates that agree on shape are compatibility-equivalent,
not ambiguous — confirmed by direct catalog audit to be genuine
cosmetic/gameplay SKU variants of one physical item (`"Ecouter"`'s
`_Piercing` variant, `"AllStop"`'s `_ResistGasclouds` variant, `"MSD-322
Missile Rack"`'s ground-vehicle/spaceship variants — all real,
pre-existing collisions this ambiguity check would otherwise have newly
and incorrectly blocked). Only a name whose candidates genuinely disagree
in shape — `M2C "Swarm"`, a PDCTurret shape vs. an ordinary WeaponGun
shape — resolves `ambiguous`. This is a deliberate refinement beyond
CAT-003's literal wording ("multiple distinct entityClass matches");
without it, the ambiguity check would have broken numerous unrelated,
ordinary components across the fleet for a distinction (cosmetic SKU
variant) that can never change a compatibility outcome.

**Ambiguous vs. uncataloged, kept distinct throughout.** `TargetValidation`/
`CandidateResolution` (`src/data/componentCatalog.ts`) and
`ResolvedComponentIdentity` (`componentIdentityService.ts`, new
`ambiguous?: boolean` flag) all distinguish the two: uncataloged still
means "no data, assume compatible" (EWO-024, unchanged); ambiguous means
"real data, but it doesn't safely identify one component" and blocks
(`reason: 'ambiguous'` / installation `reason: 'identity-ambiguous'`) —
never silently substitutes a guess, never falls back to permissive.

**`subtype: "PDCTurret"` as the canonical PDC discriminator, and
`PDC_TURRET` destination capability.** `deriveDestinationCapability(factoryEntityClass)`
resolves the given entityClass and returns `'PDC_TURRET'` only when its
raw `category === 'Turret'` and `subtype === 'PDCTurret'` — always derived
fresh from the port's own permanent `factoryEntityClass`, never from what's
currently installed/targeted, ship model, display name, port label,
equipment-group label, or size alone (so it stays correct whether the
factory PDC is installed, removed, swapped, or the Commander is viewing
Factory Loadout or any other Build for that physical port). Compatibility
rules (`checkCompatibility`, `src/data/componentCatalog.ts`): a
`PDCTurret`-subtype candidate matches only a `PDC_TURRET` destination
(exact size); a `PDC_TURRET` destination accepts only a `PDCTurret`
candidate; neither side PDC-related falls through to the pre-existing,
byte-for-byte-unchanged category/size check. This is what lets an
internal PDC gun (`BEHR_LaserRepeater_PDC_S1`) validate normally against
its own ordinary destination on an Idris-style hierarchy (a captured
child weapon port) without being confused with the same-name S2 parent —
both the monolithic Polaris-style leaf assembly and the Idris-style
parent-with-captured-child shapes are supported by the same rule, since
capability is derived from identity, not hierarchy shape.

**Hardpoint canonical identity threading (Assignment 6).**
`validateTargetCompatibility`/`isComponentSelectableForPort` gained an
optional `CompatibilityIdentityHint` (`itemEntityClass`,
`destinationFactoryEntityClass`), preferred over re-deriving everything
from display-name text. `computeHardpointStatusWithValidation`
(`src/utils/hardpointStatus.ts`) now threads its existing `identity`
parameter (`targetEntityClass`/`factoryEntityClass` — already populated
by every caller since EWO-STAB-003C/D) into this hint — the one
integration point every existing caller (`fleetAssetMaterializer`,
`fleetAssetReconciliation`, `applyInstalledChange`,
`saveMissionConfiguration`, the persisted-state merge) already flows
through, requiring no new caller wiring. `FactoryHardpointTemplate` gained
a `factoryEntityClass?` field (`src/data/shipDefinitions.ts`), carried
directly from the import pipeline's own already-resolved
`Port.factoryItemId`/`componentById` — never re-derived from a display
name, which for `M2C "Swarm"` would hit the same ambiguity. `fleetAssetMaterializer.ts`/
`fleetAssetReconciliation.ts` now prefer this field over their prior
fresh-resolution fallback (kept only for hand-authored seed rows, which
carry no such field).

**Installation engine (`identity-ambiguous`).** `InstallationFailureReason`
gained `'identity-ambiguous'`. `resolveComponentIdentity`
(`componentIdentityService.ts`) reports `ambiguous: true` (entityClass
`null`, never guessed) for a display-name resolution that hits
`resolveComponentByName`'s `ambiguous` status; the installation engine
checks this immediately after resolving identity — before destination
resolution, compatibility, or ownership checks — for both INSTALL and
TRANSFER, so no ship mutation, inventory decrement, reservation
fulfillment, or readiness mutation ever occurs for an ambiguous
candidate. Legacy adapters reshape this result like any other failure;
none convert it into success.

**UI selection safety (Assignment 9), narrowly scoped.**
`src/pages/MissionComposer.tsx`'s Target picker catalog is rebuilt from
the new entityClass-first `componentsByEntityClass` (previously
`catalogComponentsByName`, which excludes PDCTurret entries entirely): an
unambiguous name still produces exactly one option; an ambiguous one
produces one option per real, player-selectable entityClass, each with a
disambiguating `label` (e.g. `M2C "Swarm" — PDC Turret, S2` /
`M2C "Swarm" — WeaponGun, S1`) rendered in place of the plain name
(`TargetComponentPicker`'s new optional `label` field) — the committed
`item` value stays the real catalog display name, unchanged, so a saved
Target string round-trips through `saveMissionConfiguration` exactly as
before. `compatibleOptionsFor`/`isComponentSelectableForPort` calls
(Mission Composer, Quick Update) now pass each candidate's own
entityClass and the destination's `factoryEntityClass`, so an ordinary S2
port's suggestions exclude PDC turret assemblies and a native PDC port's
suggestions include them. No screen was redesigned; every change is an
additive parameter or an additional option row.

**Residual limitation at the end of EWO-STAB-004A, closed by EWO-STAB-004B
below:** if a Commander picked a disambiguated option (e.g. the PDC
Turret variant of `M2C "Swarm"`) and saved it, the persisted
`Hardpoint.targetItem` was still just the plain display name —
`targetOverrides` carried no entityClass channel at all.

### Target override identity persistence (EWO-STAB-004B — correction to EWO-STAB-004A)

EWO-STAB-004A made compatibility checking entityClass-aware end to end,
but left exactly one gap: the Commander's actual picker *selection* never
reached persistence. Root cause, traced end to end (picker option → UI
state → action contract → store mutation → `Hardpoint.targetEntityClass`
→ persistence → rehydration): `TargetComponentPicker`'s `onChange`
carried only the committed string; Mission Composer's `overrides` state
was `Record<string, string>`; `saveMissionConfiguration`'s
`targetOverrides: Record<string, string>` parameter had nowhere to carry
identity even if it had one. The override loop then re-resolved every
target fresh by display name (`resolveComponentIdentity({ displayName })`)
— correct and safe for an unambiguous name, but for `M2C "Swarm"` this
always landed on `{ entityClass: null, ambiguous: true }` regardless of
which real entityClass the Commander actually clicked. **The exact
identity-loss point:** the entityClass-discarding boundary was the
`targetOverrides` contract itself — a plain string is structurally
incapable of carrying more than a name.

**Extended contract, not a parallel system
(`src/store/useFleetStore.ts`):**

```ts
export interface TargetOverrideValue {
  targetItem: string
  targetEntityClass?: string
}
export type TargetOverrideInput = string | TargetOverrideValue
// saveMissionConfiguration: (params: { ...; targetOverrides: Record<string, TargetOverrideInput>; ... })
```

The same field, the same "explicit per-slot edits always win last"
precedence — just a wider per-slot value. A legacy plain string still
works unchanged. `TargetComponentPicker`'s `onChange` gained a second,
optional `entityClass` parameter (the clicked/entered option's own
`entityClass`, `undefined` for one with none) — Mission Composer's
`overrides` state is now `Record<string, TargetOverrideValue>`, and every
write **replaces** the whole per-slot value (never merges a new
`targetItem` onto a stale `targetEntityClass`).

**Resolution precedence in `saveMissionConfiguration`'s override loop:**
a supplied `targetEntityClass` is verified EXACTLY via
`resolveComponentIdentity({ entityClass })` (never blindly trusted — an
unresolvable supplied entityClass is dropped, not silently re-resolved by
name, which would be exactly the CAT-003 bug again); absent one, falls
back to name resolution exactly as EWO-STAB-004A left it. `targetItem === '—'`
always clears `targetEntityClass` regardless of what was supplied — a
cleared target can never carry an orphaned identity.

**Rehydration for an existing Build being edited:** `LoadoutAssignment`/
`LoadoutEditorRow` (`src/utils/loadoutEditorModel.ts`) gained
`targetEntityClass?`/`installedEntityClass?`, carried from the existing
Build's own already-persisted Hardpoint rows — reopening an existing
Mission Configuration for editing no longer loses the previously-selected
identity the moment the preview recomputes. Mission Composer's preview
(`previewRows`) now tracks a `targetEntityClass` value alongside the
target string through every one of the same sources
`saveMissionConfiguration` itself considers (factory/installed/existing/
template/override), mirroring that function's own precedence exactly so
the preview never disagrees with what will actually save.

**Build duplication:** `duplicateBuild` already spread each source
Hardpoint verbatim (`{ ...h, id, buildId }`), which already includes
`targetEntityClass` — no change needed, confirmed by regression test 11.

**Ambiguous reload proof (Assignment 5):** a Commander-selected
`Turret_PDC_BEHR_A` (display name `M2C "Swarm"`) now survives a genuine
save + `vi.resetModules()` + reimport cycle with its exact entityClass
intact, validates successfully against a real Polaris PDC hardpoint,
remains incompatible with an ordinary S2 weapon port, is never
reclassified as `BEHR_LaserRepeater_PDC_S1`, and never returns
`identity-ambiguous` — proven against a freshly-materialized real Polaris
Fleet Asset (`addFleetAsset`), not a seed fixture (seed ship 'ghost' has
its own unrelated, pre-existing legacy-slot-label characteristic — see
regression test file's own doc comment — that would have made a save/
reload test fragile for reasons unconnected to identity persistence).

**Legacy compatibility, unchanged:** a plain-string override (or an
object with no `targetEntityClass`) resolves by name exactly as before
EWO-STAB-004B; a genuinely ambiguous legacy name-only override still
correctly lands on `entityClass: undefined` — never invented.

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
- **Resolved by EWO-STAB-004A:** the Polaris (and every other real
  PDC-carrying ship — Idris M/P, Reclaimer, 890Jump, Constellation
  Phoenix, Perseus, Mauler) false `M2C "Swarm"` incompatibility CAT-003
  investigated is fixed — see the EWO-STAB-004A section above. The 11
  `"<ship>::M2C \"Swarm\""` entries in
  `src/data/__tests__/shipDefinitions.test.ts`'s `KNOWN_EXCEPTIONS` list
  were removed; all now validate genuinely, not via an accepted exception.
- **Resolved by EWO-STAB-004B:** a disambiguated Target-picker selection
  not surviving a save (recorded here at the end of EWO-STAB-004A) is
  fixed — see the EWO-STAB-004B section above. `targetOverrides` now
  carries the selected entityClass end to end. Kept here for historical
  record.
- **The ambiguity check's compatibility-shape refinement (EWO-STAB-004A)**
  reads slightly more permissively than CAT-003's literal wording
  ("multiple distinct entityClass matches" = ambiguous, no carve-out).
  Deliberate and evidenced (see the EWO-STAB-004A section above: `"Ecouter"`,
  `"AllStop"`, `"MSD-322 Missile Rack"` are all real, harmless SKU-variant
  collisions the literal reading would have newly broken) — flagged here
  for Chief Architect awareness as a documented interpretation, not an
  unreviewed deviation.
- **`src/normalizer/assemblyRole.ts`'s `MANNED_TURRET` mislabeling of an
  autonomous PDC turret** (CAT-003's own secondary finding — a
  name-token-matching heuristic tags any leaf `Turret`-categorized
  entity class containing the token "Turret" as `MANNED_TURRET`, even
  though a PDC assembly is explicitly AI-driven/unmanned) remains
  unchanged — explicitly out of scope for EWO-STAB-004A ("Do not fix PDC
  assemblyRole MANNED_TURRET labeling"). A real, separate, low-risk
  presentation issue, not a compatibility one.
- **`TargetComponentPicker` has no working path to commit genuinely
  free-typed text that matches zero catalog options** (discovered, not
  introduced, by EWO-STAB-004B's own audit — confirmed by that
  component's own pre-existing test 5, whose comment already documents
  "no matching option to commit via Enter... the free-text value stays in
  the editable field"). `onChange` — and therefore every override this
  mission's identity-clearing rules govern — only ever fires today from a
  real, listed option. Assignment 4.B's "enter uncataloged free text
  clears the old entityClass" behavior is implemented and defensively
  correct (a plain-string/no-entityClass override always resolves by name
  and never carries a stale identity), but the specific UI interaction of
  typing a wholly novel name through this exact picker cannot currently
  reach it. Out of scope here (a pre-existing UX gap, not an identity
  regression) — flagged for a future, narrowly-scoped UX mission.
- **Seed ship 'ghost' carries a real, pre-existing legacy-slot-label
  characteristic** (MWO-001): its hand-authored CUSTOM build
  ('ghost-stealth') uses simple slot labels ("Shield 1") that predate its
  real deep-import template, which reconciliation correctly renames
  ("Left Shield Generator") only once a genuine reload/rehydration cycle
  runs. Discovered while writing EWO-STAB-004B's own save/reload
  regression tests (test 4/9 use a freshly-materialized real Polaris
  Fleet Asset instead, specifically to avoid this unrelated fixture
  quirk). Not a bug introduced by this mission, and out of its scope —
  flagged for awareness should a future mission test 'ghost' across a
  genuine reload by slot label.

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
