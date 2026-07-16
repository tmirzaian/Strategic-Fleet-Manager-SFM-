import { describe, it, expect } from 'vitest'
import { classifyMovementClass, isNonPlayerVariantName } from '../playerVehicleTaxonomy'

describe('Mission M-012: playerVehicleTaxonomy', () => {
  it('6. flags real, confirmed non-player-variant names as excluded', () => {
    const excluded = [
      'AEGS_Avenger_Titan_PU_AI_CIV',
      'AEGS_Avenger_Titan_AI_Template',
      'RSI_Mantis_Unmanned',
      'DRAK_Cutlass_Blue_AI_Template',
      'SalvageableDebris_test',
      'DRAK_Golem_Low_Fuel_TEMPORARY',
      'MISC_Starfarer_Gemini_Derelict_Body_A',
      'AEGS_Reclaimer_PU_Hijacked',
      'Orbital_Sentry_PU_Criminal',
      'probe_comms_1_Ninetails',
      'EAObjectiveDestructable_MiningLaser',
      'TMBL_Cyclone_Indestructible',
    ]
    for (const name of excluded) {
      expect(isNonPlayerVariantName(name), `expected "${name}" to be excluded`).toBe(true)
    }
  })

  it('does not flag real, legitimate player-purchasable ship names', () => {
    const included = [
      'AEGS_Gladius',
      'AEGS_Avenger_Titan',
      'DRAK_Cutlass_Black',
      'ARGO_MOLE',
      'ANVL_Paladin',
      'DRAK_Corsair',
      'DRAK_Vulture',
      'CRUS_Starlifter_C2',
      'AEGS_Avenger_Titan_Renegade', // a real, distinct sellable variant
      'RSI_Constellation_Phoenix_Emerald', // a real limited-edition variant
    ]
    for (const name of included) {
      expect(isNonPlayerVariantName(name), `expected "${name}" to be included`).toBe(false)
    }
  })

  it('7. classifyMovementClass maps "Spaceship" to ship and "ArcadeWheeled" to ground_vehicle', () => {
    expect(classifyMovementClass('Spaceship')).toBe('ship')
    expect(classifyMovementClass('ArcadeWheeled')).toBe('ground_vehicle')
  })

  it('classifyMovementClass returns null for non-player-operable classes (e.g. "Dummy" debris props)', () => {
    expect(classifyMovementClass('Dummy')).toBeNull()
    expect(classifyMovementClass('SomeUnknownFutureClass')).toBeNull()
  })
})
