import { describe, it, expect } from 'vitest'
import { TOP_LEVEL_GROUP_ORDER, INTRA_GROUP_CHILD_PRIORITY, legacyPortGroupLabel } from '../commanderSystemTaxonomy'

describe('SW-007C — Commander Taxonomy Authority', () => {
  it('TOP_LEVEL_GROUP_ORDER is the fixed, SW-007A-approved eight-category Commander mental model, in display order', () => {
    expect(TOP_LEVEL_GROUP_ORDER).toEqual([
      'Core Components',
      'Detection / Navigation',
      'Missile Racks',
      'Pilot Weapons',
      'Manned Turrets',
      'Remote Turrets',
      'Utility',
      'Support Systems',
    ])
  })

  describe('INTRA_GROUP_CHILD_PRIORITY — sibling order within Core Components and Utility', () => {
    it('Core Components ranks Cooler, Power Plant, Quantum Drive (either raw form), Shield in that order', () => {
      const priorityFor = INTRA_GROUP_CHILD_PRIORITY['Core Components']
      expect(priorityFor('Cooler')).toBeLessThan(priorityFor('Power Plant'))
      expect(priorityFor('Power Plant')).toBeLessThan(priorityFor('Quantum Drive'))
      expect(priorityFor('Quantum Drive')).toBe(priorityFor('QuantumDrive'))
      expect(priorityFor('Quantum Drive')).toBeLessThan(priorityFor('Shield'))
    })

    it('an unrecognized type within Core Components sorts after every known sibling', () => {
      const priorityFor = INTRA_GROUP_CHILD_PRIORITY['Core Components']
      expect(priorityFor('Shield')).toBeLessThan(priorityFor('Something Unrecognized'))
    })

    it('Utility ranks Mining, Salvage, then everything else (Tractor Systems / generic Utility)', () => {
      const priorityFor = INTRA_GROUP_CHILD_PRIORITY['Utility']
      expect(priorityFor('Mining Laser')).toBeLessThan(priorityFor('Salvage Module'))
      expect(priorityFor('Salvage Module')).toBeLessThan(priorityFor('Utility'))
    })

    it('a group with no approved sibling order (e.g. Pilot Weapons) has no entry at all', () => {
      expect(INTRA_GROUP_CHILD_PRIORITY['Pilot Weapons']).toBeUndefined()
    })
  })

  describe('legacyPortGroupLabel — groupLabel-less fallback (M80/Starlite), resolves only to real canonical labels', () => {
    it('assemblyRole (Manned/Remote Turret) is honored first, even for an ambiguous type string', () => {
      expect(legacyPortGroupLabel({ type: 'Gimbal Mount', assemblyRole: 'MANNED_TURRET' })).toBe('Manned Turrets')
      expect(legacyPortGroupLabel({ type: 'Gimbal Mount', assemblyRole: 'REMOTE_TURRET' })).toBe('Remote Turrets')
    })

    it('buckets Core Components: Power Plant, Cooler, Shield, Quantum/Jump Drive, Life Support', () => {
      expect(legacyPortGroupLabel({ type: 'Power Plant' })).toBe('Core Components')
      expect(legacyPortGroupLabel({ type: 'Cooler' })).toBe('Core Components')
      expect(legacyPortGroupLabel({ type: 'Shield' })).toBe('Core Components')
      expect(legacyPortGroupLabel({ type: 'Quantum Drive' })).toBe('Core Components')
      expect(legacyPortGroupLabel({ type: 'QuantumDrive' })).toBe('Core Components')
      expect(legacyPortGroupLabel({ type: 'Jump Drive' })).toBe('Core Components')
      expect(legacyPortGroupLabel({ type: 'Life Support' })).toBe('Core Components')
    })

    it('buckets Detection / Navigation: Radar, Avionics', () => {
      expect(legacyPortGroupLabel({ type: 'Radar' })).toBe('Detection / Navigation')
      expect(legacyPortGroupLabel({ type: 'Avionics' })).toBe('Detection / Navigation')
    })

    it('buckets Missile Racks and Pilot Weapons distinctly', () => {
      expect(legacyPortGroupLabel({ type: 'Missile' })).toBe('Missile Racks')
      expect(legacyPortGroupLabel({ type: 'Missile Rack' })).toBe('Missile Racks')
      expect(legacyPortGroupLabel({ type: 'Weapon' })).toBe('Pilot Weapons')
      expect(legacyPortGroupLabel({ type: 'Gimbal Mount' })).toBe('Pilot Weapons')
    })

    it('buckets Utility: Mining and Salvage variants alongside generic Utility/Tractor', () => {
      expect(legacyPortGroupLabel({ type: 'Mining Laser' })).toBe('Utility')
      expect(legacyPortGroupLabel({ type: 'Mining Module' })).toBe('Utility')
      expect(legacyPortGroupLabel({ type: 'Salvage Module' })).toBe('Utility')
      expect(legacyPortGroupLabel({ type: 'Utility' })).toBe('Utility')
    })

    it('buckets Support Systems: Relay explicitly, and any unrecognized type fails safe rather than vanishing', () => {
      expect(legacyPortGroupLabel({ type: 'Relay' })).toBe('Support Systems')
      expect(legacyPortGroupLabel({ type: 'Cargo' })).toBe('Support Systems')
      expect(legacyPortGroupLabel({ type: 'SomeFutureUnseenType' })).toBe('Support Systems')
    })

    it('a bare "Turret Mount" (no assemblyRole) defaults to Manned Turrets', () => {
      expect(legacyPortGroupLabel({ type: 'Turret Mount' })).toBe('Manned Turrets')
    })

    it('every resolved label is a real member of TOP_LEVEL_GROUP_ORDER — never an invented category', () => {
      const sampleTypes = ['Power Plant', 'Radar', 'Missile', 'Weapon', 'Mining Laser', 'Relay', 'Turret Mount', 'SomeFutureUnseenType']
      for (const type of sampleTypes) {
        expect(TOP_LEVEL_GROUP_ORDER).toContain(legacyPortGroupLabel({ type }))
      }
    })
  })
})
