import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FleetDashboard from '../FleetDashboard'
import { useFleetStore } from '../../store/useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderDashboard() {
  return render(
    <MemoryRouter>
      <FleetDashboard />
    </MemoryRouter>
  )
}

// EWO-059 (Part B) — filters render collapsed by default; every existing
// test that interacts with a filter pill must expand the panel first, the
// same action a real Commander takes via the "Filters" disclosure toggle.
function expandFilters() {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
}

describe('<FleetDashboard /> — Mission M-012 empty-state', () => {
  it('8. renders a valid, deliberate empty state with zero ships (not a blank page or crash)', () => {
    useFleetStore.setState({ ships: [] })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderDashboard()
    expect(screen.getByText('No Vessels Assigned')).toBeInTheDocument()
    expect(screen.getByText('Your fleet manifest is currently empty.')).toBeInTheDocument()
    expect(screen.getByText('Add First Ship')).toBeInTheDocument()
    // 10. no console errors in the empty state.
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('still renders normally (card grid) when ships are present', () => {
    renderDashboard()
    expect(screen.queryByText('No Vessels Assigned')).not.toBeInTheDocument()
  })
})

/**
 * EWO-033 (Task 1/10) — Fleet Dashboard now shows a Priority wrapper above
 * every Card-view Fleet Asset at all times (not only while Priority sort
 * is selected), reading that ship's own stored `priority` field — never a
 * recomputed positional rank, so it stays correct after any sort/filter.
 */
describe('<FleetDashboard /> — EWO-033 (Task 1): Priority presentation', () => {
  it('1. a Priority label renders for every Card-view Fleet Asset', () => {
    renderDashboard()
    const { ships } = useFleetStore.getState()
    expect(screen.getAllByTestId('priority-card-wrapper')).toHaveLength(ships.length)
  })

  it('2. each label matches the correct Fleet Asset\'s own stored priority value', () => {
    renderDashboard()
    const { ships } = useFleetStore.getState()
    for (const ship of ships) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }
  })

  it('3. labels remain correct after sorting by Priority', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Priority' }))
    const { ships } = useFleetStore.getState()
    for (const ship of ships) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }
  })

  it('4. labels remain correct after sorting by Readiness (never recomputed to a positional 1..N)', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Readiness' }))
    const { ships } = useFleetStore.getState()
    for (const ship of ships) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }
  })

  it('5. labels remain correct after filtering by ownership', () => {
    renderDashboard()
    const { ships } = useFleetStore.getState()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Owned' }))
    const owned = ships.filter((s) => s.ownership === 'Owned')
    expect(screen.getAllByTestId('priority-card-wrapper')).toHaveLength(owned.length)
    for (const ship of owned) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }
  })

  it('6. the entire card remains clickable — the Priority wrapper does not intercept or replace the card link', () => {
    renderDashboard()
    const { ships } = useFleetStore.getState()
    const first = ships[0]
    const card = screen.getByText(first.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
    const link = within(card).getByRole('link')
    expect(link).toHaveAttribute('href', `/ship-workspace/${first.id}`)
  })

  it('7. Table view remains functional and unaffected (no Priority column added, per "report don\'t redesign" instruction)', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    expect(screen.getByText('Ship')).toBeInTheDocument()
    expect(screen.getByText('Active Loadout')).toBeInTheDocument()
    expect(screen.queryByTestId('priority-card-wrapper')).not.toBeInTheDocument()
  })
})

