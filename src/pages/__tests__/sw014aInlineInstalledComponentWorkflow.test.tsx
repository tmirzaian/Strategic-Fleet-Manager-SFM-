import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'
import type { HangarItem, MissionReservation, InstalledLoadoutEntry } from '../../types'

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
  // EWO-068 (Part D) — the port label now lives inside a wrapping
  // <span className="break-words">, not directly inside the row's outer
  // div; match any element genuinely inside a table row instead of
  // asserting a specific tag name.
  const rowLabel = matches.find((el) => el.closest('tr') !== null)
  if (!rowLabel) throw new Error(`No port row found for "${slotLabel}"`)
  return rowLabel.closest('tr') as HTMLElement
}

/** Expands the "Install / Change" disclosure for a specific port row and
 * returns that disclosure's own <tr> (the port row's next sibling) so
 * every subsequent query can be scoped to it — the port row itself and
 * OTHER rows (e.g. one that already has this same component installed)
 * can otherwise contain ambiguous, identically-worded text. */
function expandInstall(slotLabel: string): HTMLElement {
  const row = getPortRow(slotLabel)
  const installButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Install / Change'))!
  fireEvent.click(installButton)
  return row.nextElementSibling as HTMLElement
}

// "Right Shield Generator" ships factory/installed with "Shimmer" — Mirage
// (a real, compatible S1 Shield) is genuinely NOT already installed there,
// unlike "Left Shield Generator" where the Ghost's own seed data already
// has Mirage installed (confirmed via direct inspection) — using that port
// instead would make Mirage invisible in every tier by this mission's own
// design (the currently-installed item is never re-offered as a candidate).
const SLOT = 'Right Shield Generator'
const CANDIDATE = 'Mirage'

/**
 * SW-014A — Inline Installed Component Workflow. Every scenario here
 * exercises the SAME store actions (`installComponent`/`removeComponent`/
 * `addHangarItem`/`releaseReservation`/`saveMissionConfiguration`) Quick
 * Update, Hangar Inventory, and Manage Loadout already use — this suite
 * verifies Ship Workspace's own inline UI wiring onto them, never a
 * second transaction implementation.
 *
 * Root constraint: the installation engine's own `resolveDestinationHardpoint`
 * (unmodified — see `installationEngine.ts`) refuses to target a port
 * whose status is already 'OK'. "Right Shield Generator" starts 'OK'
 * (Shimmer fully satisfied). EWO-070 (Part A/B) — CRITICAL FIX: every
 * Install action below used to clear that gate by silently RETARGETING
 * the port to the chosen candidate first (via `saveMissionConfiguration`),
 * destroying the Commander's own saved Target in the process. That
 * retarget is now deleted outright — `performInstall` clears the gate by
 * REMOVING the port's current occupant instead (an ordinary REMOVE,
 * returned to Hangar), which changes `installedItem` without ever
 * touching `targetItem`. Every test below now explicitly asserts
 * `targetItem` stays exactly 'Shimmer' — the Commander's real saved
 * plan, never silently overwritten by what got physically installed.
 */
