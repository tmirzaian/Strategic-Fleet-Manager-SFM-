import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { useFleetStore } from '../../store/useFleetStore'
import { useShipImageCacheStore } from '../../store/shipImageCache'
import { useResolvedShipImage } from '../useResolvedShipImage'
import { storeShipImage } from '../shipImageStorage'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
  useShipImageCacheStore.setState({ entries: {} })
})
afterEach(() => cleanup())

function Probe({ vesselId, fallback }: { vesselId: string; fallback: string | undefined }) {
  const { src, isCustom, customUnavailable } = useResolvedShipImage(vesselId, fallback)
  return (
    <div>
      <span data-testid="src">{src ?? '(none)'}</span>
      <span data-testid="isCustom">{String(isCustom)}</span>
      <span data-testid="customUnavailable">{String(customUnavailable)}</span>
    </div>
  )
}

function makeFile(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' })
}

describe('UX-005A: useResolvedShipImage — no custom image on record', () => {
  it('passes the fallback straight through unchanged (existing fleets without customImageRef load unchanged)', () => {
    render(<Probe vesselId="ghost" fallback="https://example.com/fallback.jpg" />)
    expect(screen.getByTestId('src').textContent).toBe('https://example.com/fallback.jpg')
    expect(screen.getByTestId('isCustom').textContent).toBe('false')
  })

  it('is a safe no-op for a vessel id with no matching FleetAsset at all', () => {
    render(<Probe vesselId="totally-unowned-preview-ship" fallback="https://example.com/fallback.jpg" />)
    expect(screen.getByTestId('src').textContent).toBe('https://example.com/fallback.jpg')
  })
})

describe('UX-005A: useResolvedShipImage — custom image resolution', () => {
  it('resolves the custom image once stored, taking priority over the fallback', async () => {
    const add = useFleetStore.getState().addFleetAsset('ghost', 'OWNED', 'Test Ghost')
    const vesselId = add.assetId!
    await storeShipImage(vesselId, makeFile('livery.png'))
    useFleetStore.getState().updateFleetAssetCustomImage(vesselId, `ships/${vesselId}.png`)

    render(<Probe vesselId={vesselId} fallback="https://example.com/fallback.jpg" />)

    await waitFor(() => expect(screen.getByTestId('isCustom').textContent).toBe('true'))
    expect(screen.getByTestId('src').textContent).toMatch(/^blob:/)
  })

  it('Deliverable 3: falls back safely and reports customUnavailable when the ref is set but the managed file is missing', async () => {
    const add = useFleetStore.getState().addFleetAsset('ghost', 'OWNED', 'Test Ghost 2')
    const vesselId = add.assetId!
    // customImageRef recorded, but nothing was ever actually stored in IndexedDB for it.
    useFleetStore.getState().updateFleetAssetCustomImage(vesselId, `ships/${vesselId}.png`)

    render(<Probe vesselId={vesselId} fallback="https://example.com/fallback.jpg" />)

    await waitFor(() => expect(screen.getByTestId('customUnavailable').textContent).toBe('true'))
    expect(screen.getByTestId('src').textContent).toBe('https://example.com/fallback.jpg')
    expect(screen.getByTestId('isCustom').textContent).toBe('false')
  })
})

describe('UX-005A (Deliverable 5): instance isolation — two vessels of the same model', () => {
  it('Ghost A and Ghost B retain fully independent custom images', async () => {
    const addA = useFleetStore.getState().addFleetAsset('ghost', 'OWNED', 'Ghost A')
    const addB = useFleetStore.getState().addFleetAsset('ghost', 'OWNED', 'Ghost B')
    const idA = addA.assetId!
    const idB = addB.assetId!
    expect(idA).not.toBe(idB)

    await storeShipImage(idA, makeFile('black-livery.png'))
    await storeShipImage(idB, makeFile('white-livery.png'))
    useFleetStore.getState().updateFleetAssetCustomImage(idA, `ships/${idA}.png`)
    useFleetStore.getState().updateFleetAssetCustomImage(idB, `ships/${idB}.png`)

    render(
      <>
        <div data-testid="probe-a">
          <Probe vesselId={idA} fallback="https://example.com/fallback.jpg" />
        </div>
        <div data-testid="probe-b">
          <Probe vesselId={idB} fallback="https://example.com/fallback.jpg" />
        </div>
      </>
    )

    await waitFor(() => {
      const a = screen.getByTestId('probe-a').querySelector('[data-testid="isCustom"]')
      const b = screen.getByTestId('probe-b').querySelector('[data-testid="isCustom"]')
      expect(a?.textContent).toBe('true')
      expect(b?.textContent).toBe('true')
    })

    const srcA = screen.getByTestId('probe-a').querySelector('[data-testid="src"]')!.textContent
    const srcB = screen.getByTestId('probe-b').querySelector('[data-testid="src"]')!.textContent
    expect(srcA).not.toBe(srcB)

    // Removing/changing Ghost A's image must not affect Ghost B.
    useFleetStore.getState().updateFleetAssetCustomImage(idA, undefined)
    useShipImageCacheStore.getState().invalidate(idA)

    const stillB = useFleetStore.getState().fleetAssets.find((a) => a.id === idB)
    expect(stillB?.customImageRef).toBe(`ships/${idB}.png`)
    const nowA = useFleetStore.getState().fleetAssets.find((a) => a.id === idA)
    expect(nowA?.customImageRef).toBeUndefined()
  })
})
