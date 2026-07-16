import { describe, it, expect } from 'vitest'
import { checkIdentity, parseExportText } from '../identityCheck'

const validExport = JSON.stringify({ root: { entity: 'EntityClassDefinition.AEGS_Sabre', geometry: 'x.cga' }, root_nmc: [] })

describe('GF-002B (Task 4): exact-entity match protection', () => {
  it('accepts an export whose declared entity matches the requested entity id exactly', () => {
    const result = checkIdentity('AEGS_Sabre', validExport)
    expect(result.ok).toBe(true)
    expect(result.observedEntityId).toBe('AEGS_Sabre')
  })

  it('rejects an export whose declared entity differs from the requested id — the substring-match misexport case', () => {
    const misexport = JSON.stringify({ root: { entity: 'EntityClassDefinition.AEGS_Sabre_Comet' }, root_nmc: [] })
    const result = checkIdentity('AEGS_Sabre', misexport)
    expect(result.ok).toBe(false)
    expect(result.observedEntityId).toBe('AEGS_Sabre_Comet')
    expect(result.reason).toContain('AEGS_Sabre_Comet')
  })

  it('a successful process exit alone is not evaluated here — this only ever inspects file content, never an exit code', () => {
    // No exit code parameter exists on checkIdentity's signature at all —
    // this test documents that guarantee structurally.
    expect(checkIdentity.length).toBe(2)
  })

  it('rejects a file with no resolvable entity envelope at all', () => {
    const result = checkIdentity('AEGS_Sabre', JSON.stringify({ foo: 'bar' }))
    expect(result.ok).toBe(false)
    expect(result.observedEntityId).toBeNull()
  })

  it('rejects genuinely unparseable content, even after the trailing-comma fallback', () => {
    const result = checkIdentity('AEGS_Sabre', '{not json at all')
    expect(result.ok).toBe(false)
    expect(result.observedEntityId).toBeNull()
  })

  it('accepts trailing-comma JSON (a known StarBreaker --dump-hierarchy quirk) via the same fallback the real importer uses', () => {
    const trailingCommaExport = '{"root": {"entity": "EntityClassDefinition.ANVL_Valkyrie",},"root_nmc": [],}'
    const result = checkIdentity('ANVL_Valkyrie', trailingCommaExport)
    expect(result.ok).toBe(true)
  })

  it('parseExportText reports whether the trailing-comma fallback was needed', () => {
    expect(parseExportText(validExport).usedTrailingCommaFallback).toBe(false)
    expect(parseExportText('{"root": {"entity": "EntityClassDefinition.X",}}').usedTrailingCommaFallback).toBe(true)
  })

  it('accepts the legacy top-level entity envelope, not only root.entity', () => {
    const legacyExport = JSON.stringify({ entity: { className: 'EntityClassDefinition.DRAK_Corsair' } })
    const result = checkIdentity('DRAK_Corsair', legacyExport)
    expect(result.ok).toBe(true)
    expect(result.observedEntityId).toBe('DRAK_Corsair')
  })
})
