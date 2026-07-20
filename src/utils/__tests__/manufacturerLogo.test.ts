import { describe, it, expect } from 'vitest'
import { resolveManufacturerLogo, canonicalManufacturerName, manufacturerMatchesQuery, manufacturerCodeFor, manufacturerNameForCode, manufacturerFullNameForCode } from '../manufacturerLogo'

describe('resolveManufacturerLogo (Alpha 2.5C, Part 10)', () => {
  it('normalizes known manufacturer aliases to their code', () => {
    expect(resolveManufacturerLogo('Anvil').code).toBe('ANVL')
    expect(resolveManufacturerLogo('Aegis Dynamics').code).toBe('AEGS')
    expect(resolveManufacturerLogo('Drake Interplanetary').code).toBe('DRAK')
    expect(resolveManufacturerLogo('RSI').code).toBe('RSI')
  })

  it('6. an unknown manufacturer falls back gracefully rather than throwing', () => {
    const result = resolveManufacturerLogo('Some New Shipyard')
    expect(result.code).toBeTruthy()
    expect(result.logoPath).toBeUndefined()
  })

  it('handles an empty string without throwing', () => {
    expect(() => resolveManufacturerLogo('')).not.toThrow()
    expect(resolveManufacturerLogo('').code).toBe('—')
  })

  it('every manufacturer currently resolves to the text fallback (no local logo assets shipped yet)', () => {
    expect(resolveManufacturerLogo('Anvil').logoPath).toBeUndefined()
  })
})

describe('EWO-051 — acronym brand names (RSI, MISC) keep their real casing, never titleCase\'d to "Rsi"/"Misc"', () => {
  // Found while certifying Add Ship search (Objective 6): manufacturerNameForCode
  // derives a manufacturer's short display name from its shortest known
  // alias, title-cased — correct for an ordinary word ("drake" -> "Drake")
  // but wrong for a real acronym brand whose shortest alias IS its own
  // code ("rsi" -> "Rsi", "misc" -> "Misc"), a genuine, live UI defect
  // (the Add Ship picker rendered every RSI ship as "— Rsi").
  it('manufacturerNameForCode("RSI") is "RSI", not "Rsi"', () => {
    expect(manufacturerNameForCode('RSI')).toBe('RSI')
  })

  it('manufacturerNameForCode("MISC") is "MISC", not "Misc"', () => {
    expect(manufacturerNameForCode('MISC')).toBe('MISC')
  })

  it('manufacturerFullNameForCode is unaffected — the long corporate names were already correctly cased', () => {
    expect(manufacturerFullNameForCode('RSI')).toBe('Roberts Space Industries')
    expect(manufacturerFullNameForCode('MISC')).toBe('Musashi Industrial & Starflight Concern')
  })

  it('an ordinary (non-acronym) manufacturer is unaffected — still normal title case', () => {
    expect(manufacturerNameForCode('DRAK')).toBe('Drake')
    expect(manufacturerNameForCode('GRIN')).toBe('Greycat')
  })
})

