import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FactoryHardpointTemplate } from '../../data/shipDefinitions'
import type { ShipDefinition } from '../../types'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  localStorage.clear()
})

function fakeDefinition(id: string, displayName: string): ShipDefinition {
  return {
    id,
    internalName: id,
    displayName,
    manufacturer: 'TEST',
    classification: { rsiRoles: [], focusTags: [], source: 'UNKNOWN' },
    career: 'Combat',
    role: 'Test',
    equipmentGroups: [],
    portIds: [],
    factoryLoadoutId: `${id}-factory-loadout`,
    sourceMetadata: { sourceType: 'StarBreaker' },
  }
}

describe('EWO-043 — Fleet Template Reconciliation integration (real store persist pipeline)', () => {
  it('Task 9 — Ghost Mk II certification: an existing Fleet Asset built from the real current Ghost port shape migrates forward onto an updated authoritative template with no deletion required', async () => {
    vi.resetModules()
    const { useFleetStore } = await import('../useFleetStore')
    const defsMod = await import('../../data/shipDefinitions')
    const { materializeFleetAsset } = await import('../../utils/fleetAssetMaterializer')
    const { shipDefinitionById, shipFactoryTemplates } = defsMod as unknown as {
      shipDefinitionById: Map<string, ShipDefinition>
      shipFactoryTemplates: Record<string, FactoryHardpointTemplate[]>
    }

    const id = 'ewo043-ghost-cert'
    shipDefinitionById.set(id, fakeDefinition(id, 'F7C-S Hornet Ghost Mk II (Test)'))

    // The REAL current Ghost port shape (src/data/seed.ts): a single Nose
    // Mount gimbal with two weapon children, no missiles, no relay, no jump drive.
    // sourcePortId is set on the ports the real StarBreaker/importer
    // pipeline would carry a stable identity for across a patch (weapons,
    // power, quantum drive) — a realistic stand-in for "this Fleet Asset's
    // template came from the deep-import pipeline, which does thread real
    // Port ids through" (src/data/shipDefinitions.ts's importedFactoryTemplate).
    // The Nose Mount itself deliberately has none, so the test also proves
    // a genuinely ambiguous structural restructuring (one shared mount ->
    // two separate wing mounts) is safely quarantined rather than guessed.
    const oldGhostTemplate: FactoryHardpointTemplate[] = [
      { slotLabel: 'Nose Mount', type: 'Gimbal Mount', size: 'S4', factoryItem: '—', isStructural: true },
      { slotLabel: 'Nose Mount — Weapon 1', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver', parentSlotLabel: 'Nose Mount', sourcePortId: 'port-weapon-1' },
      { slotLabel: 'Nose Mount — Weapon 2', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver', parentSlotLabel: 'Nose Mount', sourcePortId: 'port-weapon-2' },
      { slotLabel: 'Power 1', type: 'Power Plant', size: 'S1', factoryItem: 'Regulus', sourcePortId: 'port-power-1' },
      { slotLabel: 'Quantum Drive', type: 'Quantum Drive', size: 'S1', factoryItem: 'Atlas', sourcePortId: 'port-qd' },
    ]
    shipFactoryTemplates[id] = oldGhostTemplate

    const definition = shipDefinitionById.get(id)!
    const materialized = materializeFleetAsset({ definition, template: oldGhostTemplate, ownershipType: 'OWNED', priority: 1, acquisitionSource: 'MANUAL' })

    // The Commander's real Stealth-build intent: an explicit power upgrade
    // target, and installed equipment different from factory on the weapons.
    const buildId = `${materialized.asset.id}-mission-stealth`
    const noseMount = materialized.hardpoints.find((h) => h.slotLabel === 'Nose Mount')!
    const weapon1 = materialized.hardpoints.find((h) => h.slotLabel === 'Nose Mount — Weapon 1')!
    const weapon2 = materialized.hardpoints.find((h) => h.slotLabel === 'Nose Mount — Weapon 2')!
    const power1 = materialized.hardpoints.find((h) => h.slotLabel === 'Power 1')!
    const quantum = materialized.hardpoints.find((h) => h.slotLabel === 'Quantum Drive')!
    const customHardpoints = [
      { ...noseMount, id: `${buildId}-hp-mount`, buildId },
      { ...weapon1, id: `${buildId}-hp-w1`, buildId, installedItem: 'Mass Driver', targetItem: 'Mass Driver', targetMode: 'FOLLOW_FACTORY' as const },
      { ...weapon2, id: `${buildId}-hp-w2`, buildId, installedItem: 'Mass Driver', targetItem: 'Mass Driver', targetMode: 'FOLLOW_FACTORY' as const },
      { ...power1, id: `${buildId}-hp-power`, buildId, installedItem: 'Regulus', targetItem: 'Slipstream', status: 'Upgrade Available' as const, targetMode: 'EXPLICIT_TARGET' as const },
      { ...quantum, id: `${buildId}-hp-qd`, buildId, installedItem: 'Atlas', targetItem: 'Atlas', targetMode: 'FOLLOW_FACTORY' as const },
    ]
    const customBuild = { id: buildId, shipId: materialized.asset.id, name: 'Stealth Build', role: 'Test', readiness: 80, isActive: true, missing: ['Slipstream'], kind: 'MISSION' as const }

    const persistedState = {
      fleetAssets: [materialized.asset],
      hangarItems: [],
      reservations: [],
      installedLoadouts: customHardpoints.filter((h) => !h.isStructural).map((h) => ({ shipId: materialized.asset.id, slotLabel: h.slotLabel, installedItem: h.installedItem })),
      seedAssetOverrides: {},
      customBuilds: [customBuild],
      customBuildHardpoints: customHardpoints,
      activeBuildByShipId: { [materialized.asset.id]: buildId },
    }

    // "Star Citizen updated Ghost's factory loadout": the authoritative
    // template now reflects the real 4.9 structure — dual wing gimbals (not
    // one shared nose mount), a jump drive nested under Quantum Drive, and
    // an entirely new Relay port. Same physical weapon/power/QD ports carry
    // sourcePortId so they resolve via the strongest match tier.
    const updatedGhostTemplate: FactoryHardpointTemplate[] = [
      { slotLabel: 'Left Wing Weapon', type: 'Gimbal Mount', size: 'S4', factoryItem: '—', isStructural: true, sourcePortId: 'port-left-wing' },
      { slotLabel: 'Left Wing Weapon — Class 2', type: 'Weapon', size: 'S4', factoryItem: 'Revenant', parentSlotLabel: 'Left Wing Weapon', sourcePortId: 'port-weapon-1' },
      { slotLabel: 'Right Wing Weapon', type: 'Gimbal Mount', size: 'S4', factoryItem: '—', isStructural: true, sourcePortId: 'port-right-wing' },
      { slotLabel: 'Right Wing Weapon — Class 2', type: 'Weapon', size: 'S4', factoryItem: 'Revenant', parentSlotLabel: 'Right Wing Weapon', sourcePortId: 'port-weapon-2' },
      { slotLabel: 'Power Plant', type: 'Power Plant', size: 'S1', factoryItem: 'Atlas Power', sourcePortId: 'port-power-1' },
      { slotLabel: 'Quantum Drive', type: 'Quantum Drive', size: 'S1', factoryItem: 'Drift', sourcePortId: 'port-qd' },
      { slotLabel: 'Quantum Drive — Jump Drive', type: 'Jump Drive', size: 'S1', factoryItem: 'Explorer', parentSlotLabel: 'Quantum Drive' },
      { slotLabel: 'Relay', type: 'Relay', size: 'S1', factoryItem: 'RELAY_3slot' },
    ]
    shipFactoryTemplates[id] = updatedGhostTemplate

    const persistOptions = useFleetStore.persist.getOptions()
    const merged = persistOptions.merge!(persistedState, useFleetStore.getState()) as ReturnType<typeof useFleetStore.getState>

    const shipId = materialized.asset.id
    // No deletion required — the Fleet Asset and its Commander build both survive.
    expect(merged.fleetAssets.some((a) => a.id === shipId)).toBe(true)
    expect(merged.builds.some((b) => b.id === buildId)).toBe(true)

    const rows = merged.hardpoints.filter((h) => h.buildId === buildId)
    // Additional ports appear (Relay, Jump Drive) — new ports on an existing
    // Commander build never require manual re-creation.
    expect(rows.some((h) => h.slotLabel === 'Relay')).toBe(true)
    expect(rows.some((h) => h.slotLabel === 'Quantum Drive — Jump Drive')).toBe(true)

    // Factory equipment updates to the new authoritative values.
    const qdRow = rows.find((h) => h.slotLabel === 'Quantum Drive')!
    expect(qdRow.factoryItem).toBe('Drift')

    // Commander Target preserved for the explicit power target across the
    // wholesale mount restructuring (matched via sourcePortId, port-power-1).
    const powerRow = rows.find((h) => h.sourcePortId === 'port-power-1')!
    expect(powerRow.targetItem).toBe('Slipstream')
    expect(powerRow.installedItem).toBe('Regulus')

    // The FOLLOW_FACTORY weapon rows migrated onto the new dual-gimbal
    // structure via sourcePortId and now track the new factory item.
    const weaponRow1 = rows.find((h) => h.sourcePortId === 'port-weapon-1')!
    expect(weaponRow1.slotLabel).toBe('Left Wing Weapon — Class 2')
    expect(weaponRow1.targetItem).toBe('Revenant')

    // Nothing was silently dropped: the old Nose Mount structural row (no
    // sourcePortId, no equivalent in the new template) is quarantined, not deleted.
    expect(merged.quarantinedAssignments.some((q) => q.shipId === shipId && q.hardpoint.slotLabel === 'Nose Mount')).toBe(true)
  })

  it('Task 10 — multiple Fleet Assets of the same hull reconcile independently through the real merge pipeline', async () => {
    vi.resetModules()
    const { useFleetStore } = await import('../useFleetStore')
    const defsMod = await import('../../data/shipDefinitions')
    const { materializeFleetAsset } = await import('../../utils/fleetAssetMaterializer')
    const { shipDefinitionById, shipFactoryTemplates } = defsMod as unknown as {
      shipDefinitionById: Map<string, ShipDefinition>
      shipFactoryTemplates: Record<string, FactoryHardpointTemplate[]>
    }
    const id = 'ewo043-dup-hull'
    shipDefinitionById.set(id, fakeDefinition(id, 'Dup Hull Test'))
    const oldTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Deadbolt III', sourcePortId: 'port-w1' }]
    shipFactoryTemplates[id] = oldTemplate
    const definition = shipDefinitionById.get(id)!

    const copyA = materializeFleetAsset({ definition, template: oldTemplate, ownershipType: 'OWNED', priority: 1, acquisitionSource: 'MANUAL' })
    const copyB = materializeFleetAsset({ definition, template: oldTemplate, ownershipType: 'PURCHASED', priority: 2, acquisitionSource: 'MANUAL' })
    const buildIdA = `${copyA.asset.id}-mission-a`
    const buildIdB = `${copyB.asset.id}-mission-b`
    const rowA = { ...copyA.hardpoints[0], id: `${buildIdA}-hp-0`, buildId: buildIdA, targetItem: 'Omnisky IX', installedItem: 'Deadbolt III', status: 'Missing' as const, targetMode: 'EXPLICIT_TARGET' as const }
    const rowB = { ...copyB.hardpoints[0], id: `${buildIdB}-hp-0`, buildId: buildIdB, targetItem: 'Deadbolt III', installedItem: 'Deadbolt III', targetMode: 'FOLLOW_FACTORY' as const }
    const buildA = { id: buildIdA, shipId: copyA.asset.id, name: 'A', role: 'Test', readiness: 0, isActive: true, missing: ['Omnisky IX'], kind: 'MISSION' as const }
    const buildB = { id: buildIdB, shipId: copyB.asset.id, name: 'B', role: 'Test', readiness: 100, isActive: true, missing: [], kind: 'MISSION' as const }

    const persistedState = {
      fleetAssets: [copyA.asset, copyB.asset],
      hangarItems: [],
      reservations: [],
      installedLoadouts: [
        { shipId: copyA.asset.id, slotLabel: 'Weapon 1', installedItem: 'Deadbolt III' },
        { shipId: copyB.asset.id, slotLabel: 'Weapon 1', installedItem: 'Deadbolt III' },
      ],
      seedAssetOverrides: {},
      customBuilds: [buildA, buildB],
      customBuildHardpoints: [rowA, rowB],
      activeBuildByShipId: { [copyA.asset.id]: buildIdA, [copyB.asset.id]: buildIdB },
    }

    const newTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Lightstrike III', sourcePortId: 'port-w1' }]
    shipFactoryTemplates[id] = newTemplate

    const persistOptions = useFleetStore.persist.getOptions()
    const merged = persistOptions.merge!(persistedState, useFleetStore.getState()) as ReturnType<typeof useFleetStore.getState>

    const rowAAfter = merged.hardpoints.find((h) => h.id === rowA.id)!
    const rowBAfter = merged.hardpoints.find((h) => h.id === rowB.id)!
    // Copy A's explicit custom target is untouched by the Factory change.
    expect(rowAAfter.targetItem).toBe('Omnisky IX')
    expect(rowAAfter.factoryItem).toBe('Lightstrike III')
    // Copy B's FOLLOW_FACTORY row tracks the new factory item independently.
    expect(rowBAfter.targetItem).toBe('Lightstrike III')
    // The two copies never affect each other's ids or values.
    expect(rowAAfter.id).not.toBe(rowBAfter.id)
  })

  it('Task 3 regression (CWO-003 finding) — a Factory-active hardpoint\'s installedItem now survives a genuine reload instead of reverting to the factory default', async () => {
    vi.resetModules()
    const { useFleetStore } = await import('../useFleetStore')
    const defsMod = await import('../../data/shipDefinitions')
    const { shipDefinitionById, shipFactoryTemplates } = defsMod as unknown as {
      shipDefinitionById: Map<string, ShipDefinition>
      shipFactoryTemplates: Record<string, FactoryHardpointTemplate[]>
    }
    const id = 'ewo043-installed-overlay'
    shipDefinitionById.set(id, fakeDefinition(id, 'Installed Overlay Test'))
    const template: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Unknown Factory Item' }]
    shipFactoryTemplates[id] = template
    useFleetStore.setState({ shipDefinitions: [...useFleetStore.getState().shipDefinitions, shipDefinitionById.get(id)!] })

    const addResult = useFleetStore.getState().addFleetAsset(id, 'OWNED')
    const assetId = addResult.assetId!
    const installResult = useFleetStore.getState().installComponent(assetId, 'Lightstrike III', 'Weapon 1')
    expect(installResult.matched).toBe(true)

    vi.resetModules()
    const freshDefsMod = await import('../../data/shipDefinitions')
    const freshShipDefinitionById = (freshDefsMod as unknown as { shipDefinitionById: Map<string, ShipDefinition> }).shipDefinitionById
    const freshShipFactoryTemplates = (freshDefsMod as unknown as { shipFactoryTemplates: Record<string, FactoryHardpointTemplate[]> }).shipFactoryTemplates
    freshShipDefinitionById.set(id, fakeDefinition(id, 'Installed Overlay Test'))
    freshShipFactoryTemplates[id] = template
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')

    const afterReload = reloadedStore.getState().hardpoints.find((h) => h.shipId === assetId && h.slotLabel === 'Weapon 1')
    expect(afterReload?.installedItem).toBe('Lightstrike III')
  })

  it('Task 11 — persistence after restart: quarantined assignments round-trip through the real persist/migrate/merge pipeline', async () => {
    vi.resetModules()
    const { useFleetStore } = await import('../useFleetStore')
    const defsMod = await import('../../data/shipDefinitions')
    const { materializeFleetAsset } = await import('../../utils/fleetAssetMaterializer')
    const { shipDefinitionById, shipFactoryTemplates } = defsMod as unknown as {
      shipDefinitionById: Map<string, ShipDefinition>
      shipFactoryTemplates: Record<string, FactoryHardpointTemplate[]>
    }
    const id = 'ewo043-restart-quarantine'
    shipDefinitionById.set(id, fakeDefinition(id, 'Restart Quarantine Test'))
    const oldTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Old Utility Slot', type: 'Utility', size: 'S1', factoryItem: 'Widget I' }]
    shipFactoryTemplates[id] = oldTemplate
    const definition = shipDefinitionById.get(id)!
    const materialized = materializeFleetAsset({ definition, template: oldTemplate, ownershipType: 'OWNED', priority: 1, acquisitionSource: 'MANUAL' })
    const buildId = `${materialized.asset.id}-mission-x`
    const row = { ...materialized.hardpoints[0], id: `${buildId}-hp-0`, buildId, targetItem: 'Widget II', status: 'Upgrade Available' as const }
    const build = { id: buildId, shipId: materialized.asset.id, name: 'X', role: 'Test', readiness: 0, isActive: true, missing: ['Widget II'], kind: 'MISSION' as const }
    const persistedState = {
      fleetAssets: [materialized.asset],
      hangarItems: [],
      reservations: [],
      installedLoadouts: [{ shipId: materialized.asset.id, slotLabel: 'Old Utility Slot', installedItem: 'Widget I' }],
      seedAssetOverrides: {},
      customBuilds: [build],
      customBuildHardpoints: [row],
      activeBuildByShipId: { [materialized.asset.id]: buildId },
    }
    shipFactoryTemplates[id] = [] // port removed entirely upstream

    const persistOptions = useFleetStore.persist.getOptions()
    const mergedOnce = persistOptions.merge!(persistedState, useFleetStore.getState()) as ReturnType<typeof useFleetStore.getState>
    const ownQuarantinedOnce = mergedOnce.quarantinedAssignments.filter((q) => q.shipId === materialized.asset.id)
    expect(ownQuarantinedOnce).toHaveLength(1)

    // Round-trip through partialize -> migrate -> merge again (a second restart).
    // Scoped to this test's own ship: `mergedOnce` also carries every other
    // default seed ship's own custom Builds (Corsair, Cutlass Black, etc.)
    // through the same real partialize/merge pipeline, and MWO-001 (Task 2)
    // now aliases those seed ships to their real deep-import templates —
    // correctly producing their own additional quarantined rows too, which
    // is expected and unrelated to what this test is actually checking.
    const partialized = persistOptions.partialize!(mergedOnce)
    const migrated = persistOptions.migrate!(partialized, 6) as typeof partialized
    const mergedTwice = persistOptions.merge!(migrated, useFleetStore.getState()) as ReturnType<typeof useFleetStore.getState>
    const ownQuarantinedTwice = mergedTwice.quarantinedAssignments.filter((q) => q.shipId === materialized.asset.id)
    expect(ownQuarantinedTwice).toHaveLength(1)
    expect(ownQuarantinedTwice[0].hardpoint.targetItem).toBe('Widget II')
  })
})
