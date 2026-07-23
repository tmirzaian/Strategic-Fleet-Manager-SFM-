# ADR-015 — Port Authority Architecture

> **Status: Accepted.** Formalizes SW-012A (Port Authority Architecture, Architecture & Investigation sprint). Non-Goals for this sprint: Commander UI, editing workflows, inventory behavior, persistence changes — this is a documentation and validation pass over an existing, working implementation, not new implementation work.

## Numbering note

The next free ADR number at the time of this sprint was **015** (ADR-001 through ADR-014 already exist; ADR-014 is the Configurable Slot Architecture this document cross-references throughout).

## Provenance

The Port Authority implementation predates this ADR. This document records the architecture embodied by the existing implementation after engineering verification and reconciliation with ADR-014. No behavioral changes were introduced as part of ADR-015.

## 0. What this ADR actually is

SW-012A's own brief asks Engineering to "investigate," "define," and "formalize" a Port Authority model and "produce an ADR describing it." Investigation found that model **already fully implemented, tested, and passing** — three prior missions (EWO-055, EWO-056A, EWO-056B, EWO-056C, amended EWO-056C-R1) had already designed and built exactly this system. The code existed in the working tree but had never been committed or given an architecture document of its own.

This ADR does not design a new system. It **formalizes the existing one**: `src/utils/portOwnership.ts`, `src/utils/portAuthority.ts`, `scripts/generateComponentOwnedPortConstraints.ts`, and `src/generated/componentOwnedPortConstraints.ts` — 1,743 lines including their own test suites, 74 tests, all passing, `tsc --noEmit` clean. Nothing in this ADR changes their behavior. Where this document states a rule, that rule is already enforced by code that was already there before this sprint began.

## 1. Problem Statement

Two independent, real gaps existed in SFM's canonical port model:

1. **Composite vehicle ownership.** A composite vehicle — e.g. the Ironclad Assault's docked Command Module — presents its own systems and its attached module's systems in one combined hierarchy, with no ownership boundary exposed anywhere. DataCore draws this boundary authoritatively (a real, distinctive attachment port, `itemport_vehicle_attach`, whose descendants all trace to a fully independent vehicle entity) — SFM was simply never reading it.
2. **Authoritative editability.** Whether a given port may be edited at all is not something SFM can infer from port shape or category — DataCore's own `SItemPortDef.Flags` says so directly (confirmed against the Ironclad Command Module's tractor beam, which is genuinely locked in-game and in DataCore alike), but that data lives on the *owning port-container entity's own record* (a gimbal mount's, a turret's, a rack's — never the ship's own top-level record), and nothing in SFM extracted or read it.

Both gaps needed solving before any future editing workflow (SW-011B) could be built on anything sturdier than an assumption.

## 2. Decision: A Three-Layer Model

### Layer 1 — Constraint Data (EWO-055, extended EWO-056B)

`scripts/generateComponentOwnedPortConstraints.ts` discovers every port-owning entity class already present in `generated-data/ports.json` under one of five owner assembly roles (`GIMBAL_MOUNT`, `DIRECT_WEAPON_MOUNT`, `MANNED_TURRET`, `REMOTE_TURRET`, `MISSILE_RACK` — never a hand-authored list), queries each one live, and extracts every named port on that entity's own DataCore record: `MinSize`/`MaxSize`/`Types[]` (type+subtype pairs, never flattened) and — as of EWO-056B — `Flags`, normalized to a tri-state `editable: boolean | null` (`normalizePortEditability`: the substring `"uneditable"` checked *before* `"editable"`, since the former contains the latter; anything unrecognized is `null`, never guessed). Output: `generated-data/component-owned-port-constraints.json`, committed (not gitignored — same posture as the missile-rack/mining-module slot catalogs), keyed by owning entityClass → port name. Confirmed live against the real build: **351 entities resolved, 0 anomalies, 11 skipped** (uncataloged/empty records, not silently absorbed).

