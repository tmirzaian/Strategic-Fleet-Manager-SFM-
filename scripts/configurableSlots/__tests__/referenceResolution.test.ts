import { describe, it, expect } from 'vitest'
import { buildEntityClassCaseIndex, resolveEntityClassReference } from '../referenceResolution'

describe('buildEntityClassCaseIndex / resolveEntityClassReference', () => {
  it('resolves a lowercase, underscore-normalized reference key to its real, mixed-case entity class', () => {
    const index = buildEntityClassCaseIndex(['UMNT_ANVL_S5_Cap_Mk2', 'AEGS_Retaliator_Module_Front_Base'])
    expect(resolveEntityClassReference('umnt_anvl_s5_cap_mk2', index)).toBe('UMNT_ANVL_S5_Cap_Mk2')
    expect(resolveEntityClassReference('AEGS_RETALIATOR_MODULE_FRONT_BASE', index)).toBe('AEGS_Retaliator_Module_Front_Base')
  })

  it('returns null — never a guess — when no case-insensitive match exists', () => {
    const index = buildEntityClassCaseIndex(['UMNT_ANVL_S5_Cap_Mk2'])
    expect(resolveEntityClassReference('completely_unrelated_entity', index)).toBeNull()
  })

  it('keeps the first-seen real casing when two real entity classes theoretically collide case-insensitively', () => {
    const index = buildEntityClassCaseIndex(['Foo_Bar', 'FOO_BAR'])
    expect(resolveEntityClassReference('foo_bar', index)).toBe('Foo_Bar')
  })

  it('handles the full real 7-reference validation set from SW-010A Objective 6 with zero collisions', () => {
    const universe = [
      'UMNT_ANVL_S5_Cap_Mk2',
      'ANVL_F7_Mk2_NoseCap',
      'AEGS_Retaliator_Module_Front_Base',
      'AEGS_Retaliator_Module_Rear_Base',
      'RSI_Scorpius_SCItem_Remote_Turret',
      'ARGO_MOTH_Remote_Turret',
      'MRCK_S04_ARGO_MOTH_16_S02',
      // plus enough unrelated noise to prove this isn't a hand-picked toy set
      'Widget_A',
      'Widget_B',
      'Widget_C',
    ]
    const index = buildEntityClassCaseIndex(universe)
    const references = [
      'umnt_anvl_s5_cap_mk2',
      'anvl_f7_mk2_nosecap',
      'aegs_retaliator_module_front_base',
      'aegs_retaliator_module_rear_base',
      'rsi_scorpius_scitem_remote_turret',
      'argo_moth_remote_turret',
      'mrck_s04_argo_moth_16_s02',
    ]
    for (const ref of references) {
      expect(resolveEntityClassReference(ref, index)).not.toBeNull()
    }
  })
})
