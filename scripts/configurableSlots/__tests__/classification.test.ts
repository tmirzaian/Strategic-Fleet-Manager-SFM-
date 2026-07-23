import { describe, it, expect } from 'vitest'
import { classifySlot, computePortSpansPerGroup, CONFIRMED_SWAP_GROUP_IDS, MAX_CONFIRMED_PORT_SPAN_PER_HULL } from '../classification'
import type { ConfigurableSlot } from '../types'

function slot(overrides: Partial<ConfigurableSlot> & { portName: string }): ConfigurableSlot {
  return {
    parentPortName: null,
    localizedSlotName: null,
    defaultComponentEntityClass: null,
    swapGroupId: null,
    eligibleComponents: [],
    currentInstalledEntityClass: null,
    sourceAuthority: 'geometry-and-configuration',
    confidence: 'tag-co-membership',
    diagnostics: [],
    ...overrides,
  }
}

describe('classifySlot — unresolved', () => {
  it('never classifies an unresolved slot', () => {
    const result = classifySlot(slot({ portName: 'hardpoint_x', confidence: 'unresolved' }), 1)
    expect(result).toEqual({ category: null, rejectionReason: null })
  })
})

describe('classifySlot — Category A (confirmed)', () => {
  it('classifies a known confirmed swap-group id as A-confirmed', () => {
    const id = [...CONFIRMED_SWAP_GROUP_IDS][0]
    const result = classifySlot(slot({ portName: 'hardpoint_weapon_center', swapGroupId: id, eligibleComponents: ['A', 'B'] }), 1)
    expect(result.category).toBe('A-confirmed')
    expect(result.rejectionReason).toBeNull()
  })
})

describe('classifySlot — Category D (rejected)', () => {
  it('rejects a slot whose eligible set includes a non-player-variant name, even with an otherwise-plausible shape', () => {
    const result = classifySlot(slot({ portName: 'hardpoint_x', swapGroupId: 'someTag', eligibleComponents: ['Real_Component', 'Real_Component_PU_AI_CRIM'] }), 1)
    expect(result.category).toBe('D-rejected')
    expect(result.rejectionReason).toContain('Real_Component_PU_AI_CRIM')
  })

  it('checks for non-player-variant members BEFORE the confirmed-id check (rejection always wins)', () => {
    const id = [...CONFIRMED_SWAP_GROUP_IDS][0]
    const result = classifySlot(slot({ portName: 'hardpoint_x', swapGroupId: id, eligibleComponents: ['Real_Component', 'Real_Component_Template'] }), 1)
    expect(result.category).toBe('D-rejected')
  })
})

describe('classifySlot — Category C (review required)', () => {
  it('routes a swap group spanning more ports than the confirmed precedent to review-required', () => {
    const result = classifySlot(slot({ portName: 'hardpoint_x', swapGroupId: 'ANVL_Hornet_F7A', eligibleComponents: ['A', 'B'] }), MAX_CONFIRMED_PORT_SPAN_PER_HULL + 1)
    expect(result.category).toBe('C-review-required')
    expect(result.rejectionReason).toContain('exceeds the largest confirmed real precedent')
  })

  it('routes a single-member resolution to review-required', () => {
    const result = classifySlot(slot({ portName: 'hardpoint_x', swapGroupId: 'someTag', eligibleComponents: ['OnlyDefault'] }), 1)
    expect(result.category).toBe('C-review-required')
  })

  it('routes an ambiguous (tied multi-tag) resolution to review-required even with multiple eligible members', () => {
    const result = classifySlot(
      slot({
        portName: 'hardpoint_x',
        swapGroupId: 'someTag',
        eligibleComponents: ['A', 'B'],
        diagnostics: [{ code: 'swap-group-shared-across-slots', message: 'tied', severity: 'warning' }],
      }),
      1
    )
    expect(result.category).toBe('C-review-required')
  })
})

describe('classifySlot — Category B (newly discovered)', () => {
  it('classifies a real, unambiguous, multi-member, non-confirmed swap group as newly discovered', () => {
    const result = classifySlot(slot({ portName: 'hardpoint_weapon_emp', swapGroupId: 'AEGS_EMP_Device', eligibleComponents: ['A', 'B'] }), 1)
    expect(result).toEqual({ category: 'B-newly-discovered', rejectionReason: null })
  })
})

describe('computePortSpansPerGroup', () => {
  it('counts distinct port names per swap group on one ship', () => {
    const slots: ConfigurableSlot[] = [
      slot({ portName: 'hardpoint_turret_top', swapGroupId: 'GROUP_A' }),
      slot({ portName: 'turret_launcher', swapGroupId: 'GROUP_A' }),
      slot({ portName: 'hardpoint_weapon_center', swapGroupId: 'GROUP_B' }),
    ]
    const spans = computePortSpansPerGroup(slots)
    expect(spans.get('GROUP_A')).toBe(2)
    expect(spans.get('GROUP_B')).toBe(1)
  })

  it('ignores slots with no swap group at all', () => {
    const spans = computePortSpansPerGroup([slot({ portName: 'hardpoint_x', swapGroupId: null })])
    expect(spans.size).toBe(0)
  })

  it('does not double-count the same port name appearing twice for one group (defensive)', () => {
    const slots: ConfigurableSlot[] = [slot({ portName: 'hardpoint_x', swapGroupId: 'GROUP_A' }), slot({ portName: 'hardpoint_x', swapGroupId: 'GROUP_A' })]
    expect(computePortSpansPerGroup(slots).get('GROUP_A')).toBe(1)
  })
})
