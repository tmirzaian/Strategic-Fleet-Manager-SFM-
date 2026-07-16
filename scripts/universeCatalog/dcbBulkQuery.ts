/**
 * Bulk DataCore field extraction (Mission M-012 Universe Provisioning).
 *
 * The M-007 generator (see scripts/componentCatalog/dcbQuery.ts) queries one
 * exact entity at a time — correct for a closed set of ~90 entities, but
 * launching StarBreaker once per record does not scale to the full
 * ship/vehicle or component universe (hundreds to tens of thousands of
 * records).
 *
 * StarBreaker's `dcb query` supports a polymorphic property-path form —
 * `EntityClassDefinition.Components[SomeComponentType].someField` — that
 * extracts a single field across every EntityClassDefinition record that
 * has that component, in one process invocation, emitting one
 * tab-separated `<RecordName>\t<value>` line per match. Confirmed against
 * the real frozen LIVE 4.8 P4K: a single such query resolves in ~3.5s
 * regardless of whether it matches ~1 or ~25,000 records — this is the
 * "safe batch or bulk extraction path" the mission calls for, replacing
 * thousands of per-record spawns with a handful of bulk field queries
 * joined client-side by entity class name.
 */
import { spawnSync } from 'node:child_process'

const ENTITY_CLASS_PREFIX = 'EntityClassDefinition.'

export interface BulkFieldQueryResult {
  /** Bare entity class name (prefix stripped) -> raw value string for this field. */
  values: Map<string, string>
  matchCount: number
}

const MATCH_COUNT_PATTERN = /(\d+) record\(s\) matched\./m

/**
 * Runs `starbreaker dcb query <propertyPath> --p4k <p4k>` and parses its
 * tab-separated stdout into a Map keyed by bare entity class name. Scalar
 * values (strings, numbers, booleans) come back as plain text; object/array
 * values come back as a single-line JSON blob — callers that expect a
 * nested value should `JSON.parse` it themselves (see manufacturerResolver.ts).
 *
 * A field legitimately absent on a given entity (e.g. an optional property)
 * simply produces no line for that entity — never a placeholder — so a
 * missing key in the returned Map means "no value", not "empty string".
 */
export function runBulkFieldQuery(starbreakerExePath: string, dataP4kPath: string, propertyPath: string): BulkFieldQueryResult {
  const result = spawnSync(starbreakerExePath, ['dcb', 'query', propertyPath, '--p4k', dataP4kPath], {
    encoding: 'utf-8',
    maxBuffer: 512 * 1024 * 1024,
  })

  if (result.error) {
    throw new Error(`Failed to execute StarBreaker at "${starbreakerExePath}": ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`StarBreaker bulk query failed for "${propertyPath}" (exit code ${result.status}): ${(result.stderr ?? '').trim() || '(no stderr output)'}`)
  }

  const matchLine = MATCH_COUNT_PATTERN.exec(result.stderr ?? '')
  if (!matchLine) {
    throw new Error(`Malformed StarBreaker output for "${propertyPath}": expected a "N record(s) matched." line in stderr.\nstderr: ${result.stderr}`)
  }
  const matchCount = Number(matchLine[1])

  const values = new Map<string, string>()
  const stdout = result.stdout ?? ''
  if (stdout.length > 0) {
    for (const line of stdout.split('\n')) {
      const trimmed = line.replace(/\r$/, '')
      if (!trimmed) continue
      const tabIndex = trimmed.indexOf('\t')
      if (tabIndex === -1) continue
      const rawName = trimmed.slice(0, tabIndex)
      const value = trimmed.slice(tabIndex + 1)
      const entityClass = rawName.startsWith(ENTITY_CLASS_PREFIX) ? rawName.slice(ENTITY_CLASS_PREFIX.length) : rawName
      values.set(entityClass, value)
    }
  }

  return { values, matchCount }
}

/** Parses a bulk-query numeric field value; returns null for missing/unparseable input. */
export function parseBulkNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Parses a bulk-query JSON-object field value; returns null for missing/unparseable input. */
export function parseBulkJson<T>(raw: string | undefined): T | null {
  if (raw === undefined) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