A duplicate port name on one entity with *disagreeing* constraints is excluded from the map entirely rather than one value being picked arbitrarily — the same "never silently resolve a genuine disagreement" discipline this codebase enforces everywhere else (e.g. `withMissileRackAggregation`'s `inconsistent` flag).

### Layer 2 — Ownership Classification (EWO-056A, amended EWO-056C-R1)

`src/utils/portOwnership.ts`'s `classifyOwnership` walks each port's ancestry (via a structural `parentId` link — never a display string) for the nearest ancestor whose raw `internalName` appears in a small, reviewed set of vehicle-attachment port names (currently just `itemport_vehicle_attach` — the only port in the entire imported fleet that breaks the universal `hardpoint_*` naming convention, confirmed reused byte-identically across all four currently-imported Command-Module-capable hosts). Two outcomes:

- **`HOST`** — the walk reached a genuine root (no `parentId` at all) with no boundary found in between.
- **`ATTACHED_MODULE`** — a boundary was found; the result carries the boundary node's id, the matched port name, and the attached vehicle's own `sourceEntityClass`.

**EWO-056C-R1's correction, and the single most important invariant in this whole model:** every `OwnershipResult` carries a `resolved: boolean` independent of `kind`. The original design read a broken ancestry chain, a cycle, or an unknown port id as plain, confirmed `HOST` — silently converting "we don't know" into "confirmed safe." R1 fixed this: `resolved` is `true` only when the walk reached a genuine root cleanly, or found a boundary whose owner positively resolved. Every fallback — broken `parentId`, a cyclic chain, an id `classifyOwnership` was never given, a boundary whose own owner is itself unresolved — is `resolved: false`, structurally shaped like `HOST` but never to be trusted as one.

### Layer 3 — Port Authority Resolution (EWO-056C, amended EWO-056C-R1)

`src/utils/portAuthority.ts`'s `resolvePortAuthority` combines Layer 1 and Layer 2 into one deterministic answer — **who controls this port, and may SFM treat it as upgradeable** — without re-deriving either input itself (it never walks a `parentId` chain, never parses `Flags`). Explicit five-step precedence, never a truthiness check:

1. `ownership.resolved === false` → `ownershipScope: 'unresolved'`, `mayEdit: false`. Checked **first**, before `context.kind` is even read — this is what closes the R1 gap: an unresolved fallback is never treated as confirmed host here either.
2. No constraint record for `(entityClass, portName)` → `editability: 'unknown'`, `mayEdit: false`.
3. `constraint.editable === false` → locked, `mayEdit: false`.
4. `constraint.editable === true` → editable, `mayEdit: true`.
5. `constraint.editable === null` → unknown, `mayEdit: false`.

**`mayEdit` is `true` in exactly one of these five branches.** Locked, unknown, missing metadata, and unresolved ownership are all `mayEdit: false` — "unknown is not permission" is enforced by construction, not by convention. A structured `reason` code (one of 8: `host-editable`, `host-locked`, `host-editability-unknown`, `attached-vehicle-editable`, `attached-vehicle-locked`, `attached-vehicle-editability-unknown`, `ownership-unresolved`, `constraint-not-found`) preserves *why* — for programmatic inspection and tests only, never Commander-facing copy.

## 3. Ownership Invariants

These are the rules the implementation already enforces; stated here as the contract any future consumer may rely on.

1. **Unknown is never permission.** `mayEdit: true` requires ownership to have positively resolved AND a constraint record to exist AND that record's `editable` to be positively `true`. There is no path to `mayEdit: true` through absence of information.
2. **`resolved` is independent of `kind`.** A `HOST`-shaped result may be unresolved (broken/cyclic/orphaned ancestry). Any consumer that reads `context.kind` without first checking `resolved` reintroduces the exact bug EWO-056C-R1 fixed.
3. **Ownership is hierarchy-derived, never inferred from a name.** `classifyOwnership` reasons only from `internalName` (raw DataCore port identifier) and `parentId` (structural link) — never a display label, never a ship/hull name, never a substring match on anything presentational.
4. **Editability is DataCore-derived, never inferred from port shape or category.** `Flags` is read and normalized once, at generation time; no consumer path re-derives editability from `minSize`/`maxSize`/`accepted` or from a port's category/subtype.
5. **A genuine data disagreement is excluded, never arbitrarily resolved.** Two `Ports[]` entries sharing one name with different constraints are both dropped from the map, with the anomaly recorded — never resolved by picking the first, the last, or any other implicit rule.
6. **Nothing here mutates its input.** `classifyOwnership`, `resolvePortAuthority`, and `resolvePortAuthorities` are pure — no mutation, no reparenting, no synthesized nodes, no global state, no persistence write, no React dependency. Ownership is a derived side table (`Map<id, OwnershipResult>`), computed at query/render time from fields the pipeline already authoritatively carries — exactly the same discipline `withMissileRackAggregation`/`withComponentOwnedChildSlots` already established for other derived-at-render-time concerns.
7. **Extension requires no shape change.** A future ownership kind (e.g. a maintenance-only sub-assembly) is added by extending the `OwnershipContext` union and giving the boundary check a second marker table — `classifyOwnership`'s own ancestry walk is already generic over "the nearest ancestor matching *any* known boundary kind wins." A future port-owning family (beyond the current five assembly roles) is added by extending `OWNER_ASSEMBLY_ROLES` alone.

## 4. Terminology Disambiguation — Two Different "Authorities"

This codebase now has two concepts that both use the word "authority," reasoning about genuinely different things. Future engineers should not conflate them:

| | **Port Authority** (this ADR) | **Source Authority** (ADR-014, Configurable Slot Architecture) |
|---|---|---|
| Question answered | Who controls this port (host ship vs. attached vehicle), and does DataCore permit editing it at all? | Is this port backed by real geometry, by Default Loadout configuration only, or both? |
| Values | `ownershipScope: 'host' \| 'attached-vehicle' \| 'unresolved'` | `sourceAuthority: 'geometry-and-configuration' \| 'configuration-only'` |
| Source data | `Port.internalName`/`parentId` (ancestry) + `SItemPortDef.Flags` (owning mount/turret/rack's own record) | `SEntityComponentDefaultLoadoutParams` vs. the real geometry export |
| Scope | Composite/docked vehicles (currently: Command Module hosts) | Every configurable port on every ship |

They are **orthogonal, not competing** — a port can be `host`-owned AND `configuration-only`, or `attached-vehicle`-owned AND `geometry-and-configuration`, in any combination.

## 5. Relationship to the Configurable Slot Architecture (ADR-014)

Validated directly against SW-010A/SW-010B/SW-011A — no conflict, no overlap in responsibility, and a real, clean composition path for future work:

- **Different questions.** Port Authority answers "who owns this port, and is DataCore's own flag set to allow editing." Configurable Slot answers "does this port have a real swap-group of alternative installable components, per `AttachDef.Tags` co-membership." A future editing workflow needs both, in sequence: check `mayEdit` first (Port Authority); only if `true`, offer the Configurable Slot's `eligibleComponents` as the actual alternatives.
- **Different identity keys, by necessity.** Configurable Slot indexes by *ship* entityClass + the port's own bare name (see SW-011A's `sourceItemPortName`/`sourceParentItemPortName` bridge, and `docs/SW-010B-Certification-Report.md` Appendix A point 6 on why bare names collide and require parent-scoped disambiguation). Port Authority indexes by the *owning mount/turret/rack's own* entityClass (`Port.sourceEntityClass` of the port's container — explicitly **not** the ship's own entityClass, and explicitly **not** the same value as an `ATTACHED_MODULE`'s `ownerEntityClass`) + the port's own name **on that entity's record**. A future consumer needing both facts for one port must resolve two different entityClass values, not one — this is documented here precisely so nobody "simplifies" it into a bug by assuming they're the same key.
- **No regression.** Port Authority's own test suite (74 tests) and the full Configurable Slot suite (58+ tests across `scripts/configurableSlots/`, plus SW-011A's Ship Workspace integration tests) all pass together, unmodified by this ADR. Neither system currently reads the other's output — composition remains a future consumer's job, not something either module does today.
- **Both are pre-wiring architecture.** Exactly like SW-010A/SW-011A's `ConfigurableSlot.currentInstalledEntityClass` staying `null` until a future phase, Port Authority is acquisition/classification only — "nothing here is wired into any consumer yet" is true of both systems as of this sprint. Neither `resolvePortAuthority` nor `getComponentOwnedPortConstraint` is called from `validateTargetCompatibility`, `isComponentSelectableForPort`, or any Ship Workspace rendering path.

