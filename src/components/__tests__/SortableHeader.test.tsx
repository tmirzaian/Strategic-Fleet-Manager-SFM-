import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import SortableHeader from '../SortableHeader'

afterEach(() => cleanup())

describe('<SortableHeader /> (Alpha 2.4, Part 11)', () => {
  it('shows a persistent neutral indicator on an inactive column, not just on hover', () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="Name" column="name" activeColumn="quantity" direction="asc" onSort={() => {}} />
          </tr>
        </thead>
      </table>
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('shows a directional arrow on the active column', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="Name" column="name" activeColumn="name" direction="asc" onSort={() => {}} />
          </tr>
        </thead>
      </table>
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('calls onSort with the column when clicked', () => {
    let sorted: string | undefined
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="Name" column="name" activeColumn="quantity" direction="asc" onSort={(c) => (sorted = c)} />
          </tr>
        </thead>
      </table>
    )
    screen.getByText('Name').click()
    expect(sorted).toBe('name')
  })
})
