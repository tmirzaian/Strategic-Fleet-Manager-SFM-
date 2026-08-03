# EWO-116 — Quartermaster Edition Station Migration Campaign I: Decision Center → Technical Evaluation Laboratory

**Classification:** Quartermaster Edition Station Migration
**Priority:** Implementation
**Status:** Implemented. Held uncommitted pending Chief Architect and Commander visual certification.
**Authority:** ADR-004, ADR-005, QDS-001, QDS-003, QDS-004, QDS-005, QDS-006, QDS-008, QDS-009, EWO-109, EWO-110, EWO-113, EWO-115

Decision Center is the first Station migrated under the Station Migration Campaign — full-viewport environment, canonical Station Kit adoption, Officer Briefing, and a Quartermaster-Edition-conforming empty state, with zero business-logic change.

*(QDS-007 is cited by this work order as the environment-treatment authority; it does not exist in the repository. The closest real, already-shipped authority — QDS-006 Part F's "window, not banner" principle, plus the crossover/viewport mechanics EWO-113/114/115 already established — was applied instead. Same handling QDS-008 gave the same missing citation.)*

---

## 1. Station Audit (Part A)

| Element | Classification (before) |
|---|---|
| Page header (`<p>`/`<h1>` pair) | Legacy presentation — floating, per QDS-009's own cross-Station finding |
| `EnvironmentBay` (bounded, bordered, rounded room) | Legacy presentation — the "hero banner" Part C explicitly prohibits going forward |
| Loot Lookup panel (`.panel lg:bg-panel/55...`) | Legacy presentation — an ad hoc glass div, not a Kit primitive |
| Item Assessment panel (`.panel lg:bg-panel/55...`) | Legacy presentation — same |
| Empty-state block (plain centered div + `ScanLine` icon) | Legacy presentation — no Kit "calm, operational" primitive in use |
| Fleet Demand / Inventory Position sub-tiles | Officer Workspace — Station-owned content, evaluated against `MountedInstrument` and found not a genuine fit (§4) |
| Applicable Target Loadouts list | Officer Workspace — Station-owned, same finding |
| Search input, suggestions, Add/Reserve controls | Officer Workspace — business-logic-bound UI, untouched |
| `evaluate()`, `recommendationTone()`, all store calls | Officer Workspace (business logic) — untouched, not a visual-layer concern at all |

No Station Shell or Station Kit primitive was in use anywhere in the file before this EWO — Decision Center was the most "legacy web layout" of the seven Stations audited in QDS-009, matching that document's own independent finding.

---

## 2. Shell/Kit Adoption (Part B)

- **Flagship Frame** — already inherited automatically via `App.tsx` (EWO-113); no page-level change required.
- **Flagship Environment** — Decision Center's own plate is now the second Station (after Mission Control) promoted to `FlagshipEnvironmentLayer`'s full-viewport treatment, route-gated on `/decision-center` via a small `App.tsx` lookup table (extended from EWO-115's single ternary to a two-entry `Record`).
- **Station Shell** — `StationShell` now provides the compartment threshold. Its own `max-w-5xl` width is intentionally not the visible reading-column width; a narrower `max-w-2xl` inner wrapper preserves Decision Center's own measured, non-executive column as Station-owned content choice, not a duplicate Shell implementation (Part F).
- **Station Kit** — `CompartmentHeader`, `OfficerBriefingBlock`, `MountedWorkspacePanel` (×2), `StructuralDivider`, `QuartermasterIconHousing` all now consumed directly; none reimplemented.

No duplicate implementation and no page-owned replacement of any Shell/Kit primitive exists anywhere in the file (verified by test, §7 item 11).

---

## 3. Environment Integration (Part C)

`technical-evaluation-laboratory-v2.webp` (1672×941, delivered directly, no PNG master — the same delivery pattern as Flight Commander V2 and Mission Control V2) is registered in `generateEnvironmentAssets.ts` and `environmentAssets.ts`, replacing the Beta-era single-tier `decision-center.webp`. It renders through `FlagshipEnvironmentLayer`, full-bleed, no border, no rounding — a viewport, never a bordered hero cell. Verified structurally (`App.test.tsx`): the layer's own className contains neither `rounded` nor `border`, and no `station-environment-mount` node exists anywhere on the route.

---

## 4. Station Kit Adoption Detail (Part E)

| Kit primitive | Applied to | Genuine match? |
|---|---|---|
| `MountedWorkspacePanel` | Loot Lookup, Item Assessment | Yes — EWO-110's own stated purpose is "the standard replacement for an ad hoc `.panel div`" |
| `StandingReportRegion` | Pre-lookup empty state | Yes — the existing `ScanLine` icon already established a scanning metaphor this Station's domain genuinely supports |
| `QuartermasterIconHousing` | The empty state's standalone icon | Yes — a prominent, centered, standalone glyph, exactly what this primitive exists to mount |
| `StructuralDivider` | The section break before Add-to-Inventory | Yes — literally reuses the same shipped `.scanline-divider` CSS a raw `border-t` was approximating by hand |
| `OfficerBriefingBlock` | The Quartermaster's evergreen briefing | Yes — QDS-003's own canonical grammar component, used exactly as designed |
| `MountedInstrument` | *(considered for Fleet Demand/Inventory Position, and for Applicable Target Loadout rows)* | **No — not applied.** Both are multi-line, sentence-bearing content; `MountedInstrument`'s own shape is a short, scannable label+value, and forcing a full sentence into it would violate Part E's own "never force substitutions." Left as their existing bordered `bg-black/20` sub-cards. |

The one deliberate non-substitution is documented, not silent, per Part E's own instruction.

---

## 5. Information Density (Part F)

No dramatic layout change was made — Decision Center's existing single-column, sequential (Lookup → Assessment) shape already read as measured. What changed: the bordered/rounded `EnvironmentBay` cell (a hard, page-canvas-like boundary) is gone, replaced by open-mounted panels over a full-viewport environment with real negative space around them — deliberately not stretched to Mission Control's own full-width openness, and deliberately not packed with the instrument density Flight Commander uses. The `max-w-2xl` reading column (kept from the original implementation) is the concrete mechanism preserving this.

---

## 6. Officer Briefing (Part G)

`OfficerBriefingBlock` renders a single `summary` slot — an evergreen, always-true sentence describing what this compartment does. No `standingCondition`/`concern`/`recommendation`/`nextAction` slot is populated at the Station level: those remain entirely inside the Item Assessment panel, scoped to the specific item under evaluation, exactly as QDS-003 Part C.1 requires (Station Identification/Condition is never duplicated outside the header it belongs to). The per-item verdict logic (`evaluate()`, `recommendationTone()`) is untouched — recommendations remain exactly as truthful as before; nothing new was fabricated.

---

## 7. Workspace Integration (Part H) and Empty State (Part I)

Both panels are `MountedWorkspacePanel`s — opaque, bordered, self-contained — sitting directly over the full-viewport laboratory plate with no enclosing "page rectangle" around the pair of them. The pre-lookup state is `StandingReportRegion`, the same "calm, actively monitoring, nothing wrong yet" primitive Flight Commander's own Standing Watch panel uses — its radar-sweep visual (respecting `prefers-reduced-motion` by inheritance) reinforces "the laboratory is operational," not idle. No warning-toned copy or styling exists anywhere in the empty state (verified by test: no `.text-danger`/`.text-warning` node inside it).

---

## 8. Cross-Station Authority Reuse (Part J)

Verified by direct diff, not assumption: `git diff -U0` on the business-logic region of the file shows **zero** added or removed `function`/`const` declarations. `evaluate()`, `recommendationTone()`, `check()`, `selectItem()`, `addToInventory()`, `reserveNow()`, and every derived value (`catalogEntry`, `inventoryPosition`, `reservationEligibility`, `parsedAddQty`, `isAddQtyValid`) are byte-identical. The same canonical resolvers are still the only ones called: `resolveNeededByBuilds`, `resolveReservationEligibility` (the exact EWO-072 resolver Hangar Inventory's own row/modal also call), `calculateComponentAvailability`, `addHangarItem`, `reserveComponent` — all confirmed present by source-scan test, none duplicated.

---

## 9. Accessibility (Part K)

- Keyboard navigation: every interactive element is still a real `<button>`/`<input>` — none were replaced with a non-native equivalent.
- Focus visibility: unchanged (no focus-trap or custom tab order introduced by any new wrapper).
- Landmarks: `<h1>` (title) and `<p>` (designation) roles preserved exactly, confirmed by the pre-existing, unmodified test asserting `getByRole('heading', {level:1})` and `tagName === 'P'`.
- Screen-reader semantics: `QuartermasterIconHousing` adds an explicit `role="img" aria-label"` where the original bare icon had none — a minor, deliberate improvement, not a regression (a brief redundancy with the adjacent heading text was considered and judged acceptable, consistent with this component's own established, already-shipped contract).
- Reduced motion: `StandingReportRegion`'s monitoring visual inherits the same `prefers-reduced-motion`-respecting CSS every other consumer of it already relies on; no new animation was introduced.

No accessibility regression found.

---

## 10. Tests and Gates (Part L/N)

- **`tsc --noEmit`** — clean.
- **`vitest run`** — 232 files / 3035 tests passing. All 20 of Decision Center's own pre-existing behavioral tests (`DecisionCenter.test.tsx`, `ux003aDecisionCenterLootIntake.test.tsx`) pass **completely unmodified** — the single strongest evidence that Part J's "existing workflows unchanged" holds. One pre-existing, already-documented flaky-under-parallel-load test (`shipCardCommanderFlow.test.tsx`) was re-confirmed unrelated (passes cleanly in isolation).
- New coverage added: `App.test.tsx` (Flagship Environment exclusivity/viewport-shape for `/decision-center`) and `DecisionCenter.test.tsx` (Station Shell wrapper, CompartmentHeader placard, both `MountedWorkspacePanel`s, `OfficerBriefingBlock`, `StructuralDivider`, `StandingReportRegion` empty-state conformance, no-`EnvironmentBay`-import, canonical-resolver-reuse, no-new-top-level-function, Kit/Shell import presence) — covering every Part L item not already proven by the untouched pre-existing suite.
- **`npm run build`** — clean.
- **Production preview verification** — 6 representative routes served from `dist/`, confirmed clean.
- Live verification (port 5176, all 11 routes) — zero console errors, exactly one `flagship-frame` per route. Decision Center confirmed visually: the laboratory reads precise/analytical/engineering-toned, distinctly different from Mission Control's Bridge and Flight Commander's CIC (both re-screenshotted and confirmed unchanged from their own certified baselines). Port 5173 confirmed untouched throughout; Playwright installed `--no-save` and fully removed both passes.

---

## 11. Before/After

**Before:** header floating in plain space above a bordered, rounded `EnvironmentBay` cell; two ad hoc glass `.panel` divs inside it; a plain empty state with an unlabeled icon.

**After:** the laboratory plate is the full-viewport backdrop; the header is a mounted glass placard; a Quartermaster briefing introduces the compartment; both panels are canonical `MountedWorkspacePanel`s; the empty state is a `StandingReportRegion` with a housed icon. Every value, every verdict, every store mutation renders identically to before.

*(Screenshots held in the session's own scratchpad; available on request, per repository convention.)*

---

## 12. Residual Limitations

- `decision-center.webp` (the retired Beta-era master) is left in place, unused — matching this repo's own "masters stay in the repo as archival source" convention, never deleted without explicit direction.
- The Fleet Demand/Inventory Position sub-tiles and Applicable Target Loadout rows remain their own bordered sub-cards rather than a Kit primitive — a deliberate, documented non-substitution (§4), not an oversight.
- `MountedInstrument`'s own shape (short label+value) still cannot host sentence-length content — the same gap QDS-009 Part D already named for Hangar Inventory's own filter toolbar, now confirmed independently from a second Station.

## 13. Unrelated Finding — Flagged, Not Fixed

**`public/assets/environments/mission-control/mission-control-v2.webp` changed on disk during this session** (now 6688×3764, timestamped today; it was 1672×941 when EWO-114 registered it). This file is still untracked/uncommitted, so no git history captures the change. Its effect: EWO-114/115's own `environmentAssets.ts` entry for `mission-control` still points its `tablet` source directly at this file (assuming it was already right-sized), which would now serve a ~2.4MB, far-oversized image directly instead of a proper derivative. Re-running `generateEnvironmentAssets.ts` (done incidentally while producing this EWO's own new derivative) correctly produced a new `mission-control-v2-background-1920.webp` from the larger master — but `environmentAssets.ts` was not updated to point at it, since that fix belongs to EWO-114/115's own scope, not this one. **Not touched, not fixed — flagged for your decision**, exactly like every other unprompted art-asset change this session.
