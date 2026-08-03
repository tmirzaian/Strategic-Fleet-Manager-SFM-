import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MissionControl from '../MissionControl'
import FleetDashboard from '../FleetDashboard'
import { useFleetStore } from '../../store/useFleetStore'
import { deriveFleetBuildState, classifyFleetStatusTile } from '../../utils/fleetBuildState'
import { calculateBuildProgress } from '../../utils/buildProgress'
import { sortProcurementList, type ProcurementLine } from '../../utils/procurement'
import { comparePriority } from '../../utils/fleetPriority'
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

/** Forces the seed 'ghost' ship into two simultaneous Priority Action
 * categories (Upgrade Opportunities + Invalid Targets) so tests can
 * assert on more than one Action Card at once. Shared across the
 * UX-001A.2 and UX-001A.4 describe blocks below. */
function forceTwoCategories() {
  const { ships, builds, hardpoints } = useFleetStore.getState()
  const ghost = ships.find((s) => s.id === 'ghost')!
  const ghostHardpoints = hardpoints.filter((h) => h.buildId === ghost.activeBuildId && !h.isStructural && h.targetItem && h.targetItem !== '—')
  useFleetStore.setState({
    ships: [ghost],
    builds: builds.filter((b) => b.shipId === 'ghost'),
    hardpoints: hardpoints.map((h) => {
      if (h.id === ghostHardpoints[0]?.id) return { ...h, status: 'Invalid Target' as const, invalidMessage: 'Test' }
      if (h.id === ghostHardpoints[1]?.id) return { ...h, status: 'Upgrade Available' as const }
      return h
    }),
  })
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
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/ship-workspace/corsair')
    expect(link).toBeDefined()
  })

  it('17/18/19: retired terms never render on Mission Control', () => {
    renderMissionControl()
    expect(screen.queryByText('Package Staged')).not.toBeInTheDocument()
    expect(screen.queryByText('Collecting Parts')).not.toBeInTheDocument()
    expect(screen.queryByText('Available to Reserve')).not.toBeInTheDocument()
  })

  it('UX-001B: Quartermaster Report summarizes demand by category rather than raw Missing Components/Unreserved Inventory counts', () => {
    renderMissionControl()
    expect(screen.getByText('Logistics Demand')).toBeInTheDocument()
    expect(screen.queryByText('Missing Components')).not.toBeInTheDocument()
    expect(screen.queryByText('Unreserved Inventory')).not.toBeInTheDocument()
  })

  it('25. the non-sortable Needed By header renders without a sort button', () => {
    renderMissionControl()
    const header = screen.getByText('Needed By')
    expect(header.closest('button')).toBeNull()
  })

  it('26. the active sort column exposes aria-sort — UX-001B defaults the Work Queue to State (Commander-value order), not Component Name', () => {
    renderMissionControl()
    const stateHeader = screen.getByText('State').closest('th')
    expect(stateHeader?.getAttribute('aria-sort')).toBe('ascending')
    const nameHeader = screen.getByText('Component Name').closest('th')
    expect(nameHeader?.getAttribute('aria-sort')).toBe('none')
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

describe('<MissionControl /> — UX-001A Command Briefing Hero (supersedes EWO-006 command surface composition)', () => {
  it('renders the three-column Command Briefing: Fleet Status, Operations Center (Fleet Readiness), and Priority Actions', () => {
    renderMissionControl()
    expect(screen.getByText('Fleet Status')).toBeInTheDocument()
    expect(screen.getByText('Overall Fleet Readiness')).toBeInTheDocument()
    expect(screen.getByText('Priority Actions')).toBeInTheDocument()
    expect(screen.getByText('Ships Active')).toBeInTheDocument()
    // Deliverable 4's own retirement of the old standalone "Needed Items"
    // count — Priority Actions now conveys that signal in actionable form.
    expect(screen.queryByText('Needed Items')).not.toBeInTheDocument()
  })

  it('Deliverable 2: Fleet Status (Ships Active, Mission Ready, Loadouts In Progress, Factory Loadout) is its own Hero column, separate from Operations Center', () => {
    renderMissionControl()
    const fleetStatusHeading = screen.getByText('Fleet Status')
    const fleetStatusColumn = fleetStatusHeading.parentElement as HTMLElement
    expect(fleetStatusColumn).toHaveTextContent('Ships Active')
    expect(fleetStatusColumn).toHaveTextContent('Mission Ready')
    expect(fleetStatusColumn).toHaveTextContent('Loadouts In Progress')
    expect(fleetStatusColumn).toHaveTextContent('Factory Loadout')
    // Operations Center carries only the Hero metric — no Fleet Status
    // counts leak into it (Deliverable 3: "shall not compete with
    // operational metrics").
    const readinessColumn = screen.getByText('Overall Fleet Readiness').parentElement as HTMLElement
    expect(readinessColumn).not.toHaveTextContent('Ships Active')
    expect(readinessColumn).not.toHaveTextContent('Mission Ready')
  })

  it('UX-001B: Quartermaster Report shows the Logistics Demand summary, not Fleet Status — Fleet Status stays relocated to the Hero, never duplicated', () => {
    renderMissionControl()
    const band = screen.getByText('Quartermaster Report').closest('.panel')
    expect(band).not.toBeNull()
    expect(band).toHaveTextContent('Logistics Demand')
    expect(band).not.toHaveTextContent('Mission Ready')
    expect(band).not.toHaveTextContent('Loadouts In Progress')
    expect(band).not.toHaveTextContent('Factory Loadout')
  })

  it('Priority Ship section uses live fleet data — the real lowest-priority-number seed ship renders first, never a hard-coded name', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const expectedFirst = [...ships].sort((a, b) => comparePriority(a.priority, b.priority))[0]
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
    const sorted = [...ships].sort((a, b) => comparePriority(a.priority, b.priority))
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
    const three = [...ships].sort((a, b) => comparePriority(a.priority, b.priority)).slice(0, 3)
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
    const two = [...ships].sort((a, b) => comparePriority(a.priority, b.priority)).slice(0, 2)
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
    const expected = [...ships].sort((a, b) => comparePriority(a.priority, b.priority)).slice(0, 4)
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
    const expected = [...ships].sort((a, b) => comparePriority(a.priority, b.priority)).slice(0, 4)
    expect(screen.queryByText('Ship Detail')).not.toBeInTheDocument()
    const wrappers = screen.getAllByTestId('priority-card-wrapper')
    expect(wrappers).toHaveLength(expected.length)
    wrappers.forEach((wrapper, i) => {
      const cardLink = within(wrapper).getByRole('link')
      expect(cardLink).toHaveAttribute('href', `/ship-workspace/${expected[i].id}`)
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
    // UX-001C — corrected destinations: Loot Lookup -> Decision Center,
    // Add Inventory -> Hangar Inventory (never Quick Update), Modify
    // Ship unchanged.
    expect(screen.getByText('Loot Lookup').closest('a')).toHaveAttribute('href', '/decision-center')
    expect(screen.getByText('Add Inventory').closest('a')).toHaveAttribute('href', '/hangar')
    expect(screen.getByText('Modify Ship').closest('a')).toHaveAttribute('href', '/ship-workspace')
  })

  it('EWO-115: no longer mounts its own local PageEnvironment layer — the Bridge plate moved to the app-wide FlagshipEnvironmentLayer (Part B), rendered once in App.tsx, not per-Station. Verified without throwing.', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderMissionControl()
    // In isolation (renderMissionControl renders <MissionControl /> alone,
    // not the full App shell), no `[data-environment-id]` node exists at
    // all — proof the environment is genuinely owned one layer up now,
    // not just visually relocated. See src/__tests__/App.test.tsx for the
    // real, full-shell assertion that FlagshipEnvironmentLayer renders the
    // mission-control-v2 plate specifically on "/".
    expect(container.querySelector('[data-environment-id]')).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('EWO-035A/UX-001A.1: Fleet Status and Priority Actions (which now carries Fleet Readiness) get their own translucent glass backdrop at the lg: breakpoint, so each stays legible over the brighter hero artwork; Operations Center carries no instrumentation and no backdrop to protect', () => {
    renderMissionControl()
    // UX-001A.1 (Deliverable 2) — Fleet Readiness now docks inside Priority
    // Actions; Operations Center is pure atmosphere with nothing left to
    // keep legible, so EWO-035A's own dimming treatment is removed there
    // (full presentation strength, per EWO-035A-R2's original philosophy).
    const readinessColumn = screen.getByText('Overall Fleet Readiness').closest('.panel')
    expect(readinessColumn).not.toBeNull()
    expect(readinessColumn!.className).toContain('lg:bg-panel/55')
    expect(readinessColumn!.className).toContain('lg:backdrop-blur-md')
    // Fleet Status (left) and Priority Actions (right) — the same `panel`
    // glass treatment the original single rail used.
    const fleetStatusColumn = screen.getByText('Fleet Status').closest('.panel')
    expect(fleetStatusColumn).not.toBeNull()
    expect(fleetStatusColumn!.className).toContain('lg:bg-panel/55')
    expect(fleetStatusColumn!.className).toContain('lg:backdrop-blur-md')
    expect(fleetStatusColumn!.className).not.toContain('lg:bg-transparent')
    const priorityActionsColumn = screen.getByText('Priority Actions').closest('.panel')
    expect(priorityActionsColumn).not.toBeNull()
    expect(priorityActionsColumn!.className).toContain('lg:bg-panel/55')
    expect(priorityActionsColumn!.className).toContain('lg:backdrop-blur-md')
  })

  it('EWO-115 (Part B): the hero region carries no bordered/rounded "image card" boundary and no deliberate shading/tint/gradient of its own — the Bridge plate is the app-wide backdrop, not a hero cell', () => {
    const { container } = renderMissionControl()
    const heroRoot = container.querySelector('[data-testid="bridge-hero"]') as HTMLElement
    expect(heroRoot).not.toBeNull()
    expect(heroRoot.className).not.toContain('bg-gradient-to-br')
    expect(heroRoot.className).not.toContain('from-panel')
    expect(heroRoot.className).not.toContain('to-bg')
    // EWO-115 Part B — no bordered/rounded hero-cell framing either,
    // unlike the EWO-114 StationEnvironmentMount-based hero it replaces.
    expect(heroRoot.className).not.toContain('lg:border')
    expect(heroRoot.className).not.toContain('rounded-xl')
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

describe('<MissionControl /> — UX-001A.1 Commander Review Amendments', () => {
  it('Deliverable 1: Ships Active carries the Advisory Gold parent-metric outline, and its three children sit inside a gold-tinted bracket container beneath it', () => {
    renderMissionControl()
    const fleetStatusColumn = screen.getByText('Fleet Status').parentElement as HTMLElement
    const shipsActiveTile = within(fleetStatusColumn).getByText('Ships Active').closest('.panel') as HTMLElement
    expect(shipsActiveTile).not.toBeNull()
    expect(shipsActiveTile.className).toContain('border-gold/40')
    // The children container is a distinct element from the parent tile,
    // sitting after it, with its own gold-tinted left border — the same
    // parent/branch visual grammar an org chart or file tree already uses.
    // EWO-033 (Task 2)'s own established note applies here too: "Mission
    // Ready" can legitimately also match a Top-4 priority card's own
    // status text elsewhere on the page — scoped to the Fleet Status
    // column specifically to disambiguate.
    const missionReadyTile = within(fleetStatusColumn).getByText('Mission Ready').closest('.panel') as HTMLElement
    const childrenContainer = missionReadyTile.parentElement as HTMLElement
    expect(childrenContainer.className).toContain('border-l')
    expect(childrenContainer.className).toContain('border-gold/20')
    expect(childrenContainer).toHaveTextContent('Loadouts In Progress')
    expect(childrenContainer).toHaveTextContent('Factory Loadout')
  })

  it('Deliverable 2: Fleet Readiness now docks at the top of the Priority Actions column, directly above the action queue; Operations Center carries no instrumentation at all', () => {
    renderMissionControl()
    const priorityActionsColumn = screen.getByText('Priority Actions').closest('.panel') as HTMLElement
    expect(priorityActionsColumn).toHaveTextContent('Overall Fleet Readiness')
    // Fleet Readiness renders BEFORE the "Priority Actions" label in
    // reading order — the gauge docks at the top of the column, not below.
    const readinessNode = within(priorityActionsColumn).getByText('Overall Fleet Readiness')
    const priorityActionsLabel = within(priorityActionsColumn).getByText('Priority Actions')
    expect(readinessNode.compareDocumentPosition(priorityActionsLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Operations Center itself is now a bare, content-free spacer.
    const bridgeHero = document.querySelector('[data-testid="bridge-hero"]') as HTMLElement
    const centerColumn = Array.from(bridgeHero.children).find(
      (el) => el.getAttribute('aria-hidden') === 'true' && el.className.includes('flex-1') && !el.className.includes('border-t') && !el.className.includes('border-b')
    ) as HTMLElement
    expect(centerColumn).not.toBeNull()
    expect(centerColumn.textContent).toBe('')
  })

  it('Deliverable 3: Priority Actions categories still resolve through the reordered, Commander-value PRIORITY_ACTION_CATEGORY_ORDER (Upgrade Opportunities ranks ahead of Invalid Targets)', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const ghost = ships.find((s) => s.id === 'ghost')!
    const ghostHardpoints = hardpoints.filter((h) => h.buildId === ghost.activeBuildId && !h.isStructural && h.targetItem && h.targetItem !== '—')
    useFleetStore.setState({
      ships: [ghost],
      builds: builds.filter((b) => b.shipId === 'ghost'),
      hardpoints: hardpoints.map((h) => {
        if (h.id === ghostHardpoints[0]?.id) return { ...h, status: 'Invalid Target' as const, invalidMessage: 'Test' }
        if (h.id === ghostHardpoints[1]?.id) return { ...h, status: 'Upgrade Available' as const }
        return h
      }),
    })
    renderMissionControl()
    const upgradeNode = screen.getByText('Upgrade Opportunities')
    const invalidNode = screen.getByText('Invalid Targets')
    expect(upgradeNode.compareDocumentPosition(invalidNode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Deliverable 4: ships within a Priority Actions category render in fleet priority order, not alphabetical order', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const zulu = { ...ships.find((s) => s.id === 'ghost')!, id: 'zulu-ship', name: 'Zulu', priority: 1 }
    const alpha = { ...ships.find((s) => s.id === 'corsair')!, id: 'alpha-ship', name: 'Alpha', priority: 9, activeBuildId: 'alpha-build' }
    const zuluBuild = { ...builds.find((b) => b.shipId === 'ghost')!, id: zulu.activeBuildId, shipId: zulu.id }
    const alphaBuild = { ...builds.find((b) => b.shipId === 'corsair')!, id: alpha.activeBuildId, shipId: alpha.id }
    const baseGhostHp = hardpoints.find((h) => h.buildId === ships.find((s) => s.id === 'ghost')!.activeBuildId && !h.isStructural && h.targetItem && h.targetItem !== '—')!
    const forcedZulu = { ...baseGhostHp, id: 'zulu-hp', shipId: zulu.id, buildId: zulu.activeBuildId, status: 'Invalid Target' as const, invalidMessage: 'Test' }
    const forcedAlpha = { ...baseGhostHp, id: 'alpha-hp', shipId: alpha.id, buildId: alpha.activeBuildId, status: 'Invalid Target' as const, invalidMessage: 'Test' }
    useFleetStore.setState({
      ships: [alpha, zulu],
      builds: [alphaBuild, zuluBuild],
      hardpoints: [forcedAlpha, forcedZulu],
    })
    renderMissionControl()
    const invalidTargetsRow = screen.getByText('Invalid Targets').closest('.flex.items-start') as HTMLElement
    const zuluLink = within(invalidTargetsRow).getByText('Zulu')
    const alphaLink = within(invalidTargetsRow).getByText('Alpha')
    // Zulu (priority 1, higher priority) must render before Alpha
    // (priority 9) despite Alpha sorting first alphabetically.
    expect(zuluLink.compareDocumentPosition(alphaLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('<MissionControl /> — UX-001A Deliverable 4: Priority Actions panel', () => {
  it('renders the "no immediate actions" empty state for a fleet with nothing outstanding', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const utv = ships.find((s) => s.id === 'utv')!
    useFleetStore.setState({
      ships: [utv],
      builds: builds.filter((b) => b.shipId === 'utv'),
      hardpoints: hardpoints.filter((h) => h.shipId === 'utv'),
    })
    renderMissionControl()
    expect(screen.getByText('No Immediate Priority Actions')).toBeInTheDocument()
  })

  it('a ship with an Invalid Target assignment renders under the Invalid Targets category, deep-linked to that ship\'s Ship Workspace', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const ghost = ships.find((s) => s.id === 'ghost')!
    const ghostHardpoints = hardpoints.filter((h) => h.buildId === ghost.activeBuildId)
    const targetSlot = ghostHardpoints.find((h) => !h.isStructural && h.targetItem && h.targetItem !== '—')!
    useFleetStore.setState({
      ships: [ghost],
      builds: builds.filter((b) => b.shipId === 'ghost'),
      hardpoints: hardpoints
        .filter((h) => h.shipId === 'ghost')
        .map((h) => (h.id === targetSlot.id ? { ...h, status: 'Invalid Target' as const, invalidMessage: 'Test-forced invalid target' } : h)),
    })
    renderMissionControl()
    // Scoped to the Invalid Targets row specifically — the Ghost's own
    // seed data can independently also have a genuinely Ready to Install
    // assignment elsewhere, which would otherwise make the ship's own name
    // ambiguous across two different Priority Actions rows.
    const invalidTargetsRow = screen.getByText('Invalid Targets').closest('.flex.items-start') as HTMLElement
    expect(invalidTargetsRow).not.toBeNull()
    const shipLink = within(invalidTargetsRow).getByText(ghost.name).closest('a')
    expect(shipLink).toHaveAttribute('href', `/ship-workspace/${ghost.id}`)
  })
})

describe('<MissionControl /> — UX-001A.2: Priority Actions render as individually bounded Action Cards', () => {
  it('Deliverable 1: each category renders as its own bounded card, not rows sharing one divided list', () => {
    forceTwoCategories()
    renderMissionControl()
    const upgradeCard = screen.getByText('Upgrade Opportunities').closest('.panel') as HTMLElement
    const invalidCard = screen.getByText('Invalid Targets').closest('.panel') as HTMLElement
    expect(upgradeCard).not.toBeNull()
    expect(invalidCard).not.toBeNull()
    // Two distinct cards, not one shared panel with an internal divider.
    expect(upgradeCard).not.toBe(invalidCard)
    expect(upgradeCard.className).not.toContain('divide-y')
    expect(invalidCard.className).not.toContain('divide-y')
  })

  it('Deliverable 2/3: each card carries its own severity-colored left border stripe and icon housing tint (accent applied in three places, per ActionCard\'s own doc comment)', () => {
    forceTwoCategories()
    renderMissionControl()
    const upgradeCard = screen.getByText('Upgrade Opportunities').closest('.panel') as HTMLElement
    const invalidCard = screen.getByText('Invalid Targets').closest('.panel') as HTMLElement
    // Operational Amber (Upgrade Opportunity) vs Alert Red (Invalid Target)
    // — distinct colors, each applied to that card's own left border stripe.
    expect(upgradeCard.style.borderLeftColor).toBe('rgb(255, 209, 102)')
    expect(invalidCard.style.borderLeftColor).toBe('rgb(255, 95, 115)')
    const upgradeIconBox = upgradeCard.querySelector('div[style*="background-color"]') as HTMLElement
    const invalidIconBox = invalidCard.querySelector('div[style*="background-color"]') as HTMLElement
    expect(upgradeIconBox).not.toBeNull()
    expect(invalidIconBox).not.toBeNull()
    expect(upgradeIconBox.style.backgroundColor).not.toBe(invalidIconBox.style.backgroundColor)
  })

  it('Deliverable 4/5: the Priority Actions panel renders one bounded card per category, stacked with the same rhythm as Fleet Status\'s own card stack', () => {
    forceTwoCategories()
    renderMissionControl()
    const priorityActionsColumn = screen.getByText('Priority Actions').closest('.panel') as HTMLElement
    // UX-001A.3 (Deliverable 2) widened this stack's own rhythm to gap-2.5.
    const cardStack = priorityActionsColumn.querySelector('.flex.flex-col.gap-2\\.5') as HTMLElement
    expect(cardStack).not.toBeNull()
    const cards = cardStack.querySelectorAll(':scope > .panel')
    expect(cards).toHaveLength(2)
  })
})

describe('<MissionControl /> — UX-001A.4/UX-001A.4A: Action Cards share Fleet Status\'s hierarchy without sharing its geometry', () => {
  it('Deliverable 2: the count renders first (DOM order, ahead of the label), in display-font bold accent-colored typography — one scale step below Fleet Status\'s own count, not byte-identical to it', () => {
    forceTwoCategories()
    renderMissionControl()
    const upgradeCard = screen.getByText('Upgrade Opportunities').closest('.panel') as HTMLElement
    const countEl = upgradeCard.querySelector('.font-display.font-bold') as HTMLElement
    expect(countEl).not.toBeNull()
    expect(countEl.textContent).toBe('1')
    expect(countEl.className).toContain('text-xl')
    // UX-001A.4A (Deliverable 2): a controlled step down from Fleet
    // Status's own text-2xl scale, not identical to it — relative
    // prominence and shared typography family, not shared geometry.
    expect(countEl.className).not.toContain('text-2xl')
    const shipsActiveValue = (screen.getByText('Ships Active').closest('.panel') as HTMLElement).querySelector(
      '.text-2xl.font-display.font-bold'
    ) as HTMLElement
    expect(shipsActiveValue).not.toBeNull()
    const labelEl = screen.getByText('Upgrade Opportunities')
    expect(countEl.compareDocumentPosition(labelEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Deliverable 3: the action label uses Fleet Status\'s own label treatment, not the retired notification-style title', () => {
    forceTwoCategories()
    renderMissionControl()
    const label = screen.getByText('Upgrade Opportunities')
    expect(label.className).toContain('uppercase')
    expect(label.className).toContain('tracking-widest')
    expect(label.className).toContain('text-[11px]')
    expect(label.className).toContain('text-muted')
    // Not the old bespoke notification-title treatment this superseded.
    expect(label.className).not.toContain('font-semibold')
    expect(label.className).not.toContain('text-white')
  })

  it('Deliverable 4 (UX-001A.4 data ordering): ship context remains present and reads after both the count and the label, never ahead of them', () => {
    forceTwoCategories()
    renderMissionControl()
    const upgradeCard = screen.getByText('Upgrade Opportunities').closest('.panel') as HTMLElement
    const ghostLink = within(upgradeCard).getByText('F7C-S Hornet Ghost Mk II')
    expect(ghostLink.closest('a')).toHaveAttribute('href', '/ship-workspace/ghost')
    const countEl = upgradeCard.querySelector('.font-display.font-bold') as HTMLElement
    const labelEl = screen.getByText('Upgrade Opportunities')
    expect(countEl.compareDocumentPosition(labelEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(labelEl.compareDocumentPosition(ghostLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Deliverable 5: semantic color is preserved — the count still carries the accent color, alongside the existing border stripe and icon tint', () => {
    forceTwoCategories()
    renderMissionControl()
    const upgradeCard = screen.getByText('Upgrade Opportunities').closest('.panel') as HTMLElement
    const countEl = upgradeCard.querySelector('.font-display.font-bold') as HTMLElement
    expect(countEl.style.color).toBe('rgb(255, 209, 102)') // Operational Amber — Upgrade Opportunity
    expect(upgradeCard.style.borderLeftColor).toBe('rgb(255, 209, 102)')
  })

  it('UX-001A.4A Deliverable 1: Action Card geometry is compact — smaller icon housing and tighter padding than Fleet Status\'s own CriticalMetricTile', () => {
    forceTwoCategories()
    renderMissionControl()
    const upgradeCard = screen.getByText('Upgrade Opportunities').closest('.panel') as HTMLElement
    expect(upgradeCard.className).toContain('p-3')
    expect(upgradeCard.className).not.toContain('p-4')
    const iconBox = upgradeCard.querySelector('div[style*="background-color"]') as HTMLElement
    expect(iconBox.className).toContain('w-8')
    expect(iconBox.className).toContain('h-8')
    expect(iconBox.className).not.toContain('w-10')
    const fleetStatusTile = (screen.getByText('Ships Active').closest('.panel') as HTMLElement).className
    expect(fleetStatusTile).toContain('p-4')
  })

  it('UX-001A.4A Deliverable 4: the card stack absorbs the panel\'s leftover vertical space and distributes cards within it (flex-1 + justify-between), rather than leaving dead space below a short list', () => {
    renderMissionControl()
    const priorityActionsColumn = screen.getByText('Priority Actions').closest('.panel') as HTMLElement
    const stack = priorityActionsColumn.querySelector('.flex-1.flex.flex-col.justify-between') as HTMLElement
    expect(stack).not.toBeNull()
  })

  it('Required Regression Review — one-action state: a single Priority Action category renders as exactly one compact card', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const ghost = ships.find((s) => s.id === 'ghost')!
    const ghostHp = hardpoints.find((h) => h.buildId === ghost.activeBuildId && !h.isStructural && h.targetItem && h.targetItem !== '—')!
    useFleetStore.setState({
      ships: [ghost],
      builds: builds.filter((b) => b.shipId === 'ghost'),
      // Only the one forced hardpoint — Ghost's own other seed hardpoints
      // would otherwise independently contribute additional categories
      // (e.g. a genuine Ready to Install), defeating the one-card assertion.
      hardpoints: [{ ...ghostHp, status: 'Invalid Target' as const, invalidMessage: 'Test' }],
    })
    renderMissionControl()
    const priorityActionsColumn = screen.getByText('Priority Actions').closest('.panel') as HTMLElement
    const cards = priorityActionsColumn.querySelectorAll('.flex-1 > .panel')
    expect(cards).toHaveLength(1)
  })

  it('Required Regression Review — overflow state: all five Priority Action categories render simultaneously, each its own card', () => {
    const ship = { id: 's1', name: 'Corsair', manufacturer: 'Drake', ownership: 'Owned' as const, career: 'Combat', role: 'Gunship', activeBuildId: 'b1', readiness: 50, priority: 1, missing: [], lifecycleStatus: 'active' as const }
    const build = { id: 'b1', shipId: 's1', name: 'Loadout', role: 'Gunship', readiness: 50, isActive: true, missing: [] }
    const hardpoints = [
      { id: 'hp-reserved', shipId: 's1', buildId: 'b1', slotLabel: 'Slot A', type: 'Shield', size: 'S1', factoryItem: 'Factory', installedItem: '—', targetItem: 'Mirage', status: 'Missing' as const },
      { id: 'hp-ready', shipId: 's1', buildId: 'b1', slotLabel: 'Slot B', type: 'Shield', size: 'S1', factoryItem: 'Factory', installedItem: '—', targetItem: 'Basilisk', status: 'Missing' as const },
      { id: 'hp-upgrade', shipId: 's1', buildId: 'b1', slotLabel: 'Slot C', type: 'Shield', size: 'S1', factoryItem: 'Factory', installedItem: 'Old', targetItem: 'New', status: 'Upgrade Available' as const },
      { id: 'hp-invalid', shipId: 's1', buildId: 'b1', slotLabel: 'Slot D', type: 'Weapon', size: 'S2', factoryItem: 'Factory', installedItem: '—', targetItem: 'BadTarget', status: 'Invalid Target' as const, invalidMessage: 'Test' },
      { id: 'hp-missing', shipId: 's1', buildId: 'b1', slotLabel: 'Slot E', type: 'Weapon', size: 'S2', factoryItem: 'Factory', installedItem: '—', targetItem: 'Scorpion', status: 'Missing' as const },
    ]
    const hangarItems = [{ id: 'hi-1', name: 'Basilisk', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' as const }]
    const reservations = [
      { id: 'r1', missionConfigurationId: 'b1', fleetAssetId: 's1', targetSlotLabel: 'Slot A', componentName: 'Mirage', quantity: 1, status: 'ACTIVE' as const, createdAt: '', updatedAt: '' },
    ]
    useFleetStore.setState({ ships: [ship], builds: [build], hardpoints, hangarItems, reservations, installedLoadouts: [] })
    renderMissionControl()
    expect(screen.getByText('Reserved — Awaiting Install')).toBeInTheDocument()
    expect(screen.getByText('Ready to Install')).toBeInTheDocument()
    expect(screen.getByText('Upgrade Opportunities')).toBeInTheDocument()
    expect(screen.getByText('Invalid Targets')).toBeInTheDocument()
    expect(screen.getByText('Critical Missing Components')).toBeInTheDocument()
    const priorityActionsColumn = screen.getByText('Priority Actions').closest('.panel') as HTMLElement
    const cards = priorityActionsColumn.querySelectorAll('.flex-1 > .panel')
    expect(cards).toHaveLength(5)
  })

  it('Required Regression Review — truncation at a realistic long ship name: the ship-context row truncates rather than wrapping or overflowing the card', () => {
    const ship = {
      id: 's1',
      name: 'F7CM Super Hornet Heartseeker Mk II',
      manufacturer: 'Anvil',
      ownership: 'Owned' as const,
      career: 'Combat',
      role: 'Fighter',
      activeBuildId: 'b1',
      readiness: 50,
      priority: 1,
      missing: [],
      lifecycleStatus: 'active' as const,
    }
    const build = { id: 'b1', shipId: 's1', name: 'Loadout', role: 'Fighter', readiness: 50, isActive: true, missing: [] }
    const hardpoints = [
      { id: 'hp1', shipId: 's1', buildId: 'b1', slotLabel: 'Slot A', type: 'Weapon', size: 'S2', factoryItem: 'Factory', installedItem: '—', targetItem: 'Scorpion', status: 'Invalid Target' as const, invalidMessage: 'Test' },
    ]
    useFleetStore.setState({ ships: [ship], builds: [build], hardpoints, hangarItems: [], reservations: [], installedLoadouts: [] })
    renderMissionControl()
    const invalidCard = screen.getByText('Invalid Targets').closest('.panel') as HTMLElement
    const contextRow = within(invalidCard).getByText(ship.name).closest('div') as HTMLElement
    expect(contextRow.className).toContain('truncate')
  })
})

/**
 * EWO-098 — "Mission Control Semantic Status Color Authority." Commander
 * acceptance testing found the Reserved — Awaiting Install Action Card
 * rendering with the same green accent as Ready to Install, violating the
 * canonical semantic palette (`Badge.tsx`'s `procurementRowStateTone`:
 * Reserved -> cyan, `tailwind.config.js`'s `cyan: '#35D0FF'`) that this
 * exact page's own Procurement Work Queue table already renders correctly
 * a few hundred lines below. Root cause was a missing entry in this
 * file's local `PRIORITY_ACTION_PRESENTATION` map, not a token/variant
 * resolution bug — these tests cover the corrected accent, confirm
 * Ready/Critical are untouched, and confirm ordering/counts/labels are
 * unaffected by the color-only fix.
 */
describe('<MissionControl /> — EWO-098: Priority Actions semantic color authority', () => {
  function setThreeCategoryFleet() {
    const ship = { id: 's1', name: 'Corsair', manufacturer: 'Drake', ownership: 'Owned' as const, career: 'Combat', role: 'Gunship', activeBuildId: 'b1', readiness: 50, priority: 1, missing: [], lifecycleStatus: 'active' as const }
    const build = { id: 'b1', shipId: 's1', name: 'Loadout', role: 'Gunship', readiness: 50, isActive: true, missing: [] }
    const hardpoints = [
      { id: 'hp-reserved', shipId: 's1', buildId: 'b1', slotLabel: 'Slot A', type: 'Shield', size: 'S1', factoryItem: 'Factory', installedItem: '—', targetItem: 'Mirage', status: 'Missing' as const },
      { id: 'hp-ready', shipId: 's1', buildId: 'b1', slotLabel: 'Slot B', type: 'Shield', size: 'S1', factoryItem: 'Factory', installedItem: '—', targetItem: 'Basilisk', status: 'Missing' as const },
      { id: 'hp-missing', shipId: 's1', buildId: 'b1', slotLabel: 'Slot E', type: 'Weapon', size: 'S2', factoryItem: 'Factory', installedItem: '—', targetItem: 'Scorpion', status: 'Missing' as const },
    ]
    const hangarItems = [{ id: 'hi-1', name: 'Basilisk', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' as const }]
    const reservations = [
      { id: 'r1', missionConfigurationId: 'b1', fleetAssetId: 's1', targetSlotLabel: 'Slot A', componentName: 'Mirage', quantity: 1, status: 'ACTIVE' as const, createdAt: '', updatedAt: '' },
    ]
    useFleetStore.setState({ ships: [ship], builds: [build], hardpoints, hangarItems, reservations, installedLoadouts: [] })
  }

  it('Reserved — Awaiting Install renders with the canonical Reserved cyan accent (#35D0FF), not Available green', () => {
    setThreeCategoryFleet()
    renderMissionControl()
    const reservedCard = screen.getByText('Reserved — Awaiting Install').closest('.panel') as HTMLElement
    expect(reservedCard.style.borderLeftColor).toBe('rgb(53, 208, 255)')
    const countEl = reservedCard.querySelector('.font-display.font-bold') as HTMLElement
    expect(countEl.style.color).toBe('rgb(53, 208, 255)')
  })

  it('Ready to Install still renders green (#42E695) — unchanged by the Reserved fix', () => {
    setThreeCategoryFleet()
    renderMissionControl()
    const readyCard = screen.getByText('Ready to Install').closest('.panel') as HTMLElement
    expect(readyCard.style.borderLeftColor).toBe('rgb(66, 230, 149)')
  })

  it('Critical Missing Components still renders red (#FF5F73) — unchanged by the Reserved fix', () => {
    setThreeCategoryFleet()
    renderMissionControl()
    const criticalCard = screen.getByText('Critical Missing Components').closest('.panel') as HTMLElement
    expect(criticalCard.style.borderLeftColor).toBe('rgb(255, 95, 115)')
  })

  it('Reserved and Ready are now visually distinct — no accidental color collision remains', () => {
    setThreeCategoryFleet()
    renderMissionControl()
    const reservedCard = screen.getByText('Reserved — Awaiting Install').closest('.panel') as HTMLElement
    const readyCard = screen.getByText('Ready to Install').closest('.panel') as HTMLElement
    expect(reservedCard.style.borderLeftColor).not.toBe(readyCard.style.borderLeftColor)
  })

  it('ordering is unaffected by the color fix: Reserved renders before Ready, which renders before Critical', () => {
    setThreeCategoryFleet()
    renderMissionControl()
    const reservedLabel = screen.getByText('Reserved — Awaiting Install')
    const readyLabel = screen.getByText('Ready to Install')
    const criticalLabel = screen.getByText('Critical Missing Components')
    expect(reservedLabel.compareDocumentPosition(readyLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(readyLabel.compareDocumentPosition(criticalLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('counts and labels are unaffected by the color fix', () => {
    setThreeCategoryFleet()
    renderMissionControl()
    const reservedCard = screen.getByText('Reserved — Awaiting Install').closest('.panel') as HTMLElement
    const readyCard = screen.getByText('Ready to Install').closest('.panel') as HTMLElement
    const criticalCard = screen.getByText('Critical Missing Components').closest('.panel') as HTMLElement
    expect((reservedCard.querySelector('.font-display.font-bold') as HTMLElement).textContent).toBe('1')
    expect((readyCard.querySelector('.font-display.font-bold') as HTMLElement).textContent).toBe('1')
    expect((criticalCard.querySelector('.font-display.font-bold') as HTMLElement).textContent).toBe('1')
  })

  it('no zero-state regression: the empty-state message still renders correctly when there are no Priority Actions at all', () => {
    const { ships, builds, hardpoints } = useFleetStore.getState()
    const ghost = ships.find((s) => s.id === 'ghost')!
    useFleetStore.setState({
      ships: [ghost],
      builds: builds.filter((b) => b.shipId === 'ghost'),
      hardpoints: hardpoints.filter((h) => h.buildId === ghost.activeBuildId).map((h) => ({ ...h, status: 'OK' as const, installedItem: h.targetItem })),
    })
    renderMissionControl()
    expect(screen.getByText('No Immediate Priority Actions')).toBeInTheDocument()
  })

  it('no other semantic presentation regression: Fleet Status tiles (Mission Ready green, Loadouts In Progress amber) remain unaffected by the Priority Actions fix', () => {
    setThreeCategoryFleet()
    renderMissionControl()
    const missionReadyTile = screen.getByText('Mission Ready').closest('.panel') as HTMLElement
    const inProgressTile = screen.getByText('Loadouts In Progress').closest('.panel') as HTMLElement
    expect(missionReadyTile.querySelector('div[style*="color"]')).not.toBeNull()
    expect(inProgressTile.querySelector('div[style*="color"]')).not.toBeNull()
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
    // EWO-100 (Phase 1) — standardized operational status line.
    expect(screen.getByText('Operations Standing By')).toBeInTheDocument()
    expect(screen.queryByText(/welcome/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/track your fleet/i)).not.toBeInTheDocument()
  })

  it('EWO-061/EWO-100: the identity header follows the standardized pattern — small "Mission Control" label above the large "Operations Standing By" title', () => {
    renderMissionControl()
    const label = screen.getByText('Mission Control')
    expect(label.tagName).toBe('P')
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Operations Standing By')
  })

  it('EWO-058: the obsolete "Update Budget" development-era footer no longer renders', () => {
    renderMissionControl()
    expect(screen.queryByText(/Update Budget/)).not.toBeInTheDocument()
  })

  it('4/5/7. UX-001A: every Hero Fleet Status count shares one critical-metric-tile scale', () => {
    const { container } = renderMissionControl()
    // Every Fleet Status count (Ships Active, Mission Ready, Loadouts In
    // Progress, Factory Loadout) renders through the shared
    // CriticalMetricTile contract — same value/label typography. "Needed
    // Items" no longer exists (retired by UX-001A Deliverable 4 in favor
    // of Priority Actions); Quartermaster Logistics' own Missing
    // Components/Unreserved Inventory tiles were retired in turn by
    // UX-001B in favor of the Logistics Demand summary — so the prior
    // count of 7, then 6, is now 4.
    //
    // UX-001A.4 (Deliverable 2) deliberately extended this exact scale to
    // the Priority Actions column's own Action Card counts too — so the
    // raw selector below no longer uniquely fingerprints only these four
    // tiles. Scope it to everywhere but the Priority Actions panel to
    // keep testing what this assertion has always meant: every Fleet
    // Status tile in the Hero shares one scale.
    const priorityActionsPanel = screen.getByText('Priority Actions').closest('.panel') as HTMLElement
    const values = Array.from(container.querySelectorAll('.panel .text-2xl.font-display.font-bold')).filter(
      (el) => !priorityActionsPanel.contains(el)
    )
    expect(values.length).toBe(4)
  })

  it('6. UX-001A/UX-001B: all four Fleet Status cards render in the Hero, and the Quartermaster Report renders its own Logistics Demand summary instead of raw inventory counts', () => {
    renderMissionControl()
    // EWO-033 (Task 2): getAllByText tolerates a Top-4 priority card's own
    // status text legitimately overlapping a Fleet Status tile's label —
    // see the identical note on the "Fleet Status tiles" test above.
    expect(screen.getAllByText('Mission Ready').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Loadouts In Progress').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Factory Loadout').length).toBeGreaterThan(0)
    expect(screen.getByText('Logistics Demand')).toBeInTheDocument()
    expect(screen.queryByText('Missing Components')).not.toBeInTheDocument()
    expect(screen.queryByText('Unreserved Inventory')).not.toBeInTheDocument()
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
    const first = [...ships].sort((a, b) => comparePriority(a.priority, b.priority))[0]
    const wrapper = screen.getByText('PRIORITY 1').closest('[data-testid="priority-card-wrapper"]') as HTMLElement
    const roleLine = within(wrapper).getByText(`${first.manufacturer} · ${first.role}`)
    const buildName = builds.find((b) => b.id === first.activeBuildId)?.name ?? 'Unknown Loadout'
    const loadout = within(wrapper).getByText(buildName)
    expect(roleLine.compareDocumentPosition(loadout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('12. EWO-032 (Task 4): clicking anywhere on the Priority Ship card navigates to Ship Detail — behavior exactly matches Fleet Dashboard, no separate hyperlink', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const first = [...ships].sort((a, b) => comparePriority(a.priority, b.priority))[0]
    const wrapper = screen.getByText('PRIORITY 1').closest('[data-testid="priority-card-wrapper"]') as HTMLElement
    const cardLink = within(wrapper).getByRole('link')
    expect(cardLink).toHaveAttribute('href', `/ship-workspace/${first.id}`)
    expect(screen.queryByText('Ship Detail')).not.toBeInTheDocument()
  })

  it('UX-001C: the End-of-Briefing Action Center links to Decision Center, Hangar Inventory, and Ship Workspace, and is not rendered as metric tiles', () => {
    renderMissionControl()
    const lootCard = screen.getByText('Loot Lookup').closest('a')
    const addInventoryCard = screen.getByText('Add Inventory').closest('a')
    const modifyShipCard = screen.getByText('Modify Ship').closest('a')
    expect(lootCard).toHaveAttribute('href', '/decision-center')
    expect(addInventoryCard).toHaveAttribute('href', '/hangar')
    expect(modifyShipCard).toHaveAttribute('href', '/ship-workspace')
    // Workflow cards carry no numeric critical-metric value — only title, one
    // supporting line, and an "Open" action.
    expect(lootCard!.querySelector('.text-2xl')).toBeNull()
    expect(addInventoryCard!.querySelector('.text-2xl')).toBeNull()
    expect(modifyShipCard!.querySelector('.text-2xl')).toBeNull()
    expect(within(lootCard as HTMLElement).getByText('Open')).toBeInTheDocument()
  })

  it('UX-001C Regression Requirements: the obsolete "Loot Lockup" text never renders, and no Action Center card routes to Quick Update', () => {
    const { container } = renderMissionControl()
    expect(screen.queryByText('Loot Lockup')).not.toBeInTheDocument()
    expect(screen.getByText('Loot Lookup')).toBeInTheDocument()
    const quickUpdateLinks = Array.from(container.querySelectorAll('a')).filter((a) => a.getAttribute('href') === '/quick-update')
    expect(quickUpdateLinks).toHaveLength(0)
  })

  // CWO-005 (Task 5): version/build identity moved out of Mission Control
  // entirely — it now lives only in the Sidebar (SFM build) and Captain's
  // Log (SC certification), so the bridge screen never duplicates it.
  it('CWO-005 (Task 5) — Mission Control no longer displays app version/build identity', () => {
    renderMissionControl()
    expect(screen.queryByText(/Quartermaster Edition/)).not.toBeInTheDocument()
  })
})

describe('<MissionControl /> — EWO-032: canonical Fleet Ship Card parity with Fleet Dashboard', () => {
  it('the same ship renders byte-identical Fleet Ship Card markup on Mission Control and Fleet Dashboard — one canonical component, no visual drift', () => {
    renderMissionControl()
    const { ships } = useFleetStore.getState()
    const topShip = [...ships].sort((a, b) => comparePriority(a.priority, b.priority))[0]
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

describe('<MissionControl /> — UX-001B/UX-001B.5: Quartermaster Report', () => {
  /** One ship, four hardpoints covering all three report-assessment
   * states across three categories:
   *   - Shields: Mirage, Purchase Required only — no owned inventory at
   *     all (PROCUREMENT_ONLY / "No Inventory Available"). Mirage itself
   *     never renders anywhere in the UI, per UX-001B.5 Deliverable 3's
   *     unconditional exclusion — this supersedes UX-001B.4's own
   *     per-category exception.
   *   - Weapons: Bulldog (Reserved) + Scorpion (Purchase Required,
   *     always hidden regardless of Weapons' own actionable state) —
   *     ACTIONABLE.
   *   - Coolers: Ice Breaker (Available, fully covered by owned stock,
   *     so the Logistics Demand card itself reads "Complete" — zero
   *     PURCHASE demand — while the Work Queue Assessment still reads
   *     ACTIONABLE, since an owned unit is still sitting uninstalled).
   * Power Plants / Quantum Drives have no hardpoints at all — COMPLETE. */
  function forceQuartermasterScenario() {
    const ship = {
      id: 'qm-ship-1',
      name: 'Quartermaster Test Ship',
      manufacturer: 'Anvil',
      ownership: 'Owned' as const,
      career: 'Combat',
      role: 'Fighter',
      activeBuildId: 'qm-build-1',
      readiness: 40,
      priority: 1,
      missing: [],
      lifecycleStatus: 'active' as const,
    }
    const build = { id: 'qm-build-1', shipId: 'qm-ship-1', name: 'Test Loadout', role: 'Fighter', readiness: 40, isActive: true, missing: [] }
    const hardpoints = [
      { id: 'qm-hp1', shipId: 'qm-ship-1', buildId: 'qm-build-1', slotLabel: 'Left Shield', type: 'Shield', size: 'S1', factoryItem: 'Factory', installedItem: '—', targetItem: 'Mirage', status: 'Missing' as const },
      { id: 'qm-hp2', shipId: 'qm-ship-1', buildId: 'qm-build-1', slotLabel: 'Nose Gun', type: 'Weapon', size: 'S2', factoryItem: 'Factory', installedItem: '—', targetItem: 'Scorpion', status: 'Missing' as const },
      { id: 'qm-hp3', shipId: 'qm-ship-1', buildId: 'qm-build-1', slotLabel: 'Tail Gun', type: 'Weapon', size: 'S2', factoryItem: 'Factory', installedItem: '—', targetItem: 'Bulldog', status: 'Missing' as const },
      { id: 'qm-hp4', shipId: 'qm-ship-1', buildId: 'qm-build-1', slotLabel: 'Cooler', type: 'Cooler', size: 'S2', factoryItem: 'Factory', installedItem: '—', targetItem: 'Ice Breaker', status: 'Missing' as const },
    ]
    const reservations = [
      { id: 'qm-r1', missionConfigurationId: 'qm-build-1', fleetAssetId: 'qm-ship-1', targetSlotLabel: 'Tail Gun', componentName: 'Bulldog', quantity: 1, status: 'ACTIVE' as const, createdAt: '', updatedAt: '' },
    ]
    const hangarItems = [{ id: 'hi-1', name: 'Ice Breaker', type: 'Cooler', size: 'S2', qty: 1, neededBy: 'None', disposition: 'Store' as const }]
    useFleetStore.setState({ ships: [ship], builds: [build], hardpoints, hangarItems, installedLoadouts: [], reservations })
    return { ship }
  }

  it('Deliverable 1: the section is titled Quartermaster Report, not Quartermaster Logistics', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    expect(screen.getByText('Quartermaster Report')).toBeInTheDocument()
    expect(screen.queryByText('Quartermaster Logistics')).not.toBeInTheDocument()
  })

  it('Deliverable 2: Logistics Demand, Quartermaster Assessment, and Procurement Work Queue render inside one consolidated panel, not three separate ones', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const report = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    expect(within(report).getByText('Logistics Demand')).toBeInTheDocument()
    expect(within(report).getByText('Quartermaster Assessment')).toBeInTheDocument()
    expect(within(report).getByText('Procurement Work Queue')).toBeInTheDocument()
  })

  it('Logistics Demand summarizes true shortage by category — Reserved and Available rows never inflate the demand count', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const band = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    const shieldsCard = within(band).getByText('Shields').closest('.panel') as HTMLElement
    const weaponsCard = within(band).getByText('Weapons').closest('.panel') as HTMLElement
    expect(within(shieldsCard).getByText('1')).toBeInTheDocument()
    expect(within(weaponsCard).getByText('1')).toBeInTheDocument()
    // Coolers is fully covered by owned stock — zero further purchase
    // demand, even though the unit itself still needs installing.
    const coolersCard = within(band).getByText('Coolers').closest('.panel') as HTMLElement
    expect(within(coolersCard).getByText('Complete')).toBeInTheDocument()
  })

  it('UX-001B.5 Deliverable 3: Purchase Required rows never render in Mission Control, unconditionally — even for a category with no actionable rows at all', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    // Weapons has an actionable Reserved row; its Purchase Required row (Scorpion) is hidden.
    expect(screen.getByText('Bulldog')).toBeInTheDocument()
    expect(screen.queryByText('Scorpion')).not.toBeInTheDocument()
    // Shields has ONLY a Purchase Required row (Mirage) — UX-001B.4 kept
    // this visible as a procurement-planning list; UX-001B.5 removes that
    // exception. Mirage never renders anywhere in the UI.
    expect(screen.queryByText('Mirage')).not.toBeInTheDocument()
    expect(screen.queryByText('Purchase Required')).not.toBeInTheDocument()
  })

  it('Available rows render alongside Reserved rows, correctly badged and colored', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const iceBreakerRow = screen.getByText('Ice Breaker').closest('tr') as HTMLElement
    const availableBadge = within(iceBreakerRow).getByText('Available')
    expect(availableBadge.className).toContain('text-success')
  })

  it('Deliverable 6: canonical taxonomy is preserved — Coolers, Power Plants, Quantum Drives, Shields, Weapons remain distinct categories', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const band = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    for (const category of ['Coolers', 'Power Plants', 'Quantum Drives', 'Shields', 'Weapons']) {
      expect(within(band).getByText(category)).toBeInTheDocument()
    }
  })

  it('Needed By renders as a real hyperlink straight to the relevant Ship Workspace, not inert text', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const bulldogRow = screen.getByText('Bulldog').closest('tr') as HTMLElement
    const link = within(bulldogRow).getByText('Quartermaster Test Ship — Test Loadout').closest('a')
    expect(link).toHaveAttribute('href', '/ship-workspace/qm-ship-1')
  })

  it('Deliverable 5: clicking a demand category card filters the whole report to that category in place, and clicking again clears the filter', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const band = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    const weaponsCard = within(band).getByText('Weapons').closest('button') as HTMLElement
    expect(screen.getByText('Bulldog')).toBeInTheDocument()
    expect(screen.getByText('Ice Breaker')).toBeInTheDocument()

    fireEvent.click(weaponsCard)
    // Filtered to Weapons: Bulldog remains, Ice Breaker (Coolers) is gone.
    expect(screen.getByText('Bulldog')).toBeInTheDocument()
    expect(screen.queryByText('Ice Breaker')).not.toBeInTheDocument()
    // The active filter surfaces as a clear-filter pill next to the
    // report title itself.
    const reportHeader = screen.getByText('Quartermaster Report').closest('div') as HTMLElement
    expect(within(reportHeader).getByText('Weapons')).toBeInTheDocument()

    fireEvent.click(weaponsCard)
    // Toggled off — everything is visible again. Mission Control never
    // navigated or rebuilt; the Hero above is untouched throughout.
    expect(screen.getByText('Ice Breaker')).toBeInTheDocument()
    expect(screen.getByText('Fleet Status')).toBeInTheDocument()
  })

  it('UX-001B.4 Deliverable 1: column widths stay identical whether the Work Queue is unfiltered or filtered to a category', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const colsBefore = Array.from(document.querySelectorAll('table col')).map((c) => c.className)
    expect(colsBefore).toHaveLength(5)

    const band = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    const weaponsCard = within(band).getByText('Weapons').closest('button') as HTMLElement
    fireEvent.click(weaponsCard)

    const colsAfter = Array.from(document.querySelectorAll('table col')).map((c) => c.className)
    expect(colsAfter).toEqual(colsBefore)
  })

  it('UX-001B.5 Deliverable 4: Inventory Exists — the assessment states how many inventory assets are immediately available for the selected category', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const band = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    const weaponsCard = within(band).getByText('Weapons').closest('button') as HTMLElement
    fireEvent.click(weaponsCard)
    expect(screen.getByText('Quartermaster Assessment')).toBeInTheDocument()
    expect(screen.getByText(/1 inventory asset is immediately available to improve fleet readiness for Weapons/)).toBeInTheDocument()
  })

  it('UX-001B.5 Deliverable 4: No Inventory Available — the assessment explains why, and no table renders', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const band = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    const shieldsCard = within(band).getByText('Shields').closest('button') as HTMLElement
    fireEvent.click(shieldsCard)
    expect(screen.getByText(/There are currently no inventory assets available to satisfy the selected target loadouts for Shields/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('Mirage')).not.toBeInTheDocument()
  })

  it('UX-001B.5 Deliverable 4: Fleet Demand Complete — the green completion assessment renders, no table', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const band = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    const powerPlantsCard = within(band).getByText('Power Plants').closest('button') as HTMLElement
    fireEvent.click(powerPlantsCard)
    expect(screen.getByText('Quartermaster Assessment — Complete')).toBeInTheDocument()
    expect(screen.getByText(/All target loadouts for Power Plants have been satisfied\. Quartermaster Report complete\./)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('UX-001B.5 Deliverable 4: the Quartermaster Assessment reflects the whole fleet when no category is selected', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    // Two actionable assets exist fleet-wide: Bulldog (Reserved) + Ice Breaker (Available).
    expect(screen.getByText(/2 inventory assets are immediately available to improve fleet readiness\./)).toBeInTheDocument()
  })

  it('with nothing actionable or demanded fleet-wide, the five stable categories still render Complete, and the fleet-wide assessment reads Complete too', () => {
    useFleetStore.setState({ ships: [], builds: [], hardpoints: [], hangarItems: [], installedLoadouts: [], reservations: [] })
    renderMissionControl()
    const band = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    for (const category of ['Coolers', 'Power Plants', 'Quantum Drives', 'Shields', 'Weapons']) {
      const card = within(band).getByText(category).closest('.panel') as HTMLElement
      expect(within(card).getByText('✓')).toBeInTheDocument()
      expect(within(card).getByText('Complete')).toBeInTheDocument()
    }
    expect(screen.getByText('Quartermaster Assessment — Complete')).toBeInTheDocument()
    expect(screen.getByText(/All target loadouts have been satisfied fleet-wide\. Quartermaster Report complete\./)).toBeInTheDocument()
  })

  it('a Complete stable-category card uses Readiness Green, not Quartermaster Blue', () => {
    useFleetStore.setState({ ships: [], builds: [], hardpoints: [], hangarItems: [], installedLoadouts: [], reservations: [] })
    renderMissionControl()
    const band = screen.getByText('Quartermaster Report').closest('.panel') as HTMLElement
    const shieldsCard = within(band).getByText('Shields').closest('.panel') as HTMLElement
    expect(shieldsCard.style.borderLeftColor).toBe('rgb(66, 230, 149)') // #42E695 Readiness Green
  })

  it('procurement state badges use canonical colors — Available green, Reserved blue (Quartermaster Blue)', () => {
    forceQuartermasterScenario()
    renderMissionControl()
    const bulldogRow = screen.getByText('Bulldog').closest('tr') as HTMLElement
    const reservedBadge = within(bulldogRow).getByText('Reserved')
    expect(reservedBadge.className).toContain('text-cyan')
    expect(reservedBadge.className).not.toContain('text-success')

    const iceBreakerRow = screen.getByText('Ice Breaker').closest('tr') as HTMLElement
    const availableBadge = within(iceBreakerRow).getByText('Available')
    expect(availableBadge.className).toContain('text-success')
  })
})
