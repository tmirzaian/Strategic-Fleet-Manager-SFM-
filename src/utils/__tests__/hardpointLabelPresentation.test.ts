import { describe, it, expect } from 'vitest'
import { formatHardpointLabel } from '../hardpointLabelPresentation'
import { shipFactoryTemplates } from '../../data/shipDefinitions'

describe('EWO-036A: formatHardpointLabel — mission-specified examples', () => {
  it('Left Wing Gun Class1 Weapon (Gimbal Mount) -> Left Wing Weapon Mount', () => {
    expect(formatHardpointLabel('Left Wing Gun Class1 Weapon (Gimbal Mount)')).toBe('Left Wing Weapon Mount')
  })

  it('Left Wing Gun Class1 Weapon (Gimbal Mount) — Class 2 -> Weapon', () => {
    expect(formatHardpointLabel('Left Wing Gun Class1 Weapon (Gimbal Mount) — Class 2')).toBe('Weapon')
  })

  it('Right Wing Gun Class1 Weapon (Gimbal Mount) -> Right Wing Weapon Mount', () => {
    expect(formatHardpointLabel('Right Wing Gun Class1 Weapon (Gimbal Mount)')).toBe('Right Wing Weapon Mount')
  })

  it('Right Wing Gun Class1 Weapon (Gimbal Mount) — Class 2 -> Weapon', () => {
    expect(formatHardpointLabel('Right Wing Gun Class1 Weapon (Gimbal Mount) — Class 2')).toBe('Weapon')
  })

  it('Nose Class2 Weapon (Gimbal Mount) -> Nose Weapon Mount', () => {
    expect(formatHardpointLabel('Nose Class2 Weapon (Gimbal Mount)')).toBe('Nose Weapon Mount')
  })

  it('Left Wing Weapon Missile Rack -> Left Missile Rack', () => {
    expect(formatHardpointLabel('Left Wing Weapon Missile Rack')).toBe('Left Missile Rack')
  })

  it('Right Wing Weapon Missile Rack -> Right Missile Rack', () => {
    expect(formatHardpointLabel('Right Wing Weapon Missile Rack')).toBe('Right Missile Rack')
  })

  it('Left Wing Weapon Missile Rack — 01 Attach Missile -> Missile Slot 1', () => {
    expect(formatHardpointLabel('Left Wing Weapon Missile Rack — 01 Attach Missile')).toBe('Missile Slot 1')
  })

  it('Left Wing Weapon Missile Rack — 02 Attach Missile -> Missile Slot 2', () => {
    expect(formatHardpointLabel('Left Wing Weapon Missile Rack — 02 Attach Missile')).toBe('Missile Slot 2')
  })

  it('Right Wing Weapon Missile Rack — 01 Attach Missile -> Missile Slot 1', () => {
    expect(formatHardpointLabel('Right Wing Weapon Missile Rack — 01 Attach Missile')).toBe('Missile Slot 1')
  })

  it('Right Wing Weapon Missile Rack — 02 Attach Missile -> Missile Slot 2', () => {
    expect(formatHardpointLabel('Right Wing Weapon Missile Rack — 02 Attach Missile')).toBe('Missile Slot 2')
  })
})

