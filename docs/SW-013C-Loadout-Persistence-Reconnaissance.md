# SW-013C.1 — Loadout Persistence Reconnaissance and Vertical Proof

Phase I of SW-013C (Operational Functional Loadout). Establishes the authoritative loadout lifecycle in Strategic Fleet Manager and certifies one complete create/edit/save/reload path through Ship Management (F7C-S Hornet Ghost Mk II, "Persistence Certification").

## 1. Current-State Architecture Map (Objective 1)

Traced directly against the running implementation (`src/store/useFleetStore.ts`, `src/pages/ShipWorkspacePrototype.tsx`, `src/pages/MissionComposer.tsx`), not inferred from UI labels.

**Domain shape.** Every Loadout ("Build") for a ship shares the same slot structure. Each slot is one `Hardpoint` row (`shipId`, `buildId`, `slotLabel`) carrying **three independent values**:

| Field | Meaning | Who can change it |
|---|---|---|
| `factoryItem` / `factoryEntityClass` | The ship's canonical, StarBreaker-derived factory equipment for this port | Never — regenerated fresh from source data, never hand-edited |
| `installedItem` / `installedEntityClass` | What is physically installed right now, shared across **every** Build for that ship+slot | Only via the certified installation engine (`executeInstallation` / Install / Change / Remove) |
| `targetItem` / `targetEntityClass` / `targetMode` | What **this one Build** wants for this slot — the Commander's plan | Only via `saveMissionConfiguration` |

This three-way separation is real, load-bearing, and already correctly enforced everywhere it was tested (§4). A "Loadout" is a `Build` record plus its own set of `Hardpoint` rows; the physically-installed state is a single shared `installedLoadouts[]` list (keyed by `shipId` + `slotLabel`), not owned by any one Build.

**The one authoritative save path.** `saveMissionConfiguration` (`useFleetStore.ts:1010`) is the **only** place that creates or mutates a custom Loadout's target assignments. It is used by both UIs — MissionComposer (Loadout Manager) and `ShipWorkspacePrototype` (Ship Workspace) — confirmed by direct reference, not assumption: Ship Workspace's own `handleSaveChanges`/`handleCreateLoadout` call the identical function MissionComposer's "Create/Save" flow calls, with the same `startingState`/`targetOverrides`/`saveAsNew` contract. There is **no second, competing persistence path** — the legacy `addBuild` store action (a hardcoded generic-slot creator, unrelated to real ship topology) exists in the store but is called from zero live `.tsx` files; it is dead code, not a competing authority.

**Persistence mechanics.** Zustand `persist` middleware, `localStorage` key `sfm-fleet-store`, schema version 8. `partialize` includes `customBuilds` (every `Build` with `kind !== 'FACTORY'`) and `customBuildHardpoints` (their rows) for **any** ship, seed or manually added. Factory builds are deliberately excluded — they are always regenerated deterministically from source data, so persisting them would be redundant. This is not new: it was fixed by EWO-027 and is covered by nine existing tests in `src/store/__tests__/customLoadoutPersistence.test.ts` proving reload survival, malformed-record defense, and pre-fix-save backward compatibility.

**Draft vs. committed boundary.** Both UIs hold in-progress target edits in **local component state**, never in the store, never persisted:
- Ship Workspace: `desiredTargets`/`desiredTargetEntityClasses` (`ShipWorkspacePrototype.tsx`).
- Loadout Manager: `overrides` (`MissionComposer.tsx`).

