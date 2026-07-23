import { describe, it, expect } from 'vitest'
import { buildGlobalTagIndex, resolveSwapGroup } from '../swapGroupResolver'

describe('buildGlobalTagIndex', () => {
  it('tokenizes whitespace-separated tags and inverts to tag -> entityClass[]', () => {
    const tagsByEntityClass = new Map([
      ['ANVL_A', 'flightReady $ANVL_Hornet_Mk2_Center'],
      ['ANVL_B', 'flightReady $ANVL_Hornet_Mk2_Center'],
      ['ANVL_C', 'flightReady'],
    ])
    const index = buildGlobalTagIndex(tagsByEntityClass)
    expect(index.get('$ANVL_Hornet_Mk2_Center')).toEqual(['ANVL_A', 'ANVL_B'])
    expect(index.get('flightReady')).toEqual(['ANVL_A', 'ANVL_B', 'ANVL_C'])
  })

  it('never lists the same entity class twice for one tag', () => {
    const tagsByEntityClass = new Map([['ANVL_A', 'foo foo']])
    const index = buildGlobalTagIndex(tagsByEntityClass)
    expect(index.get('foo')).toEqual(['ANVL_A'])
  })
})

describe('resolveSwapGroup — the flightReady false-positive fix (live-proven bug)', () => {
  /** Real data confirmed during SW-010A Objective 6 validation:
   * `UMNT_ANVL_S5_Cap_Mk2`'s real Tags string is
   * `"flightReady $ANVL_Hornet_Mk2_Center"`. `flightReady` is a generic
   * operational-status tag shared by 1,731 unrelated entities fleet-wide;
   * `$ANVL_Hornet_Mk2_Center` is the real, narrow swap-group tag. A
   * "first token wins" tie-break silently picked the former every time.
   * This test locks in the fix: smallest global membership wins. */
  it('prefers the narrowly-scoped tag over a generic, near-universal one that happens to come first', () => {
    const tagsByEntityClass = new Map([
      ['UMNT_ANVL_S5_Cap_Mk2', 'flightReady $ANVL_Hornet_Mk2_Center'],
      ['ANVL_Hornet_F7A_Ball_Turret', 'flightReady $ANVL_Hornet_Mk2_Center'],
      // three more entities carrying only the generic tag, standing in for
      // the real 1,731-member "flightReady" population
      ['Unrelated_A', 'flightReady'],
      ['Unrelated_B', 'flightReady'],
      ['Unrelated_C', 'flightReady'],
    ])
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    const knownCatalogEntityClasses = new Set(tagsByEntityClass.keys())

    const result = resolveSwapGroup({ defaultEntityClass: 'UMNT_ANVL_S5_Cap_Mk2', knownCatalogEntityClasses }, tagsByEntityClass, globalIndex)

    expect(result?.swapGroupId).toBe('$ANVL_Hornet_Mk2_Center')
    expect(result?.eligibleComponents.sort()).toEqual(['ANVL_Hornet_F7A_Ball_Turret', 'UMNT_ANVL_S5_Cap_Mk2'])
  })

  it('records a swap-group-shared-across-slots diagnostic when a default carries more than one qualifying tag', () => {
    const tagsByEntityClass = new Map([
      ['UMNT_ANVL_S5_Cap_Mk2', 'flightReady $ANVL_Hornet_Mk2_Center'],
      ['ANVL_Hornet_F7A_Ball_Turret', 'flightReady $ANVL_Hornet_Mk2_Center'],
      ['Unrelated_A', 'flightReady'],
    ])
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    const knownCatalogEntityClasses = new Set(tagsByEntityClass.keys())

    const result = resolveSwapGroup({ defaultEntityClass: 'UMNT_ANVL_S5_Cap_Mk2', knownCatalogEntityClasses }, tagsByEntityClass, globalIndex)
    expect(result?.diagnostics.some((d) => d.code === 'swap-group-shared-across-slots')).toBe(true)
  })

  it('falls back to raw Tags string order when two qualifying tags are tied at the smallest membership', () => {
    const tagsByEntityClass = new Map([
      ['A', 'tagOne tagTwo'],
      ['B', 'tagOne'],
      ['C', 'tagTwo'],
    ])
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    const knownCatalogEntityClasses = new Set(tagsByEntityClass.keys())
    const result = resolveSwapGroup({ defaultEntityClass: 'A', knownCatalogEntityClasses }, tagsByEntityClass, globalIndex)
    // both tagOne and tagTwo have exactly 2 members each — tied; "tagOne" appears first in "A"'s raw Tags string
    expect(result?.swapGroupId).toBe('tagOne')
  })
})

/** Builds a synthetic tag map where `tag` is carried by `memberCount`
 * distinct entities (including `defaultEntityClass`), standing in for a
 * generic gameplay/system tag at an arbitrary scale — used to test the
 * plausibility ceiling without hand-listing hundreds of map entries. */
function buildTagPopulation(defaultEntityClass: string, tag: string, memberCount: number): Map<string, string> {
  const map = new Map<string, string>()
  map.set(defaultEntityClass, tag)
  for (let i = 1; i < memberCount; i++) map.set(`Population_Member_${i}`, tag)
  return map
}

