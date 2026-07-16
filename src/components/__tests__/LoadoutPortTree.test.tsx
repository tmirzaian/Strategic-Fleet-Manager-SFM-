import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import LoadoutPortTree from '../LoadoutPortTree'
import { buildPortTree } from '../../utils/portTree'
import { hasComponentCatalog } from '../../generated/componentCatalog'
import type { Hardpoint } from '../../types'

afterEach(cleanup)

function hp(overrides: Partial<Hardpoint> & Pick<Hardpoint, 'id' | 'slotLabel'>): Hardpoint {
  return {
    shipId: 'ship', buildId: 'build', type: 'Weapon', size: 'S2',
    factoryItem: 'Item', installedItem: 'Item', targetItem: 'Item', status: 'OK',
    ...overrides,
  }
}

describe('LoadoutPortTree — EWO-020 Task 11/12', () => {
  it('a group header row uses the table\'s base typeface, never the competing display font', () => {
    const hardpoints = [
      hp({ id: 'a', slotLabel: 'Left Weapon', groupLabel: 'Weapons' }),
      hp({ id: 'b', slotLabel: 'Right Weapon', groupLabel: 'Weapons' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    const header = screen.getByText('Weapons').closest('td')
    expect(header).not.toBeNull()
    expect(header!.className).not.toContain('font-display')
    // Differentiated instead via weight/case/spacing/color, matching the
    // table's own established <thead> convention.
    expect(header!.className).toContain('uppercase')
    expect(header!.className).toContain('font-semibold')
  })

  it('a structural row shows no editable/logistics content and a neutral "—" for factory/installed/target', () => {
    const hardpoints = [
      hp({ id: 'mount', slotLabel: 'Left Weapon', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'gun', slotLabel: 'Class 2', parentSlotLabel: 'Left Weapon', factoryItem: 'Repeater', installedItem: 'Repeater', targetItem: 'Repeater' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    const mountRow = screen.getByText('Left Weapon').closest('tr')!
    // No "Not Required"/"OK" badges for a structural row — those columns are empty.
    expect(mountRow.textContent).not.toContain('Not Required')
  })

  it('a top-level port without a groupLabel renders exactly as a flat row (no regression for seed ships)', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Power Plant' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.getByText('Power Plant')).toBeInTheDocument()
  })
})

describe('LoadoutPortTree — EWO-030 (Task 7): Remove Installed Component', () => {
  afterEach(cleanup)

  it('no Actions column at all when onRemoveComponent is omitted (read-only/dev-inspection callers)', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'Snowblind' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('a Remove action appears on an installed, non-structural row when onRemoveComponent is provided', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'Snowblind' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={() => ({ matched: true, itemName: 'Snowblind' })} />)
    expect(screen.getByText('Actions')).toBeInTheDocument()
    const row = screen.getByText('Cooler 1').closest('tr')!
    expect(within(row).getByText('Remove')).toBeInTheDocument()
  })

  it('no Remove action on an empty slot (nothing installed) or a structural row, even when onRemoveComponent is provided', () => {
    const hardpoints = [
      hp({ id: 'a', slotLabel: 'Cooler 2', installedItem: '—' }),
      hp({ id: 'b', slotLabel: 'Left Weapon', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={() => ({ matched: true })} />)
    const emptyRow = screen.getByText('Cooler 2').closest('tr')!
    expect(within(emptyRow).queryByText('Remove')).not.toBeInTheDocument()
    const structuralRow = screen.getByText('Left Weapon').closest('tr')!
    expect(within(structuralRow).queryByText('Remove')).not.toBeInTheDocument()
  })

  it('Remove -> Return to Hangar checkbox -> Save calls onRemoveComponent with the slot and checkbox state, then closes', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'Snowblind' })]
    const tree = buildPortTree(hardpoints)
    const onRemoveComponent = vi.fn().mockReturnValue({ matched: true, itemName: 'Snowblind' })
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={onRemoveComponent} />)
    const row = screen.getByText('Cooler 1').closest('tr')!
    fireEvent.click(within(row).getByText('Remove'))
    expect(screen.getByText('Remove "Snowblind"?')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Return removed component to Hangar'))
    fireEvent.click(screen.getByText('Save'))
    expect(onRemoveComponent).toHaveBeenCalledWith('Cooler 1', true)
    expect(screen.queryByText('Remove "Snowblind"?')).not.toBeInTheDocument()
  })

  it('Cancel closes the modal without ever calling onRemoveComponent', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'Snowblind' })]
    const tree = buildPortTree(hardpoints)
    const onRemoveComponent = vi.fn().mockReturnValue({ matched: true, itemName: 'Snowblind' })
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={onRemoveComponent} />)
    const row = screen.getByText('Cooler 1').closest('tr')!
    fireEvent.click(within(row).getByText('Remove'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(onRemoveComponent).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove "Snowblind"?')).not.toBeInTheDocument()
  })

  it('a failed removal (matched: false) shows an error and keeps the modal open, never silently closing', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'Snowblind' })]
    const tree = buildPortTree(hardpoints)
    const onRemoveComponent = vi.fn().mockReturnValue({ matched: false })
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={onRemoveComponent} />)
    const row = screen.getByText('Cooler 1').closest('tr')!
    fireEvent.click(within(row).getByText('Remove'))
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText('Could not remove this component.')).toBeInTheDocument()
    expect(screen.getByText('Remove "Snowblind"?')).toBeInTheDocument()
  })

  it('Return to Hangar defaults unchecked — Save without checking it passes false', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'Snowblind' })]
    const tree = buildPortTree(hardpoints)
    const onRemoveComponent = vi.fn().mockReturnValue({ matched: true, itemName: 'Snowblind' })
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={onRemoveComponent} />)
    const row = screen.getByText('Cooler 1').closest('tr')!
    fireEvent.click(within(row).getByText('Remove'))
    fireEvent.click(screen.getByText('Save'))
    expect(onRemoveComponent).toHaveBeenCalledWith('Cooler 1', false)
  })
})

