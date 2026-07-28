import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import LoadoutPortTree from '../LoadoutPortTree'
import { buildPortTree } from '../../utils/portTree'
import { hasComponentCatalog, resolveComponentByEntityClass } from '../../generated/componentCatalog'
import { withComponentOwnedChildSlots } from '../../utils/componentOwnedSlots'
import { getMiningModuleSlotCount } from '../../generated/miningModuleSlots'
import { getMissileRackSlotSpec } from '../../generated/missileRackSlots'
import type { Hardpoint } from '../../types'

afterEach(cleanup)

function hp(overrides: Partial<Hardpoint> & Pick<Hardpoint, 'id' | 'slotLabel'>): Hardpoint {
  return {
    shipId: 'ship', buildId: 'build', type: 'Weapon', size: 'S2',
    factoryItem: 'Item', installedItem: 'Item', targetItem: 'Item', status: 'OK',
    ...overrides,
  }
}

/** A row/group header's expand/collapse chevron is its own <button>,
 * sibling to (not wrapping) the label text — clicking the label text
 * itself does not activate it. Finds the row by its visible label, then
 * clicks the actual toggle button within that same row. */
function clickToggle(labelText: string) {
  const label = screen.getByText(labelText)
  const button = label.closest('div')!.querySelector('button')!
  fireEvent.click(button)
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
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('a Remove action appears on an installed, non-structural row when onRemoveComponent is provided', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={() => ({ matched: true, itemName: 'SnowBlind' })} />)
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
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' })]
    const tree = buildPortTree(hardpoints)
    const onRemoveComponent = vi.fn().mockReturnValue({ matched: true, itemName: 'SnowBlind' })
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={onRemoveComponent} />)
    const row = screen.getByText('Cooler 1').closest('tr')!
    fireEvent.click(within(row).getByText('Remove'))
    expect(screen.getByText('Remove "SnowBlind"?')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Return removed component to Hangar'))
    fireEvent.click(screen.getByText('Save'))
    expect(onRemoveComponent).toHaveBeenCalledWith('Cooler 1', true)
    expect(screen.queryByText('Remove "SnowBlind"?')).not.toBeInTheDocument()
  })

  it('Cancel closes the modal without ever calling onRemoveComponent', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' })]
    const tree = buildPortTree(hardpoints)
    const onRemoveComponent = vi.fn().mockReturnValue({ matched: true, itemName: 'SnowBlind' })
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={onRemoveComponent} />)
    const row = screen.getByText('Cooler 1').closest('tr')!
    fireEvent.click(within(row).getByText('Remove'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(onRemoveComponent).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove "SnowBlind"?')).not.toBeInTheDocument()
  })

  it('a failed removal (matched: false) shows an error and keeps the modal open, never silently closing', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' })]
    const tree = buildPortTree(hardpoints)
    const onRemoveComponent = vi.fn().mockReturnValue({ matched: false })
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={onRemoveComponent} />)
    const row = screen.getByText('Cooler 1').closest('tr')!
    fireEvent.click(within(row).getByText('Remove'))
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText('Could not remove this component.')).toBeInTheDocument()
    expect(screen.getByText('Remove "SnowBlind"?')).toBeInTheDocument()
  })

  it('Return to Hangar defaults unchecked — Save without checking it passes false', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' })]
    const tree = buildPortTree(hardpoints)
    const onRemoveComponent = vi.fn().mockReturnValue({ matched: true, itemName: 'SnowBlind' })
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} onRemoveComponent={onRemoveComponent} />)
    const row = screen.getByText('Cooler 1').closest('tr')!
    fireEvent.click(within(row).getByText('Remove'))
    fireEvent.click(screen.getByText('Save'))
    expect(onRemoveComponent).toHaveBeenCalledWith('Cooler 1', false)
  })
})

