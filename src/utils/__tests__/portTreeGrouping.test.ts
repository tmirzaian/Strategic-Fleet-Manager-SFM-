import { describe, it, expect } from 'vitest'
import { groupPortTree, flattenDisplayTree } from '../portTreeGrouping'
import { buildPortTree } from '../portTree'
import type { Hardpoint } from '../../types'

function hp(overrides: Partial<Hardpoint> & Pick<Hardpoint, 'id' | 'slotLabel'>): Hardpoint {
  return {
    shipId: 'ship', buildId: 'build', type: 'Weapon', size: 'S2',
    factoryItem: 'Item', installedItem: 'Item', targetItem: 'Item', status: 'OK',
    ...overrides,
  }
}

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
