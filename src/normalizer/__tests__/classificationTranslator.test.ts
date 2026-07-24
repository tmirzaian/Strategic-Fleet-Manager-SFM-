import { describe, it, expect } from 'vitest'
import { translateClassification } from '../classificationTranslator'
import type { ComponentMetadata } from '../componentMetadataResolver'

function metadata(overrides: Partial<ComponentMetadata>): ComponentMetadata {
  return {
    entityClass: 'X',
    recordName: 'EntityClassDefinition.X',
    recordId: 'guid',
    category: null,
    subtype: null,
    size: null,
    grade: null,
    manufacturerRef: null,
    localizationKey: null,
    displayName: null,
    ...overrides,
  }
}

describe('translateClassification — every initial exact category/subtype mapping', () => {
  const cases: Array<[string, string | null, string]> = [
    ['WeaponGun', 'Gun', 'WeaponGun'],
    ['Shield', 'UNDEFINED', 'Shield'],
    ['Cooler', 'UNDEFINED', 'Cooler'],
    ['PowerPlant', 'Power', 'PowerPlant'],
    ['QuantumDrive', 'UNDEFINED', 'QuantumDrive'],
    ['JumpDrive', 'UNDEFINED', 'JumpDrive'],
    ['MissileLauncher', 'MissileRack', 'MissileRack'],
    ['Missile', 'Missile', 'Missile'],
    ['Radar', 'MidRangeRadar', 'Radar'],
    ['LifeSupportGenerator', 'UNDEFINED', 'LifeSupport'],
    ['Relay', 'UNDEFINED', 'Relay'],
  ]

  it.each(cases)('%s / %s -> %s', (category, subtype, expectedPortType) => {
    const result = translateClassification(metadata({ category, subtype }))
    expect(result.status).toBe('translated')
    if (result.status === 'translated') {
      expect(result.canonicalPortType).toBe(expectedPortType)
      expect(result.sourceCategory).toBe(category)
    }
  })

  it('Computer -> Avionics (rule exists, currently dormant on real fixture data)', () => {
    const result = translateClassification(metadata({ category: 'Computer', subtype: 'UNDEFINED' }))
    expect(result.status).toBe('translated')
    if (result.status === 'translated') expect(result.canonicalPortType).toBe('Avionics')
  })
})

describe('SW-013C.2B (Module Taxonomy Activation, Objective 1): Module classification is entity-scoped, never blanket-category', () => {
  it('a confirmed Module-family entity class (Hornet Center Cap Mk II) translates to canonical port type "Module"', () => {
    const result = translateClassification(metadata({ entityClass: 'UMNT_ANVL_S5_Cap_Mk2', category: 'Module', subtype: null }))
    expect(result.status).toBe('translated')
    if (result.status === 'translated') expect(result.canonicalPortType).toBe('Module')
  })

  it('every confirmed Module-family entity class translates — Hornet Cap/Rotodome (both generations) and Retaliator Front/Rear Base', () => {
    const confirmed = [
      'UMNT_ANVL_S5_Cap',
      'UMNT_ANVL_S5_Cap_Mk2',
      'UMNT_ANVL_S5_Rotodome',
      'UMNT_ANVL_S5_Rotodome_Mk2',
      'AEGS_Retaliator_Module_Front_Base',
      'AEGS_Retaliator_Module_Rear_Base',
    ]
    for (const entityClass of confirmed) {
      const result = translateClassification(metadata({ entityClass, category: 'Module', subtype: null }))
      expect(result.status, `${entityClass} should translate`).toBe('translated')
      if (result.status === 'translated') expect(result.canonicalPortType).toBe('Module')
    }
  })

  it('an UNVERIFIED Module-category entity class stays unresolved — never a blanket category match (Objective 1: "translate only authoritative module positions")', () => {
    const unverified = [
      'RSI_Apollo_Module_Left_Tier_2', // real Module-category entity, not part of this mission's evidence
      'GLSN_Basher_Addon_Mohawk_Default', // ground-vehicle cosmetic bodykit, same DataCore category, wrong domain entirely
      'ANVL_Hornet_F7C_Cargo_Mod', // real Module-category entity, unverified swap-group behavior
    ]
    for (const entityClass of unverified) {
      const result = translateClassification(metadata({ entityClass, category: 'Module', subtype: null }))
      expect(result.status, `${entityClass} should remain unresolved`).toBe('unresolved')
    }
  })

  it('a confirmed nose-cap entity class (DataCore category "Misc") also translates to canonical port type "Module"', () => {
    for (const entityClass of ['ANVL_F7_Mk2_NoseCap', 'ANVL_F7CR_Mk2_NoseCap']) {
      const result = translateClassification(metadata({ entityClass, category: 'Misc', subtype: null }))
      expect(result.status, `${entityClass} should translate`).toBe('translated')
      if (result.status === 'translated') expect(result.canonicalPortType).toBe('Module')
    }
  })

  it('an UNVERIFIED Misc-category entity class stays unresolved — never a blanket Misc translation (Objective 1: "do not broadly classify every Misc object as a Module")', () => {
    const result = translateClassification(metadata({ entityClass: 'SOME_OTHER_MISC_ENTITY', category: 'Misc', subtype: null }))
    expect(result.status).toBe('unresolved')
  })

  it('preserves conservative behavior for a genuinely unknown category — unaffected by the Module/Misc additions', () => {
    const result = translateClassification(metadata({ entityClass: 'X', category: 'SomeFutureCIGCategory', subtype: null }))
    expect(result.status).toBe('unresolved')
  })
})