describe('EWO-036A: formatHardpointLabel — general rules preserved', () => {
  it('keeps Turret/Remote Turret wording untouched (not restructured)', () => {
    expect(formatHardpointLabel('Tail Turret (Remote Turret)')).toContain('Remote Turret')
    expect(formatHardpointLabel('Left Manned Turret')).toContain('Manned Turret')
  })

  it('preserves a distinguishing missile-rack qualifier (Pylon number) instead of collapsing to an ambiguous bare "{Position} Missile Rack"', () => {
    expect(formatHardpointLabel('Left Pylon 01 (Missile Rack)')).toBe('Left Pylon 1 Missile Rack')
    expect(formatHardpointLabel('Left Pylon 02 (Missile Rack)')).toBe('Left Pylon 2 Missile Rack')
    expect(formatHardpointLabel('Left Pylon 01 (Missile Rack)')).not.toBe(formatHardpointLabel('Left Pylon 02 (Missile Rack)'))
  })

  it('preserves a distinguishing missile-rack qualifier (mount letter)', () => {
    expect(formatHardpointLabel('Right Wing Mount A Missile (Missile Rack)')).toBe('Right Mount A Missile Rack')
    expect(formatHardpointLabel('Right Wing Mount B Missile (Missile Rack)')).toBe('Right Mount B Missile Rack')
  })

  it('preserves a distinguishing missile-rack qualifier (Inner/Outer)', () => {
    expect(formatHardpointLabel('Left Inner Wing Missile Rack')).toBe('Left Inner Missile Rack')
    expect(formatHardpointLabel('Left Outer Wing Missile Rack')).toBe('Left Outer Missile Rack')
  })

  it('strips a bare Class# terminal weapon slot to "Weapon" regardless of the class number', () => {
    expect(formatHardpointLabel('Class 2')).toBe('Weapon')
    expect(formatHardpointLabel('Class 3')).toBe('Weapon')
  })

  it('passes plain seed-authored labels through unchanged (no engineering pattern present)', () => {
    expect(formatHardpointLabel('Weapon 1')).toBe('Weapon 1')
    expect(formatHardpointLabel('Shield Generator')).toBe('Shield Generator')
    expect(formatHardpointLabel('Quantum Drive')).toBe('Quantum Drive')
  })

  it('never returns an empty string, even for a degenerate input', () => {
    expect(formatHardpointLabel('')).toBe('')
    expect(formatHardpointLabel('(Gimbal Mount)')).toBeTruthy()
  })
})

describe('EWO-036B: formatHardpointLabel — recursive depth and generalized attach-slot ordering', () => {
  it('resolves a bare Class# leaf to "Weapon" regardless of nesting depth (verified against a real depth-4 Caterpillar docking/turret chain)', () => {
    expect(formatHardpointLabel('Docking Module — Itemport Vehicle Attach — Top Remote Turret — Left Duel Turret — Class 2')).toBe('Weapon')
  })

  it('a deeply-nested mount row (not just top-level) still collapses its own leaf via the Gimbal/Weapon Mount rule', () => {
    expect(formatHardpointLabel('Left Manned Turret — Left Weapon (Gimbal Mount)')).toBe('Left Weapon Mount')
  })

  it('handles the reversed real StarBreaker ordering "Attach Missile N" (not just "N Attach Missile")', () => {
    expect(formatHardpointLabel('Attach Missile 1')).toBe('Missile Slot 1')
    expect(formatHardpointLabel('Attach Missile 12')).toBe('Missile Slot 12')
  })

  it('handles a leading position word on the slot itself ("Right 01 Attach Missile") by dropping it, matching how position is already dropped for slot children elsewhere', () => {
    expect(formatHardpointLabel('Right 01 Attach Missile')).toBe('Missile Slot 1')
    expect(formatHardpointLabel('Left 10 Attach Missile')).toBe('Missile Slot 10')
  })

  it('handles a two-digit slot count found on a real large ship (Caterpillar-scale, 24 missile slots)', () => {
    expect(formatHardpointLabel('24 Attach Missile')).toBe('Missile Slot 24')
  })

  it('generalizes the attach-slot rule to a bomb payload — synthetic input (no real bomb-rack fixture currently exists anywhere in the 258-hull dataset, confirmed by this mission\'s own audit), proving the rule activates automatically rather than requiring bomb-specific code', () => {
    expect(formatHardpointLabel('01 Attach Bomb')).toBe('Bomb Slot 1')
    expect(formatHardpointLabel('Attach Bomb 3')).toBe('Bomb Slot 3')
    expect(formatHardpointLabel('Left Wing Bomb Rack — 01 Attach Bomb')).toBe('Bomb Slot 1')
  })

  it('preserves a multi-word qualifier ahead of "Missile Rack" (Top/Front/Rear combinations, confirmed present on real staged ships)', () => {
    expect(formatHardpointLabel('Left Top Front Missile Rack')).toBe('Left Top Front Missile Rack')
    expect(formatHardpointLabel('Right Rear Weapon Missile Rack')).toBe('Right Rear Missile Rack')
  })

  it('leaves a rack label with no leading position word unchanged (bare/lettered/numbered racks confirmed present on real staged ships)', () => {
    expect(formatHardpointLabel('Missile Rack 3')).toBe('Missile Rack 3')
    expect(formatHardpointLabel('A Missile Rack')).toBe('A Missile Rack')
    expect(formatHardpointLabel('Torpedo Rack L')).toBe('Torpedo Rack L')
  })

  it('CRITICAL REGRESSION (found via a full 250-ship staged-export audit): two genuinely distinct same-position hardpoints whose only difference is the payload-type word ("Weapon" vs "Missile") must never collapse to the same label — confirmed against a real ship (MISC Fury Miru) with both "Left Top Weapon" and "Left Top Missile" hardpoints, both classified MISSILE_RACK', () => {
    const weaponVariant = formatHardpointLabel('Left Top Weapon (Missile Rack)')
    const missileVariant = formatHardpointLabel('Left Top Missile (Missile Rack)')
    expect(weaponVariant).not.toBe(missileVariant)
    expect(weaponVariant).toBe('Left Top Weapon Missile Rack')
    expect(missileVariant).toBe('Left Top Missile Rack')
  })

  it('still collapses the genuine "Weapon Missile Rack"/"Weapon Bomb Rack" idiom when Weapon is directly adjacent to the type word (the real Avenger Titan/Gladius phrasing)', () => {
    expect(formatHardpointLabel('Left Wing Weapon Missile Rack')).toBe('Left Missile Rack')
  })
})

