/**
 * `RawFileReader` — the I/O boundary `StarBreakerImporter` depends on,
 * injected rather than hardcoded. Keeps the importer itself environment-
 * agnostic (no direct `fs` usage, so it stays safe to import from browser
 * bundle code) while still doing real file I/O when given a Node-backed
 * reader (see scripts/importShips.ts for the concrete Node implementation).
 */
export interface RawFileReader {
  /** Lists every raw-data source path this reader can see. */
  listFiles(): Promise<string[]> | string[]
  /** Reads one source path's raw text content (unparsed JSON). */
  readFile(path: string): Promise<string> | string
}
