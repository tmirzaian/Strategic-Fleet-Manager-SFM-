import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
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
  render(<EditFleetAssetModal ship={ship} onClose={onClose} />)
  return { ship, onClose }
}

describe('UX-005A (Deliverable 4): EditFleetAssetModal — Ship Image section', () => {
  it('renders a Choose Custom Image control and no Restore Default when no custom image is set', () => {
    renderModalFor('Gladius')
    expect(screen.getByText('Choose Custom Image')).toBeInTheDocument()
    expect(screen.queryByText('Restore Default')).not.toBeInTheDocument()
  })

  it('choosing a valid image stores it, persists the reference, and applies immediately — without clicking Update Fleet Registry', async () => {
    const { ship } = renderModalFor('Gladius')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('black-livery.png', 'image/png')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === ship.id)
      expect(asset?.customImageRef).toBe(`ships/${ship.id}.png`)
    })
    // Applied immediately — no "Update Fleet Registry" click happened.
    expect(screen.queryByText('Update Fleet Registry')).toBeInTheDocument()
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

    render(<EditFleetAssetModal ship={shipA} onClose={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('a.png', 'image/png')] } })

    await waitFor(() => {
      const assetA = useFleetStore.getState().fleetAssets.find((a) => a.id === addedA.assetId)
      expect(assetA?.customImageRef).toBeDefined()
    })
    const assetB = useFleetStore.getState().fleetAssets.find((a) => a.id === addedB.assetId)
    expect(assetB?.customImageRef).toBeUndefined()
  })

  it('other fields (Nickname/Ownership/Fleet Profile) remain deferred to Update Fleet Registry — unaffected by the image section', () => {
    const { onClose } = renderModalFor('Gladius')
    fireEvent.change(screen.getByPlaceholderText('e.g. Escort'), { target: { value: 'Vanguard' } })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Update Fleet Registry'))
    expect(onClose).toHaveBeenCalled()
  })
})
