/**
 * Test-only helper: builds a minimal, valid .xlsx buffer from a 2D array of
 * cell strings, so the reader test suite never depends on a checked-in
 * binary fixture file. Only emits the three parts xlsxReader.ts actually
 * reads (xl/workbook.xml, xl/worksheets/sheet1.xml, xl/sharedStrings.xml) —
 * real Excel output includes more (styles, theme, rels) but those are
 * irrelevant to what this tool parses.
 */
import { writeZipEntries } from '../xlsxZip'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface BuildXlsxOptions {
  sheetName?: string
  /** Row -> column -> string value. A row entirely omitted from this map
   * simulates Excel's own behavior of skipping a fully-blank row's <row>
   * element (still leaving a gap in row numbering). Use `null` for a cell
   * that should be entirely absent (as opposed to an empty string, which
   * still emits a `<c>` with no `<v>`). */
  rows: Array<Record<string, string | null> | null>
}

const COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E']

/** Builds a minimal valid .xlsx buffer. `rows[i]` (0-based) becomes
 * worksheet row `i + 1`; a `null` entry omits that <row> entirely (a
 * genuinely blank row, as Excel itself would emit). */
export function buildTestXlsx(options: BuildXlsxOptions): Buffer {
  const sheetName = options.sheetName ?? 'Sheet1'
  const sharedStrings: string[] = []
  const stringIndex = new Map<string, number>()
  function internString(s: string): number {
    const existing = stringIndex.get(s)
    if (existing !== undefined) return existing
    const index = sharedStrings.length
    sharedStrings.push(s)
    stringIndex.set(s, index)
    return index
  }

  const rowXmlParts: string[] = []
  options.rows.forEach((row, i) => {
    if (row === null) return
    const rowNum = i + 1
    const cellXmlParts: string[] = []
    for (const col of COLUMN_LETTERS) {
      const value = row[col]
      if (value === undefined || value === null) continue
      const idx = internString(value)
      cellXmlParts.push(`<c r="${col}${rowNum}" t="s"><v>${idx}</v></c>`)
    }
    if (cellXmlParts.length > 0) rowXmlParts.push(`<row r="${rowNum}">${cellXmlParts.join('')}</row>`)
  })

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXmlParts.join('')}</sheetData></worksheet>`
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.map((s) => `<si><t>${escapeXml(s)}</t></si>`).join('')}</sst>`
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`

  return writeZipEntries([
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(sharedStringsXml, 'utf8') },
  ])
}
