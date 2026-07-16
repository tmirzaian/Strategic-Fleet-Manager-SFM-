/**
 * EWO-038 (Task 3/6) — minimal RFC 4180 CSV read/write for the canonical
 * maintenance dataset. No dependency: the format this tool needs (quote a
 * field only if it contains a comma, quote, or newline; double an internal
 * quote) is a handful of lines, well below the bar for adding a package.
 */
export function csvEscapeField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvEscapeField).join(','))
  return lines.join('\r\n') + '\r\n'
}

/** Parses one CSV line at a time from the whole text, honoring quoted
 * fields that may themselves contain commas/newlines. Returns rows of raw
 * string cells (header included, if present — caller decides). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  // Normalize line endings so \r\n / \n / \r all behave identically inside
  // the state machine below.
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  function endField() {
    row.push(field)
    field = ''
  }
  function endRow() {
    endField()
    rows.push(row)
    row = []
  }

  while (i < normalized.length) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      endField()
      i++
      continue
    }
    if (ch === '\n') {
      endRow()
      i++
      continue
    }
    field += ch
    i++
  }
  // Final field/row, unless the text ended cleanly on a newline (in which
  // case the trailing empty row would be spurious).
  if (field !== '' || row.length > 0) endRow()

  return rows
}

/** Parses CSV text with a header row into an array of plain objects keyed
 * by header name. */
export function parseCsvWithHeader(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const [header, ...dataRows] = rows
  return dataRows
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => {
      const obj: Record<string, string> = {}
      header.forEach((key, idx) => {
        obj[key] = row[idx] ?? ''
      })
      return obj
    })
}
