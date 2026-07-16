import { describe, it, expect } from 'vitest'
import { parseBulkNumber, parseBulkJson } from '../dcbBulkQuery'

describe('Mission M-012: dcbBulkQuery value parsers', () => {
  it('parseBulkNumber parses a numeric bulk-query value', () => {
    expect(parseBulkNumber('5')).toBe(5)
    expect(parseBulkNumber('1.5')).toBe(1.5)
  })

  it('parseBulkNumber returns null for missing or unparseable values — never a guessed default', () => {
    expect(parseBulkNumber(undefined)).toBeNull()
    expect(parseBulkNumber('not-a-number')).toBeNull()
  })

  it('parseBulkJson parses a JSON-object bulk-query value', () => {
    expect(parseBulkJson<{ x: number }>('{"x":1}')).toEqual({ x: 1 })
  })

  it('parseBulkJson returns null for missing or malformed JSON', () => {
    expect(parseBulkJson(undefined)).toBeNull()
    expect(parseBulkJson('not json')).toBeNull()
  })
})
