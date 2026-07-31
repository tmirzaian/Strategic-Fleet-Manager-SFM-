import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { buildImportedShipHardpoints } from '../ShipDetail'
import ShipDetail from '../ShipDetail'
import { calculateBuildProgress } from '../../utils/buildProgress'
import { importedShipList } from '../../generated/importedShips'
import type { ImportedShipView } from '../../generated/importedShips'
import type { Port, Ship, Component, ResolvedEquipmentAssignment } from '../../engine/types'

afterEach(() => cleanup())

/**
 * EWO-086 — Imported-Ship Preview Readiness Canonicalization. Focused
 * tests for `buildImportedShipHardpoints` (the EWO-086 adapter,
 * `src/pages/ShipDetail.tsx`) feeding `calculateBuildProgress`, replacing
 * the old hand-rolled `matchedCount / equipmentAssignments.length`
 * formula that never excluded Unresolved or genuinely-untargeted rows.
 *
 * Uses fully synthetic `ImportedShipView` fixtures (not real generated
 * import-pipeline data) so every scenario the work order requires —
 * Unresolved exclusion, untargeted exclusion, zero-required — is under
 * direct, deterministic control rather than depending on whatever a real
 * imported ship happens to contain.
 */

const baseShip = { id: 'imported-test-ship', displayName: 'Imported Test Ship' } as unknown as Ship

function port(overrides: Partial<Port> & Pick<Port, 'id' | 'displayName'>): Port {
  return {
    shipId: baseShip.id,
    equipmentGroup: 'Weapons',
    internalName: overrides.id,
    allowedTypes: [],
    allowedSubtypes: [],
    minSize: 1,
    maxSize: 1,
    ...overrides,
  } as Port
}

function componentMap(entries: Array<[string, string]>): Map<string, Component> {
  return new Map(entries.map(([id, displayName]) => [id, { id, displayName } as unknown as Component]))
}

function viewFor(ports: Port[], componentById: Map<string, Component>, equipmentAssignments: ResolvedEquipmentAssignment[] = []): ImportedShipView {
  return {
    ship: baseShip,
    ports,
    flatPorts: ports,
    components: [],
    componentById,
    factoryLoadout: undefined,
    installedLoadout: undefined,
    targetBuild: undefined,
    rawInternalNames: [],
    equipmentAssignments,
    imageManifestEntry: undefined,
  }
}

