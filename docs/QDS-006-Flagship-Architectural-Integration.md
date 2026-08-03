# QDS-006 — Flagship Architectural Integration

**Classification:** Quartermaster Edition Architecture
**Priority:** Critical Design Foundation
**Status:** Discovery Only — no production code, artwork, or prototypes were produced.
**Authority:** ADR-004, ADR-005, QDS-001, QDS-003, QDS-004, QDS-005

---

## 0. One-Paragraph Summary

Quartermaster Edition has, until this document, been built on two independently-discovered mental models that were never explicitly reconciled: ADR-005's own "officers reporting to the Commander" (a *chain of command* framing) and QDS-001/QDS-004's own "compartments the Commander walks through" (a *physical space* framing). Both are correct, and both are incomplete alone. This document merges them into one hierarchy — **Flagship → Station → Officer → Workspace** — and uses it to answer the question no prior document could fully answer: where does the *application* end and the *ship* begin? The honest audit finding is that today's real "Flagship layer" is minimal (a sidebar, a footer, a dark background color) — everything else that makes Flight Commander feel like a room is Station-local, built once, and not yet shared. The second major finding is a vocabulary correction the whole team should retire: environment art has been treated as a *Hero image* — a banner with a defined start and end — when it should be treated as a *window into a continuing architectural space* that the interface sits inside, not below. Both findings reframe every future Station migration, and QDS-005's own baseline is used throughout as the one already-certified proof that this model works in practice.

---

## Part A — The Flagship Layer

**What exists above every Station today, audited as it actually ships — not as intended:**

| Element | Persistent today? | Evidence |
|---|---|---|
| Sidebar (`Sidebar.tsx`) | ✅ Yes | Rendered once in `App.tsx`, outside the routed `<Suspense>` boundary — never remounts between Stations |
| `AppFooter` | ✅ Yes | Same — rendered once in `App.tsx`, already documented as "a global element, not a per-compartment one" (QDS-001 Part E) |
| Dark hull color (`#071016` / `bg-bg`) | ✅ Yes | Set on `App.tsx`'s own outer `<div>`, so it is the base material behind every Station regardless of what that Station renders on top of it |
| Everything else — lighting language, deck texture, ambient architecture, ceiling structure, bulkhead *material* (as opposed to bulkhead *position*) | ❌ No | Each Station either builds its own (Flight Commander's environment) or has none at all (Fleet Dashboard, Hangar Inventory, Captain's Log) |

**The honest finding:** the Flagship layer that exists today is bookend chrome, not felt architecture. It reliably tells the Commander "you are still aboard the same ship" through position and persistence (the sidebar never moves, the background never changes color) — but it does not yet look, materially, like it belongs to the same vessel as Flight Commander's CIC. This is named here as a real gap, not silently fixed — Non-Goals forbid modifying code or navigation in this EWO.

**Where does the Station begin? Where does the Flagship ends?** Today, cleanly, at the sidebar's own right edge — QDS-004 Part J already found this boundary correctly crisp (a bulkhead, not a seam to soften) and this document reaffirms rather than revisits that finding. The Station begins at the content column's own top-left corner, immediately adjacent to the sidebar, with no buffer zone.

**Viewport philosophy — the one genuinely new question this document adds:** the browser viewport should be understood as a **porthole**, not a boundary. What renders is a fragment of a larger vessel that is never fully shown — a Station's environment plate is a window into one compartment of a ship that keeps going in every direction the frame doesn't reach. This is not a literal engineering requirement (nothing needs to "render" beyond the viewport) — it is the composition discipline that should govern every future environment art commission (Part F formalizes this).

**Deck transition:** none is needed. QDS-004 Part J already reasoned that the sidebar/content boundary is a genuine architectural threshold (a doorway) and should stay crisp; transitions belong *within* a Station's own vertical flow (QDS-004 Part F.1's fade-into-background technique), never at the Flagship/Station seam itself. This document does not reopen that finding.

---

## Part B — Station Threshold

**The reframed model:** Navigation → Bulkhead → Station, never Navigation → Page.

This is not a new animation or transition effect (explicitly out of scope — no motion systems are proposed anywhere in this document). The "bulkhead" is achieved by two things already true today, now named as a pair rather than two coincidental facts:

