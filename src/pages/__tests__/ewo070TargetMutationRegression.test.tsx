import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'
import type { HangarItem } from '../../types'

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

// "Right Shield Generator" (Ghost) ships Factory/Installed with "Shimmer".
// FR-66 (a real, catalog-listed S1 Shield — also genuinely used elsewhere
// in this repo's own seed data, ghost-escort's Left Shield Generator
// target) and Mirage (a real, catalog-listed, compatible, currently
// UNINSTALLED S1 Shield — the same candidate SW-014A's own suite already
// certifies for this exact port) are three DISTINCT real components,
// deliberately chosen so Factory/Installed/New-Target/Installed-Candidate
// never collide — the same three-way distinction the Chief Architect's own
// EWO-070 reproduction (Corsair Gunship / Quantum Drive / Hemera /
// Crossfield) describes, using real substitute names since "Hemera" and
// "Crossfield" do not exist in this repo's catalog (confirmed by search).
const SLOT = 'Right Shield Generator'
const FACTORY_INSTALLED = 'Shimmer'
const NEW_TARGET = 'FR-66'
const CANDIDATE = 'Mirage'

/**
 * EWO-070 (Parts A, C, G, H, I) — end-to-end regression for the critical
 * release-blocking target-mutation defect. Reproduces the work order's own
 * Corsair Gunship / Quantum Drive scenario against real fixture data:
 * Manage Loadout sets and SAVES a new Target, then Change Installed
 * Components installs a genuinely DIFFERENT component — the reviewed
 * Loadout's Target must never be silently rewritten by what got
 * physically installed. "Manage Loadout owns desired configuration.
 * Change Installed Components owns physical ship state."
 */
describe('EWO-070: Manage Loadout Target survives a Change Installed Components install', () => {
  it('installing a different component never rewrites a Target just saved in Manage Loadout', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(CANDIDATE)!
    useFleetStore.setState({
      hangarItems: [
        { id: 'ewo070-hangar-1', name: CANDIDATE, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem,
      ],
    })
    renderWorkspace('ghost')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!

    // Baseline: Factory/Installed is Shimmer, Target is whatever the seed
    // Loadout already carries for this port (not yet FR-66).
    let hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(FACTORY_INSTALLED)
    expect(hp.targetItem).not.toBe(NEW_TARGET)

    // Manage Loadout — set and SAVE a real new Target (Commander's own
    // reviewed plan), exactly like the work order's "set Quantum Drive
    // Target to Hemera... Save" step.
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    const chosen = selectNewTarget(SLOT, NEW_TARGET)
    expect(chosen).toContain(NEW_TARGET)
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])

    hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.targetItem).toBe(NEW_TARGET)
    expect(hp.installedItem).toBe(FACTORY_INSTALLED) // Manage Loadout never touches physical state.

    // Change Installed Components — install a DIFFERENT real component.
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    let row = getPortRow(SLOT)
    expect(within(row).getByText(FACTORY_INSTALLED)).toBeInTheDocument()
    expect(within(row).getByText(NEW_TARGET)).toBeInTheDocument()
    // EWO-070 (Part C) — the mismatch (Installed Shimmer, Target FR-66) is
    // real operational intelligence; the Status pill must never read as
    // fully satisfied ("OK") while that gap is real.
    expect(within(row).queryByText('OK')).not.toBeInTheDocument()
    // Captured here — after the real Target change is saved, immediately
    // before the install — so the only variable the post-install
    // assertion below isolates is the install itself, not the earlier
    // Target edit (which legitimately does change readiness on its own).
    const readinessBefore = screen.getByText(/^\d+%$/).textContent

    const installButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Install / Change'))!
    fireEvent.click(installButton)
    const disclosure = within(row.nextElementSibling as HTMLElement)
    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))

    // EWO-070 (Part G) — the success message states only what physically
    // happened, no target-implying language.
    const notice = disclosure.getByText(new RegExp(`Installed ${CANDIDATE} on`))
    expect(notice.textContent).not.toMatch(/target/i)

    // EWO-070 (Part A) — CRITICAL: Installed updates, Target is untouched.
    hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(CANDIDATE)
    expect(hp.targetItem).toBe(NEW_TARGET)

    // EWO-070 (Part H) — reactive, immediate, no refresh: the row itself
    // reflects the new Installed value without a second action, and the
    // mismatch (Mirage installed, FR-66 still the real Target) is still
    // never miscounted as OK just because *something* got installed.
    row = getPortRow(SLOT)
    expect(within(row).getByText(CANDIDATE)).toBeInTheDocument()
    expect(within(row).getByText(NEW_TARGET)).toBeInTheDocument()
    expect(within(row).queryByText('OK')).not.toBeInTheDocument()
    // Readiness must not silently jump just because an install happened —
    // the real Target (FR-66) is still unmet, exactly as before the
    // install. (The old bug would have retargeted to Mirage, satisfying
    // it and inflating this number.)
    expect(screen.getByText(/^\d+%$/).textContent).toBe(readinessBefore)

    // EWO-070 (Part H/I) — switching lenses away and back preserves the
    // distinction with no refresh required.
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    row = getPortRow(SLOT)
    expect(within(row).getByText(CANDIDATE)).toBeInTheDocument()
    expect(within(row).getByText(NEW_TARGET)).toBeInTheDocument()
  })

  it('the Installed/Target distinction survives a genuine reload (Part I)', async () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(CANDIDATE)!
    useFleetStore.setState({
      hangarItems: [
        { id: 'ewo070-hangar-2', name: CANDIDATE, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem,
      ],
    })
    renderWorkspace('ghost')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!

    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    selectNewTarget(SLOT, NEW_TARGET)
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])

    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const row = getPortRow(SLOT)
    const installButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Install / Change'))!
    fireEvent.click(installButton)
    const disclosure = within(row.nextElementSibling as HTMLElement)
    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../../store/useFleetStore')
    const hp = reloaded.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(CANDIDATE)
    expect(hp.targetItem).toBe(NEW_TARGET)
  })
})
