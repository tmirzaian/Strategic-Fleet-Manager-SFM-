import type { Importer, RawRecord } from './interfaces'
import type { RawFileReader } from './rawFileReader'

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
    } catch (err) {
      throw new Error(`StarBreakerImporter: "${sourcePath}" is not valid JSON (${(err as Error).message}).`)
    }
  }
}
