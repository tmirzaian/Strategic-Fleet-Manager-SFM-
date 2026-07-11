import type { NormalizedShipPackage } from '../engine/types'

/**
 * One expected value the golden fixture comparison checks for a given
 * ship. Deliberately generic — `compareToGoldenFixture` doesn't know or
 * care which ship it's validating; only the registry entry below is
 * Gladius-specific, and it's test/QA data, not importer resolution logic.
 */
export interface GoldenExpectation {
  /** Human label for the expected row, e.g. "Nose Weapon". */
  label: string
  displayName: string
  minSize: number | null
  maxSize: number | null
  /** Expected resolved item display name, or 'MIXED' for a deliberately mixed rack. */
  itemDisplayName: string | 'MIXED'
}

export interface GoldenFixtureSpec {
  shipName: string
  expectations: GoldenExpectation[]
}

export interface GoldenComparisonResult {
  label: string
  pass: boolean
  expected: GoldenExpectation
  actual: {
    displayName: string
    minSize: number | null
    maxSize: number | null
    itemDisplayName: string
  } | null
  message?: string
}

/**
 * Authoritative golden fixture for the Gladius, per Sprint 1.3F. This is
 * test/QA data describing the expected result of importing the Gladius
 * fixture — it does not influence resolution logic at all, and nothing in
 * ShipNormalizer/equipmentResolver/etc. references it.
 */
export const goldenFixtures: Record<string, GoldenFixtureSpec> = {
  Gladius: {
    shipName: 'Gladius',
    expectations: [
      { label: 'Nose Weapon', displayName: 'Nose Weapon', minSize: 3, maxSize: 3, itemDisplayName: 'CF-337 Panther Repeater' },
      { label: 'Left Wing Weapon', displayName: 'Left Wing Weapon', minSize: 3, maxSize: 3, itemDisplayName: 'CF-337 Panther Repeater' },
      { label: 'Right Wing Weapon', displayName: 'Right Wing Weapon', minSize: 3, maxSize: 3, itemDisplayName: 'CF-337 Panther Repeater' },
      { label: 'Power Plant', displayName: 'Power Plant', minSize: 1, maxSize: 1, itemDisplayName: 'Regulus' },
      { label: 'Left Cooler', displayName: 'Left Cooler', minSize: 1, maxSize: 1, itemDisplayName: 'Bracer' },
      { label: 'Right Cooler', displayName: 'Right Cooler', minSize: 1, maxSize: 1, itemDisplayName: 'Bracer' },
      { label: 'Left Shield Generator', displayName: 'Left Shield Generator', minSize: 1, maxSize: 1, itemDisplayName: 'AllStop' },
      { label: 'Right Shield Generator', displayName: 'Right Shield Generator', minSize: 1, maxSize: 1, itemDisplayName: 'AllStop' },
      { label: 'Quantum Drive', displayName: 'Quantum Drive', minSize: 1, maxSize: 1, itemDisplayName: 'Beacon' },
      { label: 'Left Inner Missile Rack', displayName: 'Left Inner Missile Rack', minSize: 2, maxSize: 2, itemDisplayName: 'Tempest Missile' },
      { label: 'Right Inner Missile Rack', displayName: 'Right Inner Missile Rack', minSize: 2, maxSize: 2, itemDisplayName: 'Tempest Missile' },
      { label: 'Left Outer Missile Rack', displayName: 'Left Outer Missile Rack', minSize: 2, maxSize: 2, itemDisplayName: 'Tempest Missile' },
      { label: 'Right Outer Missile Rack', displayName: 'Right Outer Missile Rack', minSize: 2, maxSize: 2, itemDisplayName: 'MIXED' },
    ],
  },
}

/**
 * Compares a normalized package's resolved equipment assignments against
 * a golden fixture spec, purely by structural lookup (match on
 * displayName) — generic across any ship/spec pairing.
 */
export function compareToGoldenFixture(pkg: NormalizedShipPackage, spec: GoldenFixtureSpec): GoldenComparisonResult[] {
  const componentById = new Map(pkg.components.map((c) => [c.id, c]))

  return spec.expectations.map((expected): GoldenComparisonResult => {
    const assignment = pkg.equipmentAssignments.find((a) => a.displayName === expected.displayName)
    if (!assignment) {
      return { label: expected.label, pass: false, expected, actual: null, message: `No resolved assignment found for "${expected.displayName}".` }
    }

    const actualItemDisplayName = assignment.mixedChildItems ? 'MIXED' : assignment.resolvedItemId ? componentById.get(assignment.resolvedItemId)?.displayName ?? '(unknown component)' : '(none)'

    const actual = {
      displayName: assignment.displayName,
      minSize: assignment.minSize,
      maxSize: assignment.maxSize,
      itemDisplayName: actualItemDisplayName,
    }

    const pass = actual.minSize === expected.minSize && actual.maxSize === expected.maxSize && actual.itemDisplayName === expected.itemDisplayName

    return { label: expected.label, pass, expected, actual, message: pass ? undefined : 'Mismatch — see expected vs. actual.' }
  })
}
