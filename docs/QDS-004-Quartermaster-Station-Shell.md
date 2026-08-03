# QDS-004 — Quartermaster Station Shell

**Classification:** Quartermaster Design Specification (Discovery)
**Priority:** Architectural Authority
**Implementation:** None
**Status:** Discovery Only — no production code, CSS, or refactoring was performed to produce this document.
**Authority:** [ADR-004](ADR-004-Quartermaster-Edition-Design-Language.md), [ADR-005](ADR-005-Operational-Command-Structure.md), [QDS-001](QDS-001-Quartermaster-Compartment-Framework.md), [QDS-002](QDS-002-Quartermaster-Operational-Vocabulary.md), [QDS-003](QDS-003-Officer-Briefing-Framework.md), [EWO-108](EWO-108-Flight-Commander-Quartermaster-Prototype-Zero.md)

---

## 0. One-Paragraph Summary

Every compartment today independently decides whether it has an environment at all, whether its header sits inside or outside that environment, whether the environment ends on a hard edge or fades, and whether supporting detail sits above or below the primary workspace — none of these are governed by a single shared rule, and three compartments (Fleet Dashboard, Hangar Inventory, Captain's Log) never establish an environment at all. That fragmentation is why Prototype Zero (EWO-108), despite measurably succeeding at every one of its own goals, still reads as a well-decorated page rather than a room: a single page's own polish cannot manufacture a *shared* threshold ritual, because a ritual only exists across repetitions. This document names that missing layer the **Station Shell** — the architecture that governs how a Commander arrives at, moves through, and departs any compartment, independent of what that compartment is for — and draws the line, at the architectural level, between what the shell owns everywhere and what each Station still owns for itself. Prototype Zero's own gaps (header placement, fade proportions, no threshold beat, no footer transition) are examined directly and found to be overwhelmingly missing authority, not implementation shortcuts — the justification for writing this document before any further page is touched.

---

## Part A — Discovery Review

Audited against six questions per compartment: where the Commander first visually enters, where compartment identity begins, where the operational briefing begins, where the environment ends, where the workspace begins, and where supporting intelligence begins — then judged intentional vs. accidental. Builds on, rather than repeats, QDS-001's own structural audit (hero mechanism, summary-card shape, empty-state shape) and EWO-108's own before/after record.

### A.1 Mission Control

| Question | Finding |
|---|---|
| Commander enters | Flush against the content column's own padding — no threshold beat, immediately readable text |
| Identity begins | The eyebrow/title, **outside** the hero (above `PageEnvironment`) |
| Briefing begins | The Fleet Status column, inside the hero's left glass panel |
| Environment ends | A hard edge — the hero's fixed `lg:min-h-[380px]` rectangle simply stops; the Quartermaster Report below sits on the plain page background with no transition |
| Workspace begins | Immediately below the hero — Priority Actions, then Quartermaster Report |
| Supporting begins | The Procurement Work Queue table, nested inside the Quartermaster Report |
| Intentional or accidental | **Mostly intentional** — the strongest current example short of Flight Commander — but the hard environment cutoff was never a considered decision; it is simply where the fixed-height box ends |

### A.2 Fleet Dashboard

| Question | Finding |
|---|---|
| Commander enters | Flush, header text only |
| Identity begins | The header — no environmental establishment exists at all (QDS-001 A.2: `'fleet-dashboard'` ships `enabled: false`) |
| Briefing begins | Never — no condition/summary layer distinct from the header exists (QDS-003 A.2) |
| Environment ends | N/A — never begins |
| Workspace begins | Immediately — Active/Retired toggle, then the grid/table |
| Supporting begins | Blended into the same grid; the Retired toggle functions as reference |
| Intentional or accidental | **Accidental.** Nothing in the codebase or its history suggests a considered decision to omit an environment here — it reads as a page never yet brought into the system, not a Station that deliberately chose none |

### A.3 Ship Management

| Question | Finding |
|---|---|
| Commander enters | Flush, header text only |
| Identity begins | The header, then — only once a ship is selected — `ShipHeroFrame`, a real ship photograph, structurally distinct from every other compartment's environment mechanism |
| Briefing begins | Inside the operational banner (readiness bar, missing-summary, category demand), once a ship is selected |
| Environment ends | A hard edge at the banner's own bottom — but this hard edge is **correct**, not accidental: a ship photograph is identity, not atmosphere (QDS-001 D.1 already drew this exact line) |
| Workspace begins | Commander Intent cards, then the shared port-tree table |
| Supporting begins | The Decision Summary panel — **above** the primary workspace, nested inside the banner itself, not below it |
| Intentional or accidental | **Mixed.** The photograph-not-environment distinction is deliberate and correct. The no-ship-selected state (zero spatial establishment of any kind before selection) and the Supporting-above-Workspace ordering are both accidental — nobody decided either, they are simply where the markup landed |

### A.4 Flight Commander (post-EWO-108)

| Question | Finding |
|---|---|
| Commander enters | Directly into a continuous 560px CIC environment spanning identity, condition, and instruments — the deepest threshold of any compartment today |
| Identity begins | **Inside** the environment, in its own dark band — the opposite convention from Mission Control, where identity sits outside |
| Briefing begins | The same dark band |
| Environment ends | The first and only **soft** transition in the app — a bottom gradient fade into the page background, rather than a hard rectangle |
| Workspace begins | Below the fade — sticky control rail, then the dossier list |
| Supporting begins | Blended into each dossier's own destination lines — no distinct supporting-intelligence region |
| Intentional or accidental | **Mostly intentional** — this was Prototype Zero's whole purpose — but the header-inside-the-environment choice was made because it suited this one compartment's own artwork, with no shell rule to consult either way. This is the single clearest piece of evidence for this document: two of the app's two full-environment compartments now disagree with each other on where identity begins, and nothing says which is correct |

### A.5 Hangar Inventory

| Question | Finding |
|---|---|
| Commander enters | Flush, header text only |
| Identity begins/ends | At the header text — no environmental establishment on the populated page (only inside the genuine-empty state) |
| Briefing/workspace | Filters, then straight into the table |
| Supporting begins | None distinct |
| Intentional or accidental | **Accidental** — the same finding as Fleet Dashboard, for the same reason |

### A.6 Decision Center

| Question | Finding |
|---|---|
| Commander enters | Flush, header text **outside** the bay (matching Mission Control's own convention, apparently by coincidence rather than a stated rule) |
| Identity begins | The header, then `EnvironmentBay` (bounded, not full-bleed) wrapping both the Loot Lookup and Item Assessment panels |
| Briefing begins | Inside the bay, once a lookup resolves — the verdict badge plus Fleet Demand/Inventory Position tiles |
| Environment ends | At the bay's own bounded edge — deliberately bounded, per QDS-001's "department room, not a whole-page command compartment" distinction, and correct for that reason |
| Workspace/supporting | Blended into the same panel — the domain is narrow enough that no separate region is needed |
| Intentional or accidental | **Mostly intentional** at the bay-boundedness level (a real, considered decision), but the header-outside-the-bay placement was never actually justified anywhere in writing — it happens to match Mission Control, not because a rule said so |

### A.7 Captain's Log

| Question | Finding |
|---|---|
| Commander enters | Flush, header text only |
| Identity begins | The header, then a **fourth**, wholly distinct mechanism — a small inline low-opacity `<div>` scoped to one card (the certification card), never the page |
| Briefing/environment | Never established at the page level |
| Workspace begins | Immediately — Certification card, Fleet Data card, then the timeline |
| Supporting begins | The timeline itself |
| Intentional or accidental | **Partially intentional.** The narrow-card-not-a-room decision was a real, documented choice (EWO-095B). The total absence of any page-level environmental establishment was never actually decided — a gap by omission, not a considered boundary |

### A.8 Cross-compartment finding

No two compartments answer all six questions the same way, and in several cases (header inside/outside environment, hard/soft environmental transition, supporting-above/below-workspace) the disagreement is not between "has a rule" and "doesn't" — it is between compartments each making a **different, locally-reasonable, never-reconciled** choice. This is the precise shape of the missing layer: not a missing primitive (QDS-001 already catalogued the primitives), but a missing **ordering authority** over how those primitives compose into one repeatable threshold ritual.

---

## Part B — Definition of the Station Shell

**What is a Station?** A compartment that answers exactly one operational question (ADR-004 §2) *and* that the Commander physically enters through the same threshold ritual every other Station uses — not a page that happens to display fleet data inside a themed wrapper. A Station is defined as much by *how it is entered* as by *what it answers*.

**What belongs to the shell?** The threshold ritual itself — the architectural sequence and rules that make *any* compartment read as a room aboard the flagship, independent of that room's job: the environment's presence and extent, the header's placement relative to it, the fade/cutoff strategy, the instrument-mounting rules, the control-rail-mounting rules, the workspace threshold, the supporting-intelligence placement, and the footer transition (Part D, in full).

**What belongs to the compartment (the Station itself)?** The operational judgment: what counts as a concern, what counts as a recommendation, what the workspace actually contains, what "nothing to report" looks like in this one domain (Part E). QDS-003 already drew this line for *reporting content*; this document draws the equivalent line for *spatial and structural* content.

**What belongs to the operational workspace specifically?** The domain-specific primary content (a port tree, a dossier list, a timeline, a procurement grid) — owned entirely by the Station, but *placed* by the shell. The shell says "the workspace begins here, in this position in the rhythm"; it never says what the workspace contains.

**The shell must exist independently of any named Station.** It is defined by answering Part A's six questions the *same way* for Mission Control, Flight Commander, Captain's Log, and every future Station — the same way a ship's hull plating, deck material, and lighting rig standards apply identically to the bridge, engineering bay, and cargo hold despite each housing completely different equipment.

---

## Part C — Commander Journey

```
Commander Enters Station
        ↓
Compartment Identity
        ↓
Operational Condition
        ↓
Mounted Briefing
        ↓
Mounted Instruments
        ↓
Operational Controls
        ↓
Primary Workspace
        ↓
Supporting Intelligence
        ↓
Standing Status
```

Adopted from the work order's own recommended sequence without reordering — Part A's audit found no evidence any different order would serve better, and QDS-003's own reporting grammar (below) independently converges on the same relative ordering for the layers it covers. **This is a rhythm, not a mandatory nine-region template** — exactly as QDS-003 Part B ruled for its own seven layers: a narrow-domain Station (Decision Center, Captain's Log) skips Mounted Instruments and Operational Controls entirely, and that omission is correct, not incomplete, when the domain has nothing to summarize or filter (ADR-004 §9: density from meaningful information, never decorative chrome).

**"Commander Enters Station" is new** relative to QDS-003's grammar — it names the perceptual beat *before* any text is even legible: the environment itself, its color temperature and depth, arriving before the Commander reads a single word. Part A's audit shows this beat is currently *silent* for three compartments (Fleet Dashboard, Hangar Inventory, Captain's Log) — the Commander's journey skips straight to reading text with no spatial arrival at all.

### C.1 Reconciling this sequence with QDS-003's reporting grammar

QDS-003 governs *what is said*; this document governs *where it physically sits and how the Commander arrives there*. The two compose rather than compete:

| QDS-004 (spatial region) | Hosts QDS-003 layer(s) |
|---|---|
| Compartment Identity | Station Identification |
| Operational Condition | Operational Condition |
| Mounted Briefing | Command Summary |
| Mounted Instruments | (no direct QDS-003 layer — a visual amplification of Command Summary's numbers) |
| Operational Controls | (no direct QDS-003 layer — hosts the affordances a Station needs to narrow its own Immediate Concerns/Primary Workspace) |
| Primary Workspace | Immediate Concerns and/or Recommended Action, when they live inline in the workspace itself (e.g. Ship Management's Decision Summary) |
| Supporting Intelligence | Supporting Intelligence |
| Standing Status | Standing Status |

---

## Part D — Shell Responsibilities

Owned by the shell everywhere, never duplicated inside an individual Station:

- **Compartment framing** — the outer bounding structure (edge treatment, corner radius) a Station renders inside.
- **Environmental composition** — presence, extent, position, and fade strategy of the environment mount (Part F).
- **Mounted briefing wall** — where Compartment Identity, Operational Condition, and Command Summary physically sit relative to the environment (resolving Part A.8's inside/outside disagreement is this document's first concrete deliverable for a future implementation EWO).
- **Structural transitions** — the hero→workspace boundary. EWO-108 proved a soft gradient fade is achievable without new artwork; this becomes the shell's default, not a per-Station experiment.
- **Mounted instrument zones** — where and how summary metrics physically mount (the recessed-housing/hairline/corner-tick language Prototype Zero discovered).
- **Operational control rail** — where and how filter/search controls physically mount, including sticky behavior during scroll.
- **Workspace threshold** — the literal line where atmosphere ends and task begins.
- **Footer transition** — how a compartment hands off to the global `AppFooter`. Currently ungoverned: QDS-001 already found no compartment has an "Operational Footer" in ADR-004's sense, and EWO-108 confirms Flight Commander's last dossier now sits immediately above the motto strip with zero transition treatment.
- **Environmental fade strategy** — hard-edge vs. gradient, and (open question, Part below) what governs a fade's proportions.
- **Edge treatment** — whether a Station receives an outer bordered frame. Inconsistent today: Mission Control and Flight Commander carry `lg:border`; the rest do not, with no stated rule either way.
- **Lighting language** — which zones of a piece of environment art are authored dark enough to mount content legibly without a heavy overlay. EWO-108 discovered this empirically (the CIC artwork's own dark left band); it should become a stated *constraint on future art commissions*, not a per-page discovery each time.

These responsibilities must never be reimplemented per-Station — every instance of a Station inventing its own fade height, its own border decision, or its own instrument housing is exactly the fragmentation Part A documents.

---

## Part E — Station Responsibilities

Remains owned by the Station itself — the shell places it, but never defines its content:

- **Mission Control** — fleet-wide readiness synthesis, priority ranking.
- **Fleet Dashboard** — comparative fleet browsing, ownership/lifecycle disposition.
- **Ship Management** — per-vessel maintenance and loadout authority.
- **Flight Commander** — target intelligence, the Standing Watch judgment itself (not its presentation shell).
- **Hangar Inventory** — warehouse quantitative ledger.
- **Decision Center** — single-item disposition analysis.
- **Captain's Log** — historical record-keeping, deliberately never interpretive.

**The shell owns presentation architecture. Stations own operational authority.** This is the same principle QDS-003 Part K already drew for reporting content (shared grammar/slots vs. domain judgment) and QDS-001 Part G drew for layout primitives (shell scaffold vs. domain content) — restated here a third time because it is the one rule every one of these documents converges on independently, which is itself evidence it is correct.

---

## Part F — Environmental Architecture

**The environment is not decorative artwork — it is physical architecture the workspace sits inside**, not a banner mounted above a separate "real" page. Investigated as such:

- **Bulkheads / walls** — the compartment's vertical bounding edges. Inconsistently expressed today (Part D's edge-treatment finding); should become a shell-level rule rather than a per-Station choice.
- **Ceiling** — the upper portion of a tall environment mount. Only ever exposed once in the app today: Flight Commander's EWO-108 extension, which revealed the CIC's overhead holo-displays for the first time. Proof that "ceiling" is real, available architectural information every other Station's environment mount is currently too short to ever show.
- **Deck / floor** — the same finding at the bottom: only the extended Flight Commander mount reveals floor-level light-strip detail.
- **Mounted displays** — the in-scene screens and holograms already present in commissioned artwork are purely decorative today; nothing in the UI ever reads them as information-bearing. A real future opportunity (Part K), not authorized here.
- **Lighting** — the dark-vs-lit zones within a single piece of artwork are not incidental; they are *where content is authored to mount* (Part D's lighting-language finding). This should constrain which environment art is approved for commission going forward, not be treated as a layout accident to work around after the fact.
- **Depth** — the fore/mid/background layering already present in the CIC artwork (floor in foreground, holotable in midground, wall displays in background) is what makes it read as a room rather than a flat backdrop. A flat, low-detail texture would not qualify as architecture under this shell, regardless of resolution.
- **Negative space** — the dark, low-detail region reserved for content must exist in any commissioned environment going forward, or the shell has nowhere safe to mount a briefing without a heavy, ADR-004 §9-violating overlay.
- **Transition into workspace** — the fade question. EWO-108 proved a soft gradient dissolve is achievable using only CSS and the existing artwork; this becomes the shell default (Part D).

### F.1 Architectural continuation vs. photographic extension

A single static image cannot extend indefinitely without becoming a low-detail smear, and dense workspace content (tables, dossiers, port trees) needs a stable, high-contrast background for information density (ADR-004 §9) — a photograph is the wrong material for that. The honest, sustainable position: the environment establishes the room **once**, at the top (Mounted Briefing + Mounted Instruments), then the room *continues* below that point not through more photography but through **material consistency** — the same dark base color, the same glass-panel language, the same accent-color temperature — so the workspace reads as *inside the same room the photograph established*, without needing the photograph to physically extend that far. This is why Prototype Zero's own gradient fade works: it is not concealing a seam, it is the literal moment the room's architecture stops being photographed and starts being rendered in the same material language instead.

---

## Part G — Mounted Architecture Primitives

Every candidate audited and classified — architectural ownership only, no implementation extracted (per the work order's own explicit instruction).

| Primitive | Classification | Basis |
|---|---|---|
| **Environmental Mount** | **Reusable shell primitive** — arguably the shell's central mechanism | The extend-and-fade technique itself (Part F) is content-agnostic; any Station's own environment art can use it |
| **Mounted Instrument** | **Reusable shell primitive** | The recessed-housing/hairline/corner-tick treatment is content-agnostic — any Station's own metrics can be housed this way |
| **Tactical Summary Instrument** | **Station-specific instance** of Mounted Instrument | Flight Commander's own four metrics and their exact definitions are this Station's content; the housing they sit in is the shared primitive above |
| **Quartermaster Glyph Housing** | **Reusable shell primitive** | The matched/unmatched boolean housing is content-agnostic — any icon from any existing taxonomy (`componentCategoryIcon.ts` or a future one) can sit inside it |
| **Operational Control Rail** | **Reusable shell primitive** | The sticky, recessed mounting bar is content-agnostic; the specific filters/search inside remain Station content |
| **Standing Report** | **Reusable shell primitive at the structural level** | The full-width panel that replaces the workspace, its monitoring-indicator treatment, and its calm tone are shared architecture; the exact copy is Station content (already governed by QDS-003 Part H) |
| **Tactical Dossier** | **Station-specific primitive**, with a future framework candidate underneath | Flight Commander's own domain shape (image + identity + matches + destinations) is not reusable as-is, but its underlying structure — identity block → detail blocks → destination links — may inform a future generic "Record Card" shell primitive once a second Station needs something similar |
| **Structural Divider** | **Future framework candidate, not yet confirmed** | Appeared once (Standing Watch's own internal rule separating its report body from its Intelligence Status list) — one instance is not enough evidence to call this a proven pattern yet |

---

## Part H — Structural Regions

| Region | Requirement | Basis |
|---|---|---|
| Station Threshold | **Required** | Part A.8's central finding — its silent absence in three compartments is exactly what reads as accidental rather than architectural |
| Mounted Briefing Wall | **Required** | Mirrors QDS-003's own finding that Operational Condition is the one layer always present |
| Command Instrument Zone | **Optional** | Mirrors QDS-001 Part C — only Stations with a genuine small set of headline numbers need one |
| Operational Control Rail | **Optional** | Only Stations with real filter/search need |
| Primary Workspace | **Required** | Mirrors QDS-001 Part C — every Station exists to let the Commander do something |
| Reference Intelligence | **Optional** | Mirrors QDS-001 Part C's "Supporting Workspace: Optional" |
| Administrative Footer | **Never permitted per-compartment** | The global `AppFooter` already owns this closure (QDS-001 Part E); a Station building its own footer-like closing region would create two competing "the report is over" signals |

**Additional never-permitted rules, drawn directly from Part A's evidence:**

- **A Station must never render more than one Mounted Briefing Wall** — Station Identification is singular, per QDS-003.
- **Reference Intelligence must never sit above Primary Workspace.** Ship Management's Decision Summary currently does exactly this (Part A.3) — flagged here as a concrete, evidenced violation of the rule this document is establishing, not a hypothetical one, and a specific migration target (Part M).
- **A Station must never fabricate an Environmental Mount it cannot sustain.** No environment is architecturally preferable to a low-detail placeholder that undermines Part F's "architecture, not decoration" premise.

---

## Part I — Transition Philosophy

The Commander should feel that they **walked into another compartment**, not that they opened another page — directly restating ADR-004 §1's own "walking through the ship" mandate, now made testable: a Commander moving between two Stations that both correctly implement this shell should recognize the *rhythm* (the same nine-step journey) while experiencing a *different room* (different artwork, different density, different content).

**What should remain continuous across every Station:**

- The sidebar itself — already global and persistent, this is the corridor the Commander always stands in between compartments, and the one piece of "walking the ship" the app already gets right today.
- The dark base material (`#071016`) and glass-panel language (`bg-panel/70`, backdrop blur) — the ship's own hull material, consistent regardless of which room it's cladding.
- The gold/cyan operational color authority (ADR-004 §6) — the ship's own signage language.
- Typography rhythm (blue eyebrow → white title, ADR-004 §7).
- The shell rhythm itself (Part C) — so a Commander's scan pattern transfers between Stations even though each room's contents differ.

**What should intentionally change:**

- The environment artwork itself — each Station is a physically different room.
- The color temperature/lighting mood that artwork carries.
- The workspace content's shape (a port tree is not a timeline is not a dossier list).
- The density level the Station currently needs (QDS-003 Part G).

---

## Part J — Relationship to Navigation

The left navigation remains authoritative and unmodified — this section defines only where the shell begins immediately after it, per the work order's own explicit boundary.

- **Alignment.** The sidebar's own top edge (brand mark) and the Station Threshold's own top edge currently sit at roughly the same vertical position for every route — an accidental consistency worth making an explicit rule: entering *any* Station should read as "the same distance into the ship," regardless of which door was taken.
- **Threshold.** The main content column begins immediately adjacent to the sidebar with no deliberate buffer today — today's padding is content padding, not an authored threshold zone. Whether a Station Threshold needs a *new visible* buffer, or is satisfied purely by the environment's own presence starting immediately, is recorded as an open question below rather than decided here.
- **Framing.** The sidebar's own edge should read as a bulkhead the Commander passes *through* on the way into a compartment — a real architectural threshold, a doorway — not a UI panel divider competing for attention with the compartment beyond it.
- **Environmental continuity.** A Station's own environment should **not** visually bleed toward the sidebar. This is a deliberate asymmetry with Part F's own softened hero-to-workspace transition: transitions should soften *within* a Station's own vertical flow, but the sidebar/content boundary should stay crisp, because it is a genuine threshold (a doorway), not a seam to disguise.

---

## Part K — Future Framework Boundary

**Potential shared shell primitives** (per the work order's own candidate list, confirmed against Part G's classification):

- `StationShell` — the outer contract: threshold, environment, fade, and region-ordering rules together.
- `StationBriefing` — the Compartment Identity + Operational Condition + Command Summary region.
- `MountedInstrument` — the housing primitive (Part G).
- `OperationalRail` — the control-rail primitive (Part G).
- `StandingReport` — the structural shell for a Station's "nothing to report" state (Part G).
- `WorkspaceTransition` — the fade/cutoff mechanism as a reusable technique (Part F).
- `EnvironmentalMount` — the extend-and-fade primitive (Part F/G).

**Remains non-shared, permanently Station-specific:**

- Dossier layouts (Flight Commander) — domain content, not a container shape.
- Maintenance trees (Ship Management) — the port tree's own structure is inseparable from its domain.
- Procurement grids (Hangar Inventory) — a domain-specific tabular shape.
- Historical timelines (Captain's Log) — chronological record structure, unique to this Station's job.

Same reasoning pattern QDS-001 Part G and QDS-003 Part K already established: the shell owns the shape of the container the Commander walks into; it never owns what a given room's own equipment looks like.

---

## Part L — Prototype Zero Lessons

Using Flight Commander (EWO-108) as the case study, per the work order's explicit instruction to distinguish **implementation shortcomings** from **missing architectural authority**. The test applied to every item below: *if a future engineer redoing this page again, with unlimited care and no time pressure, could not have arrived at a different or better answer without a Chief-Architect-level ruling, it is missing authority; if they could have simply tried harder or iterated further within the existing rules, it is an implementation shortcoming.*

### What successfully advanced Quartermaster Edition

- **Continuous environment extension** — proved an environment can extend well past a conventional hero band using only the existing artwork, with no new art commission.
- **Mounted-instrument housing language** — proved a physically-mounted feel is achievable without floating generic dashboard cards.
- **Sticky control rail replacing a sticky table header** — proved the *operational requirement* (persistent context during a long scroll) can survive dropping a specific implementation detail (the table itself), a genuinely reusable lesson for any future migration that also wants to leave rigid table markup behind.
- **Standing Watch as a first-class report** — proved QDS-003's Standing Report grammar is directly implementable exactly as specified, copy and all.
- **A real, previously invisible app-wide gap was found and fixed as a side effect** — no `prefers-reduced-motion` rule existed anywhere in the stylesheet before this one page's redesign surfaced it. Single-Station prototyping has genuine value beyond the page it touches.

### What still felt like Beta 2.1 — and why

| Observation | Test result |
|---|---|
| The Station Briefing Header now sits *inside* the environment, opposite Mission Control's outside-the-hero convention | **Missing architectural authority.** No shell rule existed to consult either way; EWO-108 made a reasonable, unvalidated, page-local choice |
| The bottom fade is a hardcoded CSS value (`h-28 lg:h-40`) with no stated contract for what governs a fade's proportions | **Missing architectural authority.** Nothing defines how a Station should end its environment, so ad hoc numbers were the only option |
| Standing Watch, while excellent in isolation, still reads as "a panel that replaces the table" rather than "the room settling into a different, equally-inhabited state" | **Missing architectural authority.** No shell-level concept of a Station having multiple standing spatial states exists yet; every future Station would have to reinvent this from scratch |
| No Station Threshold beat exists — the Commander arrives directly at readable text, with no distinct "arrival" moment separate from "here is the briefing" | **Missing architectural authority.** Part H's own Station Threshold region did not exist as a named concept before this document |
| `AppFooter` still reads as a plain website footer immediately below the last dossier, with zero transition treatment | **Missing architectural authority.** Part D's own "footer transition" responsibility was never defined anywhere EWO-108 could have consulted it |
| The dossier cards are dense and functional but still read closer to "refined table rows" than to "tactical objects mounted in the room" | **Mostly missing authority, partially a shortcoming.** No shell vocabulary exists for how workspace content itself should be framed within a room (distinct from Mounted Instruments/Control Rail) — but some further iteration within Prototype Zero's own existing scope may also have been possible |

**Conclusion:** the overwhelming majority of what still feels like Beta 2.1 in Flight Commander today is missing architectural authority, not implementation debt Engineering left on the table. This is the direct justification for writing the Station Shell now, in writing, before any further compartment is touched — exactly the Chief Architect's own framing that Prototype Zero was "a successful experiment that revealed a missing architectural layer," not a failed redesign.

---

## Part M — Migration Strategy

The work order's own suggested order (Shell → Mission Control → Ship Management → Hangar Inventory → Decision Center → Captain's Log → revisit Flight Commander) is adopted with one refinement: it omits Fleet Dashboard. QDS-001 Part H already reasoned through Fleet Dashboard's own position in detail — least existing framework infrastructure *and* highest Commander traffic, therefore highest regression risk, therefore converted only once every other pattern is proven — and nothing found in this document weakens that reasoning. Fleet Dashboard is reinserted immediately before the Flight Commander reconciliation pass.

**Recommended full order:**

```
0. Build Station Shell (this document -> a future implementation EWO)
        |
1. Mission Control        (closest existing conformance, lowest risk, XO speaks first per ADR-005)
        |
2. Ship Management         (most action-dense; also resolves the Reference-Intelligence-
        |                    above-Workspace violation found in Part A.3)
        |
3. Hangar Inventory        (simple; shares filter pattern already ~90% identical to
        |                    Fleet Dashboard's own, per QDS-001 D.3)
        |
4. Decision Center         (already partially on the framework via EnvironmentBay)
        |
5. Captain's Log           (closes the missing-empty-state gap using a now-mature shell)
        |
6. Fleet Dashboard         (highest traffic, least existing infrastructure -> highest
        |                    risk -> converted only last among the six, per QDS-001 Part H)
        |
7. Revisit Flight Commander (reconcile header placement against whatever Part D.1's
                             final ruling becomes, apply the now-governed fade/threshold/
                             footer-transition rules, and resolve QDS-002 C.3's still-open
                             "Standing Watch" header-text question while already here)
```

Step 7 is deliberately last, not first — Prototype Zero's job was to *discover* the shell's requirements, not to be the shell's first correct implementation. Re-treating it only after six other Stations have proven the shell out is the same risk-minimization logic QDS-001 already applied to Fleet Dashboard, applied here to the one Station most likely to have accumulated page-specific assumptions during its own prototyping phase.

---

## Open Questions and Future Candidates

1. **Header inside vs. outside the environment** — Mission Control and Flight Commander disagree today (Part A.8); the Station Shell's first concrete ruling should resolve this one way for every future Station.
2. **Fade proportion contract** — should a Station's environmental fade be a fixed value, a percentage of the mount's own height, or driven by the content that follows it?
3. **Reference Intelligence above Primary Workspace** — Ship Management's current ordering violates Part H's own proposed rule. Grandfather it until Step 2 of the migration, or correct it immediately as a standalone fix?
4. **Does Station Threshold need a new visible element**, or is it satisfied purely by the environment's own presence starting immediately at the content column's edge?
5. **Should in-scene mounted displays** (holo-screens, wall displays already present in commissioned artwork) ever become literal information-bearing UI overlays, or should they remain permanently atmospheric?
6. **How should the shell handle a Station with no viable environmental art yet** — a legitimate, likely near-term-common condition during migration. A neutral default treatment, or explicit permission to omit Environmental Mount for a transitional period without that reading as a defect?
7. **Does `ShipHeroFrame`** (a ship photograph — identity, not atmosphere, per QDS-001 D.1) **get its own shell contract**, or does it remain explicitly outside the Station Shell's authority, as QDS-001 already ruled?
8. **Should `AppFooter` eventually gain a per-compartment-aware transition treatment** (Part D's own still-undefined "footer transition" responsibility), or does it stay a pure global element with no Station awareness forever?

---

## Commander Acceptance Criteria — Self-Check

- **What transforms a page into a Station?** Part B — a shared threshold ritual entered the same way regardless of the room's job, not the room's own decoration.
- **Where does Quartermaster Edition actually begin?** Part C's "Commander Enters Station" beat — the environment itself, arriving before any text is legible; currently silent in three compartments (Part A.8).
- **Which responsibilities belong to the shell?** Part D's eleven items, none of which may be reimplemented per-Station.
- **Which belong to the Station?** Part E — operational judgment and domain content, placed by the shell but never defined by it.
- **How should every Station be entered?** Part C's nine-step rhythm, an information hierarchy rather than a mandatory nine-region template (mirroring QDS-003's own omission rule).
- **How does environment become architecture instead of decoration?** Part F — bulkheads, ceiling, deck, depth, and negative space as real, auditable properties of commissioned art, plus Part F.1's material-continuation principle for where photography itself cannot reach.
- **Which Prototype Zero discoveries become reusable?** Part G's classification table — Environmental Mount, Mounted Instrument, Glyph Housing, Operational Control Rail, and Standing Report all confirmed as reusable shell primitives; Tactical Dossier and Structural Divider held back as Station-specific or unproven.
- **How should Quartermaster Edition now evolve?** Part M's seven-step order, with Prototype Zero's own reconciliation deliberately placed last, not first.

All eight answerable without reading a single line of implementation code.

---

## Non-Goals — Confirmation

No React components were built. No CSS was written or modified. No files were refactored or extracted. No navigation was redesigned. No typography was changed. No artwork was generated. No business/operational authority (any resolver, any calculation, any Station's own domain logic) was altered. No Station was renamed. No animation system was introduced. No additional officer roles were invented. `git status --short` contains only this new document.
