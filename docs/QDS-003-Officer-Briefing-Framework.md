# QDS-003 — Officer Briefing Framework

**Classification:** Architecture Discovery / Reporting UX / Quartermaster Edition
**Priority:** Foundational
**Status:** Discovery Only — no production code, components, copy, or routing was modified to produce this document.
**Authority:** [ADR-004](ADR-004-Quartermaster-Edition-Design-Language.md), [ADR-005](ADR-005-Operational-Command-Structure.md), [QDS-001](QDS-001-Quartermaster-Compartment-Framework.md), [QDS-002](QDS-002-Quartermaster-Operational-Vocabulary.md) (once certified)

---

## 0. One-Paragraph Summary

Two compartments already report the way this framework wants every Station to report — Flight Commander and Decision Center — and neither was built as a deliberate template; they arrived at the same shape independently because their domains are narrow enough that condition, summary, concern, and recommendation collapse naturally into one clear verdict. The other five compartments are real reports wearing different amounts of the grammar: Mission Control is the strongest all-round briefing (it already has a condition line, a summary, a concerns section, and a recommendation-bearing assessment); Ship Management is a coherent, appropriately dense technical briefing for the one domain that should stay dense; Fleet Dashboard and Hangar Inventory are not briefings today so much as browsable ledgers — no condition line, no concerns section, no recommendation layer, nothing but Supporting Intelligence and a header; Captain's Log is correctly a record rather than a verdict (a log should not editorialize), but has no top-of-page condition line and no standing report at all. The one true cross-cutting gap is Part I's Exception Report — no compartment today fully implements the five-part shape this document proposes, and Captain's Log's underlying import-validator strings are the furthest from officer voice found anywhere in the app. This document defines the shared grammar, names what each Station's briefing should and should not contain, and draws the line between what a future shared briefing framework should own and what stays permanently domain-specific — documentation only, exactly as QDS-001 drew the equivalent line for layout.

---

## Part A — Existing Reporting Audit

Audited against the ten required categories per compartment. Findings are additive to, not a repeat of, QDS-001's structural audit (header/hero/summary-card/empty-state mechanics) and QDS-002's vocabulary audit (exact strings, canonical-term status) — both are cited by reference rather than reproduced. Every quoted string below is verbatim and file:line-traceable.

### A.1 Mission Control (Executive Officer)

| Category | Finding |
|---|---|
| Current operational status line | *"Operations Standing By"* — the header title (QDS-001 A.1) |
| Summary metrics | Fleet Status column (Ships Active + three sub-metrics) — QDS-001 A.1 |
| Priority information | Priority Actions cards (up to 4 `ShipCard`s), Top Priority Ship |
| Recommendations | The Quartermaster Assessment's three-way verdict — COMPLETE / PROCUREMENT_ONLY / ACTIONABLE, e.g. *"3 inventory assets immediately available to improve fleet readiness."* (`describeQuartermasterAssessment`, `MissionControl.tsx:145-158`) |
| Action prompts | *"Add First Ship"* (tied to the empty state); the category-filter clear chip (in-page state reset). The three Execute Orders cards (*"Loot Lookup"*, *"Add Inventory"*, *"Modify Ship"*) are standing workflow launch points, not verdict-triggered |
| Supporting details | Quartermaster Report (Logistics Demand cards, Procurement Work Queue table) |
| Empty-state report | *"No Immediate Priority Actions"* / *"Fleet Readiness has nothing outstanding to act on."* (scoped to the Top Priority Ship sub-panel only) |
| Success-state report | None — Mission Control performs no mutating actions of its own |
| Failure/exception report | None present |
| Coherent briefing or collection of widgets? | **Coherent briefing — the strongest of the seven.** Condition → Summary → Concerns (Priority Actions) → Recommendation (Quartermaster Assessment) → Supporting Intelligence (Quartermaster Report) already reads as one continuous report, not independent panels bolted together. |

### A.2 Fleet Dashboard (Quartermaster)

