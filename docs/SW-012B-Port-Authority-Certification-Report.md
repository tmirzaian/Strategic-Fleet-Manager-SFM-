# SW-012B — Port Authority Implementation Certification Report

> **Status: certification complete.** Companion to `docs/ADR/ADR-015-Port-Authority-Architecture.md` (the architecture this sprint certifies) and `docs/ADR/ADR-014-Configurable-Slot-Architecture.md` (the sibling system reconciled against it). This sprint answers one question: is the Port Authority implementation cluster ready to become permanent project history?

## 1. Mission

Certify `src/utils/portOwnership.ts`, `src/utils/portAuthority.ts`, `scripts/generateComponentOwnedPortConstraints.ts`, and `src/generated/componentOwnedPortConstraints.ts` — the pre-existing (uncommitted) EWO-055/EWO-056A/EWO-056B/EWO-056C(-R1) implementation formalized by ADR-015 — as production-ready, before it is committed to permanent history. Explicit Non-Goals: UI integration, Commander workflows, editing functionality, inventory changes, new architectural design. This is validation only.

## 2. Generator Determinism

The generator's own doc comment claims byte-identical output across two runs against the same installed game build, since provenance is derived from `build_manifest.id` + the StarBreaker tool's own `--version`, never a wall-clock timestamp.

Verified directly, three ways:

1. **Freshness**: a fresh live run against the current installed build (`4.9.187.14500`) was diffed against the pre-existing, already-committed-in-spirit `generated-data/component-owned-port-constraints.json` sitting in the working tree — **byte-identical**. The data was not stale.
2. **Determinism**: a second fresh live run, immediately following the first, was diffed against the first run's own output — **byte-identical**. Two independent live StarBreaker round-trips against the same installed build produced the exact same file, confirming the generator's own determinism claim directly rather than trusting it from the doc comment alone.
3. **Unit-level determinism**: the pure extraction function `extractOwnedPortConstraints` already carries its own dedicated test ("calling extraction twice on the same input produces byte-identical output") — confirms purity at the function level, independent of the live StarBreaker round-trip.

**351 entities resolved, 11 skipped (all "no named Components[].Ports[] found" — genuine, documented, not silently absorbed), 0 anomalies**, consistent across every run.

## 3. `mayEdit` Decision Matrix Review

`resolvePortAuthority`'s five-step precedence was read against its own implementation and its 23-test acceptance suite (`src/utils/__tests__/portAuthority.test.ts`):

1. `ownership.resolved === false` → `unresolved`, `mayEdit: false`.
2. No constraint record → `unknown`, `mayEdit: false`.
3. `editable === false` → `locked`, `mayEdit: false`.
4. `editable === true` → `editable`, `mayEdit: true`.
5. `editable === null` → `unknown`, `mayEdit: false`.

Confirmed: **`mayEdit: true` is reachable through exactly one branch.** No combination of inputs produces `mayEdit: true` through absence of information — the existing test suite already proves this explicitly (`'editable: unknown never becomes mayEdit: true, across host and attached-vehicle scopes alike'`, `'missing metadata... never becomes mayEdit: true'`) and guards against a truthiness regression specifically (`'explicit tri-state handling: precedence checks editable === false before === true'` — this test would fail if `resolvePortAuthority` ever regressed to `if (constraint.editable)`, since that would make `false` and `null` indistinguishable). Precedence order matters and is enforced: rule 1 (`ownership.resolved`) is checked **before** `context.kind` is even read, which is what closes the EWO-056C-R1 gap (a broken/cyclic/orphaned ancestry chain must never be interpreted as confirmed host).

No gaps found in this matrix. No changes made.

## 4. Reason Code Audit — Completeness and Exclusivity

`PortAuthorityReason` defines exactly 8 values. The existing test suite already contains a dedicated completeness proof (`'produces every one of the 8 defined reason codes across the acceptance matrix, with no unexpected code and no state silently sharing a code it should not'`) that constructs all 8 cases and asserts `new Set(reasons).size === 8`.

Audited directly against the implementation for exclusivity (confirmed no two branches in `resolvePortAuthority` can produce the same reason for different logical states):

| Reason | Scope | Editability |
|---|---|---|
| `ownership-unresolved` | — (checked before scope is read) | — |
| `constraint-not-found` | host or attached-vehicle (shared — see below) | unknown |
| `host-editable` | host | editable |
| `host-locked` | host | locked |
| `host-editability-unknown` | host | unknown |
| `attached-vehicle-editable` | attached-vehicle | editable |
| `attached-vehicle-locked` | attached-vehicle | locked |
| `attached-vehicle-editability-unknown` | attached-vehicle | unknown |

