# SW-013B — Ship Workspace Promotion: Navigation Audit

Companion to `docs/ADR/ADR-016-Ship-Management-Workspace-Architecture.md` §11. Records the deep-link audit, live context-preservation and Commander-acceptance validation, and regression results for the SW-013B navigation-promotion sprint. No architecture, workspace responsibility, or workflow changed this sprint — navigation targets only.

## 1. Deep-Link Audit

Every live entry point into ship-scoped navigation was located by repo-wide search and classified as changed, deliberately unchanged, or dead code.

**Changed — now route to `/ship-workspace/:id`:**

| File | Surface | Before | After |
|---|---|---|---|
| `src/components/ShipCard.tsx` | Fleet Dashboard card view, Mission Control priority cards (the canonical click-anywhere card, EWO-032) | `/ship/:id` | `/ship-workspace/:id` |
| `src/pages/FleetDashboard.tsx` | Table view row action | `/ship/:id`, label "Ship Detail" | `/ship-workspace/:id`, label "Ship Workspace" |
| `src/components/FleetStatusTile.tsx` | Mission Control ship-name links | `/ship/:id` | `/ship-workspace/:id` |
| `src/pages/MissionComposer.tsx` | Loadout Manager cross-link | `/ship/:id`, label "View in Ship Detail" | `/ship-workspace/:id`, label "View in Ship Workspace" |
| `src/components/Sidebar.tsx` | Primary nav | Last item, "Ship Workspace (Prototype)", `FlaskConical` icon | 3rd item (after Fleet Dashboard), "Ship Workspace", `Wrench` icon |
| `src/pages/ShipWorkspacePrototype.tsx` | Page header | "Prototype" badge | Removed — no longer accurate |
| `src/pages/ShipWorkspacePrototype.tsx` | New reciprocal link | — | "View in Ship Detail" → `/ship/:id`, same ship id, only shown once a ship is loaded |

**Deliberately unchanged:**

| File | Reason |
|---|---|
| `src/pages/ShipDetail.tsx` own ship-switcher dropdown | Stays on `/ship/:id` — a Commander already comparing in Ship Detail should stay there when picking a different ship, not be redirected mid-comparison |
| `src/components/Sidebar.tsx` "Ship Detail" entry | Retained, moved to last position — capability unchanged, only its position as "the default" is demoted |

**Confirmed dead code, correctly excluded:**

| File | Finding |
|---|---|
| `src/components/ShipRecordCard.tsx` / `PriorityCard.tsx` | No live page imports `PriorityCard` (the sole consumer of `ShipRecordCard`) — not part of any real navigation path, left untouched |

## 2. Context Preservation Audit (Objective 3) — Live Findings

Verified against the real dev server (`VITE_SFM_DEV_SEED_FLEET=true`, seed fleet) with Playwright, driving real clicks through the real app router (not isolated per-page renders):

| Check | Result |
|---|---|
| Fleet Dashboard priority card links to `/ship-workspace/:id` | PASS |
| Click lands on Ship Workspace and loads real ship data (`ship-operational-banner` present) | PASS |
| Ship Workspace tree group expands normally after arriving via the new entry point | PASS |
| Reciprocal "View in Ship Detail" link is present once a ship is loaded | PASS |
| Reciprocal link lands on Ship Detail for the exact same ship id (no id drift) | PASS |
| Sidebar renders Ship Workspace before Ship Detail, no residual "(Prototype)" label anywhere | PASS |
| Mission Control priority card links to `/ship-workspace/:id` | PASS |
| Click lands on Ship Workspace and loads real ship data | PASS |
| Loadout Manager cross-link reads "View in Ship Workspace" | PASS |
| Zero console errors across the full pass | PASS |

12/12 checks passed. No unexpected state resets were observed on any of the new navigation paths.

## 3. Commander Acceptance (Objective 6)

The same live pass doubles as Commander-acceptance validation: representative workflows (Fleet Dashboard → Ship Workspace, Mission Control → Ship Workspace, Ship Workspace → Ship Detail and back) were executed starting exclusively from the new primary navigation paths, using real seed-fleet data, with zero manual URL entry to `/ship-workspace/:id`. Every path resolved to a genuinely loaded ship (confirmed via `data-testid="ship-operational-banner"`, not a placeholder/blank state), consistent with the "Commander should no longer instinctively search for Ship Detail" acceptance bar.

## 4. Regression Summary

- **Full repo test suite:** 159 files / 1920 tests passing (0 failing).
- **`npx tsc --noEmit`:** clean, whole repo.
- **Tests updated (staleness from the intentional navigation change, not new defects):**
  - `src/pages/__tests__/FleetDashboard.test.tsx` — card href assertion updated to `/ship-workspace/:id`.
  - `src/pages/__tests__/MissionComposer.test.tsx` — "View in Ship Detail" → "View in Ship Workspace" label and href assertions (2 tests).
  - `src/pages/__tests__/MissionControl.test.tsx` — 3 href assertions updated to `/ship-workspace/:id`.
  - `src/__tests__/navigationFlow.test.tsx` — end-to-end nav-flow test's card-link selector and both "View in Ship Detail" click targets updated to Ship Workspace's own label/route.
  - `src/__tests__/shipCardCommanderFlow.test.tsx` — href assertion and post-click readiness check updated (Ship Detail's "Is this ship ready?" text replaced with Ship Workspace's `ship-operational-banner` marker, since that page's copy differs).
- **`vitest.setup.ts`:** added a minimal global `IntersectionObserver` stub. Ship Workspace's scroll-triggered sticky context effect depends on this browser API, which jsdom does not implement; now that Ship Workspace is reachable from any test that renders the real `App` router (not just its own dedicated test file), any such test can hit this page incidentally. `ShipWorkspacePrototype.test.tsx` keeps its own richer stub (captures the callback to simulate real scroll behavior) — the global one only prevents a crash in tests that don't care about scroll behavior at all.

## 5. Deliverables Checklist

- [x] Updated navigation (6 files, all `tsc`-clean)
- [x] Navigation audit (§1, this document)
- [x] Commander workflow validation (§2–3, this document)
- [x] Regression summary (§4, this document)
- [x] Updated documentation (`docs/ADR/ADR-016-Ship-Management-Workspace-Architecture.md` §11)
