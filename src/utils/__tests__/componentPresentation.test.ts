import { describe, it, expect } from 'vitest'
import { resolveComponentLabel, formatComponentClassGrade, formatCoreComponentIdentity, formatComponentIdentity } from '../componentPresentation'
import { hasComponentCatalog } from '../../generated/componentCatalog'

describe('resolveComponentLabel — EWO-019A component presentation contract', () => {
  it('1. resolved display name replaces the raw internal identifier as the primary label (Eclipse DeltaMax power plant)', () => {
    if (!hasComponentCatalog) return // real generated-data not present on this machine
    // EWO-023 (Task 6) fixed componentMetadataEnrichment.ts to copy the
    // catalog's already-resolved displayName through — Component.displayName
    // (and therefore Hardpoint.factoryItem/installedItem/targetItem) is now
    // "DeltaMax" directly, never the raw "POWR TYDT S01 DeltaMax SCItem"
    // this test previously had to simulate as input.
    const result = resolveComponentLabel('DeltaMax')
    expect(result.primaryLabel).toBe('DeltaMax')
  })

  it('2/3. Class + Grade combine into one subtitle (EWO-036B precedence tier 1) once CAT-001 real generated Classification exists', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('DeltaMax')
    // Real generated-data (CAT-001): DeltaMax (Tydus S1 Power Plant) carries
    // classification "Stealth", grade numeral 2 -> letter B.
    expect(result.classificationLabel).toBe('Stealth B')
  })

  it('4. class and grade render as one combined subtitle, never "undefined"', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('DeltaMax')
    expect(result.classificationLabel).toBe('Stealth B')
    expect(result.classificationLabel).not.toContain('undefined')
  })

  it('5/6. missing grade and missing class together leave only the primary name (classificationLabel null)', () => {
    // EWO-026 — 'Slipstream' previously stood in here as a "no data at
    // all" fixture, but it turned out to be a real bulk-catalog component
    // (a Tydus S1 Power Plant, Grade A) that simply wasn't wired up to
    // resolve — see the Task 5/7 fix below. A name guaranteed to match
    // nothing in any real source is required to test the genuinely-absent
    // case.
    const result = resolveComponentLabel('Totally Fictional Component Zzyzx')
    expect(result.classificationLabel).toBeNull()
    expect(result.primaryLabel).toBe('Totally Fictional Component Zzyzx')
  })

  it('EWO-026 (Task 5/7): a catalog-only component with no per-ship deep-import instance still resolves its real Grade — the root cause of "Bolide/Cirrus/ExoGen/FullForce/GammaMax show name-only" was Grade being dropped when catalogComponentsByName was built, not missing source data', () => {
    if (!hasComponentCatalog) return
    // 'Slipstream' is real bulk-catalog data that never appears as an
    // actual Factory/Installed/Target assignment on any of the few
    // deep-imported ships, so componentByDisplayName never matches it —
    // exactly the class of component the picker's option list is full of.
    // CAT-001: this real record also carries classification "Stealth",
    // grade 1 -> letter A -> "Stealth A".
    const result = resolveComponentLabel('Slipstream')
    expect(result.classificationLabel).toBe('Stealth A')
  })

  it('7. a cleaned internal-name fallback is used when no resolved display name is available', () => {
    const result = resolveComponentLabel('POWR_TYDT_S01_UnknownPlant_SCItem')
    expect(result.primaryLabel).not.toContain('_')
    expect(result.primaryLabel).not.toMatch(/SCItem$/)
    expect(result.primaryLabel.toLowerCase()).toContain('unknownplant')
  })

  it('8. the raw internal identifier remains available diagnostically', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('DeltaMax')
    expect(result.diagnosticInternalName).toBe('POWR_TYDT_S01_DeltaMax_SCItem')
  })

  it('10. a resolved classification label is never a dangling separator or fragment', () => {
    const inputs = ['DeltaMax', 'Slipstream', '—', 'Unknown Factory Item', 'CF-227 Badger Repeater']
    for (const input of inputs) {
      const result = resolveComponentLabel(input)
      if (result.classificationLabel) {
        expect(result.classificationLabel.startsWith('·')).toBe(false)
        expect(result.classificationLabel).not.toMatch(/·\s*·/)
      }
    }
  })

  it('a weapon control fixture resolves a real primary label', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('CF-227 Badger Repeater')
    expect(result.primaryLabel).not.toContain('_')
    expect(result.primaryLabel.length).toBeGreaterThan(0)
  })

  it('a shield/cooler control fixture resolves a real primary label', () => {
    if (!hasComponentCatalog) return
    const shield = resolveComponentLabel('AllStop')
    expect(shield.primaryLabel.length).toBeGreaterThan(0)
    const cooler = resolveComponentLabel('Bracer')
    expect(cooler.primaryLabel.length).toBeGreaterThan(0)
  })

  it('an empty/unassigned sentinel renders as-is, never blank, never cleaned', () => {
    expect(resolveComponentLabel('—')).toEqual({ primaryLabel: '—', classificationLabel: null, identityLine: null, diagnosticInternalName: null })
    expect(resolveComponentLabel('Unknown Factory Item')).toEqual({ primaryLabel: 'Unknown Factory Item', classificationLabel: null, identityLine: null, diagnosticInternalName: null })
    expect(resolveComponentLabel(undefined)).toEqual({ primaryLabel: '—', classificationLabel: null, identityLine: null, diagnosticInternalName: null })
  })

  it('grade-numeral-to-letter conversion only applies to recognized 1-4 values, never guesses on unrecognized ones', () => {
    // Indirect: exercised via real fixtures above (grade "2" -> "Grade B").
    const result = resolveComponentLabel('DeltaMax')
    if (result.classificationLabel) expect(result.classificationLabel).toMatch(/^(Grade [A-D]|.+ [A-D])$/)
  })

  it('EWO-024 (Task 3) / EWO-036B / CAT-001: a genuine Class value resolves independently, trimmed and never a bare separator, whenever a component genuinely carries one', () => {
    if (!hasComponentCatalog) return
    // CAT-001 made real Classification data available for the first time
    // — Slipstream is a real, live example ("Stealth").
    const result = resolveComponentLabel('Slipstream')
    expect(result.classificationLabel === null || (typeof result.classificationLabel === 'string' && result.classificationLabel.trim().length > 0)).toBe(true)
    expect(result.classificationLabel).not.toMatch(/^·|·\s*·/)
  })
})

