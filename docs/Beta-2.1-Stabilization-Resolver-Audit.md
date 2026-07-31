# Beta 2.1 Stabilization Sprint — Resolver Audit & Canonicalization Plan

**Work order reference note:** the work order for this audit was labeled
**EWO-073**. That identifier is already in use in this repository —
`docs/UI_ARCHITECTURE.md` §61 documents **EWO-073 — Fleet Registry UX
Polish (SW-015C Post-Certification Micro-Fix)**, certified and committed
earlier in the Beta 2.0 cycle. This report is filed under a descriptive
name instead of a reused number to avoid two unrelated pieces of work
sharing one ID in the historical record. Recommend the Chief Architect
assign this audit a fresh number (e.g. EWO-074 or an EWO-STAB-0xx
continuation, see below) the next time it's referenced.

**Status: audit only as originally filed.** No source file under `src/`
was modified to produce this report — every finding below comes from
direct code reading (via `Read`/`Grep`) plus three focused research
passes. No application behavior changed at the time this document was
written; `git status` was clean.

**Implementation status (updated after the audit):**

| Recommendation (§4/§5) | Status |
|---|---|
| Consolidate the four catalog name-lookup chains | ✅ **Implemented and certified** — EWO-083, commit `fd49099`. See the note in §1.4 below. |
| Persisted-identity reconciliation at hydration (closes R-004) | Not started — explicitly out of scope for EWO-083 |
| Reconcile the two divergent readiness-cache formulas | Not started |
| Retire the `ImportedShipDetail` dev-only readiness duplicate | Not started |
| Low-priority polish batch (readiness colors, test rename, `componentsMatch` promotion) | Not started |

The rest of this document is preserved as originally written — the
point-in-time audit findings — with status notes added inline rather
than rewritten, so it stays an accurate record of what was found *and*
what's since been done about it.

---

## Zero, One-Paragraph Summary

This codebase already went through a real consolidation effort before
this Beta cycle — source comments cite **EWO-STAB-003A/003B/003C**,
**EWO-STAB-004A/004B**, and **EWO-STAB-001**, none of which are in this
program's Beta-era history, meaning they predate it (Alpha-era
`git log` entries like `da4a9ca fix(stabilization): contain unsafe
component installation paths` and `2fe6fc1 feat(installation):
establish unified component transaction engine` confirm this). That
effort already produced genuine canonical services for compatibility
checking, reservation lookup, and component availability — the audit
below found **no live duplication** in three of the nine in-scope
categories. The real, current gap is narrower and more specific than
the work order's category list might suggest: **it's concentrated in
component *catalog lookup* (four independent lookup chains) and
exactly one consequence of that proliferation, the still-open R-004
persistence-identity gap.** That's good news for sequencing — the
Stabilization Sprint has a small number of high-leverage targets, not
nine parallel problems.

---

## 1. Resolver Inventory

### 1.1 Readiness calculations

| Resolver | File | Purpose | Consumers |
|---|---|---|---|
| `calculateBuildProgress` | `src/utils/buildProgress.ts:57` | Canonical hardpoint-match → percentage + status engine | `shipManagementSummary.ts`, `FleetDashboard.tsx`, `MissionControl.tsx`, `ShipDetail.tsx`, `useFleetStore.ts` |
| `deriveFleetBuildState` / `classifyFleetStatusTile` / `compareByReadinessRank` | `src/utils/fleetBuildState.ts` | Turns a Build Progress result into Mission Control's tile classification and sort rank | `FleetDashboard.tsx`, `MissionControl.tsx`, `ShipDetail.tsx`, `shipManagementSummary.ts` |
| `buildShipManagementSummary` | `src/utils/shipManagementSummary.ts:385` | Wraps the two above plus decision/demand aggregation for the Ship Management workspace | `ShipWorkspacePrototype.tsx` (sole consumer) |
| `calculateMissionPackage` | `src/engine/logistics/missionPackage.ts:24` | A *different* metric (Package Readiness — "do I own/commit everything") — not a duplicate, deliberately separate | `ShipDetail.tsx` |

**Canonical.** One engine, layered correctly, wide reuse.

### 1.2 Decision calculations (Decision Center)

