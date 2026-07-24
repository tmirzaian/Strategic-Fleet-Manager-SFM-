import { describe, it, expect } from 'vitest'
import { classifyOwnership, ownershipOf, type OwnershipNode } from '../portOwnership'
import { importedShipList } from '../../generated/importedShips'
import type { Port } from '../../engine/types'

function toOwnershipNodes(ports: Port[]): OwnershipNode[] {
  return ports.map((p) => ({ id: p.id, parentId: p.parentPortId, internalName: p.internalName, sourceEntityClass: p.sourceEntityClass }))
}

function portsFor(shipId: string): Port[] {
  return importedShipList.find((v) => v.ship.id === shipId)?.ports ?? []
}

describe('classifyOwnership — pure algorithm (synthetic fixtures)', () => {
  it('EWO-056C-R1: valid root-reaching host ancestry (no boundary anywhere, terminates at a genuine parentId-less root) resolves CONFIRMED host', () => {
    const nodes: OwnershipNode[] = [
      { id: 'a', parentId: null, internalName: 'hardpoint_power_plant' },
      { id: 'b', parentId: 'a', internalName: 'hardpoint_weapon' },
    ]
    const result = classifyOwnership(nodes)
    expect(ownershipOf(result, 'a')).toMatchObject({ context: { kind: 'HOST' }, resolved: true })
    expect(ownershipOf(result, 'b')).toMatchObject({ context: { kind: 'HOST' }, resolved: true })
  })

  it('a node whose own internalName matches the boundary table is itself ATTACHED_MODULE (inclusive boundary), resolved true', () => {
    const nodes: OwnershipNode[] = [{ id: 'attach', parentId: null, internalName: 'itemport_vehicle_attach', sourceEntityClass: 'TEST_Module' }]
    const result = classifyOwnership(nodes)
    const r = ownershipOf(result, 'attach')
    expect(r.context).toEqual({ kind: 'ATTACHED_MODULE', boundaryNodeId: 'attach', boundaryPortName: 'itemport_vehicle_attach', ownerEntityClass: 'TEST_Module' })
    expect(r.resolved).toBe(true)
  })

  it('every descendant of a boundary node — direct and transitive — inherits ATTACHED_MODULE with the same boundary identity, resolved true', () => {
    const nodes: OwnershipNode[] = [
      { id: 'host_port', parentId: null, internalName: 'hardpoint_docking_module' },
      { id: 'attach', parentId: 'host_port', internalName: 'itemport_vehicle_attach', sourceEntityClass: 'TEST_Module' },
      { id: 'child', parentId: 'attach', internalName: 'hardpoint_power_plant' },
      { id: 'grandchild', parentId: 'child', internalName: 'hardpoint_subitem' },
    ]
    const result = classifyOwnership(nodes)
    expect(ownershipOf(result, 'host_port')).toMatchObject({ context: { kind: 'HOST' }, resolved: true })
    for (const id of ['attach', 'child', 'grandchild']) {
      const r = ownershipOf(result, id)
      expect(r.resolved).toBe(true)
      const ctx = r.context
      expect(ctx.kind).toBe('ATTACHED_MODULE')
      if (ctx.kind === 'ATTACHED_MODULE') {
        expect(ctx.boundaryNodeId).toBe('attach')
        expect(ctx.ownerEntityClass).toBe('TEST_Module')
      }
    }
  })

  it('EWO-056C-R1: a boundary node whose own sourceEntityClass is unresolved reports ownerEntityClass: null AND resolved: false — never confirmed', () => {
    const nodes: OwnershipNode[] = [{ id: 'attach', parentId: null, internalName: 'itemport_vehicle_attach' }]
    const result = classifyOwnership(nodes)
    const r = ownershipOf(result, 'attach')
    expect(r.context.kind).toBe('ATTACHED_MODULE')
    if (r.context.kind === 'ATTACHED_MODULE') expect(r.context.ownerEntityClass).toBeNull()
    expect(r.resolved).toBe(false)
  })

  it('EWO-056C-R1: a parentId pointing at an id absent from the input set (broken ancestry, one hop) resolves unresolved HOST, never throws', () => {
    const nodes: OwnershipNode[] = [{ id: 'orphan', parentId: 'does-not-exist', internalName: 'hardpoint_weapon' }]
    expect(() => classifyOwnership(nodes)).not.toThrow()
    const r = ownershipOf(classifyOwnership(nodes), 'orphan')
    expect(r.context.kind).toBe('HOST')
    expect(r.resolved).toBe(false)
  })

  it('EWO-056C-R1: a broken parent chain several hops up (not the queried node\'s own immediate parent) also resolves unresolved HOST for every node in the chain', () => {
    const nodes: OwnershipNode[] = [
      { id: 'grandchild', parentId: 'child', internalName: 'hardpoint_subitem' },
      { id: 'child', parentId: 'broken-ancestor-missing', internalName: 'hardpoint_weapon' },
    ]
    const result = classifyOwnership(nodes)
    for (const id of ['grandchild', 'child']) {
      const r = ownershipOf(result, id)
      expect(r.context.kind).toBe('HOST')
      expect(r.resolved).toBe(false)
    }
  })

  it('EWO-056C-R1: a cyclic parentId chain never hangs and resolves unresolved HOST for every node in the cycle', () => {
    const nodes: OwnershipNode[] = [
      { id: 'a', parentId: 'b', internalName: 'x' },
      { id: 'b', parentId: 'a', internalName: 'y' },
    ]
    const result = classifyOwnership(nodes)
    for (const id of ['a', 'b']) {
      const r = ownershipOf(result, id)
      expect(r.context.kind).toBe('HOST')
      expect(r.resolved).toBe(false)
    }
  })

  it('EWO-056C-R1: an id this engine was never given ("unknown port ID") resolves unresolved HOST via ownershipOf, never throws', () => {
    const result = classifyOwnership([{ id: 'a', parentId: null, internalName: 'hardpoint_power_plant' }])
    const r = ownershipOf(result, 'totally-unknown-id')
    expect(r.context.kind).toBe('HOST')
    expect(r.resolved).toBe(false)
  })

  it('is purely read-only — never mutates the input node array', () => {
    const nodes: OwnershipNode[] = [
      { id: 'attach', parentId: null, internalName: 'itemport_vehicle_attach', sourceEntityClass: 'TEST_Module' },
      { id: 'child', parentId: 'attach', internalName: 'hardpoint_power_plant' },
    ]
    const snapshot = JSON.parse(JSON.stringify(nodes))
    classifyOwnership(nodes)
    expect(nodes).toEqual(snapshot)
  })

  it('classification never depends on displayName or any other presentational field — only internalName/parentId/sourceEntityClass are read', () => {
    // A node whose internalName innocuously happens to look like a boundary
    // in its DISPLAY text ("Vehicle Attach Point") but whose real raw
    // internalName does not match the table stays HOST — proves the engine
    // never reasons from label-shaped text.
    const nodes = [{ id: 'a', parentId: null, internalName: 'hardpoint_something_else' } as OwnershipNode & { displayName: string }]
    nodes[0].displayName = 'Vehicle Attach Point'
    const result = classifyOwnership(nodes)
    const r = ownershipOf(result, 'a')
    expect(r.context.kind).toBe('HOST')
    expect(r.resolved).toBe(true) // a genuine root, no boundary — confirmed, not merely defaulted
  })
})

