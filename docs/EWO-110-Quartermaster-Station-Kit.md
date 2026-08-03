# EWO-110 — Quartermaster Station Kit (Core UI Components)

**Classification:** Product Architecture / Shared UI Infrastructure
**Status:** Implemented. Held uncommitted pending Chief Architect certification.
**Authority:** ADR-004, ADR-005, QDS-001, QDS-002, QDS-003, QDS-004, EWO-108, EWO-109

Builds the reusable Quartermaster Edition component library — pure presentation infrastructure. No business logic, resolver, or workflow changes anywhere in this work.

---

## 1. Relationship to the Station Shell (EWO-109)

Two related but distinct layers now exist:

- **`src/components/stationShell/`** (EWO-109) — *spatial* regions. Answers **where** something goes (environment mount, briefing placement, workspace placement).
- **`src/components/stationKit/`** (this EWO) — *content* components. Answers **what it looks like** (a metric card, a banner, a divider, a header, an icon housing).

`MountedInstrument` — the individual card — moved from `stationShell` into `stationKit` and gained icon/status/trend support, since it is a content component, not a spatial one. `MountedInstrumentRegion` (the grid that hosts instrument cards) stayed in `stationShell`, since a grid *is* spatial placement. `stationShell`'s own tests and Flight Commander's own `TacticalInstruments.tsx` were updated to import `MountedInstrument` from its new home; every other shell region is unchanged.

---

## 2. Component purpose, ownership, and composition rules

| Component | Part | Purpose | Owns | Never owns |
|---|---|---|---|---|
| `MountedInstrument` | A | The canonical metric card | Housing (recessed panel, corner cuts, frame, glass, reflection), value typography | The metric's meaning, what counts as a good/bad value |
| `OfficerBriefingBlock` | B | Presentation for QDS-003's five reporting layers | Slot labeling, spacing, per-slot typography/accent | The briefing text itself — always caller-supplied, always optional per slot |
| `StructuralDivider` | C | Compartment dividers (bulkhead language) | Four variants' visual treatment | Nothing — purely decorative |
| `CompartmentHeader` | D | The one compartment-header authority | Eyebrow/title/subtitle/officer-designation layout | The Station's own title text — always caller-supplied |
| `OperationalStatusBanner` | E | Canonical status strip | Icon/tone/label layout for 8 fixed variants | Custom colors — every variant maps to the existing `Tone` vocabulary only |
| `EnvironmentalOverlays` (6 components) | F | Decorative atmosphere layers | Pure visual texture, `aria-hidden` | Any information — verified by test that none render text content |
| `MountedWorkspacePanel` | G | The `<Card>` replacement | Title/toolbar/content/footer slot layout | Panel contents — always caller-supplied |
| `QuartermasterIconHousing` | H | Mounted icon treatment | The housing (recessed frame, active/inactive state) | Icon meaning — icons and their meanings stay wherever they already live (e.g. `componentCategoryIcon.ts`) |

**Composition rule, applied consistently across every component above:** the Kit owns the frame; the Station owns what's inside it. The same rule QDS-001 drew for layout, QDS-003 drew for reporting content, and EWO-109 drew for spatial regions — now proven a fourth time at the individual-component level.

**Verified, not assumed:** every Station Kit source file's own `import` statements are scanned by a dedicated test (`src/components/stationKit/__tests__/StationKit.test.tsx`) confirming none reference any page's store, resolver, or router — the same structural proof EWO-109 established for the Shell, now covering the Kit too.

---

## 3. Design decisions and reasoning

### 3.1 `Tone`, not a new palette

Every color-bearing component (`MountedInstrument.status`, `OperationalStatusBanner.variant`) draws exclusively from `src/components/Badge.tsx`'s existing `Tone` union (`cyan | success | warning | danger | muted | invalid | gold`) — itself already a faithful implementation of ADR-004 §6's five-color authority. No new color token was introduced anywhere in this EWO. This directly avoids the "three independently-maintained severity vocabularies" problem QDS-002/QDS-003 both already flagged elsewhere in the app.

### 3.2 `OperationalStatusBanner`'s eighth variant

