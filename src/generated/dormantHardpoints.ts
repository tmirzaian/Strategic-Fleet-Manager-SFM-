import type { Port } from '../engine/types'
import type { EquipmentGroup } from '../engine/types/equipmentGroup'

/**
 * Dormant Hardpoint Materialization (SW-013C.2G).
 *
 * A small, individually-curated, evidence-gated list of Ports that are
 * authoritatively confirmed to physically exist on a specific ship but are
 * absent from that ship's own raw imported topology
 * (`generated-data/ports.json`) — never a blanket rule, never derived from
 * ship name/display text, never activated merely because the generic
 * mechanism exists (see docs/SW-013C.2G-Dormant-Hardpoint-Materialization-Report.md's
 * own "Fleet-Wide Audit" section for the full candidate list this was
 * triaged from, and why every candidate but the one below was left
 * unimplemented pending equivalent evidence quality).
 *
 * Evidence standard for every entry (all four required by the work order):
 *   1. Physical existence — the exact `internalName` node is present in
 *      this ship's OWN `raw-data/<ship>.json` `root_nmc` geometry-hierarchy
 *      export (StarBreaker `--dump-hierarchy`, Authority 1 per ADR-014) —
 *      ship-specific evidence, never borrowed from a sibling.
 *   2. Compatibility — a confirmed swap group exists for this exact port
 *      name on at least one real ship that DOES factory-populate it (see
 *      `generated-data/configurable-slots.runtime.json`) — the same
 *      authority every other swap-group-gated port in this codebase
 *      already uses.
 *   3. Never inferred from names/descriptions — every field below is
 *      copied verbatim from a real, occupied port of the identical
 *      `internalName` on a donor ship (`generated-data/ports.json`), not
 *      guessed from this ship's own display name or hull family label.
 *   4. Stable canonical identity — `id` is deterministic
 *      (`${shipId}-dormant-${internalName}`), collision-proof against the
 *      normalizer's own `-port-` id scheme, and never recomputed
 *      differently between reloads (see `materializeDormantPorts` below).
 *
 * This module is the ONLY place a Port is ever synthesized outside the
 * import pipeline. `generated-data/ports.json` itself is never mutated —
 * see `src/generated/importedShips.ts`'s own `buildView`, the sole call
 * site, for how this integrates without touching the raw artifact.
 */
export interface DormantHardpointSpec {
  /** The exact deep-imported shipId(s) this applies to (never a
   * substring/display-name match — see `src/data/seed.ts`'s ship catalog
   * or `generated-data/ships.json` for the authoritative id list). */
  shipIds: string[]
  /** The real DataCore internalName this hardpoint carries on every donor
   * ship that factory-populates it, and that this ship's own raw geometry
   * export (`root_nmc`) confirms as physically present. */
  internalName: string
  displayName: string
  positionLabel?: string
  canonicalPortType: string
  equipmentGroup: EquipmentGroup
  assemblyRole?: string
  minSize: number
  maxSize: number
  /** The real DataCore ship entity class of a donor ship that DOES
   * factory-populate this exact port name — `generated-data/configurable-slots.runtime.json`
   * indexes its own confirmed swap-group data strictly per-ship (by the
   * ship that actually occupies the port), so a ship that never occupies
   * it (every ship this spec applies to, by construction) has no entry of
   * its own to look up. `ShipWorkspacePrototype.tsx`'s own
   * `configurableSlotFor` reads this donor's entity class instead of the
   * dormant port's own ship when `Hardpoint.isDormant` is true — the
   * SAME confirmed-group authority, just resolved through the ship that
   * actually earned it, never a second/separate compatibility rule. */
  donorShipEntityClassForCompatibility: string
  /** SW-013C.2G Amendment C — a confirmed swap group (via
   * `donorShipEntityClassForCompatibility`) proves "these components are
   * interchangeable on SOME real ship" — it does NOT by itself prove every
   * member is valid on THIS dormant port's own ship/variant/family. When
   * present, restricts this port's own candidate list to ONLY these entity
   * classes (a subset of, never larger than, the donor's own swap group).
   * Every entry here must independently satisfy the same evidence
   * standard as the port itself — see the Ghost's own entry below for the
   * concrete example (Amendment C's own DataCore differential: the
   * excluded member carries a materially different `AttachDef.RequiredTags`
   * value, and is only ever factory-installed on a different ship family).
   * Undefined/absent means no restriction beyond the swap group itself. */
  restrictCandidatesToEntityClasses?: string[]
  /** Human-readable citation for the engineering report/ADR — never read
   * by any runtime logic, documentation only. */
  provenance: string
}

