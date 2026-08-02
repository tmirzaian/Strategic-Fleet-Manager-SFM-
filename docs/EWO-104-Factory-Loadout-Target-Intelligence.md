# EWO-104 (corrected) — Flight Commander: Factory Loadout Target Intelligence

**This supersedes the withdrawn launch-readiness/preflight-checklist EWO-104
attempt in full.** No launch-readiness UI was implemented. Flight Commander
is a static tactical acquisition roster — a "Be On the Lookout" list —
answering: *which known stock/factory ship models carry components our
fleet's Commander-managed target loadouts still need?*

---

## 1. Requirement-Authority Map (Part A)

| Question | Authority | Notes |
|---|---|---|
| Source of Commander-managed target requirements | `Hardpoint.targetItem`/`targetEntityClass`, `Hardpoint.status` | A real, non-empty target with `status === 'Missing'` |
| Exclude factory-only requirements | Structural, not a filter | A Factory build's hardpoints are materialized `installedItem === targetItem` at creation (`fleetAssetMaterializer.ts`), so `computeHardpointStatusWithValidation` always yields `'OK'` for them — the universal `status !== 'Missing'` guard already excludes Factory demand; no `build.kind === 'FACTORY'` check exists anywhere in this codebase's own demand-computation files, and none was added here either |
| Exclude already-satisfied targets | `status === 'OK'` | Same literal every existing demand list (`priorityActions.ts`, `procurement.ts`) uses |
| Exclude unresolved/invalid identities | `status === 'Invalid Target'`, `status === 'Unresolved'` | Same literal exclusion as above |
| Exclude intentional empty slots | `!hp.targetItem \|\| hp.targetItem === '—'` | The exact literal (em-dash sentinel) `priorityActions.ts`/`procurement.ts` both already use |
| Exclude purely informational upgrades | `status === 'Upgrade Available'` excluded | **New narrowing beyond `buildProcurementList`**, required by this work order's own Part C — an upgrade means something is already installed, so it is not acquisition demand |
| Exclude retired fleet assets | `selectActiveShips(ships)`, membership check | Same convention `describeAcquisitionHint`'s EWO-088 fix already established for donor ships |
| Canonical component-identity resolver | `componentIdentityMatches` (`src/utils/procurement.ts`, already exported) | EntityClass-preferred, exact-name fallback — reused directly, never re-implemented |
| "Still genuinely needed" (net of owned stock) | `calculateComponentAvailability` (`src/engine/logistics/availability.ts`) | Reused directly; raw per-build demand is netted against `availableQuantity` once per component group |

