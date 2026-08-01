import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'
import type { InstalledLoadoutEntry } from '../../types'

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

const SLOT = 'Right Shield Generator'
const ALT_TARGET = 'FR-66'

/**
 * EWO-088 — "Borrow-Tier Retired-Ship Leakage Fix." EWO-087's audit found
 * that a component physically installed on a retired ship still surfaced
 * as a "Borrow Available" candidate (labeled "Unknown Ship"), contradicting
 * the documented SW-015C guarantee that a retired vessel is never a real
 * donor source. This suite proves the live Ship Workspace disclosure —
 * not just the underlying resolver — reflects the fix end-to-end.
 */
describe('EWO-088: Ship Workspace Borrow tier excludes retired-ship donors', () => {
  it('a donor on an ACTIVE ship still renders as Borrow Available, by real name', () => {
    if (catalogComponentsByName.size === 0) return
    useFleetStore.setState({
      installedLoadouts: [{ shipId: 'corsair', slotLabel: 'Left Shield Generator', installedItem: ALT_TARGET } as InstalledLoadoutEntry],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    fireEvent.click(disclosure.getByRole('button', { name: /BORROW/ }))
    expect(disclosure.getByText(/Installed on Corsair/)).toBeInTheDocument()
    expect(disclosure.queryByText(/Unknown Ship/)).not.toBeInTheDocument()
  })

  it('once that same donor ship is retired, the identical component no longer renders as a Borrow candidate at all', () => {
    if (catalogComponentsByName.size === 0) return
    useFleetStore.setState({
      installedLoadouts: [{ shipId: 'corsair', slotLabel: 'Left Shield Generator', installedItem: ALT_TARGET } as InstalledLoadoutEntry],
    })
    const result = useFleetStore.getState().retireFleetAsset('corsair')
    expect(result.success).toBe(true)

    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    // The whole Borrow disclosure button only renders when candidates.borrowable
    // is non-empty (ShipWorkspacePrototype.tsx) — its absence proves exclusion,
    // not just a relabeling.
    expect(disclosure.queryByRole('button', { name: /BORROW/ })).not.toBeInTheDocument()
    expect(disclosure.queryByText(/Unknown Ship/)).not.toBeInTheDocument()
    expect(disclosure.queryByText(ALT_TARGET)).not.toBeInTheDocument()
  })
})
