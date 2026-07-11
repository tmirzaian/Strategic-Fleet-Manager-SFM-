import type { RawRecord, Importer, Validator, Writer } from './interfaces'
import type { Normalizer } from '../../normalizer/interfaces'
import type { NormalizedShipPackage } from '../types'

/**
 * `DataEnginePipeline` — the pipeline now implemented for real by
 * scripts/importShips.ts (Sprint: generalized StarBreaker import
 * pipeline):
 *
 *   StarBreakerImporter → ShipNormalizer → validateNormalizedPackage → GeneratedDataWriter
 *        (raw-data)         (in memory)         (in memory)              (generated-data)
 *
 * One raw file produces one `NormalizedShipPackage`; a multi-ship run
 * collects packages from every processed file before validating and
 * writing them as a batch. See docs/DATA_ENGINE.md and the sprint
 * completion report for the concrete implementation and how to run it.
 */
export interface DataEnginePipeline {
  importer: Importer
  normalizer: Normalizer
  validator: Validator
  writer: Writer
}

/** Shape of a single Importer→Normalizer handoff, for reference. */
export type NormalizeStep = (raw: RawRecord, sourceFile: string) => NormalizedShipPackage | Promise<NormalizedShipPackage>
