import type { NormalizedShipPackage } from '../types'

/**
 * `RawRecord` — an intentionally opaque placeholder for a single unparsed
 * Layer 1 file (e.g. the contents of raw-data/AEGS Gladius.json). The
 * `StarBreakerImporter` (src/engine/importer/starBreakerImporter.ts) is
 * what turns raw bytes into one of these; the Normalizer is still the
 * stage responsible for narrowing/validating this shape, not the Importer.
 */
export type RawRecord = unknown

/**
 * `Importer` — Layer 1 access only. Reads one or more raw-data files and
 * hands back their unparsed contents as `RawRecord`s. An Importer never
 * normalizes, validates, or writes anything — that's the next stages'
 * job.
 */
export interface Importer {
  /** e.g. list every *.json file under /raw-data. */
  listSources(): Promise<string[]> | string[]
  /** Reads and returns one raw-data file's contents, unparsed/untyped. */
  read(sourcePath: string): Promise<RawRecord> | RawRecord
}

/**
 * `Validator` — checks a batch of `NormalizedShipPackage`s for internal
 * consistency (e.g. every Port.shipId points at a real Ship, every
 * factoryItemId points at a real Component) before a Writer is allowed to
 * persist them. See src/normalizer/validation.ts for the concrete
 * per-package checks; this interface is the pipeline-level contract that
 * runs it across every package in an import batch.
 */
export interface Validator {
  validate(packages: NormalizedShipPackage[]): ValidationIssue[]
}

export interface ValidationIssue {
  severity: 'error' | 'warning'
  path: string
  message: string
}

/**
 * `Writer` — the only stage allowed to touch /generated-data. Persists a
 * validated batch of `NormalizedShipPackage`s to the ships.json /
 * ports.json / components.json / factory-loadouts.json /
 * installed-loadouts.json / target-builds.json / display-name-map.json /
 * import-report.json files described in docs/DATA_ENGINE.md. Never
 * touches Layer 3 player data (src/data/seed.ts, the Zustand store) —
 * generated-data is strictly Layer 2 plus each imported ship's *default*
 * Layer 3 records, not anything a player has actually edited.
 */
export interface Writer {
  write(packages: NormalizedShipPackage[], outputDir: string): Promise<void> | void
}