`constraint-not-found` is the one reason intentionally shared across both ownership scopes rather than split into `host-constraint-not-found`/`attached-vehicle-constraint-not-found` — confirmed intentional (the test file's own comment: "the ticket's own reason enum does not split it into host/attached-vehicle variants, unlike every editability outcome"), not an oversight. Every other reason is scope-specific and editability-specific — no exclusivity violation found.

## 5. Ownership Classification — Composite Ship Coverage

`portOwnership.ts`'s own doc comment claims the `itemport_vehicle_attach` boundary is "confirmed reused byte-identically across all four currently-imported Command-Module-capable hosts (Ironclad, Ironclad Assault, Caterpillar, Caterpillar Pirate)." **Certification found this claim only 75% covered by the real-data test suite** — Ironclad Assault, Ironclad, and Caterpillar were each tested against real imported ship data; Caterpillar Pirate was not, despite genuinely existing in `generated-data/ships.json`/`ports.json` (54 real ports, 20 under the attachment boundary, real `DRAK_Command_Module` ownership confirmed directly against the raw data before writing a test for it).

**Fixed**: added a fourth real-data test (`src/utils/__tests__/portOwnership.test.ts`) mirroring the existing three exactly, closing the gap. All four claimed hosts are now genuinely exercised against real, live-imported data, plus the existing negative control (Gladius — a non-modular ship, every port confirmed `HOST`).

## 6. Integration Points with ADR-014 and ADR-015 — a Real Wiring Trap Found

Reviewing how a future consumer would actually derive `resolvePortAuthority`'s `entityClass` input from a real `Port`/`Hardpoint` object (not just feeding the function already-correct hand-supplied values, which is all the pre-existing test suite did) surfaced a genuine, easy-to-get-wrong trap:

**`entityClass` must be the owning MOUNT/TURRET/RACK's own `sourceEntityClass` — the *parent* port's — never the port's own.** Confirmed live against the real Hornet Mk II: `hardpoint_class_2` (a weapon-mount child port) has its own `sourceEntityClass` set to the *installed weapon* (`APAR_BallisticGatling_S4`), while its parent port `hardpoint_weapon_left_wing` carries the *mount's* own identity (`Mount_Gimbal_S4`). `component-owned-port-constraints.json` is keyed by owning MOUNT/TURRET/RACK entities only — a weapon's own entityClass is never a key in it.

The failure mode is silent: passing the wrong (own, not parent) `sourceEntityClass` doesn't throw — it produces `constraint-not-found` for every real port, which reads as "the whole system says nothing is ever editable" rather than as an obvious bug.

**Fixed two ways:**
- Added `docs/ADR/ADR-015-Port-Authority-Architecture.md` §3.1, documenting the trap explicitly with the real worked example.
- Added an end-to-end test (`SW-012B end-to-end wiring verification`, `portAuthority.test.ts`) proving both directions live against real Hornet data: the correct derivation resolves a real, positive result; the incorrect one is proven to silently degrade to `constraint-not-found`.

No other integration-point issue found. The ADR-014/ADR-015 reconciliation itself (orthogonal axes, different identity keys, no shared consumer today) was re-read against both systems' real code and confirmed accurate — no correction needed there.

## 7. Regression Coverage Expanded

| Addition | File | What it closes |
|---|---|---|
| Caterpillar Pirate real-data ownership test | `src/utils/__tests__/portOwnership.test.ts` | The doc comment's "4 hosts" claim was only 75% tested |
| End-to-end wiring verification (correct vs. trap) | `src/utils/__tests__/portAuthority.test.ts` | No prior test proved how to *derive* `entityClass` from a real Port — only that the resolver behaves correctly once handed one |

Total test count for this cluster: **74 → 76** (both additions passing, no existing test modified).

## 8. Scope Boundary Reaffirmed (Not a Gap)

`generateComponentOwnedPortConstraints.ts` deliberately excludes `GENERIC_MOUNT`/`QUANTUM_DRIVE`/`JUMP_MODULE` from `OWNER_ASSEMBLY_ROLES`, per EWO-055's own approved scope. This certification does not expand that scope — doing so would be new architectural design, explicitly out of bounds for this sprint. Recorded here so it reads as an intentional, documented boundary rather than an unnoticed one.

## 9. No Behavioral Regression Elsewhere

- `npx tsc --noEmit`: clean, whole repo.
- Full repository test suite re-run after this sprint's additions: **159 test files, 1,913 tests, all passing** (up from 1,911 by exactly the 2 tests added this sprint — no other count moved).
- No source file in the certified cluster (`portOwnership.ts`, `portAuthority.ts`, `generateComponentOwnedPortConstraints.ts`, `componentOwnedPortConstraints.ts`) was modified — only test files gained coverage, and `ADR-015` gained §3.1.

## 10. Certification Verdict

- ✅ Generator determinism verified (freshness + live re-run + unit-level purity test).
- ✅ Generated authority data validated against current DataCore (byte-identical to the pre-existing baseline; build `4.9.187.14500`).
- ✅ `mayEdit` decision matrix reviewed — exactly one path to `true`, no gaps.
- ✅ All 8 reason codes audited — complete and mutually exclusive.
- ✅ Ownership classification confirmed across all 4 claimed composite hosts (1 gap found and closed).
- ✅ ADR-014/ADR-015 integration points reviewed — 1 real wiring trap found, documented, and regression-tested.
- ✅ Regression coverage expanded (74 → 76 tests).
- ✅ No regressions elsewhere in the repository.

**Recommendation: the implementation cluster is production-ready.** Commit it with the confidence the Chief Architect asked for — not because it's new, but because it has now been independently verified, not merely inherited.