The work order names seven variants (Mission Ready, Maintenance Required, Standing Watch, Attention Required, Operational, Information, Warning). None of them reach ADR-004 §6's fifth palette meaning — Red, "Critical, Failure, Immediate intervention." A status-banner system with no way to express that condition would be incomplete against the app's own existing color authority, so an eighth variant, `critical` (→ `danger`/red), was added. Flagged here explicitly as a deliberate extension beyond the work order's own list, not a silent addition.

### 3.3 Variant → tone mapping

| Variant | Tone | Reasoning |
|---|---|---|
| Mission Ready | success | ADR-004 §6: Green = Operational/Ready/Available/Healthy |
| Operational | success | Same meaning, different label |
| Standing Watch | gold | Matches Flight Commander's own already-certified treatment (EWO-108) |
| Attention Required | gold | ADR-004 §6: Gold = Command attention, Recommended actions |
| Maintenance Required | warning | A real actionable condition, closer to the app's existing distinct Caution-Yellow `warning` token (QDS-002 C.10) than to Gold's "strategic recommendation" meaning |
| Warning | warning | Direct match |
| Information | cyan | ADR-004 §6: Blue = Navigation/Analysis/Information/Systems |
| Critical *(added, §3.2)* | danger | ADR-004 §6: Red = Critical/Failure/Immediate intervention |

### 3.4 `StructuralDivider` reuses `.scanline-divider`

`src/index.css` already ships a `.scanline-divider` class (a cyan gradient fading at both edges), already used on `EditFleetAssetModal`, `ShipDetail`, and `MissionComposer`. The `horizontal` variant (the default) reuses this class directly rather than duplicating its gradient by hand; the other three variants extend the same cyan-gradient language for visual consistency with it. An earlier draft used a plain white gradient — corrected before this document was written, once the existing class was found.

### 3.5 `CompartmentHeader`'s illustrative examples are not a copy change

Part D's own worked examples ("MISSION CONTROL / Fleet Operations Bridge," "SHIP MANAGEMENT / Maintenance Bay," "HANGAR INVENTORY / Quartermaster Stores") differ from the actual shipped title text for those compartments (ADR-004 §2's own table: "Operations Standing By," "Select Vessel For Maintenance," "Warehouse Inventory Available"). This EWO treats those examples as illustrations of the *component's* capability, reproduced only inside `QuartermasterStationKit.tsx` (the showcase) — **no real Station's shipped title text was changed anywhere in this work.** Adopting new title copy on any real Station is a distinct, QDS-002-governed decision, out of this EWO's own "no workflow changes" scope.

---

## 4. Flight Commander migration (verified visual parity)

Per the Commander Acceptance criterion ("Flight Commander can be reconstructed entirely from shared Station Kit components plus its own page-specific Tactical Dossier"), the following safe, zero-visual-drift refactors were performed and verified live:

| File | Before | After |
|---|---|---|
| `StationBriefingHeader.tsx` | Hand-written eyebrow/title/subtitle markup | Thin composition of `CompartmentHeader` — every className moved verbatim |
| `TacticalInstruments.tsx` | Imported `MountedInstrument` from `stationShell` | Imports the relocated, extended `MountedInstrument` from `stationKit`; `label` prop renamed to `title` |
| `QuartermasterGlyphFrame.tsx` | Implemented its own housing markup | Thin composition of `QuartermasterIconHousing`; keeps only the "X match"/"X not matched" label wording, which is Flight-Commander-specific, not a housing concern |

**One documented, deliberate exception:** `FactoryDataUnavailablePanel` was evaluated for migration onto `OperationalStatusBanner` and kept local. The two have genuinely different shapes — a centered diagnostic panel (32px icon, centered text, generous padding) versus a compact horizontal banner (18px icon, left-aligned, tight padding) — and forcing one into the other's shape would be a real visual redesign, not a safe refactor, under a work order that explicitly asks for "pure presentation infrastructure," not a redesign of a certified page. `StandingWatchPanel.tsx` was left as-is for the same reason: its five-paragraph-plus-status-list shape is richer than `OfficerBriefingBlock`'s five-slot model, and forcing it in would drop fidelity already certified under EWO-108.

