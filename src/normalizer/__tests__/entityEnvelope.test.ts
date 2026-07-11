import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShipNormalizer, resolveShipEntity } from '../shipNormalizer'
import type { RawShipExport } from '../rawTypes'

const RAW_DATA_DIR = resolve(__dirname, '../../../raw-data')

const minimalLoadout: RawShipExport['loadout'] = [
  { itemPortName: 'hardpoint_gun_left_wing', portType: 'WeaponGun', factoryComponent: null },
]

describe('ShipNormalizer entity envelope compatibility', () => {
  it('resolves the legacy top-level entity object', () => {
    const doc: RawShipExport = {
      entity: { className: 'TEST_Fixture', manufacturer: 'Test Co' },
      loadout: minimalLoadout,
    }
    expect(resolveShipEntity(doc)).toEqual({ className: 'TEST_Fixture', manufacturer: 'Test Co' })

    const pkg = new ShipNormalizer().normalize(doc, 'legacy.json')
    expect(pkg.ship.manufacturer).toBe('Test Co')
  })

  it('resolves the new root.entity envelope, stripping the EntityClassDefinition. prefix', () => {
    const doc: RawShipExport = {
      root: { entity: 'EntityClassDefinition.AEGS_Gladius' },
      loadout: minimalLoadout,
    }
    expect(resolveShipEntity(doc)).toEqual({ className: 'AEGS_Gladius' })

    const pkg = new ShipNormalizer().normalize(doc, 'envelope.json')
    expect(pkg.ship.name).toBe('Gladius')
  })

  it('normalizes the prefix consistently even when it shows up on a legacy top-level entity', () => {
    const doc: RawShipExport = {
      entity: { className: 'EntityClassDefinition.AEGS_Gladius' },
      loadout: minimalLoadout,
    }
    expect(resolveShipEntity(doc)).toEqual({ className: 'AEGS_Gladius' })
  })

  it('fails clearly when neither entity form is present', () => {
    const doc = { loadout: minimalLoadout } as RawShipExport
    expect(resolveShipEntity(doc)).toBeUndefined()
    expect(() => new ShipNormalizer().normalize(doc, 'missing.json')).toThrow(
      /is missing entity\/loadout/
    )
  })

  it('resolves the entity envelope on the real, authoritative Gladius fixture', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'AEGS Gladius.json'), 'utf-8')) as RawShipExport
    expect(raw.entity).toBeUndefined()
    expect(raw.root?.entity).toBe('EntityClassDefinition.AEGS_Gladius')
    expect(resolveShipEntity(raw)).toEqual({ className: 'AEGS_Gladius' })
  })
})
