# ADR-004 — Quartermaster Edition Design Language

**Strategic Fleet Manager Beta 2.1+**
**Chief Architect Draft**
**Status: Proposed Foundation**

## Purpose

Quartermaster Edition is no longer a visual polish effort.

It is the long-term design language for Strategic Fleet Manager.

Beginning with Flight Commander, every operational compartment will
gradually transition toward this architecture. The goal is not to
redesign every screen during Beta 2.1, but to establish a coherent visual
and interaction language that future work will inherit.

This document defines those rules.

---

## 1. Design Philosophy

Strategic Fleet Manager is not a collection of application pages.

It is the operational software aboard a flagship.

Every screen represents a real compartment with a single operational
responsibility.

The Commander should feel as though they are walking through the ship
rather than navigating menus.

Every design decision should reinforce that illusion.

## 2. Compartments, Not Pages

Each compartment answers exactly one operational question.

| Compartment | Operational Question |
|---|---|
| Mission Control | Operations Standing By |
| Fleet Dashboard | The Fleet Is At Your Command |
| Ship Management | Select Vessel For Maintenance |
| Flight Commander | Target Intelligence Available |
| Hangar Inventory | Warehouse Inventory Available |
| Decision Center | Mission Assessment Available |
| Captain's Log | Recent Fleet Activity |

No compartment should drift into another's responsibility.

## 3. Environment First

Hero artwork is structural.

It is never wallpaper.

Every environment establishes:

- physical location
- lighting
- visual hierarchy
- operational atmosphere

Future artwork should depict believable military spaces rather than
abstract science-fiction illustrations.

## 4. Architectural Layout

Every compartment follows the same visual hierarchy.

```
Compartment Identifier
Operational Status
────────────────────────────
Hero Environment
Mounted Operational Cards
────────────────────────────
Primary Workspace
────────────────────────────
Supporting Detail
```

The Commander should immediately recognize where important information
resides without relearning each page.

## 5. Mounted Information

Information should appear physically mounted within the compartment.

Avoid floating cards whenever possible.

Preferred treatments include:

- recessed panels
- structural frames
- embedded workstations
- mounted displays

This reinforces the feeling that information belongs to the room.

## 6. Operational Color Authority

| Color | Meaning |
|---|---|
| **Blue** | Navigation, Analysis, Information, Systems |
| **Green** | Operational, Ready, Available, Healthy |
| **Quartermaster Gold** | Command attention, Strategic importance, High-value intelligence, Recommended actions |
| **Red** | Critical, Failure, Immediate intervention |
| **Gray** | Structure, Supporting information, Background |

Colors are never decorative.

Every color carries operational meaning.

## 7. Typography

```
Blue compartment identifier
        ↓
White operational status
        ↓
Quartermaster Gold only when emphasizing strategic value
```

Typography should remain restrained.

Hierarchy comes from spacing and weight rather than excessive size.

## 8. Motion

Quartermaster Edition intentionally minimizes animation.

Motion should communicate:

- status
- transition
- scan
- arrival
- confirmation

Never spectacle.

Never entertainment.

## 9. Operational Density

The Commander should be able to scan an entire compartment quickly.

Visual density comes from meaningful information — not decorative chrome.

Whitespace is reserved for focus.

## 10. Progressive Disclosure

```
Show: what matters
        ↓
Allow: drill-down
        ↓
Allow: action
```

Never reverse this order.

## 11. Empty States

Empty states are operational successes.

Never imply failure.

Examples:

- *Intelligence Sweep Complete.*
- *No Priority Targets Detected.*
- *Warehouse Fully Stocked.*
- *Fleet Ready For Deployment.*
- *Operations Standing By.*

The Commander should feel reassured rather than disappointed.

## 12. Quartermaster Presence

Quartermaster is not an animated assistant.

Quartermaster exists through:

- language
- terminology
- compartment design
- operational confidence

The software itself is the Quartermaster.

## 13. Prototype Zero

Flight Commander is designated **Prototype Zero**.

It is authorized to explore Quartermaster Edition interaction patterns
before they propagate to the remainder of Strategic Fleet Manager.

Successful concepts developed here become candidates for:

- Mission Control
- Fleet Dashboard
- Ship Management
- Decision Center
- Hangar Inventory
- Captain's Log

Future compartments should inherit proven design language rather than
independently invent their own.

## 14. Chief Architect Directive

Quartermaster Edition is not a redesign.

It is the gradual transformation of Strategic Fleet Manager into software
that appears native to the Star Citizen universe while remaining
immediately understandable as professional fleet management software.

Every future UX decision should be evaluated against a single question:

> "Does this feel like software that belongs aboard the flagship?"

If the answer is no, the design should be reconsidered before
implementation.

---

## Chief Architect Note

Flight Commander is no longer simply another page in Strategic Fleet
Manager.

It is the proving ground for Quartermaster Edition.

The purpose of this initiative is not to make the application look more
futuristic. It is to create a cohesive operational environment where
every compartment feels engineered for a Commander performing real fleet
operations.

From this point forward, Quartermaster Edition should evolve through
disciplined iteration. Each successful pattern discovered in Flight
Commander becomes a building block for the next compartment until the
entire application speaks a single visual language.
