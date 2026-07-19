import { describe, it, expect } from 'vitest'
import { groupPortTree, flattenDisplayTree, displayNodeIds } from '../portTreeGrouping'
import { buildPortTree } from '../portTree'
import { resolveComponentByEntityClass } from '../../generated/componentCatalog'
import type { Hardpoint } from '../../types'

function hp(overrides: Partial<Hardpoint> & Pick<Hardpoint, 'id' | 'slotLabel'>): Hardpoint {
  return {
    shipId: 'ship', buildId: 'build', type: 'Weapon', size: 'S2',
    factoryItem: 'Item', installedItem: 'Item', targetItem: 'Item', status: 'OK',
    ...overrides,
  }
}

// FTB-001A — real catalog fixture: `Turret_PDC_BEHR_A` is category Turret,
// subtype PDCTurret, size 2 (confirmed by CAT-003/EWO-STAB-004A's own
// direct audit — see src/data/__tests__/pdcCompatibility.test.ts). Guards
// on the generated catalog being present on this machine, matching every
// other PDC-dependent test in this codebase.
const PDC_ENTITY_CLASS = 'Turret_PDC_BEHR_A'
const hasCatalog = resolveComponentByEntityClass(PDC_ENTITY_CLASS).status === 'resolved'

describe('groupPortTree — EWO-019B generic hierarchy', () => {
  it('leaves ungrouped top-level nodes unchanged, in original order (no groupLabel = no regression)', () => {
    const flat = [hp({ id: 'a', slotLabel: 'Power Plant' }), hp({ id: 'b', slotLabel: 'Radar' })]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    expect(display).toHaveLength(2)
    expect(display.every((d) => d.kind === 'port')).toBe(true)
    expect(display.map((d) => (d.kind === 'port' ? d.node.hardpoint.slotLabel : ''))).toEqual(['Power Plant', 'Radar'])
  })

  it('groups sibling top-level nodes sharing the same groupLabel under one synthetic header, preserving first-seen order', () => {
    const flat = [
      hp({ id: 'a', slotLabel: 'Weapon A', groupLabel: 'Weapons' }),
      hp({ id: 'b', slotLabel: 'Power Plant' }),
      hp({ id: 'c', slotLabel: 'Weapon B', groupLabel: 'Weapons' }),
    ]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    expect(display).toHaveLength(2) // one "Weapons" group + one ungrouped Power Plant
    expect(display[0]).toMatchObject({ kind: 'group', label: 'Weapons' })
    if (display[0].kind === 'group') {
      expect(display[0].children).toHaveLength(2)
      expect(display[0].children.map((c) => (c.kind === 'port' ? c.node.hardpoint.slotLabel : ''))).toEqual(['Weapon A', 'Weapon B'])
    }
    expect(display[1]).toMatchObject({ kind: 'port' })
  })

  it('a real child (via parentSlotLabel) stays nested under its own parent port node inside the group — no double-grouping of children', () => {
    const flat = [
      hp({ id: 'mount', slotLabel: 'Nose Weapon', groupLabel: 'Weapons' }),
      hp({ id: 'gun', slotLabel: 'Gun', parentSlotLabel: 'Nose Weapon' }),
    ]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    expect(display).toHaveLength(1)
    expect(display[0].kind).toBe('group')
    if (display[0].kind === 'group') {
      expect(display[0].children).toHaveLength(1)
      const mountNode = display[0].children[0]
      expect(mountNode.kind).toBe('port')
      if (mountNode.kind === 'port') {
        expect(mountNode.node.children).toHaveLength(1)
        expect(mountNode.node.children[0].hardpoint.slotLabel).toBe('Gun')
      }
    }
  })

  it('a lone orphaned child still gets wrapped under its group header (Quantum Drive -> Jump Module, Eclipse-shaped fixture)', () => {
    const flat = [hp({ id: 'jd', slotLabel: 'Jump Drive', groupLabel: 'Quantum Drive', factoryItem: 'Explorer', installedItem: 'Explorer', targetItem: 'Explorer' })]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    expect(display).toHaveLength(1)
    expect(display[0]).toMatchObject({ kind: 'group', label: 'Quantum Drive' })
    if (display[0].kind === 'group') {
      expect(display[0].children).toHaveLength(1)
      expect(display[0].children[0].kind === 'port' && display[0].children[0].node.hardpoint.factoryItem).toBe('Explorer')
    }
  })

  it('a real parent/child pair (Gladius-shaped fixture) needs no synthetic group at all when a real Quantum Drive port survives', () => {
    const flat = [
      hp({ id: 'qd', slotLabel: 'Quantum Drive', groupLabel: 'Quantum Drive', factoryItem: 'Beacon', installedItem: 'Beacon', targetItem: 'Beacon' }),
      hp({ id: 'jd', slotLabel: 'Jump Drive', parentSlotLabel: 'Quantum Drive', factoryItem: 'Explorer', installedItem: 'Explorer', targetItem: 'Explorer' }),
    ]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    expect(display).toHaveLength(1)
    expect(display[0].kind).toBe('group')
    if (display[0].kind === 'group') {
      expect(display[0].children).toHaveLength(1) // the real Quantum Drive port itself
      const qdNode = display[0].children[0]
      expect(qdNode.kind === 'port' && qdNode.node.hardpoint.factoryItem).toBe('Beacon')
      if (qdNode.kind === 'port') {
        expect(qdNode.node.children).toHaveLength(1)
        expect(qdNode.node.children[0].hardpoint.factoryItem).toBe('Explorer')
      }
    }
  })

  it('does not mutate or otherwise alter hardpoint data — same object references throughout', () => {
    const original = hp({ id: 'a', slotLabel: 'Weapon A', groupLabel: 'Weapons' })
    const tree = buildPortTree([original])
    const display = groupPortTree(tree)
    const found = display[0].kind === 'group' ? display[0].children[0] : display[0]
    expect(found.kind === 'port' && found.node.hardpoint).toBe(original)
  })
})

