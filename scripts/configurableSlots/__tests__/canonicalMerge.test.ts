import { describe, it, expect } from 'vitest'
import { mergeConfigurableTopology } from '../canonicalMerge'
import type { ResolvedConfigurationEntry } from '../canonicalMerge'
import type { DefaultLoadoutConfigurationEntry, PhysicalPortFact, SwapGroup } from '../types'

function entry(overrides: Partial<DefaultLoadoutConfigurationEntry> & { itemPortName: string }): DefaultLoadoutConfigurationEntry {
  return {
    parentItemPortName: null,
    ancestorPortNames: [],
    factoryEntityClassName: null,
    factoryEntityClassReference: null,
    hasNestedEntries: false,
    ...overrides,
  }
}

const RESOLVED_SWAP_GROUP: SwapGroup = {
  swapGroupId: '$ANVL_Hornet_Mk2_Center',
  eligibleComponents: ['UMNT_ANVL_S5_Cap_Mk2', 'ANVL_Hornet_F7A_Ball_Turret'],
  confidence: 'tag-co-membership',
  diagnostics: [],
}

describe('mergeConfigurableTopology — attach vs. synthesize', () => {
  it('marks a port that already exists in the Physical Port Graph as geometry-and-configuration (attached, not duplicated)', () => {
    const physicalPorts: PhysicalPortFact[] = [{ itemPortName: 'hardpoint_weapon_center', hasFactoryItem: true }]
    const configurationEntries: ResolvedConfigurationEntry[] = [
      { entry: entry({ itemPortName: 'hardpoint_weapon_center', factoryEntityClassReference: 'file://.../umnt_anvl_s5_cap_mk2.json' }), resolvedDefaultEntityClass: 'UMNT_ANVL_S5_Cap_Mk2' },
    ]
    const topology = mergeConfigurableTopology({
      shipEntityClass: 'TEST_Ship',
      physicalPorts,
      configurationEntries,
      resolveSwapGroupFor: () => RESOLVED_SWAP_GROUP,
    })
    expect(topology.configurableSlots).toHaveLength(1)
    expect(topology.configurableSlots[0].sourceAuthority).toBe('geometry-and-configuration')
    expect(topology.diagnostics.some((d) => d.code === 'configurable-slot-merged-into-existing-port')).toBe(true)
  })

  it('marks a port absent from the Physical Port Graph as configuration-only (synthesized)', () => {
    const configurationEntries: ResolvedConfigurationEntry[] = [
      { entry: entry({ itemPortName: 'hardpoint_never_geometrized' }), resolvedDefaultEntityClass: 'UMNT_ANVL_S5_Cap_Mk2' },
    ]
    const topology = mergeConfigurableTopology({
      shipEntityClass: 'TEST_Ship',
      physicalPorts: [],
      configurationEntries,
      resolveSwapGroupFor: () => RESOLVED_SWAP_GROUP,
    })
    expect(topology.configurableSlots[0].sourceAuthority).toBe('configuration-only')
    expect(topology.diagnostics.some((d) => d.code === 'configurable-slot-synthesized')).toBe(true)
  })

  it('never duplicates a physical port — the merge only ever attaches metadata, one slot per port', () => {
    const physicalPorts: PhysicalPortFact[] = [{ itemPortName: 'hardpoint_weapon_center', hasFactoryItem: true }]
    const configurationEntries: ResolvedConfigurationEntry[] = [
      { entry: entry({ itemPortName: 'hardpoint_weapon_center' }), resolvedDefaultEntityClass: 'UMNT_ANVL_S5_Cap_Mk2' },
    ]
    const topology = mergeConfigurableTopology({
      shipEntityClass: 'TEST_Ship',
      physicalPorts,
      configurationEntries,
      resolveSwapGroupFor: () => RESOLVED_SWAP_GROUP,
    })
    expect(topology.configurableSlots.filter((s) => s.portName === 'hardpoint_weapon_center')).toHaveLength(1)
  })
})