describe('SW-014A: Tier 1 — Available Inventory', () => {
  it('a compatible, owned, free component appears under Available Inventory and Install commits it immediately (no separate Save step)', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(CANDIDATE)!
    useFleetStore.setState({
      hangarItems: [{ id: 'test-hangar-1', name: CANDIDATE, type: entry.category, size: `S${entry.size}`, qty: 2, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.getByText('Available Inventory')).toBeInTheDocument()
    const candidateRow = disclosure.getByText(CANDIDATE).closest('div')!.parentElement!
    expect(candidateRow.textContent).toContain('2 Available')

    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))

    expect(disclosure.getByText(/Installed Mirage on/)).toBeInTheDocument()
    const build = useFleetStore.getState().builds.find((b) => b.id === useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.activeBuildId)!
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === build.id && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(CANDIDATE)
    // EWO-070 (Part A) — CRITICAL: the port's own real saved Target
    // (Shimmer) must never be silently overwritten by what just got
    // physically installed (Mirage) — Manage Loadout, not this workflow,
    // owns desired configuration.
    expect(hp.targetItem).toBe('Shimmer')
    expect(useFleetStore.getState().hangarItems.find((h) => h.id === 'test-hangar-1')?.qty).toBe(1)
  })

  it('a unit already reserved for THIS exact port installs directly with no reassignment step', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(CANDIDATE)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    useFleetStore.setState({
      hangarItems: [{ id: 'test-hangar-2', name: CANDIDATE, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
      reservations: [
        {
          id: 'test-res-own',
          missionConfigurationId: ship.activeBuildId,
          fleetAssetId: 'ghost',
          targetSlotLabel: SLOT,
          componentName: CANDIDATE,
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

    expect(disclosure.getByText('Available Inventory')).toBeInTheDocument()
    expect(disclosure.getByText('Reserved for this port')).toBeInTheDocument()
    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(CANDIDATE)
    // EWO-070 (Part A) — Target preserved.
    expect(hp.targetItem).toBe('Shimmer')
  })
})

describe('SW-014A: Tier 2 — Reserved Components', () => {
  it('a component fully committed to a different Loadout shows under Reserved Components, and Reassign releases that reservation then installs', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(CANDIDATE)!
    useFleetStore.setState({
      hangarItems: [{ id: 'test-hangar-3', name: CANDIDATE, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
      reservations: [
        {
          id: 'test-res-elsewhere',
          missionConfigurationId: 'ghost-escort',
          fleetAssetId: 'ghost',
          targetSlotLabel: SLOT,
          componentName: CANDIDATE,
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

    expect(disclosure.getByText('Reserved Components')).toBeInTheDocument()
    expect(disclosure.getByText(/Reserved for .*Escort Build/)).toBeInTheDocument()

    fireEvent.click(disclosure.getByRole('button', { name: /Reassign/ }))
    expect(disclosure.getByText(/Reassigning releases the reservation/)).toBeInTheDocument()
    fireEvent.click(disclosure.getByRole('button', { name: 'Confirm' }))

    expect(useFleetStore.getState().reservations.find((r) => r.id === 'test-res-elsewhere')?.status).toBe('RELEASED')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(CANDIDATE)
    // EWO-070 (Part A) — Target preserved even through a reassign-then-install.
    expect(hp.targetItem).toBe('Shimmer')
  })
})

describe('SW-014A: Tier 3 — Borrow From Another Ship', () => {
  it('a component installed on a different ship shows under Borrow From Another Ship with its context, and Confirm Transfer removes it there and installs it here', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(CANDIDATE)!
    const corsair = useFleetStore.getState().ships.find((s) => s.id === 'corsair')!
    const donorSlotLabel = 'A Shield Generator' // Corsair's real, existing Shield hardpoint.
    // Explicitly cleared, not just left at seed defaults — the seed fleet
    // already owns a real Mirage unit (Hangar item "item-3", qty 1), which
    // would otherwise put this candidate in Tier 1 (Available Inventory)
    // instead of Tier 3, masking the scenario this test exists to prove.
    // The donor-side Hardpoint row (not just the flat `installedLoadouts`
    // record) is also patched to match — the REMOVE half of the borrow
    // action operates on a real Hardpoint row, exactly like production
    // data (installedLoadouts entries only ever exist alongside one).
    useFleetStore.setState({
      hangarItems: [],
      reservations: [],
      installedLoadouts: [{ shipId: 'corsair', slotLabel: donorSlotLabel, installedItem: CANDIDATE, entityClass: entry.entityClass } as InstalledLoadoutEntry],
      hardpoints: useFleetStore.getState().hardpoints.map((h) =>
        h.buildId === corsair.activeBuildId && h.slotLabel === donorSlotLabel
          ? { ...h, installedItem: CANDIDATE, installedEntityClass: entry.entityClass, status: 'Upgrade Available' as const }
          : h
      ),
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    // EWO-064 (Part G) — Borrow From Another Ship is collapsed by default;
    // the toggle itself carries the count, the donor details only render once expanded.
    expect(disclosure.getByText(/Borrow From Another Ship \(\d+\)/)).toBeInTheDocument()
    fireEvent.click(disclosure.getByRole('button', { name: /Borrow From Another Ship/ }))
    expect(disclosure.getByText(new RegExp(`Installed On: Corsair — ${donorSlotLabel}`))).toBeInTheDocument()

    fireEvent.click(disclosure.getByRole('button', { name: /Transfer\?/ }))
    expect(disclosure.getByText(/this removes it there and installs it here/)).toBeInTheDocument()
    fireEvent.click(disclosure.getByRole('button', { name: /Confirm Transfer/ }))

    // An InstalledLoadoutEntry row is never deleted by a REMOVE — its own
    // `installedItem` becomes the empty sentinel "—", exactly like every
    // other cleared port (confirmed directly: the row itself persists).
    expect(useFleetStore.getState().installedLoadouts.find((e) => e.shipId === 'corsair' && e.slotLabel === donorSlotLabel)?.installedItem).toBe('—')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(CANDIDATE)
    // EWO-070 (Part A) — Target preserved even through a cross-ship transfer.
    expect(hp.targetItem).toBe('Shimmer')
  })
})

describe('SW-014A: Tier 4 — Newly Acquired Component', () => {
  it('Record New Component opens an inline picker (never a dialog); Record & Install adds it to Hangar and installs it in one action', () => {
    if (catalogComponentsByName.size === 0) return
    // Cleared so the resulting Hangar quantity below is unambiguous — the
    // seed fleet already owns a real Mirage unit (item-3, qty 1).
    useFleetStore.setState({ hangarItems: [] })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    fireEvent.click(disclosure.getByRole('button', { name: /Record New Component/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const picker = disclosure.getByLabelText(`New acquired component for ${SLOT}`) as HTMLInputElement
    fireEvent.click(picker)
    fireEvent.change(picker, { target: { value: CANDIDATE } })
    const listboxId = picker.getAttribute('aria-controls')
    fireEvent.click(document.querySelector(`#${listboxId} li button`) as HTMLButtonElement)

    fireEvent.click(disclosure.getByRole('button', { name: /Record & Install/ }))

    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(CANDIDATE)
    // EWO-070 (Part A) — Target preserved through Record & Install too.
    expect(hp.targetItem).toBe('Shimmer')
    // Recorded (qty 1) then immediately consumed by the install — no
    // phantom leftover Hangar unit. Confirms the same `moveToShip`-based
    // bookkeeping fix Tiers 1-3 rely on also applies here: recording then
    // installing must not silently leave the newly-added unit sitting in
    // Hangar as if never installed.
    const remaining = useFleetStore.getState().hangarItems.filter((h) => h.name === CANDIDATE).reduce((sum, h) => sum + h.qty, 0)
    expect(remaining).toBe(0)
  })
})

describe('SW-014A: Tier 5 — Remaining Compatible Components', () => {
  it('a compatible component with no acquisition path anywhere is listed for reference only', () => {
    if (catalogComponentsByName.size === 0) return
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    // EWO-064 (Part G) — collapsed by default; the toggle carries the count.
    expect(disclosure.getByText(/Remaining Compatible Components \(\d+\)/)).toBeInTheDocument()
  })
})

describe('SW-014A: Preserve Existing Intelligence', () => {
  it('the acquisition hint badge and the original reference tier list both remain visible alongside the new actionable sections', () => {
    if (catalogComponentsByName.size === 0) return
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    // EWO-064 (Part G) reworded the reference tier list's own wording — still present, just reordered/rephrased.
    expect(disclosure.getByText(/Available Inventory — genuinely free stock/)).toBeInTheDocument()
    expect(disclosure.getByText(/Add Newly Acquired Component/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('SW-014A: Regression — Remove Installed Component still works unchanged', () => {
  it('Remove still opens its own confirm modal (the one deliberate dialog exception) and still functions after this mission\'s changes', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const removeButtons = screen.getAllByRole('button', { name: /Remove/ })
    expect(removeButtons.length).toBeGreaterThan(0)
    fireEvent.click(removeButtons[0])
    expect(screen.getByText(/Remove "/)).toBeInTheDocument()
  })
})

describe('SW-014A: Persistence', () => {
  it('an install performed through the inline workflow survives a genuine reload', async () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(CANDIDATE)!
    useFleetStore.setState({
      hangarItems: [{ id: 'test-hangar-persist', name: CANDIDATE, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../../store/useFleetStore')
    const ship = reloaded.getState().ships.find((s) => s.id === 'ghost')!
    const hp = reloaded.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(CANDIDATE)
    expect(reloaded.getState().installedLoadouts.find((e) => e.shipId === 'ghost' && e.slotLabel === SLOT)?.installedItem).toBe(CANDIDATE)
    // EWO-070 (Part I) — the Installed/Target distinction survives a
    // genuine reload/rehydration, never silently collapsing during
    // serialization or migration.
    expect(hp.targetItem).toBe('Shimmer')
  })
})