// EWO-056A — real-data regression coverage. Skips (never fails) when
// generated-data/ports.json wasn't produced with these ships imported on
// this machine, matching every other generated-data-dependent test in
// this repo.
const IRONCLAD_ASSAULT = 'ironclad-assault-imported'
const IRONCLAD = 'ironclad-imported'
const CATERPILLAR = 'caterpillar-imported'
const CATERPILLAR_PIRATE = 'caterpillar-pirate-imported'
const GLADIUS = 'gladius-imported'
const hasIroncladAssaultData = portsFor(IRONCLAD_ASSAULT).length > 0

describe('classifyOwnership — real ship data (EWO-056/EWO-056A/EWO-056C-R1)', () => {
  it('Ironclad Assault: every port under itemport_vehicle_attach classifies ATTACHED_MODULE (resolved) owned by DRAK_Command_Module; every other real port classifies confirmed HOST', () => {
    if (!hasIroncladAssaultData) return
    const ports = portsFor(IRONCLAD_ASSAULT)
    const result = classifyOwnership(toOwnershipNodes(ports))

    const attachPort = ports.find((p) => p.internalName === 'itemport_vehicle_attach')
    expect(attachPort).toBeDefined()

    let moduleCount = 0
    let hostCount = 0
    for (const port of ports) {
      const r = ownershipOf(result, port.id)
      const isUnderAttach = port.sourcePath?.includes('itemport_vehicle_attach') ?? false
      if (isUnderAttach) {
        moduleCount++
        expect(r.context.kind).toBe('ATTACHED_MODULE')
        expect(r.resolved).toBe(true)
        if (r.context.kind === 'ATTACHED_MODULE') expect(r.context.ownerEntityClass).toBe('DRAK_Command_Module')
      } else {
        hostCount++
        expect(r.context.kind).toBe('HOST')
        // Every real, already-imported port has real geometry/hierarchy
        // data — no broken ancestry/cycle exists in this ship's real
        // committed data, so every host port here is genuinely confirmed.
        expect(r.resolved).toBe(true)
      }
    }
    // Both groups are genuinely non-empty for this ship — a vacuous
    // all-HOST or all-MODULE result would silently hide a broken join.
    expect(moduleCount).toBeGreaterThan(0)
    expect(hostCount).toBeGreaterThan(0)
  })

  it('Ironclad (base, non-Assault) resolves the same Command Module ownership as Ironclad Assault — the boundary is ship-agnostic', () => {
    if (portsFor(IRONCLAD).length === 0) return
    const ports = portsFor(IRONCLAD)
    const result = classifyOwnership(toOwnershipNodes(ports))
    const moduleEntries = ports.filter((p) => p.sourcePath?.includes('itemport_vehicle_attach'))
    expect(moduleEntries.length).toBeGreaterThan(0)
    for (const port of moduleEntries) {
      const r = ownershipOf(result, port.id)
      expect(r.context.kind).toBe('ATTACHED_MODULE')
      expect(r.resolved).toBe(true)
      if (r.context.kind === 'ATTACHED_MODULE') expect(r.context.ownerEntityClass).toBe('DRAK_Command_Module')
    }
    // The base Ironclad's OWN host-owned tractor beams (a real, separate
    // system from the Command Module's) must stay HOST — proves lock/
    // ownership is per-port, never inferred from "this ship has a module."
    const hostTractorBeam = ports.find((p) => p.sourceEntityClass === 'DRAK_Ironclad_Remote_Turret_Tractor_Beam')
    if (hostTractorBeam) {
      const r = ownershipOf(result, hostTractorBeam.id)
      expect(r.context.kind).toBe('HOST')
      expect(r.resolved).toBe(true)
    }
  })

  it('Caterpillar resolves the same Command Module ownership, confirming the boundary is not Ironclad-specific', () => {
    if (portsFor(CATERPILLAR).length === 0) return
    const ports = portsFor(CATERPILLAR)
    const result = classifyOwnership(toOwnershipNodes(ports))
    const moduleEntries = ports.filter((p) => p.sourcePath?.includes('itemport_vehicle_attach'))
    expect(moduleEntries.length).toBeGreaterThan(0)
    for (const port of moduleEntries) {
      const r = ownershipOf(result, port.id)
      expect(r.context.kind).toBe('ATTACHED_MODULE')
      expect(r.resolved).toBe(true)
      if (r.context.kind === 'ATTACHED_MODULE') expect(r.context.ownerEntityClass).toBe('DRAK_Command_Module')
    }
  })

  it('SW-012B: Caterpillar Pirate resolves the same Command Module ownership as the other three hosts — closes a real coverage gap this module\'s own doc comment claimed ("all four currently-imported Command-Module-capable hosts") but the test suite never actually exercised', () => {
    if (portsFor(CATERPILLAR_PIRATE).length === 0) return
    const ports = portsFor(CATERPILLAR_PIRATE)
    const result = classifyOwnership(toOwnershipNodes(ports))
    const moduleEntries = ports.filter((p) => p.sourcePath?.includes('itemport_vehicle_attach'))
    expect(moduleEntries.length).toBeGreaterThan(0)
    for (const port of moduleEntries) {
      const r = ownershipOf(result, port.id)
      expect(r.context.kind).toBe('ATTACHED_MODULE')
      expect(r.resolved).toBe(true)
      if (r.context.kind === 'ATTACHED_MODULE') expect(r.context.ownerEntityClass).toBe('DRAK_Command_Module')
    }
    const hostCount = ports.length - moduleEntries.length
    expect(hostCount).toBeGreaterThan(0)
  })

  it('a non-modular control ship (Gladius) classifies every single port confirmed HOST — zero behavior change for a ship with no attached vehicle', () => {
    if (portsFor(GLADIUS).length === 0) return
    const ports = portsFor(GLADIUS)
    const result = classifyOwnership(toOwnershipNodes(ports))
    expect(ports.length).toBeGreaterThan(0)
    for (const port of ports) {
      const r = ownershipOf(result, port.id)
      expect(r.context.kind).toBe('HOST')
      expect(r.resolved).toBe(true)
    }
  })

  it('classifying the same real fleet-wide port set twice never mutates generated-data\'s own ports.json array', () => {
    if (!hasIroncladAssaultData) return
    const ports = portsFor(IRONCLAD_ASSAULT)
    const snapshot = JSON.parse(JSON.stringify(ports))
    classifyOwnership(toOwnershipNodes(ports))
    classifyOwnership(toOwnershipNodes(ports))
    expect(ports).toEqual(snapshot)
  })
})
