import type { ComponentMetadata } from './componentMetadataResolver'

/**
 * `classificationTranslator` — the one place DataCore's own `Type`/`SubType`
 * taxonomy is interpreted into a canonical port type `portClassifier.ts`
 * already recognizes. Pure, side-effect-free, and independently testable:
 * it never touches the loadout tree, the resolver, or a file system.
 *
 * `portClassifier.ts` remains the final authority on which canonical port
 * types map to which `EquipmentGroup` — this module only ever produces a
 * canonical port type *name* that classifier is expected to already know.
 * Every mapping below was chosen by first inspecting
 * `portClassifier.ts`'s `INCLUDED_TYPE_TO_GROUP` table (see
 * docs/ImportPipeline.md's "Classification Translation" section for the
 * full policy and the one deliberate addition this required).
 */

/** Structural context a caller can supply to disambiguate a translation
 * that DataCore's own fields alone cannot resolve. Every field here must
 * come from already-resolved, authoritative catalog data — never from
 * parsing a name string. */
export interface ClassificationContext {
  /** The DataCore `category` (Type) of this node's direct children, as
   * already resolved via `ComponentMetadataResolver` — used only for
   * verified-structural disambiguation (see the Mount_Gimbal_S3 case
   * below), never for name-based guessing. */
  childCategories?: Array<string | null>
}

export type ClassificationTranslation =
  | { status: 'translated'; sourceCategory: string; sourceSubtype?: string; canonicalPortType: string; reason: string }
  | { status: 'excluded'; sourceCategory: string; sourceSubtype?: string; reason: string }
  | { status: 'unresolved'; sourceCategory?: string; sourceSubtype?: string; reason: string }

/**
 * DataCore categories that are internal weapon subassemblies, never
 * player-configurable equipment on their own — confirmed by direct
 * catalog inspection (Mission M-006/M-009): `GATS_BallisticGatling_Barrel_S3`,
 * `..._FiringMechanism_S3`, `..._PowerArray_S3`, and `..._Ventilation_S3`
 * all carry DataCore category "WeaponAttachment" regardless of their
 * differing subtypes (Barrel/FiringMechanism/PowerArray/Ventilation) — the
 * *category* itself is the authoritative signal, so this excludes the
 * whole family without enumerating every subtype CIG might ever add.
 */
const EXCLUDED_CATEGORIES = new Set(['WeaponAttachment'])

interface TranslationRule {
  category: string
  /** `null` means "any subtype accepted" — used only for the categories
   * the mission specified without a paired subtype (Radar, LifeSupport,
   * Computer, Relay). Every other rule requires an exact subtype match. */
  subtype: string | null
  canonicalPortType: string
  /** SW-013C.2B — when present, this rule matches ONLY these exact,
   * individually-verified entity classes, never every member of
   * `category`/`subtype`. Used when a DataCore category is confirmed
   * heterogeneous (see `CONFIRMED_MODULE_ENTITY_CLASSES` below) and only a
   * specific, evidence-backed subset is confirmed to be a real,
   * authoritative ship equipment position — the rest stay `unresolved`,
   * exactly as before this rule existed. */
  entityClassAllowlist?: ReadonlySet<string>
}

/**
 * SW-013C.2B (Module Taxonomy Activation, Objective 1) — DataCore category
 * "Module" is confirmed real ship equipment for some members (the Hornet
 * Center Cap/Rotodome family, the Retaliator's module bays — both
 * individually verified this session via direct raw-export + catalog
 * inspection, and both members of a real, tag-confirmed swap group per
 * `docs/ADR/ADR-014` Authority 3) — but also covers entities with zero
 * verification for this mission's purposes: a ground-vehicle cosmetic
 * bodykit (`GLSN_Basher_Addon_Mohawk_Default`) and not-yet-investigated
 * cargo/medical modules (`ANVL_Hornet_F7C_Cargo_Mod`,
 * `ANVL_Hornet_F7C_Mk2_Cargo_Door`, `RSI_Apollo_Module_*`). Objective 1's
 * own instruction — "translate only authoritative module positions... do
 * not broadly classify" — is honored by an exact entity-class allowlist,
 * not a blanket category match. Confirmed via
 * `generated-data/component-metadata-catalog.json`: exactly 13 entities
 * carry category "Module" catalog-wide; the 7 NOT listed here remain
 * unresolved, exactly as before this mission.
 */
