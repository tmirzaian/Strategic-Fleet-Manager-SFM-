import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MissionControl from '../MissionControl'
import FleetDashboard from '../FleetDashboard'
import { useFleetStore } from '../../store/useFleetStore'
import { prepareCanonicalHardpoints } from '../../utils/canonicalHardpointPreparation'
import { calculateBuildProgress } from '../../utils/buildProgress'
import type { Ship, Build, Hardpoint } from '../../types'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

/**
 * EWO-089 — "Canonical Hardpoint Input Reconciliation." EWO-087's audit
 * (§0.3) found Mission Control/Fleet Dashboard feeding `calculateBuildProgress`
 * raw, unreconciled hardpoints while Ship Management/Ship Detail feed it
 * `prepareCanonicalHardpoints`-reconciled rows. The one case where this
 * actually changes the computed percentage (not just structural metadata
 * calculateBuildProgress never reads): a component-owned child slot (a
 * mining head's module port) whose parent was SWAPPED away from its
 * factory identity. `withComponentOwnedChildSlots` correctly discards the
 * stale, now-orphaned child assignment for the OLD factory component —
 * Ship Management/Ship Detail already benefit from that correction; before
 * this fix, Mission Control/Fleet Dashboard still counted the stale child
 * as a real missing requirement, silently under-reporting readiness.
 *
 * Fixture: a Mining Head whose FACTORY identity is Arbor (real entityClass
 * `Mining_Laser_GRIN_Arbor_S1`, 1 known module slot) but whose
 * Installed/Target identity has been swapped to Lancet (real entityClass
 * `Mining_Laser_GRIN_Lancet_S1`, also 1 known module slot) — matched, so
 * not itself a demand. A REAL, already-persisted child row for the OLD
 * Arbor's module slot still exists with a real Missing target ("Ice
 * Module") — stale because the parent no longer IS an Arbor.
 *   RAW (pre-fix): required = [parent (OK), stale child (Missing)] -> 50%.
 *   RECONCILED: the stale child is discarded and replaced with a fresh,
 *   blank (target '—', never required) child for Lancet -> 100%.
 */
function buildMiningHeadSwapFixture(): { ship: Ship; build: Build; hardpoints: Hardpoint[] } {
  const ship: Ship = {
    id: 'test-mining-ship',
    name: 'Test Mining Ship',
    manufacturer: 'Argo',
    ownership: 'Owned',
    career: 'Industrial',
    role: 'Mining',
    activeBuildId: 'test-mining-build',
    readiness: 0,
    priority: 1,
    missing: [],
    lifecycleStatus: 'active',
  }
  const build: Build = {
    id: 'test-mining-build',
    shipId: ship.id,
    name: 'Mining Build',
    role: 'Mining',
    isActive: true,
    kind: 'CUSTOM',
  } as Build

  const parent: Hardpoint = {
    id: 'mh-parent',
    shipId: ship.id,
    buildId: build.id,
    slotLabel: 'Mining Head 1',
    type: 'Mining Laser',
    size: 'S1',
    isStructural: false,
    factoryItem: 'Arbor MH1',
    installedItem: 'Lancet MH1',
    targetItem: 'Lancet MH1',
    status: 'OK',
    factoryEntityClass: 'Mining_Laser_GRIN_Arbor_S1',
    installedEntityClass: 'Mining_Laser_GRIN_Lancet_S1',
    targetEntityClass: 'Mining_Laser_GRIN_Lancet_S1',
  }
  const staleChild: Hardpoint = {
    id: 'mh-parent-module-slot-1',
    shipId: ship.id,
    buildId: build.id,
    slotLabel: 'Mining Head 1 — Module Slot 1',
    parentSlotLabel: 'Mining Head 1',
    type: 'Mining Module',
    size: 'S1',
    isStructural: false,
    factoryItem: '—',
    installedItem: '—',
    targetItem: 'Ice Module',
    status: 'Missing',
  }
  return { ship, build, hardpoints: [parent, staleChild] }
}

describe('EWO-089: Mission Control / Fleet Dashboard now reconcile hardpoints before computing readiness', () => {
  it('sanity check: the fixture genuinely differs between raw and reconciled input (proves the scenario is real, not vacuous)', () => {
    const { ship, hardpoints } = buildMiningHeadSwapFixture()
    const raw = calculateBuildProgress(hardpoints)
    const reconciled = calculateBuildProgress(prepareCanonicalHardpoints(ship.id, hardpoints, []))
    expect(raw.percentage).toBe(50)
    expect(reconciled.percentage).toBe(100)
  })

  it('Mission Control shows the RECONCILED percentage (100%), matching Ship Management, not the raw 50%', () => {
    const { ship, build, hardpoints } = buildMiningHeadSwapFixture()
    useFleetStore.setState({ ships: [ship], builds: [build], hardpoints, fleetAssets: [] })
    render(
      <MemoryRouter>
        <MissionControl />
      </MemoryRouter>
    )
    // The fixture replaces `ships` entirely, so "Test Mining Ship" is the
    // only ship on the page — no scoping ambiguity needed. ShipCard renders
    // "Mission Ready" (not a numeric bar) exactly when isComplete is true —
    // i.e. only when the RECONCILED 100% (not the raw 50%) reaches it.
    expect(screen.getAllByText('Test Mining Ship').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mission Ready').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Ice Module/)).not.toBeInTheDocument()
  })

  it('Fleet Dashboard shows the RECONCILED percentage (100%), matching Ship Management, not the raw 50%', () => {
    const { ship, build, hardpoints } = buildMiningHeadSwapFixture()
    useFleetStore.setState({ ships: [ship], builds: [build], hardpoints, fleetAssets: [] })
    render(
      <MemoryRouter>
        <FleetDashboard />
      </MemoryRouter>
    )
    expect(screen.getByText('Test Mining Ship')).toBeInTheDocument()
    expect(screen.getByText('Mission Ready')).toBeInTheDocument()
    expect(screen.queryByText(/Ice Module/)).not.toBeInTheDocument()
  })
})
