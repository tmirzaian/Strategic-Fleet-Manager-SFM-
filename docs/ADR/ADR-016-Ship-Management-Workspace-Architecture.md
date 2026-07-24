# ADR-016 — Ship Management Workspace Architecture

> **Status: Accepted (Phase I).** Formalizes SW-013A (Ship Management Workspace Architecture, Beta 2.0 Product Sprint). This sprint establishes architecture and workflow for the convergence of Ship Detail and Loadout Manager into one operational workspace — explicitly not the final UI vision. Companion to `docs/SW-013A-Workflow-Evaluation-Report.md` (Objective 6 findings, regression summary, remaining UX backlog).

## 1. Mission

Through Commander operational testing, the largest recurring UX friction has been repeated context switching between Ship Detail and Loadout Manager. This ADR defines Ship Management Workspace (`src/pages/ShipWorkspacePrototype.tsx`, route `/ship-workspace/:shipId`) as the primary operational surface for a single ship, and records what changed this sprint to begin consuming the architectural systems built over the preceding several sprints: the Canonical Ship Model, Runtime Identity, Configurable Topology (ADR-014), Port Authority (ADR-015), Ownership Classification, and SW-011A's read-only Configurable Slot inspection.

## 2. Workspace Responsibilities (Objective 1)

**In scope — this workspace owns:**
- Readiness assessment for one ship (shared `calculateBuildProgress`/`ReadinessBar` — no separate readiness model).
- Reviewing, switching, creating, saving, discarding, and activating that ship's Loadouts.
- Editing New Targets (Manage Loadout lens) via the same compatible-options `TargetComponentPicker` Loadout Manager uses.
- Installing, changing, and (as of this sprint) removing installed components (Change Installed Components lens), routed through the same certified `executeInstallation`/store engine every other installation path in this codebase uses.
- Read-only inspection of Configurable Slot metadata (SW-011A) for ports with a certified swap-group alternative.

**Explicitly not this workspace's responsibility — still elsewhere, by design, not oversight:**

| Capability | Where it lives today | Why not here yet |
|---|---|---|
| Fleet Asset identity/nickname/ownership/priority/role editing | Ship Detail's `EditFleetAssetModal` | Reserved for the future Ship Settings dialog (UX-012) — explicit Non-Goal this sprint (§6) |
| Removing a ship from the fleet | Ship Detail's "Remove from Fleet" | Same — UX-012 scope |
| Fleet-wide Loadout browsing and deletion | Loadout Manager's "Existing Loadouts" table | Genuinely fleet-scoped, not ship-scoped — belongs on a fleet-wide surface, not a single-ship workspace, by definition |
| Hangar stock management (add/import new items) | Hangar Inventory | A different domain (inventory acquisition, not ship configuration) |
| Bulk/batch multi-port updates | Quick Update | A different interaction model (batch), not this workspace's single-ship-detail model |