| Category | Finding |
|---|---|
| Current operational status line | *"The Fleet Is At Your Command"* |
| Summary metrics | None — live *"N Ship(s)"*/*"N Retired Vessel(s)"* counts exist only in the sort row, not a summary section |
| Priority information | None — ships are sortable/filterable, not ranked by concern |
| Recommendations | None |
| Action prompts | *"Add First Ship"*, *"View Retired (N)"*, *"Clear Filters"* (×2) — all tied to a specific stated state; *"Add Ship"* and *"Manage Ship"* are plain navigation |
| Supporting details | The full ship grid/table itself, plus Filters/Sort |
| Empty-state report | Four distinct shapes depending on view/filter state (QDS-001 A.2) |
| Success-state report | Purge confirmation banner: *`"${purgedShipName}" was permanently purged from the Fleet Registry.`* |
| Failure/exception report | None on this page |
| Coherent briefing or collection of widgets? | **Not currently a briefing — a browsable ledger.** There is a header and a list; there is no condition-to-recommendation chain at all. This is not a defect — Fleet Dashboard's job today is comparison and selection, not verdict — but it means the grammar in Part B does not yet apply here, consistent with QDS-001 independently finding Fleet Dashboard has the least framework infrastructure of the seven and placing it last in the migration order. |

### A.3 Ship Management (Quartermaster)

| Category | Finding |
|---|---|
| Current operational status line | *"Select Vessel For Maintenance"* |
| Summary metrics | Readiness bar + missing-summary + category demand mini-cards, all inside the operational banner (QDS-001 A.3) |
| Priority information | The Decision Summary panel's per-issue rows |
| Recommendations | Decision Summary verdict line — *"No Immediate Decisions"* vs. *`"N Immediate Decision(s)"`*; per-row imperative actions, e.g. *`Resolve ${targetItem}`* for an Incompatible Target row |
| Action prompts | The most action-dense compartment: *"Install / Change"*, *"Remove"*, *"Save Changes"* / *"Discard Changes"*, *"Set Active"*, *"Restore Factory Target"*, *"Confirm Transfer"* — every one gated on a real, current condition, none decorative |
| Supporting details | The Adaptive Ship Systems Workspace (one shared port-tree table across all three Commander Intent lenses) |
| Empty-state report | No-ship-selected: *"Maintenance Bay Ready"* / *"Select a ship above to begin management."* |
| Success-state report | Dense and specific — e.g. *`"${reviewedBuild.name}" saved.`*, *`Installed ${item} on ${slotLabel}.`*, *`Transferred ${item} from ${donorShip} to ${slotLabel}.`* |
| Failure/exception report | The most complete failure-copy set in the app — every one names what was attempted and confirms nothing changed, e.g. *`Could not remove ${item} from ${slotLabel} — nothing was changed.`*, *`${item} has no Available stock — the remaining unit(s) are reserved for a different Fleet Asset/Build.`* Officer voice throughout; no raw exceptions. |
| Coherent briefing or collection of widgets? | **Coherent, and correctly dense.** The page's condition line stays high-level (*"Select Vessel For Maintenance"*) while its Supporting Intelligence goes all the way down to individual ports — exactly matching Part D's profile for this Station (*"specific, technical, task-oriented, authoritative"*). Density here is a feature, not scope creep, because the domain itself is genuinely technical. |

### A.4 Flight Commander (Flight Commander)

| Category | Finding |
|---|---|
| Current operational status line | *"Target Intelligence Available"* (see QDS-002 C.3 — ADR-005 prescribes *"Standing Watch"*; not yet reconciled, not an error) |
| Summary metrics | Four gold mounted summary cards — the only true ADR-004 mounted-card implementation in the app (QDS-001 A.4) |
| Priority information | The Intelligence Matrix roster itself, already ranked/filtered by actionable category |
| Recommendations | Implicit — every matched row *is* the recommendation (source ship + component + destination), with no separate verdict sentence needed because the matrix row already states demand and supply in one line |
| Action prompts | **None** — by explicit, tested design (Canonical Product Rule: "observes and directs, never edits"); every link is a deep-link to Ship Management, not an in-page action |
| Supporting details | Category dots, per-row `describeComponentIdentity` catalog metadata |
| Empty-state report | The Operational Briefing panel — *"No actionable factory targets identified."* / *"Current fleet objectives cannot be accelerated through known factory loadouts."* / *"Quartermaster recommends monitoring future ship traffic after modifying target builds or adding new fleet objectives."* / *"Intelligence Sweep Complete"* / *"Awaiting New Fleet Requirements"* |
| Success-state report | N/A — no mutations |
| Failure/exception report | *"Factory Loadout Data Unavailable"* / *"Stock ship loadout data could not be found. Target intelligence cannot be generated until it is available."* — closest existing approximation of Part I's canonical shape, still incomplete against it (see Part I) |
| Coherent briefing or collection of widgets? | **The reference implementation** — already identified as such structurally in QDS-001, and confirmed here at the reporting-content level too. Condition, Summary, Concerns, and Standing Report are all present, distinct, and in the right order, with zero action-prompt scope creep. |

### A.5 Hangar Inventory (Quartermaster)

| Category | Finding |
|---|---|
| Current operational status line | *"Warehouse Inventory Available"* (QDS-002 C.1 — the one place "Warehouse" survives against "Hangar" everywhere else) |
| Summary metrics | None |
| Priority information | The *"Needed By"* column functions as an implicit, per-row concern flag — there is no page-level concern summary |
| Recommendations | None |
| Action prompts | *"Add New Item"*, *"Clear Filters"*, per-row *"Reserve"* (only when eligible), *"Continue Anyway"* / *"Delete Anyway"* (destructive-consequence gated) |
| Supporting details | The full inventory table (8 columns, `table-fixed`) |
| Empty-state report | Three shapes depending on filter/toggle state (QDS-001 A.5) |
| Success-state report | *`Added to existing ${name} stock.`* / *`${name} added to Hangar.`*; *`Reserved ${qty} ${name} for ${buildName}.`* |
| Failure/exception report | Validation and dependency-warning copy, all in officer voice — e.g. *"Quantity must be a non-negative whole number."*, and the reduction/delete dependency blocks (*`Reducing quantity to N will leave M allocation(s) unfulfilled.`*) |
| Coherent briefing or collection of widgets? | **Not currently a briefing — a transactional ledger**, the same finding as Fleet Dashboard and for the same reason: no condition-to-recommendation chain wraps the table. The per-row "Needed By" data is real concern-relevant information that is never surfaced as a page-level concern. |

### A.6 Decision Center (Quartermaster)

| Category | Finding |
|---|---|
| Current operational status line | *"Mission Assessment Available"* |
| Summary metrics | Fleet Demand / Inventory Position tiles, once a lookup resolves |
| Priority information | The Applicable Target Loadouts list, per REQUIRED verdict |
| Recommendations | The clearest existing instance of a literal recommendation sentence anywhere in the app: *"Recommendation: Store in Hangar — no reservation required."* (SATISFIED verdict) |
| Action prompts | *"Reserve"* / *"Reserve Now"* / *"Leave Unreserved"* / *"Add to Inventory"* — every one gated on the current verdict |
| Supporting details | None distinct — the verdict panel itself is both the report and the workspace |
| Empty-state report | Pre-lookup: *"Awaiting Item Assessment"* / *"Search for a recovered component to review fleet demand, inventory status, and retention value."* |
| Success-state report | *`{message ?? 'Item added to Hangar Inventory.'}`*; post-add: *"Reserved for {label}."* or *"Left unreserved — available in Hangar Inventory."* |
| Failure/exception report | UNKNOWN verdict: *"NO CATALOG MATCH"* / *"Doesn't match a real catalog component. Check the spelling or pick a suggestion from the list."*; add/reserve fallbacks (*`{message ?? 'Could not add item.'}`*) |
| Coherent briefing or collection of widgets? | **Coherent briefing — a second reference implementation alongside Flight Commander.** The four-state verdict machine (pre-lookup / UNKNOWN / REQUIRED / SATISFIED) is condition, summary, and recommendation collapsed into one panel, because the domain (one item, one question) is narrow enough not to need separate sections. |

### A.7 Captain's Log (Yeoman)

| Category | Finding |
|---|---|
| Current operational status line | *"Recent Fleet Activity"* |
| Summary metrics | None |
| Priority information | None — entries are chronological, not ranked |
| Recommendations | None — correctly; a record should not editorialize |
| Action prompts | *"Export Fleet Data"*, *"Import Fleet Data"* — standing workflow entry points, not recommendation-triggered. Inside the Import Preview: *"Replace Current Fleet"* is tied directly to the validation summary above it |
| Supporting details | The chronological activity-log timeline itself — arguably the "supporting workspace" for the whole app |
| Empty-state report | **None exists** (confirmed defect, carried forward from QDS-001 D.4 — see also QDS-002 Part F's proposed replacement copy) |
| Success-state report | *`Exported as ${filename}`*; *`Fleet imported successfully. Ships: N. Hangar Items: N. Custom Builds: N. Warnings: N.`*, plus conditionally *"A recovery snapshot of your previous fleet was captured for this session."* |
| Failure/exception report | *`Import failed: ${importError} No migration was attempted and nothing was written.`* — the trailing sentence is officer/audit voice, but `importError` itself is substituted from validator strings (*"This file is not valid JSON."*, *"This file is missing a valid schemaVersion."*) that read as data-validation language, not an officer's report — **the furthest any copy in the app gets from officer voice** (see QDS-002 Part H and Part I below) |
| Coherent briefing or collection of widgets? | **Correctly a record, not a verdict — but incomplete as a briefing.** A log should not have a "recommendation" layer, and its absence is not a defect. What is missing is the layer every other Station already has: a condition/standing-report statement at the top (*"Fleet records are current"* — proposed, not shipped) telling the Commander, before they scan the list, whether anything here needs their attention at all. |

---

## Part B — Canonical Briefing Grammar

```
Station Identification
        ↓
Operational Condition
        ↓
Command Summary
        ↓
Immediate Concerns
        ↓
Recommended Action
        ↓
Supporting Intelligence
        ↓
Standing Status
```

This is the work order's own recommended baseline, adopted without renaming — every term already matches real, shipped vocabulary better than any alternative considered (e.g. "Command Summary" over "Metrics," which would read as a software word, not an officer's word).

**This is an information hierarchy, not a mandatory layout template.** A Station omits any layer it has nothing to say through — Part A already shows this happening correctly today: Decision Center and Flight Commander compress five of the seven layers into one panel because their domain is narrow; Captain's Log correctly renders no Recommended Action layer at all, ever, because a record does not recommend. **Standing Status and Recommended Action are mutually exclusive within a single report** — a Station either has something to recommend or it is standing by; it never shows both at once (confirmed already true everywhere in Part A: nowhere does a recommendation coexist with a "nothing to report" line for the same condition).

---

## Part C — Briefing Layers

### 1. Station Identification

*Who is reporting?* Per ADR-005 Officer Identity, this is never literal prose ("Quartermaster reports:") — it is carried entirely by compartment identity: which page the Commander is on, its header, its hero, its established voice (QDS-002 Part D). The one place identity does appear as prose today is when one officer explicitly names another inside a recommendation (Flight Commander's own copy says *"Quartermaster recommends..."* even though the Commander is standing in the Flight Commander compartment) — this is a deliberate, existing exception because the recommendation is being **handed off** to a different Station's authority (see Part F), not a general pattern to imitate everywhere.

### 2. Operational Condition

The single most important current statement — always exactly one line, always the current page header title today (Part A confirms this for all seven compartments without exception). This layer is **required** and is the only layer that is always present regardless of density level (Part G).

### 3. Command Summary

A concise quantitative or qualitative overview — Mission Control's Fleet Status, Flight Commander's four gold cards, Decision Center's Fleet Demand/Inventory Position tiles. **Optional**, and its absence is not automatically a defect: Fleet Dashboard and Hangar Inventory lack one today not because it was forgotten but because no compartment audit yet asked the question (Part A explicitly flags this as an open gap, not a settled non-goal, distinct from Captain's Log where a summary genuinely would not fit the domain).

### 4. Immediate Concerns

Only conditions requiring Commander awareness — never every nonideal condition. Mission Control's Priority Actions already enforces this correctly (a capped, ranked list, not every ship with any issue). Ship Management's Decision Summary does the same at the single-ship scale. The discipline this layer requires: **a concern belongs here only if the Commander cannot already infer it from the Command Summary above it.**

### 5. Recommended Action

The next best Commander action, when one exists — governed fully by Part E below. **This layer must direct toward the authoritative Station, never duplicate its workflow** — already proven correctly in the app today: Flight Commander recommends but never lets the Commander install anything from within Flight Commander itself; it hands off to Ship Management instead (Part F).

### 6. Supporting Intelligence

Detailed records, tables, trees, timelines, matrices — the compartment's actual operational workspace in most cases. This is where the *majority* of most compartments' real content already lives (Ship Management's port tree, Hangar Inventory's table, Captain's Log's timeline). Its presence does not by itself make a page a briefing — Part A's "coherent briefing vs. collection of widgets" judgment turns entirely on whether Supporting Intelligence is reached *through* the layers above it, or *instead of* them.

### 7. Standing Status

What the Station reports when no intervention is required — governed fully by Part H below. Its purpose is to **reinforce operational confidence**, not merely report an absence of data; ADR-004 §11 and QDS-002 Part F already establish this principle for empty states specifically, and this layer generalizes it to every Station's "all clear" moment, not just a literal empty list.

---

## Part D — Station-Specific Reporting Profiles

Each profile below states the Station's required tone (from the work order), the real evidence already matching it, and the explicit boundary the Station must not cross.

### Executive Officer — Mission Control

**Reports:** fleet-wide operational condition, immediate concerns, highest-priority actions, readiness overview.
**Already matches:** *"Operations Standing By"*; *"No Immediate Priority Actions — Fleet Readiness has nothing outstanding to act on."* — concise, strategic, fleet-wide, exactly as prescribed.
**Must not become:** component-level maintenance, warehouse management, detailed historical records.
**Boundary note (open question, not a violation ruling):** the Quartermaster Report's Procurement Work Queue table lists individual components by name and quantity — genuinely closer to Hangar Inventory's own domain than a pure fleet-wide summary. It is framed today as a *"Work Queue"* summary rather than a per-component technical detail panel, which keeps it on the right side of the line, but it is the one place on Mission Control worth watching as the framework matures (see Open Questions).

### Quartermaster — Fleet Dashboard

**Reports:** fleet composition, vessel attention order, ownership and lifecycle condition, logistical prioritization.
**Already matches:** the Active/Retired split and filter/sort toolbar are genuinely comparative and orderly.
**Must not become:** *(not stated by the work order for this Station — its risk is not scope creep, it is under-reporting; see Part A.2)*
**Boundary note:** Fleet Dashboard is fleet-asset-focused today only in the browsing sense, not the reporting sense — it has no vessel-attention-order concept distinct from whatever the Commander manually sorts by. "Vessel attention order" is a stated responsibility this Station does not yet fulfill through the briefing grammar (a candidate migration target, not a scope violation).

### Quartermaster — Ship Management

**Reports:** one vessel's physical and doctrinal condition, installed-versus-target differences, immediate maintenance decisions.
**Already matches:** exactly the prescribed profile — see Part A.3's coherence finding. Specific, technical, task-oriented, and authoritative (Decision Summary's imperative *`Resolve ${targetItem}`* language is the clearest authoritative-voice example anywhere in the app).
**Must not become:** *(not separately stated — this Station's very nature is the technical depth other Stations must avoid)*.
**Boundary note:** none found. This is the one Station whose current implementation requires no correction against its profile.

### Quartermaster — Hangar Inventory

**Reports:** warehouse holdings, availability, reservations, procurement support.
**Already matches:** logistical and quantitative in tone (per-row Reserved/Available states, whole-number validation copy).
**Must not become:** *(not stated — again, under-reporting is the real risk, not scope creep)*.
**Boundary note:** "procurement support" is stated as a responsibility, but Hangar Inventory reports procurement *state* (what exists, what's reserved) without ever recommending a procurement *action* — the "Needed By" column is real allocation-relevant data with no Recommended Action layer built on top of it (Part A.5).

### Quartermaster — Decision Center

**Reports:** whether a recovered component should be retained, fleet demand, inventory relevance, disposition recommendation.
**Already matches:** exactly the prescribed profile — analytical, decisive, narrowly scoped. *"Recommendation: Store in Hangar — no reservation required."* is this framework's own best existing proof that the "Recommended Action" layer already works in production.
**Must not become:** *(not stated — this Station is already the second reference implementation, alongside Flight Commander)*.
**Boundary note:** none found.

### Flight Commander

**Reports:** actionable factory-loadout target intelligence, source ships, useful components, supported custom fleet requirements, Standing Watch condition.
**Already matches:** tactical, intelligence-driven, opportunity-focused — *"No actionable factory targets identified... Quartermaster recommends monitoring future ship traffic..."* reads exactly as prescribed.
**Must not become:** *(the work order does not list a boundary here — Flight Commander's own certified Canonical Product Rule, "observes and directs, never edits," already is the boundary, enforced with zero exceptions today)*.
**Boundary note:** the header string itself ("Target Intelligence Available") has not converged on ADR-005's prescribed "Standing Watch" — an open reconciliation question already tracked in QDS-002 C.3, not reopened here.

### Yeoman — Captain's Log

**Reports:** official record, recent changes, administrative condition, backup/import/export status.
**Already matches:** formal, chronological, precise — the activity-log entries themselves (*"Installed {item} on {ship}."*) and the import/export success banners.
**Must not become:** interpretive beyond data-integrity warnings.
**Boundary note:** already correctly non-interpretive — no recommendation-style copy exists anywhere on this page (Part A.7), which is the profile working as intended, not a gap. The real gap is structural, not tonal: no Operational Condition / Standing Status layer wraps the timeline at all (Part A.7, Part H).

---

## Part E — Recommendation Authority

A recommendation must be: derived from canonical authority; actionable; owned by a known Station; limited to one clear next step where practical; distinct from a warning or status statement.

**Evaluated against real, shipped copy:**

| Existing recommendation | Meets the five criteria? |
|---|---|
| Decision Center: *"Recommendation: Store in Hangar — no reservation required."* | **Fully meets all five** — derived from the canonical Fleet Demand/Inventory Position resolver, actionable (a clear disposition), owned (Decision Center/Quartermaster), one step, and typographically distinct from the verdict badge above it. The framework's own best current example. |
| Ship Management: *`Resolve ${targetItem}`* per Decision Summary row | **Fully meets all five** — derived from canonical readiness/build-state data, imperative, single-step, owned, and never conflated with the status badge next to it. |
| Flight Commander: *"Quartermaster recommends monitoring future ship traffic after modifying target builds or adding new fleet objectives."* | **Meets four of five.** Derived from canonical resolver output, owned (explicitly attributed to the Quartermaster, a deliberate cross-Station handoff — Part F), distinct from the surrounding status copy. Softer than ideal on "one clear next step" — "monitoring future ship traffic" is a posture, not a single imperative action, because there is genuinely nothing to install yet. Acceptable as written (it never fabricates urgency that doesn't exist), and a candidate for tightening only if a real single-step alternative exists in the future. |

**No instance of an unapproved-style recommendation** (vague, urgency-fabricating, or advisory-without-basis, per the work order's own "not approved" examples) **was found anywhere in the current application.** This corroborates QDS-002's independent finding that the app's officer voice is already substantially more disciplined than a fresh audit would expect.

**Standing status is never a recommendation.** Mission Control's *"Fleet Readiness has nothing outstanding to act on"* and Flight Commander's *"No actionable factory targets identified"* are correctly Standing Status (Part H), not Recommended Action — neither instructs the Commander to do anything, both simply report a true current state.

---

## Part F — Cross-Station Handoff

**Pattern confirmed in the current app:** a handoff — a deep-link that names both the concern and the destination — is used specifically when a report **crosses an officer boundary**. When a Station stays within its own officer's domain, the current app resolves the action **inline**, without navigating away, because it is already the authoritative Station for that action. This is a real, load-bearing distinction worth naming explicitly:

- **Cross-officer handoff** (Executive Officer → Quartermaster, Flight Commander → Quartermaster): always a deep-link out, naming the concern before the destination.
- **Same-officer inline resolution** (Quartermaster → Quartermaster, e.g. Decision Center resolving directly into Hangar Inventory's own data): the owning officer acts immediately, without a page transition, because a handoff would be redundant — the Quartermaster does not need to redirect the Commander to itself.

**Canonical patterns, current implementation status:**

| Handoff | Status | Evidence |
|---|---|---|
| Mission Control → Ship Management | **Real, shipped** | Priority Actions / Top Priority Ship cards and the *"Modify Ship"* Execute Orders card both deep-link to `/ship-workspace/:id` |
| Mission Control → Hangar Inventory | **Real, shipped** | *"Add Inventory"* Execute Orders card deep-links to `/hangar` |
| Flight Commander → Ship Management | **Real, shipped** | Every matched-component row deep-links `→ {ShipName} • {BuildName} ×N` directly into the owning ship's Ship Management page (EWO-104 Amendment 3) |
| Decision Center → Hangar Inventory | **Same-officer inline resolution, not a navigational handoff** | *"Add to Inventory"*/*"Reserve"* mutate Hangar Inventory's own data directly from Decision Center — both compartments are Quartermaster-owned (ADR-005), so no redirect occurs or is needed |
| Captain's Log → diagnostics or administrative action | **Not yet implemented** | No diagnostics surface exists yet for Captain's Log to hand off to; a future candidate only (Part J's "daily briefings"/"organization reports" territory may be where this first becomes real) |
| Fleet Dashboard → Ship Management | **Real, shipped** | Per-row *"Manage Ship"* link deep-links to `/ship-workspace/:id` |

**The owning Station always performs the action; the reporting Station only identifies and directs** — confirmed true without exception across every real handoff found above. No compartment currently duplicates another Station's mutation UI inside its own page.

---

## Part G — Briefing Density

Density is **not a fixed per-Station configuration** — it is an emergent property of how much a Station currently has to report, confirmed by real behavior already present in the app: the same compartment renders at different density levels depending on the live operational picture, not a design-time choice.

**Compact Brief** — condition + one summary + optional action.
Example already shipped: Decision Center's pre-lookup state (*"Awaiting Item Assessment"*), Mission Control's Priority Actions when empty.

**Standard Brief** — condition + summary + concerns + recommended action + supporting detail.
Example already shipped: Decision Center once a lookup resolves to REQUIRED or SATISFIED; Flight Commander with a populated roster.

**Expanded Brief** — multiple concern groups, contextual analysis, detailed supporting intelligence.
Example already shipped: Ship Management, effectively by default — and this is legitimate, not a violation of "do not allow every Station to default to Expanded Brief." Ship Management's domain (one vessel's full port tree, three Commander Intent lenses) is genuinely dense; defaulting there is task-justified, the same conclusion Part D reaches independently. **The rule this framework actually enforces is not "no Station may default to Expanded" — it is "no Station may default to Expanded without the domain justifying it,"** and today exactly one Station qualifies.

