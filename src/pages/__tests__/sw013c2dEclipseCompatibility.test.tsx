import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'

const initialState = useFleetStore.getState()

let ioCallback: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null
class FakeIntersectionObserver {
  constructor(cb: (entries: Partial<IntersectionObserverEntry>[]) => void) {
    ioCallback = cb
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
  ioCallback = null
  // @ts-expect-error — test-only global stub, not a real IntersectionObserver
  global.IntersectionObserver = FakeIntersectionObserver
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => cleanup())

function renderEclipseWorkspace() {
  const result = useFleetStore.getState().addFleetAsset('eclipse-imported', 'OWNED')
  render(
    <MemoryRouter initialEntries={[`/ship-workspace/${result.assetId}`]}>
      <Routes>
        <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
      </Routes>
    </MemoryRouter>
  )
  for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
  fireEvent.click(screen.getByText(/Manage Loadout/))
  for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
}

/** Opens the rack's New Target picker with an empty filter (returns every
 * offered option, up to the picker's own 40-item cap) and returns their
 * visible text. */
function openRackOptions(): string[] {
  const input = screen.getByLabelText('New target for Torpedorack') as HTMLInputElement
  fireEvent.click(input)
  const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
  return Array.from(listbox.querySelectorAll('button')).map((b) => b.textContent ?? '')
}

/**
 * SW-013C.2D (Objectives 3/4) — Eclipse Mission Rack Compatibility +
 * Alternate Rack Discovery. Root cause: `MRCK_S09_AEGS_Eclipse` (Eclipse's
 * own factory rack) and `MRCK_S09_AEGS_Retaliator_Fore`/`_Rear` share the
 * exact same DataCore category (MissileLauncher/MissileRack) AND the exact
 * same catalog size (S9 — the accepted torpedo class, not a rack-family
 * identifier) — the generic size/category compatibility sweep could never
 * tell them apart. The authoritative fix routes a rack port through its
 * own certified swap group (`Eclipse_BombRack`) whenever one exists,
 * falling back to the generic sweep only when it doesn't (preserving the
 * Hornet Ghost/Fury cross-ship rack swap — SW-008C's own regression, a
 * ship whose rack port has no confirmed group).
 */
describe('SW-013C.2D (Objective 3): Eclipse rack compatibility is scoped to its own certified swap group', () => {
  it('the Retaliator rack is NOT offered as a New Target for the Eclipse\'s own rack port', () => {
    if (catalogComponentsByName.size === 0) return
    renderEclipseWorkspace()
    const options = openRackOptions()
    expect(options.some((o) => o.includes('Retaliator'))).toBe(false)
  })

  it('Objective 4: all three real Eclipse bomb rack alternates ARE offered — the ones this mission confirmed live (1xS10, 4xS5, 20xS3)', () => {
    if (catalogComponentsByName.size === 0) return
    renderEclipseWorkspace()
    const options = openRackOptions()
    const joined = options.join(' | ')
    expect(joined).toContain('1xS10 Bomb Rack')
    expect(joined).toContain('4xS5 Bomb Rack')
    expect(joined).toContain('20xS3 Bomb Rack')
  })

  it('selecting the confirmed 20xS3 alternate materializes its own real 20-slot payload-array topology, not a fabricated count', () => {
    if (catalogComponentsByName.size === 0) return
    renderEclipseWorkspace()
    const input = screen.getByLabelText('New target for Torpedorack') as HTMLInputElement
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: '20xS3' } })
    const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
    fireEvent.click(listbox.querySelector('button') as HTMLButtonElement)
    // Both the panel-header Save Changes button and SW-013C.2D's own
    // persistent save bar render "Save Changes" once a pending edit
    // exists — either commits the same edit via the same handler.
    fireEvent.click(screen.getAllByText('Save Changes')[0])
    // A successful save returns the workspace to Operational Review
    // (Ship Assessment's read-only Factory/Installed columns, no
    // Target) — re-enter Manage Loadout to see the Target-column view
    // the new payload topology renders in.
    fireEvent.click(screen.getAllByText(/Manage Loadout/)[0])
    for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)

    const bombRow = screen.getAllByText('Bomb').find((el) => el.tagName === 'DIV')
    expect(bombRow).toBeDefined()
    const aggregateRow = bombRow!.closest('tr') as HTMLElement
    expect(aggregateRow.textContent).toContain('×20')
    // A real, confirmed swap-group alternative must never read "Invalid
    // Target" merely because its own translated category (BombLauncher)
    // differs from the port's own type (Missile Rack) — the swap group
    // itself is the authority, not the generic size/category sweep.
    expect(aggregateRow.textContent).not.toContain('Invalid Target')
  })

  it('the saved Bomb Rack selection survives a genuine store reload with the same correct status — not flipped to Invalid Target by rehydration/reconciliation', async () => {
    if (catalogComponentsByName.size === 0) return
    const { useFleetStore: store1 } = await import('../../store/useFleetStore')
    const added = store1.getState().addFleetAsset('eclipse-imported', 'OWNED')
    const rack = store1.getState().hardpoints.find((h) => h.shipId === added.assetId && h.slotLabel === 'Torpedorack')!
    const build = store1.getState().builds.find((b) => b.shipId === added.assetId && b.isActive)!
    const result = store1.getState().saveMissionConfiguration({
      shipId: added.assetId!,
      name: 'Bomb Rack Test',
      startingState: 'EXISTING',
      existingBuildId: build.id,
      targetOverrides: { [rack.slotLabel]: { targetItem: 'Aegis Eclipse 20xS3 Bomb Rack', targetEntityClass: 'BMBRCK_S03_AEGS_Eclipse' } },
      setActive: true,
      saveAsNew: false,
    })
    expect(result.success).toBe(true)

    const beforeRow = store1.getState().hardpoints.find((h) => h.buildId === build.id && h.slotLabel === 'Torpedorack')!
    expect(beforeRow.status).not.toBe('Invalid Target')

    vi.resetModules()
    const { useFleetStore: store2 } = await import('../../store/useFleetStore')
    const afterRow = store2.getState().hardpoints.find((h) => h.buildId === build.id && h.slotLabel === 'Torpedorack')
    expect(afterRow?.targetItem).toBe('Aegis Eclipse 20xS3 Bomb Rack')
    expect(afterRow?.status).toBe(beforeRow.status)
    expect(afterRow?.status).not.toBe('Invalid Target')

    const childrenAfter = store2.getState().hardpoints.filter((h) => h.buildId === build.id && h.parentSlotLabel === 'Torpedorack')
    expect(childrenAfter).toHaveLength(20)
  })
})
