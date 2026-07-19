import { describe, it, expect } from 'vitest'
import { isPlayerUsableComponentType, componentCategoryForType } from '../componentTaxonomy'

describe('Mission M-012: componentTaxonomy', () => {
  it('9. accepts every explicitly requested player-usable DataCore Type', () => {
    const requested = ['WeaponGun', 'Shield', 'Cooler', 'PowerPlant', 'QuantumDrive', 'JumpDrive', 'MissileLauncher', 'Missile', 'Radar', 'LifeSupportGenerator', 'Relay', 'TractorBeam', 'SalvageHead', 'SalvageModifier', 'MiningModifier', 'Bomb', 'BombLauncher', 'WeaponMount', 'WeaponMining', 'WeaponDefensive']
    for (const type of requested) {
      expect(isPlayerUsableComponentType(type), `expected "${type}" to be player-usable`).toBe(true)
    }
  })

  it('FTB-001F (Part B) — MiningModifier is now included, matching componentCategoryForType, after the mining-module data-recovery investigation confirmed 30 real entities under this exact DataCore Type (Brandt, Focus, Forel, Lifeline, Optimum, Rieger, Rime, Stampede, Surge, Torpid, Torrent, Vaux, XTR, FLTR — MK1/MK2/MK3 grade variants where applicable) that this allowlist had never included', () => {
    expect(isPlayerUsableComponentType('MiningModifier')).toBe(true)
    expect(componentCategoryForType('MiningModifier')).toBe('Mining Module')
  })

  it('8. rejects internal-only/non-loadout DataCore Types', () => {
    const internal = ['Seat', 'SeatDashboard', 'SeatAccess', 'Door', 'MainThruster', 'ManneuverThruster', 'WeaponPersonal', 'AirTrafficController', 'DockingCollar', 'FuelTank', 'NOITEM_Player', 'NOITEM_Vehicle', 'Char_Armor_Helmet', 'Paints', 'ControlPanel']
    for (const type of internal) {
      expect(isPlayerUsableComponentType(type), `expected "${type}" to be excluded`).toBe(false)
    }
  })

  it('componentCategoryForType returns the mapped friendly category, or null for excluded types', () => {
    expect(componentCategoryForType('WeaponGun')).toBe('Weapon')
    expect(componentCategoryForType('Shield')).toBe('Shield')
    expect(componentCategoryForType('Seat')).toBeNull()
  })
})
