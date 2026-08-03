# EWO-115 — Flagship Shell Amendment

**Classification:** Quartermaster Edition — Flagship Shell Amendment / Navigation Reinterpretation / Bridge Visual Architecture
**Priority:** Implementation
**Status:** Implemented. Held uncommitted pending Chief Architect and Commander visual certification.
**Authority:** ADR-004, ADR-005, QDS-004, QDS-005, QDS-006, EWO-113, EWO-114

Removes the remaining Beta 2.1 "sidebar beside page canvas" presentation. The application viewport is now one continuous flagship environment: a persistent branding bulkhead, a Station Access Panel, the active compartment, and — on Mission Control specifically — Station interfaces mounted directly into that compartment.

---

## 1. Root-cause audit (Part A)

| Element | Classification | Disposition |
|---|---|---|
| Sidebar's opaque `bg-panel/60 backdrop-blur-sm` background | Legacy Beta 2.1 presentation | Replaced with `bg-bg/70 backdrop-blur-md` — a translucent bulkhead |
| Sidebar's own `border-r border-white/5` | Legacy Beta 2.1 presentation (duplicated `FlagshipThreshold`) | Removed — the Threshold is the one authoritative seam |
| `<main>`'s `max-w-[1400px]` content inset | Required structural boundary (text-content readability) | Kept for content; decoupled the *backdrop* from this constraint |
| `StationEnvironmentMount`'s bordered `rounded-xl lg:border` hero cell | Legacy presentation for a full-viewport Station (Mission Control); required structural boundary for still-unmigrated Stations | Removed for Mission Control only (Part F); unchanged everywhere else (Part I) |
| `FlagshipFrame`'s background, confined inside `<main>` | Legacy presentation (stopped at the Sidebar's edge) | Promoted to `FlagshipEnvironmentLayer`, a `position: fixed` layer behind the entire viewport |
| Mission Control's `CompartmentHeader` sitting outside/above the hero | Legacy presentation, Mission-Control-specific | Mounted onto its own glass placard directly over the Bridge (Part G) |
| Rounded/bordered brand-lockup and nav consoles | Required structural boundary — this **is** the "mounted console" look Parts C/D ask for | Kept, reframed conceptually as the Station Access Panel |
| `FlagshipThreshold`'s vertical seam | Required structural boundary, already correct | Kept; now the sole seam once Sidebar's own border was removed |

No visual edits were made until this audit was complete, per the work order's own instruction.

---

## 2. Flagship viewport architecture (Part B)

New: `src/components/flagship/FlagshipEnvironmentLayer.tsx` — a `position: fixed; inset: 0; z-0` layer, rendered once in `App.tsx` as the very first element, entirely outside the Sidebar/Threshold/`<main>` flex row. Two sub-layers, always in this order: the ambient radial gradient (EWO-113's original treatment, present on every route) and, only when an `environmentId` is supplied, that Station's own commissioned plate on top of it, full-bleed, with no border or rounding.

`App.tsx` supplies `environmentId="mission-control"` only when `location.pathname === '/'` — App's own route knowledge driving a typed asset identifier, not a special-case Sidebar/Station implementation (Part I). Every other route falls back to the ambient gradient alone, unchanged from EWO-113.

`FlagshipFrame` was simplified to a pure layout wrapper (`relative z-10`, no background of its own) — its former background role is now `FlagshipEnvironmentLayer`'s, avoiding a duplicate "independent page background."

Sidebar and `<main>` both render with `relative z-10`, stacking above the fixed backdrop; DOM order (backdrop painted first) does the rest.

---

## 3. Branding bulkhead (Part C)

Unchanged in content and proportion — the existing brand-lockup console (`mx-3 mt-3 mb-1 rounded-lg border border-white/5 bg-white/[0.02]`) already read as a dark structural bulkhead, not a standalone web card (no shadow, no elevation). It now sits on the Sidebar's own translucent bulkhead background rather than a solid opaque one, so it remains legible over every Station environment (verified over Mission Control's own bright Bridge plate) without growing, animating, or changing per Station.

---

## 4. Station Access Panel (Part D)

