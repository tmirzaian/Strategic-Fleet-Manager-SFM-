# EWO-114 — Mission Control Bridge Prototype

**Classification:** Quartermaster Edition Architecture Proof
**Priority:** Framework Validation
**Status:** Implemented. Held uncommitted pending Chief Architect certification.
**Authority:** ADR-004, ADR-005, QDS-001, QDS-004, QDS-006, EWO-109, EWO-110, EWO-113

Proves the Flagship/Station Shell/Station Kit architecture against its second real consumer — one deliberately chosen to be the opposite of the first. Mission Control becomes the Bridge: open, strategic, executive, calm, authoritative, expressed through the same framework Flight Commander's dense CIC already proved, without copying it.

---

## 1. Verdict

**The framework held.** Mission Control now consumes `StationEnvironmentMount` (Station Shell) and `CompartmentHeader` (Station Kit) — the same primitives Flight Commander consumes — while reading as an unmistakably different room. One narrow, well-understood extension to the Shell was required (§4); no new primitive was invented, and every business computation, every `data-testid`, and 89 of Mission Control's 90 existing tests were preserved completely unmodified (the 90th was updated for the deliberate environment-plate swap, §5).

---

## 2. Bridge identity decisions (both required by the work order to be resolved or documented)

### Header placement: kept outside the environment

Flight Commander's briefing wall sits *inside* its environment mount (`StationBriefingRegion`, EWO-109) — an operator embedded in the room they're briefing from. Mission Control's page header (`CompartmentHeader`) stays *outside* the mount, exactly where it already was pre-EWO-114. This is a deliberate Bridge identity choice, not the unresolved inconsistency QDS-004/QDS-006 both flagged as open: a Bridge officer's status line reads as a standing command placard above the observation window, the way a real ship's bridge nameplate sits above the viewport rather than stenciled onto the glass. Mission Control is free to express this — QDS-006's own governing rule is that Stations share structural language, not that every Station places its header identically.

### The partition-shaped Fleet Status metric: kept Station-owned

Fleet Status (one anchor metric — Ships Active — plus three bracketed sub-metrics) does not fit `MountedInstrument`'s flat, independent-metric shape, exactly as EWO-109 Part I's compatibility audit predicted. Inventing a new Kit partition primitive was explicitly out of scope ("without inventing new visual primitives"). Fleet Status therefore stays Station-owned and unextracted — the same disposition Flight Commander's own `IntelligenceControlRail`/`SourceVesselDossier` already have (EWO-109 Part E). No content, computation, or class name inside it changed.

---

## 3. What changed, structurally

| Element | Before | After |
|---|---|---|
| Page header | Hand-rolled `<p>`/`<h1>` pair | `<CompartmentHeader designation="Mission Control" title="Operations Standing By" />` — byte-identical rendered markup |
| Hero wrapper | Hand-rolled `relative overflow-hidden rounded-xl lg:border...` div + manual `<PageEnvironment>` call | `<StationEnvironmentMount environmentId="mission-control" minHeightClassName="lg:min-h-[576px]">` (Station Shell, EWO-109) |
| Fleet Status column | A `children`-position sibling inside the hand-rolled hero | Passed as `StationEnvironmentMount`'s `children` (its original single-rail slot) |
| Operations Center spacer | A manually-authored `aria-hidden` flex-1 div | The mount's own auto-filling spacer (identical mechanism, `min-h-[80px]` vs. the prior `min-h-[120px]` — a minor, undocumented-by-test, mobile-only difference, §6) |
| Priority Actions column | A `children`-position sibling after the spacer | Passed as the mount's new `secondaryRail` prop (§4) |
| Environment plate | `mission-control-operations-wall.webp` (2048×768, Beta era) | `mission-control-v2.webp` (1672×941) — the same commissioned-plate adoption pattern EWO-111 used for Flight Commander V2 |
| Corner-tick decorations | Hand-authored, hero-scoped | Unchanged, now passed inside `children` alongside Fleet Status |

Every `ActionCard`, `CriticalMetricTile`, `FleetStatusTile`, and `ReadinessRing` usage — props, values, class names — is untouched. No resolver, store selector, or computation was touched.

---

## 4. The one Shell extension this EWO required

`StationEnvironmentMount` (EWO-109) was built for Flight Commander's shape: one populated rail, then an auto-filling open space. Mission Control's real shape — two rails flanking an open window — cannot be expressed by that mechanism, because the mount's own spacer was fixed as the *last* rendered element. Two honest options existed: reimplement a parallel hero mount inside Mission Control (violating QDS-006 Part H's "compose, never reimplement" rule), or extend the existing mount minimally to host a second, legitimate rail shape.

`StationEnvironmentMount` gained one new optional prop:

```tsx
secondaryRail?: ReactNode  // rendered after the mount's own auto-filling spacer
```

When omitted, output is byte-identical to before — verified by Flight Commander's own full test suite passing unmodified. This is not a new visual primitive: no new component, no new visual language, no change to how the mount's environment/fade/spacer mechanics work. It is the Shell maturing to host its second real consumer, exactly the kind of finding EWO-109 Part I's compatibility table anticipated ("future extension point") and the kind of outcome the Chief Architect's own framing of this pairing asked for — "if it struggles, we've learned something before migrating five more Stations." Test coverage added: `src/components/stationShell/__tests__/StationShell.test.tsx`.

---

## 5. Verification

- **`tsc --noEmit`** — clean.
- **`vitest run`** — 232 files / 2978 tests, all passing. Of Mission Control's own 90 tests, 89 passed completely unmodified against the restructured markup; the 90th (`mounts PageEnvironment for "mission-control"...`) was updated to assert the new plate's filename instead of the retired one, matching the exact precedent EWO-111 set for Flight Commander V2. One companion assertion in `PageEnvironment.test.tsx` and one in `environmentAssets.test.ts` received the same, single-line update for the same reason.
- **`npm run build`** — clean production build.
- **Live verification (port 5176)** — all 11 routes confirmed exactly one `flagship-frame`/`flagship-threshold` and zero console errors. Mission Control's hero mount measured 576px tall with the full V2 plate visible edge-to-edge, no cropping. Screenshots at 1600px and an 800px stacked/mobile viewport both confirmed a clean, unbroken layout — an open, symmetrical bridge viewport flanked by calm glass panels, reading as a genuinely different room from Flight Commander's dense, instrument-mounted CIC. Port 5173 confirmed untouched throughout; Playwright installed with `--no-save` and fully uninstalled afterward.

---

## 6. Known, deliberately accepted minor difference

The Shell's own trailing spacer defaults to `min-h-[80px]` (mobile/stacked layout only — cancelled at `lg:` by `lg:min-h-0`), versus Mission Control's prior hand-authored `min-h-[120px]`. This is not parametrized by `StationEnvironmentMount`'s current props and was judged too minor (a stacked-layout-only spacer height, unasserted by any test, confirmed visually clean in the narrow-viewport screenshot) to justify a second prop addition in the same EWO that already added `secondaryRail`. Flagged here for completeness, not hidden.

---

## 7. Reading on the framework itself

Two Stations now share one shell and one kit while reading as unmistakably different places: Flight Commander is dense, embedded, instrument-on-glass; Mission Control is open, calm, window-and-flanking-panels. The one gap the framework had — no way to express a second rail — was real, found quickly, and closed with a two-line, backward-compatible addition rather than a workaround. That is the outcome this pairing was designed to produce.
