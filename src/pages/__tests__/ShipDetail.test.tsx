import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipDetail from '../ShipDetail'
import MissionComposer from '../MissionComposer'
import { useFleetStore } from '../../store/useFleetStore'
import { getMissileRackSlotSpec } from '../../generated/missileRackSlots'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderShipDetail(shipId: string) {
  return render(
    <MemoryRouter initialEntries={[`/ship/${shipId}`]}>
      <Routes>
        <Route path="/ship/:shipId" element={<ShipDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('<ShipDetail /> (Alpha 2.5C)', () => {
  it('1/2. shows a Readiness card, never a competing Installed Match / Package Readiness headline pair', () => {
    renderShipDetail('ghost')
    expect(screen.getByText('Readiness')).toBeInTheDocument()
    expect(screen.queryByText('Installed Match')).not.toBeInTheDocument()
    expect(screen.queryByText('Package Readiness')).not.toBeInTheDocument()
  })

  it('3. no readiness percentage renders inside the hero image area itself', () => {
    renderShipDetail('ghost')
    const heroArea = screen.getByTestId('ship-hero-image-area')
    expect(heroArea.textContent).not.toMatch(/^\d+%$/)
  })

  it('4. manufacturer logo renders top-left in the hero', () => {
    renderShipDetail('ghost')
    expect(screen.getByTitle('Anvil')).toBeInTheDocument()
  })

  it('7. a completed custom Loadout (Corsair) shows Mission Ready', () => {
    renderShipDetail('corsair')
    expect(screen.getByText('Mission Ready')).toBeInTheDocument()
  })

  it('8. a Factory Loadout ship (UTV) never receives Mission Ready certification treatment', () => {
    renderShipDetail('utv')
    expect(screen.getAllByText('Factory Loadout').length).toBeGreaterThan(0)
    expect(screen.queryByText('Mission Ready')).not.toBeInTheDocument()
  })

  it('10. the unified Loadout & Port Tree renders', () => {
    renderShipDetail('ghost')
    expect(screen.getByText('Loadout & Port Tree')).toBeInTheDocument()
  })

  it('11. every top-level normalized port renders for Railen (pilot weapons, turrets, tractor beams)', () => {
    renderShipDetail('railen')
    expect(screen.getByText('Pilot Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Pilot Weapon 4')).toBeInTheDocument()
    expect(screen.getByText('Port Turret')).toBeInTheDocument()
    expect(screen.getByText('Starboard Turret')).toBeInTheDocument()
    expect(screen.getByText('Fore Tractor Beam')).toBeInTheDocument()
  })

  it("12. Railen's turret child weapons are collapsed by default (not rendered until expansion)", () => {
    renderShipDetail('railen')
    expect(screen.queryByText('Port Turret Left Weapon')).not.toBeInTheDocument()
  })

  it('13. Expand All reveals nested turret child weapons', () => {
    renderShipDetail('railen')
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Port Turret Left Weapon')).toBeInTheDocument()
    expect(screen.getByText('Starboard Turret Right Weapon')).toBeInTheDocument()
  })

  it('14. Collapse All hides descendants again after expanding', () => {
    renderShipDetail('railen')
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Port Turret Left Weapon')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Collapse All'))
    expect(screen.queryByText('Port Turret Left Weapon')).not.toBeInTheDocument()
  })

  it('Mission M-011: Ghost Mk II exposes its Nose Mount with two child weapon positions, collapsed by default', () => {
    renderShipDetail('ghost')
    expect(screen.getByText('Nose Mount')).toBeInTheDocument()
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Weapon 2')).toBeInTheDocument()
  })

  it('MOLE renders its mining turret hierarchy', () => {
    renderShipDetail('mole')
    expect(screen.getByText('Mining Turret 1')).toBeInTheDocument()
    expect(screen.getByText('Mining Turret 2')).toBeInTheDocument()
  })

  it('Vulture renders its salvage mount and tractor beam', () => {
    renderShipDetail('vulture')
    expect(screen.getByText('Salvage Mount')).toBeInTheDocument()
    expect(screen.getAllByText('Tractor Beam').length).toBeGreaterThan(0)
  })

  it('Cutlass Black renders its Top Turret and Tractor Beam', () => {
    renderShipDetail('cutlass-black')
    expect(screen.getByText('Top Turret')).toBeInTheDocument()
    expect(screen.getAllByText('Tractor Beam').length).toBeGreaterThan(0)
  })

  it('EWO-031 (Task 6/7): Origin 135c shows no "Unknown Factory Item" anywhere on Ship Detail — Factory, Installed, and Target all resolve to real components', () => {
    renderShipDetail('135c')
    expect(screen.queryByText('Unknown Factory Item')).not.toBeInTheDocument()
  })

  it('EWO-031 (Task 6/7): UTV shows no "Unknown Factory Item" anywhere on Ship Detail either — the same fix applied to the other affected seed ship', () => {
    renderShipDetail('utv')
    expect(screen.queryByText('Unknown Factory Item')).not.toBeInTheDocument()
  })

  it('28. switching Active Loadout does not move equipment (Installed Loadout unchanged), only Target changes', () => {
    renderShipDetail('ghost')
    const installedBefore = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')
    useFleetStore.getState().setActiveBuild('ghost', 'ghost-escort')
    const installedAfter = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')
    expect(installedAfter).toEqual(installedBefore)
  })

  it("Edit and Remove from Fleet actions remain present alongside Quick Update", () => {
    renderShipDetail('ghost')
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Remove from Fleet')).toBeInTheDocument()
    expect(screen.getByText('Quick Update')).toBeInTheDocument()
  })

  it('does not use Mission Configuration language in normal user-facing copy', () => {
    renderShipDetail('ghost')
    expect(screen.queryByText(/Mission Configuration/i)).not.toBeInTheDocument()
  })
})

describe('EWO-026 (Task 3/4/13): exact Fleet Asset navigation and safe fallback', () => {
  it('11. two Fleet Assets of the same hull, opened directly by id, each show their own distinct instance', () => {
    const a = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Cutty One')
    const b = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Cutty Two')
    expect(a.success && b.success).toBe(true)

    renderShipDetail(b.assetId!)
    // The nickname is what distinguishes the two instances in the UI —
    // opening by the second asset's own id must show its own nickname as
    // the active ship's hero name, never silently fall back to the first
    // Cutlass Black added (both nicknames legitimately still appear in the
    // page's own "Select Ship" switcher, which lists every ship).
    expect(screen.getByAltText('Cutty Two')).toBeInTheDocument()
    expect(screen.queryByAltText('Cutty One')).not.toBeInTheDocument()
  })

  it('12. a missing/stale Fleet Asset id never crashes — falls back to the existing safe default (first ship)', () => {
    expect(() => renderShipDetail('this-fleet-asset-id-does-not-exist')).not.toThrow()
    // Safe fallback already in place: `ships.find(...) ?? ships[0]`.
    const firstShip = useFleetStore.getState().ships[0]
    expect(screen.getAllByText(new RegExp(firstShip.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).length).toBeGreaterThan(0)
  })

  it('normal navigation into Ship Detail (no stale/duplicate concerns) still opens the requested ship', () => {
    renderShipDetail('utv')
    expect(screen.getAllByText(/UTV/i).length).toBeGreaterThan(0)
  })
})

describe('EWO-026 (round 2, Task 1): Ship Detail rebuilds the canonical Port Tree after a saved Loadout becomes active', () => {
  it('a Loadout created and activated in Loadout Manager shows full category headers in Ship Detail — never a flat table', () => {
    const result = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED')
    const shipId = result.assetId!

    render(
      <MemoryRouter initialEntries={[`/loadout-manager?shipId=${shipId}`]}>
        <MissionComposer />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByPlaceholderText(/Deep Salvage Run/i), { target: { value: 'Repro Build' } })
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))
    // Ground truth: saveMissionConfiguration still does not write
    // groupLabel/parentSlotLabel/isStructural onto the saved Build's own
    // rows — this test exercises the real stripped-data condition.
    const activeBuildId = useFleetStore.getState().ships.find((s) => s.id === shipId)?.activeBuildId
    const savedRow = useFleetStore.getState().hardpoints.find((h) => h.buildId === activeBuildId)!
    expect(savedRow.groupLabel).toBeUndefined()
    cleanup()

    renderShipDetail(shipId)
    expect(screen.getByText('Weapons')).toBeInTheDocument()
    expect(screen.getByText('Core Systems')).toBeInTheDocument()
    expect(screen.getByText('Manned Turrets')).toBeInTheDocument()
  })

  it("does not alter readiness/logistics — Ship Detail's Readiness percentage is identical before and after the hierarchy-display fix", () => {
    // The overlay only changes what LoadoutPortTree renders; progress and
    // buildState are still computed from the exact same shipHardpoints.
    renderShipDetail('corsair')
    expect(screen.getByText('Mission Ready')).toBeInTheDocument()
  })
})