describe('flattenDisplayTree', () => {
  it('includes group headers and every real node, depth-first', () => {
    const flat = [
      hp({ id: 'mount', slotLabel: 'Nose Weapon', groupLabel: 'Weapons' }),
      hp({ id: 'gun', slotLabel: 'Gun', parentSlotLabel: 'Nose Weapon' }),
      hp({ id: 'radar', slotLabel: 'Radar' }),
    ]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    const flattened = flattenDisplayTree(display)
    expect(flattened.map((n) => (n.kind === 'group' ? `group:${n.label}` : n.node.hardpoint.slotLabel))).toEqual(['group:Weapons', 'Nose Weapon', 'Gun', 'Radar'])
  })
})

describe('groupPortTree — FTB-001A (Workstream A): Point Defense Cannon subgrouping', () => {
  it('PDC-capable siblings are pulled into a "Point Defense Cannons" subgroup, nested beneath their real turret-assembly parent, leaving conventional siblings untouched (the real Polaris-shaped case)', () => {
    if (!hasCatalog) return
    const flat = [
      hp({ id: 'turret', slotLabel: 'Front Lower Turret', groupLabel: 'Manned Turrets', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'weapon-mount', slotLabel: 'Left Weapon Mount', parentSlotLabel: 'Front Lower Turret' }),
      hp({ id: 'pdc1', slotLabel: 'Pdc Top 01', parentSlotLabel: 'Front Lower Turret', factoryEntityClass: PDC_ENTITY_CLASS }),
      hp({ id: 'pdc2', slotLabel: 'Pdc Top 02', parentSlotLabel: 'Front Lower Turret', factoryEntityClass: PDC_ENTITY_CLASS }),
    ]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    expect(display).toHaveLength(1)
    expect(display[0].kind).toBe('group') // "Manned Turrets"
    if (display[0].kind !== 'group') return
    const turretNode = display[0].children[0]
    expect(turretNode.kind).toBe('port')
    if (turretNode.kind !== 'port') return
    // Children of the turret: the conventional weapon mount, plus one
    // synthetic "Point Defense Cannons" group wrapping both PDCs.
    expect(turretNode.children).toHaveLength(2)
    const weaponChild = turretNode.children.find((c) => c.kind === 'port' && c.node.hardpoint.slotLabel === 'Left Weapon Mount')
    expect(weaponChild).toBeDefined()
    const pdcGroup = turretNode.children.find((c) => c.kind === 'group')
    expect(pdcGroup).toBeDefined()
    if (pdcGroup?.kind !== 'group') return
    expect(pdcGroup.label).toBe('Point Defense Cannons')
    expect(pdcGroup.children.map((c) => c.kind === 'port' && c.node.hardpoint.slotLabel)).toEqual(['Pdc Top 01', 'Pdc Top 02'])
  })

  it('a ship with no PDC-capable ports anywhere produces no "Point Defense Cannons" group at all', () => {
    const flat = [hp({ id: 'weapon', slotLabel: 'Weapon 1', groupLabel: 'Weapons' })]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    const flattened = flattenDisplayTree(display)
    expect(flattened.some((n) => n.kind === 'group' && n.label === 'Point Defense Cannons')).toBe(false)
  })

  it('a lone PDC-capable port still gets its own subgroup (capability-driven, not a >=2 threshold)', () => {
    if (!hasCatalog) return
    const flat = [
      hp({ id: 'turret', slotLabel: 'Turret', groupLabel: 'Manned Turrets', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'pdc', slotLabel: 'Pdc 01', parentSlotLabel: 'Turret', factoryEntityClass: PDC_ENTITY_CLASS }),
    ]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    if (display[0].kind !== 'group') throw new Error('expected group')
    const turretNode = display[0].children[0]
    if (turretNode.kind !== 'port') throw new Error('expected port')
    expect(turretNode.children).toHaveLength(1)
    expect(turretNode.children[0]).toMatchObject({ kind: 'group', label: 'Point Defense Cannons' })
  })

  it('PDC grouping never changes canonical identity or compatibility data — the underlying hardpoint objects are untouched', () => {
    if (!hasCatalog) return
    const original = hp({ id: 'pdc', slotLabel: 'Pdc 01', factoryEntityClass: PDC_ENTITY_CLASS })
    const tree = buildPortTree([original])
    const display = groupPortTree(tree)
    const pdcGroup = display.find((n) => n.kind === 'group' && n.label === 'Point Defense Cannons')
    expect(pdcGroup?.kind === 'group' && pdcGroup.children[0].kind === 'port' && pdcGroup.children[0].node.hardpoint).toBe(original)
  })
})

