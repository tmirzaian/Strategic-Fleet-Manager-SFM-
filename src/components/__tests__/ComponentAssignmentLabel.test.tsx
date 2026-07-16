import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ComponentAssignmentLabel from '../ComponentAssignmentLabel'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('EWO-026 (Task 6/13): ComponentAssignmentLabel static presentation contract', () => {
  it('13. a component with a real resolvable Grade renders that Grade line (DayBreak, real generated-data)', () => {
    render(<ComponentAssignmentLabel value="DayBreak" />)
    expect(screen.getByText('DayBreak')).toBeInTheDocument()
    // Real bulk-catalog grade for DayBreak is 3 -> "Grade C" (see EWO-026 report).
    expect(screen.getByText('Grade C')).toBeInTheDocument()
  })

  it('14. when both Class and Grade are available, they render as one compact combined line (EWO-036B: "Military A", not two separate lines)', async () => {
    vi.doMock('../../utils/componentPresentation', () => ({
      resolveComponentLabel: () => ({ primaryLabel: 'Avalanche', classificationLabel: 'Military A', diagnosticInternalName: null }),
    }))
    const { default: MockedLabel } = await import('../ComponentAssignmentLabel')
    render(<MockedLabel value="Avalanche" />)
    expect(screen.getByText('Avalanche')).toBeInTheDocument()
    expect(screen.getByText('Military A')).toBeInTheDocument()
    expect(screen.queryByText('Military')).not.toBeInTheDocument()
    expect(screen.queryByText('Grade A')).not.toBeInTheDocument()
  })

  it('15. missing Class never renders a blank line — only the primary name and (if present) Grade appear', () => {
    // No component in the current pipeline data carries a real Class value
    // (see EWO-026 Task 5 report) — DayBreak is real data with a Grade but
    // no Class, exactly the "Class missing, Grade present" case.
    const { container } = render(<ComponentAssignmentLabel value="DayBreak" />)
    const lines = Array.from(container.querySelectorAll('span.block')).map((el) => el.textContent)
    expect(lines).toEqual(['DayBreak', 'Grade C'])
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