describe('EWO-053 (Objective B — Fleet Navigation Refactor): composable, independent filter dimensions', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  function tableShipNamesInOrder(): string[] {
    return Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')!.textContent ?? '')
  }

  // Uses the real seed fleet, not a fabricated fixture — MOLE (canonical
  // manufacturer 'Argo', RSI role Industrial) alongside Vulture (Drake,
  // Industrial) and Prospector (MISC, Industrial) is the exact "Industrial
  // ships built by Argo" success-criterion example, already present in
  // src/data/seed.ts.
  it('the RSI Role filter alone shows every Industrial ship regardless of manufacturer (Mole, Vulture, Prospector)', () => {
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expect(screen.getByText('Vulture')).toBeInTheDocument()
    expect(screen.getByText('Prospector')).toBeInTheDocument()
  })

  // EWO-059 (Part A) — regression coverage beyond Combat/Industrial: Ghost
  // (Combat), Corsair (Combat/Exploration), and M80 (Competition/Combat)
  // are all classified Combat and must all match, while a genuinely
  // non-Combat ship (MOLE) must not.
  it('the RSI Role filter also correctly matches Combat-classified ships (Ghost, Corsair, M80), not only Industrial', () => {
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Combat' }))
    expect(screen.getByText('F7C-S Hornet Ghost Mk II')).toBeInTheDocument()
    expect(screen.getByText('Corsair')).toBeInTheDocument()
    expect(screen.getByText('M80')).toBeInTheDocument()
    expect(screen.queryByText('MOLE')).not.toBeInTheDocument()
  })

  // EWO-059 (Part A) — root-cause regression: the filter previously read
  // `shipDefinitionById.get(ship.id)` directly, which only ever happened
  // to work for the original seed fleet (whose Ship.id is coincidentally
  // also a valid ShipDefinition id). Any ship added live through "Add
  // Ship" gets a freshly generated FleetAsset instance id instead
  // (`materializeFleetAsset`'s `${definitionId}-asset-<suffix>` pattern),
  // which silently broke the old lookup. Proves the fix resolves through
  // `resolveShipDefinitionId`/`resolveShipRsiRoles` instead.
  it('the RSI Role filter also matches a ship added live via "Add Ship" — not only the seed fleet', () => {
    const added = useFleetStore.getState().addFleetAsset('vulture', 'OWNED', 'Second Vulture')
    expect(added.success).toBe(true)
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    expect(screen.getByText('Second Vulture')).toBeInTheDocument()
  })

  it('the Manufacturer filter alone shows every ARGO ship regardless of role', () => {
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Argo' }))
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expect(screen.queryByText('Vulture')).not.toBeInTheDocument()
    expect(screen.queryByText('Prospector')).not.toBeInTheDocument()
  })

  it('Composable Filters: Industrial + ARGO composes (AND), narrowing to exactly the ships both dimensions agree on — not replacing one filter with the other', () => {
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Argo' }))
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expect(screen.queryByText('Vulture')).not.toBeInTheDocument()
    expect(screen.queryByText('Prospector')).not.toBeInTheDocument()
    // Both pills stay visibly active at once — proof this is two
    // independent dimensions, not a single mutually-exclusive selector.
    expect(screen.getByRole('button', { name: 'Industrial' })).toHaveClass('bg-cyan/15')
    expect(screen.getByRole('button', { name: 'Argo' })).toHaveClass('bg-cyan/15')
  })

  it('Clear Filters resets every dimension at once and disappears once nothing is active', () => {
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Argo' }))
    expect(screen.getByText('Clear Filters')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Clear Filters'))
    expect(screen.queryByText('Clear Filters')).not.toBeInTheDocument()
    expect(screen.getByText('Vulture')).toBeInTheDocument() // Industrial ships other than ARGO are visible again
  })

  it('Sorting by Manufacturer orders the Table view by each ship\'s own canonical manufacturer name', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    fireEvent.click(screen.getByRole('button', { name: 'Manufacturer' }))
    const names = tableShipNamesInOrder()
    const { ships } = useFleetStore.getState()
    const expectedOrder = [...ships].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.name.localeCompare(b.name)).map((s) => s.name)
    expect(names).toEqual(expectedOrder)
  })

  it('Sorting by Ship Name orders the Table view alphabetically', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    fireEvent.click(screen.getByRole('button', { name: 'Ship Name' }))
    const names = tableShipNamesInOrder()
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('Sorting by RSI Role never crashes and produces a stable, fully-ordered result for every ship, including those with no classified role', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'RSI Role' }))).not.toThrow()
    const { ships } = useFleetStore.getState()
    expect(tableShipNamesInOrder()).toHaveLength(ships.length)
  })

  it('a Readiness filter narrows to only Factory-only Loadouts (135c, UTV) when "Factory Only" is selected', () => {
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Factory Only' }))
    expect(screen.getByText('135c')).toBeInTheDocument()
    expect(screen.getByText('UTV')).toBeInTheDocument()
    expect(screen.queryByText('MOLE')).not.toBeInTheDocument()
  })

  it('Persistent View: a filter set before navigating away is still active the next time Fleet Dashboard mounts (session persistence)', () => {
    const { unmount } = renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    expect(screen.queryByText('Vulture')).toBeInTheDocument()
    expect(screen.queryByText('Prospector')).toBeInTheDocument()
    unmount()

    renderDashboard()
    // Still filtered to Industrial only — the Commander never has to
    // re-apply a filter after visiting Ship Detail and coming back. The
    // filter *values* persist across the session; the disclosure panel
    // itself deliberately does not (EWO-059 Part B: collapsed on every
    // fresh page load) — expand it again to confirm the pill itself.
    expect(screen.queryByText('135c')).not.toBeInTheDocument()
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expandFilters()
    expect(screen.getByRole('button', { name: 'Industrial' })).toHaveClass('bg-cyan/15')
  })
})

