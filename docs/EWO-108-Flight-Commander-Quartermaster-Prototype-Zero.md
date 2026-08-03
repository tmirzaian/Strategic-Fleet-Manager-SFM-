# EWO-108 — Flight Commander: Quartermaster Prototype Zero

**Classification:** Quartermaster Edition / Prototype Zero / Visual Architecture and UX Implementation / Existing Authority Consumer
**Authority:** ADR-004, ADR-005, QDS-001, QDS-002 (once certified), QDS-003
**Existing functional authority:** EWO-104 and certified Amendments 1-3
**Status:** Implemented. Held uncommitted pending Chief Architect and Commander visual certification.

Transforms Flight Commander from a conventional dashboard into the first complete Quartermaster Edition Station — presentation and interaction architecture only. The Factory Loadout Target Intelligence resolver, ranking, acquisition boundary, and source-variant filtering are unchanged (Part Q).

---

## 1. Before/after Station architecture

**Before (EWO-104 + Amendments 1-3):** page header → 220px hero banner (summary cards in a left column) → filter bar (`.panel`) → a `<table>` roster with a sticky `<thead>` → a unified "Operational Briefing" empty-table state that re-mounted a second, dimmed copy of the hero artwork.

**After (EWO-108):** one continuous 560px-tall CIC environment mount containing the Station Briefing Header and Tactical Instruments in its dark left band, fading via a bottom gradient into the page's own background — never a hard hero/webpage cutoff. Below it, a sticky Intelligence Control Rail, then a list of Source Vessel Dossiers (image + identity + category glyphs + matched-component blocks), replacing the `<table>` entirely. Standing Watch is a full first-class report sharing the same one CIC mount, never a second copy.

## 2. Files changed

**Modified:** `src/pages/FlightCommander.tsx` (orchestrator, fully rewritten), `src/index.css` (reduced-motion gate added), `src/pages/__tests__/FlightCommander.test.tsx` (rewritten for the new architecture).

**New (page-scoped, `src/pages/flightCommander/`, per Part P — not extracted to `src/components/`):** `StationBriefingHeader.tsx` (Part D), `TacticalInstruments.tsx` (Part E), `IntelligenceControlRail.tsx` (Part F), `SourceVesselDossier.tsx` (Part G/H/J), `QuartermasterGlyphFrame.tsx` (Part I), `StandingWatchPanel.tsx` (Part L), `__tests__/SourceVesselDossier.test.tsx` (14 new tests).

**Untouched:** `src/utils/factoryLoadoutTargetIntelligence.ts`, `src/utils/flightCommanderPresentation.ts`, `src/utils/flightCommanderComponentIdentity.ts`, and all four of their existing test files (53 tests, all still passing) — the resolver, presentation-filtering, and identity-formatting authority layers were never opened.

## 3. Authorities consumed