describe('resolveSwapGroup — the fleet-wide membership-ceiling fix (SW-010B live-proven bug)', () => {
  /** Real data confirmed during the SW-010B 257-ship fleet sweep: when a
   * default component's ONLY qualifying tag is a generic, near-universal
   * one (no narrower alternative tag present at all on that component),
   * the smallest-membership tie-break has nothing to prefer it over — it
   * wins by default, exactly like `flightReady` did 2,901 times across
   * the real fleet before this fix (and 8 other generic tags:
   * `Ship_Dock_Refuel`, `Helmet`, `weaponMountUsable`, `gimbalMount`,
   * `miningMount`, `webcustom`, `LaserCannon`, `Station_Dock_Large`).
   * This test locks in the fix: a tag whose global membership exceeds the
   * plausibility ceiling is rejected outright, even as a sole candidate. */
  it('rejects an implausibly large tag even when it is the ONLY qualifying tag on the default component', () => {
    const tagsByEntityClass = buildTagPopulation('Some_Default', 'genericGameplayTag', 50)
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    const knownCatalogEntityClasses = new Set(tagsByEntityClass.keys())
    const result = resolveSwapGroup({ defaultEntityClass: 'Some_Default', knownCatalogEntityClasses }, tagsByEntityClass, globalIndex)
    expect(result).toBeNull()
  })

  it('still resolves a real, narrowly-scoped tag whose membership sits within the plausible range', () => {
    const tagsByEntityClass = buildTagPopulation('Some_Default', 'realSwapGroupTag', 7)
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    const knownCatalogEntityClasses = new Set(tagsByEntityClass.keys())
    const result = resolveSwapGroup({ defaultEntityClass: 'Some_Default', knownCatalogEntityClasses }, tagsByEntityClass, globalIndex)
    expect(result?.swapGroupId).toBe('realSwapGroupTag')
    expect(result?.eligibleComponents).toHaveLength(7)
  })
})

describe('resolveSwapGroup — no qualifying tag', () => {
  it('returns null when the default has no tags at all', () => {
    const tagsByEntityClass = new Map<string, string>()
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    const result = resolveSwapGroup({ defaultEntityClass: 'ANVL_F7_Mk2_NoseCap', knownCatalogEntityClasses: new Set() }, tagsByEntityClass, globalIndex)
    expect(result).toBeNull()
  })

  it('returns null when every one of the default\'s tags is unique to itself (no co-membership)', () => {
    const tagsByEntityClass = new Map([['A', 'onlyMineTag']])
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    const result = resolveSwapGroup({ defaultEntityClass: 'A', knownCatalogEntityClasses: new Set(['A']) }, tagsByEntityClass, globalIndex)
    expect(result).toBeNull()
  })
})

describe('resolveSwapGroup — duplicate and existence handling', () => {
  it('excludes a tag member that is not in the known catalog (dead/unresolved reference)', () => {
    const tagsByEntityClass = new Map([
      ['A', 'sharedTag'],
      ['B', 'sharedTag'],
    ])
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    // "B" is not in the known catalog set — simulating an entity SFM's own catalog doesn't currently recognize
    const result = resolveSwapGroup({ defaultEntityClass: 'A', knownCatalogEntityClasses: new Set(['A']) }, tagsByEntityClass, globalIndex)
    expect(result?.eligibleComponents).toEqual(['A'])
    expect(result?.diagnostics.some((d) => d.code === 'swap-group-unresolved-reference')).toBe(true)
  })

  it('treats a group as unresolved when the default itself is excluded from its own eligible set', () => {
    const tagsByEntityClass = new Map([
      ['A', 'sharedTag'],
      ['B', 'sharedTag'],
    ])
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    // "A" (the default) is deliberately missing from knownCatalogEntityClasses
    const result = resolveSwapGroup({ defaultEntityClass: 'A', knownCatalogEntityClasses: new Set(['B']) }, tagsByEntityClass, globalIndex)
    expect(result?.confidence).toBe('unresolved')
    expect(result?.eligibleComponents).toEqual([])
    expect(result?.diagnostics.some((d) => d.code === 'swap-group-default-not-self-member')).toBe(true)
  })

  it('marks a single-member resolution (no captured alternative) as informational, still tag-co-membership', () => {
    const tagsByEntityClass = new Map([
      ['A', 'sharedTag'],
      ['B', 'sharedTag'],
    ])
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    // Only "A" is known — "B" gets excluded by the existence cross-check, leaving A alone
    const result = resolveSwapGroup({ defaultEntityClass: 'A', knownCatalogEntityClasses: new Set(['A']) }, tagsByEntityClass, globalIndex)
    expect(result?.eligibleComponents).toEqual(['A'])
    expect(result?.confidence).toBe('tag-co-membership')
    expect(result?.diagnostics.some((d) => d.code === 'swap-group-single-member')).toBe(true)
  })
})

describe('resolveSwapGroup — no ship-specific branching', () => {
  it('resolves identically for arbitrary synthetic entity/tag names, proving no hull name or manufacturer code is hard-coded anywhere in the resolution path', () => {
    const tagsByEntityClass = new Map([
      ['Widget_Alpha', 'genericStatus $Totally_Synthetic_Swap_Group'],
      ['Widget_Beta', 'genericStatus $Totally_Synthetic_Swap_Group'],
      ['Widget_Gamma', 'genericStatus'],
      ['Widget_Delta', 'genericStatus'],
    ])
    const globalIndex = buildGlobalTagIndex(tagsByEntityClass)
    const result = resolveSwapGroup({ defaultEntityClass: 'Widget_Alpha', knownCatalogEntityClasses: new Set(tagsByEntityClass.keys()) }, tagsByEntityClass, globalIndex)
    expect(result?.swapGroupId).toBe('$Totally_Synthetic_Swap_Group')
    expect(result?.eligibleComponents.sort()).toEqual(['Widget_Alpha', 'Widget_Beta'])
  })
})