/**
 * SW-013C.2G, Objective 1/2 — F7C-S Hornet Ghost Mk II Nose Turret.
 *
 * Evidence chain (full detail in the engineering report):
 *   - `raw-data/ANVL_Hornet_F7CS_Mk2.json`'s own `root_nmc` contains a
 *     `hardpoint_weapon_nose` node (confirmed by direct inspection) with
 *     ZERO corresponding `loadout` entry — physically present, never
 *     factory-populated, on the Ghost's own ship-specific export.
 *   - The identical `hardpoint_weapon_nose` internalName IS factory-
 *     populated on four other real, currently-imported F7 Mk II variants
 *     (F7A Mk2, F7CM Mk2, F7CM Mk2 Heartseeker, F7 Mk2 Collector Mod),
 *     every one of them with `canonicalPortType: "WeaponTurret"`,
 *     `equipmentGroup: "Weapons"`, `assemblyRole: "DIRECT_WEAPON_MOUNT"`,
 *     `minSize`/`maxSize: 3` (`generated-data/ports.json`) — the exact
 *     shape below, copied verbatim from those real rows, never guessed.
 *   - Confirmed 2-member swap group `ANVL_Hornet_Mk2`
 *     (`ANVL_Hornet_F7A_Nose_Turret`/`ANVL_Hornet_F7C_Mk2_Nose_Turret`,
 *     `generated-data/configurable-slots.runtime.json`) — the same
 *     authority already governing the F7CM Mk2's own real Nose Weapon
 *     Mount (SW-013C.2F Objective 1). This group's own generator output
 *     flags it `"category": "C-review-required"` (a competing, rejected,
 *     more specific 8-member tag existed on the default component) — see
 *     the Amendment C note below for the review this flag called for.
 *
 * SW-013C.2G Amendment C — an independent Commander SPPV validation found
 * only ONE of the swap group's two members genuinely valid on the Ghost
 * (`ANVL_Hornet_F7C_Mk2_Nose_Turret`, "S2 Nose Turret": S3 mount, 2×S2
 * weapon children), not both. Direct DataCore re-investigation confirmed
 * this with independent, converging evidence:
 *   - `AttachDef.RequiredTags` (live `dcb query`, not the generic `Tags`
 *     field) genuinely DIFFERS between the two swap-group members:
 *     `ANVL_Hornet_F7A_Nose_Turret` requires `ANVL_Hornet_F7A_Mk2` (the
 *     narrow tag the swap-group resolver's own "C-review-required" flag
 *     had rejected as a candidate only for having MORE members, 8 vs 2 —
 *     never evaluated for correctness); `ANVL_Hornet_F7C_Mk2_Nose_Turret`
 *     requires only the broader `ANVL_Hornet_Mk2`.
 *   - The `ANVL_Hornet_F7A_Mk2`-tagged group (`dcb query` bulk
 *     `AttachDef.Tags`) is exclusively F7A/military-family ship entity
 *     classes (`ANVL_Hornet_F7A_Mk2`, `_Exec_Military`, `_Exec_Stealth`,
 *     `_PU_AI_UEE`, `_AI_Super_Crim`, `_AI_Super_CIV`) plus the two turret
 *     components themselves — the Ghost (`ANVL_Hornet_F7CS_Mk2`) is not a
 *     member of this family under any tag found.
 *   - `ANVL_Hornet_F7A_Nose_Turret` is factory-INSTALLED (not merely swap-
 *     eligible) only on F7A/F7CM/military-family raw-data fixtures
 *     (`ports.json`) — never on any civilian/stealth Mk II variant.
 *   - `ANVL_Hornet_F7C_Mk2_Nose_Turret`'s own intrinsic component ports
 *     (live `dcb query`, `Components[].Ports[]`, independent of any ship's
 *     installation) are two `WeaponGun` ports, both fixed `MinSize:
 *     MaxSize: 2` — directly corroborating the Commander's own SPPV
 *     finding (2 ports, S2), and correcting this entry's own prior "honest
 *     gap" (zero children — no installed-instance evidence existed at the
 *     time). See `scripts/generateTurretWeaponSlots.ts`'s
 *     `CONFIRMED_INTRINSIC_PORT_TURRET_ENTITY_CLASSES` for the generator
 *     change and full citation. SPPV was used only as the validation
 *     oracle prompting this re-investigation (per Amendment C's own
 *     explicit instruction) — every value recorded here is the live
 *     DataCore query result, never a value copied from SPPV.
 *   - `ANVL_Hornet_F7A_Nose_Turret` is therefore EXCLUDED from the Ghost's
 *     own candidate list via `restrictCandidatesToEntityClasses` below,
 *     despite remaining a real, confirmed member of the swap group (still
 *     valid on the ships that actually earn it — F7A Mk2/F7CM Mk2/F7CM
 *     Mk2 Heartseeker/F7 Mk2 Collector Mod — unaffected by this
 *     restriction, which applies only to the Ghost's own dormant port).
 */
