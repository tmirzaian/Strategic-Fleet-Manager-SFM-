import { describe, it, expect } from 'vitest'
import { parseManufacturerReference } from '../manufacturerResolver'

describe('Mission M-012: manufacturerResolver', () => {
  it('11. combines a bulk-queried code and localization key into a resolved manufacturer', () => {
    const result = parseManufacturerReference('AEGS', '@manufacturer_NameAEGS')
    expect(result).toEqual({ code: 'AEGS', localizationKey: '@manufacturer_NameAEGS' })
  })

  it('11. preserves the raw DataCore Code as provenance even with no localization key', () => {
    const result = parseManufacturerReference('ARGO', undefined)
    expect(result).toEqual({ code: 'ARGO', localizationKey: null })
  })

  it('returns null when no manufacturer code was present at all', () => {
    expect(parseManufacturerReference(undefined, undefined)).toBeNull()
    expect(parseManufacturerReference('', undefined)).toBeNull()
  })
})
