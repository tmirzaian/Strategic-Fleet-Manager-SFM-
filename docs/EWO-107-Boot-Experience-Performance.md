# EWO-107 — Boot Experience & Startup Performance

**Classification:** Quartermaster Edition Infrastructure / Performance Discovery / Boot Experience
**Authority:** ADR-004 (Quartermaster Edition Design Language), ADR-005 (Operational Command Structure), QDS-001 (Quartermaster Compartment Framework)
**Objective:** Eliminate the unbranded white-screen startup experience and identify the cause of the reported 10–12 second cold development load.
**Status:** Implemented and certified.

This work order was explicitly split into two independent tracks — a polished splash screen was never to be conflated with an actual performance fix. Both were pursued, and both are reported separately below.

---

## 1. Measured startup timeline (Part A)

Instrumented via `src/bootTelemetry.ts` (`performance.mark`/`measure`, gated behind `import.meta.env.DEV` so it is dead-code-eliminated from production) across all nine required checkpoints: index.html first paint, `main.tsx` module execution, React root creation, Zustand persist hydration start, migration completion, merge/reconciliation completion, first application render, selected route render, and the application-ready signal. Verified live via Playwright against `localhost:5176`.

**Dev server, cold (fresh `vite` process, first request to `/`):**

| Stage | Time (ms since navigation start) |
|---|---|
| `store-seed-baseline-built` | ~3080–3240 |
| `hydration-start` → `merge-complete` → `hydration-complete` | +5–8 |
| `main-module-start` | +10–17 after hydration |
| `react-root-created` → `first-render` | +80–90 |
| `ready` (wall-clock, before Part G route-splitting) | ~4.39s |
| `ready` (wall-clock, after Part G route-splitting) | ~3.36s |
| Warm reload (same server process) | ~0.71s |

**Production preview (`vite preview`, built bundle):** cold ~2.2s to splash removal, warm ~0.5s.

Note on ordering: `main-module-start` fires *after* the store-related stages above it. This is expected ESM behavior, not a defect — `main.tsx`'s own top-level code only runs after its full synchronous import graph (which transitively includes `useFleetStore.ts`) has already been evaluated.

## 2. Root-cause report

The application's own boot logic is **not** the bottleneck. `buildSeedFleetBaseline()` — the heaviest single computation in the boot path (materializing the 12-ship dev seed fleet) — measures 5–7ms even before its duplicate-call fix. Zustand's migrate/merge/hydration combined cost 3–8ms. React's own mount-to-first-commit is 80–190ms. None of this explains a multi-second delay.

The dominant, reproducible cost is **Vite's dev-mode per-module transform pipeline**. Vite serves unbundled ESM in development — every `.ts`/`.tsx` file is transpiled by esbuild on its first request, and the browser issues one HTTP request per module. On a cold server, loading `/` triggered 168 separate resource requests; several of the largest (statically-imported page components not needed on that route) each cost 600ms+ to transform. A render-blocking external Google Fonts `<link rel="stylesheet">` added a further 1.1–2.1s (network-variable) on top, gating first paint entirely.