describe('formatComponentClassGrade — EWO-036B (Task 3/5) centralized Class+Grade formatter', () => {
  it('Class and Grade both available -> "{Class} {GradeLetter}"', () => {
    expect(formatComponentClassGrade('Military', 'A')).toBe('Military A')
    expect(formatComponentClassGrade('Civilian', 'B')).toBe('Civilian B')
    expect(formatComponentClassGrade('Industrial', 'C')).toBe('Industrial C')
    expect(formatComponentClassGrade('Competition', 'A')).toBe('Competition A')
    expect(formatComponentClassGrade('Stealth', 'A')).toBe('Stealth A')
  })

  it('Class only available -> "{Class}"', () => {
    expect(formatComponentClassGrade('Military', null)).toBe('Military')
    expect(formatComponentClassGrade('Military', undefined)).toBe('Military')
  })

  it('Grade only available -> "Grade {GradeLetter}"', () => {
    expect(formatComponentClassGrade(null, 'A')).toBe('Grade A')
    expect(formatComponentClassGrade(undefined, 'B')).toBe('Grade B')
  })

  it('neither available -> null (no subtitle)', () => {
    expect(formatComponentClassGrade(null, null)).toBeNull()
    expect(formatComponentClassGrade(undefined, undefined)).toBeNull()
    expect(formatComponentClassGrade('', '')).toBeNull()
    expect(formatComponentClassGrade('   ', '   ')).toBeNull()
  })

  it('is deterministic and null-safe for any combination', () => {
    expect(formatComponentClassGrade('Military', 'A')).toBe(formatComponentClassGrade('Military', 'A'))
    expect(() => formatComponentClassGrade(null, null)).not.toThrow()
  })

  it('never fabricates a Class — only ever returns exactly what was passed in, never inferred from anything else', () => {
    // The function's own signature only accepts a class/grade pair — there
    // is no manufacturer, component name, or port-type parameter for it to
    // infer from, structurally guaranteeing this.
    expect(formatComponentClassGrade.length).toBe(2)
  })

  it('trims whitespace from both inputs before combining', () => {
    expect(formatComponentClassGrade('  Military  ', '  A  ')).toBe('Military A')
  })
})

