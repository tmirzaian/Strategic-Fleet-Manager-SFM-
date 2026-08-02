# EWO-103 — Launch Readiness Authority

**Classification:** Product Architecture / Canonical Authority.
**Status:** Design + Implementation. This is not a UI work order — no pages,
routes, or visual presentation were touched. The deliverable is a single new
pure resolver, its test suite, and this architecture document.

---

## Objective

One canonical resolver answers: **"Can the Commander launch this ship right
now?"** Every future consumer — Flight Commander, VoiceAttack, Organization
Operations, external integrations — derives its answer from this one
authority rather than re-deriving readiness itself.

---

## Part A — Current Authority Audit

Every location in the app that independently computes or implies readiness,
found by direct source reading (not delegated, not assumed):

| Location | Function | File:Line | What it answers |
|---|---|---|---|
| Build Progress engine | `calculateBuildProgress` | `src/utils/buildProgress.ts:57` | The one canonical per-hardpoint-set percentage/status/missing-lists calculation. Everything below is ultimately built on this. |
| Fleet Build State | `deriveFleetBuildState` | `src/utils/fleetBuildState.ts:16` | Classifies a build's progress into `INVALID_BUILD` / `FACTORY_ONLY` / `MISSION_READY` / `BUILD_ASSIGNED` / `BUILD_IN_PROGRESS` — "Mission Ready" here means **Installed Match** (every required target physically installed), deliberately distinct from Package Readiness below. |
| Fleet Status tile partition | `classifyFleetStatusTile` | `src/utils/fleetBuildState.ts:37` | Mission Control's Fleet Status tile — Ships Active split into Mission Ready / Loadouts In Progress / Factory Loadout. |
| Mission Package (reservation-aware) | `calculateMissionPackage` / `isMissionReady` | `src/engine/logistics/missionPackage.ts:24,96` | A **second, intentionally different** "is ready" concept — folds in reservations, not just physical installs. |
| Ship Management decision composite | `buildShipManagementSummary` | `src/utils/shipManagementSummary.ts:388` | Ship Management's Decision Summary, Status column, category demand — the single richest existing composite (progress + acquisition hints + availability + prioritized/actionable decisions). |
| Mission Control Priority Actions | `deriveFleetPriorityActions` | `src/utils/priorityActions.ts:57` | Fleet-wide, cross-ship deficiency categorization (Reserved — Awaiting Install / Ready to Install / Upgrade Opportunities / Invalid Targets / Critical Missing). |
| Component availability (inventory truth) | `calculateComponentAvailability` | `src/engine/logistics/availability.ts:49` | Owned / installed / reserved / available quantities for one component name. |
| Reservation lookup | `findActiveSlotReservation` | `src/engine/logistics/reservationLookup.ts:61` | The one canonical "is there a reservation for this exact ship+build+slot+component" check. |
| Acquisition hint | `describeAcquisitionHint` | `src/utils/componentAcquisitionHint.ts:66` | Per-target fulfillment classification: Reserved For This Port / Available in Inventory / Available to Reserve / Borrow Available / Purchase Required. |
| Install candidate ladder | `deriveInstallCandidates` | `src/utils/installCandidates.ts:135` | Per-port, UI-decision-ladder presentation for Ship Management's Install/Change disclosure — expensive, catalog-scoped, presentation-only. |
| Hardpoint status | `computeHardpointStatus(WithValidation)` | `src/utils/hardpointStatus.ts:75,135` | The identity-comparison logic that produces a `Hardpoint.status` value in the first place. |

**Finding:** there is no rogue, independently-competing readiness formula
anywhere in the app — every hit traces back to one of the eleven functions
above, and every page-level renderer (ShipCard, ShipHeroFrame, ReadinessBar,
CriticalMetricTile, Fleet Dashboard, Mission Control) is a pure consumer of
one of them. The gap this work order closes isn't a duplication problem —
it's that **no single function yet synthesizes these into one launch-framed
verdict**. `evaluateLaunchReadiness` (Part B) is that synthesis, composing
`prepareCanonicalHardpoints` → `buildShipManagementSummary` (the richest
existing composite) plus `activeReservationsForShip` — it introduces **zero
new percentage, status, or availability calculations**.

