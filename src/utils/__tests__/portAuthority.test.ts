import { describe, it, expect } from 'vitest'
import { resolvePortAuthority, resolvePortAuthorities, type ResolvePortAuthorityInput, type PortAuthority } from '../portAuthority'
import { classifyOwnership, ownershipOf, type OwnershipResult, type OwnershipNode } from '../portOwnership'
import { importedShipList } from '../../generated/importedShips'
import type { Port } from '../../engine/types'

// EWO-056C-R1 — a confirmed host: `resolved: true`, matching what
// classifyOwnership itself now produces for a node whose ancestry
// genuinely reaches a parentId-less root with no boundary in between.
const HOST: OwnershipResult = { context: { kind: 'HOST' }, resolved: true, reason: 'no vehicle-attachment boundary found in this node\'s ancestry' }

function attachedModule(ownerEntityClass: string | null): OwnershipResult {
  return {
    context: { kind: 'ATTACHED_MODULE', boundaryNodeId: 'boundary-1', boundaryPortName: 'itemport_vehicle_attach', ownerEntityClass },
    // EWO-056C-R1 — mirrors classifyOwnership's own rule exactly: a
    // boundary with no confirmed owner is not a confirmed result.
    resolved: ownerEntityClass !== null,
    reason: `descends from boundary port "itemport_vehicle_attach" (node boundary-1), owned by entityClass ${ownerEntityClass ?? '(unresolved)'}`,
  }
}

/** A minimal fake loader-shaped constraint lookup, injected by giving
 * `entityClass`/`portName` values this test controls end-to-end via a
 * fixture entity name that does not exist in the real generated data —
 * `resolvePortAuthority` always calls the REAL
 * `getComponentOwnedPortConstraint`, so "missing constraint" cases here
 * rely on genuinely uncataloged fixture identities, never a mock. */
const UNCATALOGED_ENTITY = 'EWO_056C_TEST_FIXTURE_NEVER_A_REAL_ENTITY'

