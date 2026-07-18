import { describe, it, expect } from 'vitest'
import { resolveComponentIdentity } from '../componentIdentityService'

describe('EWO-STAB-003B: ComponentIdentityService', () => {
  it('1. resolves a hand-authored override-table component by display name — category/size present, entityClass null (the table predates entity-class tracking)', () => {
    const identity = resolveComponentIdentity({ displayName: 'Slipstream' })
    expect(identity).toEqual({ displayName: 'Slipstream', entityClass: null, category: 'Power Plant', size: 1 })
  })

  it('2. resolves a real generated-catalog component by display name, including its entityClass', () => {
    const identity = resolveComponentIdentity({ displayName: 'RS-Barrier' })
    expect(identity).toEqual({ displayName: 'RS-Barrier', entityClass: 'SHLD_AEGS_S04_Reclaimer_SCItem', category: 'Shield', size: 4 })
  })

  it('3. resolves the same component starting from its entityClass — round-trips to the identical identity', () => {
    const identity = resolveComponentIdentity({ entityClass: 'SHLD_AEGS_S04_Reclaimer_SCItem' })
    expect(identity).toEqual({ displayName: 'RS-Barrier', entityClass: 'SHLD_AEGS_S04_Reclaimer_SCItem', category: 'Shield', size: 4 })
  })

  it('4. an uncataloged display name resolves with null category/size/entityClass — never a guess (EWO-024 fallback, unchanged)', () => {
    const identity = resolveComponentIdentity({ displayName: 'Some Completely Unknown Component' })
    expect(identity).toEqual({ displayName: 'Some Completely Unknown Component', entityClass: null, category: null, size: null })
  })

  it('5. an unresolvable entityClass (no catalog presentation) resolves to null — never fabricated', () => {
    const identity = resolveComponentIdentity({ entityClass: 'NOT_A_REAL_ENTITY_CLASS' })
    expect(identity).toBeNull()
  })

  it("6. an empty string resolves to null (no component at all), matching validateTargetCompatibility's own guard", () => {
    expect(resolveComponentIdentity({ displayName: '' })).toBeNull()
    expect(resolveComponentIdentity({ displayName: '   ' })).toBeNull()
  })

  it('7. the existing "—" no-item sentinel resolves to null, same as an empty string', () => {
    expect(resolveComponentIdentity({ displayName: '—' })).toBeNull()
  })

  it('8. leading/trailing whitespace is trimmed in the resolved displayName', () => {
    const identity = resolveComponentIdentity({ displayName: '  Slipstream  ' })
    expect(identity?.displayName).toBe('Slipstream')
  })
})
