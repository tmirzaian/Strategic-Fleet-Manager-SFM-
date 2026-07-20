# ADR-011 — Canonical Translation of DataCore Equipment Categories

- **Status:** Accepted
- **Date:** 2026-07-20

## Context

VRF-002 found that DataCore category `"Turret"` (the turret-shell hardware
itself — `Grin_MXC_Turret` on the Greycat MTC, the VariPuck gimbal family,
`ANVL_Fixed_Mount_Hornet_Ball_S4`, and every real turret shell on the
Ballista/Centurion/Spirit/890 Jump/Ursa/Lynx/Nova family) had **no entry
at all** in `CATEGORY_TO_PORT_TYPE` (`src/generated/componentCatalog.ts`).
This did not make these components fail compatibility outright — it made
them invisible to it. `isPlayerSelectableRecord`/`compatibilityPortTypeFor`
treated every one of them as entirely unresolved, so
`validateTargetCompatibility`'s permissive "can't disprove an unresolved
item" fallback let a factory loadout using one "pass" by accident, never
by a genuine, verified type/size match. The instant identity resolution
ever fell back to matching by display name instead of entityClass — a
bare name like `"Turret"` is shared verbatim by 20+ real, differently-sized
entities fleet-wide — that accidental pass flipped to a hard, incorrect
"ambiguous"/incompatible failure. This is the same root-cause shape
CAT-003/EWO-STAB-004A already found and fixed for `PDCTurret` (ADR-010):
an external DataCore vocabulary term with no canonical SFM translation,
silently masked rather than positively resolved.

A second, related gap: `compatibilityTypeFor`
(`src/data/shipDefinitions.ts`) resolves a port's own compatibility type
from its `assemblyRole` first. A turret-shell component is also
factory-installed on ports whose `assemblyRole` is the generic
`GENERIC_MOUNT` rather than a turret-specific role (confirmed by direct
audit: 61 real ports fleet-wide, including the Hornet F7C/F7CM family,
Freelancer, Starfarer, Reliant, Mustang, Ursa Rover/Medivac, and MTC
itself). These ports fell through to the raw, untranslated `equipmentGroup`
string (`"Weapons"`/`"Defense"`) with no further signal.

## Decision

**External vocabulary is translated into SFM's own canonical compatibility
concepts at one defined boundary, and consumers never reinterpret the
external term themselves.** For component *category*, that boundary is
`CATEGORY_TO_PORT_TYPE` (`src/generated/componentCatalog.ts`) —
`Turret: 'Gimbal Mount'` was added there, mirroring the already-established
`WeaponMount -> 'Gimbal Mount'` mapping (both DataCore categories fill the
exact same real port type; DataCore's own category split between them
carries no compatibility-relevant distinction SFM's model needs).

For the residual class of ports whose `assemblyRole` alone doesn't already
classify them, `compatibilityTypeFor` gained a **narrow, factory-category
fallback** — checked only after the `assemblyRole` switch fails to
classify the port, and only for `category === 'Turret' || 'TurretBase'`:
never a broadening of the `equipmentGroup` switch itself (that group is
also shared by genuinely unrelated `GENERIC_MOUNT` ports — a tractor beam
arm, category `ToolArm` — that must never be relabeled `Gimbal Mount`).
This is not "inferring socket capability from installed contents" in the
sense ADR-010/FTB-001F rejected for salvage sockets: unlike a salvage
child socket (which genuinely accepts several interchangeable modifier
families), a fixed turret-shell mount never has an alternative,
differently-shaped part it could equally accept — the factory category is
a stable fact about the **port**, resolved once via the port's own
permanent `factoryEntityClass` (never re-derived from a display name,
never from what's currently installed or targeted), not a transient fact
about a swappable occupant.

## Consequences

Every ship/vehicle in the Turret-category family now resolves a real,
positively-verified compatibility type, not an accidental permissive pass.
The 13 `"::Turret"` entries in `shipDefinitions.test.ts`'s known-exceptions
list (Ballista, Centurion, Spartan, MTC, 890Jump, Lynx, Nova, Ursa
Rover/Medivac and their variants) were removed rather than left stale —
each now validates for real. `"::Tractor Beam"` (category `ToolArm`) is a
separate, real, still-open gap this mission did not investigate.

This decision generalizes beyond `Turret`: any future DataCore category
found to be missing from `CATEGORY_TO_PORT_TYPE` should be added at that
same boundary, not worked around by a caller-side special case. See
ADR-012 for the broader principle this instance is one application of.
