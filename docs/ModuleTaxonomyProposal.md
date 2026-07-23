# Module Taxonomy Proposal

> **Status: design only.** Companion to `docs/ADR/ADR-014-Configurable-Slot-Architecture.md` (Decision D5). No implementation authorized.

## Problem

Every real example of a large-format interchangeable assembly found during the ADR-014 investigation — the Hornet's center-mount Cap/Rotodome/Ball Turret family, the Retaliator's front/rear module family (Base/Cargo/Bomber) — carries `AttachDef.Type: "Module"` (confirmed live for `UMNT_ANVL_S5_Cap`, `UMNT_ANVL_S5_Rotodome`, and the Retaliator module variants). This raw DataCore category has **no entry today** in either of SFM's two existing category-translation surfaces:

- `CATEGORY_TO_PORT_TYPE` (`src/generated/componentCatalog.ts`) — no `Module` key.
- `PLAYER_USABLE_COMPONENT_TYPES` (`scripts/componentCatalog/componentTaxonomy.ts`) — the catalog generator's own player-usable allowlist — also confirmed to have no `Module` entry.

Concretely: even if the Import Pipeline v2 work (Stages 7-9) is fully implemented, a Module-category component is invisible to SFM's *existing* compatibility and catalog machinery until this gap is closed. This is a distinct, additive translation-boundary gap — not automatically fixed by resolving the Configurable Slot problem.

## Proposed Component Type: `Module`

### Category

A new canonical SFM category, added at the same translation boundary ADR-011 established for `Turret`: `CATEGORY_TO_PORT_TYPE['Module'] = 'Module'` (a new canonical port type, not folded into `Utility` or any existing bucket — see "Why not Utility" below).

### Compatibility

A Module-category component's compatibility is **never** evaluated by the existing `isComponentSelectableForPort` Size/Type sweep alone. Per ADR-014 Decision D1/D4, a Module's eligible-port relationship is exclusively swap-group-derived (`SwapGroupSpecification.md`) — there is no "any Module of the right size fits any Module slot" fallback, because the investigated evidence explicitly contradicts that: a Retaliator front-module item and a Hornet center-mount item are both nominally "Module" category but are never interchangeable with each other. Size/Type alone is proven insufficient for this category specifically (this is, in effect, the concrete, in-hand example of the "vessel restriction" concern the original SW-008C work order raised).

### Why not fold into `Utility`?

`Utility`'s existing family (`SalvageHead`/`SalvageModifier`/`TractorBeam`/`WeaponMining`, per `src/utils/componentPresentation.ts`'s `IDENTITY_FAMILY_BY_CATEGORY`) is a real DataCore-distinct set of categories that happen to share a coarse port-compatibility bucket — but every member of that family *is* broadly interchangeable within its own bucket (FTB-001E/F's own finding: "the real game permits any salvage modifier... in either child socket"). `Module` is the opposite case: nominally same-category items are *not* broadly interchangeable. Collapsing them into the same bucket as Utility would silently reintroduce the over-broad-compatibility failure mode this whole investigation exists to prevent.

### Inventory Participation

A Module-category component participates in Hangar Inventory exactly like any other component (ownership, quantity, reservation) — nothing about the Configurable Slot mechanism changes how a physical unit is owned or tracked. The only difference is at *selection* time: a Module's eligible-slot set comes from its swap group, not from a generic Size/Type sweep.

### Readiness Participation

**Open question, not resolved by this proposal — flagged for the Chief Architect.** Two candidate models:

1. **Strict:** an empty Configurable Slot (Authority 2 confirms it exists, nothing currently targeted/installed) counts as a readiness gap, exactly like any other empty port today.
2. **Permissive:** an empty Configurable Slot is readiness-neutral by default, since — unlike an ordinary weapon mount — CIG's own factory-shipped default for many of these slots may legitimately be "nothing" (the Cap piece is a passive cosmetic fairing, not functional equipment; not every Configurable Slot represents a Commander decision that matters operationally).

The evidence gathered does not resolve which model matches Commander expectations — this requires a product decision, not an engineering one, before implementation.

### UI Treatment

**Explicitly out of scope for this proposal** (Non-Goal, per the Chief Architect's own sprint boundary: "No new UI"). Documented here only so a future UI design has the right vocabulary: CIG's own confirmed, real, generic localization key `port_NameConfigurableSlot` ("Configurable Slot") is available for reuse with confidence — it is CIG's own term, not an SFM invention.

### Future Extensibility

The taxonomy is defined generically enough to require zero new code for a not-yet-investigated hull — only new data (a fresh tag sweep). Concrete, named future candidates per the Chief Architect's own remarks:

- **RSI Galaxy** — publicly known (Star Citizen community knowledge, not yet DataCore-verified by this investigation) to use a large-format modular cargo/mission-bay system; a natural first target for the "Open Investigations" full-sweep work in `ADR-014`.
- **Future modular hull systems generally** — any hull whose `AttachDef.Type: "Module"` components are swept and tagged the same way automatically participates, with zero ship-specific code, per ADR-014 Decision D1.

## Non-Goals

No catalog generator changes, no `CATEGORY_TO_PORT_TYPE` edits, no UI, and no resolution of the Readiness Participation open question — all deferred to implementation, pending the Chief Architect's decision on the question above.
