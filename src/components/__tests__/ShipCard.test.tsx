import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ShipCard from '../ShipCard'
import type { Ship, FleetBuildState } from '../../types'
import type { BuildProgressResult } from '../../utils/buildProgress'

afterEach(() => cleanup())

const baseShip: Ship = {
  id: 'ghost',
  name: 'F7C-S Hornet Ghost Mk II',
  manufacturer: 'Anvil',
  ownership: 'Owned',
  career: 'Combat',
  role: 'Stealth Fighter',
  activeBuildId: 'ghost-stealth',
  readiness: 82,
  priority: 1,
  missing: [],
}

const incompleteProgress: BuildProgressResult = {
  percentage: 82,
  matchedAssignments: 6,
  requiredAssignments: 8,
  missingAssignments: ['Slipstream'],
  mismatchedAssignments: [],
  invalidTargets: [],
  upgradeOpportunities: [], unresolvedAssignments: [],
  isComplete: false,
  status: 'NEAR_READY',
}

function renderCard(ship: Ship, progress: BuildProgressResult = incompleteProgress, buildState: FleetBuildState = 'BUILD_IN_PROGRESS') {
  return render(
    <MemoryRouter>
      <ShipCard ship={ship} buildName="Stealth Build" progress={progress} buildState={buildState} />
    </MemoryRouter>
  )
}

describe('<ShipCard /> Fleet Dashboard image presentation', () => {
  it('preserves the aspect-video card frame regardless of image presentation mode', () => {
    renderCard({ ...baseShip, imageUrl: 'https://example.com/ghost.jpg' })
    const frame = document.querySelector('.aspect-video')
    expect(frame).not.toBeNull()
    expect(frame?.className).toContain('aspect-video')
  })

  it('a ship with a real photo renders object-cover inside the fixed-aspect frame', () => {
    renderCard({ ...baseShip, imageUrl: 'https://example.com/ghost.jpg' })
    const img = screen.getByRole('img', { name: baseShip.name })
    expect(img.className).toContain('object-cover')
  })

  it('a ship with no image (fallback) still renders within the same aspect-video frame, using object-contain', () => {
    renderCard({ ...baseShip, imageUrl: undefined })
    const frame = document.querySelector('.aspect-video')
    expect(frame).not.toBeNull()
    const img = screen.getByRole('img', { name: baseShip.name })
    expect(img.className).toContain('object-contain')
  })

  it('does not stretch or crop — the frame element itself never changes size between modes', () => {
    const { container: coverContainer } = renderCard({ ...baseShip, imageUrl: 'https://example.com/ghost.jpg' })
    const coverFrameClass = coverContainer.querySelector('.aspect-video')?.className
    cleanup()
    const { container: containContainer } = renderCard({ ...baseShip, imageUrl: undefined })
    const containFrameClass = containContainer.querySelector('.aspect-video')?.className
    expect(coverFrameClass).toBe(containFrameClass)
  })
})

describe('<ShipCard /> Build Complete state', () => {
  const completeProgress: BuildProgressResult = {
    percentage: 100,
    matchedAssignments: 8,
    requiredAssignments: 8,
    missingAssignments: [],
    mismatchedAssignments: [],
    invalidTargets: [],
    upgradeOpportunities: [], unresolvedAssignments: [],
    isComplete: true,
    status: 'COMPLETE',
  }

  it('18. a complete build hides the progress bar and percentage', () => {
    renderCard(baseShip, completeProgress, 'MISSION_READY')
    // ReadinessBar renders a numeric percentage label — it must not appear at all when complete.
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })

  it('19. a complete build displays a Mission Ready state', () => {
    renderCard(baseShip, completeProgress, 'MISSION_READY')
    expect(screen.getByText('Mission Ready')).toBeInTheDocument()
  })

  it('an incomplete build shows the percentage and missing items, not Build Complete', () => {
    renderCard(baseShip, incompleteProgress)
    expect(screen.queryByText('Mission Ready')).not.toBeInTheDocument()
    expect(screen.getByText('82%')).toBeInTheDocument()
  })

  it('never shows a contradictory state — complete and a non-100 percentage never render together', () => {
    renderCard(baseShip, completeProgress, 'MISSION_READY')
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument()
  })

  it('a Factory-only asset shows Factory Loadout, not Build Complete, and no progress bar', () => {
    renderCard(baseShip, completeProgress, 'FACTORY_ONLY')
    expect(screen.getByText('Factory Loadout')).toBeInTheDocument()
    expect(screen.queryByText('Mission Ready')).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument()
  })
})