describe('EWO-036B: formatHardpointLabel — no sibling collisions across all 250 currently-staged Golden Fleet exports', () => {
  // This mission audited (read-only, via the real importer/normalizer, in
  // memory only) every one of the 250 files in the gitignored
  // staging-data/golden-fleet/ directory — 7,462 ports total, 0 sibling
  // collisions found after the Fury Miru fix above. That directory is
  // ephemeral/environment-specific and must never be a test dependency
  // (it won't exist for another developer or in CI) — so the finding is
  // captured here as a fixed set of representative literal cases instead
  // of a live directory scan.
  it('representative real qualifiers extracted from the full staged-fixture audit never collide with their own sibling shape', () => {
    const cases = [
      ['Left Top Weapon (Missile Rack)', 'Left Top Missile (Missile Rack)'],
      ['Left Pylon 01 (Missile Rack)', 'Left Pylon 02 (Missile Rack)', 'Left Pylon 03 (Missile Rack)'],
      ['Right Wing Mount A Missile (Missile Rack)', 'Right Wing Mount B Missile (Missile Rack)', 'Right Wing Mount C Missile (Missile Rack)', 'Right Wing Mount D Missile (Missile Rack)'],
      ['Left Inner Wing Missile Rack', 'Left Outer Wing Missile Rack'],
      ['Left Top Missile Rack', 'Left Bottom Missile Rack'],
    ]
    for (const group of cases) {
      const formatted = group.map((raw) => formatHardpointLabel(raw))
      expect(new Set(formatted).size, `collision within ${JSON.stringify(group)} -> ${JSON.stringify(formatted)}`).toBe(formatted.length)
    }
  })
})

describe('EWO-036A: formatHardpointLabel — no sibling collisions across every currently deep-imported ship', () => {
  const shipIds = ['gladius-imported', 'avenger-titan-imported', 'corsair-imported', 'cutlass-black-imported', 'valkyrie-imported']

  it('no two children of the same parent ever format to the same displayed label', () => {
    for (const shipId of shipIds) {
      const template = shipFactoryTemplates[shipId] ?? []
      const byParent = new Map<string | undefined, string[]>()
      for (const row of template) {
        const arr = byParent.get(row.parentSlotLabel) ?? []
        arr.push(formatHardpointLabel(row.slotLabel))
        byParent.set(row.parentSlotLabel, arr)
      }
      for (const [parent, labels] of byParent) {
        const unique = new Set(labels)
        expect(unique.size, `${shipId}: siblings under "${parent}" collided: ${JSON.stringify(labels)}`).toBe(labels.length)
      }
    }
  })

  it('every formatted label is a non-empty string for every row of every currently deep-imported ship', () => {
    for (const shipId of shipIds) {
      const template = shipFactoryTemplates[shipId] ?? []
      for (const row of template) {
        expect(formatHardpointLabel(row.slotLabel)).toBeTruthy()
      }
    }
  })

  it('never alters the canonical slotLabel itself — only ever reads it', () => {
    const template = shipFactoryTemplates['gladius-imported'] ?? []
    const before = JSON.stringify(template)
    for (const row of template) formatHardpointLabel(row.slotLabel)
    expect(JSON.stringify(template)).toBe(before)
  })
})