const CONFIRMED_MODULE_ENTITY_CLASSES: ReadonlySet<string> = new Set([
  'UMNT_ANVL_S5_Cap', // Hornet Center Cap — Mk I/base family factory default (e.g. F7CS)
  'UMNT_ANVL_S5_Cap_Mk2', // Hornet Center Cap — Mk II family factory default (e.g. Ghost)
  'UMNT_ANVL_S5_Rotodome', // Hornet Center alternative/default — Mk I/base family (e.g. F7CR)
  'UMNT_ANVL_S5_Rotodome_Mk2', // Hornet Center alternative/default — Mk II family
  'AEGS_Retaliator_Module_Front_Base',
  'AEGS_Retaliator_Module_Rear_Base',
])

/**
 * SW-013C.2B — the Hornet Mk II family's nose equipment position carries
 * DataCore category "Misc", not "Module" (confirmed via direct raw-export
 * inspection this session), but is the same structural concept: a real,
 * factory-installed hull attachment point, currently unclassified. Exactly
 * two entities, individually verified — not a blanket Misc translation
 * (Objective 1: "do not broadly classify every Misc object as a Module").
 * Its own swap-group/alternative-component data remains unresolved (see
 * `docs/SW-013C.2A-Configuration-Only-Port-Materialization-Report.md`) —
 * classifying it makes the port and its real factory item visible and
 * operable; it does not, by itself, supply any alternative to target.
 */
const CONFIRMED_NOSE_CAP_ENTITY_CLASSES: ReadonlySet<string> = new Set(['ANVL_F7_Mk2_NoseCap', 'ANVL_F7CR_Mk2_NoseCap'])

/**
 * Exact (category, subtype) -> canonical port type. Every target here was
 * verified against `portClassifier.ts`'s existing `INCLUDED_TYPE_TO_GROUP`
 * before being written — see docs/ImportPipeline.md for the two
 * deliberate deviations from Mission M-009's own illustrative examples:
 *
 * - `MissileLauncher`/`MissileRack` targets the existing `MissileRack`
 *   spelling, not the mission text's illustrative `MissileLauncher` —
 *   `MissileRack` already exists in `portClassifier.ts` and the mission's
 *   own governing rule ("do not invent new spellings when an existing one
 *   exists") takes precedence over its own example arrow.
 * - `LifeSupportGenerator` (DataCore's actual Type for the one real
 *   life-support entity observed) targets the existing `LifeSupport`
 *   spelling `portClassifier.ts` already expects.
 *
 * `JumpDrive` is the one genuinely new canonical port type this mission
 * adds to `portClassifier.ts` (folded into the existing `QuantumDrive`
 * equipment group, not a new one) — see that file for the justification.
 *
 * `Computer` -> `Avionics` is included as a forward-looking rule but is
 * currently dormant: the one real "computer" entity in the Gladius fixture
 * (`COMP_BEHR_S01_CSR-RP`) has DataCore category "Misc", which correctly
 * stays unresolved rather than being guessed into Avionics.
 *
 * `Armor` is deliberately NOT in this table — see `translateClassification`'s
 * doc comment.
 */
