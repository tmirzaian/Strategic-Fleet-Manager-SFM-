import { describe, it, expect, beforeEach } from 'vitest'
import { buildPortTree, flattenPortTree, derivePortValidation, derivePortLogistics } from '../portTree'
import { importedShipList } from '../../generated/importedShips'
import { useFleetStore } from '../../store/useFleetStore'
import { hardpoints as seedHardpoints, ships as seedShips } from '../../data/seed'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

// SW-006 Phase 1/2 — every ship's CUSTOM build (except M80/Starlite) is now
// constructed fresh from real canonical topology, not raw src/data/seed.ts
// exports (which hold only M80/Starlite's hand-authored data). Reads the
// live store for every other ship.
function rowsFor(shipId: string) {
  const s = useFleetStore.getState()
  const ship = s.ships.find((sh) => sh.id === shipId)!
  return s.hardpoints.filter((h) => h.buildId === ship.activeBuildId)
}

describe('buildPortTree — generic structural correctness', () => {
  it('15. preserves parent-child relationships exactly as declared by parentSlotLabel', () => {
    const rows = rowsFor('railen')
    const tree = buildPortTree(rows)
    const turret = tree.find((n) => n.hardpoint.slotLabel === 'Right Turret (Manned Turret)')!
    expect(turret.children.map((c) => c.hardpoint.slotLabel).sort()).toEqual([
      'Right Turret (Manned Turret) — Left Weapon (Gimbal Mount)',
      'Right Turret (Manned Turret) — Right Weapon (Gimbal Mount)',
    ])
  })

  it('12/13: flattening after building includes every descendant (Expand All semantics)', () => {
    const rows = rowsFor('mole')
    const tree = buildPortTree(rows)
    const flat = flattenPortTree(tree)
    expect(flat.length).toBe(rows.length)
  })

  it('a ship with no nested rows still produces a valid (flat) tree — never crashes on absence of hierarchy', () => {
    // Starlite is one of the two remaining hand-authored, flat-structure
    // seed fixtures (its own real seed.ts export, unaffected by SW-006).
    const tree = buildPortTree(seedHardpoints.filter((h) => h.buildId === seedShips.find((s) => s.id === 'starlite')!.activeBuildId))
    expect(Array.isArray(tree)).toBe(true)
    expect(tree.every((n) => n.children.length === 0)).toBe(true)
  })
})

describe('16/17/18/19: Railen golden fixture — no pilot gun, turret, or tractor port omitted (real canonical topology)', () => {
  const tree = buildPortTree(rowsFor('railen'))
  const topLevelLabels = tree.map((n) => n.hardpoint.slotLabel)

  it('16. renders all four pilot S4 weapon (gimbal mount) ports', () => {
    const pilotWeapons = tree.filter((n) => n.hardpoint.slotLabel.includes('Weapon 1 (Gimbal Mount)') || n.hardpoint.slotLabel.includes('Weapon 2 (Gimbal Mount)'))
    expect(pilotWeapons).toHaveLength(4)
    for (const w of pilotWeapons) expect(w.hardpoint.size).toBe('S4')
  })

  it('17. renders both manned turrets (Left and Right) as top-level nodes', () => {
    expect(topLevelLabels).toContain('Left Turret (Manned Turret)')
    expect(topLevelLabels).toContain('Right Turret (Manned Turret)')
  })

  it('18. each turret exposes its child S4 gimbal-mount weapon ports, not flattened away', () => {
    const leftTurret = tree.find((n) => n.hardpoint.slotLabel === 'Left Turret (Manned Turret)')!
    const rightTurret = tree.find((n) => n.hardpoint.slotLabel === 'Right Turret (Manned Turret)')!
    expect(leftTurret.children).toHaveLength(2)
    expect(rightTurret.children).toHaveLength(2)
    for (const child of [...leftTurret.children, ...rightTurret.children]) {
      expect(child.hardpoint.size).toBe('S4')
      expect(child.hardpoint.type).toBe('Gimbal Mount')
    }
  })

  it('19. renders tractor hardpoints', () => {
    expect(topLevelLabels).toContain('Tractor Left (Manned Turret)')
    expect(topLevelLabels).toContain('Tractor Right (Manned Turret)')
  })
})

