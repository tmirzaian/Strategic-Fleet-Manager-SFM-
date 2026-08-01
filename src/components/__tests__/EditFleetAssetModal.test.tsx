import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EditFleetAssetModal from '../EditFleetAssetModal'
import { useFleetStore } from '../../store/useFleetStore'
import { useShipImageCacheStore } from '../../store/shipImageCache'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
  useShipImageCacheStore.setState({ entries: {} })
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (file: File) => {
      if (file.name.includes('corrupt')) throw new Error('bad image data')
      return { close: () => {} } as unknown as ImageBitmap
    })
  )
})
afterEach(() => cleanup())

function makeFile(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type })
}

function renderModalFor(displayName: string) {
  const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === displayName)!
  const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
  const ship = useFleetStore.getState().ships.find((s) => s.id === added.assetId)!
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <EditFleetAssetModal ship={ship} onClose={onClose} />
    </MemoryRouter>
  )
  return { ship, onClose }
}

describe('UX-005A (Deliverable 4): EditFleetAssetModal — Ship Image section', () => {
  it('renders a Choose Custom Image control and no Restore Default when no custom image is set', () => {
    renderModalFor('Gladius')
    expect(screen.getByText('Choose Custom Image')).toBeInTheDocument()
    expect(screen.queryByText('Restore Default')).not.toBeInTheDocument()
  })

  it('choosing a valid image stores it, persists the reference, and applies immediately — without clicking Save Changes', async () => {
    const { ship } = renderModalFor('Gladius')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('black-livery.png', 'image/png')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === ship.id)
      expect(asset?.customImageRef).toBe(`ships/${ship.id}.png`)
    })
    // Applied immediately — no "Save Changes" click happened.
    expect(screen.queryByText('Save Changes')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Restore Default')).toBeInTheDocument())
  })

  it('rejects an unsupported file type with a clear inline message and does not touch the store', async () => {
    const { ship } = renderModalFor('Gladius')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('notes.txt', 'text/plain')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText(/unsupported/i)).toBeInTheDocument())
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === ship.id)
    expect(asset?.customImageRef).toBeUndefined()
  })

  it('rejects a file that cannot be decoded as an image with a clear inline message', async () => {
    renderModalFor('Gladius')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('corrupt-file.png', 'image/png')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText(/couldn't be read/i)).toBeInTheDocument())
  })

  it('Restore Default clears the reference and disappears again, official image becomes visible', async () => {
    const { ship } = renderModalFor('Gladius')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('a.png', 'image/png')] } })
    await waitFor(() => expect(screen.getByText('Restore Default')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Restore Default'))

    await waitFor(() => {
      const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === ship.id)
      expect(asset?.customImageRef).toBeUndefined()
    })
    await waitFor(() => expect(screen.queryByText('Restore Default')).not.toBeInTheDocument())
  })

  it('Deliverable 5: setting a custom image for one ship does not affect a second ship of the same model', async () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const addedA = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Gladius A')
    const addedB = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Gladius B')
    const shipA = useFleetStore.getState().ships.find((s) => s.id === addedA.assetId)!

    render(
      <MemoryRouter>
        <EditFleetAssetModal ship={shipA} onClose={vi.fn()} />
      </MemoryRouter>
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('a.png', 'image/png')] } })

    await waitFor(() => {
      const assetA = useFleetStore.getState().fleetAssets.find((a) => a.id === addedA.assetId)
      expect(assetA?.customImageRef).toBeDefined()
    })
    const assetB = useFleetStore.getState().fleetAssets.find((a) => a.id === addedB.assetId)
    expect(assetB?.customImageRef).toBeUndefined()
  })

  it('other fields (Nickname/Ownership/Fleet Profile) remain deferred to Save Changes — unaffected by the image section', () => {
    const { onClose } = renderModalFor('Gladius')
    fireEvent.change(screen.getByPlaceholderText('e.g. Escort'), { target: { value: 'Vanguard' } })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Save Changes'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('SW-015C (Deliverable 2/3): EditFleetAssetModal — Fleet Registry section (active vessel)', () => {
  it('shows Status: Active Service and a Retire Vessel control, never the word "Delete"', () => {
    renderModalFor('Gladius')
    expect(screen.getByText('Status: Active Service')).toBeInTheDocument()
    expect(screen.getByText('Retire Vessel')).toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
  })

  it('Deliverable 3: clicking Retire Vessel opens a confirmation with the exact required copy, no typed-DELETE input', () => {
    const { ship } = renderModalFor('Gladius')
    fireEvent.click(screen.getByText('Retire Vessel'))
    expect(screen.getByText(`Retire "${ship.name}" from active service?`)).toBeInTheDocument()
    expect(screen.getByText(/removed from active fleet operations, readiness, priority, demand, and reservation planning/)).toBeInTheDocument()
    expect(screen.getByText(/will be preserved for future recommissioning/)).toBeInTheDocument()
    expect(document.querySelector('input[type="text"]')).not.toBeInTheDocument()
  })

  it('Cancel in the confirmation dialog does not retire the vessel', () => {
    const { ship } = renderModalFor('Gladius')
    fireEvent.click(screen.getByText('Retire Vessel'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === ship.id)?.lifecycleStatus).toBe('active')
  })

  it('confirming Retire Vessel retires the vessel and closes the modal', () => {
    const { ship, onClose } = renderModalFor('Gladius')
    fireEvent.click(screen.getByText('Retire Vessel'))
    // Three "Retire Vessel" text matches exist once the dialog is open
    // (the trigger button, the dialog's own eyebrow label, and the
    // dialog's confirm button) — scoped to buttons only to reach the
    // confirm button specifically.
    const retireButtons = screen.getAllByRole('button', { name: 'Retire Vessel' })
    fireEvent.click(retireButtons[retireButtons.length - 1])
    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === ship.id)?.lifecycleStatus).toBe('retired')
    expect(onClose).toHaveBeenCalled()
  })

  it('Deliverable 6: previews the releasable reservation count in the confirmation when applicable', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({
      missionConfigurationId: 'ghost-escort',
      fleetAssetId: 'ghost',
      targetSlotLabel: 'Left Shield Generator',
      componentName: 'FR-66',
    })
    expect(reserve.success).toBe(true)
    const ghost = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!

    render(
      <MemoryRouter>
        <EditFleetAssetModal ship={ghost} onClose={vi.fn()} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Retire Vessel'))
    expect(screen.getByText(/Retiring this vessel will release 1 component reservation\./)).toBeInTheDocument()
  })

  it('does not show a reservation-release line when there is nothing to release', () => {
    renderModalFor('Gladius')
    fireEvent.click(screen.getByText('Retire Vessel'))
    expect(screen.queryByText(/will release/)).not.toBeInTheDocument()
  })
})

