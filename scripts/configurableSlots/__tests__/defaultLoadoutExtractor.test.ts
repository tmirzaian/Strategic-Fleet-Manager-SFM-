import { describe, it, expect } from 'vitest'
import { findDefaultLoadoutComponent, normalizeEntityClassReference, extractDefaultLoadoutConfiguration } from '../defaultLoadoutExtractor'
import type { RawDcbRecordJson } from '../../componentCatalog/dcbQuery'

/** Mirrors the real shape confirmed live against `ANVL_Hornet_F7CS_Mk2`,
 * `AEGS_Retaliator`, `RSI_Scorpius`, and `ARGO_MOTH` during SW-010A
 * implementation — a materialized entry (inline `entityClassName`), a
 * reference-only entry (empty `entityClassName`, real `entityClassReference`),
 * a nested configuration (a module port whose own `loadout.entries`
 * describes weapon mounts inside it), and the real MOTH counter-example
 * that disproved the original "reference-only + no nested entries ==
 * configurable" assumption: `hardpoint_cooler` is reference-only in the
 * DCB record yet is an ordinary, fully-materialized leaf component in the
 * real geometry export. */
const SHIP_RECORD: RawDcbRecordJson = {
  _RecordName_: 'EntityClassDefinition.TEST_Ship',
  _RecordId_: 'guid',
  _RecordValue_: {
    Components: [
      {
        _Type_: 'SEntityComponentDefaultLoadoutParams',
        loadout: {
          entries: [
            {
              itemPortName: 'hardpoint_weapon_center',
              entityClassName: '',
              entityClassReference: 'file://./../../../../../libs/foundry/records/entities/scitem/ships/weapon_mounts/fixed/anvl/umnt_anvl_s5_cap_mk2.json',
              loadout: null,
            },
            {
              itemPortName: 'hardpoint_cooler',
              entityClassName: '',
              entityClassReference: 'file://./../../../../../libs/foundry/records/entities/scitem/cooling/test_cooler.json',
              loadout: null,
            },
            {
              itemPortName: 'hardpoint_front_module',
              entityClassName: 'AEGS_Retaliator_Module_Front_Base',
              entityClassReference: null,
              loadout: {
                entries: [
                  {
                    itemPortName: 'hardpoint_module_weapon_01',
                    entityClassName: 'Mount_Gimbal_S3',
                    entityClassReference: null,
                    loadout: null,
                  },
                ],
              },
            },
            {
              itemPortName: 'hardpoint_anomalous',
              entityClassName: '',
              entityClassReference: null,
              loadout: null,
            },
          ],
        },
      },
    ],
  },
}

describe('findDefaultLoadoutComponent', () => {
  it('locates SEntityComponentDefaultLoadoutParams by _Type_', () => {
    const component = findDefaultLoadoutComponent(SHIP_RECORD)
    expect(component).not.toBeNull()
  })

  it('returns null when the entity has no default-loadout component at all', () => {
    const record: RawDcbRecordJson = { _RecordName_: 'EntityClassDefinition.X', _RecordId_: 'guid', _RecordValue_: { Components: [] } }
    expect(findDefaultLoadoutComponent(record)).toBeNull()
  })

  it('returns null when _RecordValue_ is missing entirely', () => {
    const record: RawDcbRecordJson = { _RecordName_: 'EntityClassDefinition.X', _RecordId_: 'guid' }
    expect(findDefaultLoadoutComponent(record)).toBeNull()
  })
})

describe('normalizeEntityClassReference', () => {
  it('strips the file:// protocol and path, leaving only the filename stem', () => {
    expect(normalizeEntityClassReference('file://./../../../../../libs/foundry/records/entities/scitem/ships/weapon_mounts/fixed/anvl/umnt_anvl_s5_cap_mk2.json')).toBe('umnt_anvl_s5_cap_mk2')
  })

  it('is case-preserving — normalization is not resolution', () => {
    expect(normalizeEntityClassReference('file://.../UMNT_ANVL_S5_Cap_Mk2.json')).toBe('UMNT_ANVL_S5_Cap_Mk2')
  })
})

describe('extractDefaultLoadoutConfiguration', () => {
  it('extracts every entry, recursing into nested module loadouts', () => {
    const result = extractDefaultLoadoutConfiguration(SHIP_RECORD)
    const portNames = result.entries.map((e) => e.itemPortName)
    expect(portNames).toEqual(['hardpoint_weapon_center', 'hardpoint_cooler', 'hardpoint_front_module', 'hardpoint_module_weapon_01', 'hardpoint_anomalous'])
  })

  it('records the correct parentItemPortName for a nested entry', () => {
    const result = extractDefaultLoadoutConfiguration(SHIP_RECORD)
    const nested = result.entries.find((e) => e.itemPortName === 'hardpoint_module_weapon_01')
    expect(nested?.parentItemPortName).toBe('hardpoint_front_module')
  })

  it('top-level entries have a null parentItemPortName', () => {
    const result = extractDefaultLoadoutConfiguration(SHIP_RECORD)
    const topLevel = result.entries.find((e) => e.itemPortName === 'hardpoint_weapon_center')
    expect(topLevel?.parentItemPortName).toBeNull()
  })

  it('classifies reference-only entries into referenceOnlyEntries — including the MOTH cooler counter-example, since this signal alone is NOT sufficient proof of configurability', () => {
    const result = extractDefaultLoadoutConfiguration(SHIP_RECORD)
    const referenceOnlyPorts = result.referenceOnlyEntries.map((e) => e.itemPortName)
    expect(referenceOnlyPorts).toContain('hardpoint_weapon_center')
    expect(referenceOnlyPorts).toContain('hardpoint_cooler')
  })

  it('does not classify a materialized inline entry as reference-only', () => {
    const result = extractDefaultLoadoutConfiguration(SHIP_RECORD)
    const referenceOnlyPorts = result.referenceOnlyEntries.map((e) => e.itemPortName)
    expect(referenceOnlyPorts).not.toContain('hardpoint_front_module')
  })

  it('flags an entry with neither inline class, reference, nor nested children as a diagnostic anomaly, not a silent drop', () => {
    const result = extractDefaultLoadoutConfiguration(SHIP_RECORD)
    expect(result.entries.map((e) => e.itemPortName)).toContain('hardpoint_anomalous')
    expect(result.diagnostics.some((d) => d.code === 'configuration-reference-unresolvable' && d.itemPortName === 'hardpoint_anomalous')).toBe(true)
  })

  it('never throws and returns an empty result for a record with no default-loadout component', () => {
    const record: RawDcbRecordJson = { _RecordName_: 'EntityClassDefinition.X', _RecordId_: 'guid', _RecordValue_: { Components: [] } }
    const result = extractDefaultLoadoutConfiguration(record)
    expect(result).toEqual({ entries: [], referenceOnlyEntries: [], diagnostics: [] })
  })
})
