import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MissionControl from '../MissionControl'
import { useFleetStore } from '../../store/useFleetStore'
import { deriveFleetBuildState, classifyFleetStatusTile } from '../../utils/fleetBuildState'
import { calculateBuildProgress } from '../../utils/buildProgress'
import { sortProcurementList, type ProcurementLine } from '../../utils/procurement'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderMissionControl() {
  return render(
    <MemoryRouter>
      <MissionControl />
    </MemoryRouter>
  )
}

describe('Fleet Status invariant (Alpha 2.5A, Part 1/4)', () => {
  it('4. Mission Ready + Loadouts In Progress + Factory Loadout always equals Ships Active, for the real seed fleet', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    let missionReady = 0
    let inProgress = 0
    let factory = 0
    for (const ship of ships) {
      const build = builds.find((b) => b.id === ship.activeBuildId)
      const progress = calculateBuildProgress(hardpoints.filter((h) => h.buildId === ship.activeBuildId))
      const tile = classifyFleetStatusTile(deriveFleetBuildState(build, progress))
      if (tile === 'MISSION_READY') missionReady += 1
      else if (tile === 'FACTORY_LOADOUT') factory += 1
      else inProgress += 1
    }
    expect(missionReady + inProgress + factory).toBe(ships.length)
  })

  it('5. Factory-only ship (UTV) is counted under Factory Loadout', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const utv = ships.find((s) => s.id === 'utv')!
    const utvBuild = builds.find((b) => b.id === utv.activeBuildId)!
    expect(utvBuild.kind).toBe('FACTORY')
    const progress = calculateBuildProgress(hardpoints.filter((h) => h.buildId === utv.activeBuildId))
    expect(classifyFleetStatusTile(deriveFleetBuildState(utvBuild, progress))).toBe('FACTORY_LOADOUT')
  })

  it('6. a completed real custom Loadout (Corsair) is counted under Mission Ready', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const corsair = ships.find((s) => s.id === 'corsair')!
    const build = builds.find((b) => b.id === corsair.activeBuildId)!
    const progress = calculateBuildProgress(hardpoints.filter((h) => h.buildId === corsair.activeBuildId))
    expect(classifyFleetStatusTile(deriveFleetBuildState(build, progress))).toBe('MISSION_READY')
  })

  it('7. an incomplete custom Loadout (Ghost, default seed state) is counted under Loadouts In Progress', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const ghost = ships.find((s) => s.id === 'ghost')!
    const build = builds.find((b) => b.id === ghost.activeBuildId)!
    const progress = calculateBuildProgress(hardpoints.filter((h) => h.buildId === ghost.activeBuildId))
    expect(classifyFleetStatusTile(deriveFleetBuildState(build, progress))).toBe('LOADOUTS_IN_PROGRESS')
  })
})

describe('<MissionControl /> rendering (terminology + context names)', () => {
  it('9/10/11: Fleet Status tiles show represented ship names', () => {
    renderMissionControl()
    expect(screen.getByText('Mission Ready')).toBeInTheDocument()
    expect(screen.getByText('Loadouts In Progress')).toBeInTheDocument()
    expect(screen.getByText('Factory Loadout')).toBeInTheDocument()
  })

  it('14. clicking a displayed ship name links to its Ship Detail route', () => {
    renderMissionControl()
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/ship/corsair')
    expect(link).toBeDefined()
  })

  it('17/18/19: retired terms never render on Mission Control', () => {
    renderMissionControl()
    expect(screen.queryByText('Package Staged')).not.toBeInTheDocument()
    expect(screen.queryByText('Collecting Parts')).not.toBeInTheDocument()
    expect(screen.queryByText('Available to Reserve')).not.toBeInTheDocument()
  })

  it('15/16: Missing Components and Unreserved Inventory remain component-quantity tiles', () => {
    renderMissionControl()
    expect(screen.getByText('Missing Components')).toBeInTheDocument()
    expect(screen.getAllByText('Unreserved Inventory').length).toBeGreaterThan(0)
  })

  it('25. the non-sortable Needed By header renders without a sort button', () => {
    renderMissionControl()
    const header = screen.getByText('Needed By')
    expect(header.closest('button')).toBeNull()
  })

  it('26. the active sort column exposes aria-sort', () => {
    renderMissionControl()
    const nameHeader = screen.getByText('Component Name').closest('th')
    expect(nameHeader?.getAttribute('aria-sort')).toBe('ascending')
  })
})

describe('Procurement sorting on Mission Control (tests 20-23)', () => {
  const sample: ProcurementLine[] = [
    { itemName: 'Zebra Cooler', type: 'Cooler', size: 'S2', qtyNeeded: 3, availableToReserve: 1, neededBy: [] },
    { itemName: 'Alpha Shield', type: 'Shield', size: 'S10', qtyNeeded: 1, availableToReserve: 5, neededBy: [] },
    { itemName: 'Mid Weapon', type: 'Weapon', size: 'S2', qtyNeeded: 5, availableToReserve: 0, neededBy: [] },
  ]

  it('20. sorts by Component Name', () => {
    expect(sortProcurementList(sample, 'name', 'asc').map((l) => l.itemName)).toEqual(['Alpha Shield', 'Mid Weapon', 'Zebra Cooler'])
  })

  it('21. sorts by Size / Type numerically', () => {
    const sorted = sortProcurementList(sample, 'sizeType', 'asc')
    expect(sorted[sorted.length - 1].itemName).toBe('Alpha Shield')
  })

  it('22. sorts by Qty Needed', () => {
    expect(sortProcurementList(sample, 'quantity', 'asc').map((l) => l.qtyNeeded)).toEqual([1, 3, 5])
  })

  it('23. sorts by Unreserved Inventory, numeric', () => {
    const asc = sortProcurementList(sample, 'unreserved', 'asc')
    expect(asc.map((l) => l.availableToReserve)).toEqual([0, 1, 5])
    const desc = sortProcurementList(sample, 'unreserved', 'desc')
    expect(desc.map((l) => l.availableToReserve)).toEqual([5, 1, 0])
  })
})

describe('<MissionControl /> — Mission M-012 empty-state', () => {
  it('9. renders a valid, deliberate empty state with zero ships (not a blank page or crash)', () => {
    useFleetStore.setState({ ships: [], builds: [], hardpoints: [] })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderMissionControl()
    expect(screen.getByText('No Vessels Assigned')).toBeInTheDocument()
    expect(screen.getByText('Your fleet manifest is currently empty.')).toBeInTheDocument()
    expect(screen.getByText('Add First Ship')).toBeInTheDocument()
    // Stat tiles must still render (all zero), not crash.
    expect(screen.getByText('Ships Active')).toBeInTheDocument()
    // 10. no console errors in the empty state.
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