const TRANSLATION_RULES: TranslationRule[] = [
  { category: 'WeaponGun', subtype: 'Gun', canonicalPortType: 'WeaponGun' },
  { category: 'Shield', subtype: 'UNDEFINED', canonicalPortType: 'Shield' },
  { category: 'Cooler', subtype: 'UNDEFINED', canonicalPortType: 'Cooler' },
  { category: 'PowerPlant', subtype: 'Power', canonicalPortType: 'PowerPlant' },
  { category: 'QuantumDrive', subtype: 'UNDEFINED', canonicalPortType: 'QuantumDrive' },
  { category: 'JumpDrive', subtype: 'UNDEFINED', canonicalPortType: 'JumpDrive' },
  { category: 'MissileLauncher', subtype: 'MissileRack', canonicalPortType: 'MissileRack' },
  { category: 'Missile', subtype: 'Missile', canonicalPortType: 'Missile' },
  { category: 'Radar', subtype: null, canonicalPortType: 'Radar' },
  { category: 'LifeSupportGenerator', subtype: null, canonicalPortType: 'LifeSupport' },
  { category: 'Computer', subtype: null, canonicalPortType: 'Avionics' },
  { category: 'Relay', subtype: null, canonicalPortType: 'Relay' },
  /** EWO-020: DataCore's own "fixed weapon mount" category, confirmed via
   * direct catalog inspection (Valkyrie's door guns,
   * `WeaponMount_Gun_S1_ANVL_Asgard_Door_*`, both resolve to exactly
   * `category: "WeaponMount", subtype: "WeaponControl"` — the only subtype
   * value observed across all 12 real `WeaponMount` catalog entries).
   * Maps to the existing `WeaponGun` canonical type/`Weapons` group, the
   * same as any other direct (non-gimbal) weapon position. */
  { category: 'WeaponMount', subtype: 'WeaponControl', canonicalPortType: 'WeaponGun' },
  /** EWO-041 (CWO-001 Task 1) — mining lasers mount like weapons in
   * DataCore's own taxonomy: confirmed via direct catalog inspection, all
   * 23 real `WeaponMining` entries (e.g. `Mining_Laser_GRIN_Arbor_S2`,
   * "Arbor MH2 Mining Laser") carry exactly `subtype: "Gun"`, no
   * exceptions observed. Maps to `portClassifier.ts`'s existing
   * `MiningLaser` canonical type (`Mining` group) — already present in
   * that table, never previously reachable because nothing translated
   * into it. */
  { category: 'WeaponMining', subtype: 'Gun', canonicalPortType: 'MiningLaser' },
  /** EWO-041 (CWO-001 Task 2) — confirmed via direct catalog inspection:
   * all 12 real `TractorBeam` entries (e.g. `GRIN_TractorBeam_S2`,
   * "SureGrip S2 Tractor Beam") carry either `subtype: null` or the
   * equivalent `"UNDEFINED"` spelling — never a distinguishing value — so
   * subtype is accepted-any here, the same convention as Radar/Relay
   * above. Maps to `portClassifier.ts`'s existing `TractorBeam` canonical
   * type (`Utility` group). */
  { category: 'TractorBeam', subtype: null, canonicalPortType: 'TractorBeam' },
  /** EWO-041 (CWO-001 Task 3) — the real root cause of "salvage equipment
   * doesn't resolve": confirmed via direct catalog inspection that
   * `Salvage_Head_standard` ("Baler Salvage Head") and 8 other real
   * `SalvageHead` entries already exist in the catalog with `subtype:
   * null` throughout — this category simply had no translation rule, the
   * identical gap shape as WeaponMining/TractorBeam, not a missing
   * catalog/taxonomy entry as CWO-001 first suspected (the arm assembly
   * that hosts the head, e.g. `DRAK_Vulture_Salvage_Arm_Left`, is a
   * separate, correctly-unresolvable structural node — see
   * shipNormalizer.ts's structural-preservation path). Maps to
   * `portClassifier.ts`'s existing `SalvageHead` canonical type
   * (`Salvage` group). */
  { category: 'SalvageHead', subtype: null, canonicalPortType: 'SalvageHead' },
  /** EWO-041 (CWO-001 Task 3, follow-on) — the salvage head's own
   * children (e.g. `Salvage_Modifier_Scraper_Small`,
   * `Salvage_Modifier_Tractor_Small`) resolve real DataCore metadata
   * under a distinct `SalvageModifier` category (confirmed via a direct
   * live DataCore query — this category was absent from
   * `componentTaxonomy.ts`'s bulk-scan allowlist, so no such record had
   * ever reached the generated catalog; added there alongside this rule).
   * Observed subtypes vary by modifier flavor (`"UNDEFINED"`,
   * `"SalvageModifier_TractorBeam"`) with no distinction meaningful to
   * SFM's own model, so subtype is accepted-any here too. Maps to
   * `portClassifier.ts`'s existing `SalvageModule` canonical type
   * (`Salvage` group). */
  { category: 'SalvageModifier', subtype: null, canonicalPortType: 'SalvageModule' },
  /** SW-013C.2B (Objective 1) — see `CONFIRMED_MODULE_ENTITY_CLASSES`'s own
   * doc comment above for the full evidentiary basis. Maps to the new
   * `Module` canonical port type (`Modules` equipment group,
   * `portClassifier.ts`) — deliberately not folded into `Utility` (see
   * `docs/ModuleTaxonomyProposal.md`'s "Why not Utility" section: a Module
   * is never broadly interchangeable with another same-category Module the
   * way Utility's own family is). */
  { category: 'Module', subtype: null, canonicalPortType: 'Module', entityClassAllowlist: CONFIRMED_MODULE_ENTITY_CLASSES },
  /** SW-013C.2B (Objective 1) — see `CONFIRMED_NOSE_CAP_ENTITY_CLASSES`'s
   * own doc comment above. Same canonical port type as the Module-category
   * rule above — both are the same "swappable hull attachment filler"
   * concept, just filed under different DataCore Types. */
  { category: 'Misc', subtype: null, canonicalPortType: 'Module', entityClassAllowlist: CONFIRMED_NOSE_CAP_ENTITY_CLASSES },
  /** SW-013C.2D (Objectives 5/6) — the Electronic Warfare family the
   * Architectural Certification Fleet (Avenger Warlock, Anvil Hawk;
   * `AEGS_EMP_Device_S4`/`ANVL_Hawk_EMP_Device_S2`) exposed as completely
   * unclassified. Confirmed via direct catalog inspection: exactly 6 real
   * entities carry DataCore category "EMP" catalog-wide (REP-8/REP-VS EMP
   * Generator, TroMag Burst Generator x3, Magstrand EMP Generator) — small
   * and entirely clean (every member is real player equipment, no
   * cosmetic/irrelevant contamination the way "Module"'s 13 members had),
   * so a whole-category rule is justified here without an entity
   * allowlist (Objective 6: "avoid broad catch-all mappings" — this is not
   * a catch-all, it's a fully-audited category with zero excluded
   * members). Maps to the new `EMP` canonical port type (`ElectronicWarfare`
   * equipment group, `portClassifier.ts`), a top-level "Support Systems"
   * section per the Chief Architect's own preferred placement. */
  { category: 'EMP', subtype: null, canonicalPortType: 'EMP' },
  /** SW-013C.2D (Objectives 5/6) — the Guardian Qi's Quantum Dampener
   * (`QDMP_RSI_S03_Captor`) and the Mantis's QED/"Quantum Snare"
   * (`QED_WETK_S03_Reynie`) both resolve to the SAME DataCore category,
   * `QuantumInterdictionGenerator` — confirmed via direct catalog
   * inspection, not inferred from either entity's own displayName (which
   * is itself inconsistent: `QED_RSI_S03_Scorpius`'s displayName is
   * "Tidelock QD", not "...QED", despite its QED_-prefixed entityClass —
   * exactly the "do not infer from display names" trap this mission's own
   * governing rule warns against). Exactly 4 real entities carry this
   * category catalog-wide (Captor QD, Burke QD, Tidelock QD, Reynie QED)
   * — small, clean, entirely real dampening/interdiction hardware, no
   * unrelated members, justifying a whole-category rule. A QED device is
   * fictionally a combined dampener+interdiction unit — the Mantis's own
   * single confirmed port therefore satisfies both "Dampener visible" and
   * "Snare visible" Commander-acceptance checks; no second, fabricated
   * port was added to represent a "Snare" the raw data does not carry as
   * a separate item-port relationship. Maps to the new `QuantumDampener`
   * canonical port type (`ElectronicWarfare` equipment group). */
  { category: 'QuantumInterdictionGenerator', subtype: null, canonicalPortType: 'QuantumDampener' },
]

