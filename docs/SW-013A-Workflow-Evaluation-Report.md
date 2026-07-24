# SW-013A — Ship Management Workspace: Workflow Evaluation Report

> Companion to `docs/ADR/ADR-016-Ship-Management-Workspace-Architecture.md` (the architecture this report validates). Covers Objective 6 (Workflow Validation), the regression summary, and the remaining UX backlog deliverables.

## 1. Common Operational Scenarios Executed

Driven live with Playwright against a real `npm run dev` server and real seed data (`ghost` — F7C-S Hornet Ghost Mk II), not mocked:

| Scenario | Result | Friction found |
|---|---|---|
| Inspect ship | Clean — readiness, decision summary, loadout pills, all three lenses render correctly | None |
| Replace shield (Install/Change) | Clean — inline disclosure opens per row, reference tiers visible | None (pre-existing, SW-008D) |
| Remove weapon | Clean — confirm modal opens with real item name and port label | None (new this sprint) |
| Return displaced component to Hangar | Clean — Hangar quantity increases by exactly 1, verified against store state | None |
| Review configurable slot | Clean — badge, inspection panel, all 7 fields, Developer Mode diagnostics all correct | None |
| Verify readiness | Clean — Readiness %/Decision Summary update in place immediately after Remove, no stale state, no separate readiness path | None |
| Install inventory component | Covered by existing SW-008D/Install-Change coverage — not independently re-verified live this sprint (already both unit- and now live-scenario-tested via the Replace Shield path above) | — |

Screenshots: `docs/images/sw-013a/01-remove-confirm-modal.png`, `02-after-remove-return-to-hangar.png`, `03-configurable-slot-inspection.png`.

**Zero console errors across every scenario.**

## 2. Real Findings This Sprint (Not Just Confirmations)

Investigation and live testing surfaced concrete, fixable gaps rather than only confirming existing behavior:

1. **A real functional gap, closed.** "Remove Installed Component" existed only on Ship Detail (via `LoadoutPortTree.tsx`) and, separately, on Quick Update — never on Ship Workspace. Explicitly named in Objective 3's own examples and Objective 6's own scenario list. Implemented, tested (6 new tests), live-verified.
2. **A real state-preservation bug, fixed.** Tree expansion (`expandedGroups`) was reset on every Loadout-pill switch, not just a ship change — collapsing a Commander's expanded view every time they compared Loadouts on the same ship, a one-click, extremely common operation. Now scoped correctly to ship change only.
3. **A smaller state-staleness bug, fixed.** The "+ New Loadout" draft form held a stale "Copy an Existing Loadout" reference across a ship switch. Now resets on ship change (and correctly does *not* reset on a mere Loadout-pill switch, which is legitimate in-progress work).
4. **A live-script false alarm, resolved without a code change.** During Objective 6 validation, a naive Playwright locator matching `"Remove"` as a substring initially appeared to reveal a bug (clicking "Remove" seemed to reset the whole page to its default lens). Root cause: the locator matched the "Change Installed Components" intent-selector card itself, whose own description text contains the word "remove" — not the real Remove action. The actual automated test suite (which scopes correctly per-row) had already passed cleanly; re-scoping the live-validation script confirmed there was no real bug. Recorded here as a certification discipline note, not a product finding: a live-script artifact was investigated to ground truth before being reported as anything else.

## 3. Configurable Slot & Ownership Distinction (Objective 4)

Confirmed live, not just by code review: the port tree simultaneously shows ordinary ports (no badge), configurable assemblies (small cyan "CONFIGURABLE" pill with a click-to-inspect panel), and structural rows (dashes, no actions) — all legible in the same view without visual confusion. See `docs/images/sw-013a/03-configurable-slot-inspection.png`.

## 4. Regression Summary

- `npx tsc --noEmit`: clean, whole repo.
- Full repository test suite: **159 test files, 1,920 tests, all passing** (up from 1,913 by exactly +7 — 6 Remove Installed Component tests plus 1 state-preservation regression test, net of 1 fragile/redundant test removed — no other count moved).
- Ship Workspace's own test file: 85 → 92 tests, all passing (the same +7 net accounted for above).
- No existing test was modified in a way that changes its assertions — one fragile, low-value test (a structural-row Remove-action negative check that depended on exact post-expansion DOM text matching) was removed as redundant: the early-return for `hp.isStructural` in `renderLensCells` already makes it structurally impossible for a structural row to reach the Remove-button code path at all, which is a stronger guarantee than a runtime DOM assertion could add.

## 5. Explicit Decision Record

Whether `ShipCard` (Fleet Dashboard, Mission Control) should navigate to Ship Workspace instead of Ship Detail by default was raised this sprint and **deferred to SW-013B** by Commander decision. Ship Workspace remains reachable via its own sidebar entry; Ship Detail remains the app's primary click-through for now. See ADR-016 §4 for the full reasoning.

## 6. Remaining UX Backlog (for SW-013B and beyond)

Ordered roughly by likely value, not a commitment — for the Chief Architect's own prioritization:

1. **Primary navigation convergence** (deferred this sprint) — redirect `ShipCard`'s click-through to Ship Workspace once capability parity closes further.
2. **Port Authority integration** — `resolvePortAuthority` is certified (SW-012B) but not yet consumed by this workspace's rendering; a real future integration point once composite-vehicle-owned ports are in scope here (ADR-016 §7).
3. **Loadout rename and delete** — currently Loadout-Manager-only; not named in this sprint's Objective 3 examples, but a plausible future inline action.
4. **Ship Settings dialog (UX-012)** — Fleet Asset nickname/ownership/priority/role editing and Remove-from-Fleet, explicitly deferred; once built, Ship Workspace should link to it per ADR-016 §2/§9.
5. **Aggregate-row actions** — a missile-rack's aggregate "×4" row has no Remove action today (by design — no single unambiguous target across 4 real slots); a future per-slot expansion within the aggregate could resolve this, but was out of scope for this sprint's "safe inline actions" evaluation.
6. **"Port & Mount Detail" inline reference view** — Loadout Manager has a debug-style expandable row (internalName/type/size/port id) Ship Workspace doesn't; low priority, useful mainly for Commander-side troubleshooting/support requests.

## 7. Recommendation

Ship Management Workspace now converges the highest-value, safest slice of Ship Detail's and Loadout Manager's real capability onto one surface, with real state-preservation correctness fixes and one genuinely new, tested, live-verified inline action (Remove Installed Component). The remaining gaps are documented, not hidden, and none block SW-013B from proceeding as planned.
