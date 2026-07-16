import { describe, it, expect } from 'vitest'
import { toCsv, parseCsv, parseCsvWithHeader, csvEscapeField } from '../csv'

describe('csv — EWO-038 (Task 3/11): deterministic CSV generation and parsing', () => {
  it('generates the same CSV text for the same input every time (deterministic)', () => {
    const csv1 = toCsv(['a', 'b'], [['1', '2'], ['3', '4']])
    const csv2 = toCsv(['a', 'b'], [['1', '2'], ['3', '4']])
    expect(csv1).toBe(csv2)
  })

  it('quotes a field containing a comma', () => {
    expect(csvEscapeField('Anvil, Aerospace')).toBe('"Anvil, Aerospace"')
  })

  it('quotes and doubles internal quotes', () => {
    expect(csvEscapeField('a "quoted" word')).toBe('"a ""quoted"" word"')
  })

  it('leaves a plain field unquoted', () => {
    expect(csvEscapeField('Ghost')).toBe('Ghost')
  })

  it('round-trips a full CSV with quoted and plain fields, Excel/Google-Sheets style CRLF line endings', () => {
    const csv = toCsv(['manufacturer', 'ship_name', 'notes'], [['Anvil, Aerospace', 'Ghost', 'plain note'], ['Drake', 'Cutlass Black', 'a "special" note']])
    expect(csv).toContain('\r\n')
    const parsed = parseCsvWithHeader(csv)
    expect(parsed).toEqual([
      { manufacturer: 'Anvil, Aerospace', ship_name: 'Ghost', notes: 'plain note' },
      { manufacturer: 'Drake', ship_name: 'Cutlass Black', notes: 'a "special" note' },
    ])
  })

  it('parseCsv handles a bare, unquoted simple file', () => {
    const rows = parseCsv('a,b,c\n1,2,3\n4,5,6\n')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ])
  })

  it('parseCsvWithHeader skips fully-blank rows', () => {
    const parsed = parseCsvWithHeader('a,b\n1,2\n,\n3,4\n')
    expect(parsed).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })
})
