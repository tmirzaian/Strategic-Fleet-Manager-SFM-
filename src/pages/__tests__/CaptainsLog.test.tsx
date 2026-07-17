import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
 * CWO-005 (Task 5) — Captain's Log is the one place SFM's own build and
 * the Star Citizen build its Golden Fleet data is certified against are
 * both shown together. The SC line is derived live from the real catalog
 * metadata (generated-data/ship-catalog.json's `source.gameVersion`), not
 * a hardcoded string — this test itself computes the expected label from
 * that same live source rather than hardcoding "4.9.x", so it fails
 * loudly if a future catalog regeneration ever changes the certified
 * build without this page picking it up.
 */
describe("CWO-005 (Task 5): Captain's Log — version/certification presentation", () => {
  it('shows the SFM build label', () => {
    renderCaptainsLog()
    expect(screen.getByText(`Strategic Fleet Manager ${APP_VERSION_LABEL}`)).toBeInTheDocument()
  })

  it('shows "Certified Against" and the real, live-derived Star Citizen build — or an honest not-yet-certified message when no catalog is generated locally', () => {
    renderCaptainsLog()
    expect(screen.getByText('Certified Against')).toBeInTheDocument()
    const gameVersion = shipCatalogSource?.gameVersion
    if (gameVersion) {
      const [major, minor] = gameVersion.split('.')
      expect(screen.getByText(`Star Citizen Live ${major}.${minor}.x`)).toBeInTheDocument()
    } else {
      expect(screen.getByText(/Not yet certified/)).toBeInTheDocument()
    }
  })
})
