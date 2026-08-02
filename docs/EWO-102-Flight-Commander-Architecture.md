# EWO-102 (Phase 0) — Flight Commander: Architecture & Operational Workflow

**Classification:** Product Architecture / UX Research. **No production code was
written to produce this document.** No components, routes, styling, or
implementation exist yet for Flight Commander — everything below is paper
architecture, grounded in a read-only survey of the current, real application
(file:line references throughout point at the working tree as it exists
today).

---

## 0. One-Paragraph Summary

Strategic Fleet Manager currently has no concept of "right now, this session,
this ship." Every existing page answers a *standing* question about the fleet
or a *specific ship's maintenance state* — none of them answer "am I, this
instant, ready to alt-tab into Star Citizen." Flight Commander should be a
new, narrow, read-mostly page whose entire job is that terminal go/no-go
check. It should compute nothing new (every fact it needs already has one
canonical source elsewhere in the app) and edit nothing (every fix it
surfaces should deep-link to the page that already owns that edit). The
recommended shape is a **Preflight Checklist** with a compact summary strip at
the top — not a fourth dashboard.

---

## Part A — Current Workflow Analysis

### A.1 The real path, as it exists today

The work order's assumed path (Mission Control → Fleet Dashboard → Ship
Management → Loadout → Install Components → Launch Star Citizen) is
essentially correct, confirmed against the live routes and Sidebar order
(`App.tsx:28-47`, `Sidebar.tsx:53-67`):

```
Mission Control (/)
   │  read Priority Actions / Quartermaster Report, OR
   │  click a ship in "Top Priority Ship"
   ▼
Fleet Dashboard (/fleet)              [optional — skipped if MC linked directly to a ship]
   │  filter / sort / scan ship cards or table
   │  click "Manage Ship →"
   ▼
Ship Management (/ship-workspace/:shipId)
   │  Operational Review (read-only) →
   │  choose Commander Intent:
   ├─ Manage Loadout            (edit the Target configuration)
   │     │  pick/create a Build, edit New Target per port, Save Changes
   │     ▼
   └─ Change Installed Components  (edit the physical ship)
         │  per row: Install/Change → decision ladder → Install
         │  (Reserved → Available → Upgrade → New → Borrow)
         ▼
   [repeat Manage Loadout / Change Installed Components until
    Decision Summary reads "No Immediate Decisions"]
         │
         ▼
   Commander alt-tabs out, launches Star Citizen manually —
   SFM has no awareness this transition happens.
```

### A.2 Every transition, modal, and decision point

| # | Location | What happens |
|---|---|---|
| 1 | Mission Control | Scan Fleet Status tile, Priority Actions stack (up to 5 category cards), Quartermaster Report (Logistics Demand → Assessment → Work Queue) |
| 2 | Mission Control → Fleet Dashboard | Click "Full fleet →" or "Loot Lookup"/"Add Inventory"/"Modify Ship" in Execute Orders |
| 3 | Fleet Dashboard | Toggle Active/Retired, expand Filters (4 independent pill groups), pick Sort, scan Card or Table view |
| 4 | Fleet Dashboard → Ship Management | Click a `ShipCard` or a table row's "Manage Ship →" |
| 5 | Ship Management | Read Ship Operational Banner (readiness bar, missing summary, Decision Summary) in Operational Review |
| 6 | Ship Management | Choose Commander Intent (Manage Loadout **or** Change Installed Components — mutually exclusive, one at a time) |
| 7 | Manage Loadout | Pick a Loadout pill, or "+ New Loadout" (a 4-way Initialize-From choice), edit New Target cells inline, Save/Discard (top panel **or** the fixed bottom bar — two entry points to the same action) |
| 8 | Change Installed Components | Per row: "Install / Change" → inline disclosure opens **beneath that exact row** (never a modal) |
| 9 | Install disclosure | Decision ladder renders only the groups that have candidates: Reserved → Available in Inventory → Upgrade Available → **Install New Component** (opens `TargetComponentPicker` inline) → Borrow Available (collapsed, needs an extra click to expand, then a "Transfer?" inline confirm) |
| 10 | Install disclosure | Click "Install" on a candidate → immediate action, no confirmation step. If something else already occupies the port, it's silently removed-and-replaced first. |
| 11 | Change Installed Components | "Remove" button → the **one true modal** on this page: "Remove '{item}'?" + optional "Return to Hangar" checkbox |
| 12 | (digression) Ship Management → Hangar Inventory | If a needed part isn't owned at all, Commander must leave to record/purchase it, then return |
| 13 | (digression) Ship Management → Decision Center | If an unidentified looted item needs evaluating first |
| 14 | Repeat 6-11 | For every ship the Commander might fly today — SFM tracks no "which ships am I actually considering right now" set |
| 15 | *(missing)* | No screen anywhere answers "given everything above, am I ready, and which ship should I fly" |
| 16 | *(missing)* | Alt-tab to Star Citizen — SFM has no launch button, no last-check screen, no awareness of the moment |

