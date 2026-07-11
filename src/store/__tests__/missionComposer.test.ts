import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

function hardpointsFor(buildId: string) {
  return useFleetStore.getState().hardpoints.filter((h) => h.buildId === buildId)
}

describe('saveMissionConfiguration (Mission Composer)', () => {
  it('creates a real Mission Configuration (Build with kind MISSION) tied to the exact Fleet Asset', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'utv',
      name: 'Custom UTV Loadout',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    expect(result.success).toBe(true)
    const build = useFleetStore.getState().builds.find((b) => b.id === result.buildId)!
    expect(build.shipId).toBe('utv')
    expect(build.kind).toBe('MISSION')
    expect(build.name).toBe('Custom UTV Loadout')
  })

  it('FACTORY starting state sets every target to the factory item', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Fresh From Factory',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    const rows = hardpointsFor(result.buildId!)
    for (const row of rows) {
      expect(row.targetItem).toBe(row.factoryItem)
    }
  })

  it('INSTALLED starting state sets every target to whatever is currently physically installed', () => {
    const setup = useFleetStore.getState().installComponent('ghost', 'FR-66', 'Shield 1', 'ghost-escort')
    expect(setup.matched).toBe(true) // Escort's Shield 1 starts Upgrade Available (Mirage != factory, != target FR-66), so this succeeds.
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Lock In Current State',
      startingState: 'INSTALLED',
      targetOverrides: {},
      setActive: false,
    })
    const shieldRow = hardpointsFor(result.buildId!).find((h) => h.slotLabel === 'Shield 1')!
    expect(shieldRow.targetItem).toBe('FR-66')
    expect(shieldRow.status).toBe('OK')
  })

  it('EMPTY starting state sets every target to empty (no requirements)', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Blank Slate',
      startingState: 'EMPTY',
      targetOverrides: {},
      setActive: false,
    })
    const rows = hardpointsFor(result.buildId!)
    for (const row of rows) {
      expect(row.targetItem).toBe('—')
    }
  })

  it('EXISTING starting state clones another Mission Configuration\'s targets', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Copy of Stealth',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: {},
      setActive: false,
    })
    const original = hardpointsFor('ghost-stealth')
    const copy = hardpointsFor(result.buildId!)
    for (const row of original) {
      const copiedRow = copy.find((c) => c.slotLabel === row.slotLabel)!
      expect(copiedRow.targetItem).toBe(row.targetItem)
    }
  })

  it('a Quartermaster Template applies its intent on top of the starting state', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Escort Loadout',
      startingState: 'FACTORY',
      quartermasterTemplateId: 'template-escort-support',
      targetOverrides: {},
      setActive: false,
    })
    const weaponRow = hardpointsFor(result.buildId!).find((h) => h.slotLabel === 'Weapon 1')!
    expect(weaponRow.targetItem).toBe('Mass Driver')
  })

  it('explicit per-slot target overrides win over both the template and the starting state', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Manually Tweaked',
      startingState: 'FACTORY',
      quartermasterTemplateId: 'template-escort-support',
      targetOverrides: { 'Weapon 1': 'CF-337 Panther Repeater' },
      setActive: false,
    })
    const weaponRow = hardpointsFor(result.buildId!).find((h) => h.slotLabel === 'Weapon 1')!
    expect(weaponRow.targetItem).toBe('CF-337 Panther Repeater')
  })

  it('setActive: true sets the new Mission Configuration as the Active Mission', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'utv',
      name: 'New Active Mission',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: true,
    })
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'utv')!
    expect(ship.activeBuildId).toBe(result.buildId)
  })

  it('setActive: false leaves the previous Active Mission untouched', () => {
    const before = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!.activeBuildId
    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Not Active Yet',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    const after = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!.activeBuildId
    expect(after).toBe(before)
  })

  it('an explicitly-created Mission Configuration is real player intent, even one mirroring Factory targets', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'utv',
      name: 'Explicit Factory Mirror',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: true,
    })
    const build = useFleetStore.getState().builds.find((b) => b.id === result.buildId)!
    expect(build.kind).toBe('MISSION')
    expect(build.readiness).toBe(100)
  })

  it('editing an EXISTING Mission Configuration in place reuses its id rather than creating a duplicate', () => {
    const totalBuildsBefore = useFleetStore.getState().builds.length
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Stealth Build',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: { 'Power 1': 'Slipstream' },
      setActive: false,
    })
    expect(result.buildId).toBe('ghost-stealth')
    expect(useFleetStore.getState().builds.length).toBe(totalBuildsBefore)
    const powerRow = hardpointsFor('ghost-stealth').find((h) => h.slotLabel === 'Power 1')!
    expect(powerRow.targetItem).toBe('Slipstream')
  })

  it('fails cleanly for an unknown Fleet Asset', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'does-not-exist',
      name: 'Ghost Mission',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    expect(result.success).toBe(false)
  })

  it('fails cleanly with an empty name', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '   ',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    expect(result.success).toBe(false)
  })
})