**Gap:** Fleet Dashboard and Hangar Inventory do not currently participate in the density concept at all — they render their full Supporting Intelligence unconditionally, with no condition/summary/concern wrapper to be compact, standard, or expanded *about* (Part A.2, A.5). This is the same gap named in Part D, seen from a different angle.

---

## Part H — Standing Reports

**Communicate successful monitoring. Avoid empty-database language. Avoid fabricated activity. Remain calm and professional. Preserve the Station's relevance.**

**Already shipped and matching this standard:**

| Station | Real standing report |
|---|---|
| Executive Officer | *"No Immediate Priority Actions — Fleet Readiness has nothing outstanding to act on."* |
| Flight Commander | *"Intelligence Sweep Complete... Awaiting New Fleet Requirements."* (via the Operational Briefing panel) |
| Quartermaster — Ship Management | *"No Pending Changes"* badge |
| Quartermaster — Decision Center | The SATISFIED verdict's *"Recommendation: Store in Hangar — no reservation required."* functions as this Station's standing-success report |

**Gap — no standing report exists today:**

| Station | Finding |
|---|---|
| Quartermaster — Fleet Dashboard | No "fleet fully squared away" statement exists — only the literal absence of ships is reported (empty states), never the presence of ships with nothing wrong |
| Quartermaster — Hangar Inventory | Same gap — a fully-stocked, fully-allocated warehouse has no affirmative report distinct from its empty states |
| Yeoman — Captain's Log | No standing report exists at all — the proposed *"Fleet records are current"* line (illustrative, from the work order) has no shipped equivalent |