Avoiding duplicated responsibility between screens (Objective 1's own instruction) means: where a capability already has exactly one correct home, this workspace does not grow a second, competing implementation of it. Where a capability is genuinely about a single ship's day-to-day configuration, it converges here.

## 3. State Ownership (Objective 1/2)

Every piece of local state in the workspace, its purpose, and its reset trigger — the contract a future maintainer can rely on:

| State | Purpose | Resets on | Notes |
|---|---|---|---|
| `reviewedBuildId` | Which Loadout is being reviewed (never conflated with the real Active Loadout) | Ship change | Re-baselines to the ship's real Active Loadout |
| `commanderIntent` | Which lens (Manage Loadout / Change Installed Components / default Ship Assessment) | Never | Deliberately survives a ship switch — a Commander mid-workflow shouldn't be kicked back to the default lens |
| `desiredTargets`/`desiredTargetEntityClasses` | Manage Loadout's unsaved New Target edits | Loadout change | Loadout-scoped pending work; correctly cleared on switch, never on lens switch |
| `expandedGroups` | Taxonomy tree expansion | **Ship change only** (corrected this sprint — see §5) | Tree structure is a ship-topology concern, not a per-Loadout one |
| `expandedInstallRowId` | Change Installed Components' inline disclosure | Never explicit (row ids are build-scoped, so a stale id just orphans harmlessly on context change) | |
| `inspectedConfigurableSlotId` | Configurable Slot inspection panel | Never explicit (same orphaning behavior as above) | |
| `developerMode` | Raw diagnostic visibility (SW-011A) | Never | A genuine cross-context Commander preference |
| `removeTarget`/`returnToHangar`/`removeError` | Remove Installed Component confirm modal (new this sprint) | Modal close/save | Transient, never needs a ship/loadout-keyed reset |
| `setActiveNotice`/`saveNotice` | Lifecycle action feedback | Loadout change | Stale success/error messages must not linger across a switch |
| `newLoadoutFormOpen` + its fields | "+ New Loadout" inline draft | **Ship change** (corrected this sprint — see §5) | Loadout-pill switches on the SAME ship intentionally do NOT reset this — composing a new Loadout while reviewing a different existing one is legitimate in-progress work |
| `showStickyContext` | Sticky context bar visibility | Ship change (IntersectionObserver re-attach) | |

## 4. Navigation Boundaries (Objective 1)

**Current entry points to Ship Workspace:** the sidebar's own "Ship Workspace (Prototype)" link, and direct URL (`/ship-workspace/:shipId`). No other page links here yet.

**Current entry points to Ship Detail (unchanged this sprint):** `ShipCard` (used by Fleet Dashboard's card view and Mission Control's priority cards), Fleet Dashboard's table view, `FleetStatusTile`, the sidebar, and Loadout Manager's own "View in Ship Detail" link.

**Explicit decision record:** whether to redirect `ShipCard`'s primary click-through to Ship Workspace was raised this sprint and **deferred to SW-013B** by Commander decision — Ship Workspace does not yet have full capability parity with Ship Detail (Fleet Asset editing, Remove from Fleet remain Ship-Detail-only pending UX-012), and the navigation-convergence question deserves its own explicit sign-off once that parity gap closes further. This is a considered deferral, not an oversight.

**Where a Commander still needs to leave Ship Workspace today:** editing nickname/ownership/priority/role or removing a ship from the fleet (Ship Detail); browsing or deleting fleet-wide Loadouts (Loadout Manager); managing Hangar stock (Hangar Inventory); bulk updates (Quick Update).

## 5. Interaction Model (Objective 1)

Three lenses over one canonical, shared port tree (`buildPortTree`/`groupPortTree`/`withMissileRackAggregation` — the exact same pipeline Ship Detail's own `LoadoutPortTree` uses, so taxonomy grouping and ordering are identical by construction, not by two hand-maintained tables staying in sync):

1. **Ship Assessment** (default, read-only) — Factory / Installed / Target / Status.
2. **Manage Loadout** — Installed / Current Target / New Target (editable) / Availability / Reservations.
3. **Change Installed Components** — Installed / Target / Inventory / Availability / Actions (Install/Change, and — new this sprint — Remove).

**"Never a dialog" convention, with two deliberate, consistent exceptions.** Every detail-expansion in this workspace (Install/Change, Configurable Slot inspection, the New Loadout form) is an inline disclosure row, never a modal — established since SW-002. This sprint added the workspace's first real modal: the Remove Installed Component confirm dialog, mirroring `LoadoutPortTree.tsx`'s own established modal exactly (Remove → optional "Return removed component to Hangar" → Save). This is not a departure from the convention so much as its documented boundary: destructive, irreversible actions get an explicit confirm step everywhere else in this codebase (Ship Detail's own remove modal, its "Remove from Fleet" confirmation, Loadout Manager's "Delete Loadout" confirmation) — Ship Workspace now follows the same rule, consistently, rather than inventing an inline-only exception for its own sake.

## 6. Inline Operational Actions (Objective 3)

**Implemented this sprint:** Remove Installed Component, with the same "Return removed component to Hangar" option Ship Detail already offers, routed through the identical shared `removeComponent` store action (`executeInstallation`/`REMOVE` — the same certified compatibility/installation pipeline every other mutation in this codebase uses; no second, parallel uninstall implementation was written). A Captain's Log entry is recorded on success, matching Ship Detail's own behavior exactly.

**Confirmed already present, not new this sprint:** Install/Change (SW-008D), View Compatible Components (the `TargetComponentPicker` combobox, already filtered to compatible options per port), Save/Discard/Set Active/+ New Loadout (SW-008D).

**Evaluated and explicitly deferred, not overlooked:** Loadout rename, Loadout delete, Fleet Asset edit/disposition, Remove from Fleet. None of Objective 3's named examples (`View Component, Replace Component, Remove Component, Return to Inventory, Change Disposition, View Compatible Components`) actually require these — "Change Disposition" in this sprint's context resolved to mean *component* disposition (return to Hangar vs. not, which the Remove action now covers), not *Fleet Asset* disposition (ownership/priority/nickname), which remains UX-012's scope per this sprint's Non-Goals.

## 7. Configurable Slot & Port Authority Integration (Objective 4)

SW-011A's Configurable Slot badges and read-only inspection panel remain the sanctioned presentation — confirmed live this sprint (`docs/SW-013A-Workflow-Evaluation-Report.md` §3) still correctly distinguishes three port kinds in one tree: ordinary ports (no badge), configurable assemblies (a small cyan "CONFIGURABLE" pill, click to inspect), and structural rows (dashes, no actions at all — a physical mount/turret housing with no component of its own).

**Port Authority (ADR-015) is not yet consumed by this workspace.** This is a real, open integration point for a future sprint, not an oversight this one was scoped to close: `resolvePortAuthority`'s `mayEdit`/`ownershipScope` could, in principle, gate which ports show an Install/Change/Remove action at all once composite-vehicle-owned ports (Command Module-style attached modules) are in scope for Ship Workspace — today, every port in the tree is treated as host-owned by construction, since no currently-supported composite vehicle has been wired into this specific page's rendering. Recorded here so the next engineer who reaches for `resolvePortAuthority` from this file finds the reasoning, not a surprise.

## 8. Information Density Review (Objective 5)

Reviewed the three lenses and the operational banner for unnecessary duplication. Finding: the apparent repetition (a missing component named in the Decision Summary card, the Priority Components strip, *and* the port tree's own Target/Availability cells) is intentional information layering established across several prior sprints (SW-002's own "Decision Intelligence" — overview at the top, full detail in the tree below), not accidental duplication. No layout change was made this sprint — reducing this would remove a deliberately-designed at-a-glance/full-detail split, not fix a real problem. This finding is itself the deliverable: the review was performed, and its honest conclusion is "already reasonably tight," not "found nothing so invented busywork."

## 9. Relationship to Other Systems (Objective 7)

- **Inventory** — `calculateComponentAvailability`/`derivePortLogistics` (the same shared functions across all three lenses); Remove's "Return to Hangar" option increases real Hangar stock via the same engine every other inventory-affecting mutation uses.
- **Readiness** — the same shared `calculateBuildProgress`, unchanged; confirmed live this sprint that a Remove action correctly recalculates the Readiness bar and Decision Summary in place, no separate readiness path.
- **Port Authority (ADR-015)** — not yet consumed; §7 above records the open integration point explicitly.
- **Configurable Slots (ADR-014)** — fully integrated since SW-011A; unchanged and reconfirmed this sprint.
- **Future Ship Settings dialog (UX-012)** — the intended, explicit home for Fleet Asset identity/ownership/priority/role editing and ship removal. Ship Workspace is expected to link to it once built, not reimplement it — consistent with Objective 1's "avoid duplicated responsibility between screens."
- **Validation** — Remove routes through the exact same `executeInstallation` compatibility pipeline as Install/Change and every other mutation; no new or parallel validation path was introduced this sprint.

## 10. Validation Performed This Sprint

- `npx tsc --noEmit`: clean, whole repo.
- Full regression suite: see `docs/SW-013A-Workflow-Evaluation-Report.md` §4 for the exact count.
- Live workflow validation (Playwright, real dev server, real seed data): Inspect ship, Change Installed Components (Install/Change disclosure), Remove weapon + Return displaced component to Hangar, Review configurable slot, Verify readiness recalculation — all clean, zero console errors. Screenshots and full findings in the companion report.
