import { describe, it, expect } from 'vitest'
import { exactCompareKey, normalizedCompareKey } from '../nameNormalization'

describe('normalizedCompareKey — EWO-038 (Task 4/11)', () => {
  it('folds a precomposed Unicode diacritic (San\'tok.yāi) to its plain-letter equivalent', () => {
    expect(normalizedCompareKey("San'tok.yāi")).toBe(normalizedCompareKey("San'Tok.yai"))
  })

  it('collapses repeated/irregular whitespace (a known double-space catalog typo)', () => {
    expect(normalizedCompareKey('RSI Aurora Mk I  LX')).toBe(normalizedCompareKey('RSI Aurora Mk I LX'))
  })

  it('is case-insensitive', () => {
    expect(normalizedCompareKey('GHOST')).toBe(normalizedCompareKey('ghost'))
  })

  it('strips the known Argo CSV-SM literal backslash-n display-name artifact', () => {
    expect(normalizedCompareKey('Argo CSV-SM\\n')).toBe(normalizedCompareKey('Argo CSV-SM'))
  })

  it('never touches hyphens or other real punctuation within a name', () => {
    expect(normalizedCompareKey('F7C-S Hornet Ghost Mk II')).toBe('f7c-s hornet ghost mk ii')
  })
})

describe('exactCompareKey — EWO-038 (Task 4/11)', () => {
  it('trims but does not case-fold or otherwise normalize', () => {
    expect(exactCompareKey('  Ghost  ')).toBe('Ghost')
    expect(exactCompareKey('Ghost')).not.toBe(exactCompareKey('ghost'))
  })
})