This is the same structural gap identified from three separate angles now (Part A, D, G, H) — Fleet Dashboard, Hangar Inventory, and Captain's Log are the three compartments still missing the full briefing grammar, and all three gaps trace back to the same root cause: no Station-level "everything's fine" statement was ever written for them, only item-level and empty-fleet-level copy.

---

## Part I — Exception Reports

**Canonical structure (proposed by this document, not yet fully implemented anywhere):**

```
Operational Exception
        ↓
What is known
        ↓
What is unavailable
        ↓
Commander impact
        ↓
Recommended next action
```

Never expose raw stack traces or internal implementation language as the primary Commander message.

**Distance from the standard, per real existing exception copy:**

| Existing copy | What it has | What it's missing |
|---|---|---|
| Flight Commander: *"Factory Loadout Data Unavailable"* / *"Stock ship loadout data could not be found. Target intelligence cannot be generated until it is available."* | Operational Exception (heading), What is unavailable, Commander impact | What is known; Recommended next action — **closest existing approximation, roughly 3 of 5 layers present** |
| Ship Management: *`Could not remove ${item} from ${slotLabel} — nothing was changed.`* | Operational Exception (implicit in the action that failed), Commander impact (*"nothing was changed"* is itself a reassurance) | What is known/unavailable framing, Recommended next action — **functionally a single-sentence exception, by design, since these are inline action failures, not standing conditions** |
| Captain's Log: *"This file is not valid JSON."*, *"This file is missing a valid schemaVersion."* | Almost nothing against this standard — no Commander-impact framing, no recommended action, and the vocabulary itself ("valid JSON," "schemaVersion") is closer to a validator's own internal language than an officer's report | **Furthest from the standard found anywhere in the app** — confirms QDS-002 Part H's independent finding from the vocabulary side |