describe('EWO-059 (Part B): collapsible Quick Filters', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('filters render collapsed on initial page load — no filter pill is present until expanded', () => {
    renderDashboard()
    expect(screen.queryByRole('button', { name: 'Industrial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Owned' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('with no active constraints, the compact toolbar reads "All ships"', () => {
    renderDashboard()
    expect(screen.getByText('All ships')).toBeInTheDocument()
  })

  it('selecting Filters expands the matrix directly below the toolbar; selecting it again collapses it', () => {
    renderDashboard()
    expandFilters()
    expect(screen.getByRole('button', { name: 'Industrial' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    expect(screen.queryByRole('button', { name: 'Industrial' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapsing the panel does not clear selected filters — the active selection remains visible in the compact summary and the results stay filtered', () => {
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    expect(screen.getByText('MOLE')).toBeInTheDocument()

    // Collapse.
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    expect(screen.queryByRole('button', { name: 'Industrial' })).not.toBeInTheDocument()
    // Summary chip + filtered results both survive the collapse.
    expect(screen.getByRole('button', { name: 'Remove Industrial filter' })).toBeInTheDocument()
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expect(screen.queryByText('135c')).not.toBeInTheDocument()
  })

  it('each active-filter summary chip removes only that one filter, leaving the rest intact', () => {
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Argo' }))
    // Narrowed to exactly MOLE by both dimensions together.
    expect(screen.queryByText('Vulture')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Argo filter' }))

    // Manufacturer constraint is gone; RSI Role (Industrial) alone remains
    // active — Vulture and Prospector (Industrial, non-ARGO) reappear.
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expect(screen.getByText('Vulture')).toBeInTheDocument()
    expect(screen.getByText('Prospector')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Argo filter' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Industrial' })).toHaveClass('bg-cyan/15')
  })

  it('Clear Filters resets every category to All and the toolbar reverts to "All ships"', () => {
    renderDashboard()
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Argo' }))
    fireEvent.click(screen.getByText('Clear Filters'))
    expect(screen.getByText('All ships')).toBeInTheDocument()
  })

  it('zero-results: an impossible filter combination shows the intentional empty state with a visible Clear Filters action, not a blank area', () => {
    renderDashboard()
    expandFilters()
    // Industrial + Anvil: no seed ship is both — a valid, real zero-result combination.
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anvil' }))
    expect(screen.getByText('No ships match these filters.')).toBeInTheDocument()
    expect(screen.getByText('Adjust the selected filters or clear them to view your fleet.')).toBeInTheDocument()
    const clearButtons = screen.getAllByText('Clear Filters')
    expect(clearButtons.length).toBeGreaterThan(0)
    fireEvent.click(clearButtons[clearButtons.length - 1])
    expect(screen.queryByText('No ships match these filters.')).not.toBeInTheDocument()
    expect(screen.getByText('All ships')).toBeInTheDocument()
  })

  it('sort and view controls keep working while filters are collapsed', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Ship Name' }))).not.toThrow()
    expect(screen.getByText('Ship')).toBeInTheDocument()
  })
})

describe('EWO-060 (Part A/B): Fleet Dashboard Table Cleanup & Ship Management rename', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  function tableHeaders(): string[] {
    return Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent ?? '')
  }

  it('Career and Role headers are gone from Table view', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    expect(screen.queryByText('Career')).not.toBeInTheDocument()
    expect(screen.queryByText('Role')).not.toBeInTheDocument()
  })

  it('the remaining headers render in the intended order: Ship, Ownership, Active Loadout, Loadout Progress, Missing Items, Action', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    expect(tableHeaders()).toEqual(['Ship', 'Ownership', 'Active Loadout', 'Loadout Progress', 'Missing Items', 'Action'])
  })

  it('"Manage Ship" appears for every row, and the obsolete "Ship Workspace" table action label never renders', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    const { ships } = useFleetStore.getState()
    expect(screen.getAllByText('Manage Ship')).toHaveLength(ships.length)
    expect(screen.queryByText('Ship Workspace')).not.toBeInTheDocument()
  })

  it('the "Manage Ship" action link still navigates to the existing Ship Management destination (route unchanged)', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    const { ships } = useFleetStore.getState()
    const first = ships[0]
    const row = screen.getByText(first.name).closest('tr') as HTMLElement
    const link = within(row).getByText('Manage Ship').closest('a')!
    expect(link).toHaveAttribute('href', `/ship-workspace/${first.id}`)
  })

  it('Card view is unaffected by the table cleanup — Priority wrappers and click-anywhere navigation still work', () => {
    renderDashboard()
    const { ships } = useFleetStore.getState()
    expect(screen.getAllByTestId('priority-card-wrapper')).toHaveLength(ships.length)
  })
})

describe('<FleetDashboard /> — SW-015C (Deliverable 7): Active/Retired view', () => {
  it('defaults to Active — a retired vessel is not mixed into the default view', () => {
    const before = useFleetStore.getState().ships.length
    useFleetStore.getState().retireFleetAsset('ghost')
    renderDashboard()
    expect(screen.queryByText('F7C-S Hornet Ghost Mk II')).not.toBeInTheDocument()
    expect(screen.getByText(`${before - 1} Ships`)).toBeInTheDocument()
  })

  it('the Retired tab lists a retired vessel with subdued styling and a Retired badge, and is not mixed with active ones', () => {
    useFleetStore.getState().retireFleetAsset('ghost')
    renderDashboard()
    fireEvent.click(screen.getByText(/Retired/))
    expect(screen.getByText('F7C-S Hornet Ghost Mk II')).toBeInTheDocument()
    expect(screen.getByText('Retired')).toBeInTheDocument()
    // Ghost's card itself carries the subdued-opacity treatment.
    const card = screen.getByText('F7C-S Hornet Ghost Mk II').closest('a') as HTMLElement
    expect(card.className).toContain('opacity-60')
  })

  it('an active vessel never shows the Retired badge (the view toggle itself is the only "Retired" text present)', () => {
    renderDashboard()
    expect(screen.getAllByText('Retired')).toHaveLength(1) // just the Active/Retired toggle tab
  })

  it('the Retired tab shows the required empty-state copy when nothing has been retired', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Retired'))
    expect(screen.getByText('No vessels have been retired from the Fleet Registry.')).toBeInTheDocument()
  })

  it('EWO-073 (Part B): the Retired tab header reads "N Retired Vessel(s)," never "N Ships"', () => {
    useFleetStore.getState().retireFleetAsset('ghost')
    renderDashboard()
    fireEvent.click(screen.getByText(/Retired/))
    expect(screen.getByText('1 Retired Vessel')).toBeInTheDocument()
    expect(screen.queryByText(/^1 Ship$/)).not.toBeInTheDocument()
  })

  it('EWO-073 (Part B): pluralizes the Retired header correctly for more than one retired vessel', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const b = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Gladius Retired')
    useFleetStore.getState().retireFleetAsset('ghost')
    useFleetStore.getState().retireFleetAsset(b.assetId!)
    renderDashboard()
    fireEvent.click(screen.getByText(/Retired/))
    expect(screen.getByText('2 Retired Vessels')).toBeInTheDocument()
  })

  it('EWO-073 (optional recommendation): shows the "viewing retired vessels" subtitle only on the Retired tab', () => {
    renderDashboard()
    expect(
      screen.queryByText('Viewing retired vessels. These assets are preserved but excluded from active fleet operations.')
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/Retired/))
    expect(
      screen.getByText('Viewing retired vessels. These assets are preserved but excluded from active fleet operations.')
    ).toBeInTheDocument()
  })

  it('retiring one vessel does not affect another vessel of the same model in either view', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const a = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Gladius Active')
    const b = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Gladius Retired')
    useFleetStore.getState().retireFleetAsset(b.assetId!)

    renderDashboard()
    expect(screen.getByText('Gladius Active')).toBeInTheDocument()
    expect(screen.queryByText('Gladius Retired')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/Retired/))
    expect(screen.getByText('Gladius Retired')).toBeInTheDocument()
    expect(screen.queryByText('Gladius Active')).not.toBeInTheDocument()
  })

  it('the Retired tab label shows a count once something is retired', () => {
    renderDashboard()
    expect(screen.getByText('Retired')).toBeInTheDocument()
    cleanup()

    useFleetStore.getState().retireFleetAsset('ghost')
    renderDashboard()
    expect(screen.getByText('Retired (1)')).toBeInTheDocument()
  })
})

