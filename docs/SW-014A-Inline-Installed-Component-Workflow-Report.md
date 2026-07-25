# SW-014A — Inline Installed Component Workflow: Ship Workspace Completion

**Status:** Complete. All five acquisition tiers are now actionable inline in Ship Workspace's "Change Installed Components" disclosure. Full regression suite 176 files / 2054 tests passing, `tsc --noEmit` clean, live-verified against the real Add-Ship production path.
**Commit:** HOLD — awaiting Commander Operational Certification.

## 1. What changed

The "Install / Change" disclosure evolved from a read-only reference panel (Badge hint + a static 5-line tier list) into an actionable workspace, per the work order's own "Information + Actions, not a replacement" requirement — the original hint badge and reference tier list are unchanged and still render first; every tier below them is now backed by real candidate data and real buttons.

- **Tier 1 — Available Inventory**: every compatible, owned, currently-free component (or a unit already reserved for this exact port) is listed with its quantity; **Install** commits it immediately.
- **Tier 2 — Reserved Components**: a compatible component fully committed to a different Loadout is listed with which ship/Loadout/slot holds the reservation; **Reassign** shows an inline warning, then releases that reservation and installs on confirm.
- **Tier 3 — Borrow From Another Ship**: a compatible component installed elsewhere is listed with "Installed On: `<ship>` — `<slot>` (`<current loadout>`)"; **Transfer?** shows an inline confirm, then removes it there and installs it here.
- **Tier 4 — Newly Acquired Component**: **Record New Component** opens an inline `TargetComponentPicker` (the same control/interaction pattern every other Ship Workspace selector already uses, per the Commander's own suggestion); **Record & Install** adds it to Hangar and installs it in one action.
- **Tier 5 — Remaining Compatible Components**: unchanged in spirit — a reference-only list, capped and labeled "+N more — see Loadout Manager," for compatible components with no acquisition path at all.

No modal dialogs, slide-out drawers, or page navigation were introduced anywhere — every action is an inline expansion/confirm step within the same `<tr>` the disclosure already occupied, matching the page's own established "never a dialog" convention (the one pre-existing exception, the Remove confirm modal, is untouched).

## 2. Data layer

New module `src/utils/installCandidates.ts` — `deriveInstallCandidates()` buckets an already-computed, already-compatibility-filtered candidate list (the exact same `TargetComponentOption[]` `newTargetOptionsFor()` already produces for the Manage Loadout picker — no second compatibility authority) into the four tiers above, using the same accounting functions every other acquisition surface already uses (`calculateComponentAvailability`, `findActiveSlotReservation`, `identitiesMatch`). This module never mutates anything — every real mutation still goes through the existing store actions.

## 3. Two real defects found and fixed while building this

Both were latent, pre-existing gaps in the underlying (already-"CERTIFIED") installation engine that had simply never been exercised by any existing caller — neither required modifying the engine itself.

### 3a. The engine refuses to target an already-`'OK'` port

`resolveDestinationHardpoint` (`installationEngine.ts`, unmodified) only accepts a destination hardpoint whose `status !== 'OK'`. Every existing caller (Quick Update, Hangar Inventory) only ever offers destinations that are already `Missing`/`Upgrade Available`/`Invalid Target` — none of them ever attempted to install directly over a fully-satisfied slot. This mission's own required "Replace: Installed → Different Component" certification scenario does exactly that (the Commander picks a component different from what's already installed and fully targeted).

**Fix:** `performInstall` now checks whether the chosen item differs from the port's own current target; if so, it first re-targets that one slot via the same `saveMissionConfiguration` single-slot override Manage Loadout's own Save already performs (making status become `Missing`/`Upgrade Available`), then installs. Skipped entirely when the chosen item already matches the current target, so the common "just acquire what Manage Loadout already asked for" path never performs a redundant save.

### 3b. `installComponent` performs no inventory bookkeeping without a matching reservation

