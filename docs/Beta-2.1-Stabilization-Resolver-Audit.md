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
| Persisted-identity reconciliation at hydration (closes R-004) | ✅ **Implemented and certified** — EWO-084. `src/store/persistedComponentIdentityReconciliation.ts`, wired into `useFleetStore.ts`'s `merge`. See §1.5 below and `docs/EngineeringRiskRegister.md`'s now-resolved R-004 entry. |
| Reconcile the two divergent readiness-cache formulas | ✅ **Implemented and certified** — EWO-085. `fleetAssetMaterializer.ts` and `useFleetStore.ts`'s `buildCanonicalSeedCustomBuilds` now both call `calculateBuildProgress` directly instead of an independent formula. See §1.1 below. |
| Retire the `ImportedShipDetail` dev-only readiness duplicate | ✅ **Implemented and certified** — EWO-086. `ShipDetail.tsx`'s hand-rolled `matchedCount / equipmentAssignments.length` formula replaced by a call to `calculateBuildProgress` against the same Hardpoint-shaped rows already built for the port-tree render (extracted into the named, exported `buildImportedShipHardpoints` adapter for testability). See §1.1 below. **The Beta 2.1 readiness-consolidation line item (audit §1.1/§3) is now fully closed** — no independent readiness formula remains anywhere in the app. |
| Cross-view data authority audit (all Commander-facing surfaces) | ✅ **Audit delivered and certified** — EWO-087, commit `1336be3`. See `docs/Beta-2.1-Cross-View-Data-Authority-Audit.md` for the full page-by-page lookup map, business-concept authority matrix, and B/C/D findings. Live-verified readiness agreement across Mission Control/Fleet Dashboard/Ship Management/Ship Detail for the same ship (93%). Surfaced two remediation findings, closed below as EWO-088/EWO-089. |
| Borrow-tier retired-ship leakage (EWO-087 §4.4, the audit's one confirmed live bug) | ✅ **Implemented and certified** — EWO-088, commit `87e5fb2`. `installCandidates.ts`'s Borrow tier and `componentAcquisitionHint.ts`'s Tier 3 now exclude a donor absent from the caller's `ships` array outright instead of mislabeling it "Unknown Ship"; `ShipWorkspacePrototype.tsx`'s two remaining raw-`ships` call sites now pass `activeShips`. Live-verified on port 5176 via the real Ship Settings → Retire Vessel flow. |
| Mission Control / Fleet Dashboard hardpoint reconciliation (EWO-087 §0.3, the amendment's structural finding) | ✅ **Implemented and certified** — EWO-089, commit `87e5fb2`. Both pages now call `prepareCanonicalHardpoints` before `calculateBuildProgress`, matching Ship Management/Ship Detail. Proved with a constructed drift fixture (stale component-owned child slot from a swapped mining head: raw 50% vs. reconciled 100%); real seed fleet renders byte-identical before/after (zero regression). **Every finding from the EWO-087 amendment's "Commander Consistency" investigation is now closed.** |
| Low-priority polish batch (readiness colors, test rename, `componentsMatch` promotion) | Not started |
| `isStructural` exclusion guard for procurement/Needed-By (EWO-087 §4.3) | Not started — recommended as EWO-090 |
| Shared active-build resolution helper (EWO-087 §4.2) | Not started — recommended as EWO-091 |
| Deprecated `ShipRecordCard`/`PriorityCard` cleanup (EWO-087 §4, optional) | Not started — recommended as EWO-092 |
| Ship Image Presentation Standardization (vignette/overlay/blur consistency across `ShipCard`/`ShipHeroFrame`/`ShipImage`) | ✅ **Implemented and certified** as EWO-095A (see Phase 2 table below) rather than the standalone EWO-095 this row originally proposed. The discovery-only proposal doc `docs/EWO-095-Proposal-Ship-Image-Presentation-Standardization.md` is superseded — its scope (ship-card overlay/vignette consistency) was folded into EWO-095A's broader canonical image-presentation pass alongside the environment/empty-state work. |

**Phase 1 (Stabilization) is complete.** EWO-090/EWO-091/EWO-092 remain
in the engineering backlog but are no longer the active development
focus, per Chief Architect authorization. **Phase 2 (Feature
Foundation)** begins below.

| Phase 2 work order | Status |
|---|---|
| Fleet Export Architecture | ✅ **Implemented and certified** — EWO-093, commit `09b0de6`. See `docs/Beta-2.1-Fleet-Export-Architecture.md` for the full architecture: the export payload is the exact canonical persistence payload `buildFleetPersistencePayload()` produces (`localStorage` persistence and Fleet Export share one serialization implementation, never a parallel one); `schemaVersion` reuses `PERSIST_VERSION` directly, no separate export-version counter. Adds an "Export Fleet Data" action on Captain's Log. Certified evidence: `tsc --noEmit` clean, full suite 2630/2630 passing (15 new tests), production build clean, real browser download verified live on port 5176 (production port 5173 untouched throughout), export snapshot proven equivalent to the real persistence payload through the persist middleware itself. **Decided by certification:** a future Import will show a Preview of the validated payload before writing anything; the exact Replace-vs-Merge confirmation semantics are deferred to EWO-094. |
| Fleet Import Preview & Replace Workflow | ✅ **Implemented and certified** — EWO-094, commit `78dd3cb`. One canonical import pipeline: `migrate()`/`merge()` (previously inline in `useFleetStore.ts`'s `persist()` config) extracted unchanged into `migrateFleetPersistedState`/`mergeFleetPersistedState` — Import calls the exact same two functions in memory, `localStorage` untouched until explicit confirmation. Envelope validation is the only new check (JSON well-formed, `schemaVersion` present and not newer than this build supports, `payload` present); every inner record still goes through the existing per-field validators, never a second validation pass. The Preview is that already-migrated, already-merged `FleetState`, inspected — never re-derived. Replace commits via a new `replaceFleetFromImport` store action, which captures an in-memory recovery snapshot (the EWO-093 export mechanism) before committing. Adds an "Import Fleet Data" action beside Export on Captain's Log. Certified evidence: `tsc --noEmit` clean, full suite 2659/2659 passing (29 new tests), production build clean, a complete live Commander walkthrough on port 5176 (empty baseline → Add Ship → Export → purge → confirm empty → Import → Preview → Replace → Mission Control/Fleet Dashboard/Ship Management all agree, zero console errors), production port 5173 untouched throughout, Cancel and invalid-import both proven to perform zero writes. Merge, conflict resolution, and selective import remain explicitly out of scope. **Recovery-snapshot UI (viewing/restoring the in-memory snapshot) is carried forward to the next Backup/Recovery work order** — the snapshot is captured but has no Commander-facing surface yet. |
| Environment Asset Pipeline — Mission Control/Fleet Dashboard/Hangar Inventory empty-state artwork, Captain's Log certification accent | ✅ **Implemented and certified** — Chief Architect Asset Handoff (Revision 2), commit `7ffe01f`. Three new `EnvironmentId`s consumed via a compact `EnvironmentBay` (new `minHeightClassName`/`vignetteOpacity` override props, Decision Center's own defaults unchanged) wrapping only each page's genuine-empty branch; a fourth, distinct `CaptainsLogAccentId` registry for a plain CSS background layer (never `EnvironmentBay`) inside the certification card. `scripts/generateEnvironmentAssets.ts` derives WebP tiers from Commander-approved master PNGs (kept in the repo as archival source), never upscaling beyond native resolution. Revision 2 replaced the initial low-resolution (1672px) masters with 3344×1882 originals and added the tablet (1920) tier. Superseded by EWO-095A immediately below for its presentation values (blur/vignette were retuned again once the higher-resolution masters made the Revision 2 values look conservative). |
| **EWO-095A — Canonical Image Presentation & Environmental Clarity** | ✅ **Implemented and certified** — commit `785ded2`. The canonical rule: environment plates crisp and unblurred (opacity 0.95, brightness/contrast/saturation neutral, blurPx 0, shared by Decision Center and the three empty states), foreground panels (`lg:bg-panel/55 lg:backdrop-blur-md`) carry legibility instead of darkening the artwork (`EnvironmentBay`'s default `vignetteOpacity` cut 0.92 → 0.15, per-page 0.45 overrides removed), and ship imagery carries no broad vignette (`ShipCard` sets `overlay={false}` since its text never sits on the image; `ShipHeroFrame`'s gradient localized from full `inset-0` to `inset-x-0 bottom-0 h-1/2`, the region its caption actually occupies). Ship Management's no-ship-selected empty state converted from a full-plate `bg-black/50` + floating text to the same glyph/card language as the other three empty states. Artwork selection and semantic registries unchanged; `ShipRecordCard`/`PriorityCard` confirmed zero live call sites and left untouched. Certified evidence: `tsc --noEmit` clean, full suite 2691/2691 passing, production build clean, before/after browser verification on port 5176 via `git stash`/`pop` against the same running server (Decision Center crisper and materially brighter with panels still readable; MC/Fleet Dashboard/Hangar Inventory empty plates show more architectural detail with text still legible; Ship Management confirmed on the shared glyph/card pattern; Fleet Dashboard ship cards pixel-diffed — 222,629/1.6M pixels changed, concentrated at the old gradient's bottom band, with a previously-hidden background ship silhouette now visible), production port 5173 untouched throughout. Recorded as the canonical visual presentation standard for Strategic Fleet Manager Beta 2.1. |
| **EWO-095B — Captain's Log Certification Badge Architecture (+ Amendment 1)** | ✅ **Implemented and certified** — commit `7b05a4c`. The certification illustration is now pure environmental artwork with no branding assumed embedded in it; the Community Certified seal is a new, reusable `src/components/branding/CertificationBadge.tsx` overlay resolved through its own semantic registry (`CertificationBadgeVariant`/`certificationBadgeAssets.ts`) — deliberately distinct from `BrandingAssetKey` (SFM's own identity assets) since a certification seal is a third-party endorsement mark. Adding a future badge (Beta Certified, LIVE Compatible, ...) is one registry entry, no component/page change. Layering is Card → Background/Artwork → Badge (`z-10`) → Text (`z-20`, bumped from `z-10`). **Amendment 1** (folded into the same commit, presentation-only): badge sized up ~14-20% across its responsive tiers and switched from bottom-right corner anchoring to true vertical centering (`top-1/2` + `-translate-y-1/2`), so it reads as an intentional visual "signature" at the end of the card's reading path rather than a decorative corner element — no architecture/asset/registry change in the amendment itself. The accent master PNG was replaced with a clean, badge-free illustration; its WebP derivatives were regenerated from the existing `scripts/generateEnvironmentAssets.ts` pipeline unchanged. Certified evidence: `tsc --noEmit` clean, full suite 216 files / 2704 tests passing, production build clean, browser verification on port 5176 at 1600/1280/1024/768px (badge crisp, vertically centered, never overlapping certification text at any of these widths); a pre-existing 500px overlap (confirmed present even before Amendment 1's changes, via a temporary side-by-side revert) was explicitly accepted as outside the current desktop support envelope, not a certification blocker. **Carried forward, unimplemented:** a Custom Ship Image Presentation Review — the Commander will populate port 5176 with representative ships/custom images and inspect Fleet Dashboard ship cards, Ship Management banners, wide/tightly-cropped and bright/dark images, focal positioning, and responsive crop behavior; potential future remediation (semantic focal-position controls, separate card/banner positioning) awaits that visual evidence before any implementation decision. |
| **EWO-097 — Retired Fleet Asset Permanent Purge (+ Amendment)** | ✅ **Implemented and certified** — commit `110e8bd`. Completes the Fleet Registry lifecycle with a third, deliberately destructive transition alongside retire/recommission: `purgeFleetAsset`, available only for a retired vessel, never on an active-ship workflow. One canonical store operation (never UI-level deletion): verifies eligibility, captures a pre-purge recovery snapshot via the existing EWO-093 export mechanism, returns every genuinely-installed owned component to Hangar Inventory through the existing canonical installation engine (iterating `installedLoadouts` — the single per-ship-per-slot physical truth — never a parallel inventory mutation), then removes the hull's own FleetAsset/Ship/Build/Hardpoint/InstalledLoadout/reservation/quarantine records in one atomic write. Reservations and quarantined assignments tied to the hull are removed outright, not merely released, since the hull is gone permanently; Captain's Log is deliberately untouched (its entries carry only a free-text ship-name snapshot, never a live id). A purged seed-migrated asset is excluded from every future seed rehydration via a new `SeedAssetOverride.purged` flag (`PERSIST_VERSION` 10→11, purely additive) — confirmed via a genuine `vi.resetModules()` reload test. Edit Fleet Asset gained a Danger Zone (retired-only) with a typed-confirmation dialog. **Amendment** — Commander field testing found the confirmation phrase was visually uppercased by inherited CSS while the underlying comparison stayed case-sensitive, so typing what was displayed didn't match; fixed with two shared helpers (`resolvePurgeConfirmationPhrase`/`matchesPurgeConfirmationPhrase`, `src/utils/fleetLifecycle.ts`) now used everywhere the phrase appears — heading, instruction, accessible label, button enablement, and the store action's own independent validation, so the disabled-button state is never the only safeguard. Certified evidence: `tsc --noEmit` clean, full suite 217 files / 2743 tests passing (55 new/updated tests across both rounds), production build clean, two full live Commander walkthroughs on port 5176 (base: add/install/retire/cancel/purge/verify-siblings-and-inventory/reload; amendment retest: natural-case display, case-insensitive activation, nickname-vs-canonical precedence, genuine purge + reload persistence), production port 5173 untouched throughout. |
| **EWO-098 — Mission Control Semantic Status Color Authority** | ✅ **Implemented and certified** — commit `f96a208`. Commander acceptance testing found the Reserved — Awaiting Install Priority Action Card sharing Ready to Install's green accent, violating the app's established semantic color language. Root cause: `MissionControl.tsx`'s own local `PRIORITY_ACTION_PRESENTATION` map was authored with only three color concepts in mind (its own doc comment: danger red / success green / warning gold) — Reserved was never given its own entry and silently inherited Ready's green by omission, not a deliberate wrong mapping or a token/variant resolution bug (this same page's own Procurement Work Queue table, a few rows below, already renders Reserved correctly via `Badge tone={procurementRowStateTone(row.state)}`). Fixed with a new `RESERVED_ACCENT` constant set to the literal canonical cyan value (`'#35D0FF'`) already used verbatim by `Badge.tsx`'s `procurementRowStateTone`/`tailwind.config.js`'s `cyan` token, `HangarInventory.tsx`'s reserved-quantity cell, and `LoadoutPortTree.tsx`'s `logisticsTone('Reserved')` — the same convention this file's own `QUARTERMASTER_CATEGORY_ACCENT` already follows for the identical token, since `ActionCard`'s `accent` prop takes a raw CSS color string, not a Tailwind class. Ready to Install and Critical Missing untouched; adjacent Mission Control presentation maps (Quartermaster Assessment, Fleet Status tiles) audited, no other genuine defects found. Certified evidence: `tsc --noEmit` clean, full suite 217 files / 2751 tests passing (8 new tests), production build clean, regression suites for Hangar Inventory/Ship Management/Decision Center/Badge/LoadoutPortTree (273 tests) all passing unchanged, live browser verification on port 5176 via a genuine three-state scenario built through Hangar Inventory's real Reserve flow (before: no Reserved card; after: Reserved renders distinct cyan, Ready green, Critical red, ordering/counts/labels all correct), production port 5173 untouched throughout. |

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

> ✅ **Cache-formula duplication implemented and certified — EWO-085.**
> The audit's original finding also flagged two independent
> readiness-cache formulas outside this table — `fleetAssetMaterializer.ts`
> and `useFleetStore.ts`'s `buildCanonicalSeedCustomBuilds` — that
> populated `Build.readiness`/`Ship.readiness` via their own denominator
> logic rather than calling `calculateBuildProgress`. Both now call it
> directly. Root-cause note from EWO-085's own investigation: live
> operational screens (Fleet Dashboard, Mission Control, Ship Management)
> were already fully canonical/live and never read the cache for their
> primary readiness display — the divergence was only externally visible
> via two direct cache reads (`QuickUpdate.tsx`'s Captain's Log
> before/after entry, `ShipDetail.tsx`'s stale "before" comparison) and,
> more importantly, was a latent consistency/fragility risk regardless of
> current visibility. `ShipDetail.tsx`'s separate `ImportedShipDetail`
> dev-only duplicate remains unaddressed, reserved for EWO-086.
>
> ✅ **`ImportedShipDetail` duplicate implemented and certified — EWO-086.**
> Its hand-rolled `matchedCount / equipmentAssignments.length` formula
> (a THIRD, independent readiness calculation, using a different data
> source than the Hardpoint-shaped rows this same component already
> built for its own port-tree render) never excluded Unresolved or
> genuinely-untargeted rows the way `calculateBuildProgress` does. Now
> calls `calculateBuildProgress` directly against those same rows — the
> row-construction logic itself was extracted, unchanged, into a named,
> exported `buildImportedShipHardpoints` adapter purely for direct
> testability. **With this, no independent readiness formula remains
> anywhere in the codebase — the audit's readiness-consolidation line
> item is fully closed.**

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

> ✅ **Implemented and certified — EWO-084.**
> `src/store/persistedComponentIdentityReconciliation.ts`, wired into
> `useFleetStore.ts`'s `merge` at each genuinely-persisted array's own
> read site (installedLoadouts, hangarItems, reservations, and the
> reconciled custom-Build hardpoint rows) — deliberately never at the
> fresh seed-baseline construction, which is regenerated from
> `src/data/seed.ts` every load and isn't "persisted state that can
> drift" in R-004's sense. Uses EWO-083's canonical resolver with a new
> `skipCatalogOverride` option (the hand-authored CATALOG table carries
> no grade/manufacturerCode/classification/entityClass and would
> otherwise shadow real catalog metadata for any name matching an
> override key — the same regression class EWO-083 already found and
> fixed for `resolveGrade`). See section 2 below for the full deep dive.

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