### A.3 Friction found

- **Minimum three full page loads** (Mission Control → Fleet Dashboard →
  Ship Management) before any actionable decision, more whenever a
  procurement or identification digression to Hangar Inventory or Decision
  Center is required.
- **The same readiness fact is computed and re-rendered on three separate
  pages** for the same ship — Fleet Status tile (Mission Control), the ship's
  card/table row (Fleet Dashboard), and the Hero/Decision Summary (Ship
  Management) — all ultimately from the same canonical
  `prepareCanonicalHardpoints` → `calculateBuildProgress` /
  `calculateComponentAvailability` chain, but with zero cross-page linking
  ("you already checked this ship two minutes ago").
- **No session/mission concept exists in the data model at all.**
  `useFleetStore.ts` models permanent Loadouts, Builds, and installed
  components — nothing ephemeral like "what am I doing today" or "which ship
  am I flying this session."
- **Single-unit contention is invisible until it's too late.** If two ships
  both want the same one-off owned component, nothing warns the Commander
  before they start editing ship #2 — the "Available in Inventory" candidate
  simply vanishes once ship #1 consumes it.
- **"Which ship should I fly today" has no dedicated answer.** Fleet
  Priority (`priority`, a permanent per-ship rank set inside Ship Management)
  is the closest proxy, but it's a planning-time value, not a today's-session
  decision, and nothing recommends overriding it for a given sitting.
- **Captain's Log is retrospective only** — a chronological audit trail of
  what already happened, not a forward-looking readiness check.
- **The transition out of the app is a hard, silent edge** — SFM's UI ends
  wherever the Commander stops clicking; there is no terminal "you are about
  to fly {ship}, here is what's true" moment anywhere in the product.

---

## Part B — Flight Commander Mission

### Recommended canonical operational question

> **"Am I ready to launch?"**

### Why this one, and not the others

- **"What still needs attention?"** is already Mission Control's job
  (Priority Actions, fleet-wide, ongoing/backlog-oriented). Reusing it for
  Flight Commander would violate the "each page answers one question, avoid
  duplication" mandate directly.
- **"Which ship is best prepared?"** is a real and necessary *sub-question*
  Flight Commander must help answer (ship selection), but it's incomplete
  alone — knowing which ship is best prepared doesn't tell the Commander
  whether *that* ship is actually good enough to fly right now.
- **"What does today's mission require?"** presumes a "mission" data concept
  (objectives, required loadout doctrine) that does not exist yet anywhere in
  the app. It's the right long-term direction (see Part F, Mission Packages)
  but too heavy a foundation for a first canonical question — the page would
  have nothing to compute from on day one.
- **"Am I ready to launch?"** is a single confidence-oriented question that:
  cleanly subsumes ship selection as its natural first step (you can't answer
  "am I ready" without first knowing *for which ship*); matches the Chief
  Architect Note's framing verbatim ("the final screen the Commander visits
  before clicking Launch Star Citizen"); and is answerable entirely from
  data this app already computes, so v1 requires zero new domain modeling.

