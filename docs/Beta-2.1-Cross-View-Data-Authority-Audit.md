# Beta 2.1 Cross-View Data Authority and Lookup Audit (EWO-087)

**Classification:** Beta 2.1 Stabilization — Discovery Only
**Status:** Discovery only. No production code was modified to produce
this document (two exceptions, both reverted before commit: a
temporary `playwright` devDependency used for live verification, and a
temporary dev server on port 5176 — both removed, `git status` clean).

---

## 0. Priority Investigation — Commander Amendment

*(Addressed first, ahead of the general audit, per the Commander's own
explicit priority framing: "There are two levels of correctness — Code
Correctness and Commander Consistency. I want proof of the second, not
just the first.")*

### 0.1 The question

Does Mission Control, Ship Management, Ship Detail, and Imported Ship
Detail display the **identical** readiness value for the same ship and
build state, because all four derive it from the same canonical
calculation — verified by direct observation, not just by reading code?

### 0.2 Complete call chain, traced for each surface

| # | Surface | File | Hardpoint input | Canonical call |
|---|---|---|---|---|
| 1 | Mission Control (Top Priority Ship) | `src/pages/MissionControl.tsx:238` | `hardpoints.filter(h => h.buildId === s.activeBuildId)` — **raw store rows, no reconciliation step** | `calculateBuildProgress(...)` |
| 2 | Fleet Dashboard (ship cards, both Card and Table view) | `src/pages/FleetDashboard.tsx:94` | `hardpoints.filter(h => h.buildId === ship.activeBuildId)` — **raw store rows, no reconciliation step** | `calculateBuildProgress(...)` |
| 3 | Ship Management (`ShipWorkspacePrototype.tsx`, via `buildShipManagementSummary`) | `src/utils/shipManagementSummary.ts:386` | `hardpoints` param, which the page populates via `prepareCanonicalHardpoints(...)` — **reconciled against the current canonical port template + component-owned child slots synthesized** | `calculateBuildProgress(hardpoints)` |
| 4 | Ship Detail (`/ship/:shipId`, the older page) | `src/pages/ShipDetail.tsx:167` | `effectiveHardpoints = prepareCanonicalHardpoints(ship.id, shipHardpoints, fleetAssets)` — **same reconciliation as #3** | `calculateBuildProgress(effectiveHardpoints)` |
| 5 | Imported Ship Detail (`ShipDetail.tsx`'s developer-only import-preview path) | `src/pages/ShipDetail.tsx` (EWO-086) | `buildImportedShipHardpoints(view)` — **a completely different data universe: engine `Port[]` from the offline `npm run import:ships` pipeline, not a real Fleet Asset's persisted Hardpoints at all** | `calculateBuildProgress(...)` |

**Every one of the five calls the exact same function,
`calculateBuildProgress` (`src/utils/buildProgress.ts:57`) — a single,
un-duplicated engine, confirmed by direct source reading (matches this
audit's own broader finding for readiness in §3.1 below).**

### 0.3 A real structural finding, not just a formality check

Rows 1–2 and rows 3–4 do **not** feed `calculateBuildProgress` the same
INPUT preparation. `prepareCanonicalHardpoints` (`src/utils/canonicalHardpointPreparation.ts:66`)
carries this doc comment, written by a prior mission (SW-002 Revision
A) and never revisited since:

> "Every consumer (Ship Detail, the Ship Management workspace) **must
> call this** rather than reading `hardpoints.filter(h => h.buildId ===
> X)` as the final UI authority — raw store rows are the persisted,
> possibly-stale INPUT, not what should ever reach
> `calculateBuildProgress`/`buildPortTree`/rendering."

Mission Control and Fleet Dashboard do exactly the thing this comment
warns against — they never call `prepareCanonicalHardpoints`. This
means the readiness *engine* is unified (confirmed, one function), but
the *input* to that engine has two implementations: a raw filter and a
reconciled one. If `overlayCanonicalHierarchy`/`withComponentOwnedChildSlots`
ever produce a different row set than the raw persisted rows — which
they exist specifically to do, when a ship's canonical port template
has drifted from what a Commander's Build happened to save — Mission
Control/Fleet Dashboard and Ship Management/Ship Detail could show
genuinely different percentages for the same ship. **This is a real, C
— Semantic Divergence finding (see §4), not a hypothetical one; see
§7 (EWO-089) for the recommended remediation.**

### 0.4 Empirical, live evidence (not just code reading)

A temporary dev server (`VITE_SFM_DEV_SEED_FLEET=true`, port 5176) and
a temporary Playwright install were used to render all four real
surfaces and read the actual displayed text, for the same real ship
(the seed fleet's F7C-S Hornet Ghost Mk II, active Build "Stealth
Build") in one continuous session — both removed afterward
(`git status` confirmed clean).

| Surface | Displayed readiness | Displayed "Missing" |
|---|---|---|
| Mission Control (Priority 1 card) | **93%** | Slipstream, SnowBlind |
| Fleet Dashboard (ship card) | **93%** | Slipstream, SnowBlind |
| Ship Management (`/ship-workspace/ghost`) | **93%** | — |
| Ship Detail (`/ship/ghost`) | **93%** | 2 Missing Items (Slipstream, Power Plant target) |

All four agree, live, byte-for-byte, for the same ship. This
specific ship currently has no drift between its raw persisted rows
and its canonical template, so §0.3's structural risk is **not
currently manifesting** — but it is real, latent, and unverified for
every OTHER ship in a real Commander's fleet (a ship whose canonical
template has changed since the Build was last saved would be the
actual trigger condition, and none of the seed fleet's ships currently
exercise that path).

Imported Ship Detail was also checked live (`/ship/avenger-titan-imported`,
a real imported-pipeline preview ship — necessarily a *different* ship,
since import-preview ships are not Fleet Assets and cannot be compared
number-for-number against Ghost): confirmed rendering
`Readiness: 100%` via the identical `calculateBuildProgress` call,
matching EWO-086's own test evidence.

**Formatting differences (rounding/precision):** none found. Every
surface renders `Math.round(...)` integer percentages (`calculateBuildProgress`'s
own rounding, applied once, at the source — no surface re-rounds or
reformats independently).

### 0.5 Certification statement

> For the same ship and build state, Mission Control, Fleet Dashboard,
> Ship Management, and Ship Detail all display **identical** readiness
> values today, both by code inspection (all five surfaces call the
> one `calculateBuildProgress` engine) and by live, empirical
> observation (93% on all four, same ship, same session). Imported
> Ship Detail cannot be compared on "the same ship" — it operates on a
> disjoint data universe — but uses the identical canonical
> calculation, confirmed live and by EWO-086's own test suite.
>
> **One remaining divergence was identified and is documented as a
> follow-on remediation EWO, not silently accepted:** Mission
> Control/Fleet Dashboard read raw, unreconciled hardpoints while Ship
> Management/Ship Detail read `prepareCanonicalHardpoints`-reconciled
> hardpoints. This does not currently produce a wrong number for any
> real ship in this repository's fleet, but it is a real, documented,
> currently-unenforced consistency requirement (the comment predates
> this audit) and should be closed rather than left to depend on no
> ship ever drifting from its template. See EWO-089 in §7.
>
> **A second, unrelated, and more urgent finding also came out of this
> audit's wider sweep (§4.4/§7, EWO-088): a confirmed, currently-live
> bug in the "Borrow" tier of the installation-candidate resolver lets
> a component installed on a *retired* ship appear as a
> Commander-facing "Borrow Available" offer, contradicting the
> product's own documented active-fleet-only guarantee. This is
> unrelated to readiness and was not part of the amendment's specific
> question, but it is exactly the class of Commander-visible
> contradiction EWO-087 was commissioned to find, so it is surfaced
> here rather than buried in §4.**

---

## 1. Page-by-Page Lookup Map

| Page/Surface | File | Concepts sourced | Resolver/adapter used |
|---|---|---|---|
| Mission Control | `src/pages/MissionControl.tsx` | Readiness (raw hardpoints), Needed By (via `buildProcurementList`), active-ship filtering | `calculateBuildProgress` (unreconciled input, §0.3); `buildProcurementList`; `selectActiveShips` |
| Fleet Dashboard | `src/pages/FleetDashboard.tsx` | Readiness (raw hardpoints), ship name/ownership, active/retired toggle | `calculateBuildProgress` (unreconciled input, §0.3); `selectActiveShips`/`selectRetiredShips` |
| Ship Management (`ShipWorkspacePrototype`) | `src/pages/ShipWorkspacePrototype.tsx` + `src/utils/shipManagementSummary.ts` | Readiness (reconciled), install candidates (Borrow/Upgrade/Swap), component identity, active-build selection | `prepareCanonicalHardpoints` → `calculateBuildProgress`; `resolveInstallCandidates` (`installCandidates.ts`); `resolveComponentLabel` |
| Ship Detail (`/ship/:id`) | `src/pages/ShipDetail.tsx` | Readiness (reconciled), Loadout & Port Tree, component identity | `prepareCanonicalHardpoints` → `calculateBuildProgress`; `LoadoutPortTree`/`ComponentAssignmentLabel` |
| Imported Ship Detail (dev preview) | `src/pages/ShipDetail.tsx` (`ImportedShipDetail`) | Readiness (import-pipeline data), component identity | `buildImportedShipHardpoints` → `calculateBuildProgress` (EWO-086) |
| Quick Update | `src/pages/QuickUpdate.tsx` | Ship name/active build, slot selection, catalog search (no identity display) | `CatalogComponentSearch` (picker only, no `ComponentAssignmentLabel` use) |
| Hangar Inventory | `src/pages/HangarInventory.tsx` | Inventory quantities, Needed By, reservation eligibility, ship type/size fields | `resolveReservationEligibility` (wraps `resolveNeededByBuilds`) |
| Decision Center | `src/pages/DecisionCenter.tsx` | Scan results, Needed By, reservation prompt, active-ship filtering | `resolveNeededByBuilds`; `resolveReservationEligibility`; `selectActiveShips` |
| Mission Composer | `src/pages/MissionComposer.tsx` | Ship name/active build, existing Loadouts table, component identity | `LoadoutPortTree`/`ComponentAssignmentLabel`/`TargetComponentPicker`; `selectActiveShips` for editable ship set |
| `EditFleetAssetModal` | `src/components/EditFleetAssetModal.tsx` | Ownership edit, retire preview (releasable reservations) | `activeReservationsForShip` (`fleetLifecycle.ts`) — canonical, matches the real retire action |
| `ShipCard` (current canonical card) | `src/components/ShipCard.tsx` | Readiness (prop), ownership, lifecycle/retired styling | Pure presentation — no independent calculation |
| `ShipRecordCard`/`PriorityCard` (deprecated) | `src/components/ShipRecordCard.tsx`, `PriorityCard.tsx` | Same as `ShipCard` | Prop-driven, but `@deprecated`, zero live call sites found |
| `ComponentAssignmentLabel`/`TargetComponentPicker`/`CatalogComponentSearch` | `src/components/*.tsx` | Component identity/classification display | `resolveComponentLabel` (`componentPresentation.ts`) |

---

## 2. Business-Concept Authority Matrix

*(Commander's example table, verified and extended to cover the full concept list from the work order.)*

| Business Concept | Canonical Authority | Surfaces Using It | Classification |
|---|---|---|---|
| Build/Mission Readiness (engine) | `calculateBuildProgress` | Mission Control, Fleet Dashboard, Ship Management, Ship Detail, Imported Ship Detail | **A** |
| Build Readiness (hardpoint *input* to the engine) | `prepareCanonicalHardpoints` (Ship Management/Ship Detail) vs. raw `hardpoints.filter(...)` (Mission Control/Fleet Dashboard) | Same four | **C** — see §0.3, EWO-089 |
| Component Identity/Catalog Resolution | `resolveComponentCatalogEntryDetailed` (base) | Install candidates, hangar reconciliation, persisted-identity reconciliation | **A** (EWO-083/084; 2 documented exceptions, §3.3) |
| Component Grade/Class/Manufacturer/Classification presentation | `resolveComponentLabel` (`componentPresentation.ts`) | `ComponentAssignmentLabel`, `TargetComponentPicker`, `CatalogComponentSearch`, install-candidate labels | **A** |
| Installed/Target/Factory identity display | `ComponentAssignmentLabel` (wraps `resolveComponentLabel`) | Ship Workspace, Mission Composer, Ship Detail, `LoadoutPortTree` | **A** |
| Ship name/canonical display name | `ship.name` (materialized field, no re-derivation) | All pages | **A** |
| Ship image resolution | `resolveShipImage`/`useResolvedShipImage` | Ship Detail, Ship Workspace, `ShipCard`, `EditFleetAssetModal` | **A**, with one inert **B** (deprecated `ShipRecordCard.tsx` direct read, zero live call sites) |
| Ship ownership status | `ship.ownership` + `Badge`'s `ownershipTone` | Fleet Dashboard, `ShipCard`, `ShipHeroFrame`, Quick Update, Mission Composer | **A** |
| Active Build/Loadout selection | `ship.activeBuildId` (field is authoritative) but **no shared lookup helper** | Fleet Dashboard, Mission Control, Quick Update, Ship Detail, Ship Workspace, Decision Center, Mission Composer | **B**, with a narrow **C** for dangling-`activeBuildId` fallback behavior (§4.2) |
| Persisted component identity (R-004) | `reconcileArray`/`persistedComponentIdentityReconciliation.ts` | `useFleetStore.merge` (all persisted arrays) | **A** (EWO-084, resolved) |
| Active/retired ship filtering | `selectActiveShips`/`selectRetiredShips` | Mission Control, Hangar Inventory, Decision Center, Quick Update, Fleet Dashboard, Ship Detail, Ship Workspace, Mission Composer | **A**, well-documented intentional single-ship-lookup exceptions |
| `isStructural` hardpoint exclusion | Ad hoc per-consumer `if (hp.isStructural) continue` | `priorityActions.ts`, `shipManagementSummary.ts`, `LoadoutPortTree`, `missileRackAggregation.ts`, `componentOwnedSlots.ts` — **not** checked in `procurement.ts`/`inventoryDependencies.ts` | **C** — see §4.3, EWO-090 |
| Availability/quantity | `calculateComponentAvailability` (original resolver audit) | Inventory, Reserve dialog, Needed By | **A** |
| Needed By (per-component, which builds need it) | `resolveNeededByBuilds` | Hangar Inventory, Decision Center | **A** |
| Needed By (fleet-wide procurement aggregate) | `buildProcurementList` | Mission Control | **B** — intentionally a different question, but duplicates the core unresolved-demand predicate; drift risk (§4.4) |
| Reservation Eligibility | `resolveReservationEligibility` | Hangar Inventory (Actions column, Reserve modal), Decision Center (Reserve prompt) | **A** |
| Install-candidate resolution (Direct/Upgrade/Swap tiers) | `resolveInstallCandidates`/`resolveGrade` (`installCandidates.ts`) | Ship Workspace Operational Review | **A** |
| Install-candidate resolution (Borrow tier, donor scoping) | `installedElsewhere` filter in `installCandidates.ts` — **not** scoped to active ships despite documented guarantee | Ship Workspace "Borrow Available" hints | **D** — confirmed live bug, see §4.4/EWO-088 |
| Retire-preview releasable-reservation count | `activeReservationsForShip` (`fleetLifecycle.ts`) | `EditFleetAssetModal` | **A** |
| `QuarantinedAssignment` | N/A — no UI surface reads this at all | none (tests only) | **A** — safe by absence |
| Hardpoint row Size/Type (port spec) vs. picker/catalog Size/Type | Distinct fields answering distinct questions (port spec vs. stored item vs. catalog entry vs. resolved identity) — not a duplicate derivation | Ship Workspace, Hangar Inventory, `CatalogComponentSearch`, `DecisionCenter` | **A** |
| Decision Center scan/procurement calculations | Original Beta 2.1 resolver audit findings (unchanged since) | Decision Center | **A** |

---

## 3. Concepts Explicitly Reviewed and Found Canonical/Safe

The following were traced to a single authority with no divergent
implementation found, and require no remediation:

1. **Build/Mission Readiness engine** — `calculateBuildProgress`, the sole readiness calculation in the codebase since EWO-085/086; live-verified in §0.
2. **Component catalog identity resolution** — `resolveComponentCatalogEntryDetailed`/`resolveCandidate` (EWO-083), consumed uniformly by install-candidate resolution and persisted-identity reconciliation. Two pre-existing, deliberately-unmigrated call sites (`src/data/fullComponentCatalog.ts`, and `componentPresentation.ts`'s `resolveComponentLabel`) were reviewed under EWO-083 and found to already be correct for their narrower purposes — not re-litigated here.
3. **Component grade/class/manufacturer/classification presentation** — `resolveComponentLabel`, used everywhere a component's descriptive text is rendered to a Commander. `installCandidates.ts`'s raw `.grade` read for numeric Upgrade-tier comparison is a documented, narrow exception (EWO-083) that never reaches the screen directly.
4. **Installed/Target/Factory identity display** — `ComponentAssignmentLabel`, used uniformly across Ship Workspace, Ship Detail, and Mission Composer's Loadout tables.
5. **Persisted component identity / R-004** — resolved by EWO-084's `reconcileArray`, scoped correctly to genuinely-persisted data only.
6. **Ship name and ownership status** — both read directly off materialized `Ship` fields everywhere, no page reconstructs either from a lower-level source.
7. **Ship image resolution** — `resolveShipImage`/`useResolvedShipImage` is the sole live chokepoint; the one bypass (`ShipRecordCard.tsx`) is confirmed dead code (`@deprecated`, EWO-032, zero live call sites).
8. **Active/retired ship filtering** — `selectActiveShips`/`selectRetiredShips` (SW-015C), consistently applied at every aggregation site; the handful of raw `ships` reads are all documented single-ship-by-id lookups for direct-link/legacy display, not aggregations.
9. **Availability, Needed By (component-level), and Reservation Eligibility** — `calculateComponentAvailability`, `resolveNeededByBuilds`, `resolveReservationEligibility`, all confirmed single-authority for Hangar Inventory and Decision Center.
10. **Retire-preview releasable-reservation count** — `EditFleetAssetModal` calls the same `activeReservationsForShip` helper the real retire action uses, so the preview can't drift from the actual effect.
11. **`QuarantinedAssignment`** — currently has no UI consumer at all; safe by absence, but flagged as a gap worth a product decision (not a data-authority bug).
12. **Hardpoint Size/Type fields across port specs, stored inventory items, catalog entries, and resolved identity** — confirmed these are four distinct, independently-appropriate data points, not four competing derivations of one fact.

---

## 4. Direct Catalog/Raw-Store Lookups and B/C/D Findings

### 4.1 Direct lookups inventory (not necessarily bugs — see per-item verdict)

| # | Location | What it reads directly | Verdict |
|---|---|---|---|
| 1 | `src/pages/MissionControl.tsx:238`, `FleetDashboard.tsx:94` | `hardpoints.filter(h => h.buildId === ship.activeBuildId)` (raw store rows, bypassing `prepareCanonicalHardpoints`) | **C** — §4.2 |
| 2 | `src/components/ShipRecordCard.tsx:108` | `ship.imageUrl` directly (bypasses `resolveShipImage`) | **B**, inert — deprecated, unused |
| 3 | `src/pages/FleetDashboard.tsx:82,102`, `MissionControl.tsx:315`, `QuickUpdate.tsx:63`, `ShipDetail.tsx:143`, `ShipWorkspacePrototype.tsx:515`, `MissionComposer.tsx:185` | `builds.find(b => b.id === ship.activeBuildId)` reimplemented independently at each site | **B**/**C** — §4.2 |
| 4 | `src/utils/installCandidates.ts:250-274` | `installedLoadouts.filter(...)` for Borrow-tier donors, not scoped to `selectActiveShips` despite `ships` being passed in for name lookup only | **D** — §4.4, confirmed live bug |
| 5 | `src/utils/procurement.ts:106-137,179-190`, `inventoryDependencies.ts:150-152` | Hardpoint demand loops that never check `hp.isStructural` | **C** — §4.3 |
| 6 | `src/pages/DecisionCenter.tsx:270`, `CatalogComponentSearch.tsx:82,86` | `catalogEntry.category`/`S${catalogEntry.size}` rendered directly, bypassing `formatComponentIdentity` | **A** — different purpose (picker/lookup metadata for a not-yet-installed component), not a competing derivation |
| 7 | `src/pages/MissionControl.tsx` (`buildProcurementList`) vs. `HangarInventory.tsx`/`DecisionCenter.tsx` (`resolveNeededByBuilds`) | Two independently-maintained "unresolved demand" predicates | **B** — §4.4 |

### 4.2 Finding — Active Build lookup duplication + fallback divergence (B, narrow C)

Seven call sites independently reimplement `builds.find(b => b.id ===
ship.activeBuildId)` rather than sharing one selector. For normal data
all seven agree (same field, same array). But two of the seven —
`ShipDetail.tsx:143` and `MissionComposer.tsx:185` — silently fall
back to the ship's first build (`shipBuilds[0]`) when `activeBuildId`
doesn't resolve to a real build, while `FleetDashboard.tsx`,
`MissionControl.tsx`, `QuickUpdate.tsx`, and `ShipWorkspacePrototype.tsx`
show `'Unknown Loadout'`/`undefined` instead. **This is a genuine C —
Semantic Divergence for the specific edge case of a dangling
`activeBuildId`** (a ship record pointing at a Build that was deleted
or never created) — narrow, not currently known to be triggered by any
real fleet data, but a real behavioral difference a Commander could
hit.

### 4.3 Finding — `isStructural` exclusion gap in procurement/Needed-By (C)

`procurement.ts`'s `buildProcurementList`/`buildReservedAwaitingInstallLines`
and `inventoryDependencies.ts`'s `resolveNeededByBuilds` never
explicitly check `hp.isStructural`, unlike every other demand-list
consumer (`priorityActions.ts`, `shipManagementSummary.ts`,
`LoadoutPortTree`). This is currently masked by an *implicit*
invariant — every hardpoint-creation path forces structural rows to
`targetItem: '—'`/`status: 'OK'`, which happens to also be filtered
out by the existing `targetItem === '—'` check — but it is not an
*enforced* invariant, and `priorityActions.test.ts` itself proves by
construction that a structural row with a real `targetItem` and
`Missing` status is representable. If that invariant is ever violated
elsewhere, procurement/Needed-By would silently miscount. Classified C
because the underlying data source and business question are the
same, but the exclusion rule differs by consumer.

### 4.4 Finding — Borrow-tier retired-ship leakage (D, confirmed live bug)

`installCandidates.ts`'s Borrow tier (lines 250–274) filters
`installedLoadouts` by `shipId !== currentShipId` only — it never
applies the same `selectActiveShips` scoping that
`ShipWorkspacePrototype.tsx:1535` explicitly documents as guaranteeing
"a retired vessel is never offered as a 'borrow from' donor source."
`ships` is used in this function *only* to resolve a display name, not
to filter eligibility, so a component installed on a retired ship
still enters the `borrowable` result — it's just mislabeled `shipName:
'Unknown Ship'` instead of being excluded. `retireFleetAsset`
(`useFleetStore.ts:897-936`) confirms `installedLoadouts` is
deliberately never pruned on retirement, so this data shape is
reachable today, not theoretical. **This is a Source Divergence (D):**
the eligibility computation draws from an unfiltered dataset while the
UI's own documented contract promises active-fleet-only. It is the
most severe finding in this audit — a real, currently-reachable,
Commander-visible contradiction (an offer to "Borrow" from a ship that
has been retired), distinct from the readiness-input finding in §0,
which is currently latent. The same unscoped-`ships` pattern recurs at
`ShipWorkspacePrototype.tsx:1112` and `shipManagementSummary.ts:416`
for a lower-severity Tier-3 hint label.

### 4.5 Finding — Mission Control's procurement aggregate duplicates the Needed-By predicate (B)

`buildProcurementList` (feeding Mission Control's "Needed By" column)
and `resolveNeededByBuilds` (feeding Hangar Inventory/Decision
Center's) are an intentionally-documented split — they answer
different questions ("what must the fleet acquire" vs. "which builds
need this specific component"). But both independently reimplement
the same core "is this hardpoint unresolved demand" predicate, and
their "already reserved" checks differ in precision: `resolveNeededByBuilds`
does a plain inline name/status match, while `buildProcurementList`
uses the entityClass-aware `findActiveSlotReservation`. Not a live bug
today — classified B, duplicate-but-currently-equivalent — but a drift
risk if the eligibility rule changes in only one file.

---

## 5. Commander Consistency Statement (deliverable #9)

**Can any two Commander-facing views currently display contradictory
values for the same fact?**

- **Readiness:** No — live-verified identical (93%) across Mission
  Control, Fleet Dashboard, Ship Management, and Ship Detail for the
  same ship (§0.4). One latent, non-manifesting structural risk
  remains (§0.3/§4.2/EWO-089).
- **Install-candidate "Borrow Available" offers:** **Yes** — a
  Commander can be shown a "Borrow Available" offer sourced from a
  retired ship's installed component, which contradicts the product's
  own documented guarantee that retired ships are excluded from donor
  sourcing (§4.4). This is the one confirmed, currently-live
  contradiction found by this audit.
- **Active Build/Loadout display for a ship with a dangling
  `activeBuildId`:** A narrow, currently-unconfirmed-in-real-data edge
  case where two surfaces would show different text ("Unknown
  Loadout" vs. the ship's first build) for the same ship (§4.2).
- **Everything else audited** (component identity/classification,
  installed/target/factory display, ship name/ownership/image,
  availability, Needed By at the component level, reservation
  eligibility, retire-preview counts, structural-hardpoint exclusion
  in non-procurement consumers) — no contradiction found; single
  canonical authority confirmed for each.

---

## 6. Do Not Refactor Under This Work Order

Per EWO-087's explicit scope, no production code was changed to
produce this document. All findings above are discovery only. The
following section proposes separate, narrowly-scoped follow-on work
orders for Chief Architect review and prioritization.

---

## 7. Recommended Remediation Work Orders (priority order)

**EWO-088 — Borrow-Tier Retired-Ship Leakage Fix.** Scope `installCandidates.ts`'s
`installedElsewhere` filter (Borrow tier, lines 250–274) to
`selectActiveShips`-scoped ships, matching the guarantee already
documented at `ShipWorkspacePrototype.tsx:1532-1534`. Also address the
same unscoped-`ships` pattern at `ShipWorkspacePrototype.tsx:1112`
and `shipManagementSummary.ts:416` (Tier-3 hint labels). **Highest
priority** — confirmed live, Commander-visible contradiction of a
documented product guarantee.

**EWO-089 — Mission Control / Fleet Dashboard Hardpoint Reconciliation.**
Route Mission Control's and Fleet Dashboard's readiness hardpoint
input through `prepareCanonicalHardpoints`, matching Ship
Management/Ship Detail, closing the gap the utility's own doc comment
already calls for. Not currently manifesting for any real fleet data,
but directly closes the amendment's "Level 2 — Commander Consistency"
concern at the structural level rather than relying on no ship ever
drifting from its template.

**EWO-090 — `isStructural` Exclusion Guard for Procurement/Needed-By.**
Add an explicit `if (hp.isStructural) continue` (or equivalent) to
`procurement.ts`'s `buildProcurementList`/`buildReservedAwaitingInstallLines`
and `inventoryDependencies.ts`'s `resolveNeededByBuilds`, plus a
regression test modeled on `priorityActions.test.ts`'s existing
structural-row construction, so the exclusion is enforced rather than
incidentally true.

**EWO-091 — Shared Active-Build Resolution Helper.** Extract a single
`resolveActiveBuild(ship, builds)` utility to replace the seven
independent reimplementations found in §4.2, standardizing the
dangling-`activeBuildId` fallback behavior (recommend: no silent
fallback to `shipBuilds[0]` for *active*-build display, matching the
majority of current call sites — reserve the `shipBuilds[0]` fallback
pattern for explicit "pick a build to review" UI flows only, which is
its original purpose in `ShipDetail.tsx`/`MissionComposer.tsx`).

**EWO-092 (optional, lowest priority) — Deprecated Ship Card Cleanup.**
Delete `src/components/ShipRecordCard.tsx` and `PriorityCard.tsx`
(confirmed zero live call sites, `@deprecated` since EWO-032),
removing the one dead-code direct `ship.imageUrl` bypass along with
the files. Pure cleanup, no behavioral risk.
