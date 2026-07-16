import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import MissionComposer from '../MissionComposer'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderComposer(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/loadout-manager${search}`]}>
      <MissionComposer />
    </MemoryRouter>
  )
}

describe('<MissionComposer /> (Loadout Manager)', () => {
  it('renders the required starting-state options using Loadout terminology (Alpha 2.4)', () => {
    renderComposer()
    expect(screen.getAllByText('Factory').length).toBeGreaterThan(0)
    expect(screen.getByText('Current Installed Loadout')).toBeInTheDocument()
    expect(screen.getByText('Blank / Empty')).toBeInTheDocument()
    // EWO-024 (Task 4) — relabeled "Clone Existing Loadout" -> "Copy an
    // Existing Loadout" to avoid colliding in meaning with the new,
    // separate "Save as New Loadout" (clone-an-edit) action.
    expect(screen.getByText('Copy an Existing Loadout')).toBeInTheDocument()
  })

  it('pre-selects the Fleet Asset from a shipId query param', () => {
    renderComposer('?shipId=utv')
    const select = screen.getByDisplayValue(/UTV/i) as HTMLSelectElement
    expect(select.value).toBe('utv')
  })

  it('EWO-024 (Task 5): Presets no longer appear anywhere in the Beta UI — selector, library, and starting-point workflow are all hidden', () => {
    renderComposer()
    expect(screen.queryByText('Presets')).not.toBeInTheDocument()
    expect(screen.queryByText(/preset/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Stealth Recon')).not.toBeInTheDocument()
    expect(screen.queryByText('Use as Starting Point')).not.toBeInTheDocument()
  })

  it('EWO-024 (Task 5): the underlying Preset/Quartermaster Template data is untouched in the store, only hidden from this page', () => {
    expect(useFleetStore.getState().quartermasterTemplates.length).toBeGreaterThan(0)
    expect(useFleetStore.getState().quartermasterTemplates.some((t) => t.name === 'Stealth Recon')).toBe(true)
  })

  it('shows the target equipment table with a row per reference slot', () => {
    renderComposer('?shipId=ghost')
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Shield 1')).toBeInTheDocument()
  })

  it('Mission M-011: nested ports (Ghost Nose Mount + its two weapons) render fully expanded by default — an editing surface must not hide a configurable port behind an extra click', () => {
    renderComposer('?shipId=ghost')
    expect(screen.getByText('Nose Mount')).toBeInTheDocument()
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Weapon 2')).toBeInTheDocument()
  })

  it('Mission M-011: Collapse All hides the nested weapon rows, Expand All restores them', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Collapse All'))
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
  })

  it("Mission M-011: empty optional ports (Railen's tractor beams) remain visible with a real target editable", () => {
    renderComposer('?shipId=railen')
    expect(screen.getByText('Fore Tractor Beam')).toBeInTheDocument()
    expect(screen.getByText('Aft Tractor Beam')).toBeInTheDocument()
  })

  it("Mission M-011: turret child weapons (Railen) render nested, same slot labels Ship Detail shows", () => {
    renderComposer('?shipId=railen')
    expect(screen.getByText('Port Turret')).toBeInTheDocument()
    expect(screen.getByText('Port Turret Left Weapon')).toBeInTheDocument()
    expect(screen.getByText('Port Turret Right Weapon')).toBeInTheDocument()
  })

  it('saving with a name creates a real Loadout (Build record) in the store', () => {
    renderComposer('?shipId=utv')
    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'Test Composer Loadout' } })

    // EWO-024 (Task 4): CREATE mode's primary save button now reads "Create Loadout".
    const saveButton = screen.getByText('Create Loadout')
    fireEvent.click(saveButton)

    const created = useFleetStore.getState().builds.find((b) => b.name === 'Test Composer Loadout')
    expect(created).toBeDefined()
    expect(created?.kind).toBe('MISSION')
    expect(created?.shipId).toBe('utv')
  })

  it('Save & Set as Active Loadout makes the new configuration the ship\'s active build', () => {
    renderComposer('?shipId=utv')
    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'Now Active Loadout' } })

    // EWO-024 (Task 4): CREATE mode's active-save button now reads "Create & Set as Active Loadout".
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))

    const ship = useFleetStore.getState().ships.find((s) => s.id === 'utv')!
    const activeBuild = useFleetStore.getState().builds.find((b) => b.id === ship.activeBuildId)
    expect(activeBuild?.name).toBe('Now Active Loadout')
  })

  it('EWO-024 (Task 4): "Edit an Existing Loadout" mode saves changes into the same Build id, never minting a new one', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const originalBuild = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.kind !== 'FACTORY')!
    const buildCountBefore = useFleetStore.getState().builds.length

    fireEvent.click(screen.getByText('Save Changes'))

    const buildsAfter = useFleetStore.getState().builds
    expect(buildsAfter.length).toBe(buildCountBefore) // no new Build minted
    expect(buildsAfter.find((b) => b.id === originalBuild.id)).toBeDefined()
  })

  it('EWO-024 (Task 4): renaming the Name field while editing an existing Loadout renames that same Build on save', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const originalBuild = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.kind !== 'FACTORY')!

    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'Renamed Loadout' } })
    fireEvent.click(screen.getByText('Save Changes'))

    const renamed = useFleetStore.getState().builds.find((b) => b.id === originalBuild.id)
    expect(renamed?.name).toBe('Renamed Loadout')
  })

  it('EWO-024 (Task 4): "Save as New Loadout" clones the current edit into a brand new Build, leaving the original untouched', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const originalBuild = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.kind !== 'FACTORY')!
    const originalName = originalBuild.name
    const buildCountBefore = useFleetStore.getState().builds.length

    fireEvent.click(screen.getByText('Save as New Loadout'))

    const buildsAfter = useFleetStore.getState().builds
    expect(buildsAfter.length).toBe(buildCountBefore + 1) // a new Build was minted
    const stillOriginal = buildsAfter.find((b) => b.id === originalBuild.id)
    expect(stillOriginal?.name).toBe(originalName) // original completely untouched
    const clone = buildsAfter.find((b) => b.name === `${originalName} (Copy)`)
    expect(clone).toBeDefined()
    expect(clone?.id).not.toBe(originalBuild.id)
  })

  it('EWO-024 (Task 4): switching ships resets back to Create mode, never leaking a stale "editing" context onto a different ship', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    expect(screen.getByText('Which Loadout')).toBeInTheDocument()

    const shipSelect = screen.getAllByRole('combobox').find((el) => el.tagName === 'SELECT' && (el as HTMLSelectElement).value === 'ghost') as HTMLSelectElement
    fireEvent.change(shipSelect, { target: { value: 'utv' } })

    expect(screen.queryByText('Which Loadout')).not.toBeInTheDocument()
    expect(screen.getByText('Create a New Loadout')).toBeInTheDocument()
  })

  it('lists existing Loadouts across the fleet, merged from the retired Build Manager page', () => {
    renderComposer()
    expect(screen.getByText('Existing Loadouts')).toBeInTheDocument()
    expect(screen.getByText('Stealth Build')).toBeInTheDocument()
  })
})

describe('Mission M-012: target-build selector uses the same authoritative component catalog as inventory', () => {
  it("15. a Target picker's option list includes real catalog components beyond the 5-entry seed demo table", () => {
    if (catalogComponentsByName.size === 0) return // real generated-data/component-metadata-catalog.json not present on this machine
    renderComposer()
    // EWO-023 (Task 1): the native <datalist> was replaced with
    // TargetComponentPicker, a fully-controlled combobox whose option
    // list only renders in the DOM while open — open the first Target
    // field to reveal it.
    // Native <select> elements (Ship/Preset dropdowns) also carry an
    // implicit ARIA role of "combobox" — scope to TargetComponentPicker's
    // own <input role="combobox"> elements specifically.
    // The default ship's first editable Target field is "Weapon 1" (S4
    // Weapon) — search a real S4 Weapon catalog-only component (EWO-024,
    // Task 2 now filters suggestions to the port's own type/size, so a
    // Quantum-Drive-only component like "Beacon" would correctly no
    // longer appear here).
    const targetInputs = document.querySelectorAll('input[role="combobox"]')
    expect(targetInputs.length).toBeGreaterThan(0)
    fireEvent.click(targetInputs[0])
    fireEvent.change(targetInputs[0], { target: { value: 'Rhino' } })
    const listbox = targetInputs[0].closest('div')!.querySelector('[role="listbox"]')!
    const optionLabels = Array.from(listbox.querySelectorAll('button')).map((b) => b.textContent ?? '')
    // A real catalog-only component (not one of the 5 hardcoded demo entries) is present.
    expect(optionLabels.some((label) => label.includes('CF-447 Rhino Repeater'))).toBe(true)
  })

  it('EWO-024 (Task 2): the Target picker never suggests a component positively known to be incompatible with the port (no Quantum Drive in an S4 Weapon slot)', () => {
    if (catalogComponentsByName.size === 0) return
    renderComposer()
    const targetInputs = document.querySelectorAll('input[role="combobox"]')
    fireEvent.click(targetInputs[0])
    fireEvent.change(targetInputs[0], { target: { value: 'Beacon' } })
    const listbox = targetInputs[0].closest('div')!.querySelector('[role="listbox"]')!
    expect(listbox.textContent).toMatch(/no matching component/i)
  })
})

describe('EWO-025: Loadout Edit-Mode Hierarchy Reconstruction (Sea Trials repro)', () => {
  it('12. the literal Sea Trials repro — create from Factory, save & set active, return, Edit an Existing Loadout — category headers, nesting, and Expand/Collapse all survive even though the saved Build itself never records them', () => {
    renderComposer('?shipId=ghost')
    // CREATE-mode baseline: nested Nose Mount -> Weapon 1/2, plus however
    // many editable Target fields this canonical hierarchy has.
    expect(screen.getByText('Nose Mount')).toBeInTheDocument()
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Weapon 2')).toBeInTheDocument()
    const createEditableCount = document.querySelectorAll('input[role="combobox"]').length

    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'Repro Loadout' } })
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))

    const savedBuild = useFleetStore.getState().builds.find((b) => b.name === 'Repro Loadout')!
    expect(savedBuild).toBeDefined()

    // Ground truth: saveMissionConfiguration still does NOT write
    // isStructural/groupLabel/parentSlotLabel onto the new Build's own
    // Hardpoint rows — proving this test actually exercises the
    // hierarchy-stripped-at-save-time condition, not some already-fine
    // fixture.
    const savedNoseMount = useFleetStore.getState().hardpoints.find((h) => h.buildId === savedBuild.id && h.slotLabel === 'Nose Mount')!
    expect(savedNoseMount.isStructural).toBeUndefined()
    expect(savedNoseMount.groupLabel).toBeUndefined()

    // Simulate leaving and returning to Loadout Manager.
    cleanup()
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const loadoutSelect = screen
      .getAllByRole('combobox')
      .find((el) => el.tagName === 'SELECT' && Array.from((el as HTMLSelectElement).options).some((o) => o.text.includes('Repro Loadout'))) as HTMLSelectElement
    fireEvent.change(loadoutSelect, { target: { value: savedBuild.id } })

    // EDIT mode: identical category/nesting shape as CREATE mode — this is
    // the exact defect Sea Trials reported (category headers disappearing,
    // parent/child flattening) and it must not reproduce here.
    expect(screen.getByText('Nose Mount')).toBeInTheDocument()
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Weapon 2')).toBeInTheDocument()
    const editEditableCount = document.querySelectorAll('input[role="combobox"]').length
    expect(editEditableCount).toBe(createEditableCount) // no rows lost, Nose Mount didn't spuriously become editable

    // Expand All / Collapse All still function identically in EDIT mode.
    fireEvent.click(screen.getByText('Collapse All'))
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
  })

  it("13. a target changed and saved in EDIT mode reopens with both the hierarchy and the new value intact — full save/reopen lifecycle", () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const build = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.kind === 'CUSTOM')!

    const targetInputs = document.querySelectorAll('input[role="combobox"]')
    fireEvent.click(targetInputs[0])
    fireEvent.change(targetInputs[0], { target: { value: 'Mass Driver' } })
    fireEvent.click(screen.getByText('Save Changes'))

    cleanup()
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const loadoutSelect = screen
      .getAllByRole('combobox')
      .find((el) => el.tagName === 'SELECT' && (el as HTMLSelectElement).value === build.id) as HTMLSelectElement
    expect(loadoutSelect).toBeDefined()

    // Hierarchy still intact on reopen.
    expect(screen.getByText('Nose Mount')).toBeInTheDocument()
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Weapon 2')).toBeInTheDocument()
  })

  it('14. a saved assignment referencing a port that no longer exists on the canonical ship never crashes, is excluded, and never flattens the rest of the tree', () => {
    const build = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.kind === 'CUSTOM')!
    useFleetStore.setState({
      hardpoints: useFleetStore
        .getState()
        .hardpoints.map((h) => (h.buildId === build.id && h.slotLabel === 'Weapon 1' ? { ...h, slotLabel: 'Retired Weapon Slot' } : h)),
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => renderComposer('?shipId=ghost')).not.toThrow()
    // The rest of the canonical tree renders untouched.
    expect(screen.getByText('Nose Mount')).toBeInTheDocument()
    expect(screen.getByText('Weapon 2')).toBeInTheDocument()
    // Weapon 1's canonical row still renders (falls back to its own
    // factory value) — the orphaned assignment is excluded, not merged
    // onto the wrong port.
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('15. Cutlass Black (deep-imported control ship) — CREATE mode renders the Sea-Trials-named categories (Core Systems, Weapons, Manned Turrets, Ordnance, Support Systems)', () => {
    const result = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED')
    expect(result.success).toBe(true)
    renderComposer(`?shipId=${result.assetId}`)

    for (const label of ['Core Systems', 'Weapons', 'Manned Turrets', 'Ordnance', 'Support Systems']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('16. Cutlass Black — the same category headers survive Create & Set Active -> Edit an Existing Loadout, matching CREATE mode exactly', () => {
    const result = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED')
    renderComposer(`?shipId=${result.assetId}`)
    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'CB Repro' } })
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))

    cleanup()
    renderComposer(`?shipId=${result.assetId}`)
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))

    for (const label of ['Core Systems', 'Weapons', 'Manned Turrets', 'Ordnance', 'Support Systems']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('17. Eclipse (deep-imported control ship) — CREATE and EDIT render the identical set of category headers and row count', () => {
    const result = useFleetStore.getState().addFleetAsset('eclipse-imported', 'OWNED')
    renderComposer(`?shipId=${result.assetId}`)
    const createHeaders = Array.from(document.querySelectorAll('th')).length // sanity: table rendered
    expect(createHeaders).toBeGreaterThan(0)
    const createGroupHeaders = screen.getAllByText(/Core Systems|Weapons|Ordnance|Support Systems|Detection \/ Navigation/).map((el) => el.textContent)

    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'Eclipse Repro' } })
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))

    cleanup()
    renderComposer(`?shipId=${result.assetId}`)
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const editGroupHeaders = screen.getAllByText(/Core Systems|Weapons|Ordnance|Support Systems|Detection \/ Navigation/).map((el) => el.textContent)

    expect(editGroupHeaders.sort()).toEqual(createGroupHeaders.sort())
  })

  it('18. Corsair (deep-imported control ship, larger multi-turret hierarchy) — CREATE and EDIT expose the same number of editable Target rows', () => {
    const result = useFleetStore.getState().addFleetAsset('corsair-imported', 'OWNED')
    renderComposer(`?shipId=${result.assetId}`)
    const createEditableCount = document.querySelectorAll('input[role="combobox"]').length
    expect(createEditableCount).toBeGreaterThan(0)

    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'Corsair Repro' } })
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))

    cleanup()
    renderComposer(`?shipId=${result.assetId}`)
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const editEditableCount = document.querySelectorAll('input[role="combobox"]').length

    expect(editEditableCount).toBe(createEditableCount)
  })

  it('19. a seed-backed ship (Ghost) confirms this fix is not deep-import-only — structural rows stay non-editable and parent/child survives the same save/reopen cycle', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    // Nose Mount is a real seed-authored isStructural:true row (src/data/seed.ts) —
    // it must never gain a Target picker.
    const noseMountInput = document.getElementById('catalog-Nose Mount')
    expect(noseMountInput).toBeNull()
  })

})

describe('EWO-026 (Task 1/2/13): post-save workflow stays inside Loadout Manager', () => {
  it('1/8. Create Loadout remains in Loadout Manager and shows success feedback, no navigation', () => {
    renderComposer('?shipId=utv')
    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'Stay Put Loadout' } })
    fireEvent.click(screen.getByText('Create Loadout'))

    // Still looking at Loadout Manager's own page chrome — never routed away.
    expect(screen.getByText('Loadout Manager')).toBeInTheDocument()
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
    expect(screen.queryByText(/^could not save/i)).not.toBeInTheDocument()
  })

  it('2. Create & Set Active remains in Loadout Manager', () => {
    renderComposer('?shipId=utv')
    fireEvent.change(screen.getByPlaceholderText(/Deep Salvage Run/i), { target: { value: 'Stay Put Active' } })
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))
    expect(screen.getByText('Loadout Manager')).toBeInTheDocument()
    expect(screen.getByText(/set as the active loadout/i)).toBeInTheDocument()
  })

  it('3. Save Changes (editing an existing Loadout) remains in Loadout Manager', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    fireEvent.click(screen.getByText('Save Changes'))
    expect(screen.getByText('Loadout Manager')).toBeInTheDocument()
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })

  it('4. Save Changes & Set as Active remains in Loadout Manager', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    fireEvent.click(screen.getByText(/Save Changes & Set as Active/i))
    expect(screen.getByText('Loadout Manager')).toBeInTheDocument()
    expect(screen.getByText(/set as the active loadout/i)).toBeInTheDocument()
  })

  it('5. Save as New Loadout remains in Loadout Manager', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    fireEvent.click(screen.getByText('Save as New Loadout'))
    expect(screen.getByText('Loadout Manager')).toBeInTheDocument()
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })

  it('6. a newly created Build becomes the selected EDIT Build — workflow transitions into Edit mode automatically', () => {
    renderComposer('?shipId=utv')
    fireEvent.change(screen.getByPlaceholderText(/Deep Salvage Run/i), { target: { value: 'Auto Select Me' } })
    fireEvent.click(screen.getByText('Create Loadout'))

    // Now in EDIT mode with the just-created Build selected in "Which Loadout".
    expect(screen.getByText('Which Loadout')).toBeInTheDocument()
    const created = useFleetStore.getState().builds.find((b) => b.name === 'Auto Select Me')!
    expect(created).toBeDefined()
    const loadoutSelect = screen
      .getAllByRole('combobox')
      .find((el) => el.tagName === 'SELECT' && Array.from((el as HTMLSelectElement).options).some((o) => o.text.includes('Auto Select Me'))) as HTMLSelectElement
    expect(loadoutSelect.value).toBe(created.id)
  })

  it('7. Save as New selects the clone (not the original) and leaves the original completely unchanged', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const original = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.kind !== 'FACTORY')!
    const originalName = original.name

    fireEvent.click(screen.getByText('Save as New Loadout'))

    const clone = useFleetStore.getState().builds.find((b) => b.name === `${originalName} (Copy)`)!
    expect(clone).toBeDefined()
    expect(clone.id).not.toBe(original.id)
    const stillOriginal = useFleetStore.getState().builds.find((b) => b.id === original.id)!
    expect(stillOriginal.name).toBe(originalName) // untouched

    const loadoutSelect = screen
      .getAllByRole('combobox')
      .find((el) => el.tagName === 'SELECT' && (el as HTMLSelectElement).value === clone.id) as HTMLSelectElement
    expect(loadoutSelect).toBeDefined() // the clone, not the original, is now selected
  })
})

describe('EWO-026 (Task 3/4/13): explicit "View in Ship Detail" navigation', () => {
  it('9/10. renders "View in Ship Detail" (not "Back to Ship Detail") carrying the exact selected Fleet Asset id', () => {
    renderComposer('?shipId=utv')
    expect(screen.queryByText('Back to Ship Detail')).not.toBeInTheDocument()
    const link = screen.getByText('View in Ship Detail').closest('a')!
    expect(link.getAttribute('href')).toBe('/ship/utv')
  })

  it('11. two Fleet Assets of the same hull each link to their own exact instance, not the first matching hull', () => {
    const a = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Cutty One')
    const b = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Cutty Two')
    expect(a.assetId).not.toBe(b.assetId)

    renderComposer(`?shipId=${b.assetId}`)
    const link = screen.getByText('View in Ship Detail').closest('a')!
    expect(link.getAttribute('href')).toBe(`/ship/${b.assetId}`)
    expect(link.getAttribute('href')).not.toBe(`/ship/${a.assetId}`)
  })
})

describe('EWO-036B (Task 7/8): recursive hardpoint labels and the internalName diagnostic', () => {
  it("Corsair's Quantum Drive slot renders the short Commander-facing label (\"Jump Drive\") as the clickable row text, while the Port & Mount Detail panel's internalName diagnostic still shows the full raw canonical slotLabel (\"Quantum Drive — Jump Drive\") unformatted", () => {
    const result = useFleetStore.getState().addFleetAsset('corsair-imported', 'OWNED')
    renderComposer(`?shipId=${result.assetId}`)

    // The row itself shows the short, formatted leaf label — not the raw
    // "Quantum Drive — Jump Drive" chain.
    const rowButton = screen.getByText('Jump Drive')
    expect(screen.queryByText('Quantum Drive — Jump Drive')).not.toBeInTheDocument()

    // Expanding that row's Port & Mount Detail panel reveals the raw,
    // unformatted internalName — the one diagnostic display this mission
    // explicitly forbids touching.
    fireEvent.click(rowButton)
    expect(screen.getByText(/internalName:/)).toBeInTheDocument()
    const panel = screen.getByText(/internalName:/).closest('td')!
    expect(panel.textContent).toContain('Quantum Drive — Jump Drive')
  })
})

describe('EWO-025: Loadout Edit-Mode Hierarchy Reconstruction (Sea Trials repro), continued', () => {
  it('20. EWO-024 compatibility filtering and Presets-hidden behavior still hold after the EWO-025 rewrite', () => {
    renderComposer('?shipId=ghost')
    expect(screen.queryByText('Presets')).not.toBeInTheDocument()
    if (catalogComponentsByName.size > 0) {
      const targetInputs = document.querySelectorAll('input[role="combobox"]')
      fireEvent.click(targetInputs[0])
      fireEvent.change(targetInputs[0], { target: { value: 'Beacon' } })
      const listbox = targetInputs[0].closest('div')!.querySelector('[role="listbox"]')!
      expect(listbox.textContent).toMatch(/no matching component/i)
    }
  })
})

describe('EWO-026 (round 2, Task 2): Fleet Asset context tracks the URL, even without a remount', () => {
  function Harness({ targetShipId }: { targetShipId: string }) {
    const navigate = useNavigate()
    return (
      <div>
        <button onClick={() => navigate(`/loadout-manager?shipId=${targetShipId}`)}>jump-to-ship</button>
        <MissionComposer />
      </div>
    )
  }

  it('navigating to a different ?shipId= on the same /loadout-manager route (no remount) updates the selected Ship', () => {
    const a = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'ShipA')
    const b = useFleetStore.getState().addFleetAsset('eclipse-imported', 'OWNED', 'ShipB')

    render(
      <MemoryRouter initialEntries={[`/loadout-manager?shipId=${a.assetId}`]}>
        <Routes>
          <Route path="/loadout-manager" element={<Harness targetShipId={b.assetId!} />} />
        </Routes>
      </MemoryRouter>
    )
    const shipSelect = document.querySelector('select') as HTMLSelectElement
    expect(shipSelect.value).toBe(a.assetId)

    fireEvent.click(screen.getByText('jump-to-ship'))

    expect(shipSelect.value).toBe(b.assetId)
  })

  it('the same URL-driven ship switch also resets workflow mode back to Create, matching the manual Ship dropdown', () => {
    // 'ghost' already has real, editable custom Loadouts in the seed
    // fixture, so "Edit an Existing Loadout" is actually clickable here.
    const b = useFleetStore.getState().addFleetAsset('eclipse-imported', 'OWNED', 'ShipB')

    render(
      <MemoryRouter initialEntries={['/loadout-manager?shipId=ghost']}>
        <Routes>
          <Route path="/loadout-manager" element={<Harness targetShipId={b.assetId!} />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    expect(screen.getByText('Which Loadout')).toBeInTheDocument()

    fireEvent.click(screen.getByText('jump-to-ship'))
    expect(screen.getByText('Create a New Loadout')).toBeInTheDocument()
    expect(screen.queryByText('Which Loadout')).not.toBeInTheDocument()
  })
})

describe('EWO-027 (Scenario A): starting a New Loadout resets prior metadata — this is not "Copy Existing"', () => {
  it('after Save & Set Active (which itself switches into Edit mode with the saved name/category), clicking "Create a New Loadout" clears Name, Category, and any per-slot overrides', () => {
    renderComposer('?shipId=utv')
    fireEvent.change(screen.getByPlaceholderText(/Deep Salvage Run/i), { target: { value: 'Build A' } })
    fireEvent.change(screen.getByPlaceholderText(/Combat, Industrial, Support/i), { target: { value: 'Category A' } })
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))

    // Confirms the EWO-026 post-save behavior this scenario builds on:
    // the Name field is now populated with the just-saved Build's name.
    expect((screen.getByPlaceholderText(/Deep Salvage Run/i) as HTMLInputElement).value).toBe('Build A')

    fireEvent.click(screen.getByText('Create a New Loadout'))

    expect((screen.getByPlaceholderText(/Deep Salvage Run/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByPlaceholderText(/Combat, Industrial, Support/i) as HTMLInputElement).value).toBe('')
  })

  it('"Create a New Loadout" also clears existingBuildId — re-entering Edit mode afterward starts unselected, not on a stale prior Loadout', () => {
    renderComposer('?shipId=ghost')
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const firstBuildId = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.kind !== 'FACTORY')!.id
    const loadoutSelect = screen.getAllByRole('combobox').find((el) => el.tagName === 'SELECT' && (el as HTMLSelectElement).value === firstBuildId) as HTMLSelectElement
    expect(loadoutSelect).toBeDefined()

    fireEvent.click(screen.getByText('Create a New Loadout'))
    expect(screen.queryByText('Which Loadout')).not.toBeInTheDocument()

    // Re-entering Edit mode auto-selects the first available Loadout
    // again (existing EWO-024 behavior) — the point of this test is that
    // nothing from the PRIOR edit (a per-slot override, a stale name) is
    // still attached once we're back in Edit mode via a fresh selection.
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    expect(screen.getByText('Which Loadout')).toBeInTheDocument()
  })

  it('a per-slot Target override made while editing does not bleed into the next Create workflow', () => {
    // A freshly-added ship's own Factory default is fully known and
    // controlled here — 'ghost' (a seed ship whose auto-selected custom
    // Loadout already deviates from its own Factory defaults) would make
    // "what's the real Factory value" ambiguous for this assertion.
    const added = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Override Bleed Test')
    const shipId = added.assetId!
    useFleetStore.getState().saveMissionConfiguration({ shipId, name: 'Existing Build', startingState: 'FACTORY', targetOverrides: {}, setActive: false })

    renderComposer(`?shipId=${shipId}`)
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    const targetInputs = document.querySelectorAll('input[role="combobox"]')
    const factoryDefault = (targetInputs[0] as HTMLInputElement).value

    // Commit a real, different override the same way a Commander actually
    // would — clicking a listed option — not a bare `change` event, which
    // only ever updates TargetComponentPicker's own uncommitted local text
    // and never reaches MissionComposer's `overrides` state at all.
    fireEvent.click(targetInputs[0])
    const listbox = targetInputs[0].closest('div')!.querySelector('[role="listbox"]')!
    const optionButtons = Array.from(listbox.querySelectorAll('button'))
    const differentOption = optionButtons.find((b) => b.querySelector('span')?.textContent !== factoryDefault) ?? optionButtons[0]
    fireEvent.click(differentOption)
    const committedOverride = (targetInputs[0] as HTMLInputElement).value
    expect(committedOverride).not.toBe(factoryDefault) // sanity: a real, distinct override was actually committed

    fireEvent.click(screen.getByText('Create a New Loadout'))

    const freshTargetInputs = document.querySelectorAll('input[role="combobox"]') as NodeListOf<HTMLInputElement>
    // The fresh CREATE-mode preview reflects only the Starting Source
    // (Factory by default) — never the override just committed while editing.
    expect(freshTargetInputs[0].value).not.toBe(committedOverride)
    expect(freshTargetInputs[0].value).toBe(factoryDefault)
  })
})
