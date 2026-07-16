import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAcquisition, exportOneHull, type AcquisitionConfig, type SpawnFn } from '../acquisitionRunner'
import type { ManifestEntry } from '../types'

function makeEntry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    displayName: 'Test Ship',
    manufacturer: 'Test',
    canonicalId: 'test-ship',
    sourceClass: 'CATALOG-ONLY',
    requestedEntityId: 'TEST_Ship',
    requestedEntityIdSource: 'catalogEntityClassId',
    matchedCatalogEntityClass: 'TEST_Ship',
    matchedCatalogDisplayName: 'Test Ship',
    alternateCandidates: [],
    aliasNotes: null,
    expectedOutputFilename: 'TEST_Ship.json',
    alreadyInRawData: false,
    acquisitionStatus: 'PENDING',
    failureReason: null,
    ...overrides,
  }
}

let dirs: string[] = []
function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gf002b-test-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
  vi.restoreAllMocks()
})

function baseConfig(overrides: Partial<AcquisitionConfig> = {}): AcquisitionConfig {
  const stagingDir = makeTempDir()
  return {
    starbreakerPath: 'starbreaker.exe',
    p4kPath: 'Data.p4k',
    stagingDir,
    quarantineDir: join(stagingDir, 'quarantine'),
    perHullTimeoutMs: 5000,
    retryCount: 1,
    force: false,
    dryRun: false,
    spawn: vi.fn(),
    ...overrides,
  }
}

// `loadout: []` (not `root_nmc`) is the field ShipNormalizer.normalize()
// actually requires to accept a document as a recognizable StarBreaker
// export (confirmed directly against the real normalizer) — an empty
// array normalizes trivially to a real, valid, zero-port package, exactly
// enough realism for these orchestration-focused tests without needing a
// full captured fixture.
const validHierarchyJson = (entityClass: string) => JSON.stringify({ root: { entity: `EntityClassDefinition.${entityClass}`, geometry: 'x.cga' }, loadout: [] })

