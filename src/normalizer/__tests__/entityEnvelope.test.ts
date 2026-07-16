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

  it("EWO-023 (Task 3): derives manufacturer from the root.entity envelope's class name, since this envelope never supplies one directly", () => {
    const doc: RawShipExport = {
      root: { entity: 'EntityClassDefinition.DRAK_Cutlass_Black' },
      loadout: minimalLoadout,
    }
    const pkg = new ShipNormalizer().normalize(doc, 'envelope.json')
    expect(pkg.ship.manufacturer).toBe('Drake')
  })

  it("EWO-023 (Task 3): an embedded manufacturer always wins over the derived one (field precedence)", () => {
    const doc: RawShipExport = {
      entity: { className: 'DRAK_Cutlass_Black', manufacturer: 'Explicit Corp' },
      loadout: minimalLoadout,
    }
    const pkg = new ShipNormalizer().normalize(doc, 'legacy-with-manufacturer.json')
    expect(pkg.ship.manufacturer).toBe('Explicit Corp')
  })

  it("EWO-023 (Task 3): an unrecognized manufacturer code derives no guess — falls through to empty string, never invented", () => {
    const doc: RawShipExport = {
      root: { entity: 'EntityClassDefinition.ZZZZ_UnknownHull' },
      loadout: minimalLoadout,
    }
    const pkg = new ShipNormalizer().normalize(doc, 'unknown-code.json')
    expect(pkg.ship.manufacturer).toBe('')
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

  it('EWO-023 (Task 3): the real Gladius fixture now normalizes to manufacturer "Aegis", not empty', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'AEGS Gladius.json'), 'utf-8')) as RawShipExport
    const pkg = new ShipNormalizer().normalize(raw, 'raw-data/AEGS Gladius.json')
    expect(pkg.ship.manufacturer).toBe('Aegis')
  })
})