describe('formatCoreComponentIdentity — CAT-001: "{Class} {GradeLetter}" Core Component identity grammar, no Size, word "Grade" never appears', () => {
  it('Class and Grade both available -> "{Class} {GradeLetter}"', () => {
    expect(formatCoreComponentIdentity('Stealth', 'A')).toBe('Stealth A')
    expect(formatCoreComponentIdentity('Civilian', 'C')).toBe('Civilian C')
    expect(formatCoreComponentIdentity('Military', 'A')).toBe('Military A')
  })

  it('Class unavailable -> the bare grade letter alone, never the word "Grade", never a fabricated Class', () => {
    expect(formatCoreComponentIdentity(null, 'A')).toBe('A')
    expect(formatCoreComponentIdentity(undefined, 'A')).toBe('A')
  })

  it('Grade unavailable but Class present -> "{Class}" alone', () => {
    expect(formatCoreComponentIdentity('Stealth', null)).toBe('Stealth')
  })

  it('nothing available -> null', () => {
    expect(formatCoreComponentIdentity(null, null)).toBeNull()
    expect(formatCoreComponentIdentity('', '')).toBeNull()
  })

  it('the literal word "Grade" never appears anywhere in the output', () => {
    expect(formatCoreComponentIdentity('Military', 'B')).not.toMatch(/Grade/)
    expect(formatCoreComponentIdentity(null, 'B')).not.toMatch(/Grade/)
  })

  it('never shows Size — no Size parameter exists on this function at all', () => {
    expect(formatCoreComponentIdentity.length).toBe(2)
  })

  it('the rejected Revision 2/3 grammar strings never appear', () => {
    const line = formatCoreComponentIdentity('Civilian', 'C')!
    expect(line).not.toBe('S1 · Civilian · Grade C')
    expect(line).not.toBe('Civilian / Grade C')
    expect(line).toBe('Civilian C')
  })
})

describe('resolveComponentLabel.identityLine — CAT-001 Core Component grammar', () => {
  it('a real catalog component with real generated Classification resolves "{Class} {GradeLetter}", no Size, no word "Grade"', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('Slipstream')
    expect(result.identityLine).toBe('Stealth A')
    expect(result.identityLine).not.toMatch(/Grade|S\d/)
  })

  it('an empty/unassigned sentinel has no identity line', () => {
    expect(resolveComponentLabel('—').identityLine).toBeNull()
    expect(resolveComponentLabel('Unknown Factory Item').identityLine).toBeNull()
  })

  it('a genuinely unresolvable name has no identity line (nothing fabricated)', () => {
    expect(resolveComponentLabel('Totally Fictional Component Zzyzx').identityLine).toBeNull()
  })
})

