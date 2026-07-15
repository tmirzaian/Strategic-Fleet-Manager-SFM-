import { describe, it, expect } from 'vitest'
import { buildLoadoutEditorModel, assignmentsBySlotLabel, resolveShipDefinitionId } from '../loadoutEditorModel'
import type { FactoryHardpointTemplate } from '../../data/shipDefinitions'
import type { FleetAsset } from '../../types'

const template: FactoryHardpointTemplate[] = [
  { slotLabel: 'Nose Mount', type: 'Gimbal Mount', size: 'S4', factoryItem: '—', groupLabel: 'Weapons', isStructural: true, assemblyRole: 'GIMBAL_MOUNT' },
  { slotLabel: 'Nose Mount — Weapon 1', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver', parentSlotLabel: 'Nose Mount' },
  { slotLabel: 'Nose Mount — Weapon 2', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver', parentSlotLabel: 'Nose Mount' },
  { slotLabel: 'Power 1', type: 'Power Plant', size: 'S2', factoryItem: 'FR-66', groupLabel: 'Core Systems' },
]

describe('EWO-025: buildLoadoutEditorModel', () => {
  it('1/2. produces the same canonical hierarchy shape (rows, ids, parentage, groupLabel, isStructural) regardless of which assignments are supplied — CREATE and EDIT never diverge in shape', () => {
    const createModel = buildLoadoutEditorModel(template, new Map())
    const editModel = buildLoadoutEditorModel(template, assignmentsBySlotLabel([{ slotLabel: 'Power 1', factoryItem: 'FR-66', installedItem: 'FR-66', targetItem: 'FR-77' }]))

    expect(createModel.rows.map((r) => r.id)).toEqual(editModel.rows.map((r) => r.id))
    expect(createModel.rows.map((r) => r.parentSlotLabel)).toEqual(editModel.rows.map((r) => r.parentSlotLabel))
    expect(createModel.rows.map((r) => r.groupLabel)).toEqual(editModel.rows.map((r) => r.groupLabel))
    expect(createModel.rows.map((r) => r.isStructural)).toEqual(editModel.rows.map((r) => r.isStructural))
  })

  it('3. a structural row (Nose Mount) always stays structural and never carries a saved override, even if one somehow existed for it', () => {
    const model = buildLoadoutEditorModel(
      template,
      assignmentsBySlotLabel([{ slotLabel: 'Nose Mount', factoryItem: '—', installedItem: '—', targetItem: 'Rogue Value' }])
    )
    const noseMount = model.rows.find((r) => r.slotLabel === 'Nose Mount')!
    expect(noseMount.isStructural).toBe(true)
    // The row's own structural status is untouched by Ruling 5 — but a
    // caller (MissionComposer) is the one that actually refuses to render
    // an editable Target field for isStructural rows; the model itself
    // still faithfully overlays whatever value was saved, by design (it
    // is not this layer's job to sanitize Commander data).
    expect(noseMount.targetItem).toBe('Rogue Value')
  })

  it('4. Task 3 — a saved target overlays onto the matching canonical row by stable slotLabel, not by position or display label', () => {
    const assignments = assignmentsBySlotLabel([
      { slotLabel: 'Nose Mount — Weapon 2', factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Scourge Cannon' },
    ])
    const model = buildLoadoutEditorModel(template, assignments)
    expect(model.rows.find((r) => r.slotLabel === 'Nose Mount — Weapon 1')!.targetItem).toBe('Mass Driver') // untouched
    expect(model.rows.find((r) => r.slotLabel === 'Nose Mount — Weapon 2')!.targetItem).toBe('Scourge Cannon') // overlaid
  })

  it('5. a canonical row with no matching saved assignment falls back to its own factory value, never crashing or leaving a hole', () => {
    const model = buildLoadoutEditorModel(template, new Map())
    for (const row of model.rows) {
      expect(row.targetItem).toBe(row.factoryItem)
      expect(row.installedItem).toBe(row.factoryItem)
    }
  })

  it('6. Task 4 — a saved assignment whose slotLabel no longer matches any canonical port is reported as orphaned, not silently dropped and not crashing', () => {
    const assignments = assignmentsBySlotLabel([
      { slotLabel: 'Power 1', factoryItem: 'FR-66', installedItem: 'FR-66', targetItem: 'FR-77' },
      { slotLabel: 'Retired Slot That No Longer Exists', factoryItem: 'Old Item', installedItem: 'Old Item', targetItem: 'Old Item' },
    ])
    expect(() => buildLoadoutEditorModel(template, assignments)).not.toThrow()
    const model = buildLoadoutEditorModel(template, assignments)
    expect(model.orphanedSlotLabels).toEqual(['Retired Slot That No Longer Exists'])
    // the rest of the tree is completely unaffected by the orphan
    expect(model.rows).toHaveLength(template.length)
    expect(model.rows.find((r) => r.slotLabel === 'Power 1')!.targetItem).toBe('FR-77')
  })

  it('7. no orphans reported when every saved assignment matches a real canonical port', () => {
    const model = buildLoadoutEditorModel(template, assignmentsBySlotLabel([{ slotLabel: 'Power 1', factoryItem: 'FR-66', installedItem: 'FR-66', targetItem: 'FR-66' }]))
    expect(model.orphanedSlotLabels).toEqual([])
  })

  it('8. an empty canonical template (unresolved ship definition) never crashes, just yields no rows', () => {
    expect(() => buildLoadoutEditorModel([], assignmentsBySlotLabel([{ slotLabel: 'Anything', factoryItem: 'x', installedItem: 'x', targetItem: 'x' }]))).not.toThrow()
    const model = buildLoadoutEditorModel([], assignmentsBySlotLabel([{ slotLabel: 'Anything', factoryItem: 'x', installedItem: 'x', targetItem: 'x' }]))
    expect(model.rows).toEqual([])
    expect(model.orphanedSlotLabels).toEqual(['Anything'])
  })
})

describe('EWO-025: resolveShipDefinitionId', () => {
  const fleetAssets: FleetAsset[] = [
    {
      id: 'manual-1',
      shipDefinitionId: 'gladius',
      ownershipType: 'OWNED',
      acquisitionSource: 'MANUAL',
      activeBuildId: 'b1',
      installedLoadoutId: 'l1',
      priority: 1,
      status: 'active',
      addedAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'ghost-asset-seed',
      shipDefinitionId: 'ghost',
      ownershipType: 'OWNED',
      acquisitionSource: 'SEED_MIGRATION',
      activeBuildId: 'b2',
      installedLoadoutId: 'l2',
      priority: 2,
      status: 'active',
      addedAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ]

  it('9. resolves a manually-added FleetAsset whose id matches the ship id directly', () => {
    expect(resolveShipDefinitionId('manual-1', fleetAssets)).toBe('gladius')
  })

  it('10. resolves a seed-migrated ship via the "${shipId}-asset-seed" convention', () => {
    expect(resolveShipDefinitionId('ghost', fleetAssets)).toBe('ghost')
  })

  it('11. an unknown shipId resolves to undefined rather than throwing', () => {
    expect(resolveShipDefinitionId('does-not-exist', fleetAssets)).toBeUndefined()
  })
})