describe('displayNodeIds — FTB-001A (Workstream B): recursive expand/collapse primitive', () => {
  it('returns a node\'s own id plus every descendant id, depth-first, across three real hierarchy depths (category -> turret -> mount -> weapon)', () => {
    const flat = [
      hp({ id: 'turret', slotLabel: 'Turret', groupLabel: 'Manned Turrets', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'mount', slotLabel: 'Mount', parentSlotLabel: 'Turret', isStructural: true, factoryItem: '—', installedItem: '—', targetItem: '—' }),
      hp({ id: 'weapon', slotLabel: 'Weapon', parentSlotLabel: 'Mount' }),
    ]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    expect(display).toHaveLength(1)
    // display[0] is the "Manned Turrets" synthetic group header.
    const ids = displayNodeIds(display[0])
    expect(ids).toEqual(['group-Manned Turrets-turret', 'turret', 'mount', 'weapon'])
  })

  it('a leaf node with no children returns only its own id', () => {
    const flat = [hp({ id: 'radar', slotLabel: 'Radar' })]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    expect(displayNodeIds(display[0])).toEqual(['radar'])
  })

  it('collecting ids from an intermediate node returns only ITS OWN subtree, not siblings or the parent group', () => {
    const flat = [
      hp({ id: 'mountA', slotLabel: 'Mount A', groupLabel: 'Weapons' }),
      hp({ id: 'gunA', slotLabel: 'Gun A', parentSlotLabel: 'Mount A' }),
      hp({ id: 'mountB', slotLabel: 'Mount B', groupLabel: 'Weapons' }),
      hp({ id: 'gunB', slotLabel: 'Gun B', parentSlotLabel: 'Mount B' }),
    ]
    const tree = buildPortTree(flat)
    const display = groupPortTree(tree)
    if (display[0].kind !== 'group') throw new Error('expected group')
    const mountANode = display[0].children[0]
    expect(displayNodeIds(mountANode)).toEqual(['mountA', 'gunA'])
  })
})
