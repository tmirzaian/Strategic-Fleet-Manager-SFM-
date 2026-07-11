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
}

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

  const matchingRule = TRANSLATION_RULES.find((rule) => rule.category === category && (rule.subtype === null || rule.subtype === subtype))

  if (!matchingRule) {
    const categoryKnown = TRANSLATION_RULES.some((rule) => rule.category === category)
    const reason = categoryKnown
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