Sidebar's existing navigation list is reinterpreted, not rebuilt: the mounted-cell framing (`rounded-lg border border-white/5 bg-white/[0.02]`, individual `NavLink` cells) already satisfied "mounted control cells... compact... structural framing... restrained cyan illumination." Changes made:

- `<nav aria-label="Station Access">` — an explicit accessible name for the landmark.
- `focus-visible:ring-2 focus-visible:ring-cyan/60` added to every cell — a visible focus state that wasn't previously explicit.
- Active-state indication is `aria-current="page"` (React Router `NavLink`'s own default) plus the existing cyan inset ring — never color alone.
- No gold command-attention detail was added to the active cell: EWO-111's own gold-discipline finding ("why is this gold? because the Commander should notice this first") already established that navigation state doesn't warrant it; the option was considered and deliberately not used.
- Route order and route set are unchanged.

---

## 5. Removing the sidebar/page divide (Part E)

Sidebar's own `border-r` was removed (§1) — `FlagshipThreshold` (EWO-113) is now the one seam, avoiding the "two independent rectangles" impression of a bordered nav column next to a bordered content column. Combined with the translucent bulkhead and the full-viewport backdrop, the Sidebar now reads as physically attached to the same lit compartment as the content, not a separate panel beside a separate page.

---

## 6. Mission Control Bridge recomposition (Part F)

`MissionControl.tsx`'s hero no longer uses `StationEnvironmentMount` — its bordered/rounded cell is exactly the "obvious rectangular image card boundary" Part B prohibits for a full-viewport Station. The Bridge plate now renders as `FlagshipEnvironmentLayer`'s own full-viewport backdrop (§2). Fleet Status and Priority Actions render as mounted glass rails (`panel lg:bg-panel/55 lg:backdrop-blur-md`, unchanged from EWO-114) directly flanking a genuinely open observation window (`lg:min-h-[520px]`, no border) — not columns inside a bordered card. The three-part structure, every `ActionCard`/`CriticalMetricTile`/`FleetStatusTile`/`ReadinessRing` usage, and all business computations are unchanged from EWO-114.

---

## 7. Header integration (Part G)

`CompartmentHeader` (EWO-110, unchanged, not duplicated) now mounts on its own translucent glass placard (`rounded-lg bg-black/35 backdrop-blur-md border border-white/10`) directly over the Bridge environment, reading as a standing command plate on the threshold rather than a conventional page heading floating in plain space above a bordered hero card.

---

## 8. Workspace continuation (Part H)

Because the Bridge plate is now a `position: fixed` layer, it would otherwise remain visible behind every section of the page indefinitely as the Commander scrolls — "one giant background photograph." A single depth-fade scrim (`data-testid="bridge-depth-scrim"`) — one CSS gradient, transparent at the hero, fully resolved to flagship dark (`#071016`) by 900px down, then flat for any remaining height (a gradient holds its last stop's color past the final explicit stop) — is rendered as the first child of Mission Control's own root, behind its content. A `StructuralDivider` (`variant="section-break"`, Station Kit) marks the transition from the open window into the workspace deck below. Top Priority Ship, Quartermaster Report, and Execute Orders all sit on fully resolved flagship dark by the time they're visible — confirmed in the full-page screenshot (§12).

---

## 9. Cross-route impact (Part I)

Only the global `FlagshipEnvironmentLayer` and Station Access Panel changes apply across all routes; no other Station was visually migrated. Flight Commander's own `StationEnvironmentMount` usage — bordered, rounded, unchanged — was confirmed structurally (`src/__tests__/App.test.tsx`, Part L item 10) and visually (§12) to be pixel-identical in composition to its certified EWO-111 baseline. Legacy Stations (Fleet Dashboard, etc.) render on the ambient-gradient-only backdrop, confirmed stable via the full route sweep (§11) and a screenshot (§12). No route required any special Sidebar implementation — the single `environmentId` prop threaded from `App.tsx`'s own route knowledge is the only route-awareness anywhere in the shell.

---

## 10. Accessibility (Part K)

- Semantic landmark: `<nav aria-label="Station Access">` (was an unlabeled `<nav>`).
- Active-route indication: `aria-current="page"` (never color alone) — verified per-route in `App.test.tsx`.
- Keyboard operation: every Station Access Panel entry is a real `<a href>` (native Tab order, Enter activation) — verified structurally; a live Tab press lands on a real anchor element.
- Visible focus state: `focus-visible:ring-2 focus-visible:ring-cyan/60` added to every nav cell.
- Reduced motion: no new `animate-*` class was introduced anywhere in this amendment (verified by source scan) — the only transition (`transition-colors`) is a pre-existing, brief color change, not a decorative motion effect.
- Readable contrast: branding and nav text confirmed legible over Mission Control's own bright Bridge plate in the live screenshot (§12); the Sidebar's `bg-bg/70 backdrop-blur-md` was chosen specifically to balance "environment extends beneath the bulkhead" against "navigation legibility is never compromised" (Part B/E's own explicit tension) — a considered trade-off, not maximum transparency.

---

## 11. Responsive behavior (Part J)

No mobile-navigation redesign was attempted, per the work order's own Non-Goal. Verified at 1024px (a narrower desktop width, not mobile): branding remains legible, the Station Access Panel remains operable, the two rails hold their fixed width while the open window between them compresses, and zero horizontal overflow was measured (`document.documentElement.scrollWidth - window.innerWidth === 0`) at both 1600px and 1024px, across all 11 routes.

---

## 12. Tests and gates (Part L/N)

- **`tsc --noEmit`** — clean.
- **`vitest run`** — 232 files / 3024 tests, all passing. New coverage added to `src/__tests__/App.test.tsx` for all 16 of Part L's checklist items (exactly one `FlagshipFrame`/Station Access Panel per route; `aria-current` per nav-listed route; keyboard/focus structure; branding persistence; `FlagshipEnvironmentLayer`'s full-viewport, borderless shape; Mission Control's exclusive use of the Bridge plate; header integration/no duplication; Flight Commander's unchanged bordered hero; no business-authority imports in Flagship/Sidebar files; no persistence changes; no new `animate-*` classes). Three pre-existing Mission Control tests were updated (not deleted) to reflect the environment's move from a per-page layer to an app-wide one — the underlying behavior each protected is still asserted, just at its new, correct location.
- **`npm run build`** — clean production build.
- **Live verification, dev server (port 5176)** — all 11 routes: exactly one `flagship-frame`/Station Access Panel/`flagship-environment-layer`, zero console errors, zero horizontal overflow, first Tab stop lands on a real link.
- **Production preview verification** — 7 representative routes served from the built `dist/`, confirmed clean.
- Port 5173 confirmed untouched throughout; Playwright installed `--no-save` and fully removed both times (`git diff --stat package.json package-lock.json` empty).

---

## 13. Before/after

**Before** (captured during EWO-114's own verification, prior to any EWO-115 change): Mission Control's header sits as a conventional page heading above a bordered, rounded hero card; the Sidebar is a solid opaque column with its own hard `border-r`; Fleet Status/Priority Actions sit inside that one bordered rectangle.

**After**: the Bridge plate is the full-viewport backdrop, visible behind the Sidebar's own translucent bulkhead; the header is a mounted glass placard directly on the Bridge; Fleet Status/Priority Actions are open-mounted rails with no enclosing card; Top Priority Ship and everything below sit on fully resolved flagship dark, not lingering artwork. Flight Commander and Fleet Dashboard are visually unchanged from their own certified baselines.

*(Screenshots held in the session's own scratchpad; not embedded in this doc per repository convention — available on request.)*

---

## 14. Residual limitations

- The Sidebar's translucency (`bg-bg/70`) is a deliberate, conservative balance favoring legibility over maximum environment bleed-through — a fully transparent bulkhead was considered and rejected as risking Part K's own contrast requirement over brighter future Station plates.
- `FlagshipThreshold`'s own visual treatment was not further enhanced beyond removing Sidebar's redundant border; it already read as more than a flat divider (EWO-113) and a second pass was judged unnecessary risk for this EWO's scope.
- The depth-fade scrim's 900px resolve distance was tuned against Mission Control's own current content length at the reference viewport; a Station with a much taller "above the fold" hero in the future may need this value revisited (the mechanism itself — one CSS gradient, no JS measurement — is stable and reusable as-is).
- No other Station was migrated onto the full-viewport model, per explicit Non-Goal (Part I) — Flight Commander and every legacy Station remain exactly as previously certified.
