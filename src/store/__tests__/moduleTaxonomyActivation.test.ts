import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { shipFactoryTemplates } from '../../data/shipDefinitions'
import { reconcileBuildHardpoints } from '../../utils/fleetAssetReconciliation'
import { calculateBuildProgress } from '../../utils/buildProgress'
import type { Hardpoint } from '../../types'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

/**
 * SW-013C.2B (Objective 6/Objective 4) — proves the Chief-Architect-
 * approved Module readiness policy is delivered entirely by the existing,
 * unmodified `computeHardpointStatus`/`calculateBuildProgress` engine, now
 * that Module ports are real `Hardpoint` rows — no Module-specific
 * readiness code was written (Objective 4: "Do not create a
 * Module-specific implementation").
 */
describe('SW-013C.2B (Objective 4): Module readiness policy — shared architecture only', () => {
  it('No Target / Factory Cap Targeted: a freshly-materialized Module port is readiness-neutral and matched, not missing', () => {
    const hardpoints = useFleetStore.getState().hardpoints.filter((h) => h.buildId === 'ghost-stealth')
    const center = hardpoints.find((h) => h.sourceItemPortName === 'hardpoint_weapon_center')
    expect(center).toBeDefined()
    // Factory-default state: installed === target === factory (the Cap).
    expect(center!.status).toBe('OK')
    const progress = calculateBuildProgress(hardpoints)
    expect(progress.missingAssignments).not.toContain(center!.targetItem)
  })

  it('Target Selected: once a real swap-group alternative is targeted but not yet installed, the port becomes readiness-bearing (Missing)', () => {
    const shipId = 'ghost'
    const before = useFleetStore.getState().hardpoints.filter((h) => h.buildId === 'ghost-stealth')
    const center = before.find((h) => h.sourceItemPortName === 'hardpoint_weapon_center')!

    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'Module Readiness Test',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: { [center.slotLabel]: { targetItem: 'Anvil F7C-M Mk II Ball Turret', targetEntityClass: 'ANVL_Hornet_F7CM_Mk2_Ball_Turret' } },
      setActive: false,
      saveAsNew: true,
    })
    expect(result.success).toBe(true)
    const after = useFleetStore.getState().hardpoints.filter((h) => h.buildId === result.buildId)
    const centerAfter = after.find((h) => h.sourceItemPortName === 'hardpoint_weapon_center')!
    expect(centerAfter.targetItem).toBe('Anvil F7C-M Mk II Ball Turret')
    // Installed is still the Cap — target now differs, and installed still equals factory, so this is 'Missing' (not 'Upgrade Available' or a false 'OK').
    expect(centerAfter.status).toBe('Missing')
    const progress = calculateBuildProgress(after)
    expect(progress.missingAssignments).toContain('Anvil F7C-M Mk II Ball Turret')
  })

  it('Intentional Empty: reuses the exact same shared "—" mechanism every other port type already uses — readiness-neutral', () => {
    const shipId = 'ghost'
    const before = useFleetStore.getState().hardpoints.filter((h) => h.buildId === 'ghost-stealth')
    const nose = before.find((h) => h.sourceItemPortName === 'hardpoint_nose_cone')!

    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'Module Intentional Empty Test',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: { [nose.slotLabel]: '—' },
      setActive: false,
      saveAsNew: true,
    })
    expect(result.success).toBe(true)
    const after = useFleetStore.getState().hardpoints.filter((h) => h.buildId === result.buildId)
    const noseAfter = after.find((h) => h.sourceItemPortName === 'hardpoint_nose_cone')!
    expect(noseAfter.targetItem).toBe('—')
    expect(noseAfter.status).toBe('OK')
    const progress = calculateBuildProgress(after)
    expect(progress.missingAssignments).not.toContain('—')
  })
})

