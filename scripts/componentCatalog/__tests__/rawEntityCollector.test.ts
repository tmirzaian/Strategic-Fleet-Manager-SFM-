import { describe, it, expect } from 'vitest'
import { collectEntityClasses } from '../rawEntityCollector'

describe('collectEntityClasses — legacy loadout nodes', () => {
  it('collects the ship entity and mounted factoryComponent.internalName values', () => {
    const doc = {
      entity: { className: 'TEST_Fixture' },
      loadout: [
        { itemPortName: 'hardpoint_gun_left_wing', portType: 'WeaponGun', factoryComponent: { internalName: 'test_repeater' } },
        { itemPortName: 'door_pilot', portType: 'Door', factoryComponent: null },
      ],
    }
    const { entities, warnings } = collectEntityClasses(doc, 'legacy.json')
    expect(entities).toEqual(new Set(['TEST_Fixture', 'test_repeater']))
    expect(warnings).toEqual([])
  })

  it('strips the EntityClassDefinition. prefix from a legacy className', () => {
    const doc = {
      entity: { className: 'EntityClassDefinition.AEGS_Gladius' },
      loadout: [],
    }
    const { entities } = collectEntityClasses(doc, 'legacy.json')
    expect(entities.has('AEGS_Gladius')).toBe(true)
  })
})

describe('collectEntityClasses — StarBreaker loadout nodes', () => {
  it('collects the root.entity ship class and mounted node.entity values', () => {
    const doc = {
      root: { entity: 'EntityClassDefinition.AEGS_Gladius' },
      loadout: [{ entity: 'POWR_AEGS_S01_Regulus_SCItem', port: 'hardpoint_power_plant' }],
    }
    const { entities, warnings } = collectEntityClasses(doc, 'starbreaker.json')
    expect(entities).toEqual(new Set(['AEGS_Gladius', 'POWR_AEGS_S01_Regulus_SCItem']))
    expect(warnings).toEqual([])
  })
})

describe('collectEntityClasses — nested children', () => {
  it('recurses into legacy children', () => {
    const doc = {
      entity: { className: 'TEST_Fixture' },
      loadout: [
        {
          itemPortName: 'hardpoint_missile_rack',
          factoryComponent: null,
          children: [{ itemPortName: 'hardpoint_missile_rack_01', factoryComponent: { internalName: 'test_missile' } }],
        },
      ],
    }
    const { entities } = collectEntityClasses(doc, 'legacy.json')
    expect(entities.has('test_missile')).toBe(true)
  })

  it('recurses into StarBreaker children at any depth (mount -> gun -> sub-parts)', () => {
    const doc = {
      root: { entity: 'AEGS_Gladius' },
      loadout: [
        {
          entity: 'Mount_Gimbal_S3',
          port: 'hardpoint_gun_nose',
          children: [
            {
              entity: 'GATS_BallisticGatling_S3',
              port: 'hardpoint_class_2',
              children: [{ entity: 'GATS_BallisticGatling_Barrel_S3', port: 'BAR1' }],
            },
          ],
        },
      ],
    }
    const { entities } = collectEntityClasses(doc, 'gladius.json')
    expect(entities).toEqual(new Set(['AEGS_Gladius', 'Mount_Gimbal_S3', 'GATS_BallisticGatling_S3', 'GATS_BallisticGatling_Barrel_S3']))
  })
})

describe('collectEntityClasses — deduplication', () => {
  it('collapses the same entity class mounted at multiple ports into one set entry', () => {
    const doc = {
      root: { entity: 'AEGS_Gladius' },
      loadout: [
        { entity: 'Mount_Gimbal_S3', port: 'hardpoint_gun_nose' },
        { entity: 'Mount_Gimbal_S3', port: 'hardpoint_gun_left_wing' },
        { entity: 'Mount_Gimbal_S3', port: 'hardpoint_gun_right_wing' },
      ],
    }
    const { entities } = collectEntityClasses(doc, 'gladius.json')
    expect(entities.size).toBe(2) // AEGS_Gladius + Mount_Gimbal_S3, not 4
  })
})

describe('collectEntityClasses — missing or empty entity values', () => {
  it('skips a StarBreaker node with an empty entity string and records a warning', () => {
    const doc = { root: { entity: 'AEGS_Gladius' }, loadout: [{ entity: '', port: 'hardpoint_x' }] }
    const { entities, warnings } = collectEntityClasses(doc, 'x.json')
    expect(entities).toEqual(new Set(['AEGS_Gladius']))
    expect(warnings.some((w) => w.includes('missing both itemPortName and entity'))).toBe(true)
  })

  it('skips a legacy node with no factoryComponent without warning (a real excluded node, not malformed)', () => {
    const doc = { entity: { className: 'TEST' }, loadout: [{ itemPortName: 'door_pilot', factoryComponent: null }] }
    const { entities, warnings } = collectEntityClasses(doc, 'x.json')
    expect(entities).toEqual(new Set(['TEST']))
    expect(warnings).toEqual([])
  })

  it('warns and returns no ship entity when neither entity.className nor root.entity is present', () => {
    const doc = { loadout: [] }
    const { entities, warnings } = collectEntityClasses(doc, 'x.json')
    expect(entities.size).toBe(0)
    expect(warnings.some((w) => w.includes('no usable ship-level entity'))).toBe(true)
  })

  it('does not crash on a non-object document', () => {
    const { entities, warnings } = collectEntityClasses(null, 'x.json')
    expect(entities.size).toBe(0)
    expect(warnings.some((w) => w.includes('not a recognizable ship export document'))).toBe(true)
  })

  it('does not crash on a non-object loadout node', () => {
    const doc = { entity: { className: 'TEST' }, loadout: ['not-an-object', 42] }
    const { entities, warnings } = collectEntityClasses(doc, 'x.json')
    expect(entities).toEqual(new Set(['TEST']))
    expect(warnings.filter((w) => w.includes('non-object loadout node'))).toHaveLength(2)
  })
})
