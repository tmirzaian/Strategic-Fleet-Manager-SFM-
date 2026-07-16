/**
 * EWO-038 (Task 6) — reads plain string cell values out of an .xlsx
 * workbook's first worksheet. Deliberately narrow: no formulas, no styles,
 * no numeric/date cell types, no merged cells — this tool only ever needs
 * two text columns (ship name, image URL), exactly what the Commander
 * workbook contains. Built on xlsxZip.ts's dependency-free ZIP reader.
 */
import { readZipEntries } from './xlsxZip'

export interface XlsxWorkbookInfo {
  sheetNames: string[]
  firstSheetName: string
}

export interface XlsxSheetContents {
  /** Every row, in row order, as an array of cell text values in column
   * order (A, B, C, ...) — a row with a gap (e.g. only column B populated)
   * still yields an array indexed from column A, with '' for the gap. */
  rows: string[][]
  /** 1-based row numbers, parallel to `rows` — lets callers report "row 7
   * is blank" using the workbook's own row numbering, not array index. */
  rowNumbers: number[]
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  const siBlocks = xml.match(/<si>[\s\S]*?<\/si>/g) ?? []
  return siBlocks.map((block) => {
    const texts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlEntities(m[1]))
    return texts.join('')
  })
}

/** Column letters (A, B, ..., Z, AA, ...) -> zero-based index. */
function columnLetterToIndex(letters: string): number {
  let index = 0
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64)
  return index - 1
}

function parseSheetRows(xml: string, sharedStrings: string[]): XlsxSheetContents {
  const rowBlocks = xml.match(/<row[^>]*\/>|<row[^>]*>[\s\S]*?<\/row>/g) ?? []
  const rows: string[][] = []
  const rowNumbers: number[] = []

  for (const rowBlock of rowBlocks) {
    const rowNumMatch = /<row r="(\d+)"/.exec(rowBlock)
    const rowNum = rowNumMatch ? Number(rowNumMatch[1]) : rows.length + 1

    const cellRegex = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    const rowValues: string[] = []
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRegex.exec(rowBlock))) {
      const attrs = cellMatch[1]
      const inner = cellMatch[2] ?? ''
      const colMatch = /r="([A-Z]+)\d+"/.exec(attrs)
      if (!colMatch) continue
      const colIndex = columnLetterToIndex(colMatch[1])
      const typeMatch = /\st="([a-z]+)"/.exec(attrs)
      const type = typeMatch ? typeMatch[1] : undefined
      const valueMatch = /<v>([\s\S]*?)<\/v>/.exec(inner)
      const inlineStrMatch = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(inner)

      let value: string
      if (type === 's' && valueMatch) value = sharedStrings[Number(valueMatch[1])] ?? ''
      else if (type === 'str' && valueMatch) value = decodeXmlEntities(valueMatch[1])
      else if (type === 'inlineStr' && inlineStrMatch) value = decodeXmlEntities(inlineStrMatch[1])
      else if (valueMatch) value = decodeXmlEntities(valueMatch[1])
      else value = ''

      while (rowValues.length < colIndex) rowValues.push('')
      rowValues[colIndex] = value
    }
    rows.push(rowValues)
    rowNumbers.push(rowNum)
  }

  return { rows, rowNumbers }
}

function parseWorkbookSheetNames(workbookXml: string): string[] {
  return [...workbookXml.matchAll(/<sheet[^>]*\sname="([^"]*)"/g)].map((m) => decodeXmlEntities(m[1]))
}

/** Reads workbook-level metadata (sheet names) without parsing any sheet's rows. */
export function readXlsxWorkbookInfo(buf: Buffer): XlsxWorkbookInfo {
  const entries = readZipEntries(buf)
  const workbookXml = entries.get('xl/workbook.xml')
  if (!workbookXml) throw new Error('Not a valid .xlsx workbook — xl/workbook.xml is missing.')
  const sheetNames = parseWorkbookSheetNames(workbookXml.toString('utf8'))
  if (sheetNames.length === 0) throw new Error('Workbook contains no worksheets.')
  return { sheetNames, firstSheetName: sheetNames[0] }
}

/** Reads the first worksheet's full row/cell contents as plain strings. */
export function readXlsxFirstSheet(buf: Buffer): XlsxSheetContents {
  const entries = readZipEntries(buf)
  const sharedStrings = parseSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8'))
  const sheetXml = entries.get('xl/worksheets/sheet1.xml')
  if (!sheetXml) throw new Error('Workbook is missing xl/worksheets/sheet1.xml (expected exactly one worksheet, "sheet1").')
  return parseSheetRows(sheetXml.toString('utf8'), sharedStrings)
}
