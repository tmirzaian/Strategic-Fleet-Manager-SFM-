import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CaptainsLog from '../CaptainsLog'
import { useFleetStore, buildFleetExportSnapshot } from '../../store/useFleetStore'
import { serializeFleetExportEnvelope } from '../../utils/fleetSerialization'
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
 * EWO-095B — "Canonical Image Presentation & Environmental Clarity" for
 * Captain's Log specifically: the certification illustration is artwork
 * only (no embedded badge assumed), and the Community Certification Seal
 * is a separate, reusable `<CertificationBadge>` overlay layered above the
 * artwork but below the certification text.
 */
describe("EWO-095B: Captain's Log certification card — reusable badge overlay", () => {
  it('renders the Community Certified seal as a real <img>, resolved through the semantic registry', () => {
    renderCaptainsLog()
    const badge = screen.getByAltText('Community Certified') as HTMLImageElement
    expect(badge).toBeInTheDocument()
    expect(badge.src).toContain('/assets/branding/community/community-certified-seal.png')
  })

  it('badge floats above the artwork but stays below the certification text (z-10 vs. the text wrapper’s z-20) — text is never obscured', () => {
    renderCaptainsLog()
    const badge = screen.getByAltText('Community Certified')
    expect(badge.className).toContain('z-10')
    const certifiedForLabel = screen.getByText('Certified for')
    const textWrapper = certifiedForLabel.parentElement as HTMLElement
    expect(textWrapper.className).toContain('z-20')
  })

  it('certification text remains present and unchanged alongside the badge', () => {
    renderCaptainsLog()
    expect(screen.getByText(`Strategic Fleet Manager ${APP_VERSION_LABEL}`)).toBeInTheDocument()
    expect(screen.getByText('Certified for')).toBeInTheDocument()
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

/**
 * EWO-094 — "Fleet Import Preview & Replace Workflow." Store-level
 * pipeline behavior (envelope/schema failures, migration, safety
 * guarantees) is already proven in
 * src/utils/__tests__/fleetImport.test.ts and
 * src/store/__tests__/fleetImportPreview.test.ts. This suite proves the
 * actual Commander-facing flow: selecting a file drives a real File
 * object through the real component, the Preview renders real computed
 * counts, Cancel performs zero writes, and Replace commits and shows the
 * completion summary.
 */
function selectImportFile(fileContents: string, filename = 'fleet-export.json') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([fileContents], filename, { type: 'application/json' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('EWO-094: Fleet Import — file selection, Preview, Cancel, Replace', () => {
  it('a well-formed exported file produces a Preview with real, current counts and metadata', async () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Import Preview Test Titan')
    const envelope = buildFleetExportSnapshot(useFleetStore.getState())
    const fileText = serializeFleetExportEnvelope(envelope)

    renderCaptainsLog()
    selectImportFile(fileText)

    await waitFor(() => expect(screen.getByText('Import Preview')).toBeInTheDocument())
    expect(screen.getByText(String(useFleetStore.getState().ships.length))).toBeInTheDocument()
    expect(screen.getByText(envelope.appVersion)).toBeInTheDocument()
    expect(screen.getByText(String(envelope.schemaVersion))).toBeInTheDocument()
    expect(screen.getByText(/Compatible/)).toBeInTheDocument()
  })

  it('a corrupt file shows an inline error, never a Preview, and performs zero writes', async () => {
    const before = localStorage.getItem('sfm-fleet-store')
    renderCaptainsLog()
    selectImportFile('{ not valid json')

    await waitFor(() => expect(screen.getByText(/Import failed/)).toBeInTheDocument())
    expect(screen.queryByText('Import Preview')).not.toBeInTheDocument()
    expect(localStorage.getItem('sfm-fleet-store')).toBe(before)
  })

  it('Cancel dismisses the Preview and performs zero writes — the store is untouched', async () => {
    const envelope = buildFleetExportSnapshot(useFleetStore.getState())
    renderCaptainsLog()
    selectImportFile(serializeFleetExportEnvelope(envelope))
    await waitFor(() => expect(screen.getByText('Import Preview')).toBeInTheDocument())

    const shipsBefore = useFleetStore.getState().ships.length
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Import Preview')).not.toBeInTheDocument()
    expect(useFleetStore.getState().ships.length).toBe(shipsBefore)
  })

  it('Replace Current Fleet commits the previewed state (a real replacement, not a no-op merge) and shows the completion summary', async () => {
    // Capture a snapshot BEFORE adding a ship, then add one live — Replace
    // with the older file must make the added ship disappear, proving
    // this is a genuine replacement of the live state, not an additive merge.
    const fileTextBeforeAdd = serializeFleetExportEnvelope(buildFleetExportSnapshot(useFleetStore.getState()))
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const addResult = useFleetStore.getState().addFleetAsset(def.id, 'PURCHASED', 'Replace UI Test Titan')
    expect(useFleetStore.getState().ships.some((s) => s.id === addResult.assetId)).toBe(true)

    renderCaptainsLog()
    selectImportFile(fileTextBeforeAdd)
    await waitFor(() => expect(screen.getByText('Import Preview')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Replace Current Fleet/ }))

    expect(screen.queryByText('Import Preview')).not.toBeInTheDocument()
    expect(screen.getByText(/Fleet imported successfully/)).toBeInTheDocument()
    expect(useFleetStore.getState().ships.some((s) => s.id === addResult.assetId)).toBe(false)
    expect(useFleetStore.getState().log.some((e) => e.action === 'Fleet imported')).toBe(true)
  })

  it('a schema version newer than this build supports is rejected with a clear message, no Preview, zero writes', async () => {
    const before = localStorage.getItem('sfm-fleet-store')
    renderCaptainsLog()
    selectImportFile(JSON.stringify({ schemaVersion: 999999, appVersion: 'Future', exportedAt: '', payload: {} }))

    await waitFor(() => expect(screen.getByText(/Import failed/)).toBeInTheDocument())
    expect(screen.getByText(/newer version/i)).toBeInTheDocument()
    expect(screen.queryByText('Import Preview')).not.toBeInTheDocument()
    expect(localStorage.getItem('sfm-fleet-store')).toBe(before)
  })
})