| Resolver | File | Purpose | Consumers |
|---|---|---|---|
| `resolveNeededByBuilds` | `src/utils/inventoryDependencies.ts:141` | Which real Builds have an unresolved target requirement for a component | `DecisionCenter.tsx`, `hangarReservationEligibility.ts`, `HangarInventory.tsx` |
| `resolveReservationEligibility` | `src/utils/hangarReservationEligibility.ts:35` | Combines availability + demand into one reserve/don't-reserve answer | `HangarInventory.tsx`, `DecisionCenter.tsx` — **same function, both call sites** |
| `resolveInventoryDependencies` | `src/utils/inventoryDependencies.ts:43` | "What currently claims this component's stock" (delete/reduce safeguards) | `HangarInventory.tsx`, `useFleetStore.ts` |

**Canonical, no duplication found.** `DecisionCenter.tsx`'s own
`evaluate()` is a thin wrapper adding one page-specific filter, not a
reimplementation.

### 1.3 Component compatibility resolution

| Resolver | File | Purpose | Consumers |
|---|---|---|---|
| `checkCompatibility` / `validateTargetCompatibility` / `isComponentSelectableForPort` | `src/data/componentCatalog.ts:388,453,505` (backed by `src/engine/compatibility/isCompatible.ts`) | The size/type/PDC/swap-group/vessel-tag compatibility decision | `compatibilityEngine.ts` (sole engine entry point), `hardpointStatus.ts`, `portTreeGrouping.ts`, `MissionComposer.tsx`, `ShipWorkspacePrototype.tsx`, `QuickUpdate.tsx`, `fullComponentCatalog.ts` |
| `identitiesMatch` | `src/engine/installation/componentIdentityService.ts:140` | "Are these two components the same" — entityClass-first, case-insensitive display-name fallback | `installationEngine.ts`, `installCandidates.ts`, `availability.ts`, `reservationLookup.ts` |
| Swap-group / configurable-slot eligibility | `ShipWorkspacePrototype.tsx:793`, `src/generated/configurableSlots.ts` | A second, independent compatibility *axis* (which entityClasses may occupy a Module port) | Feeds into `validateTargetCompatibility` as a hint — not a competing decision |
| `resolvePortAuthority` | `src/utils/portAuthority.ts:128` | Port editability/ownership — a different concern from compatibility | Single canonical implementation |

**Canonical**, confirmed by source comments referencing the prior
EWO-STAB-003A/B consolidation that eliminated earlier duplicates here.
One deliberate exception: `installationEngine.ts`'s `exact-slot-match`
mode (ship-to-ship transfers) skips the catalog and does verbatim
type/size string equality — documented as intentional, not a gap.

### 1.4 Component catalog lookup logic — **the audit's main finding**