describe('SW-015C (Deliverable 8): EditFleetAssetModal — Fleet Registry section (retired vessel)', () => {
  function renderRetiredModal() {
    const id = addGladius()
    useFleetStore.getState().retireFleetAsset(id)
    const ship = useFleetStore.getState().ships.find((s) => s.id === id)!
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <EditFleetAssetModal ship={ship} onClose={onClose} />
      </MemoryRouter>
    )
    return { ship, onClose }
  }
  function addGladius() {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    return useFleetStore.getState().addFleetAsset(def.id, 'OWNED').assetId!
  }

  it('shows Status: Retired and a Return to Active Service control', () => {
    renderRetiredModal()
    expect(screen.getByText('Status: Retired')).toBeInTheDocument()
    expect(screen.getByText('Return to Active Service')).toBeInTheDocument()
    expect(screen.queryByText('Retire Vessel')).not.toBeInTheDocument()
  })

  it('the confirmation uses no destructive-warning language', () => {
    renderRetiredModal()
    fireEvent.click(screen.getByText('Return to Active Service'))
    // Scoped to the recommission confirmation dialog itself — the always-
    // visible Danger Zone section (EWO-097) legitimately uses this exact
    // language elsewhere on the same page, behind this dialog.
    const dialogHeading = screen.getByText(/to active service\?/)
    const dialog = dialogHeading.closest('.panel') as HTMLElement
    expect(within(dialog).queryByText(/permanently|cannot be undone|destructive/i)).not.toBeInTheDocument()
  })

  it('confirming recommissions the vessel and the section updates in place (modal stays open)', () => {
    const { ship, onClose } = renderRetiredModal()
    fireEvent.click(screen.getByText('Return to Active Service'))
    fireEvent.click(screen.getAllByText('Return to Active Service')[1])
    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === ship.id)?.lifecycleStatus).toBe('active')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Status: Active Service')).toBeInTheDocument()
  })
})

