# QDS-001 — Quartermaster Compartment Framework

**Classification:** Architecture Discovery / UX Infrastructure / Quartermaster Edition
**Priority:** Foundational
**Status:** Discovery Only — no production code, components, refactors, or routes were touched to produce this document.
**Authority:** [ADR-004 — Quartermaster Edition Design Language](ADR-004-Quartermaster-Edition-Design-Language.md), [ADR-005 — Operational Command Structure](ADR-005-Operational-Command-Structure.md)

---

## 0. One-Paragraph Summary

Every current compartment already implements pieces of ADR-004's
architectural layout independently, and no two implement it the same way.
Three genuinely different "hero" mechanisms exist today (`PageEnvironment`
full-bleed, `EnvironmentBay` bounded room, and two ad hoc patterns —
Captain's Log's inline accent div and Ship Management's `ShipHeroFrame`
photo banner). Only Flight Commander has true ADR-004-style mounted
summary cards. Empty states are the least consistent primitive in the
whole application — five different shapes exist, and Captain's Log has no
empty state at all. Flight Commander (Prototype Zero) is the only
compartment that currently expresses the full canonical layout grammar
end to end. This document catalogs what exists, names the recurring
primitives, and proposes a framework boundary and migration order —
architecture only, nothing here authorizes implementation.

---

## Part A — Complete Compartment Audit

### A.1 Mission Control (Executive Officer)

| Dimension | Finding |
|---|---|
| Header | Eyebrow "Mission Control" / Title "Operations Standing By" |
| Hero | `PageEnvironment id="mission-control"` — always-on, full-strength (opacity/brightness/contrast/saturation all 1.0), `relative overflow-hidden rounded-xl lg:border lg:min-h-[380px] flex lg:flex-row` |
| Summary cards | Not card-grid shaped — a `Fleet Status` column inside the hero's left glass panel (`CriticalMetricTile` "Ships Active" + three `FleetStatusTile` children), functionally a summary but structurally a column, not mounted cards |
| Workspace layout | Priority Actions (right hero column) → Top Priority Ship (up to 4 `ShipCard`s) → Quartermaster Report (Logistics Demand cards + Assessment + Procurement Work Queue table) |
| Supporting workspace | Execute Orders — three `WorkflowDestinationCard`s at the bottom |
| Empty state | Scoped to the Top Priority Ship sub-panel only (`ships.length === 0`) — `EnvironmentBay id="mission-control-empty-priority"`, `PackageX` icon, "No Vessels Assigned" / "Your fleet manifest is currently empty.", CTA "Add First Ship" → `/fleet`. The Hero and Quartermaster Report always render regardless of fleet size. |
| Scroll behavior | None — no sticky elements anywhere on the page |
| Filters | No dedicated filter toolbar. One click-to-filter interaction: clicking a Logistics Demand `ActionCard` toggles `categoryFilter`, scoping the Quartermaster Assessment/Work Queue below |
| Search | None |
| Command actions | None that mutate — every control is a `Link`/navigation (deep-links to `/fleet`, `/ship-workspace/:id`, `/hangar`, `/decision-center`) |
| Status messaging | Fleet Status tiles, Priority Actions cards, Quartermaster Assessment's three plain-language outcomes (`COMPLETE`/`PROCUREMENT_ONLY`/`ACTIONABLE`) |

### A.2 Fleet Dashboard (Quartermaster)

| Dimension | Finding |
|---|---|
| Header | Eyebrow "Fleet Dashboard" / Title "The Fleet Is At Your Command" |
| Hero | **None.** `'fleet-dashboard'` (the main, non-empty `EnvironmentId`) is `enabled: false` — no `PageEnvironment` import exists in this file at all |
| Summary cards | None |
| Workspace layout | Active/Retired toggle → Add Ship button → Card/Table view toggle → collapsible Filters → Sort row → ship grid or table |
| Supporting workspace | None distinct from the main grid/table |
| Empty state | **Three distinct shapes**, only one gets artwork: (1) retired-view-empty → plain `panel p-10`, `Archive` icon, "No Retired Vessels"; (2) all-retired-active-view → plain `panel p-10`, `Archive` icon, "No Active Vessels", CTA "View Retired (N)"; (3) genuine zero-ship-zero-retired → `EnvironmentBay id="fleet-dashboard-empty"`, `PackageX` icon, "No Vessels Assigned", CTA "Add First Ship" |
| Scroll behavior | None |
| Filters | Collapsible toolbar, 4 dimensions: Ownership, RSI Role, Manufacturer, Readiness — pill rows, active-filter chips, "Clear Filters" |
| Search | None |
| Command actions | Add Ship (opens `AddShipModal`) |
| Status messaging | Live "N Ship(s)"/"N Retired Vessel(s)" count in the sort row |

