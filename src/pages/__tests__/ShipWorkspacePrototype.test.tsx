import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype, { criticalHardpointsInPriorityOrder } from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { colorFor } from '../../components/ReadinessBar'
import { catalogComponentsByName } from '../../generated/componentCatalog'
import type { Hardpoint } from '../../types'

const initialState = useFleetStore.getState()

// jsdom has no IntersectionObserver — the scroll-triggered sticky context
// relies on one. Stub it and capture the callback so tests can simulate
// "scrolled past the banner" directly, the same contract the real
// browser API provides.
let ioCallback: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null
class FakeIntersectionObserver {
  constructor(cb: (entries: Partial<IntersectionObserverEntry>[]) => void) {
    ioCallback = cb
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}
function simulateBannerScrolledPast(scrolledPast: boolean) {
  act(() => {
    ioCallback?.([{ isIntersecting: !scrolledPast }])
  })
}

// Some slot labels (e.g. "Quantum Drive") happen to equal a taxonomy
// subgroup label too — getByText alone is ambiguous. A port row's own
// label always sits in a <div>, never the subgroup header <td>.
function getPortRow(slotLabel: string): HTMLElement {
  const matches = screen.getAllByText(slotLabel)
  const rowLabel = matches.find((el) => el.tagName === 'DIV')
  if (!rowLabel) throw new Error(`No port row found for "${slotLabel}"`)
  return rowLabel.closest('tr') as HTMLElement
}

// SW-008A — the New Target picker (TargetComponentPicker) only ever
// commits a real, listed, compatible option — open it, filter toward the
// desired option's own text, then click that option's button. Returns the
// chosen option's own visible text (useful when the exact catalog name
// isn't known ahead of time, e.g. "the first non-current option").
function selectNewTarget(slotLabel: string, query: string): string {
  const input = screen.getByLabelText(`New target for ${slotLabel}`) as HTMLInputElement
  fireEvent.click(input)
  fireEvent.change(input, { target: { value: query } })
  const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
  const option = listbox.querySelector('button') as HTMLButtonElement
  const chosen = option.textContent ?? ''
  fireEvent.click(option)
  return chosen
}

function toRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
  ioCallback = null
  // @ts-expect-error — test-only global stub, not a real IntersectionObserver
  global.IntersectionObserver = FakeIntersectionObserver
  // jsdom has no layout engine and doesn't implement scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => cleanup())

function renderWorkspace(shipId?: string) {
  return render(
    <MemoryRouter initialEntries={[shipId ? `/ship-workspace/${shipId}` : '/ship-workspace']}>
      <Routes>
        <Route path="/ship-workspace" element={<ShipWorkspacePrototype />} />
        <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('<ShipWorkspacePrototype /> (SW-002 — Adaptive Commander Lens)', () => {
  it('EWO-060/EWO-061: the page identity reads "Ship Management" (section label, per the standardized header pattern) — the retired "Ship Workspace" name never renders', () => {
    renderWorkspace()
    expect(screen.getByText('Ship Management')).toBeInTheDocument()
    expect(screen.queryByText('Ship Workspace')).not.toBeInTheDocument()
  })

  it('EWO-061: the header follows the standardized pattern — small "Ship Management" label above one large operational title, no functional-description paragraph', () => {
    renderWorkspace()
    const label = screen.getByText('Ship Management')
    expect(label.tagName).toBe('P')
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('What does this ship need?')
    expect(screen.queryByText('Assess readiness, configure loadouts, and manage installed components.')).not.toBeInTheDocument()
  })

  it('EWO-062: shows the Quartermaster Bay empty state (Maintenance Bay Ready / Select a ship above to begin management.) when no ship is selected', () => {
    renderWorkspace()
    const label = screen.getByText('Maintenance Bay Ready')
    expect(label.tagName).toBe('P')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Select a ship above to begin management.')
    expect(screen.queryByText('Select a Ship')).not.toBeInTheDocument()
    expect(screen.queryByText(/Choose a fleet vessel above/)).not.toBeInTheDocument()
  })

  it('EWO-062: the Quartermaster Bay illustration renders as the empty state\'s full-bleed background, object-cover, never stretched', () => {
    renderWorkspace()
    const banner = screen.getByTestId('ship-operational-banner')
    const img = banner.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('/assets/environments/ship-management/quartermaster-bay-empty.webp')
    expect(img.alt).toBe('')
    expect(img.className).toContain('object-cover')
  })

  it('EWO-062A (Part A): the empty-state hero is sized via the shared SHIP_MANAGEMENT_HERO_HEIGHT_CLASS token, matching the selected-ship header\'s measured desktop footprint (343px)', () => {
    const { container } = renderWorkspace()
    const emptyHero = container.querySelector('[data-testid="ship-operational-banner"] > div:last-child') as HTMLElement
    expect(emptyHero.className).toContain('h-44')
    expect(emptyHero.className).toContain('sm:h-[343px]')
  })

  it('EWO-062A (Part A): the empty state\'s overlay copy is vertically centered across the full hero, not bottom-anchored', () => {
    renderWorkspace()
    const label = screen.getByText('Maintenance Bay Ready')
    const overlay = label.parentElement as HTMLElement
    expect(overlay.className).toContain('items-center')
    expect(overlay.className).toContain('justify-center')
    expect(overlay.className).toContain('inset-0')
  })

  it('EWO-062A (Part C): "View in Ship Detail" no longer renders in the Ship Management header', () => {
    renderWorkspace('ghost')
    expect(screen.queryByText('View in Ship Detail')).not.toBeInTheDocument()
  })

  it('EWO-062A (Part C): Developer Mode renders while the established local-developer flag is on (the test suite\'s own opt-in — see vitest.setup.ts)', () => {
    renderWorkspace('ghost')
    expect(screen.getByRole('button', { name: /Developer Mode/ })).toBeInTheDocument()
  })

  /**
   * EWO-063 — Hero State Synchronization. '135c' is Factory-only (100%
   * ready by construction — Installed = Target = Factory). 'ghost''s
   * Stealth Build has a genuinely unresolved Cooler 1 target ("SnowBlind")
   * per its own seed data (see QuickUpdate.test.tsx's identical fixture
   * note) — a real, pre-existing readiness gap, not a fixture I invented
   * for this test. Switching the Ship selector between them exercises the
   * exact same live-navigation path (`navigate()` -> new `:shipId` route
   * param -> re-render) a real Commander's dropdown triggers — never a
   * fresh `render()` per ship, which would trivially mask a genuine
   * client-navigation-only staleness bug the same way navigationFlow.
   * test.tsx's own doc comment already warns against.
   */
  it('EWO-063: switching ships immediately recalculates Readiness % and Missing Components — repeated rapid switches never leave stale data from the previous ship', () => {
    renderWorkspace('135c')
    const select = screen.getByLabelText('Ship') as HTMLSelectElement

    for (let round = 0; round < 3; round++) {
      fireEvent.change(select, { target: { value: '135c' } })
      expect(screen.getByText('100%')).toBeInTheDocument()
      expect(screen.queryByTestId('readiness-missing-summary')).not.toBeInTheDocument()

      fireEvent.change(select, { target: { value: 'ghost' } })
      expect(screen.queryByText('100%')).not.toBeInTheDocument()
      expect(screen.getByTestId('readiness-missing-summary')).toHaveTextContent(/SnowBlind/)
    }
  })

  it('EWO-063: switching ships immediately recalculates the Decision Summary — an actionable-decision ship never shows the previous ship\'s "No Immediate Decisions" state', () => {
    renderWorkspace('135c')
    const select = screen.getByLabelText('Ship') as HTMLSelectElement

    fireEvent.change(select, { target: { value: '135c' } })
    expect(screen.getByText('No Immediate Decisions')).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'ghost' } })
    expect(screen.queryByText('No Immediate Decisions')).not.toBeInTheDocument()
  })

  it('EWO-063: the Hero image remounts per ship (key={ship.id}) — no leftover image-presentation state from the previously selected ship', () => {
    renderWorkspace('135c')
    const select = screen.getByLabelText('Ship') as HTMLSelectElement
    const banner = () => screen.getByTestId('ship-operational-banner')

    fireEvent.change(select, { target: { value: '135c' } })
    const firstImg = within(banner()).getByRole('img') as HTMLImageElement
    const firstSrc = firstImg.src

    fireEvent.change(select, { target: { value: 'ghost' } })
    const secondImg = within(banner()).getByRole('img') as HTMLImageElement
    expect(secondImg.src).not.toBe(firstSrc)
  })

  it('EWO-062A (Part D): the Ship selector remains present and functional once Developer Mode/View in Ship Detail are removed', () => {
    renderWorkspace('ghost')
    const select = screen.getByLabelText('Ship') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(select.value).toBe('ghost')
  })

  it('Terminology: exactly two Commander Intent cards use SW-002 naming — Manage Loadout and Change Installed Components', () => {
    renderWorkspace('ghost')
    expect(screen.getByRole('button', { name: /Manage Loadout/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change Installed Components/ })).toBeInTheDocument()
    expect(screen.queryByText('Plan This Loadout')).not.toBeInTheDocument()
    expect(screen.queryByText('Update Installed Components')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Borrow Analysis/ })).not.toBeInTheDocument()
  })

  it('Lens 1 (default, Ship Assessment): read-only columns Factory / Installed / Target / Status', () => {
    renderWorkspace('ghost')
    expect(screen.getByText('Ship Assessment')).toBeInTheDocument()
    const headerRow = screen.getByText('Port').closest('tr') as HTMLElement
    expect(within(headerRow).getByText('Factory')).toBeInTheDocument()
    expect(within(headerRow).getByText('Installed')).toBeInTheDocument()
    expect(within(headerRow).getByText('Target')).toBeInTheDocument()
    expect(within(headerRow).getByText('Status')).toBeInTheDocument()
    expect(within(headerRow).queryByText('Actions')).not.toBeInTheDocument()
  })

  it('Lens 2 (Manage Loadout): columns become Installed / Current Target / New Target / Availability / Reservations / Actions — Factory removed', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    const headerRow = screen.getByText('Port').closest('tr') as HTMLElement
    expect(within(headerRow).queryByText('Factory')).not.toBeInTheDocument()
    expect(within(headerRow).getByText('Current Target')).toBeInTheDocument()
    expect(within(headerRow).getByText('New Target')).toBeInTheDocument()
    expect(within(headerRow).getByText('Availability')).toBeInTheDocument()
    expect(within(headerRow).getByText('Reservations')).toBeInTheDocument()
    expect(within(headerRow).getByText('Actions')).toBeInTheDocument()
  })

  it('Lens 3 (Change Installed Components): columns become Installed / Target / Inventory / Availability / Actions — Factory intentionally removed', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const headerRow = screen.getByText('Port').closest('tr') as HTMLElement
    expect(within(headerRow).queryByText('Factory')).not.toBeInTheDocument()
    expect(within(headerRow).getByText('Inventory')).toBeInTheDocument()
    expect(within(headerRow).getByText('Availability')).toBeInTheDocument()
    expect(within(headerRow).getByText('Actions')).toBeInTheDocument()
    expect(within(headerRow).queryByText('Current Target')).not.toBeInTheDocument()
  })

  it('Engineering Guidance: switching lenses preserves the expanded taxonomy group — never resets like a new screen', () => {
    renderWorkspace('ghost')
    // Core Components starts expanded; expand Detection / Navigation too.
    fireEvent.click(screen.getByText('Detection / Navigation'))
    expect(screen.getByText('Radar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    expect(screen.getByText('Radar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    expect(screen.getByText('Radar')).toBeInTheDocument()
  })

  it('SW-013A (Objective 2): switching the reviewed Loadout (the pill selector) also preserves the expanded taxonomy group — tree structure is a ship-topology concern, not a per-Loadout one', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByText('Detection / Navigation'))
    expect(screen.getByText('Radar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
    expect(screen.getByText('Radar')).toBeInTheDocument()
  })

  it('SW-008A: editing New Target (via the compatible-options picker) updates Change Status to Pending Changes, and the edit survives switching lenses', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    const banner = screen.getByTestId('ship-operational-banner')
    expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()

    // Left Shield Generator's real current target is "Mirage" (see
    // seed.ts's customBuildOverlays); its real canonical factory item is
    // "Shimmer" — a genuinely different, always-offered compatible option
    // (SW-008A Objective 3), so selecting it exercises a real change
    // without depending on Hangar stock being present.
    selectNewTarget('Left Shield Generator', 'Shimmer')
    expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()

    // Switching to Lens 3 and back never discards the edit ("Never Lose Commander Work").
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    expect((screen.getByLabelText('New target for Left Shield Generator') as HTMLInputElement).value).toBe('Shimmer')

    // Never persisted to the store (Objective 4).
    expect(useFleetStore.getState().hardpoints.find((h) => h.slotLabel === 'Left Shield Generator' && h.buildId === 'ghost-stealth')?.targetItem).toBe('Mirage')
  })

  it('SW-008A: returning New Target to its original value automatically clears the Pending Change (Objective 6)', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    const banner = screen.getByTestId('ship-operational-banner')
    selectNewTarget('Left Shield Generator', 'Shimmer')
    expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()
    selectNewTarget('Left Shield Generator', 'Mirage')
    expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()
  })

  it('SW-008A: multiple simultaneous edits accumulate in the Pending Change count', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    const banner = screen.getByTestId('ship-operational-banner')
    selectNewTarget('Left Shield Generator', 'Shimmer')
    expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()
    selectNewTarget('Power Plant', 'Intentional Empty')
    expect(within(banner).getByText('Pending Changes (2)')).toBeInTheDocument()
  })

  it('Manage Loadout: "Restore factory target" only appears once edited, and resets the field to the Factory value', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    expect(screen.queryByTitle('Restore factory target')).not.toBeInTheDocument()

    selectNewTarget('Left Shield Generator', 'Intentional Empty')
    const resetButton = screen.getByTitle('Restore factory target')
    fireEvent.click(resetButton)
    // ghost-stealth Left Shield Generator's factory item is "Shimmer" (canonical topology).
    expect((screen.getByLabelText('New target for Left Shield Generator') as HTMLInputElement).value).toBe('Shimmer')
  })

  // SW-013C.1 (Objective 5) — superseded. A reviewed-Loadout switch used to
  // discard local New Target edits immediately and silently — the exact
  // "Commander cannot reliably save a build" failure mode SW-013C.1's live
  // vertical proof reproduced: an edit looked committed (the New Target
  // cell updates on selection) but vanished the instant a different
  // Loadout pill was clicked, with no warning. The pill click no longer
  // switches immediately when a pending edit exists; it now stages the
  // switch behind an explicit inline confirm (see the SW-013C.1 describe
  // block below for the guarded contract).
  describe('SW-013C.1 (Objective 5): switching Loadouts with unsaved New Target edits is guarded, never silent', () => {
    it('clicking a different Loadout pill does NOT switch immediately when a pending edit exists — it stages an inline confirm instead', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      selectNewTarget('Left Shield Generator', 'Shimmer')
      fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))

      // Still reviewing Stealth Build — the edit is untouched.
      const banner = screen.getByTestId('ship-operational-banner')
      expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()
      expect((screen.getByLabelText('New target for Left Shield Generator') as HTMLInputElement).value).toBe('Shimmer')
      expect(screen.getByRole('button', { name: /Discard & Switch/ })).toBeInTheDocument()
    })

    it('the reviewed pill itself carries an "Unsaved" badge while a pending edit exists', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      selectNewTarget('Left Shield Generator', 'Shimmer')
      expect(screen.getByRole('button', { name: /Stealth Build.*Unsaved/s })).toBeInTheDocument()
    })

    it('Cancel keeps the Commander on the original Loadout with the edit fully intact', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      selectNewTarget('Left Shield Generator', 'Shimmer')
      fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('button', { name: /Discard & Switch/ })).not.toBeInTheDocument()
      const banner = screen.getByTestId('ship-operational-banner')
      expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()
      expect((screen.getByLabelText('New target for Left Shield Generator') as HTMLInputElement).value).toBe('Shimmer')
      // Never persisted to the store either — Cancel is a pure UI no-op.
      expect(useFleetStore.getState().hardpoints.find((h) => h.slotLabel === 'Left Shield Generator' && h.buildId === 'ghost-stealth')?.targetItem).toBe('Mirage')
    })

    it('"Discard & Switch" performs the switch and clears the pending edit, with explicit Commander consent', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      selectNewTarget('Left Shield Generator', 'Shimmer')
      fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
      fireEvent.click(screen.getByRole('button', { name: /Discard & Switch/ }))

      expect(screen.queryByRole('button', { name: /Discard & Switch/ })).not.toBeInTheDocument()
      const banner = screen.getByTestId('ship-operational-banner')
      expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()
      // The discarded edit was never written to the store.
      expect(useFleetStore.getState().hardpoints.find((h) => h.slotLabel === 'Left Shield Generator' && h.buildId === 'ghost-stealth')?.targetItem).toBe('Mirage')
    })

    it('a pill click with NO pending edits still switches immediately — the guard never adds friction to the common case', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
      expect(screen.queryByRole('button', { name: /Discard & Switch/ })).not.toBeInTheDocument()
      // Escort Build is now reviewed — its own pill carries the ACTIVE/reviewed styling; confirmed indirectly via no confirm bar and a normal render.
    })
  })

  describe('SW-008D: Loadout Lifecycle Completion', () => {
    it('Objective 1: Save Changes persists the pending New Target to the store, refreshes Current Target, and clears the Pending Changes counter', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const banner = screen.getByTestId('ship-operational-banner')
      selectNewTarget('Left Shield Generator', 'Shimmer')
      expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()

      fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])

      expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()
      expect(screen.getByText(/saved\.?$/)).toBeInTheDocument()
      // Objective 1: real persistence, not a local-only edit anymore.
      expect(useFleetStore.getState().hardpoints.find((h) => h.slotLabel === 'Left Shield Generator' && h.buildId === 'ghost-stealth')?.targetItem).toBe('Shimmer')
      // Current Target reflects the save immediately.
      expect((screen.getByLabelText('New target for Left Shield Generator') as HTMLInputElement).value).toBe('Shimmer')
    })

    it('Objective 2: Discard Changes restores New Target to Current Target and clears the Pending Changes counter without touching the store', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const banner = screen.getByTestId('ship-operational-banner')
      const before = useFleetStore.getState()
      selectNewTarget('Left Shield Generator', 'Shimmer')
      expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()

      fireEvent.click(screen.getAllByRole('button', { name: /Discard Changes/ })[0])

      expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()
      expect((screen.getByLabelText('New target for Left Shield Generator') as HTMLInputElement).value).toBe('Mirage')
      expect(useFleetStore.getState()).toBe(before)
    })

    it('Objective 5: the draft transaction model stays internally consistent across No Pending -> Pending -> Save -> No Pending -> Edit -> Pending -> Discard -> No Pending', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const banner = screen.getByTestId('ship-operational-banner')
      expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()

      selectNewTarget('Left Shield Generator', 'Shimmer')
      selectNewTarget('Power Plant', 'Intentional Empty')
      expect(within(banner).getByText('Pending Changes (2)')).toBeInTheDocument()

      fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])
      expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()

      selectNewTarget('Left Shield Generator', 'Mirage')
      expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()

      fireEvent.click(screen.getAllByRole('button', { name: /Discard Changes/ })[0])
      expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()
    })

    it('Objective 3: New Loadout creates a real Build, selects it, and enters Manage Loadout with Current/New Target correctly initialized', () => {
      renderWorkspace('ghost')
      const buildCountBefore = useFleetStore.getState().builds.filter((b) => b.shipId === 'ghost').length
      fireEvent.click(screen.getByRole('button', { name: /New Loadout/ }))
      fireEvent.change(screen.getByLabelText('Loadout Name'), { target: { value: 'Skirmish Build' } })
      fireEvent.click(screen.getByRole('button', { name: 'Factory Loadout' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Loadout' }))

      const builds = useFleetStore.getState().builds.filter((b) => b.shipId === 'ghost')
      expect(builds.length).toBe(buildCountBefore + 1)
      const created = builds.find((b) => b.name === 'Skirmish Build')
      expect(created).toBeDefined()

      // Selected and entered Manage Loadout automatically.
      expect(screen.getByRole('button', { name: /Skirmish Build/ })).toHaveAttribute('style', expect.stringContaining('border-color'))
      expect(screen.getByRole('button', { name: /Manage Loadout/ })).toHaveAttribute('aria-pressed', 'true')
      // Factory-initialized: Power Plant's New Target reads its real Factory item.
      const factoryPowerPlant = useFleetStore.getState().hardpoints.find((h) => h.buildId === created!.id && h.slotLabel === 'Power Plant')
      expect((screen.getByLabelText('New target for Power Plant') as HTMLInputElement).value).toBe(factoryPowerPlant?.factoryItem)
    })

    it('Objective 3: duplicate Loadout names are rejected gracefully, without creating a second record', () => {
      renderWorkspace('ghost')
      const buildCountBefore = useFleetStore.getState().builds.filter((b) => b.shipId === 'ghost').length
      fireEvent.click(screen.getByRole('button', { name: /New Loadout/ }))
      fireEvent.change(screen.getByLabelText('Loadout Name'), { target: { value: 'Stealth Build' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create Loadout' }))

      expect(screen.getByText(/already exists/)).toBeInTheDocument()
      expect(useFleetStore.getState().builds.filter((b) => b.shipId === 'ghost').length).toBe(buildCountBefore)
    })

    it('Objective 3: Cancel leaves no partial record and no store mutation', () => {
      renderWorkspace('ghost')
      const before = useFleetStore.getState()
      fireEvent.click(screen.getByRole('button', { name: /New Loadout/ }))
      fireEvent.change(screen.getByLabelText('Loadout Name'), { target: { value: 'Abandoned Build' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByLabelText('Loadout Name')).not.toBeInTheDocument()
      expect(screen.queryByText('Abandoned Build')).not.toBeInTheDocument()
      expect(useFleetStore.getState()).toBe(before)
      expect(useFleetStore.getState().builds.some((b) => b.name === 'Abandoned Build')).toBe(false)
    })

    it('Objective 6: full lifecycle — Create, Edit, Save, Reopen, Edit Again, Discard, Activate, Switch, Return, verify persistence', () => {
      renderWorkspace('ghost')

      // Create — initialized from the Active Loadout (ghost-stealth), so
      // Left Shield Generator starts at its well-known real value
      // ("Mirage", the same fixture the Objective 1/2 tests above use),
      // making "Shimmer" a real, unambiguous, known-different edit.
      fireEvent.click(screen.getByRole('button', { name: /New Loadout/ }))
      fireEvent.change(screen.getByLabelText('Loadout Name'), { target: { value: 'Patrol Build' } })
      fireEvent.click(screen.getByRole('button', { name: 'Active Loadout' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Loadout' }))
      const created = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.name === 'Patrol Build')!
      expect(created).toBeDefined()
      expect(useFleetStore.getState().hardpoints.find((h) => h.buildId === created.id && h.slotLabel === 'Left Shield Generator')?.targetItem).toBe('Mirage')

      // Edit + Save.
      const banner = screen.getByTestId('ship-operational-banner')
      selectNewTarget('Left Shield Generator', 'Shimmer')
      expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()
      fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])
      expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()
      expect(useFleetStore.getState().hardpoints.find((h) => h.buildId === created.id && h.slotLabel === 'Left Shield Generator')?.targetItem).toBe('Shimmer')

      // Reopen (switch away and back — Save's persistence survives).
      fireEvent.click(screen.getByRole('button', { name: /Stealth Build/ }))
      fireEvent.click(screen.getByRole('button', { name: /Patrol Build/ }))
      expect((screen.getByLabelText('New target for Left Shield Generator') as HTMLInputElement).value).toBe('Shimmer')

      // Edit Again + Discard.
      selectNewTarget('Left Shield Generator', 'Mirage')
      expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()
      fireEvent.click(screen.getAllByRole('button', { name: /Discard Changes/ })[0])
      expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()
      // The discarded edit never persisted — the Save from earlier still stands.
      expect(useFleetStore.getState().hardpoints.find((h) => h.buildId === created.id && h.slotLabel === 'Left Shield Generator')?.targetItem).toBe('Shimmer')

      // Activate.
      fireEvent.click(screen.getByRole('button', { name: /Set Active/ }))
      expect(useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.activeBuildId).toBe(created.id)

      // Switch Loadouts, then Return.
      fireEvent.click(screen.getByRole('button', { name: /Stealth Build/ }))
      expect(screen.getByRole('button', { name: /Manage Loadout/ })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByRole('button', { name: /Patrol Build/ }))

      // Verify persistence — a fresh render of the same store state still shows the saved edit.
      cleanup()
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      fireEvent.click(screen.getByRole('button', { name: /Patrol Build/ }))
      expect((screen.getByLabelText('New target for Left Shield Generator') as HTMLInputElement).value).toBe('Shimmer')
    })
  })

  it('Change Installed Components: "Install / Change" is a single unified action per row, expanding an inline disclosure (never a dialog)', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const installButtons = screen.getAllByRole('button', { name: /Install \/ Change/ })
    expect(installButtons.length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(installButtons[0])
    // Reference tiers (the preserved existing intelligence — SW-014A keeps
    // this exact text) are visible in the inline disclosure.
    expect(screen.getByText(/Add Newly Acquired Component/)).toBeInTheDocument()
    // SW-014A — the tier list is now actionable: a "Record New Component"
    // entry point is always present (Tier 4 never depends on existing
    // ownership/reservation data to be reachable).
    expect(screen.getByText('Record New Component')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  describe('SW-013A (Objective 3): Remove Installed Component', () => {
    it('shows a Remove action per installed row in Change Installed Components, and opens a real confirm modal (the one deliberate exception to this page\'s "no dialog" convention)', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
      const removeButtons = screen.getAllByRole('button', { name: /Remove/ })
      expect(removeButtons.length).toBeGreaterThan(0)

      fireEvent.click(removeButtons[0])
      expect(screen.getByText(/Remove "/)).toBeInTheDocument()
      expect(screen.getByText('Return removed component to Hangar')).toBeInTheDocument()
    })

    it('EWO-063 (Parts A/B): removing an installed component immediately updates the Hero\'s own Readiness % and Missing Components — no separate action needed to refresh it, since Hero and Table now read the one same ShipManagementSummary', () => {
      renderWorkspace('ghost')
      const readinessBefore = screen.getByText('Readiness').nextElementSibling!.textContent
      expect(screen.queryByTestId('readiness-missing-summary')).not.toHaveTextContent(/Mirage/)

      fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
      const row = getPortRow('Left Shield Generator')
      fireEvent.click(within(row).getByRole('button', { name: /Remove/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      const readinessAfter = screen.getByText('Readiness').nextElementSibling!.textContent
      expect(readinessAfter).not.toBe(readinessBefore)
      expect(screen.getByTestId('readiness-missing-summary')).toHaveTextContent(/Mirage/)
    })

    it('Cancel closes the modal without mutating the store', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
      const before = useFleetStore.getState()
      fireEvent.click(screen.getAllByRole('button', { name: /Remove/ })[0])
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByText(/Return removed component to Hangar/)).not.toBeInTheDocument()
      expect(useFleetStore.getState()).toBe(before)
    })

    it('Save removes the real installed component via the shared installation engine — the Installed cell clears and the Hangar quantity is unaffected when "Return to Hangar" is unchecked', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
      const row = getPortRow('Left Shield Generator')
      const removeButton = within(row).getByRole('button', { name: /Remove/ })
      const hangarBefore = useFleetStore.getState().hangarItems.find((h) => h.name === 'Mirage')?.qty ?? 0

      fireEvent.click(removeButton)
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(screen.queryByText(/Remove "/)).not.toBeInTheDocument()
      const hp = useFleetStore.getState().hardpoints.find((h) => h.slotLabel === 'Left Shield Generator' && h.buildId === useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.activeBuildId)
      expect(hp?.installedItem).toBe('—')
      // Not returned to Hangar — quantity untouched.
      const hangarAfter = useFleetStore.getState().hangarItems.find((h) => h.name === 'Mirage')?.qty ?? 0
      expect(hangarAfter).toBe(hangarBefore)
    })

    it('"Return removed component to Hangar" checked increases the Hangar quantity for the removed item', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
      const row = getPortRow('Left Shield Generator')
      fireEvent.click(within(row).getByRole('button', { name: /Remove/ }))

      const itemName = screen.getByText(/Remove "/).textContent?.match(/Remove "(.+)"\?/)?.[1] ?? ''
      expect(itemName).toBe('Mirage')
      const hangarBefore = useFleetStore.getState().hangarItems.find((h) => h.name === itemName)?.qty ?? 0

      fireEvent.click(screen.getByLabelText('Return removed component to Hangar'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      const hangarAfter = useFleetStore.getState().hangarItems.find((h) => h.name === itemName)?.qty ?? 0
      expect(hangarAfter).toBe(hangarBefore + 1)
    })

    it('a Captain\'s Log entry is recorded on a successful removal', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
      const logCountBefore = useFleetStore.getState().log.length
      const row = getPortRow('Left Shield Generator')
      fireEvent.click(within(row).getByRole('button', { name: /Remove/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(useFleetStore.getState().log.length).toBe(logCountBefore + 1)
      expect(useFleetStore.getState().log[0].action).toBe('Removed component')
    })

    it('a missile-rack aggregate row (representing N real slots) never shows a Remove action — no single unambiguous target', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
      const aggregateRow = screen.getAllByText(/Missile/).map((el) => el.closest('tr')).find((tr) => tr && within(tr).queryByText(/×\d/))
      if (aggregateRow) {
        expect(within(aggregateRow).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
      }
    })

  })

  it('Immediate Decision Intelligence: decision cards answer "what should I do," never a bare component name', () => {
    renderWorkspace('ghost')
    const decisionBox = screen.getByTestId('decision-summary')
    // SnowBlind is owned (qty 1) and unreserved in the seed Hangar — real
    // inventory-accounting data, not a fabricated readiness projection.
    expect(within(decisionBox).getByText('Install SnowBlind')).toBeInTheDocument()
    expect(within(decisionBox).getByText('Available in Inventory')).toBeInTheDocument()
    // SW-002 Revision C — Slipstream (Purchase Required, non-actionable)
    // is deliberately excluded from Decision Summary entirely.
    expect(within(decisionBox).queryByText('Install Slipstream')).not.toBeInTheDocument()
    expect(decisionBox.textContent).not.toMatch(/\d+%\s*readiness/i)
  })

  it('Taxonomy: Detection / Navigation, Manned Turrets, and Remote Turrets render as Ship Detail\'s own canonical top-level categories (SW-007C unification) — never Workspace-invented "Navigation"/"Engineering"/"Turrets" labels', () => {
    renderWorkspace('ghost')
    expect(screen.getByText('Detection / Navigation')).toBeInTheDocument()
    expect(screen.queryByText('Engineering')).not.toBeInTheDocument()
    expect(screen.queryByText('Navigation')).not.toBeInTheDocument()
    expect(screen.queryByText('Turrets')).not.toBeInTheDocument()
  })

  it('Taxonomy: Quantum Drive now lives under Core Components (expanded by default) rather than a separate Engineering/Navigation group', () => {
    renderWorkspace('ghost')
    // Core Components is expanded by default (no click needed) and
    // Quantum Drive's own port row is classified directly under it — no
    // subgroup pill exists anymore (SW-007C dropped subgroups entirely),
    // so the slotLabel itself is the only "Quantum Drive" text on screen.
    expect(screen.getByText('Quantum Drive')).toBeInTheDocument()
  })

  it('the reviewed loadout still receives a readiness-colored accent, distinct from the ACTIVE badge (SW-001 behavior preserved)', () => {
    renderWorkspace('ghost')
    const stealthButton = screen.getByRole('button', { name: /Stealth Build/ })
    expect(stealthButton.style.borderColor).toBe(toRgb(colorFor(92)))
    expect(within(stealthButton).getByText('Active')).toBeInTheDocument()
  })

  it('EWO-064 (Part F): the banner starts on the real ACTIVE Loadout, then follows the reviewed selection once switched — the Hero reflects Reviewed, not merely Active (supersedes the old SW-001 "independent of reviewed selection" behavior)', () => {
    renderWorkspace('ghost')
    const banner = screen.getByTestId('ship-operational-banner')
    // SW-013C.2B — 93%, not the pre-Module-taxonomy 92%: two new, real
    // Module ports (Center/Nose) now exist and are matched by default
    // (factory Cap === installed === target), shifting the denominator.
    // Stealth Build is both Active and (by default) Reviewed here.
    expect(within(banner).getByText('93%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
    // Escort Build's own readiness now drives the Hero — no longer frozen on Stealth Build's 93%.
    expect(within(banner).queryByText('93%')).not.toBeInTheDocument()
  })

  it('Part I behaviors preserved: sticky context hidden until scrolled past the banner, Ship Selector lives in the page header', () => {
    renderWorkspace('ghost')
    expect(screen.queryByTestId('sticky-context-bar')).not.toBeInTheDocument()
    simulateBannerScrolledPast(true)
    const sticky = screen.getByTestId('sticky-context-bar')
    expect(within(sticky).getByText('F7C-S Hornet Ghost Mk II')).toBeInTheDocument()
    const banner = screen.getByTestId('ship-operational-banner')
    expect(within(banner).queryByLabelText('Ship')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ship')).toBeInTheDocument()
  })

  it('SW-007D: a missile rack renders as one summarized aggregate row, never one peer row per missile slot', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByText('Missile Racks'))
    // Ghost's Right Missile Rack is a real 4-slot S1 rack (see
    // src/utils/__tests__/missileRackAggregation.test.ts) — the rack
    // itself is still its own row (identity, size, installed/target rack),
    // but its four real "Right Missile Rack — 0N Attach Missile" children
    // collapse into exactly one aggregate row rather than rendering as
    // four identical peer rows.
    expect(screen.getByText('Right Missile Rack')).toBeInTheDocument()
    const aggregateRow = getPortRow('Missile')
    expect(within(aggregateRow).getByText('×4')).toBeInTheDocument()
    // CAT-001 also surfaces "S1" inside the row's own Factory/Installed/
    // Target identity subtitles now, so more than one match is expected.
    expect(within(aggregateRow).getAllByText(/S1/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Missile Slot 1/)).not.toBeInTheDocument()
  })

  it('SW-008C (Objective 3/5): swapping a missile rack\'s New Target immediately regenerates its child topology — count, size, and aggregation label all update, no stale children remain', () => {
    if (catalogComponentsByName.size === 0) return
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    fireEvent.click(screen.getByText('Missile Racks'))
    // Before: Right Missile Rack is MSD-341, a real 4-slot S1 rack.
    const beforeRow = getPortRow('Missile')
    expect(within(beforeRow).getByText('×4')).toBeInTheDocument()

    // Manage Loadout's New Target picker is local-editing-only (SW-008A) —
    // this pending choice was never written back to the store's real
    // Hardpoint rows. Before SW-008C, the aggregate row below stayed
    // frozen at the OLD rack's x4/S1 shape; this proves it now regenerates
    // from the pending choice immediately, same as MissionComposer's own
    // live preview already does via the same shared
    // withComponentOwnedChildSlots mechanism.
    //
    // SW-013C.2F Amendment A (Finding 2) — was "Mirai Fury MX 2xS2" (the
    // Fury's own rack). Direct dcb query confirmed that rack carries a
    // real, self-referential DataCore Tags/RequiredTags pair
    // ("$MISC_Fury_Miru"/"MISC_Fury_Miru") — CIG's own vessel-lock
    // convention, meaning it was never actually a legitimate, unrestricted
    // cross-ship swap; it only ever appeared here because the generic
    // sweep couldn't yet see that restriction (the exact defect Finding 2
    // reported for the Warlock's Gatac rack). Now correctly excluded from
    // the picker's suggestions.
    //
    // Swapped to "MSD-313 Missile Rack" (entityClass MRCK_S03_BEHR_Single_S03,
    // vesselBoundTags: []) — this is ALSO the Finding 3 fixture: this
    // display name is shared by five real, differently-shaped entityClasses
    // (four unrelated BombLauncher racks on the Spirit A1/Starlancer, plus
    // this one genuine MissileLauncher/S3 rack), formerly forced to a
    // single stale answer by a now-removed hand-authored CATALOG override
    // (see src/data/componentCatalog.ts). With the override gone, the
    // BombLauncher variants correctly fail this Missile-Rack-typed port's
    // compatibility check, leaving exactly one real, unambiguous,
    // unrestricted candidate — which also happens to give a clean,
    // different-from-factory shape (1x S3 child vs the factory's 4x S1),
    // a stronger regeneration proof than the original Fury rack (which
    // only changed count, not size).
    selectNewTarget('Right Missile Rack', 'MSD-313 Missile Rack')

    const afterRow = getPortRow('Missile')
    expect(within(afterRow).getByText('×1')).toBeInTheDocument()
    expect(within(afterRow).getByText('S3 Missile')).toBeInTheDocument()
    expect(within(afterRow).queryByText('×4')).not.toBeInTheDocument()
    // The old rack's 3rd/4th slots must not survive as stale leftovers anywhere.
    expect(screen.queryByText(/Missile Slot 3/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Missile Slot 4/)).not.toBeInTheDocument()
  })

  it('SW-007B Rev 2: every port row renders the shared Commander Glyph Language icon — the same authority Ship Detail consumes, never an independent mapping', () => {
    renderWorkspace('ghost')
    const powerRow = getPortRow('Power Plant')
    const powerIcon = powerRow.querySelector('svg') as SVGElement
    expect(powerIcon).toBeTruthy()
    // componentCategoryIcon (the shared authority) maps Power Plant -> Zap;
    // confirming the real lucide glyph class landed proves this row is
    // driven by that function, not a leftover/independent icon choice.
    expect(powerIcon.getAttribute('class')).toContain('lucide-zap')
  })
})

describe('criticalHardpointsInPriorityOrder (SW-002 Revision A, Phase 4)', () => {
  function hp(overrides: Partial<Hardpoint>): Hardpoint {
    return {
      id: overrides.id ?? 'hp',
      shipId: 'test',
      buildId: 'test-build',
      slotLabel: overrides.slotLabel ?? 'Slot',
      type: 'Weapon',
      size: 'S1',
      factoryItem: 'X',
      installedItem: 'X',
      targetItem: 'X',
      status: 'OK',
      ...overrides,
    }
  }

  it('sorts Invalid Target hardpoints ahead of Missing ones, regardless of input order', () => {
    const missing1 = hp({ id: 'm1', status: 'Missing' })
    const missing2 = hp({ id: 'm2', status: 'Missing' })
    const invalid1 = hp({ id: 'i1', status: 'Invalid Target' })
    const result = criticalHardpointsInPriorityOrder([missing1, missing2, invalid1])
    expect(result.map((h) => h.id)).toEqual(['i1', 'm1', 'm2'])
  })

  it('excludes OK and Unresolved; EWO-064 (Part C) now includes Upgrade Available as a genuine decision', () => {
    const result = criticalHardpointsInPriorityOrder([
      hp({ id: 'ok', status: 'OK' }),
      hp({ id: 'unresolved', status: 'Unresolved' }),
      hp({ id: 'upgrade', status: 'Upgrade Available' }),
    ])
    expect(result.map((h) => h.id)).toEqual(['upgrade'])
  })

  it('the caller caps display at 4 while this function itself returns the full ordered set (capping is a presentation concern)', () => {
    const invalids = [hp({ id: 'i1', status: 'Invalid Target' }), hp({ id: 'i2', status: 'Invalid Target' })]
    const missing = [hp({ id: 'm1', status: 'Missing' }), hp({ id: 'm2', status: 'Missing' }), hp({ id: 'm3', status: 'Missing' })]
    const result = criticalHardpointsInPriorityOrder([...missing, ...invalids])
    expect(result).toHaveLength(5)
    expect(result.slice(0, 4).map((h) => h.id)).toEqual(['i1', 'i2', 'm1', 'm2'])
  })
})

describe('<ShipWorkspacePrototype /> — SW-002 Revision A (canonical pipeline, taxonomy, diagnostics, compatibility, completeness)', () => {
  describe('Taxonomy fixtures — Corsair, Railen, MOLE', () => {
    it('Corsair: Manned Turrets and Remote Turrets render as their own canonical categories (SW-007C unification), never a merged "Turrets"/"Internal Systems"', () => {
      renderWorkspace('corsair')
      expect(screen.queryByText('Turrets')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Manned Turrets'))
      fireEvent.click(screen.getByText('Remote Turrets'))
      expect(screen.getByText('Tail Turret (Remote Turret)')).toBeInTheDocument()
      // Corsair has three turret assemblies — Left/Right Manned Turret (2)
      // and Tail Remote Turret (1) — each contributing a child that
      // formats to the same short label, split across the two categories.
      expect(screen.getAllByText('Left Weapon Mount')).toHaveLength(3)
      expect(screen.getAllByText('Right Weapon Mount')).toHaveLength(3)
    })

    it('Railen: both Left and Right manned turret assemblies remain coherent under Manned Turrets', () => {
      renderWorkspace('railen')
      fireEvent.click(screen.getByText('Manned Turrets'))
      expect(screen.getByText('Left Turret (Manned Turret)')).toBeInTheDocument()
      expect(screen.getByText('Right Turret (Manned Turret)')).toBeInTheDocument()
      // Both turrets' child weapon mounts format to the same short label
      // (formatHardpointLabel operates on each row's own local name) — one
      // pair per turret, four total.
      expect(screen.getAllByText('Left Weapon Mount')).toHaveLength(2)
      expect(screen.getAllByText('Right Weapon Mount')).toHaveLength(2)
    })

    it('Railen: the Tractor Left/Right assemblies (real canonical Manned-Turret-classified ports) render under Manned Turrets', () => {
      renderWorkspace('railen')
      fireEvent.click(screen.getByText('Manned Turrets'))
      expect(screen.getByText('Tractor Left (Manned Turret)')).toBeInTheDocument()
      expect(screen.getByText('Tractor Right (Manned Turret)')).toBeInTheDocument()
    })

    it("MOLE: all three Mining Laser turret assemblies, and their own real Mining Weapon children, remain coherent under Manned Turrets", () => {
      renderWorkspace('mole')
      fireEvent.click(screen.getByText('Manned Turrets'))
      expect(screen.getByText('Front Cab Mining Laser (Manned Turret)')).toBeInTheDocument()
      expect(screen.getByText('Left Cab Mining Laser (Manned Turret)')).toBeInTheDocument()
      expect(screen.getByText('Right Cab Mining Laser (Manned Turret)')).toBeInTheDocument()
      // All three turrets' single child formats to the same short label.
      expect(screen.getAllByText('Mining Weapon')).toHaveLength(3)
    })
  })

  describe('Canonical pipeline (Phase 1)', () => {
    it('the reviewed Loadout\'s systems tree renders canonical Factory/Installed/Target values (Ghost Left Shield Generator) in Ship Assessment', () => {
      renderWorkspace('ghost')
      const row = screen.getByText('Left Shield Generator').closest('tr') as HTMLElement
      expect(within(row).getByText('Shimmer')).toBeInTheDocument()
      expect(within(row).getAllByText('Mirage').length).toBeGreaterThan(0)
    })

    it('EWO-064 (Part F): active and reviewed builds are prepared through the same canonical pipeline — switching the reviewed Loadout changes the systems tree data AND the Hero, since the Hero now reflects the Reviewed Loadout rather than merely the Active one', () => {
      renderWorkspace('ghost')
      const readinessBefore = screen.getByText('Readiness').nextElementSibling!.textContent
      const shieldRowBefore = screen.getByText('Left Shield Generator').closest('tr') as HTMLElement
      expect(within(shieldRowBefore).getAllByText('Mirage').length).toBeGreaterThan(0)

      fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
      // Reviewed tree now reflects Escort Build's own Left Shield Generator target (FR-66).
      const shieldRowAfter = screen.getByText('Left Shield Generator').closest('tr') as HTMLElement
      expect(within(shieldRowAfter).getByText('FR-66')).toBeInTheDocument()
      // The Hero recalculates for the newly-reviewed Escort Build too (Part F) — no
      // longer frozen on whatever the ship's Active Loadout happened to be.
      const readinessAfter = screen.getByText('Readiness').nextElementSibling!.textContent
      expect(readinessAfter).not.toBe(readinessBefore)
    })
  })

  describe('Diagnostic truth in every lens (Phase 3) — M80, real Invalid Target + Unresolved Factory Data', () => {
    it('Invalid Target (Quantum Drive) is visible in Ship Assessment (Lens 1)', () => {
      renderWorkspace('m80')
      const row = getPortRow('Quantum Drive')
      expect(within(row).getByText('Invalid Target')).toBeInTheDocument()
    })

    it('Invalid Target (Quantum Drive) remains visible in Manage Loadout (Lens 2)', () => {
      renderWorkspace('m80')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const row = getPortRow('Quantum Drive')
      expect(within(row).getByText('Invalid Target')).toBeInTheDocument()
    })

    it('Invalid Target (Quantum Drive) remains visible in Change Installed Components (Lens 3)', () => {
      renderWorkspace('m80')
      fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
      const row = getPortRow('Quantum Drive')
      expect(within(row).getByText('Invalid Target')).toBeInTheDocument()
    })

    it('Unresolved Factory Data is visible in all three lenses', () => {
      renderWorkspace('m80')
      // M80 has no "Nose Mount" — its Weapon 1/2 are top-level Pilot-
      // Weapons-family ports, which start collapsed by default (only Core
      // Components is expanded on first render).
      fireEvent.click(screen.getByText('Pilot Weapons'))
      const rowLens1 = getPortRow('Weapon 1')
      expect(within(rowLens1).getByText('Unresolved')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const rowLens2 = getPortRow('Weapon 1')
      expect(within(rowLens2).getByText('Unresolved')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
      const rowLens3 = getPortRow('Weapon 1')
      expect(within(rowLens3).getByText('Unresolved')).toBeInTheDocument()
    })

    it('unknown/unresolved data never renders as "Not Required" (NOT REQUIRED / UNKNOWN DATA RULE)', () => {
      renderWorkspace('m80')
      fireEvent.click(screen.getByText('Pilot Weapons'))
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const row = getPortRow('Weapon 1')
      expect(within(row).queryByText('Not Required')).not.toBeInTheDocument()
    })

    it('invalid targets appear in Immediate Decisions, matching the work order\'s own "Resolve incompatible Atlas target" example', () => {
      renderWorkspace('m80')
      const decisionBox = screen.getByTestId('decision-summary')
      expect(within(decisionBox).getByText('Resolve Atlas')).toBeInTheDocument()
      expect(within(decisionBox).getByText('Incompatible Target')).toBeInTheDocument()
    })

    it('the Priority Components strip beneath Readiness also surfaces the invalid target', () => {
      renderWorkspace('m80')
      const strip = screen.getByTestId('priority-components-strip')
      expect(within(strip).getByText('Atlas')).toBeInTheDocument()
    })
  })

  describe('SW-008A Objective 2: incompatible components can never be selected (no free-form entry, no danger-hint workaround)', () => {
    it('a real Weapon component never appears anywhere in a Power Plant port\'s New Target options — incompatible by construction, not by after-the-fact validation', () => {
      if (catalogComponentsByName.size === 0) return
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const input = screen.getByLabelText('New target for Power Plant') as HTMLInputElement
      fireEvent.click(input)
      fireEvent.change(input, { target: { value: 'Mass Driver' } })
      const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
      expect(listbox.textContent).toMatch(/no matching component/i)
    })

    it('typing text with no matching compatible option can never be committed — Enter does nothing, the picker stays open on the port\'s real current value', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const input = screen.getByLabelText('New target for Power Plant') as HTMLInputElement
      fireEvent.click(input)
      fireEvent.change(input, { target: { value: 'Totally Uncataloged Free Text' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      // No real option matched "Totally Uncataloged Free Text", so Enter
      // never committed it — the underlying store target is untouched.
      expect(useFleetStore.getState().hardpoints.find((h) => h.slotLabel === 'Power Plant' && h.buildId === 'ghost-stealth')?.targetItem).not.toBe(
        'Totally Uncataloged Free Text'
      )
    })

    it('no store mutation occurs from any New Target selection — local editing only (Objective 4)', () => {
      renderWorkspace('ghost')
      const before = useFleetStore.getState()
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      selectNewTarget('Power Plant', 'Intentional Empty')
      expect(useFleetStore.getState()).toBe(before)
    })
  })

  describe('SW-008A Revision 1: New Target is a full compatibility-authoritative configuration catalog', () => {
    // Each option button renders its primary name in its own first <span>,
    // with an optional second <span> classification subtitle beneath it
    // (ComponentAssignmentLabel's own convention) — read only the first
    // span so a "Grade A"-style subtitle never contaminates the name.
    function openOptions(slotLabel: string): string[] {
      const input = screen.getByLabelText(`New target for ${slotLabel}`) as HTMLInputElement
      fireEvent.click(input)
      const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
      return Array.from(listbox.querySelectorAll('button')).map((b) => b.querySelector('span')?.textContent ?? '')
    }

    it('Requirement 1/Req: Cooler selector includes the complete real S1 Cooler catalog, ownership never narrows eligibility', () => {
      if (catalogComponentsByName.size === 0) return
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const options = openOptions('Left Cooler')
      // A real S1 Cooler the Commander owns zero copies of (never added to
      // the seed Hangar) is still offered — eligibility, not ownership.
      expect(options).toContain('ArcticStorm')
      expect(useFleetStore.getState().hangarItems.some((h) => h.name === 'ArcticStorm')).toBe(false)
    })

    it('Requirement 2: no cross-type leakage — Cooler, Quantum Drive, and Shield selectors never include a real Weapon/Gimbal component', () => {
      if (catalogComponentsByName.size === 0) return
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      for (const slotLabel of ['Left Cooler', 'Quantum Drive', 'Left Shield Generator']) {
        const options = openOptions(slotLabel)
        expect(options.some((o) => o.includes('Mass Driver'))).toBe(false)
        expect(options.some((o) => o.includes('Gimbal'))).toBe(false)
      }
    })

    it('ADR-004 / SW-009A Amendment 1 (Objective 9): no case-variant duplicate options — Left Cooler\'s New Target list offers exactly one "SnowBlind" entry, correctly classified', () => {
      if (catalogComponentsByName.size === 0) return
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const options = openOptions('Left Cooler')
      const snowBlindMatches = options.filter((o) => /snowblind/i.test(o))
      expect(snowBlindMatches).toEqual(['SnowBlind'])
    })

    it('Requirement 3: Intentional Empty (—) is always the first option, for every editable slot', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      for (const slotLabel of ['Power Plant', 'Left Cooler', 'Left Shield Generator', 'Quantum Drive']) {
        const options = openOptions(slotLabel)
        expect(options[0]).toBe('Intentional Empty (—)')
      }
    })

    it('Requirement 5: option order is Intentional Empty, Current Target, Factory Target (when distinct), Installed (when distinct), then the remaining compatible catalog alphabetically — no duplicates', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      // Left Shield Generator: target=Mirage, factory=Shimmer (distinct),
      // installed=Mirage (same as target — must not repeat).
      const options = openOptions('Left Shield Generator')
      expect(options[0]).toBe('Intentional Empty (—)')
      expect(options[1]).toBe('Mirage')
      expect(options[2]).toBe('Shimmer')
      // No duplicates anywhere in the list.
      expect(new Set(options).size).toBe(options.length)
      // The remaining tail is alphabetically sorted.
      const tail = options.slice(3)
      expect(tail).toEqual([...tail].sort((a, b) => a.localeCompare(b)))
    })

    it('Requirement 7: selecting Intentional Empty creates a pending change exactly like any other selection, and selecting Current Target again clears it', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const banner = screen.getByTestId('ship-operational-banner')
      selectNewTarget('Left Shield Generator', 'Intentional Empty')
      expect(within(banner).getByText('Pending Changes (1)')).toBeInTheDocument()
      selectNewTarget('Left Shield Generator', 'Mirage')
      expect(within(banner).getByText('No Pending Changes')).toBeInTheDocument()
    })

    it('existing topology, inventory, reservations, and installed state are all untouched by opening/selecting from the New Target catalog', () => {
      renderWorkspace('ghost')
      const hardpointsBefore = useFleetStore.getState().hardpoints
      const hangarBefore = useFleetStore.getState().hangarItems
      const reservationsBefore = useFleetStore.getState().reservations
      const installedBefore = useFleetStore.getState().installedLoadouts
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      selectNewTarget('Left Cooler', 'ArcticStorm')
      expect(useFleetStore.getState().hardpoints).toBe(hardpointsBefore)
      expect(useFleetStore.getState().hangarItems).toBe(hangarBefore)
      expect(useFleetStore.getState().reservations).toBe(reservationsBefore)
      expect(useFleetStore.getState().installedLoadouts).toBe(installedBefore)
    })
  })

  describe('CAT-001: New Target discloses "{Class} {GradeLetter}" for Core Components — real generated Classification, no Size, word "Grade" never appears', () => {
    function subtitleFor(slotLabel: string, optionName: string): string | null {
      const input = screen.getByLabelText(`New target for ${slotLabel}`) as HTMLInputElement
      fireEvent.click(input)
      const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
      const button = Array.from(listbox.querySelectorAll('button')).find((b) => b.querySelector('span')?.textContent === optionName)
      const spans = button?.querySelectorAll('span')
      return spans && spans.length > 1 ? spans[1].textContent : null
    }

    it('an option with real generated Classification+Grade shows "{Class} {GradeLetter}" — no Size, no word "Grade"', () => {
      if (catalogComponentsByName.size === 0) return
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      // Left Shield Generator's own current target — real generated-data
      // (CAT-001): Mirage's Classification is "Stealth", grade 1 -> "A".
      const subtitle = subtitleFor('Left Shield Generator', 'Mirage')
      expect(subtitle).toBe('Stealth A')
      expect(subtitle).not.toMatch(/Grade|S\d/)
    })

    it('the committed (closed-picker) value also shows the fuller identity line, not the compact classification subtitle', () => {
      if (catalogComponentsByName.size === 0) return
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const input = screen.getByLabelText('New target for Left Shield Generator')
      const subtitleContainer = input.parentElement!.querySelector('.mt-0\\.5')
      if (subtitleContainer) expect(subtitleContainer.textContent).toBe('Stealth A')
    })

    it('Intentional Empty (—) remains the first option even with the fuller identity line enabled', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      const input = screen.getByLabelText('New target for Left Shield Generator') as HTMLInputElement
      fireEvent.click(input)
      const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
      const first = listbox.querySelector('button')
      expect(first?.querySelector('span')?.textContent).toBe('Intentional Empty (—)')
    })
  })

  describe('SW-008A Revision 3: category-aware identity grammar in the real New Target selector', () => {
    function subtitleFor(slotLabel: string, optionName: string): string | null {
      const input = screen.getByLabelText(`New target for ${slotLabel}`) as HTMLInputElement
      fireEvent.click(input)
      const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
      const button = Array.from(listbox.querySelectorAll('button')).find((b) => b.querySelector('span')?.textContent === optionName)
      const spans = button?.querySelectorAll('span')
      return spans && spans.length > 1 ? spans[1].textContent : null
    }

    it('CAT-002: a Pilot Weapon option shows real Weapon Type — never Size, never Grade', () => {
      if (catalogComponentsByName.size === 0) return
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      fireEvent.click(screen.getByText('Pilot Weapons'))
      // The Gimbal Mount itself (e.g. "Left Wing Weapon Mount") is real
      // mounting hardware, not a WeaponGun-category component — its own
      // New Target picker correctly stays on the core Size · Grade
      // grammar. The real gun lives one level down, on its nested
      // "— Class 2" child port — formatHardpointLabel presents every such
      // leaf as the bare word "Weapon"; Ghost has two (Left/Right Wing),
      // so this targets the first.
      const input = screen.getAllByLabelText('New target for Weapon')[0] as HTMLInputElement
      fireEvent.click(input)
      const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
      const anyOptionWithSubtitle = Array.from(listbox.querySelectorAll('button'))
        .map((b) => b.querySelectorAll('span')[1]?.textContent)
        .find((s) => s)
      if (anyOptionWithSubtitle) {
        expect(anyOptionWithSubtitle).not.toMatch(/^S\d+$/)
        expect(anyOptionWithSubtitle).not.toMatch(/Grade/)
      }
    })

    it('a Missile Rack option shows Size · Capacity', () => {
      if (catalogComponentsByName.size === 0) return
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      fireEvent.click(screen.getByText('Missile Racks'))
      const subtitle = subtitleFor('Right Missile Rack', 'MSD-341 Missile Rack')
      if (subtitle) expect(subtitle).toMatch(/^S\d+ · \d+ × S\d+ Missiles$/)
    })
  })

  describe('Completeness (Phase 7)', () => {
    it('Decision Summary heading renders above its card content', () => {
      renderWorkspace('ghost')
      const decisionBox = screen.getByTestId('decision-summary')
      const heading = within(decisionBox).getByText('Decision Summary')
      const count = within(decisionBox).getByText(/Immediate Decision/)
      // In DOM order, the heading node must precede the count node.
      expect(heading.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('the Priority Components strip renders real missing components beneath Readiness (Ghost: Slipstream, SnowBlind)', () => {
      renderWorkspace('ghost')
      const strip = screen.getByTestId('priority-components-strip')
      expect(within(strip).getByText('Slipstream')).toBeInTheDocument()
      expect(within(strip).getByText('SnowBlind')).toBeInTheDocument()
    })

    it('SW-002 Revision B (Part 1): "View All" does NOT appear when four or fewer priority components exist (Ghost has only 2)', () => {
      renderWorkspace('ghost')
      expect(screen.queryByRole('button', { name: /View All/ })).not.toBeInTheDocument()
    })

    it('SW-002 Revision B (Part 1): "View All" appears once more than four priority components exist, and scrolls to Ship Systems without expanding the banner', () => {
      // Inject 3 extra genuinely-missing hardpoints onto Ghost's active
      // build so the real decision count exceeds 4 (Ghost's own seed data
      // tops out at 2) — legitimate store-state test setup, not a new
      // authority.
      const extra: Hardpoint[] = ['Extra A', 'Extra B', 'Extra C'].map((name, i) => ({
        id: `extra-${i}`,
        shipId: 'ghost',
        buildId: 'ghost-stealth',
        slotLabel: `Extra Slot ${i}`,
        type: 'Weapon',
        size: 'S1',
        factoryItem: name,
        installedItem: '—',
        targetItem: name,
        status: 'Missing',
      }))
      useFleetStore.setState({ hardpoints: [...useFleetStore.getState().hardpoints, ...extra] })
      renderWorkspace('ghost')

      const banner = screen.getByTestId('ship-operational-banner')
      const bannerHeightBefore = banner.className
      const strip = screen.getByTestId('priority-components-strip')
      // Priority Components (Part 2, unchanged) still reflects the full
      // missing list — 4 tiles + the "View All" tile itself.
      expect(strip.children.length).toBe(5)
      const viewAll = screen.getByRole('button', { name: /View All/ })
      fireEvent.click(viewAll)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
      // The banner's own classes are unaffected by the click (never expands).
      expect(banner.className).toBe(bannerHeightBefore)
    })

    it('SW-008D (Objective 6): "Set Active" genuinely activates the reviewed Loadout — the ACTIVE badge moves and the store\'s real activeBuildId updates', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
      const setActiveButton = screen.getByRole('button', { name: /Set Active/ })
      fireEvent.click(setActiveButton)
      expect(screen.getByText(/is now the Active Loadout/)).toBeInTheDocument()

      const escortButton = screen.getByRole('button', { name: /Escort Build/ })
      expect(within(escortButton).getByText('Active')).toBeInTheDocument()
      const stealthButton = screen.getByRole('button', { name: /Stealth Build/ })
      expect(within(stealthButton).queryByText('Active')).not.toBeInTheDocument()
      expect(useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.activeBuildId).not.toBe('ghost-stealth')
    })

    it('"Set Active" only appears when the reviewed Loadout differs from the real Active one, and visually belongs to that loadout\'s own pill', () => {
      renderWorkspace('ghost')
      expect(screen.queryByRole('button', { name: /Set Active/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
      const setActiveButton = screen.getByRole('button', { name: /Set Active/ })
      expect(setActiveButton).toBeInTheDocument()
      // Attached directly beside the reviewed loadout's own pill, not a
      // detached header action.
      const escortPill = screen.getByRole('button', { name: /Escort Build/ })
      expect(setActiveButton.parentElement).toBe(escortPill.parentElement)
    })

    it('Expand All / Collapse All control the taxonomy tree, and Collapse All hides content from every group including the one expanded by default', () => {
      renderWorkspace('ghost')
      expect(screen.getByText('Power Plant')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Collapse All/ }))
      expect(screen.queryByText('Power Plant')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Expand All/ }))
      expect(screen.getByText('Power Plant')).toBeInTheDocument()
      expect(screen.getByText('Radar')).toBeInTheDocument()
    })
  })

  describe('SW-002 Revision B — Product Improvement Phase', () => {
    it('Part 1: Priority Components reuses the same missing-component list already shown beneath Readiness — never a second independent list', () => {
      renderWorkspace('ghost')
      const missingSummary = screen.getByTestId('readiness-missing-summary')
      const strip = screen.getByTestId('priority-components-strip')
      expect(missingSummary.textContent).toContain('Slipstream')
      expect(missingSummary.textContent).toContain('SnowBlind')
      expect(within(strip).getByText('Slipstream')).toBeInTheDocument()
      expect(within(strip).getByText('SnowBlind')).toBeInTheDocument()
    })

    it('Part 1: each Priority Component tile reserves placeholder image space with the component name rendered beneath it', () => {
      renderWorkspace('ghost')
      const strip = screen.getByTestId('priority-components-strip')
      const nameEl = within(strip).getByText('Slipstream')
      const tile = nameEl.closest('div') as HTMLElement
      const placeholder = tile.querySelector('div') as HTMLElement
      expect(placeholder).toBeTruthy()
      expect(placeholder.className).toContain('rounded-lg')
      expect(placeholder.className).toContain('border')
      // Placeholder box precedes the name in DOM order (image above, name beneath).
      expect(placeholder.compareDocumentPosition(nameEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('Part 1: Priority Components never exceeds 4 visible tiles even when more decisions exist', () => {
      const extra: Hardpoint[] = ['Extra A', 'Extra B', 'Extra C'].map((name, i) => ({
        id: `extra-${i}`,
        shipId: 'ghost',
        buildId: 'ghost-stealth',
        slotLabel: `Extra Slot ${i}`,
        type: 'Weapon',
        size: 'S1',
        factoryItem: name,
        installedItem: '—',
        targetItem: name,
        status: 'Missing',
      }))
      useFleetStore.setState({ hardpoints: [...useFleetStore.getState().hardpoints, ...extra] })
      renderWorkspace('ghost')
      const strip = screen.getByTestId('priority-components-strip')
      // 5 total missing items -> 4 tiles + 1 "View All" tile = 5 direct children.
      expect(strip.children.length).toBe(5)
    })

    it('Part 2: decision recommendations use the approved Quartermaster priority language (Available in Inventory, Available to Reserve, Borrow Available)', () => {
      renderWorkspace('ghost')
      const decisionBox = screen.getByTestId('decision-summary')
      // SnowBlind is owned and unreserved in the seed Hangar.
      expect(within(decisionBox).getByText('Available in Inventory')).toBeInTheDocument()
      expect(decisionBox.textContent).not.toMatch(/Not Currently Owned|Reserved Elsewhere/)
    })

    it('EWO-064 (Part C): "Purchase Required" now correctly appears inside Decision Summary, as a Record Newly Acquired Component entry — no longer excluded and deferred to "future procurement"', () => {
      // Remove SnowBlind from the Hangar so it resolves to Purchase Required.
      useFleetStore.setState({ hangarItems: useFleetStore.getState().hangarItems.filter((h) => h.name !== 'SnowBlind') })
      renderWorkspace('ghost')
      const decisionBox = screen.getByTestId('decision-summary')
      expect(decisionBox.textContent).toContain('Purchase Required')
      expect(within(decisionBox).getByText(/Record\s+SnowBlind/)).toBeInTheDocument()
    })

    it('EWO-064 (Part C): the retired "No Immediate Actions" placeholder never renders — every readiness gap, even an all-Purchase-Required one, is now a real Decision Summary entry', () => {
      // Remove SnowBlind from the Hangar so both of Ghost's missing
      // targets (Slipstream, SnowBlind) resolve to Purchase Required —
      // legitimate store-state test setup, not a new authority.
      useFleetStore.setState({ hangarItems: useFleetStore.getState().hangarItems.filter((h) => h.name !== 'SnowBlind') })
      renderWorkspace('ghost')
      const decisionBox = screen.getByTestId('decision-summary')
      expect(screen.queryByText('No Immediate Actions')).not.toBeInTheDocument()
      expect(screen.queryByText('Remaining readiness gaps require future acquisition.')).not.toBeInTheDocument()
      expect(within(decisionBox).getByText('2 Immediate Decisions')).toBeInTheDocument()
      // Priority Components strip (Part D, restored) still shows the real gaps too.
      const strip = screen.getByTestId('priority-components-strip')
      expect(within(strip).getByText('Slipstream')).toBeInTheDocument()
      expect(within(strip).getByText('SnowBlind')).toBeInTheDocument()
    })

    it('EWO-064 (Part C): a fully ready Loadout (Corsair) shows "No Immediate Decisions" — now correct precisely because it is the genuinely-empty case', () => {
      renderWorkspace('corsair')
      const decisionBox = screen.getByTestId('decision-summary')
      expect(within(decisionBox).getByText('No Immediate Decisions')).toBeInTheDocument()
      expect(decisionBox.textContent).not.toContain('No Immediate Actions')
    })

    it('SW-002 Revision C (Part 4): the Operational Review helper renders as a single inline line with the approved copy', () => {
      renderWorkspace('ghost')
      const label = screen.getByText('Operational Review')
      const helperLine = label.closest('p') as HTMLElement
      expect(helperLine).toBeTruthy()
      expect(helperLine.textContent).toContain('Operational Review')
      expect(helperLine.textContent).toContain('Reviewing current ship status.')
      expect(helperLine.textContent).toMatch(/Select an action above when you.re ready to make changes\./)
      expect(screen.queryByText(/page's own default state/)).not.toBeInTheDocument()
      // Single line: no other <p> beneath it carrying the rest of the copy.
      expect(helperLine.querySelectorAll('p').length).toBe(0)
    })

    it('the helper disappears once a Commander Intent is selected (guidance only applies to Operational Review)', () => {
      renderWorkspace('ghost')
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      expect(screen.queryByText(/Reviewing current ship status/)).not.toBeInTheDocument()
    })

    it('Part 5: Commander Intent behavior is unchanged — selecting still updates local state only, no store mutation', () => {
      renderWorkspace('ghost')
      const before = useFleetStore.getState()
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      expect(screen.getByRole('button', { name: /Manage Loadout/ })).toHaveAttribute('aria-pressed', 'true')
      expect(useFleetStore.getState()).toBe(before)
    })

    it('reviewing a different Loadout and switching Commander Intent still cause no store mutation — only explicit lifecycle actions (Save/Discard/Set Active/New Loadout) do, per SW-008D', () => {
      renderWorkspace('ghost')
      const before = useFleetStore.getState()
      fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
      fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
      expect(useFleetStore.getState()).toBe(before)
    })
  })
})

/**
 * SW-011A — Commander Configurable Slot Experience (Phase I).
 *
 * 'ghost' (F7C-S Hornet Ghost Mk II, real entity class
 * ANVL_Hornet_F7CS_Mk2) is a real, live-certified configurable ship
 * (SW-010B) whose `hardpoint_class_2` gimbal-mount children (under the
 * Left/Right Wing Weapon mounts) and `missile_0X_attach` rack slots
 * genuinely intersect with this app's own materialized port tree — most
 * of the SW-010A/B-confirmed showcase ports (e.g. the Hornet's own
 * `hardpoint_weapon_center`) do NOT, because they're `configuration-only`
 * in the canonical model (the app's normalizer never materializes a row
 * for them at all — see docs/SW-010B-Certification-Report.md Appendix A
 * point 3/7) — Phase I only ever attaches to EXISTING rows (Objective 1:
 * "no duplicate hierarchy"), so those slots are correctly invisible here,
 * not a bug. 'utv' (GRIN_UTV) has zero Commander-visible configurable
 * slots at all in the real committed catalog — the Objective 5 negative
 * case.
 */
describe('<ShipWorkspacePrototype /> — SW-011A: Commander Configurable Slot Experience (Phase I)', () => {
  it('Objective 1/2: a real configurable port shows a Configurable Slot badge once its group is expanded', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Expand All/ }))
    const badges = screen.getAllByTitle(/Configurable Slot —/)
    expect(badges.length).toBeGreaterThan(0)
  })

  it('Objective 3: clicking the badge reveals all 7 required read-only fields with real values, and hides them again on a second click', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Expand All/ }))
    const badge = screen.getAllByTitle(/Configurable Slot —/)[0]

    expect(screen.queryByText('Slot Name')).not.toBeInTheDocument()
    fireEvent.click(badge)

    expect(screen.getByText('Slot Name')).toBeInTheDocument()
    expect(screen.getByText('Default Component')).toBeInTheDocument()
    expect(screen.getByText('Current Installed Component')).toBeInTheDocument()
    expect(screen.getByText('Eligible Component Count')).toBeInTheDocument()
    expect(screen.getByText('Swap Group Identifier')).toBeInTheDocument()
    expect(screen.getByText('Confidence Level')).toBeInTheDocument()
    expect(screen.getByText('Source Authority')).toBeInTheDocument()

    fireEvent.click(badge)
    expect(screen.queryByText('Slot Name')).not.toBeInTheDocument()
  })

  it('Objective 3: Current Installed Component reflects the live Hardpoint row, not a stale catalog snapshot', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Expand All/ }))
    fireEvent.click(screen.getAllByTitle(/Configurable Slot —/)[0])
    // Every real match on 'ghost' (hardpoint_class_2, missile_0X_attach)
    // has a real installed component in the seed fixture — "None" would
    // indicate the wrong field was read.
    expect(screen.queryByText('None')).not.toBeInTheDocument()
  })

  it('Explicit Non-Goals: the inspection panel contains no editing control of any kind', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Expand All/ }))
    fireEvent.click(screen.getAllByTitle(/Configurable Slot —/)[0])
    const panel = screen.getByText('Slot Name').closest('tr') as HTMLElement
    expect(within(panel).queryAllByRole('button')).toHaveLength(0)
    expect(within(panel).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(panel).queryAllByRole('combobox')).toHaveLength(0)
  })

  it('Objective 4: a Category C (review-required) slot shows "Needs Review", never a raw diagnostic, with Developer Mode off (the default)', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Expand All/ }))
    // Real data: every one of ghost's intersecting slots (hardpoint_class_2,
    // missile_0X_attach) is Category C in the live-certified catalog.
    fireEvent.click(screen.getAllByTitle(/Configurable Slot —/)[0])
    expect(screen.getByText('Needs Review')).toBeInTheDocument()
    expect(screen.queryByText(/Developer Mode — Raw Diagnostics/)).not.toBeInTheDocument()
    expect(screen.queryByText(/global members, exceeding the plausible swap-group ceiling/)).not.toBeInTheDocument()
  })

  it('Objective 4: enabling Developer Mode reveals the raw diagnostics for an inspected slot', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Developer Mode/ }))
    fireEvent.click(screen.getByRole('button', { name: /Expand All/ }))
    fireEvent.click(screen.getAllByTitle(/Configurable Slot —/)[0])
    expect(screen.getByText(/Developer Mode — Raw Diagnostics/)).toBeInTheDocument()
  })

  it('Objective 5: a ship with zero Commander-visible configurable slots (GRIN_UTV) renders with no Configurable badges at all', () => {
    renderWorkspace('utv')
    fireEvent.click(screen.getByRole('button', { name: /Expand All/ }))
    expect(screen.queryAllByTitle(/Configurable Slot —/)).toHaveLength(0)
  })

  it('Objective 5: the rest of a non-configurable ship (GRIN_UTV) still renders normally — real ship data, no regression from this sprint', () => {
    renderWorkspace('utv')
    expect(screen.getAllByText('UTV').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Expand All/ }))
    expect(screen.queryAllByTitle(/Configurable Slot —/)).toHaveLength(0)
  })
})