describe('resolvePortAuthority — acceptance matrix (EWO-056C)', () => {
  it('Host + editable:true -> host, editable, mayEdit: true, reason: host-editable', () => {
    // Real data: MRCK_S09_AEGS_Eclipse's missile_01_attach is confirmed
    // editable:true (EWO-056B) — used here under an explicit HOST
    // ownership fixture (a standalone rack on its own ship, not
    // module-attached), per the required "ensure the ownership fixture
    // places it in the intended host or attached scope explicitly."
    const result = resolvePortAuthority({ portId: 'p1', ownership: HOST, hostVehicleId: 'eclipse-ship-1', entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(result).toEqual<PortAuthority>({ portId: 'p1', ownerId: 'eclipse-ship-1', ownershipScope: 'host', editability: 'editable', mayEdit: true, reason: 'host-editable' })
  })

  it('Host + editable:false -> host, locked, mayEdit: false, reason: host-locked', () => {
    const result = resolvePortAuthority({
      portId: 'p2',
      ownership: HOST,
      hostVehicleId: 'ship-1',
      entityClass: 'DRAK_Command_Module_Remote_Turret_Tractor_Beam', // real, confirmed editable:false
      portName: 'turret_weapon',
    })
    expect(result).toEqual<PortAuthority>({ portId: 'p2', ownerId: 'ship-1', ownershipScope: 'host', editability: 'locked', mayEdit: false, reason: 'host-locked' })
  })

  it('Host + editable:null -> host, unknown, mayEdit: false, reason: host-editability-unknown', () => {
    const result = resolvePortAuthority({
      portId: 'p3',
      ownership: HOST,
      hostVehicleId: 'ship-1',
      entityClass: 'AEGS_Idris_SCItem_Turret_Large_P', // real, confirmed editable:null
      portName: 'Turret_Backing',
    })
    expect(result).toEqual<PortAuthority>({ portId: 'p3', ownerId: 'ship-1', ownershipScope: 'host', editability: 'unknown', mayEdit: false, reason: 'host-editability-unknown' })
  })

  it('Host + missing constraint record -> host, constraint-not-found, mayEdit: false', () => {
    const result = resolvePortAuthority({ portId: 'p4', ownership: HOST, hostVehicleId: 'ship-1', entityClass: UNCATALOGED_ENTITY, portName: 'hardpoint_whatever' })
    expect(result).toEqual<PortAuthority>({ portId: 'p4', ownerId: 'ship-1', ownershipScope: 'host', editability: 'unknown', mayEdit: false, reason: 'constraint-not-found' })
  })

  it('Attached vehicle + editable:true -> attached-vehicle, editable, mayEdit: true', () => {
    const ownership = attachedModule('DRAK_Command_Module')
    const result = resolvePortAuthority({ portId: 'p5', ownership, entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(result).toEqual<PortAuthority>({ portId: 'p5', ownerId: 'DRAK_Command_Module', ownershipScope: 'attached-vehicle', editability: 'editable', mayEdit: true, reason: 'attached-vehicle-editable' })
  })

  it('Attached vehicle + editable:false -> attached-vehicle, locked, mayEdit: false — the central EWO-056 real-data regression', () => {
    // Real data: the Command Module tractor beam, under a real
    // ATTACHED_MODULE ownership result whose owner is DRAK_Command_Module
    // (exactly what EWO-056A's own classifyOwnership produces for every
    // port under itemport_vehicle_attach on Ironclad/Ironclad Assault/
    // Caterpillar).
    const ownership = attachedModule('DRAK_Command_Module')
    const result = resolvePortAuthority({
      portId: 'ironclad-assault-imported-port-/hardpoint_docking_module/itemport_vehicle_attach/hardpoint_tractor_beam/turret_weapon',
      ownership,
      entityClass: 'DRAK_Command_Module_Remote_Turret_Tractor_Beam',
      portName: 'turret_weapon',
    })
    expect(result.ownershipScope).toBe('attached-vehicle')
    expect(result.editability).toBe('locked')
    expect(result.mayEdit).toBe(false)
    expect(result.reason).toBe('attached-vehicle-locked')
    expect(result.ownerId).toBe('DRAK_Command_Module')
  })

  it('Attached vehicle + editable:null -> attached-vehicle, unknown, mayEdit: false', () => {
    const ownership = attachedModule('DRAK_Command_Module')
    const result = resolvePortAuthority({ portId: 'p6', ownership, entityClass: 'AEGS_Idris_SCItem_Turret_Large_P', portName: 'Turret_Backing' })
    expect(result).toEqual<PortAuthority>({ portId: 'p6', ownerId: 'DRAK_Command_Module', ownershipScope: 'attached-vehicle', editability: 'unknown', mayEdit: false, reason: 'attached-vehicle-editability-unknown' })
  })

  it('Attached vehicle + missing constraint record -> attached-vehicle, constraint-not-found, mayEdit: false', () => {
    const ownership = attachedModule('DRAK_Command_Module')
    const result = resolvePortAuthority({ portId: 'p7', ownership, entityClass: UNCATALOGED_ENTITY, portName: 'hardpoint_whatever' })
    expect(result).toEqual<PortAuthority>({ portId: 'p7', ownerId: 'DRAK_Command_Module', ownershipScope: 'attached-vehicle', editability: 'unknown', mayEdit: false, reason: 'constraint-not-found' })
  })

  it('Unresolved ownership (attached-vehicle boundary whose own owner entityClass is itself unresolved) + editable metadata -> unresolved, mayEdit: false, regardless of what the constraint lookup would have said', () => {
    const ownership = attachedModule(null)
    // Even a genuinely editable real record must not leak through once
    // ownership itself failed to resolve — precedence rule 1.
    const result = resolvePortAuthority({ portId: 'p8', ownership, entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(result).toEqual<PortAuthority>({ portId: 'p8', ownerId: null, ownershipScope: 'unresolved', editability: 'unknown', mayEdit: false, reason: 'ownership-unresolved' })
  })
})

describe('resolvePortAuthority — EWO-056C-R1 end-to-end ownership-confidence regressions (real classifyOwnership output, not hand-rolled fixtures)', () => {
  it('valid root-reaching host ancestry remains resolved host, and resolvePortAuthority interprets editability normally for it', () => {
    const nodes: OwnershipNode[] = [
      { id: 'root', parentId: null, internalName: 'hardpoint_power_plant' },
      { id: 'leaf', parentId: 'root', internalName: 'hardpoint_weapon' },
    ]
    const ownership = ownershipOf(classifyOwnership(nodes), 'leaf')
    expect(ownership.resolved).toBe(true)
    const result = resolvePortAuthority({ portId: 'leaf', ownership, hostVehicleId: 'ship-1', entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(result.ownershipScope).toBe('host')
    expect(result.editability).toBe('editable')
    expect(result.mayEdit).toBe(true)
  })

  it('a missing node (broken ancestry) becomes unresolved at the authority layer — never confirmed host', () => {
    const nodes: OwnershipNode[] = [{ id: 'orphan', parentId: 'does-not-exist', internalName: 'hardpoint_weapon' }]
    const ownership = ownershipOf(classifyOwnership(nodes), 'orphan')
    expect(ownership.resolved).toBe(false)
    const result = resolvePortAuthority({ portId: 'orphan', ownership, hostVehicleId: 'ship-1', entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(result).toEqual<PortAuthority>({ portId: 'orphan', ownerId: null, ownershipScope: 'unresolved', editability: 'unknown', mayEdit: false, reason: 'ownership-unresolved' })
  })

  it('a broken parent chain several hops up becomes unresolved at the authority layer', () => {
    const nodes: OwnershipNode[] = [
      { id: 'grandchild', parentId: 'child', internalName: 'hardpoint_subitem' },
      { id: 'child', parentId: 'broken-ancestor-missing', internalName: 'hardpoint_weapon' },
    ]
    const ownership = ownershipOf(classifyOwnership(nodes), 'grandchild')
    expect(ownership.resolved).toBe(false)
    const result = resolvePortAuthority({ portId: 'grandchild', ownership, entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(result.ownershipScope).toBe('unresolved')
    expect(result.mayEdit).toBe(false)
    expect(result.reason).toBe('ownership-unresolved')
  })

  it('a cyclic parentId chain becomes unresolved at the authority layer — never hangs, never confirmed host', () => {
    const nodes: OwnershipNode[] = [
      { id: 'a', parentId: 'b', internalName: 'x' },
      { id: 'b', parentId: 'a', internalName: 'y' },
    ]
    const ownership = ownershipOf(classifyOwnership(nodes), 'a')
    expect(ownership.resolved).toBe(false)
    const result = resolvePortAuthority({ portId: 'a', ownership, entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(result.ownershipScope).toBe('unresolved')
    expect(result.mayEdit).toBe(false)
  })

  it('an unknown port ID (never classified at all) becomes unresolved at the authority layer', () => {
    const ownership = ownershipOf(classifyOwnership([{ id: 'a', parentId: null, internalName: 'hardpoint_power_plant' }]), 'totally-unknown-id')
    expect(ownership.resolved).toBe(false)
    const result = resolvePortAuthority({ portId: 'totally-unknown-id', ownership, entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(result.ownershipScope).toBe('unresolved')
    expect(result.mayEdit).toBe(false)
    expect(result.reason).toBe('ownership-unresolved')
  })

  it('the Command Module tractor-beam regression survives the R1 amendment unchanged: attached-vehicle, locked, mayEdit: false', () => {
    const nodes: OwnershipNode[] = [
      { id: 'docking', parentId: null, internalName: 'hardpoint_docking_module' },
      { id: 'attach', parentId: 'docking', internalName: 'itemport_vehicle_attach', sourceEntityClass: 'DRAK_Command_Module' },
      { id: 'tractor-port', parentId: 'attach', internalName: 'hardpoint_tractor_beam' },
    ]
    const ownership = ownershipOf(classifyOwnership(nodes), 'tractor-port')
    expect(ownership.resolved).toBe(true)
    const result = resolvePortAuthority({
      portId: 'tractor-port',
      ownership,
      entityClass: 'DRAK_Command_Module_Remote_Turret_Tractor_Beam', // real, confirmed editable:false
      portName: 'turret_weapon',
    })
    expect(result.ownershipScope).toBe('attached-vehicle')
    expect(result.editability).toBe('locked')
    expect(result.mayEdit).toBe(false)
    expect(result.ownerId).toBe('DRAK_Command_Module')
  })
})

describe('resolvePortAuthority — required behavioral proofs (EWO-056C)', () => {
  it('the boundary node itself (not just its descendants) resolves attached-vehicle — inclusive boundary ownership', () => {
    // attachedModule() here represents exactly what ownershipOf() returns
    // for the itemport_vehicle_attach node ITSELF, per EWO-056A's own
    // inclusive-boundary design — resolvePortAuthority takes that at face
    // value without needing to know whether its caller queried the
    // boundary node or one of its descendants.
    const ownership = attachedModule('DRAK_Command_Module')
    const result = resolvePortAuthority({ portId: 'boundary-node-itself', ownership, entityClass: UNCATALOGED_ENTITY, portName: 'x' })
    expect(result.ownershipScope).toBe('attached-vehicle')
  })

  it('never mutates the ownership input it was given', () => {
    const ownership = attachedModule('DRAK_Command_Module')
    const snapshot = JSON.parse(JSON.stringify(ownership))
    resolvePortAuthority({ portId: 'p', ownership, entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(ownership).toEqual(snapshot)
  })

  it('display/free-text does not affect resolution — two OwnershipResults with the same context but different human-readable reason strings resolve identically', () => {
    const a: OwnershipResult = { context: { kind: 'ATTACHED_MODULE', boundaryNodeId: 'b', boundaryPortName: 'itemport_vehicle_attach', ownerEntityClass: 'DRAK_Command_Module' }, resolved: true, reason: 'some explanation' }
    const b: OwnershipResult = { context: { kind: 'ATTACHED_MODULE', boundaryNodeId: 'b', boundaryPortName: 'itemport_vehicle_attach', ownerEntityClass: 'DRAK_Command_Module' }, resolved: true, reason: 'a completely different-worded explanation' }
    const input = (ownership: OwnershipResult): ResolvePortAuthorityInput => ({ portId: 'p', ownership, entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' })
    expect(resolvePortAuthority(input(a))).toEqual(resolvePortAuthority(input(b)))
  })

  it('editable: unknown never becomes mayEdit: true, across host and attached-vehicle scopes alike', () => {
    for (const ownership of [HOST, attachedModule('DRAK_Command_Module')]) {
      const result = resolvePortAuthority({ portId: 'p', ownership, entityClass: 'AEGS_Idris_SCItem_Turret_Large_P', portName: 'Turret_Backing' })
      expect(result.editability).toBe('unknown')
      expect(result.mayEdit).toBe(false)
    }
  })

  it('missing metadata (no constraint record at all) never becomes mayEdit: true, across host and attached-vehicle scopes alike', () => {
    for (const ownership of [HOST, attachedModule('DRAK_Command_Module')]) {
      const result = resolvePortAuthority({ portId: 'p', ownership, entityClass: UNCATALOGED_ENTITY, portName: 'hardpoint_whatever' })
      expect(result.reason).toBe('constraint-not-found')
      expect(result.mayEdit).toBe(false)
    }
  })

  it('produces every one of the 8 defined reason codes across the acceptance matrix, with no unexpected code and no state silently sharing a code it should not', () => {
    const cases: { label: string; input: ResolvePortAuthorityInput; expectedReason: string }[] = [
      { label: 'host editable', input: { portId: '1', ownership: HOST, entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' }, expectedReason: 'host-editable' },
      { label: 'host locked', input: { portId: '2', ownership: HOST, entityClass: 'DRAK_Command_Module_Remote_Turret_Tractor_Beam', portName: 'turret_weapon' }, expectedReason: 'host-locked' },
      { label: 'host unknown', input: { portId: '3', ownership: HOST, entityClass: 'AEGS_Idris_SCItem_Turret_Large_P', portName: 'Turret_Backing' }, expectedReason: 'host-editability-unknown' },
      { label: 'attached-vehicle editable', input: { portId: '5', ownership: attachedModule('DRAK_Command_Module'), entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' }, expectedReason: 'attached-vehicle-editable' },
      { label: 'attached-vehicle locked', input: { portId: '6', ownership: attachedModule('DRAK_Command_Module'), entityClass: 'DRAK_Command_Module_Remote_Turret_Tractor_Beam', portName: 'turret_weapon' }, expectedReason: 'attached-vehicle-locked' },
      { label: 'attached-vehicle unknown', input: { portId: '7', ownership: attachedModule('DRAK_Command_Module'), entityClass: 'AEGS_Idris_SCItem_Turret_Large_P', portName: 'Turret_Backing' }, expectedReason: 'attached-vehicle-editability-unknown' },
      { label: 'ownership unresolved', input: { portId: '9', ownership: attachedModule(null), entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' }, expectedReason: 'ownership-unresolved' },
      // constraint-not-found is intentionally ONE shared reason across
      // both scopes — the ticket's own reason enum does not split it into
      // host/attached-vehicle variants, unlike every editability outcome.
      { label: 'host, missing constraint', input: { portId: '4', ownership: HOST, entityClass: UNCATALOGED_ENTITY, portName: 'x' }, expectedReason: 'constraint-not-found' },
      { label: 'attached-vehicle, missing constraint', input: { portId: '8', ownership: attachedModule('DRAK_Command_Module'), entityClass: UNCATALOGED_ENTITY, portName: 'x' }, expectedReason: 'constraint-not-found' },
    ]
    for (const { label, input, expectedReason } of cases) {
      expect(resolvePortAuthority(input).reason, label).toBe(expectedReason)
    }
    const distinctReasons = new Set(cases.map((c) => c.expectedReason))
    expect(distinctReasons.size).toBe(8) // every defined PortAuthorityReason value, exactly once
  })

  it('resolvePortAuthorities batches resolvePortAuthority with no added policy — identical to mapping the single-item resolver by hand', () => {
    const inputs: ResolvePortAuthorityInput[] = [
      { portId: '1', ownership: HOST, entityClass: 'MRCK_S09_AEGS_Eclipse', portName: 'missile_01_attach' },
      { portId: '2', ownership: attachedModule('DRAK_Command_Module'), entityClass: 'DRAK_Command_Module_Remote_Turret_Tractor_Beam', portName: 'turret_weapon' },
    ]
    expect(resolvePortAuthorities(inputs)).toEqual(inputs.map(resolvePortAuthority))
  })

  it('explicit tri-state handling: precedence checks editable === false before === true, so a truthiness bug could never silently pass this suite', () => {
    // If resolvePortAuthority ever regressed to `if (constraint.editable)`,
    // `false` would fall through to the same branch as `null` — this
    // assertion distinguishes locked (false) from unknown (null) exactly,
    // which a truthiness check cannot.
    const locked = resolvePortAuthority({ portId: 'a', ownership: HOST, entityClass: 'DRAK_Command_Module_Remote_Turret_Tractor_Beam', portName: 'turret_weapon' })
    const unknown = resolvePortAuthority({ portId: 'b', ownership: HOST, entityClass: 'AEGS_Idris_SCItem_Turret_Large_P', portName: 'Turret_Backing' })
    expect(locked.editability).toBe('locked')
    expect(unknown.editability).toBe('unknown')
    expect(locked.reason).not.toBe(unknown.reason)
  })
})

/**
 * SW-012B — end-to-end wiring verification (real data, no hand-supplied
 * `entityClass`/`portName`).
 *
 * Every existing test above hand-supplies `entityClass`/`portName` as
 * already-correct function inputs — none of them prove HOW a real caller
 * derives those two values from a real `Port` object in the first place.
 * That derivation has a real, easy-to-get-wrong trap, confirmed live
 * during this certification pass: `entityClass` must be the owning
 * MOUNT/TURRET/RACK's own `sourceEntityClass` (the PARENT port's, e.g.
 * "Mount_Gimbal_S4" for a gimbal mount) — never the port's OWN
 * `sourceEntityClass` (which is whatever COMPONENT is currently installed
 * there, e.g. "APAR_BallisticGatling_S4" for the weapon sitting in that
 * mount). A caller that naively passes a port's own `sourceEntityClass`
 * would silently get `constraint-not-found` for every real port, since no
 * weapon/component entityClass is ever a key in
 * `component-owned-port-constraints.json` (which is keyed by owning
 * MOUNT/TURRET/RACK entities only — see `OWNER_ASSEMBLY_ROLES`). This
 * would not crash or throw; it would just look like the whole system
 * silently returns "nothing is ever editable."
 */
describe('resolvePortAuthority — SW-012B end-to-end wiring verification (real ship data)', () => {
  function portsFor(shipId: string): Port[] {
    return importedShipList.find((v) => v.ship.id === shipId)?.ports ?? []
  }

  it('deriving entityClass from the PARENT port (the mount), not the port\'s own sourceEntityClass, resolves a real, positive authority result', () => {
    const ports = portsFor('hornet-f7cs-mk2-imported')
    if (ports.length === 0) return // skip on a machine without this ship's real data imported, matching every other real-data test in this suite

    const mount = ports.find((p) => p.internalName === 'hardpoint_weapon_left_wing')
    const weaponPort = ports.find((p) => p.internalName === 'hardpoint_class_2' && p.parentPortId === mount?.id)
    expect(mount).toBeDefined()
    expect(weaponPort).toBeDefined()

    // The trap: the port's OWN sourceEntityClass is the installed WEAPON,
    // never the owning mount — confirmed different values on real data.
    expect(weaponPort!.sourceEntityClass).not.toBe(mount!.sourceEntityClass)

    const ownershipResults = classifyOwnership(ports.map((p) => ({ id: p.id, parentId: p.parentPortId, internalName: p.internalName, sourceEntityClass: p.sourceEntityClass })))
    const ownership = ownershipOf(ownershipResults, weaponPort!.id)
    expect(ownership.resolved).toBe(true) // Hornet has no attached-vehicle boundary — confirmed host

    // CORRECT wiring: entityClass comes from the PARENT (mount) port.
    const correct = resolvePortAuthority({ portId: weaponPort!.id, ownership, hostVehicleId: 'hornet-f7cs-mk2-imported', entityClass: mount!.sourceEntityClass, portName: weaponPort!.internalName })
    expect(correct.reason).not.toBe('constraint-not-found')
    expect(correct.editability).not.toBe('unknown')

    // The trap, proven: using the port's OWN sourceEntityClass (the
    // installed weapon) instead silently produces constraint-not-found —
    // never a crash, never an obviously-wrong signal, just silent
    // under-permission. This is exactly the failure mode a future
    // consumer must be guided away from.
    const wrong = resolvePortAuthority({ portId: weaponPort!.id, ownership, hostVehicleId: 'hornet-f7cs-mk2-imported', entityClass: weaponPort!.sourceEntityClass, portName: weaponPort!.internalName })
    expect(wrong.reason).toBe('constraint-not-found')
    expect(wrong.mayEdit).toBe(false)
  })
})