---

## Part C — Operational Responsibilities

| Item | Tier | Rationale |
|---|---|---|
| Active vessel | **Required** | The anchor of the whole screen — must be selectable/confirmable here |
| Selected mission build | **Required** | Which Loadout is being flown; read-only display, editing stays in Ship Management |
| Mission readiness | **Required** | The core go/no-go signal; reuse the existing canonical computation verbatim |
| Outstanding deficiencies | **Required** | Missing / Invalid Target / Upgrade Available for the active vessel — this list *is* the checklist body |
| Launch checklist (as an artifact) | **Required** | Not a separate concern — this is the page's organizing structure, see Part E/G |
| Reserved components | **Optional** | Only informational; a reservation without an install already surfaces as a deficiency, so this is context, not a blocker |
| Maintenance required | **Optional** | Folds into Outstanding Deficiencies today — no severity/urgency data model exists yet to justify a separate section |
| Captain's Log summary / Recent changes | **Optional** | Same feature, scoped to the active vessel only ("what changed on this ship since I last flew it") — never the full fleet-wide log |
| Mission briefing | **Optional** | A freeform, Commander-authored note for this session; no data model backing needed for v1 (see Part F, Mission Packages, for the eventual structured version) |
| Personal equipment | **Future** | No Commander-character data model exists yet |
| Vehicles loaded | **Future** | No cargo/loadout-bay data model exists yet |
| Cargo | **Future** | Same |

---

## Part D — Relationship Mapping