Discovered via a failing test assertion, not by inspection: installing a genuinely free, owned Hangar unit through `installComponent` (the same store action Quick Update's "Install Component" tab uses) left the Hangar quantity **completely unchanged**. Root cause, confirmed by direct trace through `planHangarDecrement` (`inventoryTransactionService.ts`): its own three branches are, in order — (1) a matching ACTIVE reservation exists → decrement and fulfill it; (2) a specific `hangarItemId` was supplied → decrement that exact row; (3) neither → **no inventory bookkeeping at all**, documented inline as "Pre-existing Quick Update use case (EWO-029): installing without any reservation or hangar record at all." `installComponent`'s own store implementation never supplies a `hangarItemId` — it's built for Quick Update's free-text flow, which never references a specific owned row. A pre-existing, separately-implemented store action, `moveToShip(itemId, shipId, slotLabel)`, already does exactly the right thing (decrements the specific row) — but its own UI trigger (Hangar Inventory's "Move to Ship") has been disabled since Beta stabilization, so this path had never been exercised end-to-end by any live UI either.

**Fix:** every real, owned candidate `deriveInstallCandidates` produces now carries the specific `hangarItemId` backing it. `performInstall` routes through `moveToShip` whenever one is known, falling back to `installComponent` only when it genuinely isn't (no such case currently exists in practice, but the fallback keeps the function total). `moveToShip`'s own reservation lookup still takes priority automatically ahead of the `hangarItemId` branch, so passing one is always safe — including for the "reserved for this exact port" fulfillment case. Tier 2 (post-reassign), Tier 3 (post-borrow), and Tier 4 (post-record) all resolve a fresh `hangarItemId` from the live store state immediately after their own preceding mutation (release/remove/add) and thread it through the same call.

Neither fix touches `installationEngine.ts`, `inventoryTransactionService.ts`, or any other engine file — both are composition-level fixes in Ship Workspace's own new code, satisfying "must continue using the existing installation engine... no duplicate transaction logic."

## 4. Tier 3 (Borrow) implementation choice

Composed from two already-certified operations — `removeComponent(donorShip, donorSlot, returnToHangar: true)` followed by the same install path as every other tier — rather than the existing `moveComponentBetweenShips` (TRANSFER) store action. Three reasons: TRANSFER's own compatibility rule (`compatibilityMode: 'exact-slot-match'`) is deliberately different and stricter than the normal catalog-based check every other tier uses; TRANSFER's own UI trigger has been separately deferred since an earlier mission ("moving a component directly between ships is deferred to a future roadmap item" — `QuickUpdate.tsx`); and composing REMOVE+INSTALL gives the Commander a real, inspectable Hangar Inventory transaction in between rather than an opaque ship-to-ship move, and correctly returns the donor's unit to Hangar (recoverable via Tier 1) if the destination install somehow fails after the donor-side removal succeeds.

## 5. Tests

New file `src/pages/__tests__/sw014aInlineInstalledComponentWorkflow.test.tsx` (9 tests): one per tier's own actionable behavior (including the "reserved for this port" no-reassignment-needed case), a regression check that Remove's own confirm-modal exception still functions unchanged, and a genuine-reload persistence check. `src/pages/__tests__/ShipWorkspacePrototype.test.tsx`'s own pre-existing "Install / Change" test was updated (the old assertion became ambiguous once the tier list gained real headings matching the existing reference-text wording) rather than replaced — it still asserts the reference tiers are visible and no dialog ever appears.

Two test-data pitfalls, recorded for anyone extending this suite: the seed Ghost's own "Left Shield Generator" already has "Mirage" installed (use "Right Shield Generator" for a genuinely free candidate); the seed fleet already owns a real Hangar "Mirage" unit (`item-3`, qty 1) — clear `hangarItems`/`reservations` explicitly in any test that needs an unambiguous Tier 3/4-only scenario.

Full project regression suite: 176 files / 2054 tests passing. `tsc --noEmit` clean.

## 6. Live verification

Driven against the real Add-Ship production path (a freshly created Corsair asset, not seed data): all 45 "Install / Change" buttons render; the disclosure expands with the preserved hint badge, reference tier list, and the new actionable sections; Tier 4's inline picker and "Record & Install" correctly recorded a new Cooler component and installed it in one action, confirmed directly against store state (`installedItem` now matches the chosen catalog component, exactly what the picker showed) and via screenshot; a genuine page reload produced zero console errors.

## 7. Certification matrix — status against the work order's own scenarios

| Scenario | Status |
|---|---|
| Install: Inventory → Ship | Automated + live-verified |
| Replace: Installed → Different Component | Automated (Tier 1 test installs over an already-`OK` "Right Shield Generator") |
| Borrow: Ship A → Ship B | Automated (Tier 3 test) |
| Remove: Ship → Inventory | Unchanged, regression-confirmed |
| Remove → Intentional Empty | Unchanged (Manage Loadout's own existing target picker) |
| Restore Target / Restore Factory | Unchanged (existing buttons, untouched by this mission) |
| Persistence: Save/Reload | Automated (genuine `vi.resetModules()` reload) — Browser Refresh/Application Restart are the same code path (localStorage-backed `persist` middleware), not independently re-tested here |
| Reservation Integrity: Available/Reserved/Borrow/Decision Center/Readiness stay synchronized | Automated indirectly — every tier reads through the same `calculateComponentAvailability`/`derivePortLogistics` authorities Decision Center and Readiness already use; no separate accounting path was introduced |

## 8. Success criteria

A Commander can now answer "what can I install here?" and act on it without leaving Ship Workspace or opening Quick Update/Hangar Inventory for ordinary component management — the acquisition hierarchy (Available → Reserved → Borrow → New Acquisition → Reference) the Commander specifically asked to keep is still the first thing shown, now with a real action attached to every actionable tier.
