import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Writer } from '../src/engine/importer/interfaces'
import type { NormalizedShipPackage, DisplayNameMap } from '../src/engine/types'
import type { ValidationResult } from '../src/normalizer/validation'
import { goldenFixtures, compareToGoldenFixture } from '../src/normalizer/goldenFixture'

export interface PortSourceDetail {
  portId: string
  displayName: string
  internalName: string
  sizeSource: 'DataCore-explicit' | 'unknown'
  factorySource: 'entity-hierarchy' | 'none'
  mountPath: string[]
}

export interface ImportReportEntry {
  sourceFile: string
  shipId: string
  shipName: string
  portsIncluded: number
  componentsDiscovered: number
  assignmentsCreated: number
  warnings: number
  errors: number
  portSources: PortSourceDetail[]
  unresolvedConstraints: string[]
  conflicts: string[]
  mixedMissileTypeWarnings: string[]
  missingChildDefaults: string[]
  goldenFixtureResults?: { label: string; pass: boolean; message?: string }[]
}

export interface ImportReport {
  generatedAt: string
  ships: ImportReportEntry[]
  totalWarnings: number
  totalErrors: number
  /** Added after the writer runs, by scripts/importShips.ts — see
   * src/normalizer/shipImageManifest.ts for the summary shape. */
  images?: {
    resolved: number
    manual: number
    preservedExisting: number
    fallback: number
    failed: number
    ambiguous: number
  }
}

function countBySeverity(pkg: NormalizedShipPackage, severity: 'warning' | 'error'): number {
  return pkg.normalizationWarnings.filter((w) => w.severity === severity).length + pkg.compatibilityWarnings.filter((w) => w.severity === severity).length
}

function buildReportEntry(pkg: NormalizedShipPackage): ImportReportEntry {
  const portSources: PortSourceDetail[] = pkg.ports.map((p) => ({
    portId: p.id,
    displayName: p.displayName,
    internalName: p.internalName,
    // "DataCore-explicit" here means the raw source actually carried
    // minSize/maxSize/size fields — see PORT SIZE RESOLUTION: authoritative
    // sizing must trace back to real source fields, never a helper-name guess.
    sizeSource: p.minSize !== null && p.maxSize !== null ? 'DataCore-explicit' : 'unknown',
    factorySource: p.factoryItemId ? 'entity-hierarchy' : 'none',
    mountPath: pkg.equipmentAssignments.find((a) => a.portId === p.id)?.mountPath ?? [p.internalName],
  }))

  const unresolvedConstraints = pkg.normalizationWarnings.filter((w) => w.code === 'missing-size-constraint' || w.code === 'missing-allowed-types').map((w) => w.message)
  const conflicts = [...pkg.normalizationWarnings, ...pkg.compatibilityWarnings].filter((w) => w.code === 'size-conflict').map((w) => w.message)
  const mixedMissileTypeWarnings = pkg.normalizationWarnings.filter((w) => w.code === 'mixed-child-items').map((w) => w.message)
  const missingChildDefaults = pkg.ports.filter((p) => !p.factoryItemId && (!p.childPortIds || p.childPortIds.length === 0)).map((p) => `${p.displayName} (${p.internalName}) has no factory item and is not a container port.`)

  const golden = goldenFixtures[pkg.ship.name]
  const goldenFixtureResults = golden ? compareToGoldenFixture(pkg, golden).map((r) => ({ label: r.label, pass: r.pass, message: r.message })) : undefined

  return {
    sourceFile: pkg.sourceMetadata.sourceFile,
    shipId: pkg.ship.id,
    shipName: pkg.ship.name,
    portsIncluded: pkg.ports.length,
    componentsDiscovered: pkg.components.length,
    assignmentsCreated: pkg.factoryLoadout.portAssignments.length,
    warnings: countBySeverity(pkg, 'warning'),
    errors: countBySeverity(pkg, 'error'),
    portSources,
    unresolvedConstraints,
    conflicts,
    mixedMissileTypeWarnings,
    missingChildDefaults,
    goldenFixtureResults,
  }
}

/**
 * `GeneratedDataWriter` — the only stage allowed to touch /generated-data.
 * Node-only (uses `fs` directly), which is exactly why it lives under
 * /scripts rather than /src: nothing under /src should import Node
 * built-ins, since /src is the Vite browser bundle's source root.
 *
 * Writes the split-file layout docs/DATA_ENGINE.md describes, built by
 * concatenating every package's respective arrays across all imported
 * ships. import-report.json additionally records, per ship: the
 * authoritative source used for every port's size and factory item, any
 * unresolved constraints or conflicts, the recursive-resolution mount
 * path for every collapsed equipment assignment, mixed-missile-type
 * warnings, and — when a golden fixture exists for that ship name —
 * pass/fail comparison results.
 *
 * Never touches Layer 3 player data: nothing here reads or writes
 * src/data/seed.ts or anything the Zustand store owns.
 */
export class GeneratedDataWriter implements Writer {
  write(packages: NormalizedShipPackage[], outputDir: string): void {
    mkdirSync(outputDir, { recursive: true })

    const ships = packages.map((p) => p.ship)
    const ports = packages.flatMap((p) => p.ports)
    const components = packages.flatMap((p) => p.components)
    const factoryLoadouts = packages.map((p) => p.factoryLoadout)
    const installedLoadouts = packages.map((p) => p.installedLoadout)
    const targetBuilds = packages.map((p) => p.defaultTargetBuild)
    const equipmentAssignments = packages.flatMap((p) => p.equipmentAssignments)

    const displayNameMap: DisplayNameMap = {}
    for (const p of packages) {
      for (const port of p.ports) displayNameMap[port.internalName] = port.displayName
      for (const c of p.components) displayNameMap[c.internalName] = c.displayName
    }

    const report: ImportReport = {
      generatedAt: new Date().toISOString(),
      ships: packages.map(buildReportEntry),
      totalWarnings: packages.reduce((sum, p) => sum + countBySeverity(p, 'warning'), 0),
      totalErrors: packages.reduce((sum, p) => sum + countBySeverity(p, 'error'), 0),
    }

    const write = (filename: string, data: unknown) => writeFileSync(join(outputDir, filename), JSON.stringify(data, null, 2) + '\n', 'utf-8')

    write('ships.json', ships)
    write('ports.json', ports)
    write('components.json', components)
    write('factory-loadouts.json', factoryLoadouts)
    write('installed-loadouts.json', installedLoadouts)
    write('target-builds.json', targetBuilds)
    write('display-name-map.json', displayNameMap)
    write('equipment-assignments.json', equipmentAssignments)
    write('import-report.json', report)
  }
}

/** Merges validation results into a package's own warning arrays, in place. */
export function applyValidation(pkg: NormalizedShipPackage, result: ValidationResult): void {
  pkg.normalizationWarnings.push(...result.normalizationWarnings)
  pkg.compatibilityWarnings.push(...result.compatibilityWarnings)
}
