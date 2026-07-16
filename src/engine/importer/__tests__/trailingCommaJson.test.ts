import { describe, it, expect } from 'vitest'
import { stripTrailingCommas } from '../trailingCommaJson'

describe('stripTrailingCommas', () => {
  it('removes a trailing comma before a closing array bracket', () => {
    const input = '[1, 2, 3,]'
    expect(JSON.parse(stripTrailingCommas(input))).toEqual([1, 2, 3])
  })

  it('removes a trailing comma before a closing object brace', () => {
    const input = '{"a": 1, "b": 2,}'
    expect(JSON.parse(stripTrailingCommas(input))).toEqual({ a: 1, b: 2 })
  })

  it('removes trailing commas across nested structures', () => {
    const input = '{"list": [{"a": 1,},{"b": 2,},],}'
    expect(JSON.parse(stripTrailingCommas(input))).toEqual({ list: [{ a: 1 }, { b: 2 }] })
  })

  it('does not touch a comma that sits inside a string value, even if followed by a bracket-like character', () => {
    const input = '{"path": "objects/foo,]bar.cga", "n": 1}'
    const result = stripTrailingCommas(input)
    expect(JSON.parse(result)).toEqual({ path: 'objects/foo,]bar.cga', n: 1 })
  })

  it('preserves escaped quotes inside strings while scanning', () => {
    const input = '{"label": "a \\"quoted\\" value,", "n": 1,}'
    const result = stripTrailingCommas(input)
    expect(JSON.parse(result)).toEqual({ label: 'a "quoted" value,', n: 1 })
  })

  it('is a no-op for already-valid JSON with no trailing commas', () => {
    const input = '{"a": [1, 2, 3], "b": {"c": true}}'
    expect(stripTrailingCommas(input)).toBe(input)
  })
})