describe('translateClassification — exact matching only', () => {
  it('does not match a subtype case-insensitively or via substring', () => {
    expect(translateClassification(metadata({ category: 'WeaponGun', subtype: 'gun' })).status).toBe('unresolved')
    expect(translateClassification(metadata({ category: 'WeaponGun', subtype: 'GunTurret' })).status).toBe('unresolved')
  })

  it('does not match a category case-insensitively', () => {
    expect(translateClassification(metadata({ category: 'weapongun', subtype: 'Gun' })).status).toBe('unresolved')
  })
})

describe('translateClassification — unknown category', () => {
  it('returns unresolved with a clear reason for a category with no rule at all', () => {
    const result = translateClassification(metadata({ category: 'SomeFutureCIGCategory', subtype: 'Whatever' }))
    expect(result.status).toBe('unresolved')
    if (result.status === 'unresolved') {
      expect(result.reason).toContain('No translation rule')
      expect(result.sourceCategory).toBe('SomeFutureCIGCategory')
    }
  })

  it('returns unresolved when metadata.category is null', () => {
    const result = translateClassification(metadata({ category: null }))
    expect(result.status).toBe('unresolved')
  })

  it('Armor is deliberately left unresolved (no existing SFM destination)', () => {
    const result = translateClassification(metadata({ category: 'Armor', subtype: 'Medium' }))
    expect(result.status).toBe('unresolved')
    if (result.status === 'unresolved') {
      expect(result.reason).toContain('No translation rule')
    }
  })
})

describe('translateClassification — known category with unsupported subtype', () => {
  it('returns unresolved (not translated) when the category is known but the subtype does not match any rule', () => {
    const result = translateClassification(metadata({ category: 'Shield', subtype: 'SomeNewShieldSubtype' }))
    expect(result.status).toBe('unresolved')
    if (result.status === 'unresolved') {
      expect(result.reason).toContain('is recognized, but subtype')
    }
  })
})