describe('GF-002B (Task 10): acquisition runner — dry-run and manifest handling', () => {
  it('dry-run never invokes the spawn function at all', async () => {
    const spawn = vi.fn()
    const config = baseConfig({ dryRun: true, spawn })
    const entries = [makeEntry()]
    await runAcquisition(config, { manifestOverride: entries })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('dry-run writes no files to the staging directory', async () => {
    // baseConfig()'s own temp-dir helper already creates the directory
    // itself (mkdtempSync always does) — dry-run must leave it empty,
    // not skip creating it (that's just test scaffolding, not this tool's
    // own behavior).
    const config = baseConfig({ dryRun: true })
    await runAcquisition(config, { manifestOverride: [makeEntry()] })
    expect(readdirSync(config.stagingDir)).toEqual([])
  })

  it('a hull already covered by approved raw-data (alreadyInRawData) is never exported', async () => {
    const spawn = vi.fn()
    const config = baseConfig({ spawn })
    const { records, statusCounts } = await runAcquisition(config, { manifestOverride: [makeEntry({ alreadyInRawData: true })] })
    expect(spawn).not.toHaveBeenCalled()
    expect(records[0].finalStatus).toBe('ALREADY_VALIDATED')
    expect(statusCounts.ALREADY_VALIDATED).toBe(1)
  })

  it('a hull with no resolvable entity id is classified NO_MECHANICAL_ENTITY without invoking spawn', async () => {
    const spawn = vi.fn()
    const config = baseConfig({ spawn })
    const { records } = await runAcquisition(config, { manifestOverride: [makeEntry({ requestedEntityId: '' })] })
    expect(spawn).not.toHaveBeenCalled()
    expect(records[0].finalStatus).toBe('NO_MECHANICAL_ENTITY')
  })

  it('a hull with more than one alternate candidate is classified AMBIGUOUS_MATCH without invoking spawn', async () => {
    const spawn = vi.fn()
    const config = baseConfig({ spawn })
    const entry = makeEntry({ alternateCandidates: [{ entityClass: 'A', displayName: 'A' }, { entityClass: 'B', displayName: 'B' }] })
    const { records } = await runAcquisition(config, { manifestOverride: [entry] })
    expect(spawn).not.toHaveBeenCalled()
    expect(records[0].finalStatus).toBe('AMBIGUOUS_MATCH')
  })
})

describe('GF-002B (Task 10): acquisition runner — export + validation classification', () => {
  it('a clean export with matching identity and a resolvable normalize pass is EXPORTED_VALID', async () => {
    const config = baseConfig()
    config.spawn = vi.fn<SpawnFn>((_cmd, args) => {
      const outputPath = args[3]
      writeFileSync(outputPath, validHierarchyJson('TEST_Ship'))
      return { status: 0, stdout: 'ok', stderr: '', timedOut: false }
    })
    const { records, statusCounts } = await runAcquisition(config, { manifestOverride: [makeEntry()] })
    expect(records[0].finalStatus).toBe('EXPORTED_VALID')
    expect(statusCounts.EXPORTED_VALID).toBe(1)
  })

  it('a non-zero exit code is classified EXPORT_FAILED', async () => {
    const config = baseConfig()
    config.spawn = vi.fn<SpawnFn>(() => ({ status: 1, stdout: '', stderr: 'not found', timedOut: false }))
    const { records } = await runAcquisition(config, { manifestOverride: [makeEntry()] })
    expect(records[0].finalStatus).toBe('EXPORT_FAILED')
  })

  it('a timeout is classified EXPORT_FAILED and does not crash the run', async () => {
    const config = baseConfig()
    config.spawn = vi.fn<SpawnFn>(() => ({ status: null, stdout: '', stderr: '', timedOut: true }))
    const { records } = await runAcquisition(config, { manifestOverride: [makeEntry()] })
    expect(records[0].finalStatus).toBe('EXPORT_FAILED')
    expect(records[0].exportAttempt?.timedOut).toBe(true)
  })

  it('a substring-match misexport (wrong entity in the output) is classified IDENTITY_MISMATCH and quarantined, never EXPORTED_VALID', async () => {
    const config = baseConfig()
    config.spawn = vi.fn<SpawnFn>((_cmd, args) => {
      writeFileSync(args[3], validHierarchyJson('TEST_Ship_Variant_Nobody_Asked_For'))
      return { status: 0, stdout: '', stderr: '', timedOut: false }
    })
    const { records } = await runAcquisition(config, { manifestOverride: [makeEntry()] })
    expect(records[0].finalStatus).toBe('IDENTITY_MISMATCH')
    const quarantined = join(config.quarantineDir, 'TEST_Ship.json')
    expect(existsSync(quarantined)).toBe(true)
    expect(readFileSync(`${quarantined}.reason.txt`, 'utf-8')).toContain('TEST_Ship_Variant_Nobody_Asked_For')
  })

  it('malformed (unparseable) output is classified MALFORMED_OUTPUT and quarantined', async () => {
    const config = baseConfig()
    config.spawn = vi.fn<SpawnFn>((_cmd, args) => {
      writeFileSync(args[3], 'not json at all { [ garbage')
      return { status: 0, stdout: '', stderr: '', timedOut: false }
    })
    const { records } = await runAcquisition(config, { manifestOverride: [makeEntry()] })
    expect(records[0].finalStatus).toBe('MALFORMED_OUTPUT')
    expect(existsSync(join(config.quarantineDir, 'TEST_Ship.json'))).toBe(true)
  })

  it('trailing-comma output (a known StarBreaker quirk) is accepted, not treated as malformed', async () => {
    const config = baseConfig()
    config.spawn = vi.fn<SpawnFn>((_cmd, args) => {
      writeFileSync(args[3], '{"root": {"entity": "EntityClassDefinition.TEST_Ship",},"loadout": [],}')
      return { status: 0, stdout: '', stderr: '', timedOut: false }
    })
    const { records } = await runAcquisition(config, { manifestOverride: [makeEntry()] })
    expect(records[0].finalStatus).toBe('EXPORTED_VALID')
  })

  it('overwrite protection: a pre-existing staged file is not re-exported unless --force is set', async () => {
    const config = baseConfig()
    config.spawn = vi.fn<SpawnFn>()
    const outputPath = join(config.stagingDir, 'TEST_Ship.json')
    mkdirSync(config.stagingDir, { recursive: true })
    writeFileSync(outputPath, validHierarchyJson('TEST_Ship'))
    const result = exportOneHull(makeEntry(), config)
    expect(config.spawn).not.toHaveBeenCalled()
    expect(result.outputExists).toBe(true)
  })

  it('force mode re-exports even when a staged file already exists', async () => {
    const config = baseConfig({ force: true })
    config.spawn = vi.fn<SpawnFn>((_cmd, args) => {
      writeFileSync(args[3], validHierarchyJson('TEST_Ship'))
      return { status: 0, stdout: '', stderr: '', timedOut: false }
    })
    mkdirSync(config.stagingDir, { recursive: true })
    writeFileSync(join(config.stagingDir, 'TEST_Ship.json'), 'stale')
    exportOneHull(makeEntry(), config)
    expect(config.spawn).toHaveBeenCalledTimes(1)
  })

  it('resume mode skips a hull already marked EXPORTED_VALID in a prior run, without invoking spawn again', async () => {
    const config = baseConfig()
    config.spawn = vi.fn<SpawnFn>((_cmd, args) => {
      writeFileSync(args[3], validHierarchyJson('TEST_Ship'))
      return { status: 0, stdout: '', stderr: '', timedOut: false }
    })
    await runAcquisition(config, { manifestOverride: [makeEntry()] })
    expect(config.spawn).toHaveBeenCalledTimes(1)

    const secondSpawn = vi.fn<SpawnFn>()
    const { records } = await runAcquisition({ ...config, spawn: secondSpawn }, { manifestOverride: [makeEntry()] })
    expect(secondSpawn).not.toHaveBeenCalled()
    expect(records[0].finalStatus).toBe('ALREADY_VALIDATED')
  })

  it('report status counts always sum to the manifest length', async () => {
    const config = baseConfig()
    config.spawn = vi.fn<SpawnFn>((_cmd, args) => {
      writeFileSync(args[3], validHierarchyJson('TEST_Ship'))
      return { status: 0, stdout: '', stderr: '', timedOut: false }
    })
    const entries = [makeEntry(), makeEntry({ canonicalId: 'other', alreadyInRawData: true }), makeEntry({ canonicalId: 'unresolved', requestedEntityId: '' })]
    const { statusCounts } = await runAcquisition(config, { manifestOverride: entries })
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0)
    expect(total).toBe(entries.length)
  })

  it('never writes into a path resembling raw-data/ or generated-data/ — only into the configured staging directory', async () => {
    const config = baseConfig()
    const writes: string[] = []
    config.spawn = vi.fn<SpawnFn>((_cmd, args) => {
      writes.push(args[3])
      writeFileSync(args[3], validHierarchyJson('TEST_Ship'))
      return { status: 0, stdout: '', stderr: '', timedOut: false }
    })
    await runAcquisition(config, { manifestOverride: [makeEntry()] })
    for (const w of writes) {
      expect(w).not.toContain(`${join('raw-data')}`)
      expect(w).not.toContain('generated-data')
      expect(w.startsWith(config.stagingDir)).toBe(true)
    }
  })
})