describe('20/21: Gladius golden fixture — nose/wing weapons and missile rack hierarchy (imported ship data)', () => {
  it('imported Gladius equipment assignments include Nose/Left Wing/Right Wing Weapon', () => {
    const gladius = importedShipList.find((v) => v.ship.name === 'Gladius')!
    const names = gladius.equipmentAssignments.map((a) => a.displayName)
    expect(names).toContain('Nose Weapon')
    expect(names).toContain('Left Wing Weapon')
    expect(names).toContain('Right Wing Weapon')
  })

  it('missile rack / missile relationship is preserved (collapsed rack + type, not per-missile rows)', () => {
    const gladius = importedShipList.find((v) => v.ship.name === 'Gladius')!
    const rackAssignments = gladius.equipmentAssignments.filter((a) => a.equipmentGroup === 'Missiles')
    expect(rackAssignments.length).toBe(4)
  })
})

describe('22: MOLE golden fixture — mining turret / mining weapon hierarchy (real canonical topology)', () => {
  const tree = buildPortTree(rowsFor('mole'))

  it('renders three mining turret (manned turret) assemblies', () => {
    const turrets = tree.filter((n) => n.hardpoint.slotLabel.includes('Mining Laser (Manned Turret)') && !n.hardpoint.slotLabel.includes('—'))
    expect(turrets).toHaveLength(3)
  })

  it('each turret has a real Mining Laser child', () => {
    const turret = tree.find((n) => n.hardpoint.slotLabel === 'Front Cab Mining Laser (Manned Turret)')!
    expect(turret.children.map((c) => c.hardpoint.slotLabel)).toContain('Front Cab Mining Laser (Manned Turret) — Mining Weapon')
    expect(turret.children[0].hardpoint.type).toBe('Mining Laser')
  })
})

describe('23: Vulture golden fixture — salvage head hierarchy (real canonical topology)', () => {
  it('renders a salvage mount with a salvage head child, itself with two sub-item grandchildren', () => {
    const tree = buildPortTree(rowsFor('vulture'))
    const mount = tree.find((n) => n.hardpoint.slotLabel === 'Left Arm Salvage Head (Mount)')
    expect(mount).toBeDefined()
    const head = mount!.children.find((c) => c.hardpoint.slotLabel === 'Left Arm Salvage Head (Mount) — Laser Salvage Head (Mount)')
    expect(head).toBeDefined()
    expect(head!.children.map((c) => c.hardpoint.slotLabel)).toEqual([
      'Left Arm Salvage Head (Mount) — Laser Salvage Head (Mount) — SubItem01 Salvage Head',
      'Left Arm Salvage Head (Mount) — Laser Salvage Head (Mount) — SubItem02 Salvage Head',
    ])
  })
})

describe('24: Corsair golden fixture — full weapon/turret hierarchy, still Mission Ready (real canonical topology)', () => {
  it('renders the manned Remote Turret with two matched child weapons', () => {
    const tree = buildPortTree(rowsFor('corsair'))
    const turret = tree.find((n) => n.hardpoint.slotLabel === 'Tail Turret (Remote Turret)')!
    expect(turret.children).toHaveLength(2)
    for (const child of turret.children) expect(child.hardpoint.status).toBe('OK')
  })

  it("Corsair's complete custom Loadout state remains fully matched (deliberately zero overlay entries)", () => {
    const corsairBuild = useFleetStore.getState().builds.find((b) => b.id === 'corsair-gunship')!
    expect(corsairBuild.kind).toBe('CUSTOM')
    const allRows = rowsFor('corsair')
    const required = allRows.filter((h) => h.targetItem && h.targetItem !== '—' && h.status !== 'Unresolved')
    expect(required.every((h) => h.status === 'OK')).toBe(true)
  })
})