/**
 * The Mount_Gimbal_S3 decision (Mission M-009, Option A).
 *
 * DataCore categorizes every gimbal weapon mount as `Turret`/`GunTurret` —
 * identical to how it would categorize a genuinely crewed/remote turret.
 * Blindly mapping `Turret` -> SFM's existing `Turret` canonical port type
 * would route every Gladius weapon mount into the "Defense" equipment
 * group instead of "Weapons", which is wrong for a fixed gimbal mount a
 * pilot aims directly.
 *
 * Nothing in the catalog schema (Mission M-007) distinguishes "fixed
 * gimbal" from "crewed turret" directly — there is no `HasSeat` or
 * `IsRemote` field to read. The one verified, structural fact that *is*
 * available without parsing any name is the adapted loadout tree's own
 * parent-child relationship: every `Turret`-categorized mount in the real
 * Gladius fixture has a direct child whose own DataCore category is
 * `WeaponGun` (the actual gun). That child category comes from the exact
 * same `ComponentMetadataResolver` exact lookup used everywhere else in
 * this pipeline — not from reading `Mount_Gimbal_S3`'s name, and not from
 * `hardpoint_gun_nose`'s name either.
 *
 * When that structural fact holds, this mount is translated to the
 * existing `WeaponTurret` canonical port type (already mapped to
 * "Weapons" in `portClassifier.ts`) rather than the existing `Turret`
 * type (mapped to "Defense") — a choice between two pre-existing
 * spellings, not an invented one. `WeaponTurret`/`GimbalMount` both
 * already map to the same "Weapons" group, so this choice does not
 * change *inclusion*, only which canonical name is recorded; `WeaponTurret`
 * was chosen as the more literal translation of DataCore's own words
 * ("Turret"/"GunTurret"), since nothing in the available data can
 * actually distinguish "fixed gimbal" from "rotating turret" — asserting
 * "gimbal" would itself be an unverified guess, which this mission
 * explicitly forbids.
 *
 * A `Turret`-categorized node with NO verified `WeaponGun` child (an
 * autonomous/point-defense-style turret with nothing to disambiguate it)
 * keeps the existing `Turret` -> "Defense" translation — the pre-existing,
 * conservative behavior, unchanged.
 */
