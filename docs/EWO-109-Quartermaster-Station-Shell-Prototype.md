# EWO-109 — Quartermaster Station Shell Prototype

**Classification:** Quartermaster Edition Infrastructure
**Priority:** Foundational Framework Implementation
**Status:** Implemented. Held uncommitted pending Chief Architect certification.
**Authority:** ADR-004, ADR-005, QDS-001, QDS-002, QDS-003, QDS-004, EWO-108

Implements the first reusable Quartermaster Station Shell — one consumer (Flight Commander) only, no second Station migrated under this EWO, per explicit mandate.

---

## 1. Extraction audit (Part A)

Every element in EWO-108's certified Flight Commander implementation, classified as shell-owned or Station-owned:

| Element | Owner | Evidence |
|---|---|---|
| Outer `space-y-4 max-w-5xl` wrapper | **Shell** (`StationShell`) | Pure structural spacing, no Flight-Commander content |
| CIC environment mount (`PageEnvironment`, `lg:min-h-[560px]`, border, flex layout) | **Shell** (`StationEnvironmentMount`) | Only knows an `EnvironmentId` — never a ship, a build, or a demand component |
| Bottom gradient fade | **Shell** (`StationEnvironmentMount`) | The same "architectural continuation" mechanism QDS-004 Part F.1 named — content-agnostic |
| Left dark-band column (width/padding/flex) | **Shell** (`StationBriefingRegion`) | Layout only — every word rendered inside it is Flight-Commander content |
| Station Briefing Header's own text ("Flight Commander," "Target Intelligence Available," the summary sentence) | **Station** | QDS-003 reporting content — Station Identification/Operational Condition/Command Summary |
| Mounted-instrument grid (`grid-cols-2 gap-2.5`) | **Shell** (`MountedInstrumentRegion`) | Generic grid mechanism |
| Individual instrument housing (recessed box, hairline, corner ticks) | **Shell** (`MountedInstrument`) | Fully generic `label`/`value` props — no domain knowledge |
| The four metric definitions/values themselves | **Station** | `FlightCommanderPresentation`'s own fields — resolver output |
| Sticky rail-mounting mechanism (`sticky top-0 z-20`, backdrop) | **Shell** (`OperationalRailMount`) | Positional mechanism only |
| The rail's own search/filter styling and behavior | **Station** | `IntelligenceControlRail` — unchanged, not extracted (Part E) |
| Workspace region wrapper | **Shell** (`PrimaryWorkspace`) | A plain, unstyled placement wrapper |
| The dossier list and its own rendering | **Station** | `SourceVesselDossier`/`SourceVesselDossierList` — unchanged, not extracted (Part E) |
| Standing Report panel framing + monitoring visual (radar sweep) | **Shell** (`StandingReportRegion`) | Generic "calm monitoring panel" — no domain vocabulary |
| Standing Watch's own copy (all required EWO-108 text) | **Station** | QDS-003 Part H Station-owned reporting content |
| Footer transition | **Neither, not yet reachable** | `AppFooter` renders in `App.tsx`, entirely outside any page component's own render tree — see §6 |
| `FactoryDataUnavailablePanel` | **Station, untouched** | A genuine third state (data-unavailable diagnostic), not a Standing Report — conflating the two would blur QDS-003's own distinct Standing Status/Exception Report concepts (§6) |

No code was moved before this audit was written, per the work order's own explicit sequencing requirement.

---

## 2. Shell responsibilities

`src/components/stationShell/` — nine files, each a single region:

