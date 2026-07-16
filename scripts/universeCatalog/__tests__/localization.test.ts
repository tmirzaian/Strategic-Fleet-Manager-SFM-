import { describe, it, expect } from 'vitest'
import { parseGlobalIni, resolveLocalizedName } from '../localization'

describe('Mission M-012: localization', () => {
  it('10. parses a key=value global.ini, stripping a leading BOM and CRLF endings', () => {
    const contents = '﻿manufacturer_NameARGO=Argo Astronautics\r\nvehicle_NameAEGS_Gladius=Aegis Gladius\r\n'
    const table = parseGlobalIni(contents)
    expect(table.get('manufacturer_NameARGO')).toBe('Argo Astronautics')
    expect(table.get('vehicle_NameAEGS_Gladius')).toBe('Aegis Gladius')
  })

  it('only splits on the first "=" — a value containing "=" is preserved whole', () => {
    const table = parseGlobalIni('some_key=A = B\n')
    expect(table.get('some_key')).toBe('A = B')
  })

  it('skips blank lines and lines with no "="', () => {
    const table = parseGlobalIni('\n\nnot_a_kv_line\nreal_key=value\n')
    expect(table.size).toBe(1)
    expect(table.get('real_key')).toBe('value')
  })

  it('10. resolveLocalizedName strips the leading "@" and resolves from the table', () => {
    const table = new Map([['vehicle_NameAEGS_Gladius', 'Aegis Gladius']])
    expect(resolveLocalizedName('@vehicle_NameAEGS_Gladius', table)).toBe('Aegis Gladius')
  })

  it('10. resolveLocalizedName returns explicit null for a missing key — never a guessed fallback', () => {
    const table = new Map<string, string>()
    expect(resolveLocalizedName('@some_missing_key', table)).toBeNull()
    expect(resolveLocalizedName(null, table)).toBeNull()
    expect(resolveLocalizedName(undefined, table)).toBeNull()
  })

  it('10. resolveLocalizedName treats known DataCore placeholder keys as explicit null', () => {
    const table = new Map([
      ['LOC_PLACEHOLDER', 'should never be returned'],
      ['LOC_UNINITIALIZED', 'should never be returned'],
      ['LOC_EMPTY', 'should never be returned'],
    ])
    expect(resolveLocalizedName('@LOC_PLACEHOLDER', table)).toBeNull()
    expect(resolveLocalizedName('@LOC_UNINITIALIZED', table)).toBeNull()
    expect(resolveLocalizedName('@LOC_EMPTY', table)).toBeNull()
  })
})
