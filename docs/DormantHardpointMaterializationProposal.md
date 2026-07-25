# Dormant Hardpoint Materialization — Scoped Architecture Proposal

> **Status: Proposal only — not implemented, not accepted.** Filed per SW-013C.2F Amendment A (Finding 4)'s explicit instruction: *"stop and provide a scoped architecture proposal for Dormant Hardpoint Materialization, with the Nose Turret explicitly marked unsupported in the current Beta."* Companion to `docs/ADR/ADR-014-Configurable-Slot-Architecture.md`'s own "Amendment (SW-013C.2E/2F)" section, which first identified this gap; this document extends that finding with new structural evidence and lays out the design question the Chief Architect must decide before any implementation begins.

## Commander-facing question this answers

*"Why can't I select the Nose Turret on my Hornet Ghost?"*

**Answer, stated plainly: the Ghost variant's nose position is not a turret with nothing mounted — it is a physically different hardpoint. SFM will not synthesize equipment slots that do not exist in the ship's own real data. This is a genuine, currently-unsupported capability gap, not a bug in the picker or a missing label.**

## Why this is not a label/dropdown defect (re-confirmed, with new evidence)

The Chief Architect's ruling for this Finding was explicit: *"Do not continue pretending this is a label or dropdown defect."* Direct inspection of the real imported port data for every currently-imported Hornet Mk II variant confirms why:

| Ship variant | Nose port `internalName` | `canonicalPortType` | `equipmentGroup` | `assemblyRole` | size | child ports |
|---|---|---|---|---|---|---|
| F7CS Mk2 ("Ghost") | `hardpoint_nose_cone` | `Module` | Modules | `GENERIC_MOUNT` | S1 | none |
| F7C Mk2 | `hardpoint_nose_cone` | `Module` | Modules | `GENERIC_MOUNT` | S1 | none |
| F7CR Mk2 | `hardpoint_nose_cone` | `Module` | Modules | `GENERIC_MOUNT` | S1 | none |
| F7CM Mk2 | `hardpoint_weapon_nose` | `WeaponTurret` | Weapons | `DIRECT_WEAPON_MOUNT` | S3 | 2 (`hardpoint_weapon_S1_left`/`_right`) |
| F7A Mk2 | `hardpoint_weapon_nose` **and** `hardpoint_nose_cone` (both present) | — | — | — | — | — |

(Confirmed via direct `generated-data/ports.json` inspection, live 4.9.187.14500 import.)

This is **not** "the same port, factory-empty on some variants." The Ghost's own `hardpoint_nose_cone` is a different physical hardpoint under a different `internalName`, a different DataCore port classification (`Module` vs `WeaponTurret`), a different equipment group, a different size (S1 vs S3), and — critically — the turret variant's own port owns two real child weapon mounts that have no analog anywhere in the Ghost's own data at all. The Ghost's own real DataCore export never mentions `hardpoint_weapon_nose` in any form, occupied or empty. There is no row to "unhide."

This sharpens ADR-014's own prior finding (which described the gap as "a confirmed-real, factory-empty port") — for the Nose Turret specifically, it is stronger than that: not merely unoccupied, but structurally absent.

## What "materializing" this would actually require

To make the Nose Turret genuinely selectable on the Ghost, SFM would need to synthesize, for a ship whose own real import data contains none of it:

1. A new `Port` (`hardpoint_weapon_nose`, `WeaponTurret`, S3) that does not exist in the Ghost's own `raw-data/*.json` export.
2. Two new child `Port`s (`hardpoint_weapon_S1_left`/`_right`) with no analog in the Ghost's own geometry data at all.
3. A decision about what — if anything — is "factory-installed" there (the real game ships the Ghost with no turret at all; the position is a fixed cone, not merely an empty mount), which has direct, real consequences for readiness/procurement calculations that assume every port's `factoryItem` reflects the ship's own actual factory configuration.
4. A justification for **why** it's safe to graft another ship's own real hardpoint subtree onto this one, sourced only by analogy ("F7CM Mk2 has this, and F7CS Mk2 is in the same hull family") — a materialization strategy no part of this codebase currently implements or has been reviewed against.

Every other `Port` in this system is derived, without exception, from that specific ship's own real StarBreaker/DataCore export. This would be the first case of synthesizing port structure from a *different* ship's data. That is a real, load-bearing architectural invariant this proposal does not casually recommend crossing.

## Two implementation shapes, both rejected as premature (not "implemented, if safe")

**Shape A — cross-ship structural graft.** At import time, if a ship's own hull-family sibling occupies a named port this ship's own export omits entirely, clone that sibling's port subtree (parent + children) onto this ship, marked with no factory item (since the real game ships this variant without the hardware). Rejected for now: needs an explicit "hull family" concept (does not exist anywhere in this codebase today — ships are currently independent, flat records), a decision about how deep to graft (just the immediate port, or its full child tree, or the assemblyRole-derived aggregation it participates in), and a readiness-model decision (should a synthesized, never-factory-real port ever count toward "Missing" the way an ordinary empty port does?). None of these have been designed, let alone reviewed.

**Shape B — confirmed-swap-group-only synthetic slot, independent of any one ship's own geometry.** Since a confirmed swap group for a port name already exists independent of any one ship's occupation of it (the same mechanism `configurable-slots.runtime.json` already uses generically), a port could in principle be synthesized directly from the swap-group's own data rather than from a sibling ship's geometry. Rejected for now: the confirmed swap group describes *component* compatibility (which entities may occupy the port), not port *existence* — it says nothing about whether the physical mounting geometry is even present on this hull, and using it to manufacture geometry would silently offer a component into 3D space that may not exist on the model at all. This risks being *worse* than the current honest gap: it would imply full physical compatibility SFM cannot actually verify.

Neither shape is "genuinely bounded" in the sense Amendment A asked Engineering to check for before implementing. Both require new architectural concepts (hull families, or geometry-optional Ports with different readiness semantics) that deserve independent design and review — not a bolt-on inside a Commander-UX-focused amendment already touching the catalog generator, the compatibility engine, and the missile-rack aggregation layer.

## Recommendation

1. **The Hornet Ghost Mk II Nose Turret is explicitly unsupported in the current Beta.** No synthetic port, no Hornet-specific special case, no fabricated child row. The gap is now documented (this file + ADR-014's own amendment) rather than silently absent.
2. **Commander-facing honesty, not silence.** Ship Workspace's own Nose Cone row (the Ghost's real, existing `Module`-category port) should continue to present exactly what it is — a real, correctly-classified port with its own real confirmed swap-group alternatives (already working correctly since SW-013C.2F) — without any messaging implying a turret option exists there. No change needed to reach this state; it is already true today.
3. **If a future mission takes this on**, it should be scoped and reviewed independently, starting with a decision between Shape A and Shape B above (or a third option not yet identified), an explicit "hull family" data-model decision if Shape A is chosen, and an explicit readiness-semantics decision for a geometry-optional Port either way. It should not be attempted as a fast-follow inside a Commander-UX or compatibility-bug work order.

## Cross-reference

- `docs/ADR/ADR-014-Configurable-Slot-Architecture.md` — "Amendment (SW-013C.2E/2F)" section, first identified this gap for both the Hornet nose and the Retaliator's Ordnance module's own nested rack-mount port.
- `docs/SW-013C.2F-Commander-UX-Closure-Report.md` — the Retaliator's own "Additional Topology Pending" badge is the established precedent for honest, non-fabricated Commander messaging around this exact class of gap.
