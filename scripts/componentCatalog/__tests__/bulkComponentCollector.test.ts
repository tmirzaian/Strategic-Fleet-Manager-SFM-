import { describe, it, expect } from 'vitest'
import { collectBulkComponents, type ComponentFieldMaps } from '../bulkComponentCollector'

function fields(overrides: Partial<ComponentFieldMaps> = {}): ComponentFieldMaps {
  return {
    type: new Map(),
    subType: new Map(),
    size: new Map(),
    grade: new Map(),
    manufacturerCode: new Map(),
    manufacturerLocKey: new Map(),
    localizationName: new Map(),
    ...overrides,
  }
}

describe('Mission M-012: collectBulkComponents', () => {
  it('2. produces complete component records from bulk field-query maps', () => {
    const result = collectBulkComponents(
      fields({
        type: new Map([['SHLD_ASAS_S01_Mirage_SCItem', 'Shield']]),
        subType: new Map([['SHLD_ASAS_S01_Mirage_SCItem', 'UNDEFINED']]),
        size: new Map([['SHLD_ASAS_S01_Mirage_SCItem', '1']]),
        grade: new Map([['SHLD_ASAS_S01_Mirage_SCItem', '1']]),
        manufacturerCode: new Map([['SHLD_ASAS_S01_Mirage_SCItem', 'ASAS']]),
        localizationName: new Map([['SHLD_ASAS_S01_Mirage_SCItem', '@item_NameSHLD_ASAS_S01_Mirage']]),
      }),
      new Map([['item_NameSHLD_ASAS_S01_Mirage', 'Mirage']])
    )
    const record = result.records.get('SHLD_ASAS_S01_Mirage_SCItem')
    expect(record).toBeDefined()
    expect(record!.category).toBe('Shield')
    expect(record!.size).toBe(1)
    expect(record!.grade).toBe(1)
    expect(record!.manufacturerRef).toBe('ASAS')
    expect(record!.displayName).toBe('Mirage')
    // "UNDEFINED" is DataCore's own placeholder for "no subtype" — never surfaced as a real value.
    expect(record!.subtype).toBeNull()
  })

  it('3. keys every record by the exact stable DataCore entity class', () => {
    const result = collectBulkComponents(fields({ type: new Map([['AEGS_Gladius_CML_Flare', 'WeaponDefensive']]) }), new Map())
    expect(Array.from(result.records.keys())).toEqual(['AEGS_Gladius_CML_Flare'])
    expect(result.records.get('AEGS_Gladius_CML_Flare')!.recordName).toBe('EntityClassDefinition.AEGS_Gladius_CML_Flare')
  })

  it('4. iterates and assembles records in deterministic sorted order', () => {
    const unordered = new Map([
      ['ZZZ_Weapon', 'WeaponGun'],
      ['AAA_Weapon', 'WeaponGun'],
    ])
    const result = collectBulkComponents(fields({ type: unordered }), new Map())
    expect(Array.from(result.records.keys())).toEqual(['AAA_Weapon', 'ZZZ_Weapon'])
  })

  it('5. never produces duplicate keys — one entity class maps to exactly one record', () => {
    const result = collectBulkComponents(fields({ type: new Map([['Mount_Gimbal_S5', 'WeaponMount']]) }), new Map())
    expect(result.records.size).toBe(1)
  })

  it('8. excludes internal-only component types not in the player-usable allowlist', () => {
    const result = collectBulkComponents(
      fields({
        type: new Map([
          ['some_seat', 'Seat'],
          ['some_door', 'Door'],
          ['some_thruster', 'MainThruster'],
          ['some_personal_weapon', 'WeaponPersonal'],
          ['some_dashboard', 'SeatDashboard'],
          ['some_atc', 'AirTrafficController'],
        ]),
      }),
      new Map()
    )
    expect(result.records.size).toBe(0)
  })

  it('9. includes every explicitly requested player-usable category', () => {
    const types = [
      'WeaponGun',
      'Shield',
      'Cooler',
      'PowerPlant',
      'QuantumDrive',
      'JumpDrive',
      'MissileLauncher',
      'Missile',
      'Radar',
      'LifeSupportGenerator',
      'Relay',
      'TractorBeam',
      'SalvageHead',
      'Bomb',
      'BombLauncher',
      'WeaponMount',
      'WeaponMining',
    ]
    const typeMap = new Map(types.map((t, i) => [`entity_${i}`, t]))
    const result = collectBulkComponents(fields({ type: typeMap }), new Map())
    expect(result.records.size).toBe(types.length)
  })
})