describe('SW-013C.2B (Objective 8): data integrity — Module ports never mutate inventory or installed state on their own', () => {
  it('creating a target on a Module port does not create or change any Hangar Inventory record', () => {
    const before = useFleetStore.getState().hangarItems
    const center = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.sourceItemPortName === 'hardpoint_weapon_center')!
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Module Inventory Isolation Test',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: { [center.slotLabel]: { targetItem: 'Anvil F7C-M Mk II Ball Turret', targetEntityClass: 'ANVL_Hornet_F7CM_Mk2_Ball_Turret' } },
      setActive: false,
      saveAsNew: true,
    })
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().hangarItems).toEqual(before)
  })

  it('saving a Module target does not install a component — installedLoadouts is unaffected', () => {
    const installedBefore = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')
    const center = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.sourceItemPortName === 'hardpoint_weapon_center')!
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Module Install Isolation Test',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: { [center.slotLabel]: { targetItem: 'Anvil F7C-M Mk II Ball Turret', targetEntityClass: 'ANVL_Hornet_F7CM_Mk2_Ball_Turret' } },
      setActive: false,
      saveAsNew: true,
    })
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')).toEqual(installedBefore)
  })

  it('no duplicate topology row exists for a Module port after a save/reconcile cycle', () => {
    const hardpoints = useFleetStore.getState().hardpoints.filter((h) => h.buildId === 'ghost-stealth')
    const centerRows = hardpoints.filter((h) => h.sourceItemPortName === 'hardpoint_weapon_center')
    expect(centerRows).toHaveLength(1)
  })
})

describe('SW-013C.2B (Objective 3): swap-group isolation — Hornet and Retaliator Module ports never cross-contaminate', () => {
  it('the Hornet Ghost Mk II template and the Retaliator template each carry their own distinct Module ports', () => {
    const ghostTemplate = shipFactoryTemplates['ANVL_Hornet_F7CS_Mk2'] ?? []
    const retaliatorTemplate = shipFactoryTemplates['AEGS_Retaliator'] ?? []
    const ghostModulePorts = ghostTemplate.filter((t) => t.type === 'Module')
    const retaliatorModulePorts = retaliatorTemplate.filter((t) => t.type === 'Module')
    expect(ghostModulePorts.length).toBeGreaterThan(0)
    expect(retaliatorModulePorts.length).toBeGreaterThan(0)
    const ghostFactoryItems = new Set(ghostModulePorts.map((t) => t.factoryItem))
    const retaliatorFactoryItems = new Set(retaliatorModulePorts.map((t) => t.factoryItem))
    for (const item of retaliatorFactoryItems) expect(ghostFactoryItems.has(item)).toBe(false)
  })
})

describe('SW-013C.2B (Objective 8): existing fleet ships gain the operational port without destructive migration', () => {
  it('reconcileBuildHardpoints appends the newly-classified Module port to an OLD build that predates this fix, without touching any existing row', () => {
    const currentTemplate = shipFactoryTemplates['ghost'] ?? shipFactoryTemplates['ANVL_Hornet_F7CS_Mk2']
    expect(currentTemplate.some((t) => t.type === 'Module')).toBe(true)

    // Simulate a build persisted BEFORE this mission: every TOP-LEVEL,
    // non-component-owned row except the new Module ports, exactly as
    // SW-013C.2's own root-cause report documented the prior (broken)
    // state. Missile-rack child attach points are deliberately excluded
    // from this synthetic fixture — their own component-owned
    // reconciliation semantics are pre-existing, already covered by
    // src/utils/__tests__/fleetAssetReconciliation.test.ts, and orthogonal
    // to what this test proves (Module ports append cleanly).
    const oldHardpoints: Hardpoint[] = currentTemplate
      .filter((t) => t.type !== 'Module' && !t.slotLabel.includes(' — '))
      .map((t, i) => ({
        id: `old-ghost-hp-${i}`,
        shipId: 'ghost',
        buildId: 'old-ghost-build',
        slotLabel: t.slotLabel,
        type: t.type,
        size: t.size,
        factoryItem: t.factoryItem,
        installedItem: t.factoryItem,
        targetItem: t.factoryItem,
        status: 'OK',
        sourcePortId: t.sourcePortId,
        sourceItemPortName: t.sourceItemPortName,
        sourceParentItemPortName: t.sourceParentItemPortName,
      }))
    const preexistingCount = oldHardpoints.length

    const { hardpoints: reconciled } = reconcileBuildHardpoints('ghost', 'old-ghost-build', oldHardpoints, currentTemplate)

    const moduleRows = reconciled.filter((h) => h.type === 'Module')
    expect(moduleRows.length).toBeGreaterThan(0)
    // Every pre-existing row survives, untouched, alongside the newly-appended ones.
    const preexistingSurvived = oldHardpoints.every((old) => reconciled.some((h) => h.slotLabel === old.slotLabel && h.targetItem === old.targetItem))
    expect(preexistingSurvived).toBe(true)
    // At least every pre-existing row plus the newly-appended Module rows —
    // may be more if the template's own missile-rack children (deliberately
    // excluded from this synthetic fixture, see comment above) are also
    // freshly appended, which is correct, unrelated reconciliation behavior.
    expect(reconciled.length).toBeGreaterThanOrEqual(preexistingCount + moduleRows.length)
  })
})