- `StationShell.tsx` — compartment threshold / outer spacing.
- `StationEnvironmentMount.tsx` — Environmental Mount (QDS-004 Part G approved primitive #1).
- `StationBriefingRegion.tsx` — the Mounted Briefing Wall's physical placement.
- `MountedInstrumentRegion.tsx` + `MountedInstrument.tsx` — Command Instrument Zone (approved primitive #2).
- `OperationalRailMount.tsx` — the rail's sticky mounting mechanism only (not its inner styling — see §4).
- `PrimaryWorkspace.tsx` / `SupportingWorkspace.tsx` — workspace placement wrappers, per QDS-004 Part C's slot list.
- `StandingReportRegion.tsx` — Standing Report (approved primitive #3).

**None of these files import from `useFleetStore`, `factoryLoadoutTargetIntelligence`, `flightCommanderPresentation`, `flightCommanderComponentIdentity`, `shipDefinitions`, or `src/pages/flightCommander/`** — verified structurally, not just by convention, by a dedicated test that scans every shell source file's own `import` statements (`src/components/stationShell/__tests__/StationShell.test.tsx`).

---

## 3. Station responsibilities

Everything under `src/pages/flightCommander/` remains exactly as EWO-108 left it in content, with three files updated only to *consume* shell primitives instead of implementing their own housing:

- `StationBriefingHeader.tsx` — unchanged (Flight-Commander text content).
- `TacticalInstruments.tsx` — now a thin content-mapping layer over `MountedInstrumentRegion`/`MountedInstrument`; the four metric definitions are unchanged.
- `IntelligenceControlRail.tsx` — unchanged (not extracted, Part E).
- `SourceVesselDossier.tsx` / `QuartermasterGlyphFrame.tsx` — unchanged (not extracted, Part E).
- `StandingWatchPanel.tsx` — now supplies its copy as children to `StandingReportRegion`; every line of required text is unchanged.

---

## 4. Public shell contract

| Responsibility | Owned by shell | Owned by Station | Consumer responsibility | Future extension point |
|---|---|---|---|---|
| Threshold / outer spacing | ✅ | — | Wrap page content in `<StationShell>` | — |
| Environment presence, extent, fade | ✅ | — | Supply `environmentId`; optionally `minHeightClassName`/`fadeHeightClassName` if the default doesn't suit the art | Bounded (`EnvironmentBay`-style) variant not yet implemented (§6) |
| Briefing region placement | ✅ | Its content | Supply header/instrument content as children | Outside-the-environment variant not yet implemented (§6) |
| Instrument housing | ✅ | Which metrics, their values | Map presentation data to `<MountedInstrument label value testId>` | Partition/parent-child shape (Mission Control's own Fleet Status) not yet supported |
| Rail mounting mechanism | ✅ | Rail's own controls/styling | Wrap rail content in `<OperationalRailMount>` | Rail's own recessed-housing style could migrate to the shell once a second consumer needs it |
| Workspace placement | ✅ | Workspace content | Wrap in `<PrimaryWorkspace>`/`<SupportingWorkspace>` | — |
| Standing Report framing + monitoring visual | ✅ | Report copy | Supply copy as children; `monitoringVisual={false}` if no sweep metaphor fits | — |
| Footer transition | ❌ not implemented | — | — | Requires `App.tsx`-level or portal/context work — out of reach from a single page component (§6) |

---

## 5. Migration notes

`FlightCommander.tsx` went from directly rendering a `PageEnvironment` + raw divs to composing `<StationShell><StationEnvironmentMount environmentId="flight-commander"><StationBriefingRegion>...` — every `className` string that carried real visual meaning was moved verbatim into the corresponding shell component (no value was invented or approximated). Zero resolver, presentation, or identity-formatting call sites were touched. The migration preserved every existing `data-testid` (`summary-cards`, `summary-card-*`, `standing-watch-panel`, `target-roster`, `no-filtered-results`) so all 42 of EWO-108's own behavioral tests pass completely unmodified.

---

## 6. Compatibility assessment — future consumers (Part I, documentation only)

No code was written for any Station below. Assessed against the shell exactly as built in §2.

### Mission Control

| | |
|---|---|
| Compatibility | **Medium** |
| Missing shell regions | The shell's `StationBriefingRegion` only supports identity *inside* the environment (Flight Commander's own convention); Mission Control's header sits *outside* its hero (QDS-004 A.1/A.8) — the shell has no "outside" variant yet. Mission Control's Fleet Status is a **partition** shape (one anchor metric + three bracketed sub-metrics), not four independent boxes — `MountedInstrumentRegion`/`MountedInstrument` as built only support the independent-metrics shape (QDS-004 D.2's own distinction) |
| Anticipated complexity | Medium — blocked on two concrete, well-understood gaps, not an open-ended redesign |
| Blocking gaps | (1) header-inside-vs-outside variant, (2) a partition-shaped instrument variant |

### Ship Management

| | |
|---|---|
| Compatibility | **Low** |
| Missing shell regions | `ShipHeroFrame` (a ship photograph) is explicitly outside Station Shell authority already (QDS-001 D.1, reaffirmed QDS-004) — `StationEnvironmentMount` does not apply to this Station's primary identity surface at all. No current instrument-shaped metrics exist to migrate. No current filter/search rail exists |
| Anticipated complexity | High — the most gaps of any Station, because its core visual model (photo identity, not atmosphere) is fundamentally different from Flight Commander's |
| Blocking gaps | None of the three approved primitives apply cleanly to this Station's own hero mechanism; only `PrimaryWorkspace` (the port tree) is a direct, immediate fit |

### Hangar Inventory

| | |
|---|---|
| Compatibility | **Medium-High** |
| Missing shell regions | No hero exists today (clean slate — nothing to reconcile, unlike Mission Control). No current instrument-shaped metrics exist (a Station-level content decision, not a shell gap) |
| Anticipated complexity | Low — `StationEnvironmentMount`, `OperationalRailMount` (this Station's existing filter toolbar is already ~90% identical in spirit to Flight Commander's own, per QDS-001 D.3), and `PrimaryWorkspace` all apply directly |
| Blocking gaps | None found |

### Decision Center

| | |
|---|---|
| Compatibility | **Low-Medium** |
| Missing shell regions | Uses `EnvironmentBay` — a **bounded** room, architecturally distinct from `StationEnvironmentMount`'s full-bleed pattern (QDS-001 D.1's three-way hero taxonomy). The shell as built implements only the full-bleed variant |
| Anticipated complexity | Medium-High — blocked specifically on the bounded-environment gap; the verdict-driven workspace itself would fit `PrimaryWorkspace` easily once that's resolved |
| Blocking gaps | A bounded/`EnvironmentBay` variant of `StationEnvironmentMount` does not exist |

### Captain's Log

| | |
|---|---|
| Compatibility | **Mixed — one high-value, low-risk opportunity; everything else not applicable** |
| Missing shell regions | No environment exists or should be forced (QDS-001 D.1: a narrow card is not a room) — `StationEnvironmentMount` is not applicable to this Station at all. No instrument-shaped metrics. No filter/search rail |
| Anticipated complexity | Low for one specific use: `StandingReportRegion` could close Captain's Log's own confirmed, already-documented missing-empty-state defect (QDS-001 D.4) directly, without needing any other shell region |
| Blocking gaps | None for the one applicable region; the rest simply don't apply to this Station's domain |

**Cross-cutting finding:** every Station's compatibility is gated by whether its *existing* hero mechanism matches `StationEnvironmentMount`'s current full-bleed-only, inside-header-only implementation. Two of five (Ship Management, Decision Center in part) use a structurally different mechanism the shell does not yet support, and Mission Control's header placement disagrees with the one convention the shell currently implements. This independently confirms QDS-004's own central finding (no two compartments agree on environment mechanics) rather than resolving it — resolving it was explicitly out of scope for this EWO.

---

## 7. Lessons learned

- **The three QDS-004-approved primitives extracted cleanly, with zero behavioral drift** — 42 pre-existing tests passed unmodified, and two full sets of live screenshots (dev intelligence-active state, production-preview Standing Watch) are pixel-identical to EWO-108's own certified screenshots.
- **"Shell owns the frame, Station owns the content inside it" held as a consistent, mechanical rule** across all three primitives (`MountedInstrument`'s label/value, `StandingReportRegion`'s children, `StationBriefingRegion`'s children) — the same principle QDS-003 and QDS-001 each independently converged on, now proven at the implementation level, not just the documentation level.
- **The single-consumer constraint made the header-inside-vs-outside question avoidable, not resolved.** Building the shell around Flight Commander's own convention was the only honest option with one consumer — but §6 shows this defers, rather than eliminates, QDS-004 Open Question #1. The shell's very first future consumer (Mission Control) will force a real decision.
- **Footer transition remains architecturally unreachable, confirmed concretely.** `AppFooter` renders in `App.tsx`, entirely outside `FlightCommander.tsx`'s own render tree — no amount of shell composition inside a page component can reach it. QDS-004 Part D listed this as a shell responsibility; this EWO confirms it needs `App.tsx`-level or React-context work, which is out of this EWO's own explicit non-goals ("refactor unrelated pages").
- **The `FactoryDataUnavailablePanel` boundary decision was the right one.** Leaving it untouched, rather than routing it through `StandingReportRegion`, avoided conflating two genuinely different QDS-003 concepts (Standing Status vs. a future Exception Report) under the pressure of "one more thing looks like it could reuse this component."

---

## 8. Future extraction candidates

- A **bounded environment variant** (`EnvironmentBay`-equivalent) of `StationEnvironmentMount`, blocking Decision Center.
- A **header-outside-the-environment variant** of `StationBriefingRegion`, blocking Mission Control.
- A **partition-shaped instrument variant** (one anchor + N bracketed children), blocking Mission Control's Fleet Status specifically.
- **Operational Control Rail's own inner visual styling** (not just the mounting mechanism) — QDS-004 classified this as reusable; this EWO deliberately left it Station-owned per Part E's narrower approved list, but Hangar Inventory's own near-identical filter toolbar (QDS-001 D.3) makes it the natural second data point once that Station migrates.
- **Footer transition**, requiring `App.tsx`-level or context-based work, explicitly out of this EWO's scope.
- **`Tactical Dossier`** as a generic "Record Card" primitive — still held back per Part E; needs a second Station with a genuinely similar content shape before extraction is evidence-based rather than speculative.

---

## Explicit Non-Goals — Confirmation

Flight Commander was not redesigned — every screenshot in this document is visually identical to EWO-108's own certified output. No second Station was migrated; Part 6 above is documentation only, no code. No Station wording was modified. No new authorities were introduced — the resolver, presentation, and identity-formatting layers were never opened (confirmed by 53 untouched pre-existing tests continuing to pass). No dossier or glyph redesign occurred — `SourceVesselDossier.tsx` and `QuartermasterGlyphFrame.tsx` are byte-for-byte unchanged from EWO-108. No animations were added — the only animation in scope (`.animate-radar-sweep`) is the same one EWO-108 already certified, moved, not modified. No artwork was generated by this work. No theme system was introduced. No unrelated pages were refactored.

**Note on unrelated files observed in the working tree at completion:** four new environment `.webp` assets (`mission-control-v2`, `ship-management/maintenance-compartment-v2`, `hangar-inventory/warehouse-compartment-v2`, `decision-center/technical-evaluation-laboratory-v2`) and a new `public/assets/environments/station-shell/station-shell-master-reference.webp` appeared during this session's work window. None were generated, moved, or referenced by this EWO's implementation — they are untouched, unstaged, and not evaluated as part of this document's compatibility assessment (Part 6 above used only pre-existing, already-documented art status). Flagged for Chief Architect awareness, not acted upon.

---

## Commander Acceptance Criteria

- **Flight Commander still behaves identically?** Yes — 42 pre-existing behavioral tests pass unmodified; live screenshots in both intelligence-active and Standing Watch states are pixel-identical to EWO-108's own certified output, in both dev and production preview.
- **The page still feels like Prototype Zero?** Yes — no visual drift was introduced; every pixel traces to a `className` string moved, never rewritten.
- **The shell now clearly owns the structural architecture?** Yes — `StationShell`, `StationEnvironmentMount`, `StationBriefingRegion`, `MountedInstrumentRegion`/`MountedInstrument`, `OperationalRailMount`, `PrimaryWorkspace`/`SupportingWorkspace`, and `StandingReportRegion` are all real, tested, independently-verified-dependency-free components under `src/components/stationShell/`.
- **Flight Commander owns only Flight Commander?** Yes — every remaining file under `src/pages/flightCommander/` contains only Flight-Commander-specific content, composing shell regions rather than implementing them.
- **Does this naturally prepare future Stations to migrate without duplicating shell code?** Partially, and honestly reported as such — Hangar Inventory and, for one region, Captain's Log are ready today; Mission Control, Ship Management, and Decision Center each need one or more concrete, now-named shell extensions (§6, §8) before they can migrate without duplicating what the shell already almost provides.

## Commit hash

Held uncommitted pending Chief Architect certification, per this session's established discipline. To be recorded here only after certification.
