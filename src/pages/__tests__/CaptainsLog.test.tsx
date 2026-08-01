import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CaptainsLog from '../CaptainsLog'
import { useFleetStore } from '../../store/useFleetStore'
import { shipCatalogSource } from '../../generated/shipCatalog'
import { APP_VERSION_LABEL } from '../../config/appVersion'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderCaptainsLog() {
  return render(
    <MemoryRouter>
      <CaptainsLog />
    </MemoryRouter>
  )
}

/**
 * CWO-005 (Task 5) / BP-001 — Captain's Log is the one place SFM's own
 * build and the Star Citizen build its Golden Fleet data is certified
 * against are both shown together. The SC line is derived live from the
 * real catalog metadata (generated-data/ship-catalog.json's
 * `source.gameVersion`), not a hardcoded string — this test itself
 * computes the expected label from that same live source rather than
 * hardcoding a version, so it fails loudly if a future catalog
 * regeneration ever changes the certified build without this page
 * picking it up. BP-001 replaced the truncated "4.9.x" presentation with
 * the full, precise certified build string.
 */
describe("CWO-005 (Task 5) / BP-001: Captain's Log — version/certification presentation", () => {
  it('shows the SFM build label', () => {
    renderCaptainsLog()
    expect(screen.getByText(`Strategic Fleet Manager ${APP_VERSION_LABEL}`)).toBeInTheDocument()
  })

  it('shows "Certified for" and the real, live-derived, full Star Citizen build — or an honest not-yet-certified message when no catalog is generated locally', () => {
    renderCaptainsLog()
    expect(screen.getByText('Certified for')).toBeInTheDocument()
    const gameVersion = shipCatalogSource?.gameVersion
    if (gameVersion) {
      expect(screen.getByText(`Star Citizen LIVE ${gameVersion}`)).toBeInTheDocument()
    } else {
      expect(screen.getByText(/Not yet certified/)).toBeInTheDocument()
    }
  })
})

/**
 * EWO-093 — "Fleet Export Architecture." The Export button is the one
 * Commander-facing piece of this work order — everything else is the
 * shared serialization module underneath it (see
 * src/utils/__tests__/fleetSerialization.test.ts and
 * src/store/__tests__/fleetExportSnapshot.test.ts for the schema/
 * no-parallel-implementation proofs). This suite proves the button
 * itself actually triggers a real browser download with the expected
 * content, using the standard Blob/object-URL/anchor-click mocks jsdom
 * doesn't implement natively.
 */
function stubDownload(): { getCapturedBlob: () => Blob | null; createObjectURL: ReturnType<typeof vi.fn>; revokeObjectURL: ReturnType<typeof vi.fn>; clickSpy: ReturnType<typeof vi.spyOn> } {
  let capturedBlob: Blob | null = null
  const createObjectURL = vi.fn((blob: Blob) => {
    capturedBlob = blob
    return 'blob:mock-url'
  })
  const revokeObjectURL = vi.fn()
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return { getCapturedBlob: () => capturedBlob, createObjectURL, revokeObjectURL, clickSpy }
}

describe('EWO-093: Fleet Export button', () => {
  it('downloads a JSON file, revokes the object URL, and shows a confirmation with the filename', () => {
    const { getCapturedBlob, createObjectURL, revokeObjectURL, clickSpy } = stubDownload()

    renderCaptainsLog()
    fireEvent.click(screen.getByRole('button', { name: /Export Fleet Data/ }))

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(getCapturedBlob()).not.toBeNull()
    expect(getCapturedBlob()!.type).toBe('application/json')
    expect(screen.getByText(/Exported as sfm-fleet-export-\d{4}-\d{2}-\d{2}\.json/)).toBeInTheDocument()

    clickSpy.mockRestore()
  })

  it('the downloaded file is a valid FleetExportEnvelope reflecting the current fleetAssets — not a second, independently-shaped export', async () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Export Content Test Titan')

    const { getCapturedBlob, clickSpy } = stubDownload()
    renderCaptainsLog()
    fireEvent.click(screen.getByRole('button', { name: /Export Fleet Data/ }))

    const text = await getCapturedBlob()!.text()
    const envelope = JSON.parse(text)

    expect(typeof envelope.schemaVersion).toBe('number')
    expect(typeof envelope.appVersion).toBe('string')
    expect(typeof envelope.exportedAt).toBe('string')
    expect(envelope.payload.fleetAssets.some((a: { addedAt?: string; ownershipType: string }) => a.ownershipType === 'OWNED')).toBe(true)

    clickSpy.mockRestore()
  })
})
