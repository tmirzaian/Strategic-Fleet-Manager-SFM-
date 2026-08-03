# QDS-005 — Quartermaster Visual Baseline

**Classification:** Quartermaster Edition Design Authority
**Status:** Certified visual reference — the counterpart to ADR-004 for concrete values, not just principles.
**Authority:** ADR-004, ADR-005, QDS-001, QDS-002, QDS-003, QDS-004, EWO-108, EWO-109, EWO-110, EWO-111

ADR-004 defined the *rules*. This document defines the *numbers* — the exact spacing, proportions, and treatments Flight Commander now expresses those rules through, certified as the reference every future Station's own presentation is measured against. "Match the Quartermaster Baseline" means matching what's written here.

---

## 1. Compartment Depth

A Station's environment is not a flat backdrop — it has real depth, and the baseline exploits it:

- **Foreground:** reflective deck plating, floor light strips (the nearest, brightest detail).
- **Midground:** the compartment's own equipment (the tactical holotable, workstation consoles) — the Primary Workspace's *visual* anchor even though its actual UI content sits below the fold.
- **Background:** distant wall displays, viewport starfield, ceiling ring detail — established but never competing with foreground legibility.
- **Threshold plane:** a fourth depth layer specific to the baseline plate (Part 3 below) — a literal bulkhead doorway in the extreme foreground, establishing arrival before the room itself is even read.

A commissioned environment lacking at least three of these four layers reads as decoration, not architecture (QDS-004 Part F) — a flat, single-plane texture does not qualify for Environmental Mount use regardless of resolution.

## 2. Environment Usage

**Height calibration is plate-specific, not a universal constant.** The certified value for Flight Commander's baseline plate is `lg:min-h-[576px]`, chosen deliberately as the *crossover height*: at the 1600px reference viewport, this is the exact height at which the mount's own aspect ratio matches the plate's native aspect ratio (1672×941 ≈ 1.777), so the full image renders with **zero cropping in either dimension** — no threshold geometry lost off the left edge, no ceiling/floor detail lost off the top or bottom.

**Method for calibrating a new plate:**
```
crossover_height = container_width / (plate_width / plate_height)
```
Measure `container_width` live at the 1600px reference viewport (`document.querySelector('[data-testid="station-environment-mount"]').getBoundingClientRect().width`), compute the plate's own native aspect ratio, and set `minHeightClassName` at or near the crossover. Going taller than the crossover flips the crop axis (width starts being trimmed instead of height) — for a plate with important architecture at the horizontal extremes (a doorway, wall displays), staying **at or below** the crossover is almost always correct; going shorter is the safer direction to err if unsure.