function translateTurret(metadata: ComponentMetadata, context: ClassificationContext | undefined): ClassificationTranslation {
  const hasWeaponChild = (context?.childCategories ?? []).includes('WeaponGun')
  const sourceSubtype = metadata.subtype ?? undefined

  if (hasWeaponChild) {
    return {
      status: 'translated',
      sourceCategory: 'Turret',
      sourceSubtype,
      canonicalPortType: 'WeaponTurret',
      reason:
        'DataCore category "Turret" with a verified WeaponGun child (a structural fact from the resolved loadout tree, not from any name) is a weapon mount — mapped to the existing "WeaponTurret" canonical port type (Weapons group), not "Turret" (Defense group).',
    }
  }

  return {
    status: 'translated',
    sourceCategory: 'Turret',
    sourceSubtype,
    canonicalPortType: 'Turret',
    reason: 'DataCore category "Turret" with no verified WeaponGun child — left as the existing "Turret" canonical port type (Defense group).',
  }
}

/**
 * Translates one resolved `ComponentMetadata` record into a canonical
 * port type `classifyPort()` already understands, or an explicit
 * `excluded`/`unresolved` result. Never guesses: an unrecognized
 * (category, subtype) pair is `unresolved`, not defaulted to anything.
 *
 * `Armor` (DataCore category, confirmed via `ARMR_AEGS_Gladius` in the
 * real catalog) is deliberately absent from `TRANSLATION_RULES`: SFM has
 * no existing `EquipmentGroup`/canonical port type for armor today, and
 * inventing one is a product-scope decision (it would surface a new UI
 * section) beyond a translation mission — left `unresolved` with that
 * exact reason, for a future mission to pick up explicitly.
 */