describe('25: Cutlass Black — turret hierarchy present (real canonical topology)', () => {
  it('the Missile Rack top-level ports never target FR-86 (a Shield)', () => {
    const tree = buildPortTree(rowsFor('cutlass-black'))
    const missileRackNodes = tree.filter((n) => n.hardpoint.type === 'Missile Rack')
    expect(missileRackNodes.length).toBeGreaterThan(0)
    for (const node of missileRackNodes) expect(node.hardpoint.targetItem).not.toBe('FR-86')
  })

  it('renders the manned Turret with two child weapons, plus a Tractor Turret port', () => {
    const tree = buildPortTree(rowsFor('cutlass-black'))
    const turret = tree.find((n) => n.hardpoint.slotLabel === 'Turret (Manned Turret)')!
    expect(turret.children).toHaveLength(2)
    expect(tree.map((n) => n.hardpoint.slotLabel)).toContain('Tractor Turret (Remote Turret)')
  })
})

describe('Mission M-011: shared port-tree source — Ship Detail and Loadout Manager must never diverge', () => {
  it('building the tree twice from the same store hardpoints for the same ship+build produces identical ids and structure', () => {
    for (const shipId of ['ghost', 'railen', 'mole', 'corsair', 'cutlass-black', 'vulture']) {
      const rows = rowsFor(shipId)
      const treeA = buildPortTree(rows)
      const treeB = buildPortTree(rows)
      const idsA = flattenPortTree(treeA).map((n) => n.hardpoint.id)
      const idsB = flattenPortTree(treeB).map((n) => n.hardpoint.id)
      expect(idsA).toEqual(idsB)
      expect(new Set(idsA).size).toBe(idsA.length) // every port id unique within the ship
    }
  })
})

describe('Mission M-011 / SW-006: Ghost Mk II wing weapons — real canonical gimbal-mount hierarchy', () => {
  it('exposes Left/Right Wing Weapon top-level gimbal mounts, each with a real Class 2 weapon child', () => {
    const tree = buildPortTree(rowsFor('ghost'))
    const left = tree.find((n) => n.hardpoint.slotLabel === 'Left Wing Weapon (Gimbal Mount)')
    const right = tree.find((n) => n.hardpoint.slotLabel === 'Right Wing Weapon (Gimbal Mount)')
    expect(left).toBeDefined()
    expect(right).toBeDefined()
    expect(left!.children.map((c) => c.hardpoint.slotLabel)).toEqual(['Left Wing Weapon (Gimbal Mount) — Class 2'])
    expect(right!.children.map((c) => c.hardpoint.slotLabel)).toEqual(['Right Wing Weapon (Gimbal Mount) — Class 2'])
  })

  it('the wing weapon mounts are always fully matched (never manufacture a new Missing item) — Ghost\'s overlay never touches weapons', () => {
    const tree = buildPortTree(rowsFor('ghost'))
    const left = tree.find((n) => n.hardpoint.slotLabel === 'Left Wing Weapon (Gimbal Mount)')!
    expect(left.hardpoint.status).toBe('OK')
  })
})

describe('26/27: derivePortValidation / logistics never fake OK or count invalid as matched', () => {
  it("26. an Unresolved row (M80's placeholder factory data) never reports VALIDATION: OK", () => {
    const m80Rows = rowsFor('m80')
    const unresolvedRow = m80Rows.find((h) => h.status === 'Unresolved')
    expect(unresolvedRow).toBeDefined()
    expect(derivePortValidation(unresolvedRow!)).toBe('Unresolved')
  })

  it('27. an Invalid Target row (M80 Atlas) never reports VALIDATION: OK and never counts as Installed logistics', () => {
    const m80Rows = rowsFor('m80')
    const invalidRow = m80Rows.find((h) => h.status === 'Invalid Target')!
    expect(derivePortValidation(invalidRow)).toBe('Invalid Target')
    expect(derivePortLogistics(invalidRow, [], [], [])).not.toBe('Installed')
  })
})