### A.3 Ship Management (Quartermaster)

| Dimension | Finding |
|---|---|
| Header | Eyebrow "Ship Management" / Title "Select Vessel For Maintenance" |
| Hero | **Neither `PageEnvironment` nor `EnvironmentBay`.** A structurally distinct per-ship pattern: `ShipHeroFrame` (a real ship photo banner) inside `data-testid="ship-operational-banner"`; the no-ship-selected fallback is a plain `<img>` from `resolveShipManagementIllustration('quartermaster-bay-empty')` — a third, separate illustration registry, not `environmentAssets.ts` |
| Summary cards | None (readiness bar + missing-summary + category demand mini-cards live inside the operational banner, not a separate mounted card row) |
| Workspace layout | Loadout Workflow panel → Commander Intent cards (Manage Loadout / Change Installed Components, each with their own EWO-101 background accent) → Adaptive Ship Systems Workspace (one port-tree table shared by all three lenses) |
| Supporting workspace | Decision Summary panel (inside the operational banner) |
| Empty state | No-ship-selected: the `quartermaster-bay-empty` illustration inside a fixed-height container (`h-44 sm:h-[343px]`) |
| Scroll behavior | **Two** scroll-responsive elements, unique among all compartments: `sticky-context-bar` (`sticky top-0 z-30`, appears via `IntersectionObserver` once scrolled past the banner) and a `fixed` (not sticky) bottom Save Actions bar (`fixed inset-x-0 md:left-64 ... bottom-0 z-10`, shown only with pending Manage Loadout changes) |
| Filters | None (Ship select dropdown is selection, not filtering) |
| Search | None |
| Command actions | The most action-dense compartment — Install/Change, Remove, Save/Discard, New Loadout, Ship Settings |
| Status messaging | "No Pending Changes" badge, Decision Summary ("No Immediate Decisions" / "N Immediate Decision(s)") |

### A.4 Flight Commander (Flight Commander) — Prototype Zero

