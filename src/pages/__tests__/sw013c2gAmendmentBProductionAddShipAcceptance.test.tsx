import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'

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

/**
 * SW-013C.2G Amendment B — Real Add-Ship Path Failure and Seed-Fixture
 * Divergence.
 *
 * This is the PRIMARY end-to-end acceptance proof for the Ghost Mk II
 * dormant Nose Turret feature, per Amendment B's own explicit requirement
 * that "a seed fixture may not serve as the primary end-to-end acceptance
 * proof." It creates the ship through
 * `useFleetStore.getState().addFleetAsset('hornet-f7cs-mk2-imported', 'OWNED')`
 * — the exact same store action `src/components/AddShipModal.tsx`'s own
 * "Add to Fleet" button calls (`const outcome = addFleetAsset(selected.id,
 * ownershipType, nickname.trim() || undefined, parsedPriority)`,
 * AddShipModal.tsx:68) — never a handcrafted fixture, seed data, or
 * direct hardpoint injection. This is the actual production code path a
 * Commander's browser runs when they use the real "Add Ship" UI.
 *
 * Live investigation (Playwright, against the real running dev server,
 * driving the literal Add Ship search/select/Add-to-Fleet UI flow end to
 * end) reproduced this exact path and found the Nose Weapon row present
 * with correct candidates before any edits — see
 * docs/SW-013C.2G-Amendment-B-Real-Add-Ship-Path-Report.md for the full
 * writeup, including a screenshot of the real rendered tree and the
 * evidence for why this diverges from the Commander's own observation
 * (a long, two-sections-apart table layout, not a topology defect).
 *
 * `src/pages/__tests__/sw013c2gDormantHardpointMaterialization.test.tsx`'s
 * "Amendment A: the seed 'ghost' fixture" tests remain in place as a
 * SECONDARY control only, per Amendment B's own instruction — they prove
 * the seed path also works, never as a substitute for this file.
 */
describe('SW-013C.2G Amendment B: primary acceptance — a genuine Add-Ship-created Ghost Mk II', () => {
  it('BEFORE any target edits: the rendered tree contains a separate Nose Weapon row with the correct Mk II turret candidates (fails immediately if absent)', () => {
    if (catalogComponentsByName.size === 0) return

    // The exact same call AddShipModal.tsx's "Add to Fleet" button makes.
    const added = useFleetStore.getState().addFleetAsset('hornet-f7cs-mk2-imported', 'OWNED')
    expect(added.success).toBe(true)
    const assetId = added.assetId!

    render(
      <MemoryRouter initialEntries={[`/ship-workspace/${assetId}`]}>
        <Routes>
          <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
        </Routes>
      </MemoryRouter>
    )
    for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
    fireEvent.click(screen.getByText(/Manage Loadout/))
    for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)

    // Hard fail-fast: the row must exist before any edit is made. No
    // fallback, no retry, no soft-skip.
    const noseInput = screen.queryByLabelText('New target for Nose Weapon') as HTMLInputElement | null
    if (!noseInput) throw new Error('FAIL: Nose Weapon row absent from a genuine Add-Ship-created Ghost Mk II before any edits were made.')
    expect(noseInput.value).toBe('—') // never pre-occupied — dormant ports carry no factory default

    fireEvent.click(noseInput)
    const listboxId = noseInput.getAttribute('aria-controls')
    const options = Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
    // SW-013C.2G Amendment C: the swap group's OTHER member (F7A/"S3 Nose
    // Turret") is confirmed invalid for this hull and excluded — only the
    // one vessel-compatible turret (S2) is offered.
    expect(options.some((o) => o.includes('Anvil Hornet Mk II S2 Nose Turret'))).toBe(true)
    expect(options.some((o) => o.includes('Anvil Hornet Mk II S3 Nose Turret'))).toBe(false)

    // Confirms the Center Weapon and Nose Cone Module rows (the ones the
    // Commander's own screenshot showed, both correctly Cap-only by
    // factory default) are separate ports the Nose Weapon row's own
    // candidates never bleed into.
    const centerInput = screen.getByLabelText('New target for Center Weapon') as HTMLInputElement
    expect(centerInput.value).toBe('Anvil Hornet Ghost Mk II Center Cap')
    const capInput = screen.getByLabelText('New target for Nose Cone') as HTMLInputElement
    expect(capInput.value).toBe('ANVL F7 Mk2 NoseCap')
  })

  it('full production sequence: select turret -> two weapon children materialize -> save -> genuine reload -> topology survives', async () => {
    if (catalogComponentsByName.size === 0) return

    const added = useFleetStore.getState().addFleetAsset('hornet-f7cs-mk2-imported', 'OWNED')
    expect(added.success).toBe(true)
    const assetId = added.assetId!

    render(
      <MemoryRouter initialEntries={[`/ship-workspace/${assetId}`]}>
        <Routes>
          <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
        </Routes>
      </MemoryRouter>
    )
    for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
    fireEvent.click(screen.getByText(/Manage Loadout/))
    for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)

    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    fireEvent.click(noseInput)
    fireEvent.change(noseInput, { target: { value: 'S2 Nose Turret' } })
    let listboxId = noseInput.getAttribute('aria-controls')
    fireEvent.click(document.querySelector(`#${listboxId} li button`) as HTMLButtonElement)

    const slot1 = screen.getByLabelText('New target for Weapon Slot 1') as HTMLInputElement
    const slot2 = screen.getByLabelText('New target for Weapon Slot 2') as HTMLInputElement
    expect(slot1).toBeInTheDocument()
    expect(slot2).toBeInTheDocument()

    fireEvent.click(slot1)
    fireEvent.change(slot1, { target: { value: 'Omnisky' } })
    listboxId = slot1.getAttribute('aria-controls')
    fireEvent.click(document.querySelector(`#${listboxId} li button`) as HTMLButtonElement)

    fireEvent.click(slot2)
    fireEvent.change(slot2, { target: { value: 'Scattergun' } })
    listboxId = slot2.getAttribute('aria-controls')
    fireEvent.click(document.querySelector(`#${listboxId} li button`) as HTMLButtonElement)

    fireEvent.click(screen.getAllByText('Save Changes')[0])
    expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument()

    const build = useFleetStore.getState().builds.find((b) => b.shipId === assetId)!

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../../store/useFleetStore')
    const { prepareCanonicalHardpoints } = await import('../../utils/canonicalHardpointPreparation')
    const reloadedHardpoints = reloaded.getState().hardpoints.filter((h) => h.buildId === build.id)
    const prepared = prepareCanonicalHardpoints(assetId, reloadedHardpoints, reloaded.getState().fleetAssets)

    const nose = prepared.find((h) => h.sourceItemPortName === 'hardpoint_weapon_nose')!
    expect(nose.isDormant).toBe(true)
    const children = prepared.filter((h) => h.parentSlotLabel === nose.slotLabel)
    expect(children).toHaveLength(2)
    const byLabel = new Map(children.map((c) => [c.slotLabel, c]))
    expect(byLabel.get('Nose Weapon — Weapon Slot 1')?.targetItem).toBe('Omnisky VI Cannon')
    expect(byLabel.get('Nose Weapon — Weapon Slot 2')?.targetItem).toBe('Dominance-2 Scattergun')
  })
})
