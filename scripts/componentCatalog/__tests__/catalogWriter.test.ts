import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeCatalogFile, CATALOG_FILENAME } from '../catalogWriter'

const tempDirs: string[] = []

function makeTempOutputDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sfm-catalog-writer-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('writeCatalogFile — no mutation of existing generated-data files', () => {
  it('writes only component-metadata-catalog.json, leaving pre-existing files byte-identical', () => {
    const outputDir = makeTempOutputDir()

    const preexisting: Record<string, string> = {
      'ships.json': JSON.stringify([{ id: 'ship-1' }]),
      'components.json': JSON.stringify([{ id: 'component-1' }]),
      'import-report.json': JSON.stringify({ generatedAt: '2026-01-01T00:00:00.000Z' }),
    }
    for (const [name, contents] of Object.entries(preexisting)) {
      writeFileSync(join(outputDir, name), contents, 'utf-8')
    }
    const beforeMtimes = Object.keys(preexisting).map((name) => statSync(join(outputDir, name)).mtimeMs)

    const writtenPath = writeCatalogFile(outputDir, { schemaVersion: 1 })

    expect(writtenPath).toBe(join(outputDir, CATALOG_FILENAME))

    for (const [name, contents] of Object.entries(preexisting)) {
      expect(readFileSync(join(outputDir, name), 'utf-8')).toBe(contents)
    }
    const afterMtimes = Object.keys(preexisting).map((name) => statSync(join(outputDir, name)).mtimeMs)
    expect(afterMtimes).toEqual(beforeMtimes)

    const filesAfter = readdirSync(outputDir).sort()
    expect(filesAfter).toEqual([...Object.keys(preexisting), CATALOG_FILENAME].sort())
  })

  it('serializes the catalog as pretty-printed JSON ending in a newline', () => {
    const outputDir = makeTempOutputDir()
    const path = writeCatalogFile(outputDir, { schemaVersion: 1, records: {} })
    const text = readFileSync(path, 'utf-8')
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual({ schemaVersion: 1, records: {} })
  })
})