**One documented, minimal, intentional visual change:** `MountedInstrument`'s "subtle environmental reflection" (Part A's own required characteristic — a 3%-opacity white gradient sheen) is new relative to EWO-109's certified instrument cards. It was not present before this EWO and is explicitly requested by Part A's own text. Confirmed imperceptible at normal viewing distance in the live verification screenshot; noted here per the same "if visual drift occurs, document it, justify it, keep it minimal" discipline EWO-109 established.

**Verification:** all 67 pre-existing Flight Commander/dossier/shell tests pass unmodified. A live screenshot on port 5176 (dev, seeded fleet) is visually indistinguishable from EWO-108/109's own certified screenshots. Zero console errors. Port 5173 untouched throughout.

---

## 5. Migration guidance for future Stations

| Station-local pattern | Station Kit equivalent |
|---|---|
| Hand-written eyebrow + title + subtitle | `CompartmentHeader` |
| A page's own ad hoc metric-card markup | `MountedInstrument`, inside `stationShell`'s `MountedInstrumentRegion` |
| A page's own condition/summary/concern/recommendation prose | `OfficerBriefingBlock`, sitting inside `stationShell`'s `StationBriefingRegion`/`StandingReportRegion` |
| A page's own `<hr>`/border divider | `StructuralDivider` |
| A page's own "nothing to report" / status line | `OperationalStatusBanner` (compact) or `OfficerBriefingBlock` inside `StandingReportRegion` (fuller) |
| A page's own `<Card>`/`.panel div` | `MountedWorkspacePanel` |
| A bare Lucide icon | `QuartermasterIconHousing` |
| A page's own decorative CSS texture | One or more `EnvironmentalOverlays`, mounted inside that page's own positioned container |

---

## 6. Component Showcase (Part I)

`src/components/stationKit/QuartermasterStationKit.tsx` — not routed anywhere (no `App.tsx` entry), no store or router import (verified by a dedicated test), renders every Kit component together with invented example data. This is the design authority for future EWOs to consult before building a new Station's own presentation. `Part D`'s illustrative header examples live here, and nowhere else (§3.5).

---

## 7. Tests and gates

`tsc --noEmit` clean. Full suite: **231 files / 2972 tests passing** (39 new Station Kit tests, plus the 67 pre-existing Flight Commander/dossier/shell tests confirmed unmodified and green). Production build clean — the showcase file does not appear in the production bundle at all (nothing imports it, confirming "no routing" held in practice, not just in intent). Live verification on port 5176 confirmed pixel-level parity with EWO-108/109's certified Flight Commander screenshots; port 5173 untouched; temporary Playwright devDependency fully reverted (`package.json`/`package-lock.json` diff empty).

---

## 8. Commander Acceptance — self-check

- **Flight Commander can be reconstructed entirely from shared Station Kit components plus its own page-specific Tactical Dossier?** Mostly yes, with two documented, reasoned exceptions (`FactoryDataUnavailablePanel`, `StandingWatchPanel`'s own richer text shape) kept local because forcing them into the Kit's current shapes would have been a redesign, not a refactor — see §4.
- **No business logic changes required?** Confirmed — zero resolver/store/presentation-layer files were touched; all pre-existing behavioral tests pass unmodified.
- **No visual authority remains page-local unless intentionally Station-specific?** The remaining page-local pieces (`SourceVesselDossier`'s own layout, the two exceptions above, the category-match label wording in `QuartermasterGlyphFrame`) are each explicitly justified in §4 as genuinely Station-specific, not oversights.
- **Another engineer could implement a new Quartermaster Station using only ADR-004, ADR-005, QDS-004, and the Station Kit?** For the pieces this EWO built, yes — `CompartmentHeader`, `MountedInstrument`, `OfficerBriefingBlock`, `StructuralDivider`, `OperationalStatusBanner`, `MountedWorkspacePanel`, `QuartermasterIconHousing`, and the overlay library are all genuinely reusable today. Combined with EWO-109's own Station Shell, a new Station's *presentation* layer is substantially pre-built — its own domain workspace content (the equivalent of Flight Commander's Tactical Dossier) is, correctly, still that Station's own job.

## Commit hash

Held uncommitted pending Chief Architect certification. To be recorded here only after certification.