Every existing page's title already functions as its own operational-question
statement (confirmed live: Mission Control = "Operations Standing By,"
Fleet Dashboard = "The Fleet Is At Your Command," Ship Management = "Select
Vessel For Maintenance," Decision Center = "Mission Assessment Available,"
Hangar Inventory = "Warehouse Inventory Available," Captain's Log = "Recent
Fleet Activity"). Flight Commander must add a seventh distinct question
without overlapping any of the six.

| Page | Keeps answering | Nothing moves out, because |
|---|---|---|
| **Mission Control** | "What does my fleet need, in priority order, right now?" | Fleet-wide and backlog-oriented — a different timescale than a single session's go/no-go |
| **Fleet Dashboard** | "Which ship, out of all of them, do I want to look at?" | The full filterable/sortable browse surface; Flight Commander's own vessel picker must stay lightweight and *not* re-implement this grid |
| **Ship Management** | "What does this specific ship need, and let me fix it" | The only page that edits anything — Loadouts, installed components, reservations, retirement. Flight Commander must never grow an inline editing control of its own |
| **Decision Center** | "Should I keep this [recovered item]?" | Per-item triage, unrelated to launch readiness |
| **Hangar Inventory** | "What do I physically own, and what's free?" | The ledger; unrelated to a specific launch |
| **Captain's Log** | "What already happened?" | Retrospective audit trail, fleet-wide |
| **Flight Commander (new)** | **"Am I ready to launch?"** | New: session-scoped, single-vessel, terminal, forward-looking |

**What is newly synthesized in Flight Commander** (not moved — re-rendered
from the same canonical sources, per this app's own established convention of
one computation reused by many renderers, e.g. `prepareCanonicalHardpoints`
already called identically from four pages):

1. A read-only, launch-framed restatement of the active vessel's readiness
   and deficiencies (same source functions Ship Management's Decision
   Summary already calls — never a second formula).
2. A lightweight, **session-scoped** "which ship am I flying" chooser —
   distinct from both Fleet Priority (a permanent per-ship rank edited in
   Ship Management) and Fleet Dashboard's full grid. Defaults to the
   highest-Fleet-Priority Mission Ready ship, overridable for this sitting
   only, persisting nothing back to the ship's stored `priority`.
3. A vessel-scoped excerpt of Captain's Log (last few relevant entries only).

Every remediation action Flight Commander surfaces ("2 components missing")
must deep-link into Ship Management pre-scoped to the right ship and Commander
Intent (e.g. `/ship-workspace/:shipId` with Change Installed Components
selected) — never an inline fix. This is the single rule that prevents Flight
Commander from becoming an eighth place decisions can be made.

---

## Part E — Layout Concepts

### Concept A — Operational Dashboard

A multi-panel overview scoped to one selected vessel, visually similar in
density to Mission Control but narrowed to a single ship: vessel selector at
top, then a grid of independent panels (Readiness ring, Deficiencies list,
Recent Activity, Loadout summary) all visible at once, browsable in any
order.

- **Layout:** grid of cards, no enforced reading order.
- **Information hierarchy:** flat — every panel has equal visual weight.
- **Commander workflow:** scan whichever panel looks interesting, click into
  it if action is needed.
- **Advantages:** consistent with the rest of the app's existing dashboard
  visual language (reuses `ReadinessRing`, `ActionCard`, etc. as-is); fast
  for an experienced Commander who already knows roughly what to expect.
- **Disadvantages:** a dashboard is inherently *browsable*, not
  *directive* — it doesn't naturally produce a single "yes, go" moment;
  highest risk of becoming "a fourth restatement of Mission Control," the
  exact outcome the Chief Architect Note warns against; no built-in urgency
  or sequencing signal.

### Concept B — Pilot Briefing

A narrative, single-column document read top to bottom, styled like a real
preflight briefing: ship + freeform mission note at top, then plain-language
prose sentences (reusing this app's own established
`describeQuartermasterAssessment`/Decision-Summary sentence pattern rather
than raw tables) — *"Your Corsair is Mission Ready. No outstanding decisions.
Last change: SnowBlind installed 4 hours ago."* — ending in a single
ceremonial "Reviewed" acknowledgment.

- **Layout:** single column, prose blocks in fixed reading order.
- **Information hierarchy:** narrative — most important fact stated first,
  everything else is supporting sentences.
- **Commander workflow:** read top to bottom once, mentally confirm, done.
- **Advantages:** strongest fit for the "Commander confidence" priority named
  explicitly in the Chief Architect Note — reads like a human being briefing
  the Commander, not a data table; naturally accommodates the freeform
  Mission Briefing field as its organizing device.
- **Disadvantages:** prose is slower to scan than a list for a Commander who
  already knows their fleet; degrades badly with more than a couple of
  deficiencies (a paragraph enumerating six missing components reads worse
  than a list); the ceremonial "acknowledge" action has no real effect and
  risks feeling like busywork.

### Concept C — Preflight Checklist

A literal checklist: a vertical list of discrete, individually-resolved line
items (Ship Selected ✓ · Loadout Confirmed ✓ · Mission Ready ✓/✗ · No
Outstanding Decisions ✓/✗ · Reservations Resolved ✓/✗ ...), each with its own
status glyph and, when unresolved, exactly one deep-link CTA ("Resolve in
Ship Management →"). A top-level banner states the aggregate: **"READY TO
LAUNCH"** (all green) or **"N ITEMS NEED ATTENTION"** (any red/gold).

- **Layout:** vertical list, one row per checklist item, summary banner
  pinned above it.
- **Information hierarchy:** binary at the top (ready / not ready), detail
  below only as needed.
- **Commander workflow:** glance at the banner for the go/no-go answer;
  descend into the list only if something's wrong; click through to fix.
- **Advantages:** the closest literal match to a real-world pilot preflight
  checklist (thematically exact); scannable go/no-go in under a second;
  every unresolved item's remediation path is explicit and always deep-links
  to the page that already owns that fix, which structurally prevents
  duplicated editing surfaces; trivially extensible later (Part F items each
  become one more row, no redesign required).
- **Disadvantages:** can read as mechanical/cold rather than confidence-
  inspiring if the rows are too granular or clinical; has no natural home for
  freeform narrative unless one row is explicitly reserved for it; if kept
  at port-level granularity instead of category-level, a badly-unready ship
  could produce a checklist as long and table-like as Ship Management itself
  — must stay coarse-grained by design.

---

## Part F — Future Expansion Placement

| Future system | Where it lands | Placement reasoning |
|---|---|---|
| Mission packages | Flight Commander, replacing the freeform Mission Briefing field | A structured, named, saved Mission Package (objectives + required loadout doctrine) selected at the top of the page — a natural evolution of the app's existing `QuartermasterTemplate` doctrine concept |
| Cargo planning | New checklist row/panel inside Flight Commander | Same pattern as any other deficiency check, once a cargo data model exists |
| Personal equipment | New checklist row/panel inside Flight Commander | Parallel structure to ship deficiencies, for a not-yet-modeled Commander character inventory |
| Ground vehicles | Extends the *active vessel selector*, not a new page | Suggests the selector eventually needs to support a Primary Flight Ship **and** an optional Ground Vehicle slot, even though v1 handles exactly one vessel |
| Medical readiness | New checklist row, paired conceptually with Personal Equipment | Same future-checklist pattern |
| Organization operations | A future, separate "Org Ops" page — Flight Commander only surfaces a read-only checklist row once org-scoped readiness exists | Org-wide concerns are a different scope/timescale than one Commander's one session |
| Squadron assignments | Same — read-only row ("Assigned to: {squadron}") | Assignment *management* belongs to the future Org Ops page, not Flight Commander |
| Fleet formations / Fleet deployment | A future, separate page entirely; Flight Commander links out to it at most | Org/squadron-level concern, out of a single-Commander single-session scope |
| VoiceAttack integration | Not a placement question — a future consumer of Flight Commander's data layer | Flight Commander's readiness/deficiency computation should be built as one clean, pure derivation function from day one (not logic embedded in JSX), specifically so a future hands-free bridge can read and trigger the same deep-links without re-deriving readiness logic — directly consistent with this app's own established discipline of one canonical computation reused everywhere |

---

## Part G — UX Philosophy

### Recommendation: Hybrid — checklist-driven, with a compact dashboard-style summary header

Primarily **Concept C (Preflight Checklist)**, prefaced by a small
Concept-A-style summary strip (ship name, readiness ring, one-line status) for
an under-one-second glance, with a single Concept-B-style optional freeform
note folded in as one checklist row rather than the page's organizing
principle.

### Why

- **Purely informational** (a dashboard) fails "rapid decision making" —
  informational surfaces invite browsing, not deciding.
- **Purely interactive / "operational dashboard"** risks duplicating Mission
  Control's or Ship Management's job, which is explicitly what the Chief
  Architect Note warns against ("the goal is not another dashboard").
- **"Launch console"** implies real control-plane capability — actually
  launching the game — which a web app cannot do and should not imply.
- **Checklist-driven** matches the real-world preflight mental model
  directly, produces the clearest unambiguous go/no-go signal (serving
  "Commander confidence"), and structurally enforces "avoid duplication" and
  "minimal context switching" simultaneously: every unresolved item routes to
  exactly the one other page that already owns that fix, never more than one
  hop away.
- **The hybrid summary strip** serves "operational awareness" for a
  Commander who already knows their fleet and just wants the one-line
  answer, while the full checklist beneath serves the "confidence" need the
  moment something is actually wrong.

---

## Deliverables Recap

- **Workflow map** — Part A.1/A.2
- **Architecture document** — this document in full
- **Page responsibility matrix** — Part D
- **Three layout concepts** — Part E
- **Recommended direction** — Part G (Hybrid Checklist), canonical question
  in Part B
- **Future expansion notes** — Part F

## Scope Confirmation

No files under `src/`, `scripts/`, or `public/` were modified to produce this
document. `git status --short` was clean before this work began and contains
only this new document afterward.