**Why `buildProcurementList` was not called directly**: it includes
`'Upgrade Available'` hardpoints as demand (Part C explicitly excludes
them for BOLO) and its `ProcurementLine` return type drops `entityClass`
(needed here for Part D's entityClass-preferring factory match). Instead,
this resolver replicates its exact same predicate literals and composes
directly from the same two lower-level canonical primitives
(`calculateComponentAvailability`, `componentIdentityMatches`) — composing
one level down, not duplicating the netting arithmetic or the identity
rule itself.

**Demand scope — documented decision**: fleet-wide across every Build
belonging to an active ship (not just each ship's currently active Build).
Mission Control's own two "what does the fleet need" surfaces differ in
scope (`priorityActions.ts` = active-build-only; `procurement.ts`'s
Quartermaster Report = fleet-wide across every Build). BOLO's own framing
— "Commander-managed target **loadouts**," plural, a fleet-level
intelligence question — matches the Quartermaster Report's broader scope,
so that is the one this resolver follows.

## 2. Factory-Loadout Data-Source Map (Part A.4/A.5)

`shipFactoryTemplates: Record<string, FactoryHardpointTemplate[]>`
(`src/data/shipDefinitions.ts`), keyed by `ShipDefinition.id`. Each entry:
`slotLabel`, `type` (category), `size`, `factoryItem` (display name),
`factoryEntityClass?` (DataCore identity, when known), `isStructural?`. **No
quantity field** — quantity is the count of matching, non-structural rows
for that exact component within one ship's template. Roughly 40 of ~314
known ship definitions (catalog-only records with no deep import) carry a
genuinely empty template — this resolver skips those via a `.length === 0`
gate, iterating the deduplicated `shipDefinitions` array (never
`Object.keys(shipFactoryTemplates)` directly, which also carries alias
keys pointing at the same array reference and would double-count a ship
under two ids).

## 3. Canonical Intelligence Resolver (Part B)

`resolveFactoryLoadoutTargetIntelligence(params)` —
`src/utils/factoryLoadoutTargetIntelligence.ts`. Returns plain structured
data only (no JSX, no CSS classes, no page-specific strings):

```ts
interface FactoryLoadoutTargetIntelligenceResult {
  sourceShips: TargetIntelligenceSourceShip[]       // ranked
  demandComponents: TargetIntelligenceDemandComponent[]  // diagnostic — matched or not
  matchedDemandComponentCount: number    // Part H "Priority Components"
  totalFleetRequirementUnits: number     // Part H "Fleet Requirements"
  sourceShipsIdentifiedCount: number     // Part H "Source Ships Identified"
  highValueTargetCount: number           // Part H "High-Value Targets"
  factoryDataAvailable: boolean          // Part K.3
}
```

Each `TargetIntelligenceSourceShip` carries `shipDefinitionId`,
`displayName`, `matches[]` (per matched component: name, entityClass,
category, `factoryQuantity`, `fleetQuantityNeeded`, `affected[]`),
`distinctComponentCount`, `totalUnresolvedUnitsCovered`,
`categoriesPresent`. Each `affected` entry carries `shipId`/`shipName`/
`buildId`/`buildName`/`quantity`/`deepLink`.

## 4. Inclusion/Exclusion Rules (Part C/D) — see §1 table above

Part D's "do not include the Commander's owned status as a requirement for
the source ship" is satisfied by construction — the source-ship loop
iterates the static `shipDefinitions` catalog directly and never reads
`ships`/`fleetAssets` at all for that side of the match.

## 5. Ranking Method (Part E)

`sourceShips.sort()`: (1) distinct matched components, descending; (2)
`totalUnresolvedUnitsCovered` (`Σ min(factoryQuantity, fleetQuantityNeeded)`
across matches), descending; (3) display name, ascending, as a stable
tie-breaker. No economic value, salvage probability, rarity, or mission
priority scoring.

## 6. Route and Page Architecture (Part F/G)

- Route `/flight-commander` unchanged from the withdrawn attempt — still
  placed immediately after "Ship Management," immediately before "Hangar
  Inventory," among the principal operational workspaces (`App.tsx`,
  `Sidebar.tsx`, icon `Rocket`).
- Header: eyebrow "Flight Commander" / white status line **"Target
  Intelligence Available"** (no preflight/launch-readiness language).
- `src/pages/FlightCommander.tsx` — single-file page (this codebase's own
  convention): `SummaryCards`, `FilterBar`, `TargetRosterTable` (+
  `NoDemandPanel`/`NoSourceMatchPanel`/`FactoryDataUnavailablePanel`).

## 7. Summary-Card Definitions (Part H)

| Card | Source field |
|---|---|
| Source Ships Identified | `sourceShipsIdentifiedCount` |
| Priority Components | `matchedDemandComponentCount` |
| Fleet Requirements | `totalFleetRequirementUnits` |
| High-Value Targets | `highValueTargetCount` |

## 8. Target-Roster Behavior (Part I/J)

Columns: Source Ship, the five stable core categories (Coolers/Power
Plants/Quantum Drives/Shields/Weapons — `CANONICAL_STABLE_CATEGORY_KEYS`,
`componentCategoryIcon.ts`) as compact dot indicators, and Matching Fleet
Requirements (grouped component list, each with a "Needed by: Ship — Build
×N" breakdown, deep-linked). Lightweight Part J filtering: a text search
(source ship name or component name, case-insensitive substring) plus
category pills — pure client-side filtering over the resolver's own
already-computed `sourceShips`, no new resolver calls, no expanded scope
(mission/manufacturer/value/probability filters explicitly not built, per
Part J's own allowance to defer anything that would delay the slice).

## 9. Empty/Error States (Part K)

| State | Trigger | Copy |
|---|---|---|
| No unresolved demand | `demandComponents.length === 0` | "No Unresolved Target Components" |
| No source match | demand exists, `sourceShips.length === 0` | "No Known Source Ships" |
| Factory data unavailable | `!factoryDataAvailable` (checked first, takes priority) | "Factory Loadout Data Unavailable" — a non-destructive diagnostic, never launch-readiness messaging |

## 10. Explicit Statement: No Launch-Readiness UI Was Implemented

The withdrawn attempt's `evaluateLaunchReadiness`-consuming page (status
badges, preflight checklist, "Cleared For Launch" panel, vessel-readiness
summary strip) was fully deleted before this implementation began — `git
status` confirms no trace remains. `evaluateLaunchReadiness` /
`src/utils/launchReadiness.ts` (EWO-103) is untouched and unused by this
page; this EWO does not call it anywhere.

## 11. Tests and Gates

32 new tests: 18 in `factoryLoadoutTargetIntelligence.test.ts` (a mocked,
fully controlled `shipDefinitions`/`shipFactoryTemplates` fixture — real
generated ship data isn't a stable test fixture, matching this repo's own
`shipDefinitions.test.ts` convention of testing *data* with real,
guarded-early-return datasets while testing *logic built on top of it*
with controlled fixtures), 1 in a dedicated `...emptyData.test.ts` (Part
K.3), 13 in `FlightCommander.test.tsx` (resolver mocked via `vi.spyOn`,
isolating UI-rendering correctness from resolver correctness) — together
covering all 20 required scenarios. Route/nav wiring tests
(`Sidebar.test.tsx`, `App.test.tsx`) carried over unchanged from the
withdrawn attempt, since route/nav placement requirements did not change.

`tsc --noEmit` clean · full suite 222 files / 2822 tests passing ·
`npm run build` clean.

## 12. Browser Walkthrough

Live on port 5176 (production port 5173 untouched throughout), using the
real seeded demo fleet — no synthetic data needed; the seed fleet already
carries genuine unresolved demand:

- Sidebar: Flight Commander appears highlighted, correctly positioned,
  `Rocket` icon.
- Default view: 15 Source Ships Identified, 4 Priority Components, 7 Fleet
  Requirements, 0 High-Value Targets — real roster rendered (Constellation
  Taurus Wikelo War Special, Scorpius Wikelo Sneak Special, F7 Hornet Mk
  Wikelo, etc.), each with category dots and "Needed by" breakdowns.
- Category filter ("Coolers") correctly narrows the roster.
- Search ("Ghost") correctly filters by source-ship-name substring match.
- A "Needed by" deep link (Cutlass Black) navigated to
  `/ship-workspace/cutlass-black`, landing on a page showing "Missing:
  Avalanche" — the exact same component/ship the roster displayed,
  confirming agreement between Flight Commander and Ship Management.
- Zero console/page errors across the whole walkthrough.
- Mobile (390px) renders without crashing; the pre-existing Sidebar/content
  overlap already documented under EWO-100/EWO-101 is present but
  unrelated to this page (same condition regardless of page content).
- Port 5173 confirmed untouched throughout.

Evidence: `docs/ewo-104-target-intelligence-evidence/` (7 screenshots).

## 13. Residual Data Limitations

- `factoryQuantity`/`fleetQuantityNeeded` are simple counts, not
  weighted by any economic/rarity/probability signal — by explicit design
  (Part E forbids inventing such scoring).
- A source ship with an entirely empty factory template (no deep-import
  data, catalog-only) is silently excluded from the roster rather than
  shown as an "unknown" entry — an honest omission consistent with
  `shipFactoryTemplates`' own established "empty means never inflate an
  invented port tree" convention, but it does mean some real ships in the
  wider Star Citizen universe simply cannot appear as source intelligence
  until their data is deep-imported.
- The roster does not distinguish "this component is common/easy to find"
  from "this component is rare" — again, explicitly out of Version 1
  scope (Part M).

---

## Amendment 1 — Intelligence Presentation Refinement

UI/UX refinement only — the canonical resolver
(`factoryLoadoutTargetIntelligence.ts`) is untouched. A new presentation
module, `src/utils/flightCommanderPresentation.ts`
(`buildFlightCommanderPresentation`), sits between the resolver and the
page: it filters and re-derives counts from the resolver's own already-
computed output — no new demand/matching/availability calculation.

**Part A — Hero, flagged gap.** No approved Flight Commander hero asset
exists anywhere in this repo — confirmed by direct source read before
writing any code: `public/assets/environments/` has no `flight-commander`
directory, and `'flight-commander'` is not a registered `EnvironmentId`
(`src/config/assets/types.ts`). Per this project's own established asset-
handoff discipline (e.g. EWO-096), no placeholder/fabricated artwork was
created, and the hero/bottom-anchoring layout was not implemented. The
"standard page header treatment" sub-requirement needed no change (already
in place). **This is a real, outstanding gap requiring either an approved
asset delivery or explicit Chief Architect direction to defer it.**

**Part A — Quartermaster Gold (implemented, independent of the hero).**
Summary-card numeric values changed from `text-cyan` to `text-gold`
(`tailwind.config.js`'s `#C9A227` token) — informational emphasis, never
success/warning/danger, per the token's own documented "not a general
accent" restraint. Glyphs, card styling, and labels are otherwise
unchanged (there were no card glyphs to begin with).

**Part B — Search & Filter.** No changes, confirmed.

**Part C — Intelligence Matrix.** The five category column headers are now
compact icons (`CANONICAL_COMPONENT_CATEGORY_ICON` — `Wind`/`Cooler`,
`Zap`/`PowerPlant`, `Rocket`/`QuantumDrive`, `Shield`/`Shield`,
`Crosshair`/`Weapon` — the same glyph language already established
elsewhere, no new icons), each with a `title` and `aria-label` preserving
the full category name for tooltip/accessibility. An explicit `<colgroup>`
reallocates the recovered width: Source Ship 16%, each category column 6%
(30% total, down from unconstrained text-driven widths), Matching Fleet
Requirements 54% — now the table's dominant visual element.

**Part D — Canonical Source Ship Filtering.** No structured
cosmetic/edition authority exists anywhere in `ShipDefinition`
(`src/types/index.ts`) — confirmed by direct source read. The only real
signal is the ship's own `displayName` text. Implemented as a documented,
explicit substring exclusion list (`isCanonicalStockShipDisplayName`,
`flightCommanderPresentation.ts`): `wikelo` and `best in show` are
confirmed present in this app's real generated data (29 and 2 occurrences
respectively, verified by direct grep); `foundation festival` and
`concierge` are included defensively per the work order's own named
examples even though absent from current data. Live-verified: the 15-ship
roster (all Wikelo variants) dropped to 6 genuine stock ships after this
filter.

**Part E — Actionable Component Scope.** The resolver still returns every
matched category internally (untouched); the presentation layer filters
both the roster's `matches`/`categoriesPresent` and the summary counts down
to the five stable categories (`CANONICAL_STABLE_CATEGORY_KEYS` — the same
set Part C's columns already use). A source ship whose only matches are
non-actionable categories (e.g. Missile Racks) is dropped from the roster
entirely, not shown empty. Ranking is reapplied post-filter using the
identical tie-break rule the resolver itself uses (distinct matches desc,
coverage desc, name asc) — filtering can change which categories count
toward a ship's own distinct-match total, so re-ranking (not a new ranking
concept) is necessary for the displayed order to stay accurate.

**Part F — Manufacturer Display, evaluated and not implemented.**
`ShipDefinition.manufacturer` exists and could be prefixed onto
`displayName`, but was deliberately not implemented: it would lengthen the
Source Ship column exactly when Part C's own goal is shrinking non-
narrative columns to give more room to the intelligence column, and every
ship name observed in the real roster is already unambiguous without a
manufacturer prefix. Documented per Part F's own "implement only if it
materially improves... document the decision" instruction.

**Regression verification (Part G).** Resolver output, summary-metric
*definitions*, search behavior, filter behavior, deep links, and the
canonical authority are all unchanged — confirmed by the original 18
`FlightCommander.test.tsx` tests passing unmodified against the new
presentation layer. Cosmetic/promotional variants and non-actionable
categories are now excluded (by design, not a regression). Table width is
measurably reallocated (colgroup). Mobile renders without crashing
(pre-existing Sidebar overlap unrelated, unchanged from prior EWOs).

**Files changed**: `src/utils/flightCommanderPresentation.ts` (new),
`src/utils/__tests__/flightCommanderPresentation.test.ts` (new, 17 tests),
`src/pages/FlightCommander.tsx` (amended), `src/pages/__tests__/FlightCommander.test.tsx`
(5 new tests appended, 13 original unchanged and passing). No file in
`factoryLoadoutTargetIntelligence.ts` or its own test files touched.

**Gates**: `tsc --noEmit` clean · full suite 223 files / 2844 tests passing
(22 new) · `npm run build` clean.

**Live verification** (port 5176, real seeded fleet, 5173 untouched):
roster dropped from 15 to 6 source ships (all Wikelo variants confirmed
gone — a whole-page text scan found zero occurrences of "Wikelo"/"Best In
Show"/"Foundation Festival"/"Concierge"), summary numbers render in gold,
category columns render as compact icons with accessible tooltips, the
Matching Fleet Requirements column is visibly wider with no truncation,
zero console errors, mobile confirmed functional. Evidence:
`docs/ewo-104-amendment1-presentation-evidence/` (4 screenshots).

**Residual limitation carried forward from Part A**: the hero banner
remains unimplemented pending an approved asset.

---

## Amendment 2 — Custom Target Acquisition Boundary and Hero Integration

Two independent tracks: (1) tightening the canonical resolver's own demand
eligibility to the three mandatory conditions the Chief Architect's product
clarification states, and (2) resolving Amendment 1's flagged hero-asset
gap now that the approved master has been delivered.

### Track 1 — Demand Eligibility (Parts A-E)

**Part A audit against the existing implementation**: five of the six
eligibility conditions were already correctly enforced (active fleet asset
via `selectActiveShips`; real/non-empty target; not satisfied by installed
state; excludes Invalid/Unresolved/OK/Upgrade-Available via
`status !== 'Missing'`). Two gaps were found and fixed:

1. **No explicit Factory-Loadout exclusion** (Part B). The prior
   implementation relied entirely on the emergent fact that a Factory
   build's hardpoints always materialize with `status: 'OK'`
   (`fleetAssetMaterializer.ts`) — correct in practice, but not an explicit,
   independent guard. Added `isCommanderManagedBuild(build)` — `build.kind
   !== 'FACTORY'` — as its own canonical predicate, exported from
   `factoryLoadoutTargetIntelligence.ts` and applied directly in demand
   derivation, per Part B's explicit "extract the smallest shared predicate...
   use the same authority wherever Flight Commander demand is derived"
   instruction. A dedicated test forces a pathological Factory-build
   hardpoint into `status: 'Missing'` to prove the explicit guard holds
   independently of the status check.

2. **Reservations were not excluding their own matching demand** (Part C).
   The prior netting only subtracted `calculateComponentAvailability`'s
   `availableQuantity` (free stock) in aggregate — a hardpoint whose own
   exact slot already had a valid active reservation still counted as raw
   demand. Fixed by adding a per-hardpoint `findActiveSlotReservation`
   check (`src/engine/logistics/reservationLookup.ts`) **before** a
   hardpoint enters the demand group — the exact same two-step call path
   `buildProcurementList` (`src/utils/procurement.ts`) already uses: (1)
   per-row reservation exclusion, (2) aggregate `availableQuantity`
   netting for what remains. Documented explicitly in the module's own doc
   comment, per Part C's "document the exact call path" instruction. This
   was organically confirmed live: a real Cutlass Black/Avalanche
   reservation in the seed data, previously miscounted as open demand
   (visible in Amendment 1's own screenshots), correctly disappeared from
   the roster after this fix — while Ship Management still correctly shows
   it as physically "Missing" (installation still pending, just no longer
   something to hunt for).

**Part D (factory-equivalent custom targets)** required no code change —
the resolver never compares a target against the ship's *own* factory
item, only against its own `installedItem` (via `status`), so "target
happens to equal the model's factory component" was already irrelevant to
the eligibility decision by construction. Two dedicated tests lock this in
directly (included when unsatisfied; excluded once installed).

**Part E (source restrictions)** required no change — Amendment 1's
`flightCommanderPresentation.ts` (Wikelo/Best In Show/Foundation
Festival/Concierge exclusion, 5-category-only display) sits unmodified on
top of the corrected resolver output.

### Track 2 — Hero Integration (Part F)

The approved master (confirmed present on disk before any code was
written: `public/assets/environments/flight-commander/flight-commander-background-master.png`,
6684×3764) is now registered as a fifth-generation `EnvironmentId`
(`'flight-commander'`, `src/config/assets/types.ts`/`environmentAssets.ts`),
with 1920/1280 WebP tiers generated via the existing
`scripts/generateEnvironmentAssets.ts` pipeline (new `DerivativeSpec`
entry, master filename matched verbatim). Presentation matches Mission
Control's own settled full-strength treatment exactly (`opacity: 1.0`,
`brightness/contrast/saturation: 1.0`, `blurPx: 0`, no overlay) — "the goal
is zero shading over the loaded image," reused rather than re-derived.

Mounted via `<PageEnvironment id="flight-commander" />`, the same
canonical composition primitive Mission Control's own hero uses. The four
Quartermaster summary cards are anchored bottom/right within the hero
(`flex flex-col justify-end` + `lg:ml-auto`), preserving the master's
left-side negative space; the standard page header above the hero is
unchanged. Cards render only once `factoryDataAvailable` is true — a "0"
inside the hero must mean a real confirmed zero, never a data-unavailable
placeholder — but the hero artwork itself always renders regardless of
data state, establishing the compartment identity the same way Mission
Control's hero does even against an empty fleet.

### Regression Verification (Part G)

All pre-existing tests for both the resolver (18) and the page (18) pass
unmodified except where Amendment 2 itself intentionally changes behavior
(demand eligibility) — confirming search, filtering, deep links, cosmetic-
variant exclusion, and category restriction are all untouched.

### Files Changed

- `src/utils/factoryLoadoutTargetIntelligence.ts` (amended — `isCommanderManagedBuild`, reservation-aware demand)
- `src/utils/__tests__/factoryLoadoutTargetIntelligence.test.ts` (10 new tests)
- `src/config/assets/types.ts`, `environmentAssets.ts` (new `'flight-commander'` EnvironmentId)
- `src/config/assets/__tests__/environmentAssets.test.ts` (2 new tests, 1 updated set)
- `scripts/generateEnvironmentAssets.ts` (new DerivativeSpec)
- `public/assets/environments/flight-commander/` (master + 2 generated WebP tiers)
- `src/pages/FlightCommander.tsx` (hero integration)
- `src/pages/__tests__/FlightCommander.test.tsx` (3 new tests)

No change to `flightCommanderPresentation.ts` or its own tests (Part E
restrictions untouched, as intended).

### Gates

`tsc --noEmit` clean · full suite 223 files / 2859 tests passing (15 new)
· `npm run build` clean.

### Commander Acceptance Walkthrough

Scenario B (custom build, unmet target → eligible NPC sources appear) and
Scenario C (reservation reduces/removes demand) were both demonstrated
live on real seeded data (port 5176, 5173 untouched, zero console errors)
— see §"Track 1" above for the organic Cutlass Black/Avalanche
confirmation. Scenarios A (Factory-only ship → no intelligence) and D
(factory-equivalent custom target → demand only once physically
unsatisfied) are proven with precise, deterministic unit tests
(`factoryLoadoutTargetIntelligence.test.ts`) rather than a constructed live
walkthrough — both require building specific synthetic fleet states that
the unit tests already isolate more precisely than a live click-path could
demonstrate. The hero renders correctly through the canonical environment
pipeline at both desktop and mobile widths. Evidence:
`docs/ewo-104-amendment2-evidence/` (5 screenshots).

### Residual Limitations

- The `isCommanderManagedBuild` guard is currently unreachable via any real
  data path (Factory hardpoints are always `'OK'` by construction) — it
  exists purely as defense-in-depth per Part B's explicit instruction, not
  because a live gap was found.
- Reservation exclusion is per-exact-slot (`missionConfigurationId` +
  `targetSlotLabel` + `componentName`), matching `buildProcurementList`'s
  own established granularity — a reservation for the "wrong" slot on the
  same build does not suppress a different slot's genuine demand, by
  design (tested directly).

---

## Amendment 3 — Intelligence Presentation Refinement II

Presentation only (Part H) — no resolver, filtering, ranking, or deep-link
change. `resolveFactoryLoadoutTargetIntelligence` and
`flightCommanderPresentation.ts` are byte-for-byte unchanged.

**Part A — hero composition.** Summary cards moved from the hero's right/
bottom anchor to a left-anchored column (`lg:w-[300px]`, full hero height,
`flex items-center`), mirroring Mission Control's own left-metrics-column
layout exactly. The right side is now a pure `flex-1` negative-space
spacer over the artwork's own highest-detail area (a holographic command-
table scene) — live-verified.

**Part B — sticky intelligence header.** `<thead>` now uses `sticky top-0
bg-panel z-10` — the identical convention `LoadoutPortTree.tsx`'s own
table header already establishes, reused rather than invented. Live-
verified with a genuinely short viewport (forcing real scroll): the header
row stays pinned exactly at the top of the visible area while body rows
scroll beneath it.

**Part C/D — entry density and rich identity, combined.** Each matched
component now renders three lines instead of the old four-plus: component
name; a rich catalog-metadata identity line (`describeComponentIdentity`,
new `src/utils/flightCommanderComponentIdentity.ts` — reuses
`resolveComponentByEntityClass`/`resolveComponentByName`, the existing
canonical catalog resolvers, formatting only `size`/`classification`
already on the record, never fabricating a field the catalog doesn't
carry); and one single-line `→ Ship • Build ×N` per affected destination,
with no orphan "Needed by:" label row. Live-verified against the real
seeded fleet's real catalog data — e.g. "S1 Power Plant • Stealth",
"S2 Shield • Industrial" rendered correctly from genuine catalog records,
not fixture data.

**Part E — header hierarchy.** Category header icons dimmed
(`text-muted/50`, same size/spacing); "Matching Fleet Requirements"
promoted to `text-cyan/90 font-bold` — the one column Commanders actually
read now visually leads the row.

**Part F — hero card polish.** Cards switched from the opaque `.panel`
class to a translucent glass treatment (`bg-panel/70 backdrop-blur-lg
border border-white/10 rounded-xl shadow-lg shadow-black/40`) — stronger
blur and a softer, more diffuse shadow than a flat panel, necessary now
that the cards sit directly over hero artwork. Padding, sizing, and
Quartermaster Gold typography are byte-for-byte unchanged; no animation
added.

**Part G — Operational Briefing empty state.** `NoDemandPanel` and
`NoSourceMatchPanel` (previously two separate table-shaped empty states)
are unified into one `OperationalBriefingPanel` — Part G's own copy
applies equally to either underlying cause ("no actionable factory
targets identified" is true whether there's no demand at all or demand
with no source match), and both are the same non-failure outcome from the
Commander's point of view. Reuses the Flight Commander hero artwork a
second time (`<PageEnvironment id="flight-commander" className="opacity-20"
/>`, dimmed), a new restrained CSS radar-sweep animation (`src/index.css`,
matching the existing `@keyframes`/`.animate-*` convention
`animate-ship-image-fade-in` already establishes — 6s linear rotation, low
opacity, never a dramatic effect), and a gold `CheckCircle2` status icon —
explicitly never a warning/danger tone, matching "this is mission success,
not missing information." `FactoryDataUnavailablePanel` (a genuine
diagnostic state, distinct in kind from a "nothing outstanding" success
state) is untouched.

### Files Changed

- `src/utils/flightCommanderComponentIdentity.ts` (new)
- `src/utils/__tests__/flightCommanderComponentIdentity.test.ts` (new, 7 tests)
- `src/pages/FlightCommander.tsx` (amended — hero layout, table, empty state)
- `src/pages/__tests__/FlightCommander.test.tsx` (10 new tests, several existing tests updated for the unified empty-state testid)
- `src/index.css` (new `radar-sweep` keyframes/utility)

No change to `factoryLoadoutTargetIntelligence.ts`,
`flightCommanderPresentation.ts`, or either of their own test files —
confirming Part H's "no authority changes" holds.

### Gates

`tsc --noEmit` clean · full suite 224 files / 2876 tests passing (17 new)
· `npm run build` clean.

### Commander Browser Walkthrough

Live on port 5176 (production port 5173 untouched, zero console errors
across every pass), real seeded fleet data:

- Hero: summary cards confirmed left-anchored, artwork's holographic
  command-table detail fully visible on the right.
- Sticky header: confirmed with a genuine short-viewport scroll — the
  header row stays pinned at the top while body rows scroll beneath.
- Compact entries: real catalog metadata rendered correctly for real
  seeded demand (e.g. "S2 Shield • Industrial"), single-line destinations,
  no orphan label row.
- Header hierarchy: category icons visibly dimmed, "Matching Fleet
  Requirements" visibly bolder/brighter.
- Mobile (390px): renders without crashing, cards stack 2×2, zero console
  errors (the pre-existing Sidebar/content overlap already documented
  under EWO-100/101/104 is present but unrelated to this page).

The Operational Briefing panel's own exact copy, gold tone, radar sweep,
and dimmed hero reuse are verified via the (already-passing) component
test suite rather than a constructed live empty-fleet scenario — reaching
a genuine empty-intelligence state live would require manually clearing
all seeded custom-build demand first, which the jsdom test suite already
proves deterministically and precisely. Evidence:
`docs/ewo-104-amendment3-evidence/` (6 screenshots).

### Residual Limitations

- The Operational Briefing panel's radar sweep and hero-reuse are not
  independently live-screenshotted (see above) — covered by unit/component
  tests instead.
- Metadata identity lines depend on the real generated component catalog
  being present in a given checkout; when a component can't be resolved
  (ambiguous or unknown), the line is simply omitted — confirmed both by a
  dedicated unit test and observed live (no broken/blank lines anywhere
  in the real seeded roster).
