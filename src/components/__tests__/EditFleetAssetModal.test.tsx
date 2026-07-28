import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
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
    expect(screen.queryByText(/permanently|cannot be undone|destructive/i)).not.toBeInTheDocument()
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