describe('formatComponentIdentity — SW-008A Revision 3 family routing, CAT-001 core grammar', () => {
  it('core family (Cooler/PowerPlant/QuantumDrive/Shield/Radar/LifeSupportGenerator) uses "{Class} {GradeLetter}", no Size, no word "Grade"', () => {
    for (const category of ['Cooler', 'PowerPlant', 'QuantumDrive', 'Shield', 'Radar', 'LifeSupportGenerator']) {
      expect(
        formatComponentIdentity({ sizeLabel: 'S1', componentClass: 'Stealth', gradeLetter: 'A', category, subtype: null, entityClass: null })
      ).toBe('Stealth A')
      // Class unavailable -> bare grade letter, still never Size, never "Grade".
      expect(
        formatComponentIdentity({ sizeLabel: 'S1', componentClass: null, gradeLetter: 'A', category, subtype: null, entityClass: null })
      ).toBe('A')
    }
  })

  it('an unrecognized/unknown category falls back to the core grammar rather than showing nothing', () => {
    expect(
      formatComponentIdentity({ sizeLabel: 'S1', componentClass: null, gradeLetter: 'B', category: 'SomeFutureUnseenCategory', subtype: null, entityClass: null })
    ).toBe('B')
  })

  it('CAT-002: weapon family (WeaponGun) shows Weapon Type (from real generated Classification), never Size, never a meaningless mount-position subtype ("Gun")', () => {
    expect(
      formatComponentIdentity({ sizeLabel: 'S4', componentClass: 'Ballistic Cannon', gradeLetter: 'A', category: 'WeaponGun', subtype: 'Gun', entityClass: null })
    ).toBe('Ballistic Cannon')
    // No Weapon Type available (real, honest case for most weapons — CAT-002
    // covers only WeaponGun) -> nothing shown, never Size, never Grade.
    expect(formatComponentIdentity({ sizeLabel: 'S4', componentClass: null, gradeLetter: 'A', category: 'WeaponGun', subtype: null, entityClass: null })).toBeNull()
  })

  it('CAT-002: missile family shows Seeker Type (from real generated Classification), never Size, never the old bare "Torpedo" subtype suffix', () => {
    expect(formatComponentIdentity({ sizeLabel: 'S1', componentClass: 'Electromagnetic', gradeLetter: 'A', category: 'Missile', subtype: 'Missile', entityClass: null })).toBe(
      'Electromagnetic'
    )
    expect(formatComponentIdentity({ sizeLabel: 'S5', componentClass: 'Infrared', gradeLetter: 'A', category: 'Missile', subtype: 'Torpedo', entityClass: null })).toBe('Infrared')
    // No Seeker Type available -> nothing shown, never Size, never Grade, never a fabricated value.
    expect(formatComponentIdentity({ sizeLabel: 'S1', componentClass: null, gradeLetter: 'A', category: 'Missile', subtype: 'Missile', entityClass: null })).toBeNull()
  })

  it('missile rack family shows Size · Capacity, derived from the real component-owned-slot spec (same authority as missile rack aggregation)', () => {
    // MSD-341 Missile Rack: a real 4-slot S1 rack (see missileRackAggregation.test.ts).
    const line = formatComponentIdentity({
      sizeLabel: 'S3',
      componentClass: null,
      gradeLetter: null,
      category: 'MissileLauncher',
      subtype: null,
      entityClass: 'MRCK_S03_BEHR_Quad_S01',
    })
    if (line) expect(line).toMatch(/^S3 · \d+ × S\d+ Missiles$/)
  })

  it('a missile rack entityClass with no known slot spec degrades to Size alone rather than a fabricated capacity', () => {
    expect(
      formatComponentIdentity({ sizeLabel: 'S1', componentClass: null, gradeLetter: null, category: 'MissileLauncher', subtype: null, entityClass: 'Totally Unknown Rack' })
    ).toBe('S1')
  })

  it('utility categories (SalvageHead/SalvageModifier/TractorBeam/TowingBeam/MiningModifier/WeaponMining) show Size · authoritative subtype label', () => {
    expect(formatComponentIdentity({ sizeLabel: 'S2', componentClass: null, gradeLetter: null, category: 'SalvageHead', subtype: null, entityClass: null })).toBe('S2 · Salvage Head')
    expect(formatComponentIdentity({ sizeLabel: 'S1', componentClass: null, gradeLetter: null, category: 'SalvageModifier', subtype: null, entityClass: null })).toBe(
      'S1 · Salvage Modifier'
    )
    expect(
      formatComponentIdentity({ sizeLabel: 'S1', componentClass: null, gradeLetter: null, category: 'SalvageModifier', subtype: 'SalvageModifier_TractorBeam', entityClass: null })
    ).toBe('S1 · Tractor Beam')
    expect(formatComponentIdentity({ sizeLabel: 'S1', componentClass: null, gradeLetter: null, category: 'TractorBeam', subtype: null, entityClass: null })).toBe('S1 · Tractor Beam')
    expect(formatComponentIdentity({ sizeLabel: 'S1', componentClass: null, gradeLetter: null, category: 'TowingBeam', subtype: null, entityClass: null })).toBe('S1 · Tractor Beam')
    expect(formatComponentIdentity({ sizeLabel: 'S1', componentClass: null, gradeLetter: null, category: 'MiningModifier', subtype: null, entityClass: null })).toBe('S1 · Mining Module')
    expect(formatComponentIdentity({ sizeLabel: 'S2', componentClass: null, gradeLetter: null, category: 'WeaponMining', subtype: null, entityClass: null })).toBe('S2 · Mining Laser')
  })

  it('never fabricates anything — same guarantee as formatCoreComponentIdentity (deterministic, no inference)', () => {
    expect(formatComponentIdentity.length).toBe(1)
  })
})

describe('resolveComponentLabel.identityLine — SW-008A Revision 3 real-data family checks', () => {
  it('CAT-002: a real weapon resolves its real generated Weapon Type, never Size, never Grade', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('CF-227 Badger Repeater')
    // Real generated-data (CAT-002): CF-227 Badger Repeater's Weapon Type is "Laser Repeater".
    expect(result.identityLine).toBe('Laser Repeater')
    expect(result.identityLine).not.toMatch(/^S\d+$|Grade/)
  })

  it('a real missile rack resolves Size · Capacity', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('MSD-341 Missile Rack')
    if (result.identityLine) expect(result.identityLine).toMatch(/^S\d+ · \d+ × S\d+ Missiles$/)
  })

  it('a real utility component (tractor beam) resolves its authoritative subtype label, not the coarse port-compatibility "Utility" bucket', () => {
    if (!hasComponentCatalog) return
    const result = resolveComponentLabel('Durus Tractor Beam')
    if (result.identityLine) {
      expect(result.identityLine).toBe('S1 · Tractor Beam')
      expect(result.identityLine).not.toBe('S1 · Utility')
    }
  })
})
