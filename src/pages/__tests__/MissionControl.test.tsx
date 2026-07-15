import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MissionControl from '../MissionControl'
import FleetDashboard from '../FleetDashboard'
import { useFleetStore } from '../../store/useFleetStore'
import { deriveFleetBuildState, classifyFleetStatusTile } from '../../utils/fleetBuildState'
import { calculateBuildProgress } from '../../utils/buildProgress'
import { sortProcurementList, type ProcurementLine } from '../../utils/procurement'
import { SHIP_PLACEHOLDER_URL } from '../../constants/shipImage'
import { FLEET_REGISTRY_PLACEHOLDER } from '../../config/assets'

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
    // EWO-033 (Task 2): with the Priority section now showing the Top 4
    // (not 3), a priority card's own status text ("Mission Ready"/"Factory
    // Loadout") can legitimately also match one of the Top 4 ships' own
    // ShipCard status region — getAllByText tolerates that overlap rather
    // than asserting exclusivity this test was never actually about.
    expect(screen.getAllByText('Mission Ready').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Loadouts In Progress').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Factory Loadout').length).toBeGreaterThan(0)
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

describe('<MissionControl /> — EWO-006 command surface composition', () => {
  it('renders the Fleet Readiness command rail with its two supporting metrics, Fleet Readiness most prominent', () => {
    renderMissionControl()
    expect(screen.getByText('Overall Fleet Readiness')).toBeInTheDocument()
    expect(screen.getByText('Ships Active')).toBeInTheDocument()
    expect(screen.getByText('Needed Items')).toBeInTheDocument()
  })

  it('the two supporting metrics are contained within the same command rail panel as Fleet Readiness', () => {
    renderMissionControl()
    const readiness = screen.getByText('Overall Fleet Readiness').closest('.panel')
    expect(readiness).not.toBeNull()
    expect(readiness).toHaveTextContent('Ships Active')
    expect(readiness).toHaveTextContent('Needed Items')
  })

  it('Quartermaster Logistics contains all five existing logistics/inventory values as one operational band', () => {
    renderMissionControl()
    const band = screen.getByText('Quartermaster Logistics').closest('.panel')
    expect(band).not.toBeNull()
    expect(band).toHaveTextContent('Mission Ready')
    expect(band).toHaveTextContent('Loadouts In Progress')
    expect(band).toHaveTextContent('Factory Loadout')
    expect(band).toHaveTextContent('Missing Components')
    expect(band).toHaveTextContent('Unreserved Inventory')
  })

  it('Priority Ship section uses live fleet data — the real lowest-priority-number seed ship renders first, never a hard-coded name', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const expectedFirst = [...ships].sort((a, b) => a.priority - b.priority)[0]
    // EWO-032: the "PRIORITY N" label is a sibling above the Fleet Ship
    // Card, not a badge inside it — look up the shared wrapper, not '.panel'.
    const priorityOneCard = screen.getByText('PRIORITY 1').closest('[data-testid="priority-card-wrapper"]')
    expect(priorityOneCard).toHaveTextContent(expectedFirst.name)
  })

  it('a single fleet asset produces exactly one priority record, with no fake filler', () => {
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
  })

  it('multiple eligible ships render up to the intended display limit of 4 priority records (EWO-033, Task 2)', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    expect(ships.length).toBeGreaterThan(4)
    expect(screen.getByText('PRIORITY 1')).toBeInTheDocument()
    expect(screen.getByText('PRIORITY 2')).toBeInTheDocument()
    expect(screen.getByText('PRIORITY 3')).toBeInTheDocument()
    expect(screen.getByText('PRIORITY 4')).toBeInTheDocument()
    expect(screen.queryByText('PRIORITY 5')).not.toBeInTheDocument()
  })

  it('8/9. EWO-033: exactly the four highest-priority Fleet Assets render when the fleet has 4+ ships — the fifth-highest is excluded', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const sorted = [...ships].sort((a, b) => a.priority - b.priority)
    expect(sorted.length).toBeGreaterThan(4)
    const top4 = sorted.slice(0, 4)
    const fifth = sorted[4]
    const wrapperNames = screen.getAllByTestId('priority-card-wrapper').map((w) => w.textContent ?? '')
    for (const ship of top4) {
      expect(wrapperNames.some((text) => text.includes(ship.name))).toBe(true)
    }
    // The fifth-highest-priority ship may legitimately still appear
    // elsewhere on the page (Fleet Status tiles, Procurement, etc.) — the
    // real assertion is that only 4 priority-card wrappers exist at all.
    expect(wrapperNames).toHaveLength(4)
    expect(wrapperNames.some((text) => text.includes(fifth.name))).toBe(false)
  })

  it('11. EWO-033: a small fleet (1-3 ships) renders safely, with no invented filler card', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const three = [...ships].sort((a, b) => a.priority - b.priority).slice(0, 3)
    const ids = new Set(three.map((s) => s.id))
    useFleetStore.setState({
      ships: three,
      builds: builds.filter((b) => ids.has(b.shipId)),
      hardpoints: hardpoints.filter((h) => ids.has(h.shipId)),
    })
    renderMissionControl()
    expect(screen.getAllByTestId('priority-card-wrapper')).toHaveLength(3)
    expect(screen.queryByText('PRIORITY 4')).not.toBeInTheDocument()
  })

  it('exactly two eligible fleet assets render exactly two priority records (EWO-012)', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const two = [...ships].sort((a, b) => a.priority - b.priority).slice(0, 2)
    const ids = new Set(two.map((s) => s.id))
    useFleetStore.setState({
      ships: two,
      builds: builds.filter((b) => ids.has(b.shipId)),
      hardpoints: hardpoints.filter((h) => ids.has(h.shipId)),
    })
    renderMissionControl()
    expect(screen.getByText('PRIORITY 1')).toBeInTheDocument()
    expect(screen.getByText('PRIORITY 2')).toBeInTheDocument()
    expect(screen.queryByText('PRIORITY 3')).not.toBeInTheDocument()
  })

  it('10. priority ordering remains unchanged — records render in ascending priority order (EWO-033, Task 2/6: Top 4, sort/slice logic untouched)', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const expected = [...ships].sort((a, b) => a.priority - b.priority).slice(0, 4)
    const badges = screen.getAllByText(/^PRIORITY \d$/)
    expect(badges).toHaveLength(expected.length)
    badges.forEach((badge, i) => {
      const card = badge.closest('[data-testid="priority-card-wrapper"]')
      expect(card).toHaveTextContent(expected[i].name)
    })
  })

  it('13. EWO-032/EWO-033 (Task 4): the entire card is the navigation target on every rendered priority record — no separate "Ship Detail" hyperlink', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const expected = [...ships].sort((a, b) => a.priority - b.priority).slice(0, 4)
    expect(screen.queryByText('Ship Detail')).not.toBeInTheDocument()
    const wrappers = screen.getAllByTestId('priority-card-wrapper')
    expect(wrappers).toHaveLength(expected.length)
    wrappers.forEach((wrapper, i) => {
      const cardLink = within(wrapper).getByRole('link')
      expect(cardLink).toHaveAttribute('href', `/ship/${expected[i].id}`)
    })
  })

  it('EWO-032: a priority ship with no resolved image renders exactly the same fallback Fleet Dashboard\'s Fleet Ship Card renders — Mission Control no longer diverges', () => {
    // Prior to EWO-032, Mission Control rendered ShipRecordCard, which
    // explicitly passed the newer Fleet Registry placeholder as its own
    // fallback (EWO-006A). Fleet Dashboard's ShipCard — now the one
    // canonical card both pages share — has never done that; it relies on
    // ShipImage's own default fallback (SHIP_PLACEHOLDER_URL). Now that
    // Mission Control renders the exact same ShipCard component (Task
    // 2/7), it correctly picks up that exact same fallback too — matching
    // Fleet Dashboard's real, current behavior is the point of
    // standardization, not a regression to guard against.
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

  it('the approved Fleet Registry placeholder constant itself is still correctly configured (used elsewhere in the app, e.g. Ship Detail)', () => {
    expect(FLEET_REGISTRY_PLACEHOLDER).toBe('/assets/fleet-registry/placeholders/ship-placeholder-master-1024.png')
  })

  it('EWO-032: Mission Control never renders a broken/undefined image src, even with no resolved ship image', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const ghost = ships.find((s) => s.id === 'ghost')!
    useFleetStore.setState({
      ships: [{ ...ghost, imageUrl: undefined }],
      builds: builds.filter((b) => b.shipId === 'ghost'),
      hardpoints: hardpoints.filter((h) => h.shipId === 'ghost'),
    })
    const { container } = renderMissionControl()
    const images = Array.from(container.querySelectorAll('img'))
    expect(images.length).toBeGreaterThan(0)
    expect(images.every((img) => Boolean(img.getAttribute('src')))).toBe(true)
  })

  it('existing navigation and action links remain functional', () => {
    renderMissionControl()
    expect(screen.getByText('Full fleet').closest('a')).toHaveAttribute('href', '/fleet')
    expect(screen.getByText('Found Loot? Check It.').closest('a')).toHaveAttribute('href', '/decision-center')
    expect(screen.getByText('Something Changed?').closest('a')).toHaveAttribute('href', '/quick-update')
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

  it('EWO-006: uses "Loadout target" terminology in the empty-procurement message, not the stale "Build target" phrase', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const corsair = ships.find((s) => s.id === 'corsair')!
    useFleetStore.setState({
      ships: [corsair],
      builds: builds.filter((b) => b.shipId === 'corsair'),
      hardpoints: hardpoints.filter((h) => h.shipId === 'corsair'),
      hangarItems: [],
    })
    renderMissionControl()
    expect(screen.queryByText(/Build target/)).not.toBeInTheDocument()
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

describe('<MissionControl /> — EWO-011 Design Freeze', () => {
  it('1. no explanatory/marketing copy renders beyond the two-line identity header', () => {
    renderMissionControl()
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    expect(screen.getByText('Fleet Operations')).toBeInTheDocument()
    expect(screen.queryByText(/welcome/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/track your fleet/i)).not.toBeInTheDocument()
  })

  it('3. Update Budget appears exactly once on the page (footer only — the command rail no longer renders it)', () => {
    renderMissionControl()
    expect(screen.getAllByText('Update Budget · 2 min')).toHaveLength(1)
    expect(screen.queryByText('Update Budget')).not.toBeInTheDocument()
  })

  it('4/5/7. the two rail supporting metrics and all five Quartermaster Logistics counts share one critical-metric-tile scale', () => {
    const { container } = renderMissionControl()
    // Every critical count (Ships Active, Needed Items, Mission Ready, Loadouts In
    // Progress, Factory Loadout, Missing Components, Unreserved Inventory) renders
    // through the shared CriticalMetricTile contract — same value/label typography.
    const values = container.querySelectorAll('.panel .text-2xl.font-display.font-bold')
    expect(values.length).toBe(7)
  })

  it('6. Quartermaster Logistics renders all five critical cards', () => {
    renderMissionControl()
    // EWO-033 (Task 2): getAllByText tolerates a Top-4 priority card's own
    // status text legitimately overlapping a Fleet Status tile's label —
    // see the identical note on the "Fleet Status tiles" test above.
    expect(screen.getAllByText('Mission Ready').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Loadouts In Progress').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Factory Loadout').length).toBeGreaterThan(0)
    expect(screen.getByText('Missing Components')).toBeInTheDocument()
    // Also appears as a Procurement column header — the Logistics tile is one of the matches.
    expect(screen.getAllByText('Unreserved Inventory').length).toBeGreaterThan(0)
  })

  it('9/10. EWO-032: Priority Ship renders through the canonical Fleet Ship Card — image and metadata share one integrated card, the exact same component Fleet Dashboard uses', () => {
    renderMissionControl()
    const wrapper = screen.getByText('PRIORITY 1').closest('[data-testid="priority-card-wrapper"]') as HTMLElement
    // The Fleet Ship Card itself is the '.panel' — a sibling of the
    // "PRIORITY 1" label within the shared wrapper, not a descendant of it
    // (Task 3: only the Priority label is unique to Mission Control).
    const card = wrapper.querySelector('.panel') as HTMLElement
    expect(card).not.toBeNull()
    const img = card.querySelector('img')
    expect(img).not.toBeNull()
    expect(card.contains(img)).toBe(true)
  })

  it("EWO-032 (Task 5): the Fleet Ship Card's info hierarchy lists manufacturer/role before Active Loadout — no information reduction from Fleet Dashboard", () => {
    renderMissionControl()
    const { ships, builds } = useFleetStore.getState()
    const first = [...ships].sort((a, b) => a.priority - b.priority)[0]
    const wrapper = screen.getByText('PRIORITY 1').closest('[data-testid="priority-card-wrapper"]') as HTMLElement
    const roleLine = within(wrapper).getByText(`${first.manufacturer} · ${first.role}`)
    const buildName = builds.find((b) => b.id === first.activeBuildId)?.name ?? 'Unknown Loadout'
    const loadout = within(wrapper).getByText(buildName)
    expect(roleLine.compareDocumentPosition(loadout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('12. EWO-032 (Task 4): clicking anywhere on the Priority Ship card navigates to Ship Detail — behavior exactly matches Fleet Dashboard, no separate hyperlink', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const first = [...ships].sort((a, b) => a.priority - b.priority)[0]
    const wrapper = screen.getByText('PRIORITY 1').closest('[data-testid="priority-card-wrapper"]') as HTMLElement
    const cardLink = within(wrapper).getByRole('link')
    expect(cardLink).toHaveAttribute('href', `/ship/${first.id}`)
    expect(screen.queryByText('Ship Detail')).not.toBeInTheDocument()
  })

  it('14/15. Workflow destinations link to Decision Center and Quick Update, and are not rendered as metric tiles', () => {
    renderMissionControl()
    const decisionCard = screen.getByText('Found Loot? Check It.').closest('a')
    const quickUpdateCard = screen.getByText('Something Changed?').closest('a')
    expect(decisionCard).toHaveAttribute('href', '/decision-center')
    expect(quickUpdateCard).toHaveAttribute('href', '/quick-update')
    // Workflow cards carry no numeric critical-metric value — only title, one
    // supporting line, and an "Open" action.
    expect(decisionCard!.querySelector('.text-2xl')).toBeNull()
    expect(quickUpdateCard!.querySelector('.text-2xl')).toBeNull()
    expect(within(decisionCard as HTMLElement).getByText('Open')).toBeInTheDocument()
  })

  it('16. the operational footer renders exactly once', () => {
    renderMissionControl()
    expect(screen.getAllByText(/Strategic Fleet Manager · Quartermaster Edition/)).toHaveLength(1)
  })
})

describe('<MissionControl /> — EWO-032: canonical Fleet Ship Card parity with Fleet Dashboard', () => {
  it('the same ship renders byte-identical Fleet Ship Card markup on Mission Control and Fleet Dashboard — one canonical component, no visual drift', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const topShip = [...ships].sort((a, b) => a.priority - b.priority)[0]
    const mcWrapper = screen.getByText('PRIORITY 1').closest('[data-testid="priority-card-wrapper"]') as HTMLElement
    const mcCard = mcWrapper.querySelector('.panel') as HTMLElement
    expect(mcCard).not.toBeNull()
    cleanup()

    render(
      <MemoryRouter>
        <FleetDashboard />
      </MemoryRouter>
    )
    const fdCard = screen.getByText(topShip.name).closest('.panel') as HTMLElement
    expect(fdCard).not.toBeNull()

    expect(mcCard.outerHTML).toBe(fdCard.outerHTML)
  })

  it('Fleet Dashboard itself renders unaffected by the Mission Control migration — same card grid, same empty-state behavior', () => {
    render(
      <MemoryRouter>
        <FleetDashboard />
      </MemoryRouter>
    )
    expect(screen.queryByText('No Vessels Assigned')).not.toBeInTheDocument()
    const { ships } = useFleetStore.getState()
    for (const ship of ships) {
      expect(screen.getByText(ship.name)).toBeInTheDocument()
    }
  })
})