**Two intentionally different "ready" questions already coexist in this
codebase** (`deriveFleetBuildState`'s Installed-Match Mission Ready vs.
`calculateMissionPackage`'s reservation-aware Package Readiness) — the
resolver had to pick one as canonical for "can I launch right now." It picks
the **stricter, Installed-Match** definition: a Reserved-but-not-yet-
installed component is still physically absent from the ship, so it remains
a blocker (see Part D), just one flagged `immediatelyResolvable: true`
rather than conflated with a component that isn't owned at all.

---

## Part B — The Canonical Resolver

`src/utils/launchReadiness.ts` — `evaluateLaunchReadiness(params): LaunchReadinessResult`.

```ts
interface LaunchReadinessResult {
  shipId: string
  shipName: string
  buildId: string | undefined
  buildName: string | undefined
  status: LaunchReadinessStatus          // Part C
  confidence: LaunchReadinessConfidence  // HIGH | MEDIUM | LOW
  readinessPercent: number               // BuildProgressResult.percentage, verbatim
  blockers: LaunchReadinessBlocker[]     // Part D
  warnings: LaunchReadinessAdvisory[]    // Part D
  recommendations: LaunchReadinessRecommendation[]
}
```

Takes a `shipId` (required), an optional `buildId` (defaults to the ship's
own `activeBuildId` — pass explicitly to evaluate an alternate Loadout
before switching to it), and the same raw store arrays every other authority
in this app already takes (`ships`, `fleetAssets`, `builds`, `hardpoints`,
`hangarItems`, `installedLoadouts`, `reservations`). An unknown `shipId`
throws immediately, rather than returning a misleading result — a missing
ship is a genuine caller error, not an "optional asset," so this
deliberately does not follow the "never crash on missing optional data"
convention used elsewhere for genuinely optional fields.

**Composition, not calculation:**

```
prepareCanonicalHardpoints(shipId, hardpoints.filter(buildId), fleetAssets)
  → buildShipManagementSummary(canonicalHardpoints, { shipId, build, ... })
      → summary.decisionHardpoints  (Invalid Target + Missing + Upgrade Available)
      → summary.hintByHardpointId   (AcquisitionHint per hardpoint)
      → summary.progress.percentage (readinessPercent, verbatim)
  + activeReservationsForShip(shipId, builds, reservations)
      → cross-referenced against blockers to surface orphaned reservations
```

`Confidence` is new, orthogonal to `status`, and answers a distinct
question — not "is the ship ready" but "should you trust this reading at
all": **LOW** when no build resolves, or the build has zero required
assignments (trivially reads 100%/Mission Ready because nothing was ever
asked of it); **MEDIUM** when a real target set exists but the build is
still `kind: 'FACTORY'` — never explicitly reviewed by the Commander;
**HIGH** otherwise.

---

## Part C — Status Model

| Status | Meaning | Rule |
|---|---|---|
| **Mission Ready** | Nothing outstanding at all | zero blockers, zero advisories |
| **Ready With Advisories** | Launch-safe, but worth a look | zero blockers, ≥1 advisory |
| **Maintenance Required** | Not yet ready, but every fix is immediate — no external procurement | ≥1 blocker, **all** blockers `immediatelyResolvable` |
| **Launch Blocked** | At least one deficiency the Commander cannot resolve from inside the app right now | ≥1 blocker with `immediatelyResolvable: false` |

This is the Part C-recommended four-state model, unchanged, because it
already avoids percentage-only thinking on its own — a ship reading 95% with
one Purchase-Required blocker is `LAUNCH_BLOCKED`, not "nearly ready."
`readinessPercent` is carried on the result for context, but `status` — not
the number — is the decision surface, per the work order's own direction.

**The one refinement made during implementation:** "immediately resolvable"
reuses `buildShipManagementSummary`'s own `actionableDecisions` distinction
(EWO-065B: an Invalid Target is always immediately actionable — the fix is
picking a different compatible target, never inventory-dependent — while a
Missing component qualifies only when its `AcquisitionHint` tone isn't
`'muted'`/Purchase Required). This means an **Invalid Target alone never
escalates a ship to Launch Blocked** — it resolves to Maintenance Required,
same as a Missing-but-Reserved component — while a genuinely unowned
component always does. This is a real, tested design decision (see the test
suite's "Invalid Target is always immediately resolvable" case), not an
oversight — it reuses an existing, already-Commander-approved classification
rather than inventing a new severity ranking that could silently disagree
with Ship Management's own Decision Summary about which deficiencies are
"quick fixes."

---

## Part D — Blocker Classification

**Blockers** (`LaunchReadinessBlocker`, contribute to Maintenance
Required/Launch Blocked):

| Reason | Hardpoint status | `immediatelyResolvable` |
|---|---|---|
| `MISSING_REQUIRED_COMPONENT` | `Missing` | `true` when `AcquisitionHint.tone !== 'muted'` (Reserved / Available / Borrow); `false` when Purchase Required |
| `INCOMPATIBLE_INSTALLATION` | `Invalid Target` | always `true` |

**Advisories** (`LaunchReadinessAdvisory`, never block launch):

| Reason | Source |
|---|---|
| `UPGRADE_AVAILABLE` | `Hardpoint.status === 'Upgrade Available'` — "a better component is available," matching Part D's example verbatim |
| `RESERVATION_PENDING` | An `ACTIVE` reservation on this ship (`activeReservationsForShip`) not already accounted for by one of the blockers above — a different build, or a slot whose target has since changed |

A `HardpointStatus` of `'Unresolved'` is excluded entirely from both lists —
consistent with `criticalHardpointsInPriorityOrder`'s and Mission Control's
own `deriveFleetPriorityActions`' established treatment of that status as a
non-actionable data edge case, never a real Commander decision.

---

## Part E — Consumer Mapping

| Future consumer | Recommended consumption |
|---|---|
| **Flight Commander** | Its entire "Am I ready to launch?" checklist (EWO-102) is a direct render of one `LaunchReadinessResult` for the session's active vessel — no logic of its own beyond choosing which ship to evaluate. Each unresolved blocker/advisory's `deepLink` becomes that checklist row's CTA, unmodified. |
| **VoiceAttack** | A hands-free bridge reads the same `LaunchReadinessResult` (likely via a thin serialization boundary) and can vocalize `status`/`recommendations[0].message` directly, or trigger the same `deepLink.path` a UI button would. Needs zero readiness logic of its own — this was the explicit reason the resolver was built as a pure function rather than embedded in JSX (EWO-102, Part F). |
| **Mission Packages** | A future named Mission Package (objectives + required loadout doctrine) would call `evaluateLaunchReadiness` per assigned ship to check "is everyone in this package launch-ready," reusing the resolver per-ship rather than a package-level formula. |
| **Organization Operations** | Would call the resolver once per member/ship to roll up an org-wide readiness view — the resolver stays single-ship-scoped; any fleet-wide aggregation belongs to the Org Ops layer, not this authority. |
| **Captain's Log** | Could optionally record a `LaunchReadinessResult.status` snapshot at the moment a Commander "launches" (once Flight Commander exists) as a new activity-log entry type — informational only, this authority performs no writes itself. |
| **Mission Control** | Not migrated in this work order (explicitly UI-out-of-scope). Its own `deriveFleetPriorityActions`/Fleet Status tile continue to serve their existing fleet-wide, backlog-oriented questions unchanged — those are a different timescale than one ship's launch verdict. A future consolidation (Mission Control calling this resolver per-ship instead of its own composition) is a reasonable low-risk follow-up, but was not made here to keep this work order's diff limited to new, additive files. |

**No existing page was modified.** This work order adds two new files only
(`src/utils/launchReadiness.ts`, its test suite) — every current consumer
listed above is a *future* integration, per the work order's own scope
restriction against Flight Commander UI, new routes, or visual presentation.

---

## Part F — Deep-Link Strategy

The resolver performs no mutations and contains no UI logic. Every
`deepLink` is plain data:

```ts
interface LaunchReadinessDeepLink {
  path: string                                    // a real, navigable route today
  shipId: string
  suggestedCommanderIntent?: 'MANAGE_LOADOUT' | 'CHANGE_INSTALLED'
  hardpointId?: string
}
```

`path` is always a genuinely working route today (`/ship-workspace/:shipId`
or `/hangar`). `suggestedCommanderIntent` and `hardpointId` are **not**
currently wired to anything — Ship Management's Commander Intent is local
component state (`ShipWorkspacePrototype.tsx`'s own `useState`), not a URL
parameter, and there is no scroll-to/highlight-this-row capability keyed by
`hardpointId` today either. These fields exist so a future consumer (Flight
Commander) has the *intent* available without the resolver guessing at a URL
shape that doesn't exist yet — wiring Ship Management to actually honor a
Commander-Intent query param is a small, separate, future piece of UI work,
deliberately not done here. Until then, a consumer following `deepLink.path`
lands the Commander on the right ship in Ship Management, one manual click
away from the right workstation card — still only one hop, matching EWO-102's
own "minimal context switching" requirement even without the intent param
being live.

---

## Part G — Test Suite

`src/utils/__tests__/launchReadiness.test.ts` — 16 tests, all passing:

- Mission Ready (zero blockers/warnings)
- Advisory only (Upgrade Available, no blockers)
- Blocked (Purchase Required — unresolvable)
- Maintenance Required (Missing + Available stock — resolvable)
- Maintenance Required (Invalid Target alone — always resolvable, the
  explicit design decision from Part C, tested directly)
- Mixed conditions (blocker + advisory together — blockers win)
- Mixed conditions (resolvable + unresolvable blockers together — worst
  case wins)
- Multiple ships (two ships evaluated against one shared context, verified
  independent)
- Different active builds (an explicit non-active `buildId` override reads
  that build's own hardpoints, not the ship's stored `activeBuildId`)
- Confidence LOW (zero required assignments; no build resolves)
- Confidence MEDIUM (Factory-kind build with real requirements)
- Unknown `shipId` throws rather than returning a misleading result
- A reservation matching a current blocker resolves that blocker and does
  **not** also duplicate as a `RESERVATION_PENDING` advisory
- An orphaned reservation (different build/slot) surfaces as
  `RESERVATION_PENDING`
- `readinessPercent` is `BuildProgressResult.percentage` verbatim

## Certified Evidence

`tsc --noEmit` clean. Full suite: see completion report. No files under
`public/` touched; the only `src/` additions are the two new files above
(module + tests) — no existing production file was modified.