describe('translateClassification — WeaponAttachment exclusion', () => {
  it('excludes WeaponAttachment/Barrel', () => {
    const result = translateClassification(metadata({ category: 'WeaponAttachment', subtype: 'Barrel' }))
    expect(result.status).toBe('excluded')
    if (result.status === 'excluded') expect(result.sourceSubtype).toBe('Barrel')
  })

  it('excludes WeaponAttachment/FiringMechanism', () => {
    const result = translateClassification(metadata({ category: 'WeaponAttachment', subtype: 'FiringMechanism' }))
    expect(result.status).toBe('excluded')
  })

  it('excludes other WeaponAttachment subtypes without enumerating each one (PowerArray, Ventilation)', () => {
    expect(translateClassification(metadata({ category: 'WeaponAttachment', subtype: 'PowerArray' })).status).toBe('excluded')
    expect(translateClassification(metadata({ category: 'WeaponAttachment', subtype: 'Ventilation' })).status).toBe('excluded')
  })
})

describe('translateClassification — nested equipment remains classifiable', () => {
  it('a JumpDrive child is translated, not excluded or unresolved, purely from its own category', () => {
    const result = translateClassification(metadata({ category: 'JumpDrive', subtype: 'UNDEFINED' }))
    expect(result.status).toBe('translated')
  })

  it('a Missile child is translated', () => {
    expect(translateClassification(metadata({ category: 'Missile', subtype: 'Missile' })).status).toBe('translated')
  })

  it('a MissileLauncher child is translated', () => {
    expect(translateClassification(metadata({ category: 'MissileLauncher', subtype: 'MissileRack' })).status).toBe('translated')
  })
})

describe('translateClassification — Mount_Gimbal_S3 decision (Turret/GunTurret)', () => {
  it('translates to WeaponTurret when a verified WeaponGun child is present', () => {
    const result = translateClassification(metadata({ category: 'Turret', subtype: 'GunTurret' }), { childCategories: ['WeaponGun'] })
    expect(result.status).toBe('translated')
    if (result.status === 'translated') {
      expect(result.canonicalPortType).toBe('WeaponTurret')
      expect(result.reason).toContain('WeaponGun child')
    }
  })

  it('falls back to the existing Turret (Defense) type when no WeaponGun child is present', () => {
    const result = translateClassification(metadata({ category: 'Turret', subtype: 'GunTurret' }), { childCategories: ['Seat'] })
    expect(result.status).toBe('translated')
    if (result.status === 'translated') expect(result.canonicalPortType).toBe('Turret')
  })

  it('falls back to Turret when no context is supplied at all', () => {
    const result = translateClassification(metadata({ category: 'Turret', subtype: 'GunTurret' }))
    expect(result.status).toBe('translated')
    if (result.status === 'translated') expect(result.canonicalPortType).toBe('Turret')
  })

  it('the WeaponGun-child evidence is a real, catalog-derived category — not a name/string check', () => {
    // Deliberately using an entity class name that contains no hint of
    // "gun"/"weapon"/"mount" at all, to prove the decision is driven by
    // the structural childCategories fact, not by parsing any name.
    const result = translateClassification(metadata({ entityClass: 'XNAA_SanTokYai_Mount_Gimbal_S3', category: 'Turret', subtype: 'GunTurret' }), {
      childCategories: ['WeaponGun'],
    })
    expect(result.status).toBe('translated')
    if (result.status === 'translated') expect(result.canonicalPortType).toBe('WeaponTurret')
  })
})

describe('translateClassification — no classification based on entity-name patterns', () => {
  it('two different entity classes with identical category/subtype/context produce identical translations', () => {
    // translateClassification's result never even includes entityClass —
    // this test exists to make that (and thus name-independence) explicit.
    const a = translateClassification(metadata({ entityClass: 'Mount_Gimbal_S3', category: 'Turret', subtype: 'GunTurret' }), { childCategories: ['WeaponGun'] })
    const b = translateClassification(metadata({ entityClass: 'Totally_Unrelated_Name_123', category: 'Turret', subtype: 'GunTurret' }), {
      childCategories: ['WeaponGun'],
    })
    expect(a).toEqual(b)
  })

  it('a name containing "gun" does not get classified as WeaponGun without a matching category', () => {
    const result = translateClassification(metadata({ entityClass: 'hardpoint_gun_left_wing_helper', category: 'Misc', subtype: 'UNDEFINED' }))
    expect(result.status).toBe('unresolved')
  })
})