1. **The Flagship layer holds perfectly still.** The sidebar does not move, fade, or reload between Stations — proving, wordlessly, that the Commander never left the ship, only the room.
2. **The Station's own Threshold paints first and completely**, before any Station-specific content is legible — EWO-111's Flight Commander is the one place this is fully realized today: the environment (including its own literal bulkhead doorway) is present at first paint, with the briefing content mounted inside it rather than above it.

A Station with no environment at all (Fleet Dashboard, Hangar Inventory, Captain's Log today) skips step 2 entirely — the Commander arrives at legible text with no spatial arrival beat first. This is the same finding QDS-004 Part A.8 already made; QDS-006 restates it specifically as a **bulkhead failure**, not merely a missing decoration: without it, the transition reads as Navigation → Page for those three Stations specifically, regardless of how correct the Flagship layer's own persistence is.

---

## Part C — Persistent Flagship Elements

Evaluated against one filter: *does this element strengthen immersion, or is it decoration for its own sake?*

| Candidate | Status | Reasoning |
|---|---|---|
| Flagship identity (SFM hex-badge + wordmark) | ✅ **Already correct, keep as-is** | Already persistent, already reads as the vessel's own identity mark, not a corporate logo |
| Bulkhead framing (the sidebar's own edge) | ✅ **Already correct, keep as-is** | QDS-004 Part J's own finding — a crisp boundary is the correct threshold, not a gap to close |
| Station designation (a flagship-level "you are here" readout, distinct from each Station's own `CompartmentHeader`) | 🔶 **Real gap, future candidate** | The sidebar highlights the active nav item today, but there is no flagship-level compartment readout independent of the Station's own header — worth considering, not yet built |
| Command clock (a ship's-time / mission-time readout) | 🔶 **Genuinely new idea, future candidate** | Introduced by this work order, not present in any prior QDS document. Compelling — ties directly to ADR-005's Commander framing — but unbuilt and unevaluated for feasibility; recorded as a candidate, not a recommendation |
| Deck plating (a literal shared floor texture) | 🔶 **Future candidate, not required** | Would need to unify the sidebar's own material with each Station's own floor without becoming decorative for its own sake — a real design exercise, not a quick win |
| Shared ambient lighting / glow | 🔶 **Future candidate, not required** | Same caution as deck plating — QDS-005 §8 already found the *existing* Flight Commander plate's own lighting already reinforces the UI's color discipline without any added Flagship-layer lighting effect; adding one risks competing with that already-working alignment rather than strengthening it |
| Ceiling structure | ❌ **Not a Flagship-level element** | Ceiling is a property of a specific compartment's own environment art (QDS-005 §1's depth model), never something the Flagship layer itself renders — stays Station-specific by nature |
| Ambient architecture (generic) | ❌ **Too vague to evaluate** | Not a concrete enough candidate to judge against the strengthens-immersion filter; would need a specific proposal first |

---

## Part D — Station-Owned Elements

Every Station retains its own identity within the shared Flagship. Concretely, per the Officer/Station model (Part A/E), using only real, currently-shipped compartments:

| Officer (ADR-005) | Station(s) they staff | What is Station-owned |
|---|---|---|
| Executive Officer | Mission Control | Fleet-wide readiness synthesis, Priority Actions, the Quartermaster Report's own content |
| Quartermaster | Fleet Dashboard, Ship Management, Hangar Inventory, Decision Center | Four *different rooms*, one officer role — each Station's own domain content (the ship grid, the port tree, the inventory ledger, the verdict panel) stays local to that one room even though the same officer staffs all four |
| Flight Commander | Flight Commander | Target intelligence, the Tactical Dossier, the Standing Watch judgment |
| Yeoman | Captain's Log | The historical record, deliberately non-interpretive |

**The clarification this document adds:** "Officer" and "Station" are two different axes, not synonyms. A Station is the *room*; an Officer is the *role* stationed there. One officer can staff several rooms (the Quartermaster staffs four), but each *room* has exactly one owning officer voice — never two officers sharing one Station, never one Station without a clear officer. This resolves a latent ambiguity in how QDS-003 and QDS-004 each used "Station" slightly differently (QDS-003 sometimes meant the officer's whole reporting apparatus; QDS-004 always meant the physical compartment) — going forward, "Station" means the room, full stop.

**A naming note, not a renaming directive:** the Chief Architect's own closing remarks use "Captain's Ready Room" and "Logistics Control" as illustrative future Station names. Neither exists today. **Captain's Log is unchanged and is not being renamed** — these are examples of the *naming pattern* (evocative, naval, specific) a future new Station should follow, exactly as EWO-110 Part D's own illustrative `CompartmentHeader` examples were copy patterns, not copy changes.

---

## Part E — Navigation Philosophy

**Confirmed, not revised:** navigation represents walking between Stations, never browsing software pages — ADR-005's own founding premise, now given firmer ground by the Flagship model rather than superseded by it.

- **Hierarchy:** the sidebar's own order (Executive Officer → Quartermaster → Flight Commander → Yeoman, per ADR-005) already encodes a reporting chain, not a feature list or alphabetical order. Under the Flagship model this reads even more literally: choosing a nav item is choosing which officer to walk to next, not which menu item has the feature you want.
- **Reporting chain:** unchanged from ADR-005 — restated here because the Flagship model is what finally makes it *architectural* rather than merely aspirational copy. A reporting chain expressed only in prose is a philosophy; a reporting chain the Commander physically walks through Station by Station is architecture.
- **Commander mental model:** "which officer do I need right now," never "which page has the button I want." This is the single sentence every future Station's own navigation entry, copy, and placement should be checked against.

No change to the sidebar's own implementation is proposed or authorized here (Non-Goals).

---

## Part F — Architectural Continuation (the central finding)

**Retire the word "Hero."** Every environment plate integrated so far — including Flight Commander's own certified baseline (QDS-005) — has still been engineered as a banner: a defined region with a top and a bottom, above content that begins where the banner ends. Even EWO-111's genuine improvement (a taller mount revealing a real doorway, a gradient fade instead of a hard cutoff) is a *better banner*, not yet a different concept.

**The desired model:** an environment plate is a **window into a room that keeps existing whether or not the frame currently shows it.** The interface — instruments, dossiers, panels — is furniture inside that same room, viewed through the same window, not a second layer of "content" that starts once the "hero" has finished.

**Explicit guidance, discovery-level (no implementation authorized):**

1. **Art commissioning brief, going forward:** describe every future environment plate as *"a window into a compartment,"* never *"a page banner."* The composition itself should imply the room continues past all four edges of the delivered frame — exactly the property that made Flight Commander's V2 plate (EWO-111) usable for a real threshold: the doorway is cropped by the frame, not concluded by it.
2. **The gradient fade is not a banner ending — it is depth.** QDS-004 Part F.1's "architectural continuation vs. photographic extension" principle is retroactively reframed under this model: the fade doesn't mark where the hero stops, it's the visual equivalent of the room continuing into shadow, further from the window, exactly where a real compartment's own lighting would naturally fall off.
3. **Workspace content below the fold is still inside the room.** QDS-005 §9's two-material system (glass near the window, flat panel further inside) is the mechanism that sustains this illusion once the literal photograph can no longer reach — furniture near a window looks different from furniture in a room's back corner, but it's still the same room.
4. **Boundedness is not banner-thinking.** A small compartment (Decision Center's own `EnvironmentBay`) is not a lesser version of a full CIC — a real ship has small rooms too. What matters is that even a bounded room is composed as a real, continuing space at its own scale, not a flat texture swatch. QDS-001's own full-bleed/bounded distinction (Part D.1) remains correct and is not revised here.
5. **"Environmental Mount" (the Shell's own component name, QDS-004/EWO-109) is the correct ongoing term.** Nothing about its implementation needs to change for this reframing — what changes is how the *team thinks* about what it's mounting: a window, not a banner.

---

## Part G — Shared Structural Language

A single glossary, consolidating vocabulary QDS-004, QDS-005, and EWO-110 each already established independently — restated here once, at the Flagship level, as the canonical reference:

| Term | Meaning | Where it lives |
|---|---|---|
| **Bulkhead** | A real architectural threshold — the sidebar's own edge (Flagship-level) or a Station's own doorway, when its art contains one (Station-level) | Flagship layer; Station environment art |
| **Mounting rail** | The sticky, recessed mechanism that keeps a control surface "in reach" during a long scroll | `OperationalRailMount` (Shell) |
| **Glass** | `bg-black/2X-3X backdrop-blur-md` — anything mounted *in front of* the environment's own atmosphere | Station Kit components (`MountedInstrument`, the control rail) |
| **Compartment panel** | `bg-black/25`, no blur — anything resting *below* the environment, on the page's own flat background | Station-owned content (dossiers, standing/exception panels) |
| **Corner treatment** | The small structural corner-tick decoration marking a housing as mounted equipment, not a plain box | `MountedInstrument`, `QuartermasterIconHousing` (Kit) |
| **Environmental depth** | The four-layer composition (foreground/midground/background/threshold plane) that makes a plate read as a room, not a texture | QDS-005 §1 |
| **Divider philosophy** | A seam that fades at its own edges (bulkhead language), never a flat HTML `<hr>` | `StructuralDivider` (Kit) |
| **Workstation rhythm** | The fixed grid cadence (`grid-cols-2 gap-2.5`) a Station's own mounted instruments follow | `MountedInstrumentRegion` (Shell) + `MountedInstrument` (Kit) |

---

## Part H — Environmental Ownership

A strict four-tier chain, no ambiguity:

```
Environment
    ↓
Shell
    ↓
Station Kit
    ↓
Officer Workspace
```

| Tier | Owns | Never owns | Real example |
|---|---|---|---|
| **Environment** | The raw art asset and its presentation config (opacity/brightness/position) | Layout, spacing, or any component | `environmentAssets.ts`, `PageEnvironment` |
| **Shell** | Spatial regions that mount things *into* the environment — where a region sits, how tall, how it fades | Content, copy, business logic | `src/components/stationShell/` |
| **Station Kit** | Reusable presentation components that fill Shell regions — a card's housing, a banner's tone, a divider's shape | Business logic, domain vocabulary, any specific Station's own copy | `src/components/stationKit/` |
| **Officer Workspace** | Everything genuinely domain-specific — the Tactical Dossier, the port tree, the historical timeline, the verdict panel | Its own visual housing (must compose Shell/Kit, never reimplement their treatments) | `src/pages/flightCommander/SourceVesselDossier.tsx` and equivalents |

**The rule each boundary enforces**, stated once, applying downward through all four tiers: *a lower tier composes the tier above it; it never reimplements what the tier above already provides.* EWO-110's own Flight Commander migration is the existing, tested proof this rule is achievable in real code, not just in principle — three of its own components were rewritten specifically to compose Kit primitives instead of duplicating their housings, with verified zero visual drift.

---

## Part I — Prototype Sketches

Conceptual only — no component was built or modified to produce these.

**Current architecture (Hero → Content):**

```
┌────────────────────────────────────────────┐
│ Sidebar │ Compartment Header                │
│ (fixed) │ ┌──────────────────────────────┐  │
│         │ │      Hero Image Banner        │  │
│         │ │   (begins here, ends here)    │  │
│         │ └──────────────────────────────┘  │
│         │ Content (cards / table / list)    │
│         │ ...................................│
│         │ Footer                            │
└────────────────────────────────────────────┘
```

**Desired architecture (Flagship → Station → Officer → Workspace):**

```
FLAGSHIP  (persistent — sidebar corridor, dark hull, footer)
   │
   ▼
STATION THRESHOLD  (bulkhead — the Commander has arrived somewhere real)
   │
   ▼
STATION  (the compartment — a window into a continuing room,
   │       not a banner with a start and an end)
   │
   ├──▶ OFFICER   (the briefing wall — who is reporting, condition, summary)
   │
   └──▶ WORKSPACE (the officer's own tools — furniture in the same room,
                    same material language, never a separate "content zone"
                    that begins where the window supposedly ends)
   │
   ▼
(Commander returns to the Flagship corridor, walks to the next Station)
```

**Mission Control, mapped onto the desired model (illustrative only — no implementation):**

```
Today:            Header (outside hero) -> Hero -> Fleet Status column ->
                  Priority Actions -> Quartermaster Report

Desired:          Threshold -> Station (window into the Bridge) ->
                  Officer (XO briefing wall, header now INSIDE the window,
                  resolving QDS-004's own still-open header-placement
                  question) -> Workspace (Priority Actions +
                  Quartermaster Report, same room, greater depth)
```

---

## Part J — Migration Impact

Re-estimated for every Station now that the Flagship model — specifically Part F's reframing — is understood. Builds on, and in three cases revises, EWO-109's own Part I assessment.

| Station | Prior estimate (EWO-109) | Revised estimate | What changed |
|---|---|---|---|
| **Flight Commander** | Reference (done) | **Done — the baseline itself** | No change; QDS-005 is the certified proof |
| **Mission Control** | Medium (2 gaps: header placement, partition-shaped instruments) | **Medium, unchanged** — plus one new open question | Does Mission Control's existing certified plate compose as a *window* (Part F) or only as a well-executed banner? Needs a direct art review before implementation — not yet answered |
| **Hangar Inventory** | Low (shell-ready, no art) | **Low shell-readiness, but art commissioning is now a named prerequisite** | No environment exists today; under Part F, a new commission must be briefed as "a window," not "a banner," from the very first draft — a new, explicit dependency Part I (EWO-109) didn't yet have language for |
| **Fleet Dashboard** | Highest risk (least infrastructure, highest traffic) | **Unchanged, same new art-commissioning dependency as Hangar Inventory** | Same reasoning — no existing plate to evaluate at all |
| **Decision Center** | Medium-High (bounded `EnvironmentBay` variant gap) | **Unchanged** | Part F.4 confirms boundedness itself is not the problem — the existing bounded bay still needs its own Threshold/Continuation treatment at its own scale, a real but not fundamentally new gap |
| **Ship Management** | High (photo hero, fundamentally different mechanism) | **Unchanged** | `ShipHeroFrame` remains explicitly outside Environmental Mount authority (QDS-001 D.1, reaffirmed) |
| **Captain's Log** | Low for one opportunity (`StandingReportRegion` closes the empty-state gap); no environment, by design | **Same low-risk opportunity stands — plus one new, genuinely open question** | QDS-001 D.1 ruled a narrow card "is not a room." Under the Flagship model's own "every Station is a real compartment" logic, should Captain's Log eventually receive a small, real environment (a Yeoman's records office) rather than remain environment-free permanently? Recorded here as an open question for the Chief Architect, not a recommendation — reversing an earlier ruling is not this document's call to make unilaterally |

---

## Open Questions

1. Does Mission Control's own existing, certified environment plate already compose as a "window" under Part F, or does it need a new commission before Mission Control can migrate?
2. Should Captain's Log's long-standing "not a room" ruling (QDS-001 D.1) be revisited under the Flagship model's own logic, or does a records-office metaphor genuinely not need a window the way an operations room does?
3. Are Station Designation and Command Clock (Part C) worth prototyping as real Flagship-layer elements, or do they risk becoming decoration despite passing the immersion filter on paper?
4. Should Fleet Dashboard's and Hangar Inventory's new art commissions be sequenced *before* their own shell/kit migration work, given Part F now makes the art itself a named dependency rather than a parallel, independent task?

---

## Commander Acceptance — Self-Check

Someone unfamiliar with Strategic Fleet Manager, reading only this document, should be able to state back:

- **Quartermaster Edition is not a UI skin.** It is Part A/H's own four-tier ownership chain — Environment, Shell, Station Kit, and Officer Workspace — each with a strict, enforced boundary, not a decorative theme applied on top of a conventional app.
- **The application is a ship, not a website.** Part E's own reframing: navigation is walking between Stations to consult officers, never browsing pages for features.
- **A Station is a room; an Officer is who's stationed there.** Part D's own clarification of two previously-conflated axes.
- **Environment art is a window, not a banner.** Part F's own central, vocabulary-level correction — the single most consequential finding in this document for every future Station's own art commission.

If those four statements land clearly, this document has done its job.

---

## Non-Goals — Confirmation

No code was modified. No Station was migrated. No navigation was redesigned. No artwork was generated or commissioned. No prototype component was built — Part I's diagrams are text only. `git status --short` contains only this new document.