Nothing is written to the store — and therefore nothing reaches `localStorage` — until the Commander clicks an explicit commit action (**Save Changes**, **Create Loadout**, or MissionComposer's **Create/Save**). This is Explicit Save, already the existing model (see §2).

**Relationship among ship / active / target / installed / factory Loadouts:**
- **Factory** — one immutable, source-derived `Build` per ship, always regenerated, never persisted, never a real "customization."
- **Active** — `FleetAsset.activeBuildId` / `Ship.activeBuildId`, the Build the ship's own readiness banner reports against. Changed only by explicit `setActiveBuild`/"Set Active," never implied by merely reviewing a different Loadout.
- **Reviewed / Target** — whichever Build the Commander is currently looking at or editing (`reviewedBuildId`, Ship Workspace's own concept — independent of Active by design, "the ship never changes, only the tools change").
- **Installed** — the ship's real, physical state, shared across every Build, mutated only by the installation engine.

Create/rename/duplicate/delete/set-active all route through the same store, but **not** through one single function: `saveMissionConfiguration` (create/edit), `editBuild` (rename), `duplicateBuild`, `deleteBuild`, and `setActiveBuild` are five distinct actions sharing the same `builds`/`hardpoints` state shape and the same `partialize` coverage — verified consistent, not fragmented, by the new tests in §4.

### Where state actually goes stale

The one real, reproducible gap: **an in-progress target edit is not distinguished from committed state strongly enough, and switching the reviewed Loadout silently discarded it with zero warning.** `desiredTargets` is intentionally reset to `{}` whenever `reviewedBuildId` changes (by design — a different Loadout has different pending work) — but until this job, that reset happened immediately on a pill click with **no check for whether there was anything to lose**, in both Ship Workspace and Loadout Manager (`MissionComposer.tsx`'s own `overrides` state, cleared unconditionally on ship switch, same pattern, same gap — confirmed by reading, not fixed this sprint per scope, see §9). This is the concrete root cause behind "the Commander cannot reliably create, edit, change, and save a build" — not a broken persistence engine.

## 2. Root Cause

**The persistence engine itself is sound.** The full Objective 3 scenario — create, edit a target, save, switch Loadouts, return, reload the browser, verify — passed 23/23 live checks against the real dev server and real `localStorage` on the first architecturally-correct attempt (§5).

**The actual defect is a UI truthfulness gap, not a data-loss bug in the store.** Selecting a New Target updates the visible cell immediately, which reads as committed — but the value lives only in unpersisted React state until an explicit Save. Switching to a different Loadout pill (Ship Workspace) or a different ship (Loadout Manager) discarded that draft **silently**: no confirm dialog, no toast, no in-page warning, nothing in `localStorage` to lose because nothing was ever there. A Commander mid-edit who compares against another Loadout — an extremely natural, common action — loses their work with no indication anything happened. This is precisely what Objective 5 describes: a control (the Target picker) implying data is saved when it is only local draft state.

## 3. Selected Save Contract and Rationale (Objective 2)

**Recommendation: Explicit Save / Cancel (Option A) — already the correct model. The defect was enforcement, not architecture.**

The codebase already commits to explicit Save/Discard (SW-008D) rather than autosave, and that choice is right for this domain: a Loadout edit is a deliberate planning act (which weapon, which shield, which doctrine), not a text field where every keystroke should stick. Autosave would also make the target/installed/factory separation harder to reason about — a half-composed plan should never silently become "the plan" the readiness banner reports against.

What was missing was **making the boundary between draft and committed state impossible to cross by accident.** The minimal, correct fix is not a new persistence model — it's guarding the one action (switching the reviewed Loadout) that used to cross that boundary silently, and communicating draft state honestly wherever it's visible. That is what §4 implements.

The persistence contract itself (Objective 2's required list) is already satisfied by the existing architecture, and now has direct regression coverage locking it in (§4):
- Stable Build id — ✅ (`saveMissionConfiguration`'s `existingBuildId`/`isEditingExisting` branch never mints a new id for an edit; confirmed surviving rename via `editBuild`).
- Scoped to exactly one ship — ✅ (`Build.shipId`, `Hardpoint.shipId`; cross-ship leakage tested and absent).
- Name, target assignments, intentional-empty targets (`'—'`), active/inactive status — ✅ all persist (§4, §5).
- Configurable-slot selections — inherited unchanged from SW-011A/ADR-014; out of this job's scope, not touched.
- Navigating away / reloading does not discard a **committed** Loadout — ✅ already true, was already correct.
- Saving a target Loadout never mutates the installed physical loadout or inventory ledger — ✅ now locked by explicit tests (§4).
- Installing/removing components never rewrites unrelated saved target Loadouts — ✅ `applyInstalledChange` only ever touches `installedItem`, never `targetItem`, on every affected Build's row.
- Factory Loadout remains source-derived, never mutated as a user Loadout — ✅ locked by a new test (§4).

## 4. Data-Integrity Assertions Added (Objective 4)

Two new files, seven + five new tests, all passing:

**`src/store/__tests__/sw013cLoadoutPersistenceIntegrity.test.ts`** (new, 7 tests):
1. Creating a custom Loadout does not create or change any Hangar Inventory record.
2. Editing an existing custom Loadout's target does not install a component (installed state and other Builds' rows untouched).
3. Saving a target Loadout does not remove or alter another Loadout's installed component / the ship's Active Loadout selection.
4. The Factory Loadout remains immutable through custom-Loadout creation and editing.
5. Switching ships cannot leak a saved custom Loadout onto a different ship.
6. A stable Build id survives a rename via `editBuild`.
7. A failed save (unresolvable override slot) creates no Build and never presents the draft as committed.

**`src/pages/__tests__/ShipWorkspacePrototype.test.tsx`** — replaced one stale test that encoded the OLD silent-discard behavior as correct, with a new `describe` block (5 tests) locking the new guarded contract:
- A pill click does **not** switch immediately while a pending edit exists — it stages an inline confirm.
- The reviewed pill itself carries an "Unsaved" badge while a pending edit exists.
- Cancel keeps the Commander on the original Loadout with the edit fully intact (never persisted).
- "Discard & Switch" performs the switch and clears the edit, only with explicit consent.
- A pill click with **no** pending edits still switches immediately — the guard adds zero friction to the common case.

**Migration / backward compatibility:** no persist schema or version change was made this sprint (`PERSIST_VERSION` untouched, `partialize`/`merge` untouched). Existing coverage (`customLoadoutPersistence.test.ts` tests 8–9) already proves malformed and pre-EWO-027 saves load safely; nothing in this job altered that contract, so no new migration was required or written.

## 5. What Was Implemented (Objective 3 + Objective 5)

**Vertical proof (Objective 3), live, real dev server, real `localStorage`, zero mocks:**

1. Opened F7C-S Hornet Ghost Mk II (`ghost`) in Ship Workspace.
2. Created a custom Loadout named **Persistence Certification** (Factory-initialized).
3. Changed the Left Cooler's target to a real catalog component (`ArcticStorm`) via the compatible-options picker.
4. Clicked **Save Changes** — confirmed immediately in real `localStorage` (`customBuildHardpoints`).
5. Switched to a different Loadout, then back — target intact.
6. Reloaded the actual browser (`page.reload()`, not a test harness re-render) — Loadout, name, and target all intact.
7. Re-navigated fresh to `/ship-workspace/ghost` — UI shows the certified Loadout.
8. Confirmed Hangar Inventory, Installed Loadout, and Reservations were byte-for-byte unchanged by the target-only save.

**Result: 23/23 checks passed** (script and full output preserved for review). No code change was required to make this scenario work — the architecture already supported it correctly.

**UI Truthfulness fix (Objective 5), `src/pages/ShipWorkspacePrototype.tsx` only:**

- A guarded switch (`requestReviewedBuildSwitch`): clicking a different Loadout pill while a pending edit exists no longer switches immediately. It stages the destination and renders an inline confirm — **never a modal**, consistent with this page's own established convention (SW-008D) — requiring explicit **Discard & Switch** or **Cancel**.
- A persistent, honest "Unsaved changes — N target(s) pending" status line, distinct from the Save/Discard buttons themselves.
- An "Unsaved" badge on the reviewed Loadout's own pill, visible the moment a pending edit exists — before the Commander ever reaches for another pill.
- No route-level navigation blocker was added (leaving Ship Workspace entirely via the sidebar/another ship card still discards a draft silently) — a larger, riskier change than this job's scope; recorded as a remaining gap (§9), not implemented.

No layout redesign, no new persistence mechanism, no store or schema change. Three files touched: `ShipWorkspacePrototype.tsx` (implementation), `ShipWorkspacePrototype.test.tsx` (updated + new coverage), and one new store test file.

## 6. Automated Verification (Objective 6)

- `npx tsc --noEmit`: clean, whole repo.
- Full regression suite: **160 files / 1931 tests passing**, 0 failing.
- New tests specific to this job: 12 (7 store-level integrity + 5 component-level guard behavior), all passing.

## 7. Live Verification (Objective 6)

- Full vertical proof (§5): 23/23 checks, real dev server, real `localStorage`, zero console errors.
- Guard-behavior verification (separate live pass, real dev server): make an unsaved edit → confirm bar appears on pill click → Cancel preserves the edit and does not switch → clicking the pill again and choosing Discard & Switch performs the switch and clears the edit. **9/9 checks passed.**
- Inspected persisted `localStorage['sfm-fleet-store']` directly before and after every step — `customBuilds`, `customBuildHardpoints`, `hangarItems`, `installedLoadouts`, and `reservations` were diffed explicitly, not merely eyeballed.
- No unrelated inventory mutation observed at any step.

## 8. Operation Swamp Fox Impact

### 8.1 Cross-page/state impact

Zero. Every change this job made is local component state inside `ShipWorkspacePrototype.tsx` (`pendingSwitchBuildId` and the guarded switch function) — no store field, no persisted schema, no `partialize`/`merge`/`PERSIST_VERSION` change, no change to any other page. `git status` for this job touches exactly two production files (`ShipWorkspacePrototype.tsx`, its test) plus one new test file.

### 8.2 Data ownership classification

Traced against `src/types/index.ts` and `useFleetStore.ts` directly:

| Field / state | Classification | Notes |
|---|---|---|
| `FleetAsset.id` | Commander-scoped stable identity | Application-minted, not an external RSI id; proven stable across reload |
| `FleetAsset.shipDefinitionId` | SOURCE-OWNED | Points to the StarBreaker-derived `ShipDefinition` catalog |
| `FleetAsset.nickname` / `.ownershipType` / `.priority` | COMMANDER-OWNED | |
| `FleetAsset.acquisitionSource` | Source provenance (own category) | Already typed for `RSI_IMPORT`/`CCUGAME_IMPORT`, both currently unconstructed anywhere in the codebase — the schema anticipated future import provenance before this job, unused so far |
| `FleetAsset.activeBuildId` | COMMANDER-OWNED / OPERATIONAL | Commander's Active Loadout selection |
| `FleetAsset.installedLoadoutId` | Vestigial — flagged, not touched | Written (`${id}-installed`) but never read as a lookup key anywhere; the real installed-state authority is `installedLoadouts[]` keyed by `(shipId, slotLabel)`. A future resync implementer should build on the array, not this field. |
| `FleetAsset.status` / `.addedAt` / `.updatedAt` | OPERATIONAL/TRANSACTIONAL | Lifecycle + audit metadata |
| `Build` (`kind: FACTORY`) | DERIVED | Regenerated fresh every load, never persisted, never a resync target |
| `Build` (`kind: MISSION`/`CUSTOM`) | COMMANDER-OWNED | This job's whole subject |
| `Build.readiness` / `.missing` | DERIVED | Recomputed via `calculateBuildProgress`, never hand-set or trusted as authoritative on its own |
| `Hardpoint.factoryItem` / `.factoryEntityClass` | SOURCE-OWNED | Never mutated by any Commander action |
| `Hardpoint.targetItem` / `.targetEntityClass` / `.targetMode` | COMMANDER-OWNED | The actual plan; this job's persistence subject |
| `Hardpoint.installedItem` / `.installedEntityClass` | OPERATIONAL/TRANSACTIONAL | Set only by the certified installation engine, distinct from planning |
| `Hardpoint.status` / `.invalidMessage` | DERIVED | Reproducible at any time from factory/target/installed |
| `installedLoadouts[]` | OPERATIONAL/TRANSACTIONAL | Shared per-ship-per-slot physical truth |
| `hangarItems[]` | COMMANDER-OWNED inventory, OPERATIONAL mutation | The stock record is Commander data; install/remove transactions are what mutate it |
| `reservations[]` | OPERATIONAL/TRANSACTIONAL | Quartermaster logistics engine |
| `quarantinedAssignments[]` | OPERATIONAL — existing reconciliation-status precedent | Per-orphaned-port record when upstream topology drifts (EWO-043); the closest existing analog to a future "reconciliation status," scoped narrower (per-assignment, not per-asset) |
| `seedAssetOverrides` | COMMANDER-OWNED diff over SOURCE-OWNED baseline | |
| `desiredTargets` / `overrides` (draft state, both UIs) | COMMANDER-OWNED, DRAFT/EPHEMERAL | Never persisted; promoted to real `Hardpoint.targetItem` only via explicit Save |
| `pendingSwitchBuildId` (new, this job) | UI-ONLY, EPHEMERAL | Never persisted, never should be |

### 8.3 Future resync compatibility

The architecture can represent every item on Swamp Fox's minimum list, with two already built and the rest additively reachable:

- **Stable fleet-ship identity** — ✅ already real (`FleetAsset.id`).
- **Local Commander priority** — ✅ already real (`FleetAsset.priority`).
- **Custom loadouts** — ✅ already real and this job's certified subject.
- **Active planning state** — ✅ already real at two correctly-separated levels (persisted `activeBuildId` vs. ephemeral `reviewedBuildId`/draft targets).
- **Source provenance** — ✅ partially real (`acquisitionSource` enum already anticipates `RSI_IMPORT`/`CCUGAME_IMPORT`); needs the sync feature itself to start constructing those values, not a schema change.
- **External source identity** (e.g. an RSI record id) — ❌ not represented today. Additively reachable: a new optional `FleetAsset.externalSourceId?: string` field, following the exact pattern already used three times (`customBuilds`/`customBuildHardpoints` v5→6, `quarantinedAssignments` v6→7, `seedFleetLegacyInstall` v7→8) — a version bump plus an optional field that a pre-existing save simply lacks, never a rewrite of an existing field's meaning.
- **Pledge/hangar identifier** — ❌ not represented today. Same additive path as above.
- **Last synchronization metadata** — ❌ not represented today. Same additive path (e.g. `FleetAsset.lastSyncedAt?: string`).
- **Reconciliation status** — ⚠️ partially real at the wrong granularity: `quarantinedAssignments[]` already proves the pattern (per-orphaned-port, survives reload, defensively validated) but there is no whole-asset "last reconciled against source version X" field yet. Additively reachable the same way.

### 8.4 Migration/refactor risk

**Low.** This job introduced zero schema or persistence changes, so it carries zero migration debt on its own. Every gap identified in §8.3 is closeable by an **additive optional field + a `PERSIST_VERSION` bump**, the codebase's own established, three-times-proven pattern for exactly this situation (`migrate()` already treats an absent field as "nothing recorded yet," never as an error). Nothing found during this reconnaissance would require a destructive rewrite of an existing field's meaning to support future resync — the closest thing to a landmine is `FleetAsset.installedLoadoutId` (vestigial, unused, easy to mistake for a real reference by a future engineer) — flagged, not touched, no present change needed.

### 8.5 Deferred integration requirements discovered

Recorded, not implemented (no present change necessary):
- No external-source-id / pledge-hangar-id field on `FleetAsset` yet — needed before real RSI/CCU-game sync can match a local asset to its remote record.
- No last-synchronization-timestamp field yet.
- No asset-level reconciliation-status field yet (only the narrower per-assignment `quarantinedAssignments`).
- `FleetAsset.installedLoadoutId` is vestigial and should not be built upon; a future resync implementer should use `installedLoadouts[]` keyed by `(shipId, slotLabel)` instead.

## 9. Remaining Lifecycle Gaps for the Next Job

- **MissionComposer.tsx (Loadout Manager) has the identical silent-discard gap** this job fixed in Ship Workspace: `overrides` is cleared unconditionally on a ship switch (`setShipId`/`onChange` handlers), with no guard and no warning. Confirmed by reading, not fixed here — Ship Workspace was this job's explicit primary target.
- **Creating a new Loadout while a different, currently-reviewed Loadout has an unsaved edit** still bypasses the new guard in Ship Workspace (`handleCreateLoadout` calls `setReviewedBuildId` directly). A narrower edge case than the primary pill-switch scenario; not reproduced or fixed this job.
- **No route-level navigation guard.** Leaving Ship Workspace entirely (sidebar, a different ship's card, browser back) still silently drops an unsaved draft — only switching Loadouts *within* the same ship page is now guarded. A full guard would need React Router's blocker API and materially larger scope than "minimum UI changes."
- **Configurable-slot selections and every non-Ghost ship's topology** were explicitly out of scope this job (per the WO's own Non-Goals) and were not touched or re-verified.
- **The Operation Swamp Fox gaps in §8.5** (external source id, sync metadata, asset-level reconciliation status) are real, known, and deliberately deferred — no present change needed until RSI sync itself is scheduled.

## Stop Conditions Check

None triggered. Confirmed during reconnaissance:
- Exactly one persistence authority exists (`saveMissionConfiguration`); the only other build-creating action (`addBuild`) is dead code, not a second live authority.
- No destructive migration was required — this job made zero schema changes.
- Saved targets and installed physical state are cleanly separated by construction (`targetItem` vs. `installedItem`), not conflated.
- The UI writes to the store through exactly one path per concern (`saveMissionConfiguration` for targets, `applyInstalledChange`/the installation engine for installed state) — never multiple independent direct-to-storage writers.
- No change to the certified installation engine was needed to fix the vertical proof.
- No existing production data pattern was found that cannot be safely migrated (the `migrate()` function's own defensive validators already handle every malformed/legacy shape encountered).