/**
 * EWO-020: the real component-metadata catalog represents "this entity
 * carries no DataCore SubType" two different ways for the same semantic
 * value — a true `null` for most entries, but the literal string
 * `"UNDEFINED"` for a minority (confirmed directly: of 71 real
 * QuantumDrive/JumpDrive catalog entries inspected, all but 3 have
 * `subtype: null`; those 3 — including the Eclipse fixture's own Jump
 * Drive component and the Gladius fixture's own Quantum Drive — have the
 * literal string). A rule written against one representation silently
 * failed to match the other, excluding an otherwise-correctly-categorized
 * entity. Both are the same "no subtype" fact and must match identically.
 */
function normalizeSubtype(subtype: string | null | undefined): string | null {
  if (subtype === null || subtype === undefined || subtype === 'UNDEFINED') return null
  return subtype
}

export function translateClassification(metadata: ComponentMetadata, context?: ClassificationContext): ClassificationTranslation {
  const category = metadata.category
  const subtype = metadata.subtype ?? undefined

  if (!category) {
    return { status: 'unresolved', sourceSubtype: subtype, reason: 'No DataCore category available for this entity — nothing to translate.' }
  }

  if (EXCLUDED_CATEGORIES.has(category)) {
    return {
      status: 'excluded',
      sourceCategory: category,
      sourceSubtype: subtype,
      reason: `DataCore category "${category}" (subtype "${subtype ?? 'UNDEFINED'}") is an internal weapon subassembly, not player-configurable ship equipment.`,
    }
  }

  if (category === 'Turret') {
    return translateTurret(metadata, context)
  }

  const normalizedSubtype = normalizeSubtype(subtype)
  const matchingRule = TRANSLATION_RULES.find(
    (rule) =>
      rule.category === category &&
      (rule.subtype === null || normalizeSubtype(rule.subtype) === normalizedSubtype) &&
      // SW-013C.2B — an entity-scoped rule (Module/Misc) only matches its
      // own individually-verified allowlist; every other entity carrying
      // the same category/subtype falls through to `unresolved` exactly
      // as before this rule existed.
      (!rule.entityClassAllowlist || rule.entityClassAllowlist.has(metadata.entityClass))
  )

  if (!matchingRule) {
    // SW-013C.2B — an entity-scoped rule for this exact (category, subtype)
    // exists but didn't match because this specific entityClass isn't on
    // its confirmed allowlist — a more precise reason than "no rule at all."
    const allowlistedButUnverified = TRANSLATION_RULES.some(
      (rule) => rule.category === category && (rule.subtype === null || normalizeSubtype(rule.subtype) === normalizedSubtype) && rule.entityClassAllowlist
    )
    const categoryKnown = TRANSLATION_RULES.some((rule) => rule.category === category)
    const reason = allowlistedButUnverified
      ? `DataCore category "${category}" is recognized, but "${metadata.entityClass}" is not among the individually-verified entity classes for it — left unclassified rather than broadly guessed (see docs/ModuleTaxonomyProposal.md).`
      : categoryKnown
        ? `DataCore category "${category}" is recognized, but subtype "${subtype ?? 'UNDEFINED'}" has no translation rule — left unclassified rather than guessed.`
        : `No translation rule for DataCore category "${category}" — left unclassified rather than guessed.`
    return { status: 'unresolved', sourceCategory: category, sourceSubtype: subtype, reason }
  }

  return {
    status: 'translated',
    sourceCategory: category,
    sourceSubtype: subtype,
    canonicalPortType: matchingRule.canonicalPortType,
    reason: `DataCore category "${category}"${matchingRule.subtype ? ` / subtype "${matchingRule.subtype}"` : ''} maps to the existing "${matchingRule.canonicalPortType}" canonical port type.`,
  }
}