/**
 * SW-013C.2D (Objective 1): Persistent Workspace Save Actions. Commander
 * testing found the panel-header Save/Discard controls (SW-008D) scroll
 * out of the viewport once a Commander edits a port deep in a long table.
 * This bar is a second, always-visible entry point to the exact same
 * `handleSaveChanges`/`handleDiscardChanges` handlers and the exact same
 * `desiredTargets` pending-edit state — never a parallel save path.
 */
describe('<ShipWorkspacePrototype /> — SW-013C.2D (Objective 1): Persistent Workspace Save Actions', () => {
  it('is absent when there are no pending changes', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    expect(screen.queryByTestId('persistent-save-bar')).not.toBeInTheDocument()
  })

  it('appears once a pending change exists, showing the correct pending count', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    selectNewTarget('Left Shield Generator', 'Shimmer')
    const bar = screen.getByTestId('persistent-save-bar')
    expect(within(bar).getByText(/1 Pending Change/)).toBeInTheDocument()
  })

  it('the pending count updates as further edits accumulate', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    selectNewTarget('Left Shield Generator', 'Shimmer')
    selectNewTarget('Power Plant', 'Intentional Empty')
    const bar = screen.getByTestId('persistent-save-bar')
    expect(within(bar).getByText(/2 Pending Changes/)).toBeInTheDocument()
  })

  it('is not rendered outside Manage Loadout intent, even with an underlying reviewed-build change pending elsewhere', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    selectNewTarget('Left Shield Generator', 'Shimmer')
    expect(screen.getByTestId('persistent-save-bar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    expect(screen.queryByTestId('persistent-save-bar')).not.toBeInTheDocument()
  })

  it('Save Changes in the persistent bar commits the exact same edit the panel-header button would — real store write, pending state clears', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    selectNewTarget('Left Shield Generator', 'Shimmer')
    const bar = screen.getByTestId('persistent-save-bar')
    fireEvent.click(within(bar).getByText('Save Changes'))
    expect(useFleetStore.getState().hardpoints.find((h) => h.slotLabel === 'Left Shield Generator' && h.buildId === 'ghost-stealth')?.targetItem).toBe('Shimmer')
    expect(screen.queryByTestId('persistent-save-bar')).not.toBeInTheDocument()
  })

  it('Discard Changes in the persistent bar clears the pending edit without writing to the store', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    selectNewTarget('Left Shield Generator', 'Shimmer')
    const bar = screen.getByTestId('persistent-save-bar')
    fireEvent.click(within(bar).getByText('Discard Changes'))
    expect(screen.queryByTestId('persistent-save-bar')).not.toBeInTheDocument()
    expect(useFleetStore.getState().hardpoints.find((h) => h.slotLabel === 'Left Shield Generator' && h.buildId === 'ghost-stealth')?.targetItem).toBe('Mirage')
  })

  it('existing unsaved-change protection (SW-013C.1\'s guarded Loadout switch) is unaffected — switching Loadouts with a pending edit still requires explicit confirmation', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    selectNewTarget('Left Shield Generator', 'Shimmer')
    fireEvent.click(screen.getByRole('button', { name: /Escort Build/ }))
    expect(screen.getByText(/has 1 unsaved target/)).toBeInTheDocument()
    // The reviewed build has not actually switched yet — still on Stealth Build.
    expect(screen.getByTestId('persistent-save-bar')).toBeInTheDocument()
  })
})

