import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { adaptLoadoutNodes, isLegacyLoadoutNode } from '../loadoutNodeAdapter'
import { ShipNormalizer } from '../shipNormalizer'
import type { RawLoadoutNode, LegacyLoadoutNode, StarBreakerLoadoutNode, RawShipExport } from '../rawTypes'
import type { NormalizationWarning } from '../../engine/types'

const RAW_DATA_DIR = resolve(__dirname, '../../../raw-data')

function adapt(nodes: RawLoadoutNode[]) {
  const warnings: NormalizationWarning[] = []
  const result = adaptLoadoutNodes(nodes, '', warnings)
  return { result, warnings }
}

describe('isLegacyLoadoutNode', () => {
  it('identifies a legacy node by itemPortName', () => {
    const node: LegacyLoadoutNode = { itemPortName: 'hardpoint_gun_left_wing', portType: 'WeaponGun' }
    expect(isLegacyLoadoutNode(node)).toBe(true)
  })

  it('identifies a StarBreaker node by absence of itemPortName', () => {
    const node: StarBreakerLoadoutNode = { entity: 'Mount_Gimbal_S3', port: 'hardpoint_gun_nose' }
    expect(isLegacyLoadoutNode(node)).toBe(false)
  })
})

describe('adaptLoadoutNodes — legacy schema', () => {
  it('passes legacy nodes through with all constraint/component fields intact', () => {
    const nodes: LegacyLoadoutNode[] = [
      {
        itemPortName: 'hardpoint_gun_left_wing',
        portType: 'WeaponGun',
        allowedTypes: ['WeaponGun'],
        allowedSubtypes: [],
        minSize: 2,
        maxSize: 2,
        factoryComponent: {
          internalName: 'test_repeater',
          displayName: 'Test Repeater',
          manufacturer: 'Test Co',
          category: 'WeaponGun',
          subtype: 'Ballistic',
          size: 2,
          grade: 'A',
          class: 'Military',
        },
      },
    ]

    const { result, warnings } = adapt(nodes)
    expect(warnings).toEqual([])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      itemPortName: 'hardpoint_gun_left_wing',
      portType: 'WeaponGun',
      size: undefined,
      allowedTypes: ['WeaponGun'],
      allowedSubtypes: [],
      minSize: 2,
      maxSize: 2,
      factoryComponent: nodes[0].factoryComponent,
      children: [],
    })
  })

  it('defaults a missing factoryComponent to null, not undefined', () => {
    const nodes: LegacyLoadoutNode[] = [{ itemPortName: 'door_pilot', portType: 'Door' }]
    const { result } = adapt(nodes)
    expect(result[0].factoryComponent).toBeNull()
  })
})

describe('adaptLoadoutNodes — StarBreaker schema', () => {
  it('maps port -> itemPortName and entity -> factoryComponent.internalName', () => {
    const nodes: StarBreakerLoadoutNode[] = [
      { entity: 'GATS_BallisticGatling_S3', port: 'hardpoint_class_2', parent: 'Mount_Gimbal_S3', geometry: 'foo.cga' },
    ]
    const { result, warnings } = adapt(nodes)
    expect(warnings).toEqual([])
    expect(result).toHaveLength(1)
    expect(result[0].itemPortName).toBe('hardpoint_class_2')
    expect(result[0].factoryComponent).toEqual({ internalName: 'GATS_BallisticGatling_S3' })
    // No structured classification/constraint data exists in this schema —
    // left undefined rather than guessed, so portClassifier/buildPortConstraints
    // fail safe on it exactly as they do for any other raw node missing it.
    expect(result[0].portType).toBeUndefined()
    expect(result[0].allowedTypes).toBeUndefined()
    expect(result[0].minSize).toBeUndefined()
    expect(result[0].maxSize).toBeUndefined()
  })

  it('preserves nested children under the new schema', () => {
    const nodes: StarBreakerLoadoutNode[] = [
      {
        entity: 'Mount_Gimbal_S3',
        port: 'hardpoint_gun_nose',
        children: [
          {
            entity: 'GATS_BallisticGatling_S3',
            port: 'hardpoint_class_2',
            children: [
              { entity: 'GATS_BallisticGatling_Barrel_S3', port: 'BAR1' },
              { entity: 'GATS_BallisticGatling_FiringMechanism_S3', port: 'MEC' },
            ],
          },
        ],
      },
    ]
    const { result } = adapt(nodes)
    expect(result).toHaveLength(1)
    expect(result[0].itemPortName).toBe('hardpoint_gun_nose')
    expect(result[0].children).toHaveLength(1)
    const gun = result[0].children[0]
    expect(gun.itemPortName).toBe('hardpoint_class_2')
    expect(gun.factoryComponent?.internalName).toBe('GATS_BallisticGatling_S3')
    expect(gun.children.map((c) => c.itemPortName)).toEqual(['BAR1', 'MEC'])
    expect(gun.children.map((c) => c.factoryComponent?.internalName)).toEqual([
      'GATS_BallisticGatling_Barrel_S3',
      'GATS_BallisticGatling_FiringMechanism_S3',
    ])
  })
})

