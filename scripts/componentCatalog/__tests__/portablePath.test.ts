import { describe, it, expect } from 'vitest'
import { toPortableP4kLabel } from '../portablePath'

describe('toPortableP4kLabel — output path isolation', () => {
  it('reduces the real machine-specific LIVE path to a portable label', () => {
    const result = toPortableP4kLabel('C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k')
    expect(result).toBe('LIVE/Data.p4k')
  })

  it('does not leak a username or drive-specific segment', () => {
    const result = toPortableP4kLabel('C:\\Users\\SomePerson\\Games\\StarCitizen\\LIVE\\Data.p4k')
    expect(result).toBe('LIVE/Data.p4k')
    expect(result).not.toContain('SomePerson')
    expect(result).not.toContain('Users')
    expect(result).not.toContain('C:')
  })

  it('reflects a non-LIVE channel folder name if one is configured', () => {
    const result = toPortableP4kLabel('C:\\Program Files\\Roberts Space Industries\\StarCitizen\\PTU\\Data.p4k')
    expect(result).toBe('PTU/Data.p4k')
  })
})