/**
 * EWO-099A Amendment 1 — "Fleet Dashboard Active/Retired Tab
 * Consistency." Presentation-only: the Active tab now matches Retired's
 * own icon-first, live-count treatment. Store-level lifecycle behavior
 * (retire/recommission/purge) is already covered exhaustively elsewhere
 * (fleetRegistryLifecycle.test.ts, fleetAssetPurge.test.ts) — these tests
 * cover only what's specific to this tab: the live count staying
 * correct through every lifecycle transition, and both tabs sharing
 * identical visual treatment.
 */
describe('<FleetDashboard /> — EWO-099A Amendment 1: Active/Retired tab consistency', () => {
  function addGladius(nickname?: string) {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    return useFleetStore.getState().addFleetAsset(def.id, 'OWNED', nickname).assetId!
  }

  it('the Active tab renders an icon-first "Active (N)" label with the live canonical active count', () => {
    renderDashboard()
    const activeCount = useFleetStore.getState().ships.filter((s) => s.lifecycleStatus === 'active').length
    const activeTab = screen.getByText(`Active (${activeCount})`)
    expect(activeTab).toBeInTheDocument()
    expect(activeTab.closest('button')?.querySelector('svg')).not.toBeNull()
  })

  it('the Retired tab is visually and functionally unchanged (icon-first, count hidden at zero)', () => {
    renderDashboard()
    const retiredTab = screen.getByText('Retired')
    expect(retiredTab.closest('button')?.querySelector('svg')).not.toBeNull()
  })

  it('both tab buttons share identical base classes and the identical selected-state treatment', () => {
    renderDashboard()
    const activeButton = screen.getByText(/^Active \(/).closest('button') as HTMLElement
    const retiredButton = screen.getByText('Retired').closest('button') as HTMLElement
    // Selected (Active, by default): the same bg-cyan/15 text-cyan classes Retired uses when IT is selected.
    expect(activeButton.className).toContain('bg-cyan/15')
    expect(activeButton.className).toContain('text-cyan')
    // Shared base treatment (padding/spacing/typography/hover), differing only in the border-l divider.
    const stripBorder = (cls: string) => cls.replace(/\bborder-l\b\s*/, '').replace(/\bborder-white\/10\b\s*/, '').trim()
    expect(stripBorder(activeButton.className.replace(/bg-cyan\/15|text-cyan/g, '').trim())).toBe(
      stripBorder(retiredButton.className.replace(/text-muted|hover:text-white/g, '').trim())
    )

    fireEvent.click(retiredButton)
    expect(retiredButton.className).toContain('bg-cyan/15')
    expect(retiredButton.className).toContain('text-cyan')
  })

  it('the count increases immediately when a ship is added', () => {
    renderDashboard()
    const before = useFleetStore.getState().ships.filter((s) => s.lifecycleStatus === 'active').length
    expect(screen.getByText(`Active (${before})`)).toBeInTheDocument()
    act(() => {
      addGladius('New Arrival')
    })
    expect(screen.getByText(`Active (${before + 1})`)).toBeInTheDocument()
  })

  it('the count decreases immediately when a ship is retired, and Retired\'s own count increases to match', () => {
    renderDashboard()
    const before = useFleetStore.getState().ships.filter((s) => s.lifecycleStatus === 'active').length
    act(() => {
      useFleetStore.getState().retireFleetAsset('ghost')
    })
    expect(screen.getByText(`Active (${before - 1})`)).toBeInTheDocument()
    expect(screen.getByText('Retired (1)')).toBeInTheDocument()
  })

  it('the count increases again when a retired ship returns to active service', () => {
    renderDashboard()
    const before = useFleetStore.getState().ships.filter((s) => s.lifecycleStatus === 'active').length
    act(() => {
      useFleetStore.getState().retireFleetAsset('ghost')
    })
    expect(screen.getByText(`Active (${before - 1})`)).toBeInTheDocument()
    act(() => {
      useFleetStore.getState().recommissionFleetAsset('ghost')
    })
    expect(screen.getByText(`Active (${before})`)).toBeInTheDocument()
  })

  it('purging a retired ship does not affect the Active count, and Retired\'s own count decreases', () => {
    const id = addGladius('Purge Target')
    renderDashboard()
    const activeBefore = useFleetStore.getState().ships.filter((s) => s.lifecycleStatus === 'active').length
    act(() => {
      useFleetStore.getState().retireFleetAsset(id)
    })
    expect(screen.getByText(`Active (${activeBefore - 1})`)).toBeInTheDocument()
    expect(screen.getByText('Retired (1)')).toBeInTheDocument()

    act(() => {
      useFleetStore.getState().purgeFleetAsset(id, 'Purge Target')
    })
    // The purged hull was already excluded from the Active count while
    // retired — purge itself must not change the Active count further.
    expect(screen.getByText(`Active (${activeBefore - 1})`)).toBeInTheDocument()
    expect(screen.queryByText(/^Retired \(/)).not.toBeInTheDocument()
    expect(screen.getByText('Retired')).toBeInTheDocument()
  })

  it('Active/Retired switching behavior is unaffected — clicking each tab still swaps the rendered fleet', () => {
    useFleetStore.getState().retireFleetAsset('ghost')
    renderDashboard()
    expect(screen.queryByText('F7C-S Hornet Ghost Mk II')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Retired (1)'))
    expect(screen.getByText('F7C-S Hornet Ghost Mk II')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/^Active \(/))
    expect(screen.queryByText('F7C-S Hornet Ghost Mk II')).not.toBeInTheDocument()
  })

  it('the Active count is never derived from the currently-applied ownership/manufacturer/role/readiness filters', () => {
    renderDashboard()
    const activeCount = useFleetStore.getState().ships.filter((s) => s.lifecycleStatus === 'active').length
    expandFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Owned' }))
    // Filtering narrows the rendered grid, but the tab's own live count
    // must still reflect the true canonical total, not the filtered one.
    expect(screen.getByText(`Active (${activeCount})`)).toBeInTheDocument()
  })
})