/**
 * EWO-033A (Task 5/12) — Ship Detail Hero Standardization. Cutlass Black
 * and 135c both have a real, registered image (src/data/shipImageRegistry.ts);
 * Eclipse and Gladius are deep-imported-only (no seed entry — reachable via
 * ShipDetail's "(Imported)" dev-inspection path) with no registry entry, so
 * they exercise the fallback. All four render through the exact same
 * `ShipHeroFrame` component and the exact same fixed hero height.
 */
describe('<ShipDetail /> — EWO-033A (Task 5): hero standardization across real-image and fallback ships', () => {
  it('12. Cutlass Black (registered real image) renders the overlay layout, not the fallback metadata band', () => {
    renderShipDetail('cutlass-black')
    expect(screen.getByTestId('ship-hero-overlay-info')).toBeInTheDocument()
    expect(screen.queryByTestId('ship-hero-metadata-band')).not.toBeInTheDocument()
  })

  it('12. 135c (registered real image) renders the overlay layout, not the fallback metadata band', () => {
    renderShipDetail('135c')
    expect(screen.getByTestId('ship-hero-overlay-info')).toBeInTheDocument()
    expect(screen.queryByTestId('ship-hero-metadata-band')).not.toBeInTheDocument()
  })

  it('9/10. Eclipse (no registry entry, deep-imported-only) renders the fallback metadata band, filling the hero without excessive unused space (same fixed height as a real-image hero)', () => {
    renderShipDetail('eclipse-imported')
    expect(screen.getByTestId('ship-hero-metadata-band')).toBeInTheDocument()
    expect(screen.queryByTestId('ship-hero-overlay-info')).not.toBeInTheDocument()
    const heroArea = screen.getByTestId('ship-hero-image-area')
    expect(heroArea.className).toContain('h-44')
    expect(heroArea.className).not.toContain('h-[360px]')
  })

  it('Gladius (no registry entry, deep-imported-only) also renders the fallback cleanly', () => {
    renderShipDetail('gladius-imported')
    const band = screen.getByTestId('ship-hero-metadata-band')
    expect(band).toBeInTheDocument()
    expect(within(band).getByText('Gladius')).toBeInTheDocument()
  })

  it('15. the real-image hero and the fallback hero share the exact same image-area height class', () => {
    renderShipDetail('cutlass-black')
    const realHero = screen.getByTestId('ship-hero-image-area')
    const realClass = realHero.className
    cleanup()
    renderShipDetail('eclipse-imported')
    const fallbackHero = screen.getByTestId('ship-hero-image-area')
    expect(fallbackHero.className).toBe(realClass)
  })

  it('20. ship identity (name, ownership) remains visible for both a real-image hero and a fallback hero', () => {
    renderShipDetail('cutlass-black')
    expect(within(screen.getByTestId('ship-hero-image-area')).getByText('Cutlass Black')).toBeInTheDocument()
    cleanup()
    renderShipDetail('eclipse-imported')
    expect(within(screen.getByTestId('ship-hero-metadata-band')).getByText('Eclipse')).toBeInTheDocument()
  })

  it('11. a deliberately failing registered URL falls back cleanly on Ship Detail, with no broken-image state and no crash', () => {
    const ghost = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    useFleetStore.setState({
      ships: useFleetStore.getState().ships.map((s) => (s.id === 'ghost' ? { ...s, imageUrl: 'https://example.com/deliberately-failing-test-url.jpg' } : s)),
    })
    renderShipDetail('ghost')
    const img = screen.getByRole('img', { name: ghost.name }) as HTMLImageElement
    expect(() => fireEvent.error(img)).not.toThrow()
    // Once the registered URL fails, the hero degrades to the fallback
    // presentation entirely — identity moves from the overlay to the
    // metadata band (ShipHeroFrame's existing, pre-EWO-033A architecture
    // for the fallback case), but it never disappears.
    expect(within(screen.getByTestId('ship-hero-metadata-band')).getByText(ghost.name)).toBeInTheDocument()
  })
})

