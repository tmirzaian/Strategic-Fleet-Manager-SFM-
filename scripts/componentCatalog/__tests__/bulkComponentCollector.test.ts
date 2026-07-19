import { describe, it, expect } from 'vitest'
import { collectBulkComponents, buildRecordFromBulkFields, type ComponentFieldMaps } from '../bulkComponentCollector'

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

describe('FTB-001F (Part C): buildRecordFromBulkFields — narrow-path (raw-data-fixture) entities recovered from shared bulk maps, no per-entity StarBreaker spawn', () => {
  // scripts/generateComponentCatalog.ts's narrow path used to resolve
  // these exact real entity classes (present in this repo's own
  // raw-data/*.json ship exports) via 5,642 individual `dcb query`
  // process spawns. It now looks them up against the SAME in-memory bulk
  // field maps Path 2 already fetches, via this exact function — these
  // tests prove that lookup mechanism directly, independent of whether a
  // full regeneration has been run.

  it('resolves a real, known raw-data-fixture entity class (AEGS_Gladius_CML_Flare, a WeaponDefensive from the Gladius raw-data export) directly from bulk field maps', () => {
    const record = buildRecordFromBulkFields(
      'AEGS_Gladius_CML_Flare',
      fields({
        type: new Map([['AEGS_Gladius_CML_Flare', 'WeaponDefensive']]),
        subType: new Map([['AEGS_Gladius_CML_Flare', 'UNDEFINED']]),
        size: new Map([['AEGS_Gladius_CML_Flare', '1']]),
        localizationName: new Map([['AEGS_Gladius_CML_Flare', '@item_NameAEGS_Gladius_CML_Flare']]),
      }),
      new Map([['item_NameAEGS_Gladius_CML_Flare', 'Gladius Flare Launcher']])
    )
    expect(record).not.toBeNull()
    expect(record!.category).toBe('WeaponDefensive')
    expect(record!.size).toBe(1)
    expect(record!.displayName).toBe('Gladius Flare Launcher')
    expect(record!.recordName).toBe('EntityClassDefinition.AEGS_Gladius_CML_Flare')
    // No per-entity dump means no recordId anymore — already optional
    // since schemaVersion 2 (M-012's bulk-discovered records never had one).
    expect(record!.recordId).toBeUndefined()
  })

  it('resolves a real raw-data-fixture entity OUTSIDE the player-usable allowlist (AEGS_Avenger_SCItem_Seat_Pilot, category "Seat") — the narrow path must not filter by isPlayerUsableComponentType the way collectBulkComponents does', () => {
    const record = buildRecordFromBulkFields(
      'AEGS_Avenger_SCItem_Seat_Pilot',
      fields({ type: new Map([['AEGS_Avenger_SCItem_Seat_Pilot', 'Seat']]) }),
      new Map()
    )
    expect(record).not.toBeNull()
    expect(record!.category).toBe('Seat')
    // Confirms this really is a DIFFERENT code path from collectBulkComponents:
    // the exact same fields, run through the allowlist-filtered walk, admit
    // nothing — 'Seat' is deliberately excluded from PLAYER_USABLE_COMPONENT_TYPES.
    const bulkOnly = collectBulkComponents(fields({ type: new Map([['AEGS_Avenger_SCItem_Seat_Pilot', 'Seat']]) }), new Map())
    expect(bulkOnly.records.size).toBe(0)
  })

  it('returns null (never throws, never fabricates) for an entity class bulk field extraction genuinely has no AttachDef.Type value for — the same "not found" signal the old per-entity dcb query path expressed', () => {
    const record = buildRecordFromBulkFields('Some_Entity_With_No_AttachDef', fields(), new Map())
    expect(record).toBeNull()
  })

  it('a shared entity class resolves identically whether reached via the narrow, no-filter walk or the allowlist-filtered bulk walk — one extraction rule, not two that could drift apart', () => {
    const sharedFields = fields({
      type: new Map([['SHLD_ASAS_S01_Mirage_SCItem', 'Shield']]),
      size: new Map([['SHLD_ASAS_S01_Mirage_SCItem', '1']]),
      grade: new Map([['SHLD_ASAS_S01_Mirage_SCItem', '1']]),
      manufacturerCode: new Map([['SHLD_ASAS_S01_Mirage_SCItem', 'ASAS']]),
      localizationName: new Map([['SHLD_ASAS_S01_Mirage_SCItem', '@item_NameSHLD_ASAS_S01_Mirage']]),
    })
    const localizationTable = new Map([['item_NameSHLD_ASAS_S01_Mirage', 'Mirage']])

    const narrowResolved = buildRecordFromBulkFields('SHLD_ASAS_S01_Mirage_SCItem', sharedFields, localizationTable)
    const bulkResolved = collectBulkComponents(sharedFields, localizationTable).records.get('SHLD_ASAS_S01_Mirage_SCItem')

    expect(narrowResolved).toEqual(bulkResolved)
  })
})