describe('EWO-051 (Manufacturer Integrity Initiative): canonicalManufacturerName — duplicate spellings collapse to one stored form', () => {
  it('every real duplicate spelling the Manufacturer Audit found collapses to the single canonical form', () => {
    expect(canonicalManufacturerName('Rsi')).toBe('RSI')
    expect(canonicalManufacturerName('RSI')).toBe('RSI')
    expect(canonicalManufacturerName('Roberts Space Industries')).toBe('RSI')
    expect(canonicalManufacturerName('Misc')).toBe('MISC')
    expect(canonicalManufacturerName('MISC')).toBe('MISC')
    expect(canonicalManufacturerName('Musashi Industrial & Starflight Concern')).toBe('MISC')
    expect(canonicalManufacturerName('Aegis')).toBe('Aegis')
    expect(canonicalManufacturerName('Aegis Dynamics')).toBe('Aegis')
    expect(canonicalManufacturerName('Anvil')).toBe('Anvil')
    expect(canonicalManufacturerName('Anvil Aerospace')).toBe('Anvil')
    expect(canonicalManufacturerName('Argo')).toBe('Argo')
    expect(canonicalManufacturerName('Argo Astronautics')).toBe('Argo')
    expect(canonicalManufacturerName('Crusader')).toBe('Crusader')
    expect(canonicalManufacturerName('Crusader Industries')).toBe('Crusader')
    expect(canonicalManufacturerName('Drake')).toBe('Drake')
    expect(canonicalManufacturerName('Drake Interplanetary')).toBe('Drake')
    expect(canonicalManufacturerName('Origin')).toBe('Origin')
    expect(canonicalManufacturerName('Origin Jumpworks')).toBe('Origin')
  })

  it('EWO-051 — the three previously-missing manufacturers (Greycat Industrial, Esperia, plus Banu/Kruger/Aopoa/Vanduul found during the fleet-wide cross-reference) all resolve to their real, full canonical corporate name — never the bare search shorthand', () => {
    expect(canonicalManufacturerName('Greycat')).toBe('Greycat Industrial')
    expect(canonicalManufacturerName('Greycat Industrial')).toBe('Greycat Industrial')
    expect(canonicalManufacturerName('Esperia')).toBe('Esperia')
    expect(canonicalManufacturerName('Banu')).toBe('Banu')
    expect(canonicalManufacturerName('Kruger')).toBe('Kruger Intergalactic')
    expect(canonicalManufacturerName('Kruger Intergalactic')).toBe('Kruger Intergalactic')
    expect(canonicalManufacturerName('Aopoa')).toBe('Aopoa')
    expect(canonicalManufacturerName('Vanduul')).toBe('Vanduul')
  })

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(canonicalManufacturerName('  rsi  ')).toBe('RSI')
    expect(canonicalManufacturerName('AEGIS DYNAMICS')).toBe('Aegis')
  })

  it('never fabricates a name for a genuinely unreviewed manufacturer — returns the trimmed input as-is, never blanked', () => {
    expect(canonicalManufacturerName('Some New Shipyard')).toBe('Some New Shipyard')
  })

  it('blank/undefined/"Unknown" all normalize to the literal "Unknown" sentinel, never an empty string', () => {
    expect(canonicalManufacturerName('')).toBe('Unknown')
    expect(canonicalManufacturerName(undefined)).toBe('Unknown')
    expect(canonicalManufacturerName(null)).toBe('Unknown')
    expect(canonicalManufacturerName('unknown')).toBe('Unknown')
  })

  it('every reviewed alias resolves to a real code AND a non-empty canonical name — no silent gap between the alias table and the canonical-name table', () => {
    for (const alias of [
      'anvil', 'aegis', 'drake', 'origin', 'misc', 'rsi', 'crusader', 'argo', 'gatac', 'mirai', 'tumbril',
      "grey's market", 'consolidated outland', 'greycat', 'esperia', 'banu', 'kruger', 'aopoa', 'vanduul',
    ]) {
      const code = manufacturerCodeFor(alias)
      expect(code, `alias "${alias}" should resolve to a code`).toBeTruthy()
      expect(canonicalManufacturerName(alias), `alias "${alias}" (code ${code}) should resolve to a real canonical name`).not.toBe(alias)
    }
  })
})

describe('EWO-051: manufacturerMatchesQuery — search certification (Objective 6)', () => {
  it('every certified search term resolves against its real canonical manufacturer', () => {
    expect(manufacturerMatchesQuery('RSI', 'RSI')).toBe(true)
    expect(manufacturerMatchesQuery('RSI', 'Roberts')).toBe(true)
    expect(manufacturerMatchesQuery('Greycat Industrial', 'Greycat')).toBe(true)
    expect(manufacturerMatchesQuery('Drake', 'Drake')).toBe(true)
    expect(manufacturerMatchesQuery('Origin', 'Origin')).toBe(true)
    expect(manufacturerMatchesQuery('MISC', 'Misc')).toBe(true)
    expect(manufacturerMatchesQuery('MISC', 'MISC')).toBe(true)
    expect(manufacturerMatchesQuery('Anvil', 'Anvil')).toBe(true)
    expect(manufacturerMatchesQuery('Aegis', 'Aegis')).toBe(true)
  })

  it('is case-insensitive and matches a partial query', () => {
    expect(manufacturerMatchesQuery('RSI', 'rob')).toBe(true)
    expect(manufacturerMatchesQuery('Greycat Industrial', 'grey')).toBe(true)
  })

  it('a query matching an unrelated manufacturer does not falsely match', () => {
    expect(manufacturerMatchesQuery('RSI', 'Drake')).toBe(false)
    expect(manufacturerMatchesQuery('Greycat Industrial', 'Esperia')).toBe(false)
  })

  it('an empty query matches everything (no filter applied)', () => {
    expect(manufacturerMatchesQuery('RSI', '')).toBe(true)
  })

  it('an unreviewed manufacturer still matches its own literal text (never throws, never silently excludes)', () => {
    expect(manufacturerMatchesQuery('Some New Shipyard', 'new shipyard')).toBe(true)
    expect(manufacturerMatchesQuery('Some New Shipyard', 'Drake')).toBe(false)
  })
})
