/**
 * Invokes the installed StarBreaker executable's `dcb query` subcommand
 * and parses its output.
 *
 * Exact-match policy: the filter passed to StarBreaker is always the full
 * record name (`EntityClassDefinition.<entityClass>`), never the bare
 * entity string. A bare substring filter (e.g. "Mount_Gimbal_S3") matches
 * every record that merely *contains* it (confirmed during Mission M-006
 * investigation — 12 collisions for that exact entity), which would
 * silently attach another ship's data to the wrong catalog key. The full
 * qualified name is unique by construction, so this is the only filter
 * form ever used here.
 */
import { spawnSync } from 'node:child_process'

export function buildExactRecordName(entityClass: string): string {
  return `EntityClassDefinition.${entityClass}`
}

export interface DcbQueryProcessResult {
  status: number | null
  stdout: string
  stderr: string
}

/** Runs `starbreaker dcb query EntityClassDefinition --p4k <p4k> --filter <exact record name>`. */
export function runDcbQuery(starbreakerExePath: string, dataP4kPath: string, entityClass: string): DcbQueryProcessResult {
  const filter = buildExactRecordName(entityClass)
  const result = spawnSync(starbreakerExePath, ['dcb', 'query', 'EntityClassDefinition', '--p4k', dataP4kPath, '--filter', filter], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  })

  if (result.error) {
    throw new Error(`Failed to execute StarBreaker at "${starbreakerExePath}": ${result.error.message}`)
  }

  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

export interface RawDcbRecordJson {
  _RecordName_: string
  _RecordId_: string
  _RecordTag_?: string
  _RecordValue_?: unknown
}

function isRawDcbRecordJson(value: unknown): value is RawDcbRecordJson {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { _RecordName_?: unknown })._RecordName_ === 'string' &&
    typeof (value as { _RecordId_?: unknown })._RecordId_ === 'string'
  )
}

export type DcbQueryOutcome = { kind: 'resolved'; record: RawDcbRecordJson } | { kind: 'not-found'; reason: string }

const NOT_FOUND_PATTERN = /no .* records matching filter/i
const MATCH_COUNT_PATTERN = /(\d+) record\(s\) matched\./m

/**
 * Turns a raw `dcb query` process result into an explicit outcome.
 * Throws — rather than guessing — on anything that isn't a clean
 * "exactly one match" or "zero matches" result: a non-zero exit that
 * isn't the known not-found message, an unparseable match-count line, an
 * ambiguous (>1) match count, or JSON that doesn't parse or lacks the
 * required record identity fields.
 */
export function parseDcbQueryResult(entityClass: string, result: DcbQueryProcessResult): DcbQueryOutcome {
  const exactName = buildExactRecordName(entityClass)

  if (result.status !== 0) {
    if (NOT_FOUND_PATTERN.test(result.stderr)) {
      return { kind: 'not-found', reason: `No DataCore record found for exact key "${exactName}".` }
    }
    throw new Error(`StarBreaker dcb query failed for "${entityClass}" (exit code ${result.status}): ${result.stderr.trim() || '(no stderr output)'}`)
  }

  const matchLine = MATCH_COUNT_PATTERN.exec(result.stderr)
  if (!matchLine) {
    throw new Error(`Malformed StarBreaker output for "${entityClass}": expected a "N record(s) matched." line in stderr.\nstderr: ${result.stderr}`)
  }
  const matchCount = Number(matchLine[1])

  if (matchCount === 0) {
    return { kind: 'not-found', reason: `No DataCore record found for exact key "${exactName}".` }
  }
  if (matchCount > 1) {
    throw new Error(
      `Ambiguous DataCore match for exact key "${exactName}": ${matchCount} records matched (expected exactly 1 with a full-name exact filter) — investigate before proceeding.`
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout)
  } catch (err) {
    throw new Error(`Malformed StarBreaker JSON output for "${entityClass}": ${(err as Error).message}`)
  }

  if (!isRawDcbRecordJson(parsed)) {
    throw new Error(`Malformed StarBreaker JSON output for "${entityClass}": missing required _RecordName_/_RecordId_ fields.`)
  }

  if (parsed._RecordName_ !== exactName) {
    throw new Error(`StarBreaker returned a mismatched record for "${entityClass}": expected "${exactName}", got "${parsed._RecordName_}".`)
  }

  return { kind: 'resolved', record: parsed }
}

export interface ItemDefinitionFields {
  category: string | null
  subtype: string | null
  size: number | null
  grade: number | null
  manufacturerRef: string | null
  localizationKey: string | null
}

const EMPTY_ITEM_DEFINITION_FIELDS: ItemDefinitionFields = {
  category: null,
  subtype: null,
  size: null,
  grade: null,
  manufacturerRef: null,
  localizationKey: null,
}

/**
 * Extracts `Type`/`SubType`/`Size`/`Grade`/`Manufacturer`/`Localization.Name`
 * from the first `Components[]` entry with an `AttachDef` object. Missing
 * fields are `null`, never guessed or defaulted to a placeholder — matches
 * every metadata rule in Mission M-007 (preserve DataCore taxonomy
 * verbatim, don't translate, don't infer).
 */
export function extractItemDefinitionFields(record: RawDcbRecordJson): ItemDefinitionFields {
  const recordValue = record._RecordValue_
  const components = recordValue && typeof recordValue === 'object' ? (recordValue as { Components?: unknown }).Components : undefined
  const list = Array.isArray(components) ? components : []

  for (const component of list) {
    const attachDef = component && typeof component === 'object' ? (component as { AttachDef?: unknown }).AttachDef : undefined
    if (attachDef && typeof attachDef === 'object') {
      const def = attachDef as Record<string, unknown>
      const localization = def.Localization
      const localizationName =
        localization && typeof localization === 'object' && typeof (localization as Record<string, unknown>).Name === 'string'
          ? ((localization as Record<string, unknown>).Name as string)
          : null

      return {
        category: typeof def.Type === 'string' ? def.Type : null,
        subtype: typeof def.SubType === 'string' ? def.SubType : null,
        size: typeof def.Size === 'number' ? def.Size : null,
        grade: typeof def.Grade === 'number' ? def.Grade : null,
        manufacturerRef: typeof def.Manufacturer === 'string' ? def.Manufacturer : null,
        localizationKey: localizationName,
      }
    }
  }

  return { ...EMPTY_ITEM_DEFINITION_FIELDS }
}
