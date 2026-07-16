/**
 * EWO-038 (Task 6) — the smallest reliable way to read/write the two-column
 * XLSX workbook this mission needs, without adding a spreadsheet dependency
 * (SheetJS's npm-published `xlsx` lags CVE fixes available only on their own
 * CDN; `exceljs` is a much larger surface — full styles/streaming/formula
 * support — than reading two plain string columns requires). An .xlsx file
 * is just a ZIP archive of XML parts; this module implements only the
 * narrow slice needed: reading entries (stored or deflate), and writing
 * entries (stored only — sufficient for the synthetic fixtures the test
 * suite builds; the real Commander workbook is only ever read, never
 * written by this tool).
 */
import { inflateRawSync, deflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  data: Buffer
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIR_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50

/** Reads every entry of a ZIP archive (a parsed .xlsx buffer) via its
 * Central Directory — the only reliable source of compressed/uncompressed
 * sizes, since streamed writers may leave the Local File Header's own size
 * fields as zero (a data descriptor after the compressed bytes instead). */
export function readZipEntries(buf: Buffer): Map<string, Buffer> {
  let eocdIndex = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdIndex = i
      break
    }
  }
  if (eocdIndex === -1) throw new Error('Not a valid ZIP/XLSX file — no End Of Central Directory record found.')

  const centralDirOffset = buf.readUInt32LE(eocdIndex + 16)
  const entryCount = buf.readUInt16LE(eocdIndex + 10)

  const entries = new Map<string, Buffer>()
  let offset = centralDirOffset
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Malformed ZIP central directory entry at offset ${offset}.`)
    }
    const method = buf.readUInt16LE(offset + 10)
    const compressedSize = buf.readUInt32LE(offset + 20)
    const uncompressedSize = buf.readUInt32LE(offset + 24)
    const nameLength = buf.readUInt16LE(offset + 28)
    const extraLength = buf.readUInt16LE(offset + 30)
    const commentLength = buf.readUInt16LE(offset + 32)
    const localHeaderOffset = buf.readUInt32LE(offset + 42)
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength)

    if (buf.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
      throw new Error(`Malformed ZIP local file header for "${name}".`)
    }
    const localNameLength = buf.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = buf.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength

    let data: Buffer
    if (method === 0) data = Buffer.from(buf.subarray(dataStart, dataStart + uncompressedSize))
    else if (method === 8) data = inflateRawSync(buf.subarray(dataStart, dataStart + compressedSize))
    else throw new Error(`Unsupported ZIP compression method ${method} for "${name}" — only stored (0) and deflate (8) are supported.`)

    entries.set(name, data)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

// --- CRC32 (needed for ZIP local/central file records) ---------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Writes a minimal, valid ZIP archive (deflate-compressed entries) —
 * exercised only by the test suite's synthetic .xlsx fixtures (see
 * xlsxTestFixture.ts), never by the real import pipeline, which only reads
 * the Commander's own workbook. */
export function writeZipEntries(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const compressed = deflateRawSync(entry.data)
    const crc = crc32(entry.data)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0)
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt16LE(0, 6) // flags
    localHeader.writeUInt16LE(8, 8) // method: deflate
    localHeader.writeUInt16LE(0, 10) // mod time
    localHeader.writeUInt16LE(0, 12) // mod date
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(entry.data.length, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28) // extra length

    const localHeaderOffset = offset
    localParts.push(localHeader, nameBuf, compressed)
    offset += localHeader.length + nameBuf.length + compressed.length

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(CENTRAL_DIR_SIGNATURE, 0)
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt16LE(0, 8) // flags
    centralHeader.writeUInt16LE(8, 10) // method: deflate
    centralHeader.writeUInt16LE(0, 12) // mod time
    centralHeader.writeUInt16LE(0, 14) // mod date
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(entry.data.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra length
    centralHeader.writeUInt16LE(0, 32) // comment length
    centralHeader.writeUInt16LE(0, 34) // disk number
    centralHeader.writeUInt16LE(0, 36) // internal attrs
    centralHeader.writeUInt32LE(0, 38) // external attrs
    centralHeader.writeUInt32LE(localHeaderOffset, 42)
    centralParts.push(centralHeader, nameBuf)
  }

  const centralDirStart = offset
  for (const part of centralParts) offset += part.length
  const centralDirSize = offset - centralDirStart

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirSize, 12)
  eocd.writeUInt32LE(centralDirStart, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, ...centralParts, eocd])
}