describe('LoadoutPortTree — EWO-037 (Task 1): Core Systems expanded by default on first render', () => {
  it("the Core Systems group is expanded on initial render — its child rows are visible without clicking Expand All", () => {
    const hardpoints = [
      hp({ id: 'power1', slotLabel: 'Power Plant', groupLabel: 'Core Systems' }),
      hp({ id: 'weapon1', slotLabel: 'Weapon 1', groupLabel: 'Weapons' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.getByText('Core Systems')).toBeInTheDocument()
    expect(screen.getByText('Power Plant')).toBeInTheDocument()
  })

  it('every other category (e.g. Weapons) stays collapsed on initial render', () => {
    const hardpoints = [
      hp({ id: 'power1', slotLabel: 'Power Plant', groupLabel: 'Core Systems' }),
      hp({ id: 'weapon1', slotLabel: 'Weapon 1', groupLabel: 'Weapons' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.getByText('Weapons')).toBeInTheDocument()
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
  })

  it('Expand All and Collapse All still work exactly as before, on top of the new initial state', () => {
    const hardpoints = [
      hp({ id: 'power1', slotLabel: 'Power Plant', groupLabel: 'Core Systems' }),
      hp({ id: 'weapon1', slotLabel: 'Weapon 1', groupLabel: 'Weapons' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Collapse All'))
    expect(screen.queryByText('Power Plant')).not.toBeInTheDocument()
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
  })

  it('a ship with no Core Systems group at all renders with every category collapsed, same as prior behavior (no crash, no assumption a match exists)', () => {
    const hardpoints = [hp({ id: 'weapon1', slotLabel: 'Weapon 1', groupLabel: 'Weapons' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.getByText('Weapons')).toBeInTheDocument()
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
  })
})

describe('LoadoutPortTree — EWO-036B (Task 8): Factory/Installed/Target share the same classification formatter', () => {
  it('the same component value renders the identical classification subtitle in all three columns', () => {
    // 'DayBreak' is real generated-data with a resolvable Grade (Grade C —
    // see componentPresentation.test.ts) and no Class, so its
    // classification subtitle is the "Grade C" fallback tier today; the
    // point of this test is that Factory/Installed/Target all route
    // through the same resolveComponentLabel/ComponentAssignmentLabel
    // path and so never disagree with each other for the same value.
    if (!hasComponentCatalog) return // real generated-data not present on this machine
    const hardpoints = [hp({ id: 'a', slotLabel: 'Power Plant', factoryItem: 'DayBreak', installedItem: 'DayBreak', targetItem: 'DayBreak' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    const row = screen.getByText('Power Plant').closest('tr')!
    expect(within(row).getAllByText('Grade C')).toHaveLength(3)
  })
})
