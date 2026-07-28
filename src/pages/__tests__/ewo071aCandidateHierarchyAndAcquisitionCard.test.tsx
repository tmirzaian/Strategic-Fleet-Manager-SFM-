import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'
import type { Hardpoint, HangarItem, MissionReservation } from '../../types'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
  // @ts-expect-error — test-only global stub, not a real IntersectionObserver
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => cleanup())

function renderWorkspace(shipId: string) {
  return render(
    <MemoryRouter initialEntries={[`/ship-workspace/${shipId}`]}>
      <Routes>
        <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
      </Routes>
    </MemoryRouter>
  )
}

function getPortRow(slotLabel: string): HTMLElement {
  const matches = screen.getAllByText(slotLabel)
  const rowLabel = matches.find((el) => el.closest('tr') !== null)
  if (!rowLabel) throw new Error(`No port row found for "${slotLabel}"`)
  return rowLabel.closest('tr') as HTMLElement
}

function expandInstall(slotLabel: string): HTMLElement {
  const row = getPortRow(slotLabel)
  const installButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Install / Change'))!
  fireEvent.click(installButton)
  return row.nextElementSibling as HTMLElement
}

function patchHardpoint(buildId: string, slotLabel: string, patch: Partial<Hardpoint>) {
  useFleetStore.setState((s) => ({
    hardpoints: s.hardpoints.map((h) => (h.buildId === buildId && h.slotLabel === slotLabel ? { ...h, ...patch } : h)),
  }))
}

const SLOT = 'Right Shield Generator'
const ALT_TARGET = 'FR-66'

/**
 * EWO-071A — "Install Candidate Hierarchy & Acquisition Card Refinement."
 * Refines EWO-071's own Reserved/Available relationship (Reserved now
 * always wins outright for the same physical Target rather than
 * rendering a second competing group) and gives Record Newly Acquired
 * Component a first-class card treatment matching the candidate-row
 * stack. See installCandidates.ts and ShipWorkspacePrototype.tsx's own
 * EWO-071A comments for the full reasoning.
 */
describe('EWO-071A (Part A): Reserved always wins over Available for the same Target', () => {
  it('Reserved always renders before Available, and the two never render together for the same physical Target', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass })
    useFleetStore.setState({
      hangarItems: [{ id: 'h1', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 3, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
      reservations: [
        {
          id: 'res-1',
          missionConfigurationId: ship.activeBuildId,
          fleetAssetId: 'ghost',
          targetSlotLabel: SLOT,
          componentName: ALT_TARGET,
          componentEntityClass: entry.entityClass,
          quantity: 1,
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as MissionReservation,
      ],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.getByText('RESERVED')).toBeInTheDocument()
    expect(disclosure.queryByText('AVAILABLE')).not.toBeInTheDocument()
    // 3 owned, 1 reserved -> 2 genuinely free, surfaced as a secondary
    // indicator on the Reserved row itself, never a duplicate row/group.
    expect(disclosure.getByText('+2 additional available')).toBeInTheDocument()
    expect(disclosure.getAllByText(ALT_TARGET)).toHaveLength(1)
  })

  it('with no additional free stock, the Reserved row shows no secondary indicator at all', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass })
    useFleetStore.setState({
      hangarItems: [{ id: 'h2', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
      reservations: [
        {
          id: 'res-2',
          missionConfigurationId: ship.activeBuildId,
          fleetAssetId: 'ghost',
          targetSlotLabel: SLOT,
          componentName: ALT_TARGET,
          componentEntityClass: entry.entityClass,
          quantity: 1,
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as MissionReservation,
      ],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.getByText('RESERVED')).toBeInTheDocument()
    expect(disclosure.queryByText(/additional available/)).not.toBeInTheDocument()
  })
})

describe('EWO-071A/EWO-071B (Part B/D, Part C/D): Install New Component acquisition card', () => {
  it('renders as a full card under its own NEW header, matching candidate-row spacing/alignment/hover, not a floating link', () => {
    if (catalogComponentsByName.size === 0) return
    // Cleared — the seed fleet already owns a real Mirage unit that would
    // otherwise qualify as a genuine UPGRADE over Shimmer, masking the
    // "no owned upgrade exists" case this test exists to prove.
    useFleetStore.setState({ hangarItems: [] })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    // EWO-071B (Part C/D) — its own first-class cyan NEW header, not
    // subordinate to Upgrade.
    expect(disclosure.getByText('NEW').className).toContain('text-cyan')

    const card = disclosure.getByRole('button', { name: /Install New Component/ })
    // Same container language as an ordinary candidate row: dark
    // workstation background, rounded corners, matching padding, subtle
    // blue/cyan border, hover elevation.
    expect(card.className).toContain('bg-black/20')
    expect(card.className).toContain('border-cyan/20')
    expect(card.className).toContain('rounded-md')
    expect(card.className).toContain('px-2.5')
    expect(card.className).toContain('py-1.5')
    expect(card.className).toContain('hover:bg-white/5')
    expect(card.className).toContain('transition-colors')

    expect(disclosure.getByText('Looted, purchased, or crafted.')).toBeInTheDocument()
    expect(disclosure.getByText('Install →')).toBeInTheDocument()
    // Never presented under the UPGRADE pill (would imply a standing
    // recommendation) — no UPGRADE badge renders when no owned upgrade exists.
    expect(disclosure.queryByText('UPGRADE')).not.toBeInTheDocument()
  })

  it('the card uses the exact same container classes an ordinary candidate row uses (Part D — shared styling)', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass })
    useFleetStore.setState({
      hangarItems: [{ id: 'h3', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    const availableRow = disclosure.getByText(ALT_TARGET).closest('div.flex') as HTMLElement
    const card = disclosure.getByRole('button', { name: /Install New Component/ })
    for (const cls of ['rounded-md', 'px-2.5', 'py-1.5', 'hover:bg-white/5', 'transition-colors']) {
      expect(availableRow.className).toContain(cls)
      expect(card.className).toContain(cls)
    }
  })
})