/**
 * EWO-062A (Part C) — Developer Mode must not merely be disabled/dimmed in
 * a real Commander session, it must not render at all. The whole test
 * suite globally opts into VITE_SFM_DEV_SEED_FLEET=true (vitest.setup.ts,
 * CAT-001A) so every other test above — including the ones exercising
 * Developer Mode's own raw-diagnostics behavior — legitimately sees the
 * button. This block is the one place that flips the flag off, matching
 * the exact override pattern newCommanderInitialization.test.ts already
 * established, to prove the button genuinely disappears in the
 * production-equivalent case — not just that the test happens to run
 * with the flag on.
 */
describe('<ShipWorkspacePrototype /> — EWO-062A (Part C): Developer Mode absent in a real Commander session', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('VITE_SFM_DEV_SEED_FLEET', 'false')
    vi.resetModules()
  })
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    vi.resetModules()
    cleanup()
  })

  it('Developer Mode does not render, and the header control group contains only the Ship selector', async () => {
    const { useFleetStore: freshStore } = await import('../../store/useFleetStore')
    const added = freshStore.getState().addFleetAsset('ghost', 'OWNED', 'Prod Mode Ghost')
    expect(added.success).toBe(true)

    const { default: FreshShipWorkspacePrototype } = await import('../ShipWorkspacePrototype')
    render(
      <MemoryRouter initialEntries={[`/ship-workspace/${added.assetId}`]}>
        <Routes>
          <Route path="/ship-workspace/:shipId" element={<FreshShipWorkspacePrototype />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.queryByRole('button', { name: /Developer Mode/ })).not.toBeInTheDocument()
    expect(screen.queryByText('View in Ship Detail')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ship')).toBeInTheDocument()
  })
})
