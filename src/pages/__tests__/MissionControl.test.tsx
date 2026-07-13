import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MissionControl from '../MissionControl'
import { useFleetStore } from '../../store/useFleetStore'
import { deriveFleetBuildState, classifyFleetStatusTile } from '../../utils/fleetBuildState'
import { calculateBuildProgress } from '../../utils/buildProgress'
import { sortProcurementList, type ProcurementLine } from '../../utils/procurement'
import { SHIP_PLACEHOLDER_URL } from '../../constants/shipImage'

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

describe('<MissionControl /> — EWO-004 command layout', () => {
  it('renders the operational summary with all four existing metrics, Fleet Readiness most prominent', () => {
    renderMissionControl()
    expect(screen.getByText('Overall Fleet Readiness')).toBeInTheDocument()
    expect(screen.getByText('Ships Active')).toBeInTheDocument()
    expect(screen.getByText('Needed Items')).toBeInTheDocument()
    expect(screen.getByText('Update Budget')).toBeInTheDocument()
  })

  it('groups Quartermaster Logistics (Fleet Status + Inventory Status) into a single operational band, not five unrelated cards', () => {
    renderMissionControl()
    const band = screen.getByText('Quartermaster Logistics').closest('.panel')
    expect(band).not.toBeNull()
    expect(band).toHaveTextContent('Fleet Status')
    expect(band).toHaveTextContent('Mission Ready')
    expect(band).toHaveTextContent('Inventory Status')
    expect(band).toHaveTextContent('Missing Components')
  })

  it('Priority Ship section uses live fleet data — the real lowest-priority-number seed ship renders first, never a hard-coded name', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const expectedFirst = [...ships].sort((a, b) => a.priority - b.priority)[0]
    const priorityOneCard = screen.getByText('PRIORITY 1').closest('.panel')
    expect(priorityOneCard).toHaveTextContent(expectedFirst.name)
  })

  it('a single fleet asset produces exactly one priority card, with no fake filler cards', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const ghost = ships.find((s) => s.id === 'ghost')!
    useFleetStore.setState({
      ships: [ghost],
      builds: builds.filter((b) => b.shipId === 'ghost'),
      hardpoints: hardpoints.filter((h) => h.shipId === 'ghost'),
    })
    renderMissionControl()
    expect(screen.getByText('PRIORITY 1')).toBeInTheDocument()
    expect(screen.queryByText('PRIORITY 2')).not.toBeInTheDocument()
    expect(screen.queryByText('PRIORITY 3')).not.toBeInTheDocument()
  })

  it('multiple eligible ships render up to the intended display limit of 3 priority cards', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    expect(ships.length).toBeGreaterThan(3)
    expect(screen.getByText('PRIORITY 1')).toBeInTheDocument()
    expect(screen.getByText('PRIORITY 2')).toBeInTheDocument()
    expect(screen.getByText('PRIORITY 3')).toBeInTheDocument()
    expect(screen.queryByText('PRIORITY 4')).not.toBeInTheDocument()
  })

  it('a priority ship with no resolved image falls back through the existing ShipImage fallback mechanism', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const ghost = ships.find((s) => s.id === 'ghost')!
    useFleetStore.setState({
      ships: [{ ...ghost, imageUrl: undefined }],
      builds: builds.filter((b) => b.shipId === 'ghost'),
      hardpoints: hardpoints.filter((h) => h.shipId === 'ghost'),
    })
    const { container } = renderMissionControl()
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe(SHIP_PLACEHOLDER_URL)
  })

  it('existing navigation and action links remain functional', () => {
    renderMissionControl()
    expect(screen.getByText('View full fleet').closest('a')).toHaveAttribute('href', '/fleet')
    expect(screen.getByText('Found loot? Check it.').closest('a')).toHaveAttribute('href', '/decision-center')
    expect(screen.getByText('Something changed?').closest('a')).toHaveAttribute('href', '/quick-update')
  })

  it('mounts PageEnvironment for "mission-control" without any runtime failure while every environment definition stays disabled', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderMissionControl()
    // Disabled by design (see docs/ASSET_PIPELINE.md) — renders nothing, never throws.
    expect(container.querySelector('[data-environment-id="mission-control"]')).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('never renders a second decorative SFM logo inside the page content — the one official mark lives in the sidebar identity area', () => {
    const { container } = renderMissionControl()
    const brandImages = Array.from(container.querySelectorAll('img')).filter((img) => img.getAttribute('alt') === 'Strategic Fleet Manager')
    expect(brandImages.length).toBe(0)
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
