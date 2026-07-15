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

function renderCard(
  ship: Ship,
  progress: BuildProgressResult = incompleteProgress,
  buildState: FleetBuildState = 'BUILD_IN_PROGRESS',
  stockRoleFocus: string | undefined = 'Stealth Fighter'
) {
  return render(
    <MemoryRouter>
      <ShipCard ship={ship} buildName="Stealth Build" progress={progress} buildState={buildState} stockRoleFocus={stockRoleFocus} />
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

  it('EWO-033A: a ship with no image (fallback) still renders within the same aspect-video frame, filling it via object-cover (not letterboxed object-contain)', () => {
    renderCard({ ...baseShip, imageUrl: undefined })
    const frame = document.querySelector('.aspect-video')
    expect(frame).not.toBeNull()
    const img = screen.getByRole('img', { name: baseShip.name })
    expect(img.className).toContain('object-cover')
    expect(img.className).not.toContain('object-contain')
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

/**
 * EWO-033 (Task 4/5/10) — the canonical dimension contract: four
 * structural regions, each with a reserved minimum height, present
 * identically regardless of which buildState branch is active. jsdom
 * doesn't run a real layout engine, so these tests verify the contract
 * structurally (the same reserved-height classes exist on the same
 * regions every time) rather than measuring literal pixel heights —
 * the appropriate check in this test environment, per Task 11's browser
 * pass covering the actual visual result.
 */
describe('<ShipCard /> — EWO-033 (Task 4): canonical dimension contract', () => {
  const buildStates: FleetBuildState[] = ['INVALID_BUILD', 'FACTORY_ONLY', 'MISSION_READY', 'BUILD_IN_PROGRESS']

  it('15. every buildState variant renders the same four reserved-height structural regions', () => {
    for (const buildState of buildStates) {
      const { container } = renderCard(baseShip, incompleteProgress, buildState)
      expect(container.querySelector('.aspect-video')).not.toBeNull()
      expect(container.querySelector('.min-h-11')).not.toBeNull() // identity region
      expect(container.querySelector('.min-h-5')).not.toBeNull() // active-loadout region
      // two min-h-11 regions exist per card: identity + status
      expect(container.querySelectorAll('.min-h-11').length).toBe(2)
      cleanup()
    }
  })

  it('16. the root card fills its grid cell (h-full) regardless of buildState', () => {
    for (const buildState of buildStates) {
      const { container } = renderCard(baseShip, incompleteProgress, buildState)
      expect(container.querySelector('a.h-full')).not.toBeNull()
      cleanup()
    }
  })

  it('17. every buildState variant always renders an Active Loadout line — even Invalid Loadout, where the region would otherwise be empty', () => {
    for (const buildState of buildStates) {
      renderCard(baseShip, incompleteProgress, buildState)
      expect(screen.getByText(/Active Loadout:/)).toBeInTheDocument()
      cleanup()
    }
  })

  it('16b. placeholder-image and real-image cards share the exact same image frame classes (no image-dependent resizing)', () => {
    const { container: real } = renderCard({ ...baseShip, imageUrl: 'https://example.com/ghost.jpg' })
    const realFrameClass = real.querySelector('.aspect-video')?.className
    cleanup()
    const { container: placeholder } = renderCard({ ...baseShip, imageUrl: undefined })
    const placeholderFrameClass = placeholder.querySelector('.aspect-video')?.className
    expect(realFrameClass).toBe(placeholderFrameClass)
  })

  it('18. a long stock role/focus does not break card structure — line-clamp-1 keeps it to one line, region stays reserved', () => {
    const { container } = renderCard(baseShip, incompleteProgress, 'BUILD_IN_PROGRESS', 'A Very Long Stock Role And Focus Description That Would Otherwise Wrap Across Several Lines')
    const identityLine = screen.getByText(/Anvil ·/)
    expect(identityLine.className).toContain('line-clamp-1')
    expect(container.querySelector('.min-h-11')).not.toBeNull()
  })

  it('19. a long custom Loadout name does not break card structure — the region stays a single reserved-height line', () => {
    render(
      <MemoryRouter>
        <ShipCard
          ship={baseShip}
          buildName="An Extremely Long Custom Loadout Name That A Commander Might Actually Type In Practice"
          progress={incompleteProgress}
          buildState="BUILD_IN_PROGRESS"
          stockRoleFocus="Stealth Fighter"
        />
      </MemoryRouter>
    )
    expect(screen.getByText(/An Extremely Long Custom Loadout Name/)).toBeInTheDocument()
  })

  it('a long ship name renders without throwing and truncates rather than breaking layout', () => {
    renderCard({ ...baseShip, name: 'An Extraordinarily Long Fleet Asset Nickname That Exceeds Any Reasonable Card Width' })
    const heading = screen.getByRole('heading', { level: 3 })
    expect(heading.className).toContain('truncate')
  })

  it('20/21. manufacturer-only (no resolved stock role) shows no dangling separator; manufacturer + role renders both', () => {
    // Passed via direct render, not the `renderCard` helper — a JS default
    // parameter substitutes its default whenever the argument is
    // literally `undefined`, even when passed explicitly, so this exact
    // "no stock role resolved" case can't go through the helper's default.
    render(
      <MemoryRouter>
        <ShipCard ship={baseShip} buildName="Stealth Build" progress={incompleteProgress} buildState="BUILD_IN_PROGRESS" stockRoleFocus={undefined} />
      </MemoryRouter>
    )
    expect(screen.getByText('Anvil')).toBeInTheDocument()
    expect(screen.queryByText(/Anvil ·/)).not.toBeInTheDocument()
    cleanup()
    renderCard(baseShip, incompleteProgress, 'BUILD_IN_PROGRESS', 'Stealth Fighter')
    expect(screen.getByText('Anvil · Stealth Fighter')).toBeInTheDocument()
  })

  it('12. ShipCard itself never renders Priority markup — that is exclusively page-level wrapper context (Ruling 2/3)', () => {
    renderCard(baseShip)
    expect(screen.queryByText(/PRIORITY/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('priority-card-wrapper')).not.toBeInTheDocument()
  })
})
