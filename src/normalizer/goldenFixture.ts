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
 * Authoritative golden fixture for the Gladius. Originally hand-authored
 * (Sprint 1.3F) against an illustrative, non-authoritative fixture;
 * reconciled in Mission M-010 against the real `raw-data/AEGS Gladius.json`
 * StarBreaker export, the locally-generated Component Metadata Catalog,
 * and the deterministic classification/equipment-resolution pipeline —
 * see docs/ImportPipeline.md's "Golden fixture reconciliation" section
 * for the itemized previous-value/new-value/evidence table. This is
 * test/QA data describing the expected result of importing the Gladius
 * fixture — it does not influence resolution logic at all, and nothing in
 * ShipNormalizer/equipmentResolver/etc. references it.
 *
 * `itemDisplayName` values are the real, authoritative component
 * identities — rendered as their raw entity-class string (e.g.
 * "POWR AEGS S01 Regulus SCItem") because catalog-sourced components
 * don't yet have a prettified display name (`displayNameGenerator.ts`'s
 * heuristics were built for port internal names, not entity class names).
 * This is a documented display-only limitation (Mission M-009/M-010),
 * not a factual error — the underlying component identity is correct.
 */
export const goldenFixtures: Record<string, GoldenFixtureSpec> = {
  Gladius: {
    shipName: 'Gladius',
    expectations: [
      { label: 'Nose Weapon', displayName: 'Nose Weapon', minSize: 3, maxSize: 3, itemDisplayName: 'GATS BallisticGatling S3' },
      { label: 'Left Wing Weapon', displayName: 'Left Wing Weapon', minSize: 3, maxSize: 3, itemDisplayName: 'KLWE LaserRepeater S3' },
      { label: 'Right Wing Weapon', displayName: 'Right Wing Weapon', minSize: 3, maxSize: 3, itemDisplayName: 'KLWE LaserRepeater S3' },
      { label: 'Power Plant', displayName: 'Power Plant', minSize: 1, maxSize: 1, itemDisplayName: 'POWR AEGS S01 Regulus SCItem' },
      { label: 'Left Cooler', displayName: 'Left Cooler', minSize: 1, maxSize: 1, itemDisplayName: 'COOL AEGS S01 Bracer SCItem' },
      { label: 'Right Cooler', displayName: 'Right Cooler', minSize: 1, maxSize: 1, itemDisplayName: 'COOL AEGS S01 Bracer SCItem' },
      { label: 'Left Shield Generator', displayName: 'Left Shield Generator', minSize: 1, maxSize: 1, itemDisplayName: 'SHLD GODI S01 AllStop SCItem' },
      { label: 'Right Shield Generator', displayName: 'Right Shield Generator', minSize: 1, maxSize: 1, itemDisplayName: 'SHLD GODI S01 AllStop SCItem' },
      { label: 'Quantum Drive', displayName: 'Quantum Drive', minSize: 1, maxSize: 1, itemDisplayName: 'QDRV WETK S01 Beacon SCItem' },
      {
        label: 'Jump Drive',
        displayName: 'Jump Drive',
        minSize: 1,
        maxSize: 1,
        itemDisplayName: 'JDRV TARS S01 Explorer SCItem',
      },
      { label: 'Left Inner Missile Rack', displayName: 'Left Inner Wing Missile Rack', minSize: 3, maxSize: 3, itemDisplayName: 'MISL S03 CS FSKI Arrester' },
      { label: 'Right Inner Missile Rack', displayName: 'Right Inner Wing Missile Rack', minSize: 3, maxSize: 3, itemDisplayName: 'MISL S03 CS FSKI Arrester' },
      { label: 'Left Outer Missile Rack', displayName: 'Left Outer Wing Missile Rack', minSize: 2, maxSize: 2, itemDisplayName: 'MISL S02 IR FSKI Ignite' },
      { label: 'Right Outer Missile Rack', displayName: 'Right Outer Wing Missile Rack', minSize: 2, maxSize: 2, itemDisplayName: 'MISL S02 IR FSKI Ignite' },
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