> ✅ **Implemented and certified — EWO-083, commit `fd49099`.**
> `resolveComponentCatalogEntryDetailed` (row 1 below) was widened in
> place into the one shared resolver, rather than replaced by a new
> parallel one: it now carries `grade`/`manufacturerCode`/`classification`
> and accepts optional normalization/case-insensitive-fallback/alias-hook/
> ambiguity-mode behavior, defaulting to exactly its pre-existing
> resolution. `resolveGrade` (row 4) was migrated onto the same
> base-layer functions the canonical resolver itself uses. Rows 2 and 3
> were audited and deliberately left unchanged — `fullComponentCatalog`
> already delegated to the base layer with no independent chain to
> remove, and migrating `resolveComponentLabel` was confirmed (via a real
> caught-and-fixed regression during EWO-083's own test pass) to risk
> silently dropping real grade/entityClass data for any name matching a
> CATALOG override key, since the override table was never meant to
> shadow presentation data. Full detail: EWO-083's own commit message and
> the "Deliverable" report given to the Chief Architect at certification.

| Resolver | File | Purpose |
|---|---|---|
| `resolveCandidate` / `resolveComponentCatalogEntry(Detailed)` | `src/data/componentCatalog.ts:277-318` | The compatibility-path name→category/size resolver (hand-authored override → entityClass → name) |
| `resolveComponentLabel` | `src/utils/componentPresentation.ts:337` | **A second, independent lookup chain** for display: `componentByDisplayName.get()` then `catalogComponentsByName.get()` |
| `fullComponentCatalog` | `src/utils/fullComponentCatalog.ts:31` | **A third** independently-built picker-option list, its own iteration + resolution |
| `resolveGrade` | `src/utils/installCandidates.ts:49` | **A fourth**, ad hoc entityClass→name fallback lookup, bypassing both #1 and #2 |
| Base maps: `resolveComponentByName`, `resolveComponentByEntityClass`, `catalogComponentsByName`, `catalogComponentsByEntityClass` | `src/generated/componentCatalog.ts:196,219,299,332` | The underlying generated `Map`s every chain above ultimately reads from |

**Duplicated — four independent chains, one shared data source.**
Every one of these `Map` lookups is **exact, case-sensitive string
equality**. Nothing in this file trims or case-folds before `.get()`.
The only case-insensitive comparison anywhere in the codebase is
`identitiesMatch`'s *display-name* fallback (§1.3) — used solely for
match/dedup logic, never for the catalog lookups themselves, and
`hardpointStatus.ts`'s own `componentsMatch` deliberately opts out of
even that (documented, narrower contract than `identitiesMatch` —
technically a fifth small divergence, but an intentional one).

This is the exact mechanism that already produced one confirmed
Commander-visible defect (a hand-typed `"Snowblind"` vs. catalog
`"SnowBlind"` casing mismatch, fixed at the data source, see R-004
below) and remains fully capable of producing another, silently, from
any future hand-authored data.

### 1.5 Persistence reconciliation logic — R-004

See dedicated section 2 below.

### 1.6 Inventory availability calculations

| Resolver | File | Purpose |
|---|---|---|
| `calculateComponentAvailability` | `src/engine/logistics/availability.ts:49` | The single accounting authority: `available = max(0, ownedQuantity − reservedQuantity)` |

**Canonical.** Ten+ consumers across pages/utils, all via import — no
page recomputes this inline.

### 1.7 Reservation calculations

| Resolver | File | Purpose |
|---|---|---|
| `findActiveSlotReservation` | `src/engine/logistics/reservationLookup.ts:61` | "Is there an ACTIVE reservation for this Mission+slot+component" |
| `activeReservationsForShip` | `src/utils/fleetLifecycle.ts:39` | Every ACTIVE reservation belonging to a ship (SW-015C, used by `retireFleetAsset` and its own confirmation-dialog preview) |

**Canonical.** `reservationLookup.ts`'s own doc comment confirms it
already replaced three independent copies previously duplicated across
`procurement.ts`, `portTree.ts`, and `missionPackage.ts` — this is a
second, real, already-completed consolidation from before this sprint.

### 1.8 Procurement calculations

| Resolver | File | Purpose |
|---|---|---|
| `buildProcurementList` / `buildReservedAwaitingInstallLines` | `src/utils/procurement.ts:74,168` | Fleet-wide shortage + reserved-awaiting-install aggregation |
| `describeAcquisitionHint` | `src/utils/componentAcquisitionHint.ts:66` | Per-component Reserved/Available/Borrow/Purchase tier |
| `deriveInstallCandidates` | `src/utils/installCandidates.ts:111` | Reserved/Available/Upgrade/Borrow ladder for the install picker |
| `deriveFleetPriorityActions` | `src/utils/priorityActions.ts:57` | Hero action queue |

**Canonical.** All four call the same two authorities
(`calculateComponentAvailability` + `findActiveSlotReservation`)
rather than recomputing. Minor housekeeping note:
`src/utils/__tests__/procurementLogistics.test.ts` exists with no
corresponding `procurementLogistics.ts` source file — it imports from
`procurement.ts`. Not a duplicate implementation, just a confusingly
named test file; worth a rename in a later cleanup pass.

**Lifecycle-filtering check (explicitly requested by the work order):**
every aggregate resolver above is fed an active-only ship list —
`HangarInventory.tsx`, `DecisionCenter.tsx`, `MissionControl.tsx`,
`MissionComposer.tsx`, `QuickUpdate.tsx`, `ShipDetail.tsx`, and
`ShipWorkspacePrototype.tsx` all call `selectActiveShips`/`isActiveShip`
before passing ships into any of these functions. `retireFleetAsset`
releases a retiring ship's own reservations via
`activeReservationsForShip`, so `calculateComponentAvailability`'s
ACTIVE-only reserved count can't be polluted by a retired ship's stale
reservation. **No unfiltered-ship-list bug found.**

---

## 2. R-004 Deep Dive — Persisted Component Reference Drift

**Where identity is resolved today:** `src/engine/installation/componentIdentityService.ts`'s
`resolveComponentIdentity()` is the canonical runtime identity
resolver — its own doc comment states plainly: *"No caller outside the
installation engine resolves component identity directly; every
operation passes through here first."* It is genuinely used
everywhere a component is installed, targeted, or reserved
(`useFleetStore.ts`'s `reserveComponent`, target-assignment paths,
`applyInstalledChange`, etc.).

**Where it is *not* called:** `useFleetStore.ts`'s persisted-record
validators — `isValidPersistedFleetAsset` (:577),
`isValidPersistedBuild` (:657), `isValidPersistedHardpoint` (:672),
`isValidPersistedReservation` (:631) — confirmed by direct reading to
be pure **shape** validators. `isValidPersistedHardpoint` checks
`typeof r.installedItem === 'string'` and never anything about whether
that string still resolves in the current catalog. Same pattern for
`componentName` in `isValidPersistedReservation`. None of the four
call `resolveComponentIdentity` or touch the catalog at all.

**Why the gap exists, not just that it exists:** the canonical
resolver's own scoping language — "no caller *outside the installation
engine*" — structurally excludes `migrate()`'s hydration path by
design, whether or not that exclusion was a deliberate original
decision. `docs/MigrationStrategy.md` independently confirms R-004 is
known and explicitly out of scope there too ("This ADR does not
propose fixing R-004 — Non-Goal, 'no data migration'"). Three
independent documents (Risk Register, Migration Strategy, and this
audit's direct source read) now agree: **the gap is real, current, and
consistently characterized.**

**Consequence, mechanically:** a persisted `componentName`/
`installedItem`/`targetItem` string that drifts from the current
catalog by even one character passes shape validation on load (it's
still `typeof === 'string'`), then fails silently at every one of the
catalog's four exact-match lookup chains (§1.4) the next time anything
tries to resolve it — degrading to "uncataloged," not erroring, not
self-healing, and not flagged anywhere a Commander or Engineer would
see it without already knowing to look.

**What's already fixed vs. what's still open:** the one concrete
historical instance (`seed.ts`'s `"Snowblind"` vs. catalog
`"SnowBlind"`) was corrected at the data source. The *general*
architectural gap — no identity re-validation step anywhere in
`migrate()` — remains open, exactly as R-004 describes.

---

## 3. Duplication Map

| Finding | Locations | Severity | Type |
|---|---|---|---|
| Four independent catalog name-lookup chains | `componentCatalog.ts` (`resolveCandidate`), `componentPresentation.ts` (`resolveComponentLabel`), `fullComponentCatalog.ts`, `installCandidates.ts` (`resolveGrade`) | **High** — root cause underlying R-004 | Real duplication |
| No identity reconciliation at persistence hydration | `useFleetStore.ts`'s 4 `isValidPersisted*` validators vs. `componentIdentityService.ts` | **High** — R-004, known Commander-visible defect class | Architectural gap, not literal duplication |
| Two independent readiness-cache formulas | `fleetAssetMaterializer.ts:164-167`, `useFleetStore.ts:307-310` (`buildCanonicalSeedCustomBuilds`) | **Medium** — different required-set filter than the canonical engine and than each other | Real duplication |
| Dev-only hand-rolled readiness calc | `ShipDetail.tsx`'s `ImportedShipDetail` path (:377-379) | **Low** — dev-only preview path, small blast radius | Real duplication |
| `hardpointStatus.ts`'s `componentsMatch` vs. `identitiesMatch` | `hardpointStatus.ts:65` | **Low** — documented, deliberate narrower contract | Intentional divergence, not a bug |
| Two readiness color-threshold functions | `ShipDetail.tsx`'s `readinessColor` (100/85/50), `ReadinessBar.tsx`'s `colorFor` (85/65) | **Low** — presentation only, no data-integrity impact | Real but cosmetic duplication |
| Misnamed test file | `procurementLogistics.test.ts` with no matching source file | **Trivial** — naming/clarity only | Non-issue, housekeeping |

**Categories audited with zero duplication found:** Decision
calculations, inventory availability, reservation calculations,
procurement calculations, core compatibility resolution. Five of nine
in-scope categories are already clean.

---

## 4. Candidate Canonical Services

1. **NEW — Persisted-identity reconciliation step.** The single
   highest-leverage service this sprint could build: a function called
   from `migrate()` that re-resolves every persisted
   `componentName`/`installedItem`/`targetItem` against the current
   catalog (via a consolidated version of `resolveComponentIdentity`),
   logging/flagging a drifted record rather than silently degrading it.
   Closes R-004 at the architectural level, not just the one instance
   already patched.
2. **CONSOLIDATE — One catalog name-lookup primitive.** Merge the
   four chains in §1.4 behind one shared `Map.get()`-with-fallback
   function; callers keep their own return shapes/wrappers, but stop
   reimplementing the entityClass-first/name-fallback precedence
   pattern independently. This is also the direct enabler for #1 —
   the reconciliation step needs exactly this to exist first.
3. **REINFORCE — `calculateBuildProgress` as the sole readiness
   authority.** Either have `fleetAssetMaterializer.ts` and
   `useFleetStore.ts`'s cache-writers call the real engine directly, or
   extract its required-set filter predicate into one shared helper
   both the engine and the cache-writers call — so "last-known cache"
   stays a caching strategy, not a second formula.
4. **RETIRE — `ImportedShipDetail`'s hand-rolled readiness calc.**
   Small, contained fix once in the area.
5. **EVALUATE — promote `hardpointStatus.ts`'s `componentsMatch`**
   to a named, documented second export inside
   `componentIdentityService.ts` itself (e.g. `identitiesMatchStrict`)
   rather than a local reimplementation elsewhere — same behavior,
   better discoverability, no functional change.
6. **LOW PRIORITY — unify the two readiness color-threshold
   functions** into one shared presentation helper.

---

## 5. Recommended Implementation Order

1. **Design + implement the persisted-identity reconciliation step**
   (closes R-004). Highest leverage, addresses a real, already-reported
   Commander-visible defect class.
2. **Consolidate the four catalog-lookup chains** into one primitive —
   sequenced right before #1 because #1 depends on it existing cleanly.
3. **Reconcile the two divergent readiness-cache formulas** against
   `calculateBuildProgress`'s own criteria.
4. **Retire the `ImportedShipDetail` dev-only duplicate** (cheap, low
   risk, do while already in the readiness-calc area from #3).
5. **Low-priority polish**, batchable into a single small EWO: unify
   the readiness-color thresholds; rename/relocate
   `procurementLogistics.test.ts`; consider promoting
   `hardpointStatus.ts`'s `componentsMatch` into
   `componentIdentityService.ts` by name.

Steps 1-2 are the actual Stabilization Sprint core. Steps 3-5 are real
but materially lower-severity — sequencing them after 1-2 means the
sprint's flagship deliverable (closing a known Commander-reported
defect class) lands first.

---

## 6. Risks Discovered During the Audit

- **R-004 is confirmed still fully open**, and more precisely
  characterized than before: the canonical identity resolver exists
  and is used everywhere at *operation* time, but is structurally
  excluded from *hydration* time by its own "no caller outside the
  installation engine" scoping. This isn't a resolver that needs to be
  built from scratch — it's a resolver that needs one new caller.
- **Catalog lookups are 100% case-sensitive with zero normalization**
  anywhere except two narrow, non-catalog-lookup exceptions
  (`.trim()` in `resolveComponentIdentity`, and `identitiesMatch`'s
  match-only case-insensitive display-name fallback). Any future
  hand-authored seed/import data with a casing or whitespace slip will
  reproduce the exact defect class that already happened once, and
  nothing currently in the codebase would catch it before a Commander
  does.
- **The four independent catalog-lookup chains multiply that risk
  fourfold** — a fix or a future data-shape change applied to one
  chain has no guarantee of being inherited by the other three.
- **Reassuring finding, stated plainly:** most of the work order's
  nine categories are already well-consolidated, evidently the result
  of genuine prior stabilization work (the EWO-STAB series) that
  predates this Beta cycle. The remaining Stabilization Sprint scope
  is narrow and targeted, not a ground-up rebuild.
- **Process note:** this audit found real prior engineering history
  (EWO-STAB-001 through 004B) with no corresponding entry in
  `docs/UI_ARCHITECTURE.md`'s numbered section log or `docs/Roadmap.md`'s
  "Alpha 2.5D / Complete" summary beyond a passing mention. If a future
  session needs to reconstruct that history's own reasoning in detail,
  it may be worth locating and indexing those original design
  documents (if they exist outside git commit messages) rather than
  re-deriving their intent from code comments alone, as this audit had
  to.

---

## Confirmation

No files under `src/`, `scripts/`, or `public/` were modified to
produce this report. `git status --short` was clean before this audit
began and remains clean after — only this new document was added.
