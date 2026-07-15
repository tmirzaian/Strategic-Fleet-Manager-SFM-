import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
