import type { Importer, RawRecord } from './interfaces'
import type { RawFileReader } from './rawFileReader'
import { stripTrailingCommas } from './trailingCommaJson'

/**
 * `StarBreakerImporter` — the generalized replacement for the Gladius
 * proof-of-concept's `GladiusImporter`. Nothing here is ship-specific:
 * it lists and reads whatever raw-data sources its injected `RawFileReader`
 * exposes, and hands back parsed-but-unvalidated JSON as `RawRecord`
 * (`unknown`) — same as the original Importer contract. The Normalizer
 * remains the stage responsible for narrowing that shape.
 *
 * Data-driven, not name-driven: this class has no knowledge of "Gladius"
 * or any other specific ship. What it imports is entirely determined by
 * what `RawFileReader.listFiles()` returns.
 */
export class StarBreakerImporter implements Importer {
  constructor(private reader: RawFileReader) {}

  async listSources(): Promise<string[]> {
    return this.reader.listFiles()
  }

  async read(sourcePath: string): Promise<RawRecord> {
    const text = await this.reader.readFile(sourcePath)
    try {
      return JSON.parse(text)
    } catch (strictErr) {
      // Some StarBreaker `--dump-hierarchy` builds emit a trailing comma
      // after the last element of every array/object — JSON5-legal, but
      // not strict JSON. Retry once with those commas stripped before
      // giving up, so a genuine export isn't rejected over a formatting
      // quirk while a truly malformed file still fails loudly.
      try {
        return JSON.parse(stripTrailingCommas(text))
      } catch {
        throw new Error(`StarBreakerImporter: "${sourcePath}" is not valid JSON (${(strictErr as Error).message}).`)
      }
    }
  }
}
