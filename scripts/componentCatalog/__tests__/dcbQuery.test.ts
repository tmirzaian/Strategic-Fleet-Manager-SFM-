import { describe, it, expect } from 'vitest'
import { buildExactRecordName, parseDcbQueryResult, extractItemDefinitionFields } from '../dcbQuery'
import type { DcbQueryProcessResult, RawDcbRecordJson } from '../dcbQuery'

const REGULUS_RECORD: RawDcbRecordJson = {
  _RecordName_: 'EntityClassDefinition.POWR_AEGS_S01_Regulus_SCItem',
  _RecordId_: '688aab9c-bc62-4774-be7d-065dee7e2187',
  _RecordTag_: 'SystemsDesign',
  _RecordValue_: {
    _Type_: 'EntityClassDefinition',
    Components: [
      {
        _Type_: 'SAttachableComponentParams',
        AttachDef: {
          _Type_: 'SItemDefinition',
          Type: 'PowerPlant',
          SubType: 'Power',
          Size: 1,
          Grade: 3,
          Manufacturer: 'file://.../scitemmanufacturer.aegs.json',
          Localization: { _Type_: 'SCItemLocalization', Name: '@item_NamePOWR_AEGS_S01_Regulus' },
        },
      },
    ],
  },
}

function processResult(overrides: Partial<DcbQueryProcessResult>): DcbQueryProcessResult {
  return { status: 0, stdout: '', stderr: '', ...overrides }
}

describe('buildExactRecordName', () => {
  it('prefixes with EntityClassDefinition.', () => {
    expect(buildExactRecordName('POWR_AEGS_S01_Regulus_SCItem')).toBe('EntityClassDefinition.POWR_AEGS_S01_Regulus_SCItem')
  })
})

describe('parseDcbQueryResult — exact record matching', () => {
  it('resolves a clean single-match result', () => {
    const result = processResult({
      stderr: '1 record(s) matched.\n',
      stdout: JSON.stringify(REGULUS_RECORD),
    })
    const outcome = parseDcbQueryResult('POWR_AEGS_S01_Regulus_SCItem', result)
    expect(outcome.kind).toBe('resolved')
    if (outcome.kind === 'resolved') {
      expect(outcome.record._RecordId_).toBe('688aab9c-bc62-4774-be7d-065dee7e2187')
    }
  })

  it('throws if StarBreaker returns a record whose name does not match the requested exact key', () => {
    const mismatched = { ...REGULUS_RECORD, _RecordName_: 'EntityClassDefinition.SomethingElse' }
    const result = processResult({ stderr: '1 record(s) matched.\n', stdout: JSON.stringify(mismatched) })
    expect(() => parseDcbQueryResult('POWR_AEGS_S01_Regulus_SCItem', result)).toThrow(/mismatched record/)
  })
})

describe('parseDcbQueryResult — rejection of substring collisions', () => {
  it('throws "ambiguous" when the match count is greater than one', () => {
    const result = processResult({ stderr: '12 record(s) matched.\n', stdout: '' })
    expect(() => parseDcbQueryResult('Mount_Gimbal_S3', result)).toThrow(/Ambiguous DataCore match/)
  })
})

describe('parseDcbQueryResult — malformed StarBreaker output', () => {
  it('throws when stderr has no recognizable match-count line', () => {
    const result = processResult({ stderr: 'unexpected output with no count line\n', stdout: '{}' })
    expect(() => parseDcbQueryResult('X', result)).toThrow(/Malformed StarBreaker output/)
  })

  it('throws when stdout is not valid JSON', () => {
    const result = processResult({ stderr: '1 record(s) matched.\n', stdout: '{ not valid json' })
    expect(() => parseDcbQueryResult('X', result)).toThrow(/Malformed StarBreaker JSON output/)
  })

  it('throws when stdout JSON is missing required record identity fields', () => {
    const result = processResult({ stderr: '1 record(s) matched.\n', stdout: JSON.stringify({ foo: 'bar' }) })
    expect(() => parseDcbQueryResult('X', result)).toThrow(/missing required _RecordName_\/_RecordId_/)
  })

  it('throws on an unexpected non-zero exit that is not the known not-found message', () => {
    const result = processResult({ status: 2, stderr: 'thread panicked: p4k open failed', stdout: '' })
    expect(() => parseDcbQueryResult('X', result)).toThrow(/dcb query failed/)
  })
})

describe('parseDcbQueryResult — unresolved entity handling', () => {
  it('returns not-found for the documented "no ... records matching filter" message with a non-zero exit', () => {
    const result = processResult({ status: 1, stderr: 'error: no EntityClassDefinition records matching filter: EntityClassDefinition.Nonexistent_Item\n' })
    const outcome = parseDcbQueryResult('Nonexistent_Item', result)
    expect(outcome.kind).toBe('not-found')
    if (outcome.kind === 'not-found') {
      expect(outcome.reason).toContain('EntityClassDefinition.Nonexistent_Item')
    }
  })

  it('returns not-found for an explicit zero match count on a clean exit', () => {
    const result = processResult({ status: 0, stderr: '0 record(s) matched.\n' })
    const outcome = parseDcbQueryResult('Nonexistent_Item', result)
    expect(outcome.kind).toBe('not-found')
  })
})

describe('extractItemDefinitionFields', () => {
  it('extracts Type/SubType/Size/Grade/Manufacturer/Localization.Name from Components[].AttachDef', () => {
    const fields = extractItemDefinitionFields(REGULUS_RECORD)
    expect(fields).toEqual({
      category: 'PowerPlant',
      subtype: 'Power',
      size: 1,
      grade: 3,
      manufacturerRef: 'file://.../scitemmanufacturer.aegs.json',
      localizationKey: '@item_NamePOWR_AEGS_S01_Regulus',
    })
  })

  it('returns all nulls, not guessed values, when there is no AttachDef component', () => {
    const record: RawDcbRecordJson = { _RecordName_: 'EntityClassDefinition.X', _RecordId_: 'guid', _RecordValue_: { Components: [] } }
    expect(extractItemDefinitionFields(record)).toEqual({
      category: null,
      subtype: null,
      size: null,
      grade: null,
      manufacturerRef: null,
      localizationKey: null,
    })
  })

  it('returns all nulls when _RecordValue_ is missing entirely', () => {
    const record: RawDcbRecordJson = { _RecordName_: 'EntityClassDefinition.X', _RecordId_: 'guid' }
    expect(extractItemDefinitionFields(record).category).toBeNull()
  })
})