**Reading this table correctly:** the canonical five-part shape is intended for **standing operational exceptions** — a Station's report when something is durably wrong (missing data, unresolved identity, unavailable source intelligence) — not for every inline action-failure toast. Ship Management's terse, single-sentence mutation failures are already doing the right thing for *their* context (an immediate, one-off inline failure deserves a fast, precise sentence, not a five-part panel); the five-part structure is specifically for the standing/systemic case Flight Commander's Data Unavailable panel already gestures toward and Captain's Log's import failures currently violate worst.

---

## Part J — Future Voice and Notification Use

No implementation. The same layer authority (Part C) is designed to support a spoken or notification-based briefing without rewriting it, provided the copy is authored with both forms in mind from the start:

- **VoiceAttack responses**: a spoken briefing reads Operational Condition → Command Summary → Immediate Concerns → Recommended Action aloud, in that order, and stops — Supporting Intelligence is definitionally too dense to speak and is never read aloud, only referenced (*"three vessels need attention, ask for detail on any one of them"*). Station Identification is implicit in which officer the Commander addressed, the same way it's implicit in which compartment the Commander opened today.
- **Station notifications**: a notification is a single Immediate Concern or Recommended Action line, standing alone, with the owning Station attributable from its content alone — exactly the discipline already proven by every approved recommendation in Part E, which already reads correctly as a single sentence with no surrounding page context required.
- **Daily briefings**: a concatenation of every Station's current Operational Condition + Standing Status/Immediate Concerns, in ADR-005's own navigation order (Executive Officer → Quartermaster → Flight Commander → Yeoman) — the same ordering principle ADR-005 already established for the sidebar, reused for a spoken or written daily digest.
- **Preflight summaries**: Flight Commander's and the (not-yet-built) Launch Readiness Authority's outputs (`evaluateLaunchReadiness()`, EWO-103) are already structured as pure data, not UI — the most voice/notification-ready reporting surface in the app today, by design.
- **Organization reports / Command Ribbon alerts**: both are future aggregations of the same per-Station layer data across a wider scope (an organization instead of one Commander's fleet) — the framework boundary in Part K is written specifically so this remains a scope change, not a rewrite.

**Avoid writing copy that only works when read from a screen.** Concretely: avoid copy that depends on a badge color, an icon, or spatial position to complete its meaning (e.g. a bare *"KEEP"* badge relies on its green color to read as good news; a spoken or notified form needs the sentence to carry that meaning on its own, e.g. *"Recommendation: keep this component — it is needed."*). This is a real, current gap worth naming: several of today's compact badge forms (Part I's compact/long-label pairing convention, QDS-002 C.9) already solve exactly this problem for their *long* form but not their *compact* form — the long form is the voice-ready one.

