import { describe, it, expect, vi } from 'vitest'

/**
 * EWO-104 Amendment 3 (Part D) — "what am I actually hunting?" The real
 * generated component catalog is large/regenerated data, not a stable
 * hand-authored fixture (matching this repo's own established practice
 * elsewhere in this session for exactly this reason) — mocked here with a
 * small, fully controlled fixture so the FORMATTING logic is tested in
 * isolation from real catalog contents.
 */
vi.mock('../../generated/componentCatalog', () => ({
  resolveComponentByEntityClass: (entityClass: string) => {
    if (entityClass === 'SHIELD_EC') {
      return { status: 'resolved', record: { entityClass, category: 'Shield', subtype: null, size: 2, displayName: 'Bulwark', grade: 1, manufacturerCode: 'AEG', classification: 'Industrial', vesselBoundTags: [] } }
    }
    if (entityClass === 'WEAPON_EC') {
      return { status: 'resolved', record: { entityClass, category: 'WeaponGun', subtype: 'Gun', size: 2, displayName: 'CF-227 Badger', grade: 1, manufacturerCode: 'KLWE', classification: 'Ballistic Repeater', vesselBoundTags: [] } }
    }
    if (entityClass === 'NO_CLASSIFICATION_EC') {
      return { status: 'resolved', record: { entityClass, category: 'PowerPlant', subtype: 'Power', size: 3, displayName: 'Thermax', grade: 1, manufacturerCode: null, classification: null, vesselBoundTags: [] } }
    }
    if (entityClass === 'AMBIGUOUS_EC') {
      return { status: 'ambiguous', candidates: [] }
    }
    return { status: 'unresolved' }
  },
  resolveComponentByName: (displayName: string) => {
    if (displayName === 'Bulwark') {
      return { status: 'resolved', record: { entityClass: 'SHIELD_EC', category: 'Shield', subtype: null, size: 2, displayName, grade: 1, manufacturerCode: 'AEG', classification: 'Industrial', vesselBoundTags: [] } }
    }
    return { status: 'unresolved' }
  },
}))

const { describeComponentIdentity } = await import('../flightCommanderComponentIdentity')

describe('describeComponentIdentity', () => {
  it('formats a non-weapon component as "S{size} {Category} • {classification}"', () => {
    expect(describeComponentIdentity('Bulwark', 'SHIELD_EC', 'Shield')).toBe('S2 Shield • Industrial')
  })

  it('formats a weapon component as "S{size} {classification}", omitting the redundant category word', () => {
    expect(describeComponentIdentity('CF-227 Badger', 'WEAPON_EC', 'Weapon')).toBe('S2 Ballistic Repeater')
  })

  it('omits the classification segment entirely when the catalog has none, never fabricating one', () => {
    expect(describeComponentIdentity('Thermax', 'NO_CLASSIFICATION_EC', 'PowerPlant')).toBe('S3 Power Plant')
  })

  it('falls back to entityClass-first resolution, preferring it over the name fallback', () => {
    expect(describeComponentIdentity('Bulwark', 'SHIELD_EC', 'Shield')).toBe('S2 Shield • Industrial')
  })

  it('falls back to name resolution when no entityClass is available', () => {
    expect(describeComponentIdentity('Bulwark', null, 'Shield')).toBe('S2 Shield • Industrial')
  })

  it('returns undefined for an ambiguous catalog match — never a guessed/broken line', () => {
    expect(describeComponentIdentity('Something', 'AMBIGUOUS_EC', 'Shield')).toBeUndefined()
  })

  it('returns undefined for an unresolved component — never a guessed/broken line', () => {
    expect(describeComponentIdentity('Unknown Widget', 'NOPE_EC', 'Shield')).toBeUndefined()
  })
})