/**
 * EWO-097 — "Retired Fleet Asset Permanent Purge," Danger Zone UI. Store-
 * level purge semantics are covered exhaustively in
 * src/store/__tests__/fleetAssetPurge.test.ts — this file covers only
 * what's specific to the UI: visibility gating (19), the typed-name
 * safeguard (17), Cancel performing zero writes (16), and a successful
 * purge closing the modal.
 */
describe('EWO-097: EditFleetAssetModal — Danger Zone', () => {
  function addGladius(nickname?: string) {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    return useFleetStore.getState().addFleetAsset(def.id, 'OWNED', nickname).assetId!
  }
  function renderRetiredModal(nickname?: string) {
    const id = addGladius(nickname)
    useFleetStore.getState().retireFleetAsset(id)
    const ship = useFleetStore.getState().ships.find((s) => s.id === id)!
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <EditFleetAssetModal ship={ship} onClose={onClose} />
      </MemoryRouter>
    )
    return { ship, onClose }
  }

  it('19. never renders the Danger Zone or a Purge control for an active vessel', () => {
    renderModalFor('Gladius')
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument()
    expect(screen.queryByText('Purge Fleet Asset')).not.toBeInTheDocument()
  })

  it('19. renders the Danger Zone and Purge Fleet Asset control for a retired vessel', () => {
    renderRetiredModal()
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
    expect(screen.getByText('Purge Fleet Asset')).toBeInTheDocument()
  })

  it('opens a confirmation with the required copy: ship name, permanence, component-return, and recovery-via-snapshot language', () => {
    const { ship } = renderRetiredModal()
    fireEvent.click(screen.getByText('Purge Fleet Asset'))
    expect(screen.getByText(`Permanently purge "${ship.name}"?`)).toBeInTheDocument()
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument()
    expect(screen.getByText(/installed owned component.*returned to Hangar Inventory/)).toBeInTheDocument()
    expect(screen.getByText(/Recovery requires importing or restoring an earlier fleet snapshot/)).toBeInTheDocument()
  })

  it('16. Cancel in the purge confirmation performs zero writes and leaves the vessel fully intact', () => {
    const { ship } = renderRetiredModal()
    fireEvent.click(screen.getByText('Purge Fleet Asset'))
    fireEvent.change(screen.getByPlaceholderText('Type the ship name to confirm'), { target: { value: ship.name } })
    fireEvent.click(screen.getByText('Cancel'))

    expect(useFleetStore.getState().fleetAssets.some((a) => a.id === ship.id)).toBe(true)
    expect(useFleetStore.getState().ships.some((s) => s.id === ship.id)).toBe(true)
  })

  it("17. the confirm button stays disabled — and a click performs zero writes — until the typed text exactly matches the ship's name", () => {
    const { ship } = renderRetiredModal()
    fireEvent.click(screen.getByText('Purge Fleet Asset'))
    const confirmButtons = screen.getAllByRole('button', { name: /Purge Fleet Asset/ })
    const confirmButton = confirmButtons[confirmButtons.length - 1]
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('Type the ship name to confirm'), { target: { value: ship.name.slice(0, -1) } })
    expect(confirmButton).toBeDisabled()
    fireEvent.click(confirmButton)
    expect(useFleetStore.getState().fleetAssets.some((a) => a.id === ship.id)).toBe(true)

    fireEvent.change(screen.getByPlaceholderText('Type the ship name to confirm'), { target: { value: ship.name } })
    expect(confirmButton).not.toBeDisabled()
  })

  /**
   * EWO-097 Amendment — "Canonical Purge Confirmation Phrase." Commander
   * field testing found typing the visually-displayed text (uppercased
   * by CSS inheritance) did not match the underlying, case-sensitive
   * comparison. These tests cover the fix: natural-case display (no CSS
   * `uppercase` reaching the phrase itself), case-insensitive
   * acceptance, and nickname-vs-canonical-name precedence.
   */
  it('1. no nickname: the phrase span is exempted from the label\'s uppercase styling (natural capitalization preserved)', () => {
    const { ship } = renderRetiredModal()
    fireEvent.click(screen.getByText('Purge Fleet Asset'))
    const phraseSpan = screen.getByText(ship.name, { selector: 'span' })
    expect(phraseSpan.className).toContain('normal-case')
  })

  it('1. no nickname: SABRE-style all-caps and all-lowercase entries are both accepted (case-insensitive against the true, un-transformed name)', () => {
    const { ship } = renderRetiredModal()
    fireEvent.click(screen.getByText('Purge Fleet Asset'))
    const confirmButtons = screen.getAllByRole('button', { name: /Purge Fleet Asset/ })
    const confirmButton = confirmButtons[confirmButtons.length - 1]
    const input = screen.getByPlaceholderText('Type the ship name to confirm')

    fireEvent.change(input, { target: { value: ship.name.toUpperCase() } })
    expect(confirmButton).not.toBeDisabled()
    fireEvent.change(input, { target: { value: ship.name.toLowerCase() } })
    expect(confirmButton).not.toBeDisabled()
  })

  it('2. a nickname is used as the confirmation phrase instead of the canonical model name, case-insensitively, and the canonical name no longer satisfies it', () => {
    const { ship } = renderRetiredModal('test1')
    fireEvent.click(screen.getByText('Purge Fleet Asset'))
    expect(screen.getByText(`Permanently purge "test1"?`)).toBeInTheDocument()
    const confirmButtons = screen.getAllByRole('button', { name: /Purge Fleet Asset/ })
    const confirmButton = confirmButtons[confirmButtons.length - 1]
    const input = screen.getByPlaceholderText('Type the ship name to confirm')

    fireEvent.change(input, { target: { value: 'TEST1' } })
    expect(confirmButton).not.toBeDisabled()

    // The canonical model name ("Gladius") no longer satisfies
    // confirmation once a nickname is the displayed/expected phrase.
    fireEvent.change(input, { target: { value: 'Gladius' } })
    expect(confirmButton).toBeDisabled()
    void ship
  })

  it('3. leading/trailing whitespace in the typed value is ignored', () => {
    const { ship } = renderRetiredModal()
    fireEvent.click(screen.getByText('Purge Fleet Asset'))
    const confirmButtons = screen.getAllByRole('button', { name: /Purge Fleet Asset/ })
    const confirmButton = confirmButtons[confirmButtons.length - 1]
    fireEvent.change(screen.getByPlaceholderText('Type the ship name to confirm'), { target: { value: `  ${ship.name}  ` } })
    expect(confirmButton).not.toBeDisabled()
  })

  it('4. a partial or extended match is rejected, even case-insensitively', () => {
    const { ship } = renderRetiredModal()
    fireEvent.click(screen.getByText('Purge Fleet Asset'))
    const confirmButtons = screen.getAllByRole('button', { name: /Purge Fleet Asset/ })
    const confirmButton = confirmButtons[confirmButtons.length - 1]
    const input = screen.getByPlaceholderText('Type the ship name to confirm')

    fireEvent.change(input, { target: { value: ship.name.slice(0, 3) } })
    expect(confirmButton).toBeDisabled()
    fireEvent.change(input, { target: { value: `${ship.name}1` } })
    expect(confirmButton).toBeDisabled()
  })

  it('6/7. button enablement and the store action\'s own validation never disagree — a directly-invoked purge with a mismatched phrase is refused just like the UI would refuse it', () => {
    const { ship } = renderRetiredModal()
    const result = useFleetStore.getState().purgeFleetAsset(ship.id, ship.name.slice(0, 3))
    expect(result.success).toBe(false)
    expect(useFleetStore.getState().ships.some((s) => s.id === ship.id)).toBe(true)
  })

  it('a completed purge (typed name matches) removes the vessel and closes the modal', async () => {
    const { ship, onClose } = renderRetiredModal('Purge Target')
    fireEvent.click(screen.getByText('Purge Fleet Asset'))
    fireEvent.change(screen.getByPlaceholderText('Type the ship name to confirm'), { target: { value: ship.name } })
    const confirmButtons = screen.getAllByRole('button', { name: /Purge Fleet Asset/ })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(useFleetStore.getState().fleetAssets.some((a) => a.id === ship.id)).toBe(false)
    expect(useFleetStore.getState().ships.some((s) => s.id === ship.id)).toBe(false)
  })
})
