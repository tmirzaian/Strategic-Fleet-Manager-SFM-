import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ComponentAssignmentLabel from '../ComponentAssignmentLabel'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('EWO-026 (Task 6/13): ComponentAssignmentLabel static presentation contract', () => {
  it('13. a component with real generated Class+Grade renders the CAT-001 "{Class} {GradeLetter}" identity line (DayBreak, real generated-data)', () => {
    render(<ComponentAssignmentLabel value="DayBreak" />)
    expect(screen.getByText('DayBreak')).toBeInTheDocument()
    // Real generated-data (CAT-001): DayBreak's Classification is "Civilian",
    // grade 3 -> letter C -> "Civilian C" — the literal CAT-001 worked example.
    expect(screen.getByText('Civilian C')).toBeInTheDocument()
  })

  it('14. when both Class and Grade are available, they render as one compact combined line (CAT-001: "Military A", not two separate lines, no word "Grade")', async () => {
    vi.doMock('../../utils/componentPresentation', () => ({
      resolveComponentLabel: () => ({ primaryLabel: 'Avalanche', identityLine: 'Military A', diagnosticInternalName: null }),
    }))
    const { default: MockedLabel } = await import('../ComponentAssignmentLabel')
    render(<MockedLabel value="Avalanche" />)
    expect(screen.getByText('Avalanche')).toBeInTheDocument()
    expect(screen.getByText('Military A')).toBeInTheDocument()
    expect(screen.queryByText('Military')).not.toBeInTheDocument()
    expect(screen.queryByText('Grade A')).not.toBeInTheDocument()
  })

  it('15. missing Class falls back to the bare grade letter alone — never the word "Grade", never a blank line', async () => {
    vi.doMock('../../utils/componentPresentation', () => ({
      resolveComponentLabel: () => ({ primaryLabel: 'NoClassItem', identityLine: 'C', diagnosticInternalName: null }),
    }))
    const { default: MockedLabel } = await import('../ComponentAssignmentLabel')
    const { container } = render(<MockedLabel value="NoClassItem" />)
    const lines = Array.from(container.querySelectorAll('span.block')).map((el) => el.textContent)
    expect(lines).toEqual(['NoClassItem', 'C'])
  })

  it('16. missing Grade never renders false/placeholder text — an unmatched value shows only its own name', () => {
    const { container } = render(<ComponentAssignmentLabel value="Totally Fictional Component Zzyzx" />)
    const lines = Array.from(container.querySelectorAll('span.block')).map((el) => el.textContent)
    expect(lines).toEqual(['Totally Fictional Component Zzyzx'])
  })

  it('an empty/unassigned sentinel renders as-is with no secondary lines at all', () => {
    const { container } = render(<ComponentAssignmentLabel value="—" />)
    const lines = Array.from(container.querySelectorAll('span.block')).map((el) => el.textContent)
    expect(lines).toEqual(['—'])
  })
})

describe('EWO-068 (Part D): full-value tooltips on truncatable lines', () => {
  it('the primary name line carries its own title with the full value, not the outer diagnostic identifier', async () => {
    vi.doMock('../../utils/componentPresentation', () => ({
      resolveComponentLabel: () => ({
        primaryLabel: 'An Unusually Long Component Name That Would Truncate',
        identityLine: 'Military A',
        diagnosticInternalName: 'RSI_SomeRawInternalId_01',
      }),
    }))
    const { default: MockedLabel } = await import('../ComponentAssignmentLabel')
    render(<MockedLabel value="whatever" />)
    const nameLine = screen.getByText('An Unusually Long Component Name That Would Truncate')
    expect(nameLine).toHaveAttribute('title', 'An Unusually Long Component Name That Would Truncate')
  })

  it('the classification line carries its own title with its full value too', async () => {
    vi.doMock('../../utils/componentPresentation', () => ({
      resolveComponentLabel: () => ({
        primaryLabel: 'Avalanche',
        identityLine: 'Military A',
        diagnosticInternalName: null,
      }),
    }))
    const { default: MockedLabel } = await import('../ComponentAssignmentLabel')
    render(<MockedLabel value="whatever" />)
    expect(screen.getByText('Military A')).toHaveAttribute('title', 'Military A')
  })
})
