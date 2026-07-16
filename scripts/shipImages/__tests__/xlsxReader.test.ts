import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { readXlsxWorkbookInfo, readXlsxFirstSheet } from '../xlsxReader'
import { buildTestXlsx } from './xlsxTestFixture'

const REAL_WORKBOOK_PATH = join(__dirname, '..', '..', '..', 'data-maintenance', 'ship-images', 'Commander RSI URL Master.xlsx')

describe('xlsxReader — EWO-038 (Task 11): synthetic fixture parsing', () => {
  it('parses a two-column workbook with no header row (row 1 is real data, not a header)', () => {
    const buf = buildTestXlsx({ rows: [{ A: 'Ghost', B: 'https://robertsspaceindustries.com/i/abc/source.webp' }] })
    const { rows } = readXlsxFirstSheet(buf)
    expect(rows).toEqual([['Ghost', 'https://robertsspaceindustries.com/i/abc/source.webp']])
  })

  it('parses the expected exact two-column shape across multiple rows', () => {
    const buf = buildTestXlsx({
      rows: [
        { A: 'Ghost', B: 'https://robertsspaceindustries.com/i/1/source.webp' },
        { A: 'Mole', B: 'https://robertsspaceindustries.com/i/2/source.webp' },
        { A: 'Railen', B: 'https://robertsspaceindustries.com/i/3/source.webp' },
      ],
    })
    const { rows } = readXlsxFirstSheet(buf)
    expect(rows).toHaveLength(3)
    expect(rows[1]).toEqual(['Mole', 'https://robertsspaceindustries.com/i/2/source.webp'])
  })

  it('a fully-blank row (entirely absent from the sheet, as Excel itself emits) never becomes a phantom entry', () => {
    const buf = buildTestXlsx({
      rows: [
        { A: 'Ghost', B: 'https://robertsspaceindustries.com/i/1/source.webp' },
        null,
        { A: 'Mole', B: 'https://robertsspaceindustries.com/i/2/source.webp' },
      ],
    })
    const { rows, rowNumbers } = readXlsxFirstSheet(buf)
    expect(rows).toHaveLength(2)
    // Row numbering preserves the real workbook row number (3), skipping
    // the blank row (2) rather than silently renumbering.
    expect(rowNumbers).toEqual([1, 3])
  })

  it('a row with only column A populated (no URL) still parses — column B reads as an empty gap', () => {
    const buf = buildTestXlsx({ rows: [{ A: 'Concept Ship Name' }] })
    const { rows } = readXlsxFirstSheet(buf)
    expect(rows[0][0]).toBe('Concept Ship Name')
    expect(rows[0][1] ?? '').toBe('')
  })

  it('leading/trailing whitespace in a cell value is preserved by the reader (trimming is the caller\'s responsibility, not silently applied here)', () => {
    const buf = buildTestXlsx({ rows: [{ A: '  Ghost  ', B: ' https://robertsspaceindustries.com/i/1/source.webp ' }] })
    const { rows } = readXlsxFirstSheet(buf)
    expect(rows[0][0]).toBe('  Ghost  ')
    expect(rows[0][1]).toBe(' https://robertsspaceindustries.com/i/1/source.webp ')
  })

  it('reports the worksheet name via readXlsxWorkbookInfo', () => {
    const buf = buildTestXlsx({ sheetName: 'Sheet1', rows: [{ A: 'Ghost', B: 'https://robertsspaceindustries.com/i/1/source.webp' }] })
    const info = readXlsxWorkbookInfo(buf)
    expect(info.firstSheetName).toBe('Sheet1')
    expect(info.sheetNames).toEqual(['Sheet1'])
  })

  it('repeated shared strings (a URL or name appearing twice) resolve to the same value both times', () => {
    const buf = buildTestXlsx({
      rows: [
        { A: 'Ghost', B: 'https://robertsspaceindustries.com/i/1/source.webp' },
        { A: 'Ghost', B: 'https://robertsspaceindustries.com/i/1/source.webp' },
      ],
    })
    const { rows } = readXlsxFirstSheet(buf)
    expect(rows[0]).toEqual(rows[1])
  })
})

describe('xlsxReader — EWO-038 (Task 2): the real Commander workbook', () => {
  it('exists at the preferred maintenance location', () => {
    expect(existsSync(REAL_WORKBOOK_PATH)).toBe(true)
  })

  it('has exactly one worksheet named "Sheet1"', () => {
    if (!existsSync(REAL_WORKBOOK_PATH)) return
    const buf = readFileSync(REAL_WORKBOOK_PATH)
    const info = readXlsxWorkbookInfo(buf)
    expect(info.sheetNames).toEqual(['Sheet1'])
  })

  it('contains exactly 221 populated rows, two columns, no header row', () => {
    if (!existsSync(REAL_WORKBOOK_PATH)) return
    const buf = readFileSync(REAL_WORKBOOK_PATH)
    const { rows } = readXlsxFirstSheet(buf)
    expect(rows).toHaveLength(221)
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(2)
    // No header row: row 1 is real ship data, not literal column labels.
    expect(rows[0][0]).not.toMatch(/^(ship|name|rsi)/i)
  })
})
