# ADR-014 — Configurable Slot Architecture

- **Status:** Accepted (Design). Design-only through SW-011A (Configurable Slot read-only inspection). **Module port classification activated by SW-013C.2B** — see the Amendment at the end of this document, which corrects one factual claim made during the original investigation.
- **Date:** 2026-07-23
- **Mission codes:** SW-008C, SW-008C Revision 1 (Phase 1 / Phase 2 provenance investigation), ADR-004 / SW-009A (Architecture Sprint), SW-013C.2/2A/2B (Amendment)
- **Numbering note:** the Chief Architect's work order requested this file as `ADR-004-configurable-slot-architecture.md`. `ADR-004` already exists in this repository (`ADR-004-Fleet-Ownership-Sync-Authority.md`, accepted, still current). Rather than silently overwrite or collide with it, this document is filed as **ADR-014**, the next free sequential number as of this writing (ADR-001 through ADR-013 already exist). The mission code `ADR-004 / SW-009A` in the Chief Architect's own tracking is a work-order label, not a claim on the document number — this note exists so the discrepancy is visible, not silently resolved.

## Context

### Background

SW-008C ("Canonical Topology Parity") set out to make Ship Workspace topology-identical to Ship Detail. Two of its four reported defects — a missing Hornet Ghost Mk II "Nose Turret"/"Center" branch and missing Retaliator module bays — could not be reproduced against this repository's imported ship data. Direct inspection of `shipFactoryTemplates` for every currently-imported Hornet variant and the Retaliator found zero ports with those names. Rather than guess or silently drop the claim, Engineering escalated it as a data-provenance question, which the Chief Architect then authorized as its own investigation (SW-008C Revision 1).

### Discovery timeline

1. **SW-008C** — confirmed one real, in-scope defect (draft topology not regenerating child slots on a pending rack swap — fixed, see ADR history in `docs/ImportPipeline.md`/commit `8ef9175`) and flagged two claims (Hornet turret branches, Retaliator modules) as unverifiable against current data.
2. **SW-008C Revision 1, Phase 1** — Commander LIVE evidence (screenshots of CIG's own Vehicle Loadout Manager) showed a real UI path: `Module → Configurable Slot → Anvil F7C-M Mk II Ball Turret`, plus the identifier `@ITEMPORT_HARDPOINT_WEAPON_CENTER`. Engineering traced this directly against the live `Data.p4k` (StarBreaker `dcb query`) rather than trusting the screenshot as data, and located the real DataCore mechanism: `SEntityComponentDefaultLoadoutParams.loadout.entries[]`, confirmed present on both the Hornet Ghost Mk II (`hardpoint_weapon_center`) and the Retaliator (`hardpoint_front_module`, `hardpoint_rear_module`).
3. **SW-008C Revision 1, Phase 2** — traced the alternative-option authority for a confirmed slot. Found a shared `AttachDef.Tags` value (`$ANVL_Hornet_Mk2_Center`) on the port's factory-default item and on the real alternative (the Ball Turret component from the Commander's own screenshot). Generalized via a live bulk-tag sweep across the full ~29,108-entity catalog: the same mechanism is used by the Hornet (two generations, two distinct tag families), the Retaliator (front/rear modules), the RSI Scorpius (turret), and the Argo MOTH (missile turret) — a non-Anvil/non-Aegis manufacturer, ruling out a single-manufacturer coincidence.
4. **This ADR** — the Chief Architect authorized a dedicated architecture sprint to convert these findings into a permanent, implementable design before any code is written.

### Provenance investigation — method

Every claim in this ADR was verified against the live, currently-installed Star Citizen LIVE build (`4.9.187.14500` at time of investigation) via StarBreaker's `dcb query` and `entity export` subcommands — never inferred from filenames, manufacturer names, size, or known in-game behavior, per explicit Chief Architect direction across all three investigation phases. Every entity class, tag string, and field name quoted below was fetched live and is reproducible with the same tooling (`scripts/componentCatalog/dcbQuery.ts`'s `runDcbQuery`/`parseDcbQueryResult`, and `scripts/universeCatalog/dcbBulkQuery.ts`'s `runBulkFieldQuery`, both already in this repository).

## Confirmed Authorities

### Authority 1 — Physical Topology (Geometry Hierarchy Export)

