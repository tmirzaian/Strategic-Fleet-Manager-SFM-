# EWO-113 — Flagship Framework Integration

**Classification:** Quartermaster Edition Infrastructure
**Priority:** Foundational Framework Implementation
**Status:** Implemented. Held uncommitted pending Chief Architect certification.
**Authority:** ADR-004, ADR-005, QDS-001, QDS-004, QDS-006, EWO-109, EWO-110

Builds the Flagship layer above the Station Shell, per QDS-006 Part H's ownership chain extended one level: `Flagship → (Environment → Shell → Kit → Workspace, per-Station)`. Infrastructure only — no business logic, no Station redesign, no migration, no new artwork, exactly as the work order's own Non-Goals require.

---

## 1. What "Flagship" means here

Before this EWO, the only persistent layer shared by every Station was `Sidebar` + `AppFooter` + a flat `bg-bg` (`#071016`) applied once in `App.tsx` — QDS-006 Part A's own audit finding. A Station with a commissioned environment (Flight Commander) and a Station with none (Fleet Dashboard) sat on visually identical, featureless backgrounds, and nothing marked the seam between "navigation chrome" and "the ship itself" beyond the Sidebar's own existing right-hand border.

Two components now occupy that gap, both new, both under `src/components/flagship/` — a third top-level component directory, deliberately separate from `stationShell` and `stationKit`:

- **`FlagshipFrame.tsx`** — wraps the routed-content area in a subtle radial-gradient ambient background (`rgba(53,208,255,0.035)` at 50% -15%, over the existing `#071016`), replacing the flat single-color background with the first step toward QDS-006 Part F's "environmental continuation," not a full realization of it.
- **`FlagshipThreshold.tsx`** — a persistent vertical bulkhead marker, rendered as a sibling immediately between `<Sidebar />` and `<main>`, satisfying Objective 2's "immediately to the right of the sidebar" literally.

---

## 2. Ownership boundary (extends QDS-006 Part H)

| Responsibility | Owned by | Evidence |
|---|---|---|
| Ambient background shared by every Station | **Flagship** (`FlagshipFrame`) | Takes no props, no per-Station awareness — see §4 |
| Navigation → Bulkhead threshold marker | **Flagship** (`FlagshipThreshold`) | Rendered once in `App.tsx`, outside `<Suspense>`, never remounts between Stations |
| The seam's own visual treatment (gradient divider) | **Station Kit** (`StructuralDivider`, `variant="vertical"`) | Composed, not reimplemented — `FlagshipThreshold` adds only a soft glow container around it, per the "a lower tier composes the tier above it, never reimplements it" rule (QDS-006 Part H, first applied EWO-109/110, now proven one level higher) |
| Sidebar's own right-hand border | **Sidebar, unchanged** | Already a de facto bulkhead edge (QDS-004 Part J, reaffirmed QDS-006 Part A) — not touched, not softened |
| Per-Station environment (`StationEnvironmentMount`) | **Station Shell, unchanged** | Layers on top of the Flagship's ambient base, independent of it — verified visually in §5 |
| Footer transition | **Still open, not resolved here** | `FlagshipFrame` deliberately wraps only the routed-content `<div>`, never `AppFooter` — QDS-006's own open question stays untouched |

---

## 3. `App.tsx` wiring

```jsx
<div className="flex min-h-screen bg-bg text-white">
  <Sidebar />
  <FlagshipThreshold />
  <main className="flex-1 min-w-0 max-w-[1400px] flex flex-col">
    <FlagshipFrame>
      <div className="flex-1 px-6 py-8 md:px-10 md:py-10">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>...</Routes>
        </Suspense>
      </div>
    </FlagshipFrame>
    <AppFooter />
  </main>
</div>
```

Because both components live in the one global shell, every route inherits them automatically with zero per-page changes — satisfying Objective 4 ("every Station inherits the same structural language") and the Non-Goal ("no Station redesign, no migration") simultaneously. This is the first EWO in the Quartermaster Edition series to touch `App.tsx` itself rather than a single Station.

---

## 4. Structural independence

`src/components/flagship/__tests__/Flagship.test.tsx` uses generic invented content ("probe"), matching the precedent set by `stationShell`/`stationKit`'s own test suites, and includes the same import-scanning proof: every Flagship source file is checked against a forbidden-fragment list (`useFleetStore`, `/pages/`, `flightCommanderPresentation`, `shipDefinitions`, etc.) to verify structurally — not just by convention — that the Flagship layer knows nothing about any Station's own business logic.

---

## 5. Verification

- **`tsc --noEmit`** — clean.
- **`vitest run`** — 232 files / 2977 tests, all passing (5 new, added by this EWO; zero regressions).
- **`npm run build`** — clean production build.
- **Live verification (port 5176, all 11 routes)** — a Playwright pass confirmed exactly one `flagship-frame` and one `flagship-threshold` render on every route (`/`, `/fleet`, `/ship`, `/loadout-manager`, `/ship-workspace`, `/flight-commander`, `/hangar`, `/quick-update`, `/decision-center`, `/roadmap`, `/log`). Screenshots of Mission Control and Flight Commander confirmed the new ambient gradient and threshold render correctly and do not clash with Flight Commander's own certified EWO-111 baseline — the bulkhead doorway plate, dossier spacing, and gold discipline are all unchanged. Port 5173 confirmed untouched throughout; Playwright was installed with `--no-save` and fully uninstalled afterward (`git diff --stat package.json package-lock.json` empty).

---

## 6. Non-Goals confirmed held

No business logic was added. No Station's own page file was modified beyond `App.tsx`'s shared shell. No migration of any Station onto Flagship-aware content occurred — every Station still renders exactly the content it rendered before, now simply sitting on the shared ambient base. No new artwork was introduced or consumed.