| Dimension | Finding |
|---|---|
| Header | Eyebrow "Flight Commander" / Title "Target Intelligence Available" |
| Hero | `PageEnvironment id="flight-commander"` — always-on, full-strength, identical treatment philosophy to Mission Control's |
| Summary cards | **The only true ADR-004 "mounted summary cards"** in the app today — 4 gold-numeral glass cards (`bg-panel/70 backdrop-blur-lg shadow-lg`), left-anchored inside the hero |
| Workspace layout | Filter Bar (search + category pills) → Intelligence Matrix (sticky-header table) |
| Supporting workspace | None distinct |
| Empty state | Unified "Operational Briefing" panel — reuses the hero artwork a second time (dimmed), a CSS radar-sweep, gold `CheckCircle2`, explicitly framed as mission success |
| Scroll behavior | Sticky table header (`sticky top-0 bg-panel z-10`, matching `LoadoutPortTree.tsx`'s pre-existing convention) |
| Filters | One dimension: category (Cooler/Power Plant/Quantum Drive/Shield/Weapon pills) |
| Search | Roster search (source ship name or component name) |
| Command actions | **None that mutate** — by explicit design (Canonical Product Rule: "observes and directs, never edits") |
| Status messaging | The 4 summary numbers themselves are the status report |

### A.5 Hangar Inventory (Quartermaster)

| Dimension | Finding |
|---|---|
| Header | Eyebrow "Hangar Inventory" / Title "Warehouse Inventory Available" |
| Hero | **None on the main page.** `EnvironmentBay id="hangar-inventory-empty"` exists only inside the genuine-zero-inventory empty state |
| Summary cards | None |
| Workspace layout | Collapsible Filters → table (`table-fixed`, explicit `<colgroup>`, 8 columns) |
| Supporting workspace | None distinct |
| Empty state | **Three shapes**: genuine-zero-inventory (`EnvironmentBay`, `PackageX`, "No Inventory Recorded"); filtered-to-zero (plain panel, "No inventory items match these filters.", CTA "Clear Filters"); hidden-by-zero-balance-toggle (plain panel, "No owned inventory is currently recorded.", CTA "Add New Item") |
| Scroll behavior | None (table has `overflow-x-auto` for horizontal scroll only) |
| Filters | Collapsible toolbar, 4 dimensions: Type, Size, Reservation State, Availability State — plus a "hide zero-balance" checkbox, near-identical pattern to Fleet Dashboard's own filter toolbar |
| Search | None on the page itself (only inside the Add-Item modal's catalog picker) |
| Command actions | Add, Edit Quantity, Delete, Reserve, Release Reservation — the most inventory-mutation-dense compartment |
| Status messaging | Inline per-row "Needed By" counts |

### A.6 Decision Center (Quartermaster)

| Dimension | Finding |
|---|---|
| Header | Eyebrow "Decision Center" / Title "Mission Assessment Available" — lives **outside** the bay entirely, matching Mission Control's own header-outside-the-hero convention |
| Hero | `EnvironmentBay id="decision-center"` — enabled, bounded (not full-bleed), wraps **both** the Loot Lookup panel and the Item Assessment panel (both float as glass panels over the bay, `lg:bg-panel/55 lg:backdrop-blur-md`) |
| Summary cards | None (Fleet Demand / Inventory Position are inline data tiles inside the Item Assessment panel once a lookup resolves, not a mounted card row) |
| Workspace layout | Loot Lookup (search) → Item Assessment (verdict-driven: pre-lookup / `UNKNOWN` / `REQUIRED` / `SATISFIED`) |
| Supporting workspace | None distinct |
| Empty state | The pre-lookup "Awaiting Item Assessment" panel — the bay itself always renders; only its inner content varies |
| Scroll behavior | None |
| Filters | None |
| Search | Loot Lookup input — this page's entire workflow *is* a search (live suggestions, up to 8, Enter-to-check) |
| Command actions | Add to Inventory, Reserve/Reserve Now |
| Status messaging | Badge-driven verdicts: "NO CATALOG MATCH" (danger), "KEEP" (success), "ALREADY SATISFIED" (cyan) |

### A.7 Captain's Log (Yeoman)

| Dimension | Finding |
|---|---|
| Header | Eyebrow "Captain's Log" / Title "Recent Fleet Activity" |
| Hero | **A fourth, distinct pattern.** Not `PageEnvironment`/`EnvironmentBay` — a small inline `<div>` with an inline `background-image`/`opacity: 0.18` style, scoped to the certification card alone (not the page), by explicit prior design decision ("this card is small and narrow, not a bounded department room") |
| Summary cards | None |
| Workspace layout | Certification card → Fleet Data card (Export/Import) → Import Preview (conditional) → `DevValidationPanel` → chronological activity-log timeline |
| Supporting workspace | The activity-log timeline itself is arguably the "supporting workspace" for the whole app — a retrospective audit trail |
| Empty state | **None exists.** `log.map(...)` has no `length === 0` guard — a genuinely empty log renders a bare vertical rail div with no heading, icon, or copy. This is a confirmed structural gap, not a designed-and-simply-undocumented state. |
| Scroll behavior | None |
| Filters | None |
| Search | None |
| Command actions | Export Fleet Data, Import Fleet Data |
| Status messaging | Per-entry `entry.action` + `entry.details` + optional readiness-delta line |

---

## Part B — Architectural Primitive Discovery

Terminology drawn directly from ADR-004 §4/§5 wherever it already names the
concept.

| Primitive | Definition |
|---|---|
| **Compartment Header** | The two-line eyebrow (blue compartment identifier) + title (white operational status) block every compartment already has |
| **Compartment Hero** | The environmental artwork layer establishing physical location/lighting/atmosphere (ADR-004 §3) |
| **Mounted Summary Cards** | Gold-numeral metric cards physically anchored within the Hero (ADR-004 §5) — today, only Flight Commander |
| **Operational Workspace** | The compartment's primary content — the reason the Commander is here |
| **Supporting Workspace** | Secondary content beneath/beside the primary workspace (e.g. Mission Control's Execute Orders) |
| **Operational Brief** | A plain-language, verdict-driven status readout (Mission Control's Quartermaster Assessment; Decision Center's UNKNOWN/REQUIRED/SATISFIED verdicts) |
| **Empty State** | The panel shown when a compartment (or sub-panel) has nothing to report — ADR-004 §11 requires these read as operational successes |
| **Filter Bar** | A collapsible, pill-based multi-dimension scoping toolbar (Fleet Dashboard, Hangar Inventory, Flight Commander) |
| **Search Bar** | A text-input lookup control (Flight Commander's roster search; Decision Center's Loot Lookup, though there it *is* the workflow, not a filter) |
| **Sticky Workspace Header** | A table/section header pinned during scroll (Flight Commander's Intelligence Matrix; Ship Management's Sticky Context Bar is a related but distinct page-level variant) |
| **Information Matrix** | A dense tabular/grouped data surface (Flight Commander's Intelligence Matrix, Hangar Inventory's table, Ship Management's port tree) |
| **Command Action Panel** | A cluster of data-mutating controls (Hangar Inventory's row actions, Ship Management's Save/Discard bar) |
| **Status Banner** | A single-line confirmation/error readout (Captain's Log's export/import feedback lines) |

---

## Part C — Responsibility Matrix

| Primitive | Purpose | Required / Optional | Current Compartments | Future Candidates |
|---|---|---|---|---|
| Compartment Header | Officer identity + one-line status report | **Required**, every compartment | All 7 | — (already universal) |
| Compartment Hero | Establish environment/atmosphere | Optional — some compartments are legitimately narrow/dense enough not to need one | Mission Control, Flight Commander (full); Decision Center (bounded); Captain's Log (ad hoc, card-scoped) | Ship Management, Fleet Dashboard, Hangar Inventory |
| Mounted Summary Cards | At-a-glance officer metrics | Optional — only compartments with a genuine small set of headline numbers | Flight Commander only | Mission Control (Fleet Status could become true mounted cards) |
| Operational Workspace | The compartment's core content | **Required**, every compartment | All 7 | — |
| Supporting Workspace | Secondary/contextual content | Optional | Mission Control (Execute Orders) | Any compartment that accumulates a "what next" section |
| Operational Brief | Plain-language verdict | Optional | Mission Control, Decision Center | Flight Commander (a "recommended next target" brief), Captain's Log |
| Empty State | Non-failure "nothing outstanding" panel | **Required**, every compartment (per ADR-004 §11) | 6 of 7 (Captain's Log is missing one) | Captain's Log (close the gap) |
| Filter Bar | Multi-dimension scoping | Optional | Fleet Dashboard, Hangar Inventory, Flight Commander (lighter) | Decision Center (if item history grows), Captain's Log (if the log grows long) |
| Search Bar | Direct lookup | Optional | Flight Commander, Decision Center | Hangar Inventory (currently modal-only) |
| Sticky Workspace Header | Keep column identity visible during scroll | Optional — only for tall tables | Flight Commander, Ship Management (context bar variant) | Hangar Inventory (its table can already run long) |
| Information Matrix | Dense structured data | Optional | Flight Commander, Hangar Inventory, Ship Management | — |
| Command Action Panel | Grouped mutating controls | Optional — Flight Commander explicitly has none by design | Hangar Inventory, Ship Management, Decision Center, Captain's Log | — |
| Status Banner | Single-line confirmation/error | Optional | Captain's Log | Any compartment gaining a mutating action |

---

## Part D — Structural Variations

### D.1 Hero: four incompatible implementations exist today

1. **`PageEnvironment` (full-bleed, always-on)** — Mission Control, Flight Commander.
2. **`EnvironmentBay` (bounded room, centered content)** — Decision Center's main content; Mission Control/Fleet Dashboard/Hangar Inventory's *empty states only*.
3. **Ad hoc inline low-opacity `<div>`** — Captain's Log's certification card, deliberately scoped to one small card, not the page.
4. **`ShipHeroFrame` (per-ship photo banner)** — Ship Management, a fundamentally different concept (a real ship's photo, not an environment).

**Why the difference is legitimate, not accidental**: `EnvironmentBay`'s own doc comment already draws this exact line — a full-bleed hero suits a whole-page command compartment, a bounded bay suits a "department room" panel, and a per-ship photo is neither (it's identity, not atmosphere). Captain's Log's card accent was a deliberate EWO-095B decision that a `max-w-2xl` narrow card is not a "bounded department room" either.

**Recommendation**: **preserve the four-way distinction as intentional**, but canonicalize which one each *type* of surface should use going forward (see Part G) — a full compartment gets `PageEnvironment`, a bounded panel-within-a-compartment gets `EnvironmentBay`, a photo-identity surface keeps its own pattern. Do not collapse all four into one mechanism.

### D.2 Mounted Summary Cards: Mission Control's Fleet Status vs. Flight Commander's cards

Mission Control's Fleet Status (`CriticalMetricTile` + `FleetStatusTile` children in a hero column) and Flight Commander's four gold cards both summarize compartment-level metrics inside the hero — but Mission Control's is a *column* with a parent/child visual grammar (one anchor metric, three bracketed sub-metrics), while Flight Commander's is a *grid* of independent, equally-weighted cards.

**Why the difference exists**: Mission Control's Fleet Status is explicitly a partition (Ships Active splits into exactly three mutually-exclusive children) — the parent/branch grammar communicates that relationship. Flight Commander's four numbers are independent counts, not a partition of one another.

**Recommendation**: **preserve variation** — this is a genuine semantic difference (partition vs. independent metrics), not an accidental inconsistency. A future shared "Mounted Summary" primitive should support both shapes rather than forcing one.

### D.3 Filter Bar: Fleet Dashboard vs. Hangar Inventory vs. Flight Commander

Fleet Dashboard and Hangar Inventory already implement **nearly identical** collapsible, pill-based, multi-dimension filter toolbars (both default-collapsed, both show active-filter chips, both have a "Clear Filters" action). Flight Commander's is deliberately lighter — one dimension, always-visible, combined with a search box in one row.

**Why the difference exists**: Fleet Dashboard/Hangar Inventory both filter *large, heterogeneous* lists across several independent facets. Flight Commander's roster is smaller and its one real facet (category) doesn't need progressive disclosure.

**Recommendation**: **canonicalize** Fleet Dashboard's and Hangar Inventory's toolbars into one shared Filter Bar primitive (they are already accidentally almost the same component) — high-confidence, low-risk consolidation. **Preserve** Flight Commander's lighter variant as a legitimate smaller sibling, not a regression.

### D.4 Empty States: five shapes, one gap

Confirmed shapes in the current app: (1) `EnvironmentBay` + icon + heading + copy + CTA (Mission Control, Fleet Dashboard, Hangar Inventory genuine-empty cases); (2) plain `panel` + icon + heading + copy, no artwork (Fleet Dashboard's other two states, Hangar Inventory's other two states); (3) a verdict-driven pre-state that isn't really "empty," just "nothing looked up yet" (Decision Center); (4) Flight Commander's new Operational Briefing (hero reuse + radar sweep + gold tone); (5) **no empty state at all** (Captain's Log).

**Recommendation**: **investigate later, then canonicalize** — this is the single highest-value target for the framework (Part G), but Part I's non-goals mean no implementation happens under this work order. Flag Captain's Log's missing empty state explicitly as a defect to close whenever Yeoman modernization begins, independent of the broader framework timeline.

### D.5 Scroll-responsive elements: Ship Management vs. Flight Commander

Ship Management uses two mechanisms (a `sticky` context bar and a `fixed` save-actions bar); Flight Commander uses one (`sticky` table header). These solve different problems — Ship Management's bars preserve *ship identity and pending-change state* across a long scroll; Flight Commander's preserves *column identity* across a long table.

**Recommendation**: **preserve variation** — a page-level sticky context bar and a table-level sticky header are different primitives serving different needs, not competing implementations of the same one.

---

## Part E — Layout Grammar

**Canonical grammar (per ADR-004 §4, example form):**

```
Compartment Header
        ↓
Hero Environment
        ↓
Mounted Summary
        ↓
Primary Workspace
        ↓
Supporting Workspace
        ↓
Operational Footer
```

**Conformance by compartment:**

| Compartment | Header | Hero | Mounted Summary | Primary Workspace | Supporting Workspace | Operational Footer |
|---|---|---|---|---|---|---|
| Mission Control | ✅ | ✅ | Partial (column, not cards) | ✅ | ✅ (Execute Orders) | — |
| Fleet Dashboard | ✅ | ✗ | ✗ | ✅ | ✗ | — |
| Ship Management | ✅ | Partial (`ShipHeroFrame`, not environment) | ✗ | ✅ | Partial (Decision Summary) | — |
| **Flight Commander** | ✅ | ✅ | ✅ | ✅ | ✗ | — |
| Hangar Inventory | ✅ | ✗ | ✗ | ✅ | ✗ | — |
| Decision Center | ✅ (outside the bay) | ✅ (bounded) | ✗ | ✅ | ✗ | — |
| Captain's Log | ✅ | Partial (card-scoped accent) | ✗ | ✅ | ✗ | — |

No compartment today has an "Operational Footer" in ADR-004's sense — the
app-wide `AppFooter` (motto strip) is a global element, not a per-
compartment one; whether a per-compartment footer is ever warranted is a
future question, not something this audit found evidence for yet.

**Where compartments intentionally differ from the grammar**: narrow,
single-workflow compartments (Decision Center, Captain's Log) do not need
a Mounted Summary — there is nothing to summarize at a glance that isn't
already the workspace itself. This is consistent with ADR-004 §9
("Operational Density... comes from meaningful information, not
decorative chrome") — adding summary cards to Captain's Log purely for
grammar-conformance would violate that principle, not serve it.

---

## Part F — Information Hierarchy

Documented reading order (Primary → Secondary → Action → Reference) per
compartment:

| Compartment | Primary | Secondary | Action | Reference |
|---|---|---|---|---|
| Mission Control | Priority Actions | Fleet Status | Deep-links into ship/fleet pages | Quartermaster Report |
| Fleet Dashboard | Ship grid/table | Filters/Sort | "Manage Ship" links | Retired toggle |
| Ship Management | Decision Summary | Ship Assessment table | Install/Change, Save/Discard | Loadout selector history |
| Flight Commander | Matching Fleet Requirements column | Summary cards | "Open Ship Management" deep-links | Category dots |
| Hangar Inventory | Needed By column | Installed/Reserved/Available counts | Reserve, Edit, Delete | Filters |
| Decision Center | Item Assessment verdict | Fleet Demand/Inventory Position tiles | Add to Inventory, Reserve | Loot Lookup input |
| Captain's Log | Activity timeline | Certification/Fleet Data cards | Export/Import | — |

**Cross-compartment pattern confirmed**: in every compartment audited, the
Commander's *action* affordances sit closer to the *primary* information
than to *secondary/reference* information — none of the seven compartments
bury an action behind reference material. This is a real, already-
consistent property worth preserving explicitly as a framework rule
(Part G), not just an accident of seven independent designs.

---

## Part G — Framework Boundary

**Belongs inside the future Quartermaster Framework** (structural shell,
reusable regardless of content):

- Compartment Header (already 100% consistent — codify, don't change)
- Hero container contract (three sanctioned variants per Part D.1: full-
  bleed `PageEnvironment`, bounded `EnvironmentBay`, card-scoped accent —
  not a single forced mechanism)
- Mounted Summary shell (supporting both the "partition" and "independent
  metrics" shapes from Part D.2)
- Operational Brief shell (verdict-driven plain-language readout)
- Empty State shell (icon + heading + copy + optional CTA, with the hero-
  reuse/hero-dim option Flight Commander's Operational Briefing
  established)
- Filter Bar shell (the Fleet Dashboard/Hangar Inventory pattern,
  canonicalized per Part D.3)
- Workspace shell (the header-hero-summary-workspace vertical stack
  itself)

**Remains compartment-specific** (the actual content each compartment is
*for*):

- Intelligence Matrix (Flight Commander)
- Ship Assessment / port tree (Ship Management)
- Captain's Log timeline
- Procurement/Needed-By table (Hangar Inventory)
- Item Assessment verdict logic (Decision Center)
- Priority Actions / Quartermaster Report (Mission Control)
- Ship grid/table (Fleet Dashboard)

This split matches the Chief Architect Intent stated in the work order
directly: *"The goal is not code reuse. The goal is design consistency."*
The framework boundary is drawn at the shell/scaffold, never at the
domain logic each compartment owns.

---

## Part H — Migration Strategy

**Recommended sequence:**

```
Prototype Zero (Flight Commander — already complete)
        ↓
Mission Control
        ↓
Ship Management
        ↓
Hangar Inventory
        ↓
Decision Center
        ↓
Captain's Log
        ↓
Fleet Dashboard
```

**Justification:**

1. **Mission Control second** — it already has the most complete grammar
   conformance of any compartment besides Flight Commander (Part E table:
   Header ✅, Hero ✅, Workspace ✅, Supporting Workspace ✅) and already
   uses the same `PageEnvironment` mechanism Flight Commander proved. It
   is the lowest-risk next step and the Executive Officer "speaks first"
   per ADR-005 — modernizing it early reinforces that command framing
   immediately after Prototype Zero.
2. **Ship Management third** — the most action-dense compartment and the
   only one with proven scroll-responsive patterns (sticky context bar,
   fixed save bar) worth formalizing into the framework early, before
   more compartments grow their own ad hoc scroll behavior independently.
   High Commander-visibility (the most-edited compartment), but its core
   editing workflows are stable and well-tested, keeping modernization
   risk to presentation only.
3. **Hangar Inventory fourth** — a comparatively simple, single-table
   compartment with a filter pattern that's already 90% identical to
   Fleet Dashboard's own, making it a natural, low-risk place to land the
   canonicalized Filter Bar primitive (Part D.3) before ever touching
   Fleet Dashboard itself.
4. **Decision Center fifth** — already partially on the framework
   (`EnvironmentBay`), so modernization here is completion, not a fresh
   start; a good place to prove the Empty State shell's "verdict-driven
   pre-state" variant before Captain's Log needs a genuinely new empty
   state built from scratch.
5. **Captain's Log sixth** — deliberately placed after the Empty State
   shell has matured on five prior compartments, since Captain's Log's
   own missing empty state (Part D.4) should be closed using a proven
   pattern, not a first attempt. Its narrow single-column layout also
   makes it a useful test of the framework's flexibility before the
   widest, highest-traffic compartment.
6. **Fleet Dashboard last** — the compartment with the *least* existing
   framework infrastructure (no hero at all today) and the *highest*
   Commander traffic (very likely the first screen most sessions touch,
   per ADR-005's own workflow ordering). Modernizing the framework's
   riskiest, highest-visibility target only after six prior compartments
   have proven the pattern minimizes regression exposure to the page the
   Commander sees most.

---

## Part I — Explicit Non-Goals — Confirmation

No React components were built. No production code was refactored. No
files were moved or renamed. No CSS was changed. No routes were modified.
No abstractions, hooks, or shared UI were introduced. `git status --short`
contains only this new document.

---

## Commander Acceptance Criteria — Self-Check

- **What is a Quartermaster Compartment?** A screen answering exactly one
  operational question, expressed through the Part E layout grammar to
  whatever degree that compartment's own density genuinely warrants.
- **Which architectural pieces are common?** The seven primitives in
  Part G's "belongs inside the framework" list.
- **Which remain unique?** Each compartment's own domain content, listed
  in Part G's "remains compartment-specific" list.
- **What should Engineering build once?** The framework shell items —
  Header, Hero container contract, Mounted Summary shell, Operational
  Brief shell, Empty State shell, Filter Bar shell, Workspace shell.
- **What should remain compartment-specific?** Every domain data surface
  — the Intelligence Matrix, the port tree, the timeline, the procurement
  table, the verdict logic, Priority Actions, the ship grid.
- **In what order should Quartermaster Edition modernize the flagship?**
  Part H's six-step sequence, in full.

All six answerable without reading a single React component.
