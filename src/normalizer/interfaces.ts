import type { RawRecord } from '../engine/importer/interfaces'
import type { NormalizedShipPackage } from '../engine/types'

/**
 * `Normalizer` — transforms one raw StarBreaker export (`RawRecord`, still
 * unparsed/untyped at this point) into one `NormalizedShipPackage`.
 *
 * One raw file = one ship = one package. A multi-ship import run (see
 * scripts/importShips.ts) calls `normalize()` once per file and combines
 * the resulting packages when writing generated-data.
 *
 * `sourceFile` is threaded through explicitly (rather than inferred) so
 * `NormalizedShipPackage.sourceMetadata` can record exactly which raw file
 * produced this package, regardless of how the Importer obtained it.
 */
export interface Normalizer {
  normalize(raw: RawRecord, sourceFile: string): NormalizedShipPackage | Promise<NormalizedShipPackage>
}
