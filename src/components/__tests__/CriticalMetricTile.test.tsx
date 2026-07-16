import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ShipWheel } from 'lucide-react'
import CriticalMetricTile from '../CriticalMetricTile'

afterEach(() => cleanup())

describe('<CriticalMetricTile /> — EWO-011 shared critical-data scale', () => {
  it('renders the value at the standardized text-2xl display scale, and the label beneath it', () => {
    const { container } = render(<CriticalMetricTile icon={ShipWheel} label="Ships Active" value={12} />)
    const value = container.querySelector('.text-2xl.font-display.font-bold')
    expect(value).not.toBeNull()
    expect(value).toHaveTextContent('12')
    expect(screen.getByText('Ships Active')).toBeInTheDocument()
  })

  it('applies an accent color to the value only when supplied', () => {
    const { container } = render(<CriticalMetricTile icon={ShipWheel} label="Needed Items" value={3} accent="#FFD166" />)
    const value = container.querySelector('.text-2xl') as HTMLElement
    expect(value.style.color).toBe('rgb(255, 209, 102)')
  })

  it('renders optional children (e.g. a ship-name context list) beneath the label', () => {
    render(
      <CriticalMetricTile icon={ShipWheel} label="Mission Ready" value={2}>
        <div>Corsair, Cutlass</div>
      </CriticalMetricTile>
    )
    expect(screen.getByText('Corsair, Cutlass')).toBeInTheDocument()
  })
})