export const CONFIRMED_DORMANT_HARDPOINTS: DormantHardpointSpec[] = [
  {
    shipIds: ['hornet-f7cs-mk2-imported'],
    internalName: 'hardpoint_weapon_nose',
    displayName: 'Nose Weapon',
    positionLabel: 'Nose',
    canonicalPortType: 'WeaponTurret',
    equipmentGroup: 'Weapons',
    assemblyRole: 'DIRECT_WEAPON_MOUNT',
    minSize: 3,
    maxSize: 3,
    donorShipEntityClassForCompatibility: 'ANVL_Hornet_F7CM_Mk2',
    restrictCandidatesToEntityClasses: ['ANVL_Hornet_F7C_Mk2_Nose_Turret'],
    provenance:
      'root_nmc geometry node confirmed present in raw-data/ANVL_Hornet_F7CS_Mk2.json with zero loadout entry; shape copied verbatim from the identical port on hornet-f7a-mk2-imported/hornet-f7cm-mk2-imported (ports.json); confirmed 2-member swap group ANVL_Hornet_Mk2 (configurable-slots.runtime.json), restricted to ANVL_Hornet_F7C_Mk2_Nose_Turret only (SW-013C.2G Amendment C: AttachDef.RequiredTags divergence + factory-installation-pattern + independent SPPV corroboration — ANVL_Hornet_F7A_Nose_Turret excluded); 2x S2 weapon-child geometry confirmed via generateTurretWeaponSlots.ts CONFIRMED_INTRINSIC_PORT_TURRET_ENTITY_CLASSES (live intrinsic-port dcb query, independent of ship installation). See docs/SW-013C.2G-Dormant-Hardpoint-Materialization-Report.md and docs/SW-013C.2G-Amendment-C-Vessel-Restriction-Report.md.',
  },
]

/**
 * Synthesizes this ship's own confirmed dormant Port(s), if any — pure,
 * deterministic, never touching `generated-data/ports.json`. Called once
 * per ship by `src/generated/importedShips.ts`'s `buildView`.
 *
 * The synthesized Port always starts with NO factory/installed/target
 * item (`undefined`/absent — never pre-populated with a donor ship's own
 * factory item, per the work order's own explicit "must not... make
 * dormant ports appear occupied by default"). `isDormant: true` is the
 * one marker distinguishing it from a real imported port everywhere else
 * in the app that needs to know (see `Hardpoint.isDormant`'s own doc
 * comment).
 */
export function materializeDormantPorts(shipId: string, existingPorts: Port[]): Port[] {
  const specs = CONFIRMED_DORMANT_HARDPOINTS.filter((spec) => spec.shipIds.includes(shipId))
  if (specs.length === 0) return []

  const alreadyPresent = new Set(existingPorts.map((p) => p.internalName))
  const materialized: Port[] = []
  for (const spec of specs) {
    // Safety boundary (Objective 6) — never duplicate an already-imported
    // port representing the same physical hardpoint. If a future
    // generated-data refresh ever DOES populate this exact internalName
    // for this ship (the ship variant's own data genuinely changed), the
    // real imported port silently wins and this spec becomes a no-op,
    // never a second, colliding Port.
    if (alreadyPresent.has(spec.internalName)) continue

    materialized.push({
      id: `${shipId}-dormant-${spec.internalName}`,
      shipId,
      parentPortId: null,
      equipmentGroup: spec.equipmentGroup,
      canonicalPortType: spec.canonicalPortType,
      internalName: spec.internalName,
      displayName: spec.displayName,
      positionLabel: spec.positionLabel,
      allowedTypes: [],
      allowedSubtypes: [],
      minSize: spec.minSize,
      maxSize: spec.maxSize,
      installedItemId: undefined,
      factoryItemId: undefined,
      targetItemId: undefined,
      childPortIds: [],
      sourcePath: undefined,
      sourceEntityClass: undefined,
      assemblyRole: spec.assemblyRole,
      isStructural: false,
      isDormant: true,
      dormantDonorShipEntityClass: spec.donorShipEntityClassForCompatibility,
      dormantAllowedComponentEntityClasses: spec.restrictCandidatesToEntityClasses,
    })
  }
  return materialized
}