**Fade band:** `h-28 lg:h-40` (unchanged from EWO-108/109's certified value) — a gradient dissolve into the page's own `#071016` background, never a hard cutoff.

**Presentation values:** `opacity: 1.0, brightness: 1.0, contrast: 1.0, saturation: 1.0, blurPx: 0` — full-strength, zero filter, unchanged since Mission Control's own EWO-035A-R2 precedent ("the goal is zero shading over the loaded image, not a fallback tone"). This baseline reaffirms that precedent rather than introducing a new one: a correctly-composed plate with real dark negative space needs no artificial dimming to keep mounted content legible.

## 3. Station Threshold

The certified baseline plate contains a literal, real architectural doorway — a bulkhead frame with its own amber trim lighting — in the left third of the composition. **The threshold is not a UI element.** No decorative border, glow, or overlay was added to create it (per Part B's own "architectural, not decorative" mandate); the only engineering work was ensuring the mount's own height (§2) doesn't crop it away. This is the baseline's central lesson: a Station Threshold is achieved by *revealing real architecture already present in the commissioned art*, not by layering UI on top of a generic backdrop. A future environment commission for a new Station should be briefed to include an equivalent threshold element if that Station is meant to carry the same "crossing into the room" feeling.

## 4. Mounted Briefing Wall

- **Region width:** `lg:w-[360px]` (`StationBriefingRegion`, unchanged from EWO-108/109).
- **Region padding:** `p-4 lg:p-5`.
- **Internal layout:** `flex flex-col justify-center gap-4` — vertically centered within the (now taller) mount, reading as a plaque mounted mid-panel rather than pinned to an edge.
- **Placement:** always inside the dark, low-detail zone of the environment plate (confirmed by direct visual inspection, not assumed) — the plate's own composition, not a CSS overlay, is what keeps this legible without a scrim or vignette.

## 5. Instrument Rhythm

- **Grid:** `grid-cols-2 gap-2.5` (`MountedInstrumentRegion`) — a fixed 2×2 arrangement for four metrics, unchanged since EWO-108.
- **Card housing:** `bg-black/30 backdrop-blur-md border border-white/10 rounded-md px-3 py-3` (`MountedInstrument`, Station Kit — frozen this EWO, not modified).
- **Value hierarchy:** `text-2xl font-display font-bold text-gold` for the number, `text-[10px] uppercase tracking-widest text-muted` for the label — a deliberate two-tier size/weight/color split so the number, not the label, is what a Commander's eye lands on first.
- **This EWO's own constraint:** instrument calibration was evaluated but not altered — the existing rhythm was found correct on inspection (even spacing, consistent card sizing, no misalignment), and Part D explicitly scoped this EWO to review, not to change metrics or wording. The rhythm documented here is confirmation, not a new decision.

## 6. Dossier Density (Part F polish, applied)

| Property | Before (EWO-108/109) | After (EWO-111) | Reasoning |
|---|---|---|---|
| Card padding | `p-3` | `p-3.5` | Marginally more interior breathing room |
| Ship image | `w-12 h-12` (48px) | `w-14 h-14` (56px) | More tactical-dossier presence without crowding the row |
| Component-block indent | `pl-[60px]` | `pl-[68px]` | Re-aligned to the new 56px image + 12px gap |
| Component-block top margin | `mt-2.5` | `mt-3` | Slightly clearer separation from the identity row |
| Component-block internal spacing | `space-y-2` | `space-y-2.5` | Matches the top-margin adjustment |
| Card-to-card gap (roster list) | `space-y-2` | `space-y-3` | The single highest-value density fix — cards no longer read as touching |

No structural change: reading order (Source Vessel → Useful Factory Equipment → Required By Commander Fleet), the identity-row/component-block split, and every existing test's DOM contract are all unchanged — confirmed by all 14 dossier tests passing unmodified.

## 7. Color Hierarchy (Gold Discipline)

Every gold-bearing element in the certified baseline, audited against one test: ***"Why is this gold? Because the Commander should notice this first."***

| Element | Gold? | Reasoning |
|---|---|---|
| Instrument values (the 4 metric numbers) | ✅ Kept | The literal reason a Commander scans this panel — ADR-004 §6's own canonical use |
| Standing Watch checkmark | ✅ Kept | The single most important signal on the panel — the "all clear" confirmation |
| Matched category glyph housing (dossier rows) | ✅ Kept | A genuine, specific "this row matters for this reason" signal, not decoration |
| Active filter pill | ❌ **Changed to cyan** | A selection state, not a strategic value — EWO-108 originally justified this as a "command-attention accent," which does not survive this EWO's stricter test |
| "Intelligence Status" section label | ❌ **Changed to cyan** | A structural list heading, not a value or recommendation |
| Intelligence Status bullet markers (×3) | ❌ **Changed to cyan** | Decorative bullets — gold here was "visual variety," the exact anti-pattern ADR-004 §6 warns against ("colors are never decorative") |

**Net result:** gold now appears in exactly three roles across the whole compartment — strategic numeric values, the single standing-confirmation signal, and genuine per-row match indicators. Nothing else. This is the enforceable definition of "gold discipline" for future Stations: if a new use of gold cannot be sorted into one of those three roles (or a clear analog), it should not be gold.

## 8. Lighting Language

- **Cyan** carries every informational/structural role: navigation links, search/filter chrome, category-match "not yet matched" resting state, section labels, list bullets. This is the *majority* color of the interface by design — ADR-004 §6's own "Blue = Navigation, Analysis, Information, Systems."
- **Amber/Gold** is deliberately scarce (§7) — both in UI chrome and, now, reinforced by the baseline plate's own art direction (warm amber floor light-strips against a predominantly cool-blue-lit room). The plate's own lighting *already* enacts the same discipline the UI chrome now also enforces — a genuine, confirmed alignment between commissioned art and interface color language, not a coincidence to take for granted in a future, differently-lit plate.
- **Contrast:** the plate's own dark negative space (§4) does the legibility work; no UI-layer dimming, vignette, or scrim exists anywhere in the compartment.
- **Glass:** every mounted surface (instruments, the control rail, dossier cards) uses the same `bg-black/2X–3X backdrop-blur-md` family — one consistent "glass over dark" material, never a lighter/opaque card breaking the illusion of a surface mounted in a dim room.
- **Reflections:** the plate's own floor reflections are real (rendered into the art), not simulated in CSS — the baseline does not attempt a screen-space reflection effect anywhere; "glass and reflections" per Part H's own checklist is satisfied by the art direction, not by new UI effects.

## 9. Material Language

Two materials only, used consistently everywhere in the compartment:

1. **Structural glass** — `bg-black/2X-3X backdrop-blur-md border border-white/10`, used for anything mounted *over* the environment art (instruments, the control rail).
2. **Compartment panel** — `bg-black/25 border border-white/10` (no backdrop-blur), used for anything sitting *below* the environment art, on the page's own flat background (dossier cards, the Standing Watch/data-unavailable panels).

The distinction is deliberate and legible: blur = "this is floating in front of the room's own atmosphere," flat = "this is furniture resting on the deck below the room's window." Mixing the two within the same visual zone would blur (no pun intended) that distinction.

## 10. Typography Rhythm

Unchanged from ADR-004 §7, reaffirmed at the baseline:
```
Blue/cyan compartment identifier (text-xs uppercase tracking-[0.25em])
        ↓
White operational status title (text-2xl font-display font-bold)
        ↓
Muted summary subtitle, when present (text-sm text-muted)
        ↓
Quartermaster Gold only for strategic values (never headings, never labels)
```

## 11. Motion Restraint

No animation was added anywhere in this EWO (explicit non-goal). The one motion element in the compartment — the Standing Watch radar sweep — is unchanged from EWO-108/109's own certified, reduced-motion-respecting implementation. The baseline's own motion budget is therefore: **one** restrained, purposeful animation per Station, reused rather than multiplied, always gated behind `prefers-reduced-motion`.

## 12. Mounted Architecture — Worked Examples

- **A metric card is not a floating dashboard tile.** It has a housing (`border`, corner ticks), a frame (the cyan hairline), and sits inside a room with real depth behind it — never a plain white/light card that would look native to a generic SaaS dashboard.
- **A control rail is not a search bar.** It is a recessed, glass-fronted instrument (`bg-black/30 backdrop-blur-md`) mounted at the threshold between the briefing wall and the workspace — sticky, so it remains physically "in reach" during a long scroll, the way a real console would stay in front of an operator rather than scrolling away.
- **A dossier is not a table row.** It has its own housing (`bg-black/25 border`), its own identity photograph, and its own internal reading order — a physical record card, not a spreadsheet line, even though it is exactly as information-dense as one.

---

## Certified Reference Screenshots (Part J)

Captured live on port 5176, 1600px desktop viewport, per this session's established verification discipline.

- **Intelligence Active** — captured on the dev server (seeded fleet; the only environment with real demand data to display), full page. Shows: the threshold-and-CIC hero at 576px with the doorway fully visible, four mounted instruments (6/3/7/0), the sticky Intelligence Control Rail with the corrected cyan active-filter state, and six polished tactical dossiers with the new 56px imagery and improved card spacing.
- **Standing Watch** — captured on a production preview build (empty fleet naturally produces this state without needing to manufacture it). Shows: the same threshold-and-CIC hero, four truthful zero-value instruments, and the Standing Watch report with the gold checkmark preserved and the corrected cyan "Intelligence Status" section.

Both screenshots confirmed zero console errors and are held as the visual comparison baseline for every future Station migration — not committed as repository image files (matching this session's established convention of describing, rather than storing, live-verification screenshots in the architecture record), but reproducible at any time via the exact viewport/route/build combination documented above.

---

## Before/After Rationale Summary

| Change | Before | After | Why |
|---|---|---|---|
| Environment plate | v1 (no visible threshold) | V2 (real bulkhead doorway) | Part B requires an architectural threshold; only achievable with art that contains one |
| Mount height | `lg:min-h-[560px]` | `lg:min-h-[576px]` | The calculated crossover height for the new plate at the 1600px reference viewport — reveals the full plate, including the threshold, with zero cropping |
| Active filter pill color | gold | cyan | Failed the gold-discipline test — a selection state is not a strategic value |
| "Intelligence Status" label + bullets | gold | cyan | Same — structural labeling, not a value the Commander needs to notice first |
| Dossier card padding | `p-3` | `p-3.5` | Breathing room (Part F) |
| Dossier ship image | 48px | 56px | Tactical-dossier presence (Part F) |
| Dossier card-to-card gap | `space-y-2` | `space-y-3` | The single highest-value density fix identified during review |

No resolver, business logic, Station Kit component, or dossier structural change occurred anywhere in this work.