`resolveFactoryLoadoutTargetIntelligence()` (EWO-104), `buildFlightCommanderPresentation()` (Amendment 1), `describeComponentIdentity()` (Amendment 3) — all called exactly as before, with zero new parameters. `resolveShipImage()` and `<ShipImage>` (the app's existing, single ship-image authority) for dossier thumbnails. `CANONICAL_COMPONENT_CATEGORY_ICON`/`_LABEL`/`CANONICAL_STABLE_CATEGORY_KEYS` (componentCategoryIcon.ts) for every category glyph — no new taxonomy anywhere.

## 4. Confirmation: no intelligence logic changed

`resolveFactoryLoadoutTargetIntelligence()` was not opened. `deriveDemandComponents()`, `isCommanderManagedBuild()`, the ranking sort, `buildFlightCommanderPresentation()`'s cosmetic-variant/actionable-category filtering, and `describeComponentIdentity()`'s catalog lookups are byte-for-byte unchanged. Proof: all 53 pre-existing tests in `factoryLoadoutTargetIntelligence.test.ts`, `.emptyData.test.ts`, `flightCommanderPresentation.test.ts`, and `flightCommanderComponentIdentity.test.ts` pass unmodified (Part R.1/3/4/5/6/11/12/22). `FlightCommander.tsx` calls the resolver exactly once per render, confirmed by a dedicated test (Part R.2).

## 5. Environmental composition implementation

The `flight-commander` `PageEnvironment` mount grew from `lg:min-h-[220px]` to `lg:min-h-[560px]` — the same single 6684×3764 source asset, no new artwork, `background-position: center` unchanged. At the taller height the container's aspect ratio moves closer to the source image's own 1.78:1 ratio, so `background-size: cover` reveals genuinely more of the same photograph (the CIC's overhead holo-displays and floor light strips) rather than cropping tighter. A `bg-gradient-to-b from-transparent to-bg` layer spans the bottom 112–160px of the container so the artwork dissolves into the page's own `#071016` background instead of ending at a hard rectangular edge. The Station Briefing Header and Tactical Instruments are mounted in the image's own dark left two-fifths (confirmed by direct visual inspection, the same region Amendment 3 already used for summary cards). Presentation values (`opacity/brightness/contrast/saturation: 1.0`, `blurPx: 0`) are unchanged — crisp artwork preserved. Standing Watch deliberately does **not** re-mount a second copy of the environment (Amendment 3's panel did); confirmed by a test asserting exactly one `[data-environment-id="flight-commander"]` node exists in both states.

## 6. Summary-instrument implementation

The four certified metrics (Source Ships Identified, Priority Components, Fleet Requirements, High-Value Targets) render from the exact same `FlightCommanderPresentation` fields as before. Redesigned as `TacticalInstruments`: a recessed `bg-black/30` housing, a thin cyan hairline top-border, and corner ticks matching the glyph-housing language — reads as one mounted instrument system rather than a card grid. Quartermaster Gold stays limited to the value itself; cyan is the only informational/structural accent. Grid layout (`grid-cols-2`) and padding are unchanged from Amendment 3, so the footprint did not grow.

## 7. Control-rail implementation

`IntelligenceControlRail` preserves the certified search behavior (same placeholder, same `aria-label="Search target roster"`) and the same five category pills byte-for-byte — restyled as a recessed `bg-black/30` rail instead of a plain `.panel`. Active-filter state now uses gold (a "Commander's current focus" command-attention accent, consistent with Part E.1's gold-usage rule) rather than cyan. `focus-visible` outlines were added to both the search input and every pill (a real, if minor, accessibility improvement — not present before).

## 8. Dossier architecture

`SourceVesselDossier` replaces one `<table>` row with a self-contained card: ship thumbnail → name → manufacturer/role (only when the canonical `ShipDefinition` has them) → five category glyphs, then a per-matched-component block (name → technical identity line → one or more `Needed: Ship • Build ×N` destination lines). Reading order matches Part G exactly: Source Vessel → Useful Factory Equipment → Required By Commander Fleet. No `<table>`/`<colgroup>` remains — Part K explicitly authorized dropping the literal table implementation as long as the underlying operational requirement (persistent category context during a long scroll) survived, which it does via the sticky control rail (§9).

## 9. Source-image authority

Audited (Part H) rather than built new: `resolveShipImage()` (`src/utils/resolveShipImage.ts`) already accepts anything shaped like `{ id, imageUrl?, image? }`, and `ShipDefinition` ("Catalog/game data describing a ship model. Never implies ownership.") satisfies that shape directly. Precedence used, unchanged from the existing authority: (1) the canonical `SHIP_IMAGE_URLS` registry, (2) the definition's own `image.primaryUrl`/`imageUrl`, (3) `SHIP_PLACEHOLDER_URL` (`/images/ship-placeholder.png`), the existing neutral repository placeholder — via `<ShipImage>`, the same component every other ship-photo surface in the app already uses. A Commander's custom per-owned-ship photo cannot leak into this path **by construction**: that data lives exclusively on the separate `Ship`/`FleetAsset` types, and `SourceVesselDossier` never receives or reads either — proven directly by a dedicated test (Part R.9). No new resolver, no raw image paths.

## 10. Glyph prototype

`QuartermasterGlyphFrame` (Part I) wraps the existing Lucide category icons in a structural housing: a bordered square with corner ticks (recessed equipment-category frame), a restrained cyan border when unmatched, and a gold border/glow when matched — the same visual language reused for both the dossier category-match row and (implicitly, via the shared hairline/corner-tick treatment) the Tactical Instruments. Scoped to `src/pages/flightCommander/` only, per Part I's explicit "prototype, not the final application-wide glyph library" instruction. No raster artwork generated; no new taxonomy (icons/labels still come from `componentCategoryIcon.ts`).

## 11. Technical metadata presentation

`describeComponentIdentity()` (Amendment 3, untouched) already produces exactly the shape Part J asks for — `S{size} {Category} • {classification}` for non-weapons, `S{size} {classification}` for weapons (the classification string already encodes family+subtype, e.g. "Ballistic Repeater") — and already omits itself entirely when unresolvable, never fabricating a value. **Not extended to surface the catalog's `grade` field**: no display convention for it exists anywhere else in the app, and Part J's own phrasing ("such as... grade") is a menu of examples, not a mandate; adding one on the fly risked inventing an unreviewed convention. Recorded as a residual note (§18), not a defect.

## 12. Standing Watch behavior

First-class report (Part L), not an empty state — exact required copy, in full, in `StandingWatchPanel.tsx`. Renders whenever `factoryDataAvailable && !hasActionableDemand` (identical branch condition to the old Amendment 3 empty state — no eligibility logic changed). Tactical Instruments still render alongside it with real (possibly zero) values — never hidden, never fabricated. Reuses the existing radar-sweep CSS animation (no new artwork) as the "active monitoring" indicator behind the Intelligence Status list; a real, pre-existing gap was found and fixed while wiring this — no `prefers-reduced-motion` rule existed anywhere in `index.css` before this EWO, so it was added (§16, verified live in a real browser: the animation computes to `none` under the emulated preference).

## 13. Cross-Station handoffs

Unchanged in destination (every `Needed:` line still deep-links to `/ship-workspace/:shipId`), visually strengthened per Part N: the line now reads `Needed: {Ship} • {Build} ×{N}` (Part J's own example shape) instead of a bare arrow. No mutation controls were added anywhere — confirmed by a dedicated test asserting zero `<button>` elements exist inside a dossier and that every page-level button matches the known filter-pill set.

## 14. Responsive behavior

A real regression was found and fixed during live 390px-viewport verification: the control rail's `min-w-[220px]` search box and a non-wrapping category-glyph row both forced horizontal overflow beyond the app's existing (pre-existing, out-of-scope per Part O) fixed-sidebar baseline. Fixed by making the search box `min-w-0 sm:min-w-[220px]` and making the dossier identity row `flex-wrap` so the glyph strip drops to its own line at narrow widths. Re-measured live: Flight Commander's `document.documentElement.scrollWidth` at 390px now matches Mission Control's own baseline exactly (463px), confirming zero incremental regression.

## 15. QDS-001 reusable-primitives findings (Part P)

**Proved reusable** (a real, consistent visual system emerged across three independent components without being planned as one upfront): the recessed-housing + cyan-hairline + corner-tick treatment (`QuartermasterGlyphFrame`, `TacticalInstruments`, and — more loosely — `IntelligenceControlRail`'s own recessed bar) is a legitimate candidate for a future shared "Mounted Instrument" primitive (QDS-001 Part G already named this category; this EWO is its first second implementation after Flight Commander's own original summary cards). The "sticky control rail replaces sticky table header, same operational requirement" pattern (Part K) is a candidate for QDS-001's own "Sticky Workspace Header" primitive to formally support a non-table variant.

**Remains Flight Commander-specific:** the dossier's exact field set (image/manufacturer/role/glyphs/matches) is intelligence-domain content, not a generic card shape; the Standing Watch copy is this Station's own voice (QDS-003 Part D); the CIC environmental-extension technique (§5) depends on this specific artwork's own composition (a wide interior scene with dark negative space on one side) and should not be assumed to transfer to a differently-composed hero image without re-auditing.

**Explicitly not extracted** — no shared component was added to `src/components/`; every new file lives under `src/pages/flightCommander/` and is imported only by `FlightCommander.tsx`, per Part P's "no broad cross-page migration."

## 16. Tests and gates

`tsc --noEmit` clean. Full suite: **229 files / 2908 tests passing** (42 new/rewritten across `FlightCommander.test.tsx` (28) and the new `SourceVesselDossier.test.tsx` (14), plus all 53 pre-existing resolver/presentation/identity tests passing untouched). `npm run build` succeeds; the `FlightCommander` lazy chunk grew from 4.44kB to 5.13kB gzip (new subcomponents), still small. Production preview verified live. All 22 of Part R's required scenarios are covered — see the two new test files' own per-test EWO-108 Part references.

## 17. Browser walkthrough

Both states verified live on port 5176, dev and production preview: **Intelligence Active** (dev, seeded fleet) — 6 real source-vessel dossiers rendered end to end with real ship images, manufacturer/role lines, gold-lit matched category glyphs, technical identity lines, and working deep-links; sticky control rail confirmed via scroll; keyboard-only search and filter-pill activation confirmed via Playwright keyboard events (Tab-equivalent focus + type/Enter). **Standing Watch** (production preview, empty fleet — see §18) — exact required copy confirmed rendered, single environment mount confirmed, zero console errors. Reduced-motion confirmed live: `.animate-radar-sweep`'s computed `animation-name` is `none` under `prefers-reduced-motion: reduce`. Port 5173 confirmed untouched throughout. Temporary Playwright devDependency installed with `--no-save` and left `package.json`/`package-lock.json` with an empty diff.

## 18. Residual limitations

The production build used to verify Standing Watch was built without `VITE_SFM_DEV_SEED_FLEET=true`, so that specific live screenshot is from an empty fleet rather than a real "demand satisfied down to zero" transition triggered through the UI — the underlying condition (`factoryDataAvailable && !hasActionableDemand`) is identical either way and is exhaustively covered by automated tests, but a live "watch a real dossier list transition into Standing Watch after resolving the last requirement" screenshot was not captured (no store-mutation harness was available to force it safely without touching live UI workflows outside this EWO's scope). The catalog's `grade` field is not surfaced (§11). The production main JS bundle remains ~836KB gzip (pre-existing, EWO-107's own documented residual risk, unrelated to this EWO). The CIC environmental-extension technique is specific to this one hero image's composition (§15) and should be re-audited, not copy-pasted, if ever applied to another compartment.

## 19. Commit hash

Held uncommitted pending Chief Architect and Commander visual certification, per Part T. To be recorded here only after certification.