---

## Part K — Framework Boundary

**Belongs inside a future shared briefing framework** (reporting shell, reusable regardless of domain content):

- Briefing hierarchy (Part B's seven-layer grammar and its omission rules)
- Status/concern/recommendation slot contract (Part C's layer definitions)
- Station attribution (which officer owns a given report, per ADR-005 — already fully resolved by QDS-002 Part B and reused here without change)
- Semantic severity — **a genuine current gap, not yet shared**: `STATUS_PILL` (Ship Management), `procurementRowStateLabel` (Mission Control), and Decision Center's own KEEP/SATISFIED/NO CATALOG MATCH badges are three independently-maintained vocabularies for overlapping concepts (QDS-002's cross-page finding, restated here as the concrete argument for why this belongs in the shared framework rather than staying compartment-specific)
- Deep-link handoff pattern (Part F's cross-officer handoff shape — already consistently implemented four times independently, a strong signal it is ready to be named as one shared primitive)
- Compact/Standard/Expanded density modes (Part G)
- Standing Report structure (Part H)
- Exception Report structure (Part I)

**Remains Station-specific** (the actual domain judgment each Station is *for*):

- Readiness calculations (`evaluateLaunchReadiness`, `buildShipManagementSummary`, `deriveFleetBuildState`)
- Procurement logic (`calculateComponentAvailability`, `buildProcurementList`)
- Intelligence matrices (Flight Commander's matching/ranking)
- Maintenance decisions (Ship Management's Decision Summary content, though its *shape* — Immediate Concerns rendered as imperative one-line actions — is itself the shared pattern)
- Historical event interpretation (Captain's Log's own record — deliberately never editorialized, per Part D)
- Domain-specific supporting content (every compartment's own table/tree/timeline)

This matches QDS-001 Part G's own boundary-drawing principle exactly, applied to reporting instead of layout: **the goal is not copy reuse, it is reporting-grammar consistency.** The framework boundary sits at the shell/slot contract, never at the judgment each Station is trusted to make within it.

---

## Open Questions and Future Candidates

1. **ADR-005's "Standing Watch" vs. Flight Commander's shipped "Target Intelligence Available"** — already tracked in QDS-002 C.3; restated here because Part D's Flight Commander profile is the first place this framework's own language ("Standing Watch condition") directly collides with it. No resolution proposed by this document either.
2. **Should the three independently-maintained status-severity vocabularies (Part K) converge into one shared enum/label system?** A real, concrete consolidation candidate, not a hypothetical one — all three already express the same handful of concepts (owned/available/reserved/missing/incompatible).
3. **Does Mission Control's Procurement Work Queue table sit on the wrong side of the Executive Officer's "must not become component-level maintenance" boundary?** Flagged in Part D as a boundary worth watching, not a violation ruling — resolving this needs a Chief Architect judgment call, not an engineering one.
4. **Should Fleet Dashboard and Hangar Inventory gain a Standing Status / Recommended Action layer**, and if so, what real condition would trigger their "fully squared away" report (Part H)? This is the single largest concrete gap this document found, spanning three of Part B's seven layers across two compartments.
5. **Should Captain's Log gain a top-of-page Operational Condition line** (e.g. the illustrative *"Fleet records are current"*) once its missing empty state (QDS-001 D.4, QDS-002 Part F) is closed, so all seven compartments carry the same minimum two layers (Condition + Standing Status) without exception?
6. **Should the canonical five-part Exception Report structure (Part I) become the required shape for all future standing-exception copy**, including a retroactive rewrite of Captain's Log's raw import-validator strings, the furthest existing copy from officer voice found across two now-independent audits (QDS-002 and this document)?
7. **Should "same-officer inline resolution" vs. "cross-officer handoff" (Part F) become a formally named, documented pattern** the way the compact/long-label badge pairing already was in QDS-002 C.9 — so future compartments default to inline resolution within one officer's domain rather than inventing unnecessary navigational handoffs?
8. **Should Flight Commander's softer-than-ideal recommendation** (*"monitoring future ship traffic..."*, Part E) **be tightened once a genuinely single-step alternative exists**, or does its current posture-based phrasing correctly reflect that no single step exists yet? An open judgment call, not a defect.

---

## Commander Acceptance Criteria — Self-Check

- **How does every Station report?** Part A (current reality, per Station) and Part D (prescribed profile, per Station), read together.
- **What information belongs at the top of a briefing?** Part B's grammar — Station Identification and Operational Condition always lead; every other layer is present only when the Station has something to say through it.
- **When may an officer recommend action?** Part E's five criteria, validated against three real, shipped examples.
- **How does one Station hand work to another?** Part F's handoff matrix, including the cross-officer/same-officer distinction this audit surfaced.
- **What does a Station say when nothing requires attention?** Part H, with four real shipped examples and three named gaps.
- **How should uncertainty and failure be communicated?** Part I's five-part canonical shape, benchmarked against the three real examples closest to and furthest from it.
- **Which parts of a future briefing system are shared?** Part K's first list, including the newly-identified severity-vocabulary consolidation candidate.
- **Which parts remain domain-specific?** Part K's second list.

All eight answerable without reading a single line of production code.

---

## Non-Goals — Confirmation

No React components were built. No application copy was changed. No pages were refactored. No officer avatars, conversational AI, greetings, animations, or fictional crew names/personalities were introduced anywhere in this document. No navigation was altered. No canonical authority (ADR-004, ADR-005, QDS-001, QDS-002) was amended — only cited and, where a real tension exists (Item 1 above), named as an open question rather than resolved. `git status --short` contains only this new document.
