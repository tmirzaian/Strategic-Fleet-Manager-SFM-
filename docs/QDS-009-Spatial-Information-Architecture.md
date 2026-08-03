# QDS-009 — Spatial Information Architecture

**Classification:** Quartermaster Edition Design Authority
**Priority:** Foundational — the last conceptual authority before the Construction Era
**Status:** Discovery Only — no production code, CSS, React, or image changes were made to produce this document.
**Authority:** [ADR-004](ADR-004-Quartermaster-Edition-Design-Language.md), [ADR-005](ADR-005-Operational-Command-Structure.md), [QDS-001](QDS-001-Quartermaster-Compartment-Framework.md), [QDS-003](QDS-003-Officer-Briefing-Framework.md), [QDS-004](QDS-004-Quartermaster-Station-Shell.md), [QDS-005](QDS-005-Quartermaster-Visual-Baseline.md), [QDS-006](QDS-006-Flagship-Architectural-Integration.md), [QDS-008](QDS-008-Flagship-Navigation-and-Station-Identity.md), [EWO-109](EWO-109-Quartermaster-Station-Shell-Prototype.md), [EWO-110](EWO-110-Quartermaster-Station-Kit.md), [EWO-114](EWO-114-Mission-Control-Bridge-Prototype.md), [EWO-115](EWO-115-Flagship-Shell-Amendment.md)

---

## 0. One-Paragraph Summary

Every prior authority answered *what this place is* — QDS-009 answers *how it communicates*. Audited fresh against all seven primary Stations, one clean, cross-cutting finding stands ahead of everything else: the page header (eyebrow + title) is the single most consistent "historical web layout" holdout in the entire app — six of seven Stations still render it as a bare, unmounted `<p>`/`<h1>` pair, and the seventh (Mission Control) only stopped doing that because EWO-115 mounted it onto a glass placard three weeks after everything else in this codebase already learned to live inside a housing. Below the header, the picture is much healthier than expected: most Stations already mount their real content correctly (panels, bordered sub-cards, table housings) — the floating elements that remain are narrow and specific (Hangar Inventory's filter toolbar, every Station's header), not systemic. This document names eight physical display types already implicit in shipped code, cross-validates the work order's own per-Station density claims against real evidence (two of seven don't fully match yet), and defines the one sightline this app should be read against — which turns out to be the direct spatial expression of QDS-003's briefing grammar, not a new hierarchy competing with it.

---

## Part A — Audit of Existing Information Placement

Every Station reviewed directly against its current source. "Mounted" = sits in a bordered/backed housing (a `.panel`, a bordered sub-card, a table housing). "Floating" = a plain, unstyled/unbounded div or bare text with no visual containment — the historical web-page pattern.