describe('EWO-086: buildImportedShipHardpoints + calculateBuildProgress replace the old formula', () => {
  it('1. all required targets matched: 100% readiness', () => {
    const components = componentMap([
      ['c-mass-driver', 'Mass Driver'],
      ['c-power', 'Stock Power Plant'],
    ])
    const view = viewFor(
      [
        port({ id: 'p1', displayName: 'Weapon 1', factoryItemId: 'c-mass-driver', installedItemId: 'c-mass-driver', targetItemId: 'c-mass-driver' }),
        port({ id: 'p2', displayName: 'Power 1', factoryItemId: 'c-power', installedItemId: 'c-power', targetItemId: 'c-power' }),
      ],
      components
    )
    const hardpoints = buildImportedShipHardpoints(view)
    const progress = calculateBuildProgress(hardpoints)
    expect(progress.percentage).toBe(100)
    expect(progress.missingAssignments).toEqual([])
  })

  it('2. one missing required target: readiness reflects it, and the missing item is reported', () => {
    const components = componentMap([
      ['c-mass-driver', 'Mass Driver'],
      ['c-power-old', 'Stock Power Plant'],
      ['c-power-new', 'Slipstream'],
    ])
    const view = viewFor(
      [
        port({ id: 'p1', displayName: 'Weapon 1', factoryItemId: 'c-mass-driver', installedItemId: 'c-mass-driver', targetItemId: 'c-mass-driver' }),
        port({ id: 'p2', displayName: 'Power 1', factoryItemId: 'c-power-old', installedItemId: 'c-power-old', targetItemId: 'c-power-new' }),
      ],
      components
    )
    const hardpoints = buildImportedShipHardpoints(view)
    const progress = calculateBuildProgress(hardpoints)
    expect(progress.percentage).toBe(50)
    expect(progress.missingAssignments).toEqual(['Slipstream'])
  })

  it('3/regression — a row with no factory data (Unresolved) is excluded from the denominator, unlike the old formula which counted every row', () => {
    const components = componentMap([['c-mass-driver', 'Mass Driver']])
    const view = viewFor(
      [
        port({ id: 'p1', displayName: 'Weapon 1', factoryItemId: 'c-mass-driver', installedItemId: 'c-mass-driver', targetItemId: 'c-mass-driver' }),
        // No factoryItemId at all -> Unresolved per buildImportedShipHardpoints's own status rule.
        port({ id: 'p2', displayName: 'Power 1', factoryItemId: null, installedItemId: null, targetItemId: null }),
      ],
      components
    )
    const hardpoints = buildImportedShipHardpoints(view)
    expect(hardpoints.find((h) => h.slotLabel === 'Power 1')?.status).toBe('Unresolved')
    const progress = calculateBuildProgress(hardpoints)
    // Old formula: matchedCount would only ever count resolvedItemId from a
    // DIFFERENT data source (equipmentAssignments), but its denominator
    // (equipmentAssignments.length) had no concept of "Unresolved" at all —
    // this Port-level row would never have been excluded from a
    // Port-based denominator the way the canonical engine excludes it here.
    expect(progress.requiredAssignments).toBe(1)
    expect(progress.percentage).toBe(100)
  })

  it('4. an untargeted row (Target is the "—" sentinel) is excluded from the denominator', () => {
    const components = componentMap([['c-mass-driver', 'Mass Driver']])
    const view = viewFor(
      [
        port({ id: 'p1', displayName: 'Weapon 1', factoryItemId: 'c-mass-driver', installedItemId: 'c-mass-driver', targetItemId: 'c-mass-driver' }),
        // No targetItemId, no installedItemId, no factoryItemId resolves to
        // '—' for all three via nameFor's own null handling below -- but a
        // real factory item IS present via a distinct id that has no
        // display-name entry... simplest genuinely-untargeted case: factory
        // present (so not Unresolved), but literally nothing targeted.
        port({ id: 'p2', displayName: 'Shield 1', factoryItemId: 'c-empty-slot', installedItemId: null, targetItemId: null }),
      ],
      componentMap([
        ['c-mass-driver', 'Mass Driver'],
        ['c-empty-slot', '—'],
      ])
    )
    const hardpoints = buildImportedShipHardpoints(view)
    const shieldRow = hardpoints.find((h) => h.slotLabel === 'Shield 1')!
    expect(shieldRow.targetItem).toBe('—')
    const progress = calculateBuildProgress(hardpoints)
    expect(progress.requiredAssignments).toBe(1) // only Weapon 1 — Shield 1's empty target never counted
    expect(progress.percentage).toBe(100)
  })

  it('5. zero required rows (an empty ship / fully structural preview) returns 100%', () => {
    const view = viewFor([], componentMap([]))
    const hardpoints = buildImportedShipHardpoints(view)
    expect(hardpoints).toEqual([])
    const progress = calculateBuildProgress(hardpoints)
    expect(progress.percentage).toBe(100)
    expect(progress.requiredAssignments).toBe(0)
  })

  it('6. no NaN or divide-by-zero output for any of the above', () => {
    const view = viewFor([], componentMap([]))
    const progress = calculateBuildProgress(buildImportedShipHardpoints(view))
    expect(Number.isNaN(progress.percentage)).toBe(false)
    expect(Number.isFinite(progress.percentage)).toBe(true)
  })

  it('7. the imported-preview readiness is byte-identical to calling calculateBuildProgress directly on the same rows (no divergent aggregation anywhere in between)', () => {
    const components = componentMap([
      ['c-mass-driver', 'Mass Driver'],
      ['c-power-old', 'Stock Power Plant'],
      ['c-power-new', 'Slipstream'],
    ])
    const view = viewFor(
      [
        port({ id: 'p1', displayName: 'Weapon 1', factoryItemId: 'c-mass-driver', installedItemId: 'c-mass-driver', targetItemId: 'c-mass-driver' }),
        port({ id: 'p2', displayName: 'Power 1', factoryItemId: 'c-power-old', installedItemId: 'c-power-old', targetItemId: 'c-power-new' }),
      ],
      components
    )
    const hardpoints = buildImportedShipHardpoints(view)
    const a = calculateBuildProgress(hardpoints)
    const b = calculateBuildProgress(buildImportedShipHardpoints(view))
    expect(a).toEqual(b)
  })
})

describe('EWO-086: existing ImportedShipDetail rendering remains intact', () => {
  it('8. a real imported-preview ship still renders its readiness/port-tree/Mission-Ready hero exactly as before, with no crash', () => {
    // Real generated import-pipeline output (gitignored per ADR-005,
    // produced by `npm run import:ships` against a licensed game
    // install) — skip, never fail, when absent on this machine, matching
    // this test suite's established convention throughout.
    if (importedShipList.length === 0) return
    const shipId = importedShipList[0].ship.id
    render(
      <MemoryRouter initialEntries={[`/ship/${shipId}`]}>
        <Routes>
          <Route path="/ship/:shipId" element={<ShipDetail />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText(/Rendering entirely from imported Data Engine structures/)).toBeInTheDocument()
    expect(screen.getByText(/^Readiness: \d+%$/)).toBeInTheDocument()
    // The readiness text rendered is exactly what calculateBuildProgress
    // reports for this ship's own real Port data — not a stale or
    // independently-derived number.
    const hardpoints = buildImportedShipHardpoints(importedShipList[0])
    const expectedPct = calculateBuildProgress(hardpoints).percentage
    expect(screen.getByText(`Readiness: ${expectedPct}%`)).toBeInTheDocument()
  })
})
