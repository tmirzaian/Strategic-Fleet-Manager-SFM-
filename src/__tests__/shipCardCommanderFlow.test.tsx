import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useFleetStore } from '../store/useFleetStore'
import { comparePriority } from '../utils/fleetPriority'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

/**
 * EWO-033 (Task 11) — Manual Commander Validation, driven end-to-end
 * against the real `App` router (real clicks, real navigation, the seed
 * fleet's own 12 ships — well over the "at least five ships" requirement)
 * rather than a fresh `render()` per page. No browser-automation tooling
 * is available in this environment (disclosed consistently across every
 * mission this session) — this substitutes for, but is not identical to,
 * an actual resized-browser session; steps 17/18 (resize through common
 * desktop/tablet widths) are consequently verified structurally instead
 * (the grid's responsive Tailwind classes, confirmed present) rather than
 * by literally observing a live viewport reflow.
 */
describe('EWO-033 (Task 11): Commander flow — Fleet Dashboard and Mission Control Ship Card validation', () => {
  it('walks the full required sequence: Fleet Dashboard Priority display, sort/filter integrity, Mission Control Top 4, uniform cards, and click-through navigation', () => {
    const { ships } = useFleetStore.getState()
    expect(ships.length).toBeGreaterThanOrEqual(5)

    render(
      <MemoryRouter initialEntries={['/fleet']}>
        <App />
      </MemoryRouter>
    )

    // 1/2. Open Fleet Dashboard — every card displays PRIORITY N above it.
    const wrappersInitial = screen.getAllByTestId('priority-card-wrapper')
    expect(wrappersInitial).toHaveLength(ships.length)
    for (const ship of ships) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }

    // 3/4. Sort by Priority — labels and order agree.
    fireEvent.click(screen.getByRole('button', { name: 'Priority' }))
    const sortedByPriority = [...ships].sort((a, b) => comparePriority(a.priority, b.priority))
    const wrappersAfterPrioritySort = screen.getAllByTestId('priority-card-wrapper')
    wrappersAfterPrioritySort.forEach((wrapper, i) => {
      expect(wrapper).toHaveTextContent(sortedByPriority[i].name)
      expect(within(wrapper).getByText(`PRIORITY ${sortedByPriority[i].priority}`)).toBeInTheDocument()
    })

    // 5/6. Sort by Readiness — labels remain attached to the correct ships
    // (their own stored priority value, never recomputed to a positional rank).
    fireEvent.click(screen.getByRole('button', { name: 'Readiness' }))
    for (const ship of ships) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }

    // 7/8. Filter by ownership — labels remain correct.
    // EWO-059 (Part B) — Fleet Dashboard's filter matrix is collapsed by
    // default; expand it before interacting with any filter pill.
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Owned' }))
    const owned = ships.filter((s) => s.ownership === 'Owned')
    const wrappersFiltered = screen.getAllByTestId('priority-card-wrapper')
    expect(wrappersFiltered).toHaveLength(owned.length)
    for (const ship of owned) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }

    // 9. Fleet Dashboard card dimensions remain uniform — every card shares
    // the same reserved-height structural regions (jsdom-appropriate
    // structural check; see the ShipCard dimension-contract tests for the
    // per-region breakdown).
    for (const wrapper of wrappersFiltered) {
      expect(wrapper.querySelectorAll('.min-h-11').length).toBe(2)
      expect(wrapper.querySelector('.min-h-5')).not.toBeNull()
    }
    // EWO-053 (Objective B) — Fleet Dashboard's filters are now composable,
    // independent dimensions (Ownership/RSI Role/Manufacturer/Readiness),
    // each with its own "All" pill, rather than one shared selector — the
    // Ownership row's is the first in DOM order.
    fireEvent.click(screen.getAllByRole('button', { name: 'All' })[0]) // reset the Ownership filter for the rest of the flow

    // 10. Open Mission Control.
    fireEvent.click(screen.getByRole('link', { name: /Mission Control/ }))
    expect(screen.getByText('Top Priority Ship')).toBeInTheDocument()

    // 11/12. Exactly four Priority cards, Priority 1-4 based on current data.
    const mcWrappers = screen.getAllByTestId('priority-card-wrapper')
    expect(mcWrappers).toHaveLength(4)
    const top4 = [...ships].sort((a, b) => comparePriority(a.priority, b.priority)).slice(0, 4)
    mcWrappers.forEach((wrapper, i) => {
      expect(within(wrapper).getByText(`PRIORITY ${i + 1}`)).toBeInTheDocument()
      expect(wrapper).toHaveTextContent(top4[i].name)
    })

    // 13/14. All four cards have equal dimensions; placeholder-image cards
    // match real-image cards (same reserved structural regions/frame class
    // regardless of image resolution).
    const frameClasses = new Set(mcWrappers.map((w) => w.querySelector('.aspect-video')?.className))
    expect(frameClasses.size).toBe(1) // identical frame class across every card, image or placeholder
    for (const wrapper of mcWrappers) {
      expect(wrapper.querySelectorAll('.min-h-11').length).toBe(2)
    }

    // 15. The entire card navigates to the correct Ship Workspace (SW-013B Objective 1).
    const firstLink = within(mcWrappers[0]).getByRole('link')
    expect(firstLink).toHaveAttribute('href', `/ship-workspace/${top4[0].id}`)
    fireEvent.click(firstLink)
    expect(screen.getByTestId('ship-operational-banner')).toBeInTheDocument()

    // 16. Manufacturer and stock role/focus display consistently — spot
    // check a known-resolved ship's identity line renders identically to
    // what Fleet Dashboard itself would show for the same ship (verified
    // structurally elsewhere via the byte-identical outerHTML comparison
    // test in MissionControl.test.tsx).
    expect(screen.getByText(new RegExp(`^${top4[0].manufacturer}`))).toBeInTheDocument()
  })

  it('17/18. the Mission Control Priority grid uses responsive column classes that collapse gracefully without horizontal overflow', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    const grid = screen.getByText('PRIORITY 1').closest('[data-testid="priority-card-wrapper"]')?.parentElement
    expect(grid).not.toBeNull()
    // Fractional grid columns (grid-cols-N via Tailwind) never impose a
    // fixed pixel width, so the grid can never force horizontal overflow
    // at any viewport — same responsive contract Fleet Dashboard's own
    // grid already uses.
    expect(grid?.className).toContain('grid-cols-1')
    expect(grid?.className).toMatch(/sm:grid-cols-2/)
  })
})
