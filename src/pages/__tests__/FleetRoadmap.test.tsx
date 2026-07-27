import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import FleetRoadmap from '../FleetRoadmap'

afterEach(() => cleanup())

describe('<FleetRoadmap /> — EWO-061: standardized operational header', () => {
  it('renders the standard label-above-title header with no descriptive paragraph', () => {
    render(<FleetRoadmap />)
    const label = screen.getByText('Fleet Roadmap')
    expect(label.tagName).toBe('P')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Where is the fleet headed?')
    expect(screen.queryByText(/Quality-of-life view/)).not.toBeInTheDocument()
  })
})