describe('adaptLoadoutNodes — malformed/missing port data', () => {
  it('drops a node with neither itemPortName nor port, recording a warning', () => {
    const malformed = { entity: 'Some_Entity' } as unknown as RawLoadoutNode
    const nodes: RawLoadoutNode[] = [malformed]
    const { result, warnings } = adapt(nodes)
    expect(result).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('malformed-loadout-node')
  })

  it('promotes children of a dropped malformed node to the parent level', () => {
    const malformed = {
      entity: 'Some_Wrapper',
      children: [{ entity: 'Child_Entity', port: 'hardpoint_child' }],
    } as unknown as RawLoadoutNode
    const { result, warnings } = adapt([malformed])
    expect(warnings).toHaveLength(1)
    expect(result).toHaveLength(1)
    expect(result[0].itemPortName).toBe('hardpoint_child')
    expect(result[0].factoryComponent).toEqual({ internalName: 'Child_Entity' })
  })

  it('treats an empty-string port identifier as malformed rather than passing it downstream', () => {
    const node: StarBreakerLoadoutNode = { entity: 'Whatever', port: '' }
    const { result, warnings } = adapt([node])
    expect(result).toEqual([])
    expect(warnings[0].code).toBe('malformed-loadout-node')
  })

  it('never crashes normalize() on a document containing a malformed node', () => {
    const doc: RawShipExport = {
      entity: { className: 'TEST_Fixture' },
      loadout: [{ entity: 'Orphan' } as unknown as RawLoadoutNode, { itemPortName: 'door_pilot', portType: 'Door' }],
    }
    expect(() => new ShipNormalizer().normalize(doc, 'malformed.json')).not.toThrow()
  })
})

describe('adaptLoadoutNodes — output stability across equivalent legacy/new representations', () => {
  it('produces the same itemPortName and component identity for equivalent legacy and StarBreaker nodes', () => {
    const legacy: LegacyLoadoutNode = {
      itemPortName: 'hardpoint_gun_left_wing',
      portType: 'WeaponGun',
      factoryComponent: { internalName: 'KLWE_LaserRepeater_S3' },
    }
    const starBreaker: StarBreakerLoadoutNode = {
      entity: 'KLWE_LaserRepeater_S3',
      port: 'hardpoint_gun_left_wing',
    }

    const legacyResult = adapt([legacy]).result[0]
    const newResult = adapt([starBreaker]).result[0]

    expect(newResult.itemPortName).toBe(legacyResult.itemPortName)
    expect(newResult.factoryComponent?.internalName).toBe(legacyResult.factoryComponent?.internalName)
  })

  it('re-adapting the same raw document is deterministic', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'AEGS Gladius.json'), 'utf-8')) as RawShipExport
    const first = adapt(raw.loadout)
    const second = adapt(raw.loadout)
    expect(first.result).toEqual(second.result)
    expect(first.warnings.length).toBe(second.warnings.length)
  })
})

describe('adaptLoadoutNodes — the real AEGS Gladius fixture (new StarBreaker schema)', () => {
  it('adapts every node without throwing, and every node is a canonical node with a non-empty itemPortName', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'AEGS Gladius.json'), 'utf-8')) as RawShipExport
    const { result } = adapt(raw.loadout)
    expect(result.length).toBeGreaterThan(0)

    const assertAllHavePortIds = (nodes: typeof result) => {
      for (const node of nodes) {
        expect(typeof node.itemPortName).toBe('string')
        expect(node.itemPortName.length).toBeGreaterThan(0)
        assertAllHavePortIds(node.children)
      }
    }
    assertAllHavePortIds(result)
  })

  it('extracts the nose gun mount and its nested weapon entity as canonical component identity', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'AEGS Gladius.json'), 'utf-8')) as RawShipExport
    const { result } = adapt(raw.loadout)
    const noseMount = result.find((n) => n.itemPortName === 'hardpoint_gun_nose')
    expect(noseMount).toBeDefined()
    expect(noseMount!.factoryComponent).toEqual({ internalName: 'Mount_Gimbal_S3' })
    const gun = noseMount!.children.find((c) => c.factoryComponent?.internalName === 'GATS_BallisticGatling_S3')
    expect(gun).toBeDefined()
  })

  it('ShipNormalizer.normalize() no longer crashes on the real fixture (only the pending classification gap remains)', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'AEGS Gladius.json'), 'utf-8')) as RawShipExport
    expect(() => new ShipNormalizer().normalize(raw, 'raw-data/AEGS Gladius.json')).not.toThrow()
  })
})