**The literal 10–12 second figure reported by the Commander was not reproduced in this environment** — the worst measured cold load here was 4.39s (pre-fix). The measured mechanism (Vite's unbundled dev transform cost) fully explains the *class* of problem the Commander is experiencing; the remaining magnitude gap is most plausibly explained by machine-specific factors not present in this test environment — antivirus/disk-scanning overhead on `node_modules` during a genuinely cold Windows boot, a colder `.vite` dependency-optimization cache, or a much larger persisted fleet (many custom builds) than the 12-ship seed set used for measurement here. This is recorded as an open, unverified hypothesis, not dismissed.

## 3. Pre-render cost audit (Part F)

| Source | Measured cost | Blocks first render | Required before first render | Disposition |
|---|---|---|---|---|
| Google Fonts external stylesheet (`index.html`) | 1.1–2.1s | Yes (was) | No — system-font fallback is acceptable | **Fixed** — non-blocking `media="print"` swap pattern |
| 10 statically-imported non-initial route components | ~600ms each for the 4 heaviest (`ShipWorkspacePrototype`, `FlightCommander`, `MissionComposer`, `CaptainsLog`) on cold dev load | Yes (part of `main.tsx`'s synchronous import graph) | No — none of their code executes on `/` | **Lazy-loaded 7 of 10** — see Part G below for the 3 exceptions |
| `buildSeedFleetBaseline()`, previously called twice (module-init state + merge) | ~5–7ms per call | Yes | Yes — the store must be ready | **Fixed** — module-scope cache |
| Zustand persist `migrate`/`merge`/hydration | ~3–8ms combined | Yes | Yes | Kept synchronous — Part G forbids touching persistence architecture |
| React mount → first commit | ~80–190ms | Yes | Yes | Keep — genuine, necessary React work |
| `generated-data/*.json` catalog imports (`ports.json`, `configurable-slots.runtime.json`, `component-metadata-catalog.runtime.json`, etc.) | 45–200ms each individually in dev; folded into the production bundle | Yes — the store needs them on every route | Yes | Keep synchronous — restructuring this is an architecture-level change, out of Part G's low-risk scope |
| `React.StrictMode` dev-only double invocation | Not separately isolable in measurement | Dev-only | N/A | No action — intentional React behavior, not a defect |

## 4. Boot splash architecture (Parts B/D/E/H)

- **`index.html`** paints a static `#sfm-boot-splash` node — a DOM sibling of `#root`, never a child of it, so React's own mount can never implicitly clear it. Inline CSS only: `#071016` (the exact `bg-bg` Tailwind token) is set on `html`/`body`/`#root` before any other stylesheet loads, so nothing can flash white. Typography uses the system font stack only (no external font dependency for first paint) — the app's own Google Fonts swap in once loaded, same as the rest of the application. A CSS-only spinning ring emblem (gold, matching Quartermaster branding) replaces any need for new artwork. `prefers-reduced-motion: reduce` disables the fade transition and the emblem's spin animation.
- A **plain classic `<script>`** (not a module) defines `window.__sfmBootSplash` (`setStatus`/`ready`) and arms two independent `setTimeout`s — 8s → "COMMAND SYSTEMS ARE TAKING LONGER THAN EXPECTED", 20s → "COMMAND SYSTEM INITIALIZATION FAILED" plus a reload button — entirely independent of whether `/src/main.tsx` ever loads or executes, satisfying "must not block if JS fails."
- **`src/bootTelemetry.ts`** — the one narrow readiness coordinator (Part C). Composes existing lifecycle signals only: `reportHydrationComplete()`/`reportFirstRenderComplete()`. `onBootReady()` fires once, only when **both** are true — never on a timer. Also exposes `onBootStage()`, a stage-subscription API used solely to drive honest status text (Part E) without coupling DOM concerns into the coordinator itself.
- **`src/bootSplash.ts`** — relays real stages to the five approved status strings ("INITIALIZING COMMAND SYSTEMS" → "RESTORING FLEET MANIFEST" → "VERIFYING FLEET DATA" → "ESTABLISHING COMMAND LINK" → "OPERATIONS READY"), and calls `window.__sfmBootSplash.ready()` only once `onBootReady` fires. Catches up to any stage already recorded before it was wired, handling the ESM import-evaluation-order edge case in §1.
- Wired into `src/store/useFleetStore.ts` (`onRehydrateStorage`, `migrate`/`merge` marks), `src/main.tsx` (`main-module-start`, `react-root-created`, calls `wireBootSplash()` first), and `src/App.tsx` (`first-render`, `route-render` via `useEffect`).

## 5. Safe optimizations implemented (Part G)

- Deduplicated `buildSeedFleetBaseline()` — was computed unconditionally twice (module-init state and merge); now cached at module scope.
- Made the Google Fonts stylesheet non-render-blocking.
- Lazy-loaded 7 of the 10 non-initial routes (`HangarInventory`, `QuickUpdate`, `DecisionCenter`, `FleetRoadmap`, `CaptainsLog`, `ShipWorkspacePrototype`, `FlightCommander`) behind a `Suspense` boundary in `App.tsx`.

**Constraint found during verification:** `FleetDashboard`, `ShipDetail`, and `MissionComposer` were initially lazy-loaded too. Three pre-existing Commander-flow regression suites (`navigationFlow.test.tsx`, `shipCardCommanderFlow.test.tsx`, `shipImageCommanderFlow.test.tsx`) assert on these pages' content synchronously after in-app client-side navigation, and broke against the `Suspense` fallback. Retrofitting three large, narrative, multi-step pre-existing test files to await every lazy transition was judged higher-risk than the marginal extra transform cost of keeping these three pages static, so they were reverted to eager imports. One remaining synchronous assertion (against the now-genuinely-lazy `ShipWorkspacePrototype`, in `shipCardCommanderFlow.test.tsx`) was fixed to `findByTestId`.

`PERSIST_VERSION` and the persistence architecture (`migrate`/`merge`/`partialize` implementations) were not touched — only wrapped with non-mutating timing marks.

## 6. Files changed

- **Modified:** `index.html`, `src/main.tsx`, `src/App.tsx`, `src/store/useFleetStore.ts`, `src/__tests__/shipCardCommanderFlow.test.tsx` (one assertion made async)
- **New:** `src/bootTelemetry.ts`, `src/bootSplash.ts`, `src/__tests__/bootTelemetry.test.ts`, `src/__tests__/bootSplash.test.ts`, `src/__tests__/bootSplashIndexHtml.test.ts`, `src/__tests__/bootSplashIntegration.test.tsx` (21 new tests total, covering all 10 required Part I scenarios)

## 7. Before/after timings

| | Before | After |
|---|---|---|
| Dev cold (`/`, 168→124 resources) | ~4.39s | ~3.36s |
| Dev warm reload | ~0.71s | ~0.71s (unaffected, as expected — warm transform cache) |
| Production preview cold | — (not previously measured) | ~2.2s |
| Production preview warm | — | ~0.5s |

## 8. Tests and gates

21 new tests across 4 files cover every Part I scenario: immediate dark boot surface before `#root`; inline backgrounds on `html`/`body`/`#root` preventing any white flash; readiness gated on both hydration and first-render (never a timeout); splash removal only after real readiness; status advancing only through the 5 approved strings in real stage order; failure/long-wait state text and reload wiring without touching the dark surface; reduced-motion CSS present; existing (including now-lazy) routes render real content through `Suspense`; and `PERSIST_VERSION`/migrate/merge/`onRehydrateStorage` all confirmed unchanged and still wired on the live store.

Full suite: **228 files / 2897 tests passing.** `tsc --noEmit` clean. `npm run build` succeeds — the production bundle now contains 7 genuine separate lazy chunks. Production preview verified live via Playwright (screenshots confirmed dark-never-white first frame on both Mission Control and Flight Commander, in both dev and production preview; splash removed cleanly with no residual DOM node). Port 5173 confirmed untouched throughout. The temporary Playwright devDependency was fully reverted (`package.json`/`package-lock.json` diff is empty).

## 9. Residual performance risks

1. The production main JS chunk is still ~836KB gzip — a single bundle containing React, the four eager pages (Mission Control, Fleet Dashboard, Ship Detail, Mission Composer, Ship Management), and the full component/ship data catalogs pulled in via `import.meta.glob(..., { eager: true })`. Meaningfully reducing this requires `manualChunks` configuration and/or restructuring how catalog data is loaded — an architecture-level change, explicitly out of this work order's low-risk Part G scope.
2. The 10–12 second Commander-reported figure was not reproduced; the mechanism is understood and addressed, but the exact magnitude gap remains an open, unverified hypothesis (see §2).
3. `FleetDashboard`/`ShipDetail`/`MissionComposer` remaining eager imports is a test-suite constraint, not a technical one — revisitable if those three regression suites are ever modernized to async (`findBy`/`waitFor`) queries.
4. The 8s/20s long-wait/failure thresholds are heuristic, based on this session's measured worst-case (~4.4s pre-fix dev cold). Should be revisited if real Commander telemetry ever becomes available.