describe('mergeConfigurableTopology — duplicate port names in the configuration entries themselves', () => {
  it('merges only the first occurrence and records a diagnostic for the rest', () => {
    const configurationEntries: ResolvedConfigurationEntry[] = [
      { entry: entry({ itemPortName: 'hardpoint_dup' }), resolvedDefaultEntityClass: 'A' },
      { entry: entry({ itemPortName: 'hardpoint_dup' }), resolvedDefaultEntityClass: 'B' },
    ]
    const topology = mergeConfigurableTopology({
      shipEntityClass: 'TEST_Ship',
      physicalPorts: [],
      configurationEntries,
      resolveSwapGroupFor: () => null,
    })
    expect(topology.configurableSlots).toHaveLength(1)
    expect(topology.configurableSlots[0].defaultComponentEntityClass).toBe('A')
    expect(topology.diagnostics.some((d) => d.code === 'configuration-duplicate-port-name')).toBe(true)
  })

  /** SW-010B fleet-wide certification finding, live-proven against the
   * real `AEGS_Retaliator` record: the SAME `itemPortName` legitimately
   * recurs under different parent assemblies (5 distinct turret mounts
   * each declaring their own `turret_left` child). Before this fix, bare
   * `itemPortName` deduplication treated these as false duplicates and
   * silently discarded 4 of every 5 real, distinct slots. */
  it('does NOT treat the same itemPortName under different ancestor paths as a duplicate — both are real, distinct ports', () => {
    const configurationEntries: ResolvedConfigurationEntry[] = [
      { entry: entry({ itemPortName: 'turret_left', parentItemPortName: 'hardpoint_turret_fronttop', ancestorPortNames: ['hardpoint_turret_fronttop'] }), resolvedDefaultEntityClass: 'Gun_A' },
      { entry: entry({ itemPortName: 'turret_left', parentItemPortName: 'hardpoint_turret_backbottom', ancestorPortNames: ['hardpoint_turret_backbottom'] }), resolvedDefaultEntityClass: 'Gun_B' },
    ]
    const topology = mergeConfigurableTopology({
      shipEntityClass: 'TEST_MultiTurretShip',
      physicalPorts: [],
      configurationEntries,
      resolveSwapGroupFor: () => null,
    })
    expect(topology.configurableSlots).toHaveLength(2)
    expect(topology.configurableSlots.map((s) => s.defaultComponentEntityClass).sort()).toEqual(['Gun_A', 'Gun_B'])
    expect(topology.diagnostics.some((d) => d.code === 'configuration-duplicate-port-name')).toBe(false)
  })
})

describe('mergeConfigurableTopology — unresolved swap group / unresolved reference', () => {
  it('produces confidence "unresolved" with swap-group-unknown-family when the default resolves but has no swap group', () => {
    const configurationEntries: ResolvedConfigurationEntry[] = [{ entry: entry({ itemPortName: 'hardpoint_x' }), resolvedDefaultEntityClass: 'Some_Entity' }]
    const topology = mergeConfigurableTopology({
      shipEntityClass: 'TEST_Ship',
      physicalPorts: [],
      configurationEntries,
      resolveSwapGroupFor: () => null,
    })
    expect(topology.configurableSlots[0].confidence).toBe('unresolved')
    expect(topology.configurableSlots[0].diagnostics.some((d) => d.code === 'swap-group-unknown-family')).toBe(true)
  })

  it('produces confidence "unresolved" with swap-group-unresolved-reference when the default entity class itself never resolved', () => {
    const configurationEntries: ResolvedConfigurationEntry[] = [{ entry: entry({ itemPortName: 'hardpoint_x', factoryEntityClassReference: 'file://.../unknown.json' }), resolvedDefaultEntityClass: null }]
    const topology = mergeConfigurableTopology({
      shipEntityClass: 'TEST_Ship',
      physicalPorts: [],
      configurationEntries,
      resolveSwapGroupFor: () => null,
    })
    expect(topology.configurableSlots[0].confidence).toBe('unresolved')
    expect(topology.configurableSlots[0].diagnostics.some((d) => d.code === 'swap-group-unresolved-reference')).toBe(true)
  })
})

describe('mergeConfigurableTopology — no ship-specific branching', () => {
  it('produces the same shape of result for an arbitrary synthetic ship name, proving nothing keys off a literal hull/ship id', () => {
    const physicalPorts: PhysicalPortFact[] = [{ itemPortName: 'port_a', hasFactoryItem: true }]
    const configurationEntries: ResolvedConfigurationEntry[] = [{ entry: entry({ itemPortName: 'port_a' }), resolvedDefaultEntityClass: 'Widget_Default' }]
    const topology = mergeConfigurableTopology({
      shipEntityClass: 'Totally_Synthetic_Vessel_9000',
      physicalPorts,
      configurationEntries,
      resolveSwapGroupFor: () => ({ swapGroupId: '$Synthetic_Group', eligibleComponents: ['Widget_Default', 'Widget_Alt'], confidence: 'tag-co-membership', diagnostics: [] }),
    })
    expect(topology.shipEntityClass).toBe('Totally_Synthetic_Vessel_9000')
    expect(topology.configurableSlots[0].swapGroupId).toBe('$Synthetic_Group')
    expect(topology.configurableSlots[0].sourceAuthority).toBe('geometry-and-configuration')
  })
})
