import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShipNormalizer } from '../shipNormalizer'
import type { NormalizedShipPackage } from '../../engine/types'

const RAW_DATA_DIR = resolve(__dirname, '../../../raw-data')

function loadShip(file: string): NormalizedShipPackage {
  const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, file), 'utf-8'))
  return new ShipNormalizer().normalize(raw, `raw-data/${file}`)
}

function componentNameFor(pkg: NormalizedShipPackage, componentId: string | null | undefined) {
  return componentId ? pkg.components.find((c) => c.id === componentId)?.displayName : undefined
}

/**
 * SW-013C.2D (Objectives 2/5/6) — Electronic Warfare Topology + Hornet
 * Nose Topology Investigation. These tests run the real `ShipNormalizer`
 * against the real, checked-in raw StarBreaker exports for every ship in
 * this mission's certification corpus.
 */
describe('SW-013C.2D (Objective 2): Hornet Ghost Mk II — Nose topology has no authoritative children', () => {
  it('the Nose Cone port materializes with real factory truth but zero children — confirmed, not assumed', () => {
    const p = loadShip('ANVL_Hornet_F7CS_Mk2.json')
    const nose = p.ports.find((port) => port.internalName === 'hardpoint_nose_cone')!
    expect(nose).toBeDefined()
    expect(componentNameFor(p, nose.factoryItemId)).toBeDefined()
    const children = p.ports.filter((port) => port.parentPortId === nose.id)
    expect(children).toHaveLength(0)
  })

  it('no other loadout entry anywhere in the raw export names the Nose Cap entity class as a parent', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'ANVL_Hornet_F7CS_Mk2.json'), 'utf-8'))
    const loadout = raw.loadout as Array<{ entity?: string; parent?: string }>
    const noseCapChildren = loadout.filter((l) => l.parent === 'ANVL_F7_Mk2_NoseCap')
    expect(noseCapChildren).toHaveLength(0)
  })
})

describe('SW-013C.2D (Objective 5): Electronic Warfare ports activate for the Architectural Certification Fleet', () => {
  it('Avenger Warlock — the EMP port materializes as real, non-structural, Support Systems equipment', () => {
    const p = loadShip('AEGS_Avenger_Warlock.json')
    const emp = p.ports.find((port) => port.internalName === 'hardpoint_weapon_emp')
    expect(emp).toBeDefined()
    expect(emp!.canonicalPortType).toBe('EMP')
    expect(emp!.equipmentGroup).toBe('ElectronicWarfare')
    expect(emp!.isStructural).not.toBe(true)
    expect(componentNameFor(p, emp!.factoryItemId)).toBe('REP-8 EMP Generator')
    expect(emp!.factoryItemId).toBe(emp!.installedItemId)
    expect(emp!.factoryItemId).toBe(emp!.targetItemId)
  })

  it('Anvil Hawk — its own differently-named EMP port also activates via category, not port name', () => {
    const p = loadShip('ANVL_Hawk.json')
    const emp = p.ports.find((port) => port.internalName === 'hardpoint_missile_emp')
    expect(emp).toBeDefined()
    expect(emp!.canonicalPortType).toBe('EMP')
    expect(componentNameFor(p, emp!.factoryItemId)).toBe('TroMag Burst Generator')
  })

  it('Mirai Guardian QI — the Quantum Dampener port materializes as real Support Systems equipment', () => {
    const p = loadShip('MRAI_Guardian_QI.json')
    const damp = p.ports.find((port) => port.internalName === 'hardpoint_quantum_damp')
    expect(damp).toBeDefined()
    expect(damp!.canonicalPortType).toBe('QuantumDampener')
    expect(damp!.equipmentGroup).toBe('ElectronicWarfare')
    expect(componentNameFor(p, damp!.factoryItemId)).toBe('Captor QD')
  })

  it('RSI Mantis — the interdiction device (QED) resolves through the same QuantumInterdictionGenerator category as Guardian Qi\'s Dampener, not a fabricated second port', () => {
    const p = loadShip('RSI_Mantis.json')
    const qed = p.ports.find((port) => port.internalName === 'hardpoint_interdiction_device')
    expect(qed).toBeDefined()
    expect(qed!.canonicalPortType).toBe('QuantumDampener')
    expect(componentNameFor(p, qed!.factoryItemId)).toBe('Reynie QED')
    // No second, fabricated "Snare" port — the raw export has exactly one
    // real item-port relationship for this equipment family on this ship.
    const allEwPorts = p.ports.filter((port) => port.canonicalPortType === 'QuantumDampener' || port.canonicalPortType === 'EMP')
    expect(allEwPorts).toHaveLength(1)
  })
})

describe('SW-013C.2D (Objective 6): canonical taxonomy — EMP and QuantumInterdictionGenerator are the only two activated categories', () => {
  it('every real EMP-category entity in the certification corpus resolves, never inferred from a port or entity name', () => {
    const warlock = loadShip('AEGS_Avenger_Warlock.json')
    const hawk = loadShip('ANVL_Hawk.json')
    expect(warlock.ports.find((p) => p.internalName === 'hardpoint_weapon_emp')?.canonicalPortType).toBe('EMP')
    expect(hawk.ports.find((p) => p.internalName === 'hardpoint_missile_emp')?.canonicalPortType).toBe('EMP')
  })

  it('an unrelated Turret/GunTurret port on the same ships is unaffected — never reclassified as Electronic Warfare', () => {
    const warlock = loadShip('AEGS_Avenger_Warlock.json')
    const noseWeapon = warlock.ports.find((p) => p.internalName === 'hardpoint_weapon_class2_nose')
    expect(noseWeapon).toBeDefined()
    expect(noseWeapon!.canonicalPortType).not.toBe('EMP')
    expect(noseWeapon!.canonicalPortType).not.toBe('QuantumDampener')
  })
})