## 6. Consequences

- SFM now has an authoritative, tested answer to "who owns this port and can it be edited" — available for SW-011B to consume, not to invent.
- The Ironclad-family composite-vehicle boundary (previously invisible) is now a first-class, generalizable concept — extending to a future composite vehicle requires one new port-name entry, not new ship-specific logic.
- The terminology table in §4 is now the canonical disambiguation between "Port Authority" and "Source Authority" — future documentation should link back here rather than re-explain the distinction.
- **Explicit non-decision:** this ADR does not decide how or whether Port Authority and Configurable Slot data get composed into one consumer-facing model. That composition, along with actual UI wiring, is SW-011B's scope, not this sprint's.

## 7. Validation Performed This Sprint

- `npx tsc --noEmit`: clean, whole repo.
- Full existing test suite for this cluster: `src/utils/__tests__/portAuthority.test.ts` (23), `src/utils/__tests__/portOwnership.test.ts` (15), `scripts/__tests__/generateComponentOwnedPortConstraints.test.ts` (29), `src/generated/__tests__/componentOwnedPortConstraints.test.ts` (7) — **74/74 passing**, unmodified.
- `generated-data/component-owned-port-constraints.json` confirmed already generated against the real live build (`4.9.187.14500`, StarBreaker `0.3.2`): 351 entities, 0 anomalies, 11 skipped (documented, not silently absorbed).
- Full repository regression suite re-run after this sprint's documentation additions — see the commit's own validation record; no source file in this cluster was modified.
