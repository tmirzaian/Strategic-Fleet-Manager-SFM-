import { describe, it, expect } from 'vitest'
import { buildPortTree, flattenPortTree, derivePortLogistics, derivePortValidation } from '../portTree'
import { ships, builds, hardpoints } from '../../data/seed'
import { importedShipList } from '../../generated/importedShips'

function rowsFor(shipId: string) {
  const ship = ships.find((s) => s.id === shipId)!
  return hardpoints.filter((h) => h.buildId === ship.activeBuildId)
}

describe('buildPortTree — generic structural correctness', () => {
  it('15. preserves parent-child relationships exactly as declared by parentSlotLabel', () => {
    const rows = rowsFor('railen')
    const tree = buildPortTree(rows)
    const portTurret = tree.find((n) => n.hardpoint.slotLabel === 'Port Turret')!
    expect(portTurret.children.map((c) => c.hardpoint.slotLabel).sort()).toEqual(['Port Turret Left Weapon', 'Port Turret Right Weapon'])
  })

  it('12/13: flattening after building includes every descendant (Expand All semantics)', () => {
    const rows = rowsFor('mole')
    const tree = buildPortTree(rows)
    const flat = flattenPortTree(tree)
    expect(flat.length).toBe(rows.length)
  })

  it('a ship with no nested rows still produces a valid (flat) tree — never crashes on absence of hierarchy', () => {
    const tree = buildPortTree(rowsFor('starlite'))
    expect(Array.isArray(tree)).toBe(true)
    expect(tree.every((n) => n.children.length === 0)).toBe(true)
  })
})

describe('16/17/18/19: Railen golden fixture — no pilot gun, turret, or tractor port omitted', () => {
  const tree = buildPortTree(rowsFor('railen'))
  const topLevelLabels = tree.map((n) => n.hardpoint.slotLabel)

  it('16. renders all four pilot S4 weapon ports', () => {
    const pilotWeapons = tree.filter((n) => n.hardpoint.slotLabel.startsWith('Pilot Weapon'))
    expect(pilotWeapons).toHaveLength(4)
    for (const w of pilotWeapons) expect(w.hardpoint.size).toBe('S4')
  })

  it('17. renders both side turrets (Port and Starboard) as top-level nodes', () => {
    expect(topLevelLabels).toContain('Port Turret')
    expect(topLevelLabels).toContain('Starboard Turret')
  })

  it('18. each turret exposes its child S3 weapon ports, not flattened away', () => {
    const portTurret = tree.find((n) => n.hardpoint.slotLabel === 'Port Turret')!
    const starboardTurret = tree.find((n) => n.hardpoint.slotLabel === 'Starboard Turret')!
    expect(portTurret.children).toHaveLength(2)
    expect(starboardTurret.children).toHaveLength(2)
    for (const child of [...portTurret.children, ...starboardTurret.children]) {
      expect(child.hardpoint.size).toBe('S3')
      expect(child.hardpoint.type).toBe('Weapon')
    }
  })

  it('19. renders tractor beam hardpoints', () => {
    expect(topLevelLabels).toContain('Fore Tractor Beam')
    expect(topLevelLabels).toContain('Aft Tractor Beam')
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

describe('22: MOLE golden fixture — mining turret / head / module hierarchy', () => {
  const tree = buildPortTree(rowsFor('mole'))

  it('renders two mining turret assemblies', () => {
    const turrets = tree.filter((n) => n.hardpoint.slotLabel.startsWith('Mining Turret'))
    expect(turrets).toHaveLength(2)
  })

  it('each turret has a mining head child', () => {
    const turret1 = tree.find((n) => n.hardpoint.slotLabel === 'Mining Turret 1')!
    expect(turret1.children.map((c) => c.hardpoint.slotLabel)).toContain('Mining Head 1')
  })

  it('mining head 1 has a mining module grandchild', () => {
    const turret1 = tree.find((n) => n.hardpoint.slotLabel === 'Mining Turret 1')!
    const head1 = turret1.children.find((c) => c.hardpoint.slotLabel === 'Mining Head 1')!
    expect(head1.children.map((c) => c.hardpoint.slotLabel)).toContain('Mining Module 1')
  })
})

describe('23: Vulture golden fixture — salvage mount / head hierarchy', () => {
  it('renders a salvage mount with a salvage head child, plus a tractor port', () => {
    const tree = buildPortTree(rowsFor('vulture'))
    const mount = tree.find((n) => n.hardpoint.slotLabel === 'Salvage Mount')!
    expect(mount).toBeDefined()
    expect(mount.children.map((c) => c.hardpoint.slotLabel)).toContain('Salvage Head')
    expect(tree.map((n) => n.hardpoint.slotLabel)).toContain('Tractor Beam')
  })
})

describe('24: Corsair golden fixture — full weapon/turret hierarchy, still Mission Ready', () => {
  it('renders the manned Remote Turret with two matched child weapons', () => {
    const tree = buildPortTree(rowsFor('corsair'))
    const turret = tree.find((n) => n.hardpoint.slotLabel === 'Remote Turret')!
    expect(turret.children).toHaveLength(2)
    for (const child of turret.children) expect(child.hardpoint.status).toBe('OK')
  })

  it("adding the turret never disturbed Corsair's complete custom Loadout state", () => {
    const corsairBuild = builds.find((b) => b.id === 'corsair-gunship')!
    // 'CUSTOM' is the original seed value; Alpha 2.2 treats it identically to 'MISSION'.
    expect(['CUSTOM', 'MISSION']).toContain(corsairBuild.kind)
    const allRows = rowsFor('corsair')
    const required = allRows.filter((h) => h.targetItem && h.targetItem !== '—' && h.status !== 'Unresolved')
    expect(required.every((h) => h.status === 'OK')).toBe(true)
  })
})

describe('25: Cutlass Black — FR-86 never appears as Missile Rack data, turret hierarchy present', () => {
  it('the Missile Rack top-level port never targets FR-86 (a Shield)', () => {
    const tree = buildPortTree(rowsFor('cutlass-black'))
    const missileRackNode = tree.find((n) => n.hardpoint.type === 'Missile Rack')!
    expect(missileRackNode.hardpoint.targetItem).not.toBe('FR-86')
  })

  it('renders the Top Turret with two child weapons, plus a Tractor Beam port', () => {
    const tree = buildPortTree(rowsFor('cutlass-black'))
    const turret = tree.find((n) => n.hardpoint.slotLabel === 'Top Turret')!
    expect(turret.children).toHaveLength(2)
    expect(tree.map((n) => n.hardpoint.slotLabel)).toContain('Tractor Beam')
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