- **Source:** `starbreaker.exe entity export <entityClass> <out> --p4k <Data.p4k> --dump-hierarchy` — the tool SFM's importer already uses (`scripts/goldenFleet/acquisitionRunner.ts`, `docs/ImportPipeline.md` Stages 1-6). Produces the `root`/`root_nmc`/`loadout`/`interiors` envelope every `raw-data/*.json` fixture already uses.
- **Provides:** physical mount-point existence (`root_nmc`, a flat list of named 3D bone transforms — confirmed 227 nodes for the Hornet Ghost Mk II, including `hardpoint_weapon_center` itself), the factory-materialized parent/child install hierarchy (`loadout`, walked by SFM's normalizer today).
- **Confirmed limitation:** `loadout` is StarBreaker's own derived, simplified walk of the richer DataCore structure (Authority 2). It silently drops an entry whose `entityClassName` is empty and whose `entityClassReference` resolves to nothing concretely installed — confirmed directly: `hardpoint_weapon_center` (Hornet Mk II), `hardpoint_front_module`/`hardpoint_rear_module` (Retaliator) all exist in the DataCore record but are **absent** from the exported `loadout` array. `root_nmc` proves the physical point exists; it carries zero item-port semantics (no type, no size, no compatibility) — it is a mesh bone list, not equipment data.

### Authority 2 — Configuration Topology (`SEntityComponentDefaultLoadoutParams`)

- **Source:** a component of the ship's own `EntityClassDefinition` DCB record, reachable today via `dcb query <exact entity class>` (the same per-entity query path `scripts/componentCatalog/dcbQuery.ts` already implements) — not currently reachable via any bulk field query SFM's generator uses.
- **Shape (confirmed live):**
  ```
  SEntityComponentDefaultLoadoutParams
    .loadout: SItemPortLoadoutManualParams
      .entries: SItemPortLoadoutEntryParams[]
        .itemPortName: string          // e.g. "hardpoint_weapon_center"
        .entityClassName: string       // inline default, "" when absent
        .entityClassReference: string | null   // file:// path when no inline default
        .loadout: SItemPortLoadoutManualParams | null   // recursive — nested children
  ```
- **Provides:** every port CIG's own tooling considers real for this hull, including ones with no concrete factory item — exactly the "configuration point" the geometry export drops. Confirmed real, live examples:
  - Hornet Ghost Mk II `hardpoint_weapon_center` → `entityClassReference: "file://.../weapon_mounts/fixed/anvl/umnt_anvl_s5_cap_mk2.json"`, empty nested `entries: []`.
  - Hornet Ghost Mk II `hardpoint_nose_cone` → `entityClassReference: "file://.../module/anvl/anvl_f7_mk2_nosecap.json"`.
  - Retaliator `hardpoint_front_module`, `hardpoint_rear_module` → same empty-reference shape.
  - For comparison, a port that **does** materialize in the geometry export (`hardpoint_weapon_left_wing`) has the identical `entityClassReference`-only shape at its own level, but its nested `loadout.entries` contains a real installed gun — proving the geometry exporter's drop behavior is specifically "reference with nothing concretely installed inside it," not "any reference at all."
  - `SItemPortContainerComponentParams.Ports[]` (a richer `SItemPortDef` list with `MinSize`/`MaxSize`/`Types`/`PortTags`/`RequiredPortTags`) also exists on the same record, but is **confirmed sparse**: the Ghost Mk II's own top-level container carries only 5 entries (fuel/ATC/relay/life-support — utility ports), never `hardpoint_weapon_center` or any other combat-relevant port. Whether a richer per-port declaration exists elsewhere in the record graph was not resolved (see Risk Register, R-003).
- **Confirmed limitation:** this authority tells you the port exists and what's factory-installed there (if anything) — it does **not** enumerate the alternatives. `UMNT_ANVL_S5_Cap_Mk2` (the factory default referenced by `hardpoint_weapon_center`) has its own `Ports: []` and no default-loadout component of its own — it is a passive attachment, not a container declaring options.

### Authority 3 — Compatibility (`AttachDef.Tags`)

- **Source:** `EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Tags` — a plain space-separated string, already bulk-queryable today (the exact mechanism CAT-001/CAT-002 already use for `Localization.Description`).
- **Provides:** swap-group membership, expressed as a shared token between a port's factory-default item and every real alternative. Confirmed live, via a full-catalog bulk tag sweep (~29,108 entities):

  | Vessel | Slot | Swap-group tag | Confirmed members |
  |---|---|---|---|
  | Hornet Mk II family (Ghost/Super Hornet/Tracker Mk II) | Center | `$ANVL_Hornet_Mk2_Center` | `UMNT_ANVL_S5_Cap_Mk2` (factory default), `UMNT_ANVL_S5_Rotodome_Mk2`, `ANVL_Hornet_F7CM_Mk2_Ball_Turret`, `ANVL_Hornet_F7CM_Mk2_Ball_Turret_Bespoke` |
  | Hornet Mk I / base family | Center | `ANVL_Hornet_Center` (no `$`) | `UMNT_ANVL_S5_Cap`, `UMNT_ANVL_S5_Rotodome`, `ANVL_Hornet_F7C_Nose_Turret`, `ANVL_Hornet_F7A_Mk1_Nose_Turret` |
  | Aegis Retaliator | Front module | `AEGS_Retaliator_Module_Front` | `_Base`, `_Cargo`, `_Bomber` |
  | Aegis Retaliator | Rear module | `AEGS_Retaliator_Module_Rear` | `_Base`, `_Cargo`, `_Bomber` |
  | RSI Scorpius | Remote turret | `$RSI_Scorpius_Turret` | `RSI_Scorpius_SCItem_Remote_Turret`, `RSI_Scorpius_SCItem_Remote_Missile_Turret` |
  | Argo MOTH (non-Anvil/Aegis control case) | Missile turret | `$ARGO_MOTH_MissileTurret` | `ARGO_MOTH_Remote_Turret`, `MRCK_S04_ARGO_MOTH_16_S02` (a missile rack sharing the same tag) |

- **Vocabulary observation:** a `$`-prefixed tag token appears specifically on restricted/grouped-family items. An ordinary, broadly-mountable weapon (`KLWE_LaserRepeater_S3`, tags: `"KLWE LaserRepeater flightReady weaponMountUsable"`) carries no `$`-prefixed tag at all — only the generic `weaponMountUsable` flag. This is an observed pattern, not a confirmed CIG-documented rule (see Risk Register, R-002).
- **Confirmed limitation:** which side formally *declares* the requirement was not proven. No populated port-side `RequiredPortTags` matching any of the tags above was found (see Authority 2's own sparse-`Ports[]` finding). The correlation established here is: *the factory-default reference item and its real alternatives share one tag* — sufficient to build a swap-group table by construction, but not proof of the live client's own enumeration algorithm (see Risk Register, R-001).

## Architectural Decisions

### D1 — Three authorities, one canonical model, no ship-specific logic

The canonical configurable topology is the **join** of all three authorities, keyed by `(entityClass, itemPortName)`, never a lookup keyed by ship id, hull name, or manufacturer string. No implementation may branch on `if ship == 'Hornet'` or equivalent — every fact used to build a swap group is either a DataCore field (tag, port name, entity class) or a derived, generic normalization of one. This mirrors the discipline already established for SFM's existing component-owned child-slot pattern (`componentOwnedChildSlotSpec`, missile racks/mining modules) — one generic mechanism, driven entirely by real per-component data, never a per-ship special case.

### D2 — Geometry export remains authoritative for *installed* state; it is never patched to fake configuration data

Authority 1 tells the truth about what is physically, currently installed. It will remain the source for `Hardpoint.factoryItem`/`installedItem`/`targetItem` exactly as today. Configuration points absent from it are not synthesized into fake `Hardpoint` rows with invented data — they are represented as a distinct, honestly-empty concept (a Configurable Slot with no eligible-set data, or an eligible set the Swap Group Resolver actually found) until Authority 2/3 positively supply them.

### D3 — Swap-group tags are a derived index, not a rewrite of `AttachDef.Tags`

Exactly as `docs/ImportPipeline.md` Stage 4b established for classification translation ("DataCore taxonomy remains source truth... never rewrites a catalog record's category/subtype — it only ever produces a separate, additional string"), the Swap Group Resolver (Objective 4, see `SwapGroupSpecification.md`) produces a **separate, additional** `swapGroupId` field per component. It never mutates, strips, or reinterprets the raw `Tags` string in place.

### D4 — Unresolvable configuration data degrades honestly, never silently

A port confirmed present by Authority 2 but with no discoverable tag-sharing alternative set is surfaced as a Configurable Slot with `eligibleComponents: []` and a `diagnostics` entry explaining why — never hidden, never defaulted to "not configurable." This is the same "never guess, report the gap" discipline this project has applied to Component Classification (CAT-001/DATA-001) and now applies to configuration topology.

### D5 — Module is a new, first-class DataCore category translation, not a special case of Utility

`AttachDef.Type: "Module"` (confirmed on `UMNT_ANVL_S5_Cap`/`UMNT_ANVL_S5_Rotodome`/Retaliator module variants) has no entry today in `CATEGORY_TO_PORT_TYPE` or `PLAYER_USABLE_COMPONENT_TYPES`. Per the same principle ADR-011 established for `Turret`, this is a translation-boundary gap to fix at that boundary (see `ModuleTaxonomyProposal.md`), not a caller-side workaround.

## Trade-offs

| Decision | Alternative considered | Why rejected |
|---|---|---|
| Join three separate DataCore reads (per-entity `dcb query` for Authority 2, bulk tag query for Authority 3) rather than one unified extraction | A single new bulk query covering everything | No such single field/struct was found covering all three; Authority 2 is not reachable via the bulk field-query mechanism SFM's generator currently uses (it requires a full per-entity record, like the original narrow-path M-007 generator, not the M-012 bulk-field path) |
| Build the eligible-set from tag co-membership (component-side only) | Wait for and require a proven port-side `RequiredPortTags` declaration | No such declaration was found populated anywhere reachable; blocking the whole feature on a fact that may not exist in accessible DataCore data would indefinitely stall a proven-valuable capability. The tag-co-membership approach is still 100% real-data-driven, just asymmetric — documented as R-001, not hidden |
| Represent an unresolved slot honestly (empty eligible set + diagnostic) rather than falling back to "just show Size/Type compatible items" | Reuse the existing `isComponentSelectableForPort`/full-catalog sweep as a fallback for unresolved slots | Would silently reintroduce exactly the kind of over-broad, unverified compatibility this investigation was launched to avoid (the WO's own vessel-restriction concern) — a Ball Turret and an ordinary Size 5 weapon are NOT interchangeable just because they're both Size 5 |

## Future Extension Points

- A confirmed but unexplored richer per-port `SItemPortDef` (`Types`/`RequiredPortTags`) may exist deeper in the record graph for combat-relevant ports (not proven absent, only proven absent from the one location checked). If found, it becomes an additional, corroborating signal the Swap Group Resolver can use to raise confidence from "tag co-membership" to "confirmed bidirectional declaration" — see `SwapGroupSpecification.md`'s Confidence field.
- The Module taxonomy (D5) is deliberately generic enough to cover not-yet-investigated modular hulls (Galaxy, Caterpillar, Corsair's own equipment bays) the moment their own `AttachDef.Type: "Module"` families are swept, with zero new code — only new data.
- `port_NameConfigurableSlot` (confirmed real, generic localization key, `"Configurable Slot"`) suggests CIG's own UI has a first-class concept here; SFM's future UI work (out of scope for this ADR) can reuse the same term with confidence it is CIG's own vocabulary, not an SFM invention.

## Non-Goals (this ADR)

- No implementation of any kind — this document and its companion deliverables are the design only.
- No new bulk-import 258-hull sweep (a small, targeted, hand-verified sample was used to prove the mechanism generalizes; a full sweep is future implementation work, see `MigrationStrategy.md` and the Readiness Review below).
- No change to `isComponentSelectableForPort`, `CATEGORY_TO_PORT_TYPE`, the component catalog generator, or any Commander-visible UI.
- No resolution of the open port-vs-component authority question (R-001) — documented, not solved.

## Risk Register (summary — full register in `EngineeringRiskRegister.md`)

| ID | Risk | Likelihood | Impact | Status |
|---|---|---|---|---|
| R-001 | Swap-group membership inferred from component-side tag co-occurrence, not a proven port-side declaration | Medium | Medium — a future CIG patch could add a genuinely different item sharing a tag string by coincidence | Documented, mitigated by validation rules in `SwapGroupSpecification.md` |
| R-002 | The `$`-prefix convention is an observed pattern, not CIG-documented | Low | Low — a counter-example would only reduce confidence scoring, not silently corrupt data | Documented |
| R-003 | Richer per-port `SItemPortDef` may exist unexamined deeper in the record graph | Unknown | Low (upside risk — missed corroborating signal) | Open investigation, listed below |
| R-004 | Persisted Component Reference Drift (pre-existing, elevated by this work) | Medium | Medium | Documented in full in `EngineeringRiskRegister.md` |

## Engineering Readiness Review

### Implementation prerequisites
1. Confirm whether Authority 2 (`SEntityComponentDefaultLoadoutParams`) is reachable via a **bulk** field query, or whether it requires per-entity `dcb query` calls (current confirmed method) — this determines whether a 258-hull sweep is minutes or hours of generation time. Not yet tested at bulk scale.
2. Decide, with the Chief Architect, the acceptable confidence threshold for surfacing a swap group to a Commander (see `SwapGroupSpecification.md`'s Confidence field) before any UI work begins.
3. Confirm the Module taxonomy's inventory/readiness participation rules (`ModuleTaxonomyProposal.md`) against at least one real Commander workflow scenario before implementation, since this changes what counts as "ready."

### Remaining unknowns
- Whether a port-side compatibility declaration exists anywhere in reachable DataCore data (R-001/R-003).
- The complete, exhaustive list of vessels using this mechanism (only a targeted sample was swept; see `MigrationStrategy.md` for the proposed full-sweep procedure, explicitly deferred to implementation).
- Whether CIG's own Loadout Manager applies additional filtering beyond tag co-membership (e.g., unlock/ownership/reputation gates) that would never be visible in static DataCore records at all.

### Open investigations
- Full 258-hull structural sweep for the `entityClassName == "" && entityClassReference present && no nested entries` shape (SW-008C Rev 1's own Task 3, only partially completed via tag-based search rather than the literal structural sweep).
- Whether the Hornet nose slot (`hardpoint_nose_cone`, filed under a `module/` path per the raw reference, matching the Chief Architect's own "don't trust the human-facing tab classification" hint) belongs to a swap-group family not yet identified — its own referenced item (`ANVL_F7_Mk2_NoseCap`) had no populated `Tags`/`Ports` of its own at the time of investigation.

### Recommended implementation order
1. Build the Configuration Topology reader (Authority 2) as a standalone, testable extraction — no merge yet.
2. Build the Swap Group Resolver (Authority 3) as a standalone, testable index over the existing bulk-tag-query mechanism.
3. Merge (per `ImportPipeline-v2.md`'s Merge Strategy) against a small, hand-verified vessel set (Hornet Mk II, Retaliator, Scorpius, MOTH — the same four already proven here) before any wider rollout.
4. Only then run the full hull sweep and expand coverage.

### Recommended certification strategy
Mirror `docs/ImportPipeline.md`'s existing certification discipline exactly: real fixtures (not synthetic) for the proven vessels, golden-value comparison against the swap-group tables in this ADR, and an explicit "unresolved/low-confidence" certification bucket — never a silent pass for a vessel the resolver can't fully explain.

## Amendment (SW-013C.2/2A/2B) — Correcting Authority 1's "confirmed limitation" claim

**Historical hypothesis (this ADR's original text, §"Authority 1", above):** "`loadout`... silently drops an entry whose `entityClassName` is empty and whose `entityClassReference` resolves to nothing concretely installed — confirmed directly: `hardpoint_weapon_center` (Hornet Mk II)... [is] absent from the exported `loadout` array."

**Certified finding (SW-013C.2B, direct re-verification against the current checked-in `raw-data/*.json` exports):** this claim was **incorrect**. `hardpoint_weapon_center` and every other confirmed configuration point in this ADR **is** present in `doc.loadout`, each carrying a real, factory-installed entity (e.g. `UMNT_ANVL_S5_Cap_Mk2` for the Hornet Mk II Center, `AEGS_Retaliator_Module_Front_Base`/`_Rear_Base` for the Retaliator). The port is excluded later in the pipeline, for a narrower and more specific reason than "absent from geometry": its factory component's DataCore category (`Module` — or, for the Hornet's nose position specifically, `Misc`) had no entry in `src/normalizer/classificationTranslator.ts`'s translation table, so `classifyPort` never receives a `portType` for it and excludes it as unclassifiable — exactly the gap this ADR's own **Decision D5** already anticipated: *"Module is a new, first-class DataCore category translation, not a special case of Utility... this is a translation-boundary gap to fix at that boundary, not a caller-side workaround."*

**Why the original claim was wrong:** it was based on Authority 2 (`SEntityComponentDefaultLoadoutParams`, reached via per-entity `dcb query`) showing an empty nested `entries: []` for the port, which was read as "nothing installed, and therefore dropped by the geometry exporter." Authority 1's actual export mechanism (`--dump-hierarchy`, the same tool `raw-data/*.json` fixtures already contain) is a **structurally different** extraction with its own node shape (`{port, entity, children}`) — and it **does** include these nodes, with a real `entity` field. The two authorities were never actually in conflict; the original investigation compared the wrong pairing.

**Resolution implemented (SW-013C.2B):** rather than the "configuration-only port materialization" merge architecture SW-013C.2A's work order specified (built on the now-corrected premise), the actual fix was the smaller, safer one this ADR's own Decision D5 already prescribed — activate `Module`/`Misc` category translation for the individually-verified entity classes confirmed by this investigation (`src/normalizer/classificationTranslator.ts`'s `CONFIRMED_MODULE_ENTITY_CLASSES`/`CONFIRMED_NOSE_CAP_ENTITY_CLASSES`), a new `Module` canonical port type / `Modules` equipment group (`src/normalizer/portClassifier.ts`, `src/engine/types/equipmentGroup.ts`), and swap-group-only compatibility (`src/data/componentCatalog.ts`) — never a blanket category match, never a second topology authority. See `docs/SW-013C.2B-Module-Taxonomy-Activation-Report.md` for the full implementation record.

**Readiness Participation (the open question `docs/ModuleTaxonomyProposal.md` flagged):** resolved by the Chief Architect as a hybrid — a Module port is readiness-neutral while its target follows the factory default (Cap or no explicit Commander choice), and becomes readiness-bearing (a real "Missing" state until installed) the moment a Commander explicitly targets a real alternative. Delivered entirely by the existing, unmodified `computeHardpointStatus`/`calculateBuildProgress` engine — no Module-specific readiness code exists, per the work order's own explicit instruction.

## Amendment (SW-013C.2E/2F) — A genuinely different limitation: the confirmed-real, factory-empty port

Investigating the Hornet Mk II Nose Turret (SW-013C.2E Objective 1) and the Retaliator's Ordnance module's own nested rack-mount port (SW-013C.2E Objective 4) surfaced a **real, distinct** limitation from the one this ADR's earlier amendment corrected above — not a repeat of the "Module category untranslated" gap, and not resolvable the same way.

**The gap:** SFM's entire import pipeline creates a `Port` **only** from an occupied `doc.loadout` entry (an entry with a real `entity` field). A hardpoint that is real and physically present on a ship's own 3D model (confirmed via its own `bone_to_world` transform data in the raw StarBreaker export) but which that specific ship variant ships **factory-empty** — no `entity` populated for it at all — never becomes a `Port` object, regardless of how much confirmed compatibility data (a real swap group, discovered independently of any one ship's own loadout) exists for the identical port name on a sibling variant's own occupied use of it.

**Confirmed real, not hypothetical:**
- The Hornet Ghost Mk II (`ANVL_Hornet_F7CS_Mk2`) ships `hardpoint_weapon_nose` empty; the F7CM Mk2/F7A Mk2 variants ship the identical node occupied, with a real, confirmed 2-member swap group (`ANVL_Hornet_Mk2`: `ANVL_Hornet_F7A_Nose_Turret` / `ANVL_Hornet_F7C_Mk2_Nose_Turret`). SW-013C.2F fixed the Commander-facing consequence on the ships that DO occupy this port (a generic-sweep contamination bug, unrelated to the empty-port gap itself — see that mission's Objective 1) but left the Ghost's own empty port un-materialized, correctly, per this ADR's own "do not fabricate implementation" discipline.
- The Retaliator's own Ordnance module variants (`AEGS_Retaliator_Module_Front_Bomber`/`_Rear_Bomber`) each carry a real, confirmed child port of their own (`hardpoint_torpedo_launcher_fore`/`_rear`) that is never factory-occupied by any ship in the raw-data corpus — compounding a second novel shape: the port itself accepts a size RANGE (MinSize 3–MaxSize 9) and multiple DataCore Types (MissileLauncher/BombLauncher/WeaponGun-Rocket) simultaneously, a port shape no existing compatibility mechanism represents even once materialized.

**Why this isn't the same fix as the Module amendment above:** that gap was a missing *classification rule* for an already-imported port — a small, safe, one-layer fix. This gap is the port's own *existence* — fixing it requires either (a) a normalizer capability aware of sibling ships' own occupied use of the identical port name (cross-ship, not per-ship), or (b) a new post-processing graft step spanning several interdependent generated files (`ports.json`, `components.json`, `factory-loadouts.json`, `installed-loadouts.json`, `target-builds.json`). Neither exists today. SW-013C.2E/2F's own Stop Conditions (`docs/SW-013C.2E-Authoritative-Module-Discovery-Report.md`) explicitly decline to build either speculatively.

**Commander-facing mitigation shipped instead (SW-013C.2F):** rather than leaving the Retaliator's Ordnance selection looking silently incomplete, a small, evidence-gated "Additional Topology Pending" badge (never a fabricated child row) tells the Commander explicitly that the module's own further topology is real but not yet materializable — see `docs/SW-013C.2F-Commander-UX-Closure-Report.md`.

**Recommendation:** this "confirmed-real, factory-empty/never-occupied port" capability, now independently motivated by two unrelated real cases, is a legitimate candidate for its own dedicated, carefully-reviewed future mission — not a bolt-on to a Commander-UX-focused work order.

## Amendment (SW-013C.2F Amendment A, Finding 4) — the Hornet Nose Turret gap is stronger than "factory-empty"

Direct re-inspection of `generated-data/ports.json` for every currently-imported Hornet Mk II variant found the gap above understates the Ghost's own case: its nose position is not the SAME port (`hardpoint_weapon_nose`) sitting factory-empty — the Ghost's own real DataCore export never contains that port, occupied or not, in any form. Its nose position is a **different, real, physically-present** port under a different `internalName` (`hardpoint_nose_cone`), a different `canonicalPortType` (`Module` vs `WeaponTurret`), a different `equipmentGroup`, a different size (S1 vs S3), and it owns no analog of the turret variant's own two real child weapon mounts. Full evidence, the rejected implementation shapes, and the resulting recommendation (Nose Turret explicitly unsupported in current Beta, no synthetic port) are recorded in `docs/DormantHardpointMaterializationProposal.md`.

## Amendment (SW-013C.2G) — Resolution: Authoritative Supplemental Topology and the Dormant Hardpoint

The two prior amendments above left the Ghost's own nose-turret gap open pending a dedicated mission with its own evidence-gathering and test discipline. SW-013C.2G is that mission. It resolves the gap not by weakening Authority 1 (the import pipeline still creates a `Port` **only** from a real `doc.loadout`/`root_nmc` entry) but by introducing a **fourth, narrowly-scoped authority** that sits entirely outside the import pipeline: a small, individually-curated, evidence-gated list of ports that are proven — never inferred — to physically exist on a specific ship despite carrying no `loadout` entry of their own.

**Formal vocabulary (for future ADRs/reports to reuse):**
- **Factory-instantiated topology** — every `Port` the import pipeline itself produces from a ship's own occupied `doc.loadout`. This remains the entire universe of ports for the overwhelming majority of the fleet and is never modified by this amendment.
- **Authoritative supplemental topology** — a small, additive set of ports that do NOT appear in a ship's own `loadout` but whose physical existence and compatibility are independently provable from data the pipeline already treats as authoritative (see the four-point evidence standard below). This is strictly additive — it can only ADD a port that would otherwise be invisible, never alter, merge, or reinterpret a port the pipeline already produced.
- **Dormant hardpoint** — a materialized member of authoritative supplemental topology. "Dormant" describes its state, not a lesser trust tier: once materialized, it participates in Factory/Installed/Target separation, readiness, procurement, reservations, and persistence identically to a real imported port, with exactly one behavioral difference — it never carries a factory default (`factoryItemId`/`factoryEntityClass` are permanently absent), so it never appears occupied until a Commander explicitly targets it.

**Four-point evidence standard required for every dormant hardpoint** (see `src/generated/dormantHardpoints.ts`'s own doc comment for the canonical statement, restated here for the architecture record):
1. **Physical existence** — the exact `internalName` node must be present in the affected ship's OWN `raw-data/<ship>.json` `root_nmc` geometry-hierarchy export (Authority 1) — never borrowed from a sibling ship's own geometry.
2. **Compatibility** — a confirmed swap group (Authority 3, `generated-data/configurable-slots.runtime.json`) must exist for the identical port name on at least one real ship that DOES factory-populate it.
3. **No inference from names/descriptions** — every synthesized field (`canonicalPortType`, `equipmentGroup`, `assemblyRole`, `minSize`/`maxSize`) is copied verbatim from a real, occupied port of the identical `internalName` on a donor ship, never guessed from the target ship's own display name or hull family label.
4. **Stable canonical identity** — a deterministic id (`${shipId}-dormant-${internalName}`) that never recomputes differently between reloads and can never collide with the normalizer's own `-port-` id scheme.

**Provenance and reconciliation rules:**
- `generated-data/ports.json` and every other generated import artifact are never mutated. `src/generated/dormantHardpoints.ts`'s `materializeDormantPorts(shipId, existingPorts)` is the ONLY place a `Port` is ever synthesized outside the import pipeline, called exactly once per ship by `src/generated/importedShips.ts`'s `buildView()`, and is dedup-safe: if a future data refresh ever genuinely populates the same `internalName` for that ship, the real imported port silently wins and the spec becomes a permanent no-op.
- A materialized dormant port is marked with `isDormant: true` and `dormantDonorShipEntityClass` (the entity class of the real ship that earned the swap-group entry being borrowed for compatibility resolution — necessary because `configurable-slots.runtime.json` indexes swap groups strictly per occupying ship, and a dormant port's own ship never occupies it).
- Like `assemblyRole`/`groupLabel` before it, `isDormant`/`dormantDonorShipEntityClass` are **never persisted redundantly on a saved Mission-kind `Hardpoint` row** — they are recomputed at prepare/render time by `src/utils/loadoutEditorModel.ts`'s `overlayCanonicalHierarchy`, which joins the saved row back to the CURRENT `shipFactoryTemplates` entry by `slotLabel`. This is the existing established pattern for template-derived metadata, not a new mechanism.
- Reconciliation (`src/utils/fleetAssetReconciliation.ts`) always resolves a dormant port's identity from its stable `internalName`/canonical id, never from row position or display label — identical to every other port in the system.

**Safety boundaries actively enforced (Objective 6):** a dormant port can never duplicate an already-imported port for the same physical hardpoint (dedup check above); the mechanism creates at most one port per confirmed `DormantHardpointSpec` entry, never a second port for one physical hardpoint; it never merges unrelated component variants; it never exposes components by size/category matching alone (the compatibility gate is the same confirmed-swap-group authority every other port already uses); it never weakens vessel-bound compatibility (`vesselBoundTags` gating, see the SW-013C.2F Amendment A report, applies identically); it never mutates inventory or inflates a ship's factory loadout (a dormant port permanently has no factory item); and it never appears occupied by default.

**Resolution implemented (SW-013C.2G):** exactly one dormant hardpoint is currently confirmed and activated — the F7C-S Hornet Ghost Mk II's Nose Weapon mount (`hardpoint_weapon_nose`), which contributes two weapon child ports (`Weapon Slot 1`/`Weapon Slot 2`) when a Commander selects the confirmed turret variant. A fleet-wide reconnaissance audit (`scripts/generateDormantHardpointAudit.ts`, output `generated-data/dormant-hardpoint-audit.json`) identified thousands of further candidates across the full ship corpus, triaged into Confirmed/Probable/Needs Investigation confidence tiers; per this amendment's own evidence standard, none of them were activated in this pass — see `docs/SW-013C.2G-Dormant-Hardpoint-Materialization-Report.md` and `docs/Roadmap.md` for the full candidate list and the honest limitations of the audit's own blind cross-fleet matching (it produces both false positives — coincidental `internalName` reuse across unrelated ship families — and at least one false negative, the Ghost's own case, which required additional manual narrowing beyond what the generic audit does automatically).

**Amendment (SW-013C.2G Amendment C) — a confirmed swap group is necessary, not sufficient, for a dormant port's own candidate list.** An independent Commander SPPV validation (used only as a trigger, never as encoded runtime authority) found SFM's own candidate list over-broad: of the swap group's 2 confirmed members, only one (`ANVL_Hornet_F7C_Mk2_Nose_Turret`) is genuinely valid on the Ghost. Direct live `dcb query` archaeology confirmed this independently and converged on the same conclusion three ways: the two members carry materially different `AttachDef.RequiredTags` (`ANVL_Hornet_F7A_Mk2` — an exclusively military-family tag — vs the broader `ANVL_Hornet_Mk2`); the excluded member is factory-installed only on military/Super-Hornet-family hulls in the raw-data corpus, never a civilian/stealth one; and the *rejected* member's own intrinsic component ports (queried directly, independent of any ship's installation) resolve to 2×S2 — correcting a prior "honest gap" (zero children, no installed-instance evidence existed) and directly matching the SPPV finding.

**Refinement to the evidence standard's own Compatibility point (§4 above):** a confirmed swap group proves component interchangeability on *some* real ship — it does not, by itself, prove every member is valid on a *dormant* port's own specific ship/variant/family, since the dormant ship (having no real occupied instance of its own) can never independently confirm which members actually apply to it. `DormantHardpointSpec` gained an explicit, opt-in `restrictCandidatesToEntityClasses` field (`src/generated/dormantHardpoints.ts`) for exactly this case — narrowing, never widening, a donor's own swap-group membership down to the independently-confirmed-compatible subset, applied only to the dormant port's own candidate list and never altering the underlying swap group or its behavior on the ships that actually earn it. See `docs/SW-013C.2G-Amendment-C-Vessel-Restriction-Report.md` for the full evidence chain and implementation.
