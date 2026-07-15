import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WorkflowDestinationCard from '../WorkflowDestinationCard'
import type { WorkflowIllustrationId } from '../../config/assets/types'

afterEach(() => cleanup())

function renderCard(illustrationId: WorkflowIllustrationId = 'decision-center-found-loot') {
  return render(
    <MemoryRouter>
      <WorkflowDestinationCard
        to="/decision-center"
        title="Found Loot? Check It."
        supportingLine="Review unassigned components and decide what to keep."
        illustrationId={illustrationId}
      />
    </MemoryRouter>
  )
}

describe('<WorkflowDestinationCard /> — EWO-011 operational workflow destination', () => {
  it('renders as a single full-card link to its destination', () => {
    renderCard()
    const link = screen.getByRole('link', { name: /Found Loot\? Check It\./ })
    expect(link).toHaveAttribute('href', '/decision-center')
  })

  it('renders a title and one supporting line, not a numeric critical-metric value', () => {
    const { container } = renderCard()
    expect(screen.getByText('Found Loot? Check It.')).toBeInTheDocument()
    expect(screen.getByText('Review unassigned components and decide what to keep.')).toBeInTheDocument()
    expect(container.querySelector('.text-2xl')).toBeNull()
  })

  it('renders an intentional neutral illustration hardpoint, not a broken image, when no illustration is approved yet', async () => {
    // decision-center-found-loot/quick-update-hangar are both real,
    // Commander-approved Beta artwork as of EWO-035 — this test instead
    // mocks the resolver back to its pre-EWO-035 "nothing approved yet"
    // state, so the neutral-icon contract itself (never a broken <img>)
    // stays covered independent of which illustrations happen to be live.
    vi.resetModules()
    vi.doMock('../../config/assets', () => ({ resolveWorkflowIllustration: () => undefined }))
    const { default: MockedCard } = await import('../WorkflowDestinationCard')
    const { container } = render(
      <MemoryRouter>
        <MockedCard
          to="/decision-center"
          title="Found Loot? Check It."
          supportingLine="Review unassigned components and decide what to keep."
          illustrationId="decision-center-found-loot"
        />
      </MemoryRouter>
    )
    expect(container.querySelector('img')).toBeNull()
    vi.doUnmock('../../config/assets')
    vi.resetModules()
  })

  it('exposes a visible focus state via focus-visible ring classes', () => {
    renderCard()
    const link = screen.getByRole('link', { name: /Found Loot\? Check It\./ })
    expect(link.className).toContain('focus-visible:ring-2')
  })
})

describe('<WorkflowDestinationCard /> — EWO-035 Beta artwork integration', () => {
  it('renders the real "Found Loot?" illustration filling the frame via object-cover', () => {
    // The illustration is decorative (alt="" by design, the title/supporting
    // line already carry the accessible content) so it has no accessible
    // "img" role — queried by tag, matching the pre-existing convention
    // this file already used for the "no illustration" case.
    const { container } = renderCard('decision-center-found-loot')
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('/assets/environments/mission-control/decision-center-found-loot.webp')
    expect(img.className).toContain('object-cover')
  })

  it('renders the real "Something Changed?" illustration filling the frame via object-cover', () => {
    const { container } = render(
      <MemoryRouter>
        <WorkflowDestinationCard
          to="/quick-update"
          title="Something Changed?"
          supportingLine="Log new components, fittings, or fleet changes fast."
          illustrationId="quick-update-hangar"
        />
      </MemoryRouter>
    )
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('/assets/environments/mission-control/quick-update-maintenance.webp')
    expect(img.className).toContain('object-cover')
  })
})