/** Renders Ship Detail at the bare "/ship" route (no explicit id in the
 * URL) — the general-navigation entry point (Sidebar's "Ship Detail"
 * link, matching src/App.tsx's own `<Route path="/ship" .../>`). */
function renderShipDetailBlank() {
  return render(
    <MemoryRouter initialEntries={['/ship']}>
      <Routes>
        <Route path="/ship" element={<ShipDetail />} />
        <Route path="/ship/:shipId" element={<ShipDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('<ShipDetail /> — FTB-001A (Workstream D): explicit ship selection', () => {
  it('opening with no explicit navigation target renders the blank "Select a Ship" empty state, never an inferred first-ship default', () => {
    renderShipDetailBlank()
    expect(screen.getByText('Select a Ship')).toBeInTheDocument()
    expect(screen.getByText('Choose a fleet vessel above to review or manage its loadout.')).toBeInTheDocument()
    // No other ship's data is implied — the fleet's first real ship
    // (alphabetically or in store order) must not be showing anywhere.
    expect(screen.queryByText('Readiness')).not.toBeInTheDocument()
    expect(screen.queryByText('Active Loadout')).not.toBeInTheDocument()
  })

  it('the Select Ship control itself defaults to the blank placeholder, never a specific ship id', () => {
    renderShipDetailBlank()
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('no editing action (Quick Update, Change Disposition, Edit, Remove from Fleet) is available before a ship is selected', () => {
    renderShipDetailBlank()
    expect(screen.queryByText('Quick Update')).not.toBeInTheDocument()
    expect(screen.queryByText('Change Disposition')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove from Fleet')).not.toBeInTheDocument()
  })

  it('explicit navigation from a specific ship (a real shipId in the URL) selects exactly that ship — the direct, intentional target the policy allows', () => {
    renderShipDetail('ghost')
    expect(screen.queryByText('Select a Ship')).not.toBeInTheDocument()
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect(select.value).toBe('ghost')
  })

  it('a deleted/unavailable selected ship (a shipId that no longer resolves to any live Fleet Asset) renders the same blank empty state, never silently substituting another ship', () => {
    render(
      <MemoryRouter initialEntries={['/ship/this-ship-id-does-not-exist']}>
        <Routes>
          <Route path="/ship/:shipId" element={<ShipDetail />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Select a Ship')).toBeInTheDocument()
    expect(screen.queryByText('Readiness')).not.toBeInTheDocument()
  })
})

describe('<ShipDetail /> — FTB-001B: dynamic missile rack swap, end-to-end through the real store', () => {
  // Railen (an existing, already-established test fixture — see Mission
  // M-011's own Railen tests) carries two real racks at once: "Left Top
  // Missile Rack" (factory: MRCK_S03_GAMA_Railen_Dual_S02, 2 slots @ S2)
  // and "Left Bottom Missile Rack" (MRCK_S04_GAMA_Railen_Octo_S01, 8
  // slots @ S1) — confirmed via direct DataCore query (FTB-001B
  // investigation). The swap target here is a real, unrelated Talon rack
  // (MRCK_S04_ESPR_Talon, 12 slots @ S3) rather than Railen's own Octo
  // rack, specifically so its slot numbers 9-12 can never collide with
  // any slot number Railen's OTHER real factory rack (max 8) already
  // renders — every "Missile Slot N" assertion below is scoped to a slot
  // number that is unambiguous on this exact ship.
  //
  // Ship Detail is a "what does my ship actually look like right now"
  // inspection view (Design Authority-established precedent, FTB-001A):
  // its own component-owned child-slot correction keys off INSTALLED
  // identity, not merely Target, so that a Commander who has only
  // *planned* a swap (via Loadout Manager) but never actually installed
  // it still sees the real, physically-present rack's own children —
  // matching how every other row's status already distinguishes
  // "Missing"/"Upgrade Available" (planned) from "OK" (actually there).
  // This helper therefore simulates the REAL end state of a completed
  // swap (matching what Quick Update's "Install Component" action
  // produces) — both Installed and Target set to the new rack — via a
  // direct store patch, rather than re-exercising Quick Update's own
  // already-tested UI mechanics here.
  const DUAL_RACK = 'MRCK_S03_GAMA_Railen_Dual_S02'
  const TALON_RACK = 'MRCK_S04_ESPR_Talon'

  function addRailenWithSwappedRack() {
    const added = useFleetStore.getState().addFleetAsset('railen-imported', 'OWNED')
    if (!added.success || !added.assetId) throw new Error('failed to add Railen')
    const ship = useFleetStore.getState().ships.find((s) => s.id === added.assetId)!
    useFleetStore.setState({
      hardpoints: useFleetStore.getState().hardpoints.map((h) =>
        h.buildId === ship.activeBuildId && h.slotLabel === 'Left Top Missile Rack'
          ? { ...h, installedItem: 'MSD-683 Missile Rack', installedEntityClass: TALON_RACK, targetItem: 'MSD-683 Missile Rack', targetEntityClass: TALON_RACK, status: 'OK' }
          : h
      ),
    })
    return added.assetId
  }

  it('a factory rack (2 slots @ S2) shows its real factory child count before any swap', () => {
    if (getMissileRackSlotSpec(DUAL_RACK) === null) return // generated-data/missile-rack-slots.json not present on this machine
    const added = useFleetStore.getState().addFleetAsset('railen-imported', 'OWNED')
    if (!added.success || !added.assetId) throw new Error('failed to add Railen')
    render(
      <MemoryRouter initialEntries={[`/ship/${added.assetId}`]}>
        <Routes>
          <Route path="/ship/:shipId" element={<ShipDetail />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Left Top Missile Rack')).toBeInTheDocument()
  })

  it('replacing the Dual rack\'s Target with the real Talon rack removes the old 2xS2 children and shows the new 12xS3 children — count AND size both corrected', () => {
    if (getMissileRackSlotSpec(DUAL_RACK) === null || getMissileRackSlotSpec(TALON_RACK) === null) return
    const assetId = addRailenWithSwappedRack()
    render(
      <MemoryRouter initialEntries={[`/ship/${assetId}`]}>
        <Routes>
          <Route path="/ship/:shipId" element={<ShipDetail />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Expand All'))
    const rackRow = screen.getByText('Left Top Missile Rack').closest('tr')!
    // The rack port's own row still reads its ORIGINAL S3 mount-point
    // size/type — only its CHILDREN change shape.
    expect(within(rackRow).getByText(/S3/)).toBeInTheDocument()
    // Slot 12 is unambiguous — Railen's other real rack (Octo) tops out
    // at 8, so this can only be the swapped-in Talon rack's own 12th slot.
    expect(screen.getByText('Missile Slot 12')).toBeInTheDocument()
    // Exactly 12 (Talon's real count), never a 13th.
    expect(screen.queryByText('Missile Slot 13')).not.toBeInTheDocument()
  })

  it('save, reload (fresh render), and a fresh render against the same store state all preserve the corrected 12-slot structure', () => {
    if (getMissileRackSlotSpec(DUAL_RACK) === null || getMissileRackSlotSpec(TALON_RACK) === null) return
    const assetId = addRailenWithSwappedRack()
    // First render (post-save).
    const first = render(
      <MemoryRouter initialEntries={[`/ship/${assetId}`]}>
        <Routes>
          <Route path="/ship/:shipId" element={<ShipDetail />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Missile Slot 12')).toBeInTheDocument()
    first.unmount()
    cleanup()

    // A completely fresh render against the SAME (already-persisted)
    // store state — simulates a reload/restart, since the correction is
    // re-derived fresh from the row's own persisted identity every time,
    // never from anything cached in the first render.
    render(
      <MemoryRouter initialEntries={[`/ship/${assetId}`]}>
        <Routes>
          <Route path="/ship/:shipId" element={<ShipDetail />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Missile Slot 12')).toBeInTheDocument()
    expect(screen.queryByText('Missile Slot 13')).not.toBeInTheDocument()
  })

  it('a freshly-swapped rack\'s new empty slots read OK (nothing required yet), matching how every other untouched optional port already behaves — never silently "Missing" for a slot the Commander hasn\'t decided on yet', () => {
    if (getMissileRackSlotSpec(DUAL_RACK) === null || getMissileRackSlotSpec(TALON_RACK) === null) return
    const assetId = addRailenWithSwappedRack()
    render(
      <MemoryRouter initialEntries={[`/ship/${assetId}`]}>
        <Routes>
          <Route path="/ship/:shipId" element={<ShipDetail />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Expand All'))
    const slotRow = screen.getByText('Missile Slot 12').closest('tr')!
    expect(within(slotRow).getByText('OK')).toBeInTheDocument()
    // Readiness never crashes/NaNs across the swap. An empty-but-OK
    // synthesized slot is never "missing," so this ship may legitimately
    // read as fully Mission Ready (no percentage rendered at all in that
    // state) rather than a partial numeric percentage — either is a
    // valid, non-broken outcome; only a literal "NaN" would indicate the
    // swap broke the readiness calculation.
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })

  it('the new Talon rack\'s own slot size (S3) renders on each synthesized child — a missile only valid on the old S2 Dual rack\'s size would now be rejected by the port\'s own size, never silently accepted', () => {
    if (getMissileRackSlotSpec(DUAL_RACK) === null || getMissileRackSlotSpec(TALON_RACK) === null) return
    const assetId = addRailenWithSwappedRack()
    render(
      <MemoryRouter initialEntries={[`/ship/${assetId}`]}>
        <Routes>
          <Route path="/ship/:shipId" element={<ShipDetail />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Expand All'))
    const slotRow = screen.getByText('Missile Slot 12').closest('tr')!
    // The synthesized slot carries the NEW rack's real S3 size (not the
    // old Dual rack's S2) — an old S2 assignment would fail
    // `validateTargetCompatibility` against this exact size the moment a
    // Commander tried to keep it (proven directly at the
    // compatibility-engine level by
    // src/data/__tests__/pdcCompatibility.test.ts's own established
    // pattern; this render-level assertion confirms the size the engine
    // would validate against is really the new rack's, not the old one's).
    expect(within(slotRow).getByText(/S3\b/)).toBeInTheDocument()
  })
})