| Station | Header | Metrics/summary | Recommendations | Tables | Search/filter | Actions | Supporting info |
|---|---|---|---|---|---|---|---|
| Mission Control | **Mounted** (glass placard, EWO-115) | Mounted (Fleet Status/Priority Actions rails) | Mounted (Quartermaster Assessment panel) | Mounted (Procurement Work Queue, `panel`) | N/A | Mounted (`ActionCard`, `WorkflowDestinationCard`) | Mounted (Quartermaster Report panel) |
| Flight Commander | Mounted (`StationBriefingRegion`, EWO-109) | Mounted (`MountedInstrument` cards) | Mounted (Standing Watch panel) | N/A (roster, not a table) | Mounted (`OperationalRailMount`, sticky rail) | N/A (observes/directs only, never edits — QDS-003 A.4) | Mounted (dossier cards) |
| Decision Center | **Floating** (bare eyebrow/h1) | Mounted (Fleet Demand/Inventory sub-cards) | Mounted (verdict panel) | N/A | Mounted (search sits inside the Loot Lookup panel) | Mounted (buttons inside the verdict panel) | Mounted (target-loadout list, bordered rows) |
| Hangar Inventory | **Floating** (bare eyebrow/h1) | N/A | N/A | Mounted (`panel overflow-hidden`) | **Floating** (bare pill toolbar, no housing) | Mixed (inline table actions mounted; header's own "Add New Item" button floats with the header) | N/A |
| Ship Management | **Floating** (bare eyebrow/h1) | Mounted (inside the Ship Operational Banner panel) | Mounted (Decision Summary card) | Mounted (Adaptive Ship Systems Workspace panel) | N/A (dropdown/pill selectors, both mounted inside their own panel) | Mounted (every install/remove/save action lives inside a panel) | Mounted (workstation cards) |
| Captain's Log | **Floating** (bare eyebrow/h1) | N/A | N/A | N/A (timeline, not a table) | N/A | Mounted (Export/Import panel) | **Mixed** — individual entries are mounted (own small `panel`), but the connecting spine is a plain `absolute` line/dot — a positive case, see below |
| Fleet Roadmap | **Floating** (bare eyebrow/h1) | N/A | N/A | N/A | N/A | N/A | Mounted (four `panel` cards) |

### Findings

1. **The header is the one truly systemic floating element.** Six of seven Stations render it as a bare `<p>`/`<h1>` pair with zero visual containment — indistinguishable from a generic web page's title. Mission Control is the sole exception, and only since EWO-115. This is the single highest-leverage fix available to this framework: one component (`CompartmentHeader`, already shipped — Station Kit, EWO-110) already exists to solve it everywhere, and six Stations simply haven't adopted the mounted-placard treatment EWO-115 gave Mission Control's own header.
2. **Hangar Inventory's filter toolbar is the one other real floating element**, and it is genuinely isolated — no other Station's search/filter mechanism floats (Decision Center's and Ship Management's are both already housed inside their respective panels).
3. **Captain's Log's timeline spine is a good example worth naming positively**, not fixing: a plain line connecting mounted entry-cards reads as a physical rail (a conduit, a cable run), not as unstyled content — this is "floating" only by the letter of the audit's own definition, not in spirit, and Part D names it as its own display type below rather than flagging it as a defect.
4. **Below the header, this app is already substantially "mounted."** Every table, every action, and nearly every summary/recommendation surface already lives inside a housing. The floating-content problem this document was commissioned to find turns out to be narrow and specific, not systemic — a genuinely useful, boring-in-a-good-way finding.

---

## Part B — Commander Sightline Analysis

The canonical sightline, in SFM's own vocabulary, cross-validated against QDS-003's already-certified seven-layer briefing grammar — they are the same hierarchy read two ways, not two competing ones:

```
Threshold                  →  Station Identification   (QDS-003 Part C.1)
        ↓
Officer Brief               →  Operational Condition    (QDS-003 Part C.2)
        ↓
Critical Status              →  Command Summary + Immediate Concerns (QDS-003 Part C.3/4)
        ↓
Commander Decision            →  Recommended Action       (QDS-003 Part C.5)
        ↓
Operational Workspace          →  Supporting Intelligence  (QDS-003 Part C.6)
        ↓
Supporting Information          →  (Supporting Intelligence, secondary detail)
        ↓
Historical Reference              →  Standing Status / archival record
```

**This is not a new hierarchy — it is QDS-003's grammar given a physical reading order.** QDS-003 defined *what* a Station says and in what sequence; this document defines *where the Commander's eye finds it* saying it. The two must never diverge: a future Station whose sightline disagrees with its own briefing grammar (e.g. Supporting Intelligence appearing before Command Summary) has a real defect, by definition, under both authorities simultaneously.

**Validated against the strongest real case, Mission Control (post-EWO-115):** Threshold (the glass header placard) → Officer Brief (*"Operations Standing By"*) → Critical Status (Fleet Status rail, left) → Commander Decision (Priority Actions rail, right, plus the Quartermaster Assessment below) → Operational Workspace (Top Priority Ship) → Supporting Information (Quartermaster Report) → Historical Reference (*not present on this Station — correctly so; Mission Control is not a historical Station, per QDS-008 Part C*). Every real, shipped element maps onto exactly one sightline step, in the correct order, with no gaps and no step skipped — the sightline is not aspirational here, it is already true.

**Where the sightline is currently violated:** any Station whose header floats (Part A) has no true "Threshold" step at all — the Commander's eye has nothing physically distinct to land on first. This is the same finding as Part A.1, arrived at independently through a different lens, which is itself a form of corroboration.

---

## Part C — Information Classes

| Class | Definition | Physical home | Real example |
|---|---|---|---|
| **Mission Critical** | Requires Commander awareness now; drives the next decision | Threshold / Officer Brief zone — Mounted Instrument or Glass Tactical Display | Mission Control's Fleet Status, Priority Actions |
| **Operational** | The Station's own working data — what the Commander manipulates | Operational Workspace zone — Engineering Console or Technical Workbench | Ship Management's port tree, Hangar Inventory's table |
| **Reference** | Catalog/identity metadata that explains operational data without being itself actionable | Supporting Information zone — Reference Panel, always secondary to Operational content, never promoted above it | Component category glyphs/labels (`CANONICAL_COMPONENT_CATEGORY_*`), `describeComponentIdentity` |
| **Historical** | A record of what already happened | Historical Reference zone — Historical Archive, its own dedicated Station | Captain's Log's timeline |
| **Administrative** | Import/export, backup, data integrity | Historical Reference zone, alongside Historical — same officer (Yeoman, ADR-005), same physical neighborhood | Captain's Log's Export/Import panel |
| **Diagnostic** | Something is wrong or unavailable | Standing Report / Exception Report zone (QDS-003 Part I) — never buried inside Operational content | Flight Commander's "Factory Loadout Data Unavailable" panel |
| **Contextual** | Secondary metadata that supports a specific row/item, never a zone of its own | Inline, embedded within whatever Operational or Mission Critical element it annotates | Hangar Inventory's "Needed By" column |

**Governing rule:** a Station is malformed the moment a class appears in the wrong zone — e.g. Diagnostic content buried inside an Operational table row (undiscoverable) or Contextual content promoted to its own zone (over-weighted relative to its real importance). No current Station was found to violate this in the audit above; it is stated here as the rule the audit was measured against, for future Stations to be measured against too.

---

## Part D — Physical Display Types

Not CSS — a conceptual vocabulary. Each type below already exists in shipped code; none is proposed as new.

### Mounted Instrument
**Purpose:** a single, scannable metric. **Typical contents:** one label, one value, sometimes a trend/context line. **Density:** minimal — deliberately not a place for detail. **Interaction:** read-only, occasionally a deep-link. **Relationship to environment:** sits directly on the environment plate or its own glass rail, never fully opaque. **Shipped example:** `MountedInstrument` (Station Kit, EWO-110); Mission Control's `CriticalMetricTile`/`FleetStatusTile`.

### Glass Tactical Display
**Purpose:** a translucent panel of related Mission Critical or Operational content, legible over an environment plate. **Typical contents:** grouped instruments, a short list, a verdict. **Density:** low-to-moderate. **Interaction:** read-primary, sometimes filterable. **Relationship to environment:** the defining case — this surface exists specifically to sit *over* environment art without obscuring it (`backdrop-blur-md`, `bg-panel/55`, QDS-005's "structural glass" material). **Shipped example:** Mission Control's Fleet Status/Priority Actions rails; Decision Center's Loot Lookup/Assessment panels.

### Engineering Console
**Purpose:** the Station's own deep, technical working surface. **Typical contents:** grouped controls, editable state, per-item actions. **Density:** high, deliberately. **Interaction:** the most interactive display type — installs, edits, saves. **Relationship to environment:** environment recedes or is absent entirely; this surface is opaque and self-sufficient (QDS-005's "compartment panel" material, no blur). **Shipped example:** Ship Management's Adaptive Ship Systems Workspace.

### Operations Rail
**Purpose:** persistent controls (search/filter/sort) kept within reach while scanning a workspace below. **Typical contents:** search input, filter toggles, sort controls. **Density:** low, deliberately restrained so it never competes with the workspace it controls. **Interaction:** the most frequently touched surface on a data-heavy Station. **Relationship to environment:** typically opaque, sticky, positioned above the workspace it governs. **Shipped example:** Flight Commander's `OperationalRailMount`/`IntelligenceControlRail`. **Gap:** Hangar Inventory's own filter toolbar is functionally this display type but has never been mounted as one (Part A.2) — the clearest concrete candidate for adopting this vocabulary.

### Standing Report
**Purpose:** communicates "nothing requires attention" without going silent. **Typical contents:** a calm confirmation line, optionally a monitoring visual. **Density:** minimal. **Interaction:** read-only, never actionable (QDS-003 Part H — Standing Status and Recommended Action are mutually exclusive). **Relationship to environment:** mounted, calm, never urgent-feeling. **Shipped example:** `StandingReportRegion` (Station Shell, EWO-109); Flight Commander's Standing Watch panel.

### Reference Panel
**Purpose:** explains or identifies something without being the primary workspace. **Typical contents:** catalog metadata, glyphs, identity strings. **Density:** low. **Interaction:** read-only or a lightweight lookup. **Relationship to environment:** secondary, positioned near but visually subordinate to the Operational content it annotates. **Shipped example:** `CatalogComponentSearch`; component category icon/label lookups embedded in Mission Control's Logistics Demand cards.

### Technical Workbench
**Purpose:** the densest possible presentation of structured, editable, or highly detailed data. **Typical contents:** a full table, a port tree, a multi-column ledger. **Density:** maximum, by design — this is the one display type where high density is correct, not a violation (QDS-003 Part G's "Ship Management's Expanded Brief is domain-justified" finding, restated spatially). **Interaction:** sort, filter, edit, expand/collapse. **Relationship to environment:** opaque, self-contained, environment absent or fully backgrounded. **Shipped example:** Hangar Inventory's inventory table; Ship Management's port tree.

### Historical Archive
**Purpose:** a chronological record, read but never edited in place. **Typical contents:** timestamped entries, each independently mounted. **Density:** low per-entry, but the archive as a whole can be long — vertical scroll is expected and correct. **Interaction:** read, export, occasionally restore. **Relationship to environment:** minimal or none — a record does not need atmosphere (QDS-001 D.1's own "a narrow card is not a room" finding, cited in QDS-008 Part C). **Shipped example:** Captain's Log's timeline — including its connecting spine, which is this display type's own physical signature (a conduit linking mounted records), not a floating-content defect (Part A.3).

---

## Part E — Information Density, Validated Against Evidence

| Station | Work order's prescribed identity | Real evidence (Part A audit + prior QDS findings) | Match? |
|---|---|---|---|
| Mission Control | Broad, calm, executive | Confirmed — EWO-114/115's own certified Bridge identity is exactly this | **Match** |
| Flight Commander | Dense, operational, fast scanning | Confirmed — QDS-003's "reference implementation," EWO-114's own point of contrast against Mission Control's calm | **Match** |
| Captain's Ready Room (Captain's Log) | Quiet, reflective, **document-rich** | Quiet/reflective confirmed — but "document-rich" overstates current reality: the audit found this the *lightest-weight* page of all seven, and QDS-003 A.7 independently found it has no standing-report or condition layer at all yet | **Partial** — tone matches, density claim does not yet |
| Decision Center | Analytical, technical, measured | Confirmed — moderate/technical density, one lookup at a time, QDS-003's second reference implementation | **Match** |
| Hangar Inventory | Transactional, industrial, logistics-focused | Strongly confirmed — the audit's own finding: "the most spreadsheet-like of the five [audited] pages" | **Match** |
| Ship Management | Deep, hands-on, engineering-first | Strongly confirmed — "the richest, most control-heavy page" | **Match** |
| Fleet Roadmap | Strategic, long-horizon, planning-centric | Tone matches the intent, but current implementation is four static prose cards — no live planning data, no interactivity; "planning-centric" describes an aspiration, not yet a mechanism | **Partial** — same shape of gap as Captain's Log |

**Reading this table correctly:** five of seven Stations already embody their prescribed identity in real, shipped form. The two partial matches share the same root cause — both are currently the *least data-driven* Stations in the app (static prose / a record with no live condition layer), so their density naturally reads lighter than their strategic/reflective *tone* alone would suggest. This is not a defect to fix under this document (Discovery Only); it is the clearest evidence in this whole audit for QDS-008 Part I's own migration-order reasoning — both Stations need content-layer work (QDS-003's own gaps) before a spatial/density identity can fully land.

---

## Part F — Mounted Surface Grammar

Conceptual authority — every term below already has a real, shipped CSS expression (cited from QDS-005, not reinvented here).

- **Glass** — translucent, blurred backing (`bg-panel/55 backdrop-blur-md` and its siblings) that lets environment art read through while keeping content legible. QDS-005's own "structural glass" material, one of exactly two the whole app uses.
- **Structural brackets** — small corner-tick accents suggesting a viewport frame without a full border (Mission Control's hero corner ticks, both pre- and post-EWO-115). Decorative, never load-bearing, never a container by themselves.
- **Console housings** — fully opaque, bordered, rounded cells (`rounded-lg border border-white/5 bg-white/[0.02]`) — the Sidebar's own brand/nav consoles, `MountedInstrument`'s own housing. QDS-005's second material, "compartment panel."
- **Projection surfaces** — the environment plate itself, understood per QDS-006 Part F as "a window into a continuing architectural space," never a banner. The one surface Commander attention should never linger on directly (Part G).
- **Engineering terminals** — the opaque, dense, high-contrast housings that wrap Technical Workbench content (Part D) — Ship Management's and Hangar Inventory's table housings, structurally the least glass-like, most opaque surface type in the app, deliberately so.

No new material, color, or CSS mechanism is proposed. This part exists to give Engineering a shared name for five things it already builds by hand every time, per-Station, without a shared vocabulary.

---

## Part G — Relationship Between Environment and Information

**Confirmed, already-true principles, restated as governing law:**

- **Environment never competes.** Mission Control's own depth-fade scrim (EWO-115 Part H) exists specifically so the Bridge plate never remains visible behind content the Commander is meant to be reading.
- **Information never floats** — except where Part A found it still does (the header, Hangar Inventory's toolbar) — both named as the concrete backlog this principle already implies.
- **Environment provides architecture; mounted displays provide interaction.** No environment plate anywhere in the app is directly clickable, filterable, or editable — confirmed true without exception.
- **Commander attention belongs to information, never the reverse.**

**Where this principle is least resolved today:** Ship Management's `ShipHeroFrame` — a full-bleed ship photograph sitting directly behind the readiness bar and Decision Summary card, per the Part A audit. This is not treated as a violation (QDS-001 D.1 already established that a ship photograph is a fundamentally different, legitimate identity mechanism from an atmospheric environment plate, and QDS-008 Part I already cites this exact difference as the reason Ship Management is the hardest remaining Flagship migration) — but it is the one Station where "environment vs. information" tension is real and unresolved, worth naming here explicitly rather than leaving implicit.

---

## Part H — Cross-Station Consistency

**Identical everywhere (already true, confirmed by this audit):**

- Typography (`font-display`/`font-mono` conventions, uniform label/title scale)
- Glass language (QDS-005's exactly-two materials — no Station uses a third)
- Spacing rhythm (the same Tailwind spacing scale throughout; no Station invents its own unit)
- Semantic colors (`Badge`'s `Tone` union — every Station draws from the same vocabulary, no exceptions found)
- Divider treatment (`StructuralDivider`, Station Kit — every horizontal/vertical seam found in this audit traces to it or its pre-Kit equivalent, `.scanline-divider`)
- Briefing grammar (QDS-003's seven layers — every Station's content, however incomplete, is still built from that one shared grammar, never a competing one)

**Intentionally varies (already true, and correctly so):**

- Density (Part E)
- Surface type mix (Part D — which physical display types a Station leans on: Mission Control leans Glass Tactical Display, Ship Management leans Engineering Console + Technical Workbench, Captain's Log leans Historical Archive)
- Environmental emphasis (full-viewport Bridge plate vs. bounded `EnvironmentBay` vs. `ShipHeroFrame`'s photo-identity vs. no environment at all — Fleet Roadmap and Captain's Log currently have none, correctly, per QDS-001 D.1)
- Workspace organization (table-based, card-based, timeline-based — never forced into one shared shape)

**The line this document draws:** consistency governs *material and grammar*; variation governs *density and organization*. A future Station that invents a third glass material would violate this framework; a future Station that is denser or sparser than its neighbors, or organizes its workspace as a table instead of a timeline, would not.

---

## Part I — Future Expansion (documentation only)

- **Voice interaction** — already anticipated by QDS-003 Part J; this document adds nothing new except confirming that the sightline (Part B) already orders content the same way a spoken briefing would need to (Threshold/Officer Brief first, Historical Reference last or omitted).
- **Dynamic alerts / notification badges** — already flagged by QDS-008 Part G as blocked on consolidating the app's three independently-maintained status-severity vocabularies first; this document's own Diagnostic information class (Part C) is the natural home for any future alert, once that consolidation happens.
- **Live operational feeds** — not currently applicable; SFM has no live/backend data source today (QDS-008 Part H already found "connection status" itself not applicable for the same reason). A genuine future architectural gap if ever pursued, not a near-term concern.
- **Additional Stations** — Part D's eight display types are written to be composed, not reinvented, by any future Station — the same "compose, never reimplement" rule QDS-006 Part H established for the Shell/Kit tiers now extends to the physical-display vocabulary itself.
- **Multiple monitors / ultra-wide layouts** — the app's current shape (a `max-w-[1400px]` content cap sitting inside a full-viewport `FlagshipEnvironmentLayer`, EWO-115) already degrades correctly toward wide displays: additional width reveals more environment, not stretched content — the right default behavior already, not a gap requiring new work. Multiple physical monitors are not evaluated further here — no evidence in the current codebase suggests this app has ever been used that way, and speculating about it without a real use case would violate this document's own evidence-first method.

---

## Deliverable

This document — `docs/QDS-009-Spatial-Information-Architecture.md`.

---

## Commander Acceptance Criteria — Self-Check

- **What in each Station's current layout is already mounted, and what still floats?** Part A — one systemic gap (headers) and one isolated gap (Hangar Inventory's toolbar), not a widespread problem.
- **What is the one correct reading order for any Station, and how does it relate to the Officer Briefing Framework?** Part B — the same hierarchy, read spatially instead of informationally; the two must never diverge.
- **Where does each type of information physically belong?** Part C, with an explicit rule for what makes a Station malformed.
- **What are the physical display surfaces this app already builds, named once instead of reinvented per Station?** Part D — eight types, every one already shipped somewhere.
- **Does each Station's prescribed density identity match its real, current implementation?** Part E — five of seven do; two partial matches both trace to the same known content-layer gap already named in QDS-003 and QDS-008.
- **How does mounted content physically read as mounted?** Part F, entirely in terms of QDS-005's own already-certified materials.
- **What is the correct relationship between environment art and Commander-facing information, and where is it least resolved today?** Part G — Ship Management's `ShipHeroFrame`, named explicitly rather than left implicit.
- **What must stay identical across every Station, and what should legitimately differ?** Part H's material/grammar-vs-density/organization line.
- **Is this architecture ready for voice, alerts, additional Stations, and wide displays?** Part I — yes for two, blocked-but-named for one, already-correct-by-default for the last, and one honestly marked "not evaluated" rather than speculated on.

All nine answerable without reading a single line of production code.

---

## Non-Goals — Confirmation

No React components were built or modified. No CSS was written. No images were generated or consumed. No copy was shipped to any production page. No canonical authority (ADR-004, ADR-005, QDS-001, QDS-003, QDS-004, QDS-005, QDS-006, QDS-008) was amended — only cited, cross-validated against real shipped evidence gathered fresh for this document, and where a real gap was found (headers, Hangar Inventory's toolbar, Ship Management's environment tension, two density partial-matches), named explicitly as a finding rather than silently corrected. `git status --short` contains only this new document.