describe('LoadoutPortTree — EWO-037 (Task 1): Core Components expanded by default on first render', () => {
  it("the Core Components group is expanded on initial render — its child rows are visible without clicking Expand All", () => {
    const hardpoints = [
      hp({ id: 'power1', slotLabel: 'Power Plant', groupLabel: 'Core Components' }),
      hp({ id: 'weapon1', slotLabel: 'Weapon 1', groupLabel: 'Weapons' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.getByText('Core Components')).toBeInTheDocument()
    expect(screen.getByText('Power Plant')).toBeInTheDocument()
  })

  it('every other category (e.g. Weapons) stays collapsed on initial render', () => {
    const hardpoints = [
      hp({ id: 'power1', slotLabel: 'Power Plant', groupLabel: 'Core Components' }),
      hp({ id: 'weapon1', slotLabel: 'Weapon 1', groupLabel: 'Weapons' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.getByText('Weapons')).toBeInTheDocument()
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
  })

  it('Expand All and Collapse All still work exactly as before, on top of the new initial state', () => {
    const hardpoints = [
      hp({ id: 'power1', slotLabel: 'Power Plant', groupLabel: 'Core Components' }),
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

  it('a ship with no Core Components group at all renders with every category collapsed, same as prior behavior (no crash, no assumption a match exists)', () => {
    const hardpoints = [hp({ id: 'weapon1', slotLabel: 'Weapon 1', groupLabel: 'Weapons' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.getByText('Weapons')).toBeInTheDocument()
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
  })
})

describe('LoadoutPortTree — EWO-036B (Task 8): Factory/Installed/Target share the same classification formatter', () => {
  it('the same component value renders the identical identity subtitle in all three columns', () => {
    // 'DayBreak' is real generated-data (CAT-001): Classification
    // "Civilian", Grade 3 -> "Civilian C". The point of this test is that
    // Factory/Installed/Target all route through the same
    // resolveComponentLabel/ComponentAssignmentLabel path and so never
    // disagree with each other for the same value.
    if (!hasComponentCatalog) return // real generated-data not present on this machine
    const hardpoints = [hp({ id: 'a', slotLabel: 'Power Plant', factoryItem: 'DayBreak', installedItem: 'DayBreak', targetItem: 'DayBreak' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    const row = screen.getByText('Power Plant').closest('tr')!
    expect(within(row).getAllByText('Civilian C')).toHaveLength(3)
  })
})

const PDC_ENTITY_CLASS = 'Turret_PDC_BEHR_A'
const hasCatalog = resolveComponentByEntityClass(PDC_ENTITY_CLASS).status === 'resolved'

describe('LoadoutPortTree — FTB-001A (Workstream A): Point Defense Cannon subgrouping', () => {
  it('PDC ports render nested under a "Point Defense Cannons" header, and conventional turret entries remain correctly grouped alongside it', () => {
    if (!hasCatalog) return
    const hardpoints = [
      hp({ id: 'turret', slotLabel: 'Front Lower Turret', groupLabel: 'Manned Turrets', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'weapon-mount', slotLabel: 'Left Weapon Mount', parentSlotLabel: 'Front Lower Turret' }),
      hp({ id: 'pdc1', slotLabel: 'Pdc Top 01', parentSlotLabel: 'Front Lower Turret', factoryEntityClass: PDC_ENTITY_CLASS }),
      hp({ id: 'pdc2', slotLabel: 'Pdc Top 02', parentSlotLabel: 'Front Lower Turret', factoryEntityClass: PDC_ENTITY_CLASS }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    // FTB-001A (Workstream B): recursive expansion means ONE click on the
    // top-level category already reveals the complete descendant tree —
    // "Front Lower Turret", "Left Weapon Mount", the "Point Defense
    // Cannons" subgroup, AND the PDCs themselves — never requiring a
    // separate click per level.
    clickToggle('Manned Turrets')
    expect(screen.getByText('Front Lower Turret')).toBeInTheDocument()
    expect(screen.getByText('Left Weapon Mount')).toBeInTheDocument()
    expect(screen.getByText('Point Defense Cannons')).toBeInTheDocument()
    expect(screen.getByText('Pdc Top 01')).toBeInTheDocument()
    expect(screen.getByText('Pdc Top 02')).toBeInTheDocument()
  })

  it('a ship with no PDC-capable ports never shows a "Point Defense Cannons" group', () => {
    const hardpoints = [hp({ id: 'a', slotLabel: 'Weapon 1', groupLabel: 'Weapons' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.queryByText('Point Defense Cannons')).not.toBeInTheDocument()
  })
})

describe('LoadoutPortTree — FTB-001A (Workstream B): recursive expand/collapse', () => {
  it('expanding a top-level category reveals its complete descendant tree in one click, across three real hierarchy depths (category -> turret -> mount -> weapon)', () => {
    const hardpoints = [
      hp({ id: 'turret', slotLabel: 'Turret', groupLabel: 'Manned Turrets', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'mount', slotLabel: 'Mount', parentSlotLabel: 'Turret', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'weapon', slotLabel: 'Weapon', parentSlotLabel: 'Mount' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    expect(screen.queryByText('Turret')).not.toBeInTheDocument()
    clickToggle('Manned Turrets')
    // One click on the top-level category reveals ALL three deeper levels
    // at once — Turret, Mount, and Weapon — not just the immediate child.
    expect(screen.getByText('Turret')).toBeInTheDocument()
    expect(screen.getByText('Mount')).toBeInTheDocument()
    expect(screen.getByText('Weapon')).toBeInTheDocument()
  })

  it('collapsing that same top-level category hides the complete descendant tree again in one click', () => {
    const hardpoints = [
      hp({ id: 'turret', slotLabel: 'Turret', groupLabel: 'Manned Turrets', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'mount', slotLabel: 'Mount', parentSlotLabel: 'Turret', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'weapon', slotLabel: 'Weapon', parentSlotLabel: 'Mount' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    clickToggle('Manned Turrets')
    expect(screen.getByText('Weapon')).toBeInTheDocument()
    clickToggle('Manned Turrets')
    expect(screen.queryByText('Turret')).not.toBeInTheDocument()
    expect(screen.queryByText('Mount')).not.toBeInTheDocument()
    expect(screen.queryByText('Weapon')).not.toBeInTheDocument()
  })

  it('a nested row can still be independently expanded/collapsed on its own after its parent category was expanded', () => {
    const hardpoints = [
      hp({ id: 'mountA', slotLabel: 'Mount A', groupLabel: 'Weapons' }),
      hp({ id: 'gunA', slotLabel: 'Gun A', parentSlotLabel: 'Mount A' }),
      hp({ id: 'mountB', slotLabel: 'Mount B', groupLabel: 'Weapons' }),
      hp({ id: 'gunB', slotLabel: 'Gun B', parentSlotLabel: 'Mount B' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    clickToggle('Weapons')
    expect(screen.getByText('Gun A')).toBeInTheDocument()
    expect(screen.getByText('Gun B')).toBeInTheDocument()
    // Collapsing only Mount A must not affect Mount B's own independent state.
    clickToggle('Mount A')
    expect(screen.queryByText('Gun A')).not.toBeInTheDocument()
    expect(screen.getByText('Gun B')).toBeInTheDocument()
  })
})

describe('LoadoutPortTree — FTB-001A (Workstream C): mining module slots', () => {
  it('a mining head with real, source-derived module slots renders the correct number of "Module Slot N" children when expanded', () => {
    const arborMH2 = 'Mining_Laser_GRIN_Arbor_S2'
    if (getMiningModuleSlotCount(arborMH2) === 0) return // generated-data/mining-module-slots.json not present on this machine
    const hardpoints = withComponentOwnedChildSlots(
      [hp({ id: 'laser', slotLabel: 'Mining Laser', installedEntityClass: arborMH2, factoryEntityClass: arborMH2, targetEntityClass: arborMH2 })],
      (host, n) =>
        hp({
          id: `${host.id}-slot-${n}`,
          slotLabel: `${host.slotLabel} — Module Slot ${n}`,
          parentSlotLabel: host.slotLabel,
          isStructural: true,
          factoryItem: '—',
          installedItem: '—',
          targetItem: '—',
        })
    )
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    clickToggle('Mining Laser')
    // formatHardpointLabel renders only a nested row's own leaf segment
    // (ancestor context is already conveyed by indentation) — the
    // canonical, fully-qualified slotLabel used for tree-linking stays
    // "Mining Laser — Module Slot N" underneath.
    expect(screen.getByText('Module Slot 1')).toBeInTheDocument()
    expect(screen.getByText('Module Slot 2')).toBeInTheDocument()
    expect(screen.queryByText('Module Slot 3')).not.toBeInTheDocument()
  })
})

describe('LoadoutPortTree — FTB-001B/EWO-054: dynamic missile rack rendering', () => {
  const POLARIS_RACK = 'MRCK_S10_RSI_Polaris_Right' // 8 slots @ S3
  const TALON_RACK = 'MRCK_S04_ESPR_Talon' // 12 slots @ S3 — a real, different rack

  it('a factory rack whose Target is changed to a different real rack collapses to ONE aggregate row showing the NEW rack\'s own source-derived quantity, not the old factory count, and never a per-slot row', () => {
    if (getMissileRackSlotSpec(POLARIS_RACK) === null) return // generated-data/missile-rack-slots.json not present on this machine
    const staleFactoryChildren = Array.from({ length: 8 }, (_, i) =>
      hp({ id: `stale-${i + 1}`, slotLabel: `Right Missile Rack — Missile Slot ${i + 1}`, parentSlotLabel: 'Right Missile Rack', type: 'Missile', size: 'S3' })
    )
    const hardpoints = withComponentOwnedChildSlots(
      [
        // Deliberately no `installedEntityClass` — only Target has
        // changed (a Commander previewing the swap before installing).
        hp({ id: 'rack', slotLabel: 'Right Missile Rack', type: 'Missile Rack', size: 'S10', factoryEntityClass: POLARIS_RACK, targetEntityClass: TALON_RACK }),
        ...staleFactoryChildren,
      ],
      (host, n, spec) =>
        hp({ id: `${host.id}-slot-${n}`, slotLabel: `${host.slotLabel} — ${spec.label} Slot ${n}`, parentSlotLabel: host.slotLabel, type: 'Missile', size: spec.size ? `S${spec.size}` : host.size })
    )
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    clickToggle('Right Missile Rack')
    // One aggregate row for the new (Talon) rack's real 12-slot capacity...
    expect(screen.getAllByText('×12').length).toBeGreaterThan(0)
    // ...never the old Polaris 8-slot shape...
    expect(screen.queryByText('×8')).not.toBeInTheDocument()
    // ...and never a per-slot row — the aggregate stands in for all of them.
    expect(screen.queryByText(/Missile Slot/)).not.toBeInTheDocument()
  })

  it('a rack whose real per-slot children currently disagree (legacy/imported mixed data) is surfaced as an explicit Inconsistent state, never one child\'s value silently shown as the answer', () => {
    if (getMissileRackSlotSpec(POLARIS_RACK) === null) return
    const hardpoints = [
      hp({ id: 'rack', slotLabel: 'Right Missile Rack', type: 'Missile Rack', size: 'S10', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK }),
      hp({ id: 'slot-1', slotLabel: 'Right Missile Rack — Missile Slot 1', parentSlotLabel: 'Right Missile Rack', type: 'Missile', size: 'S3', targetItem: 'TaskForce I' }),
      hp({ id: 'slot-2', slotLabel: 'Right Missile Rack — Missile Slot 2', parentSlotLabel: 'Right Missile Rack', type: 'Missile', size: 'S3', targetItem: 'Rattler II' }),
      ...Array.from({ length: 6 }, (_, i) =>
        hp({ id: `slot-${i + 3}`, slotLabel: `Right Missile Rack — Missile Slot ${i + 3}`, parentSlotLabel: 'Right Missile Rack', type: 'Missile', size: 'S3', targetItem: 'TaskForce I' })
      ),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    clickToggle('Right Missile Rack')
    expect(screen.getByText('Inconsistent — Select Missile')).toBeInTheDocument()
  })
})

describe('LoadoutPortTree — SW-007B: identity iconography', () => {
  function rowIconClass(slotLabel: string): string {
    const label = screen.getByText(slotLabel)
    const row = label.closest('tr') as HTMLElement
    const icon = row.querySelector('svg') as SVGElement
    return icon.getAttribute('class') ?? ''
  }

  it('every port row renders exactly one identity icon, distinct per category, never replacing the operational label', () => {
    const hardpoints = [
      hp({ id: 'cooler', slotLabel: 'Left Cooler', type: 'Cooler' }),
      hp({ id: 'power', slotLabel: 'Power Plant', type: 'Power Plant' }),
      hp({ id: 'shield', slotLabel: 'Left Shield Generator', type: 'Shield' }),
      hp({ id: 'radar', slotLabel: 'Radar', type: 'Radar' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    // Operational labels remain the authoritative, unchanged text.
    for (const h of hardpoints) expect(screen.getByText(h.slotLabel)).toBeInTheDocument()
    const coolerIcon = rowIconClass('Left Cooler')
    const powerIcon = rowIconClass('Power Plant')
    const shieldIcon = rowIconClass('Left Shield Generator')
    const radarIcon = rowIconClass('Radar')
    // Every category gets its own distinct icon — no two of these four share one.
    expect(new Set([coolerIcon, powerIcon, shieldIcon, radarIcon]).size).toBe(4)
  })

  it('a Manned Turret assembly and an ordinary Pilot Weapon mount share the identical "Gimbal Mount" type but render distinct icons — assemblyRole, not type alone, decides identity', () => {
    const hardpoints = [
      hp({ id: 'turret', slotLabel: 'Left Turret (Manned Turret)', type: 'Gimbal Mount', assemblyRole: 'MANNED_TURRET', isStructural: true }),
      hp({ id: 'mount', slotLabel: 'Nose Weapon (Gimbal Mount)', type: 'Gimbal Mount', assemblyRole: 'GIMBAL_MOUNT' }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    // formatHardpointLabel presents "Nose Weapon (Gimbal Mount)" as "Nose
    // Weapon Mount" — the mount's canonical slotLabel is unaffected.
    // EWO-069B (Part A) — "Left Turret (Manned Turret)" now displays as
    // "Left Turret" (the redundant parenthetical stripped); the raw
    // slotLabel above is untouched.
    expect(rowIconClass('Left Turret')).not.toBe(rowIconClass('Nose Weapon Mount'))
  })

  it('a Remote Turret gets its own distinct icon from a Manned Turret', () => {
    const hardpoints = [
      hp({ id: 'manned', slotLabel: 'Left Turret (Manned Turret)', type: 'Gimbal Mount', assemblyRole: 'MANNED_TURRET', isStructural: true }),
      hp({ id: 'remote', slotLabel: 'Tail Turret (Remote Turret)', type: 'Gimbal Mount', assemblyRole: 'REMOTE_TURRET', isStructural: true }),
    ]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    // EWO-069B (Part A) — "(Manned Turret)" is stripped from display,
    // "(Remote Turret)" is deliberately untouched (never named by that
    // mission's own examples).
    expect(rowIconClass('Left Turret')).not.toBe(rowIconClass('Tail Turret (Remote Turret)'))
  })

  it('an unrecognized type falls back to the generic Miscellaneous icon rather than rendering nothing', () => {
    const hardpoints = [hp({ id: 'x', slotLabel: 'Something Unusual', type: 'SomeFutureUnseenType' })]
    const tree = buildPortTree(hardpoints)
    render(<LoadoutPortTree tree={tree} reservations={[]} hangarItems={[]} installedLoadouts={[]} />)
    const row = screen.getByText('Something Unusual').closest('tr') as HTMLElement
    expect(row.querySelector('svg')).toBeTruthy()
  })
})
