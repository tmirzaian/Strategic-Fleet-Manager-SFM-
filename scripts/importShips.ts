#!/usr/bin/env tsx
/**
 * Developer CLI for the SFM ship import pipeline.
 *
 * Usage:
 *   npm run import:ships                          # imports every *.json in raw-data/
 *   npm run import:ship -- "raw-data/AEGS Gladius.json"   # imports one file
 *   tsx scripts/importShips.ts raw-data/some-other-dir    # any file or directory
 *
 * Runs entirely under Node — no React/Vite dev server involved. Reads raw
 * StarBreaker-style JSON from disk, runs it through the same
 * StarBreakerImporter -> ShipNormalizer -> validateNormalizedPackage
 * pipeline used everywhere else, and writes the result to
 * /generated-data. Never touches player data (src/data/seed.ts or
 * anything the Zustand store owns).
 */
import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, extname, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RawFileReader } from '../src/engine/importer/rawFileReader'
import { StarBreakerImporter } from '../src/engine/importer/starBreakerImporter'
import { ShipNormalizer } from '../src/normalizer/shipNormalizer'
import { validateNormalizedPackage } from '../src/normalizer/validation'
import { goldenFixtures, compareToGoldenFixture } from '../src/normalizer/goldenFixture'
import { buildShipImageManifest, type ShipImageManifestEntry, type ImageManifestSummary } from '../src/normalizer/shipImageManifest'
import { shipImageOverrides } from '../src/data/shipImageOverrides'
import type { NormalizedShipPackage } from '../src/engine/types'
import { GeneratedDataWriter, applyValidation } from './generatedDataWriter'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')
const DEFAULT_INPUT = join(REPO_ROOT, 'raw-data')
const OUTPUT_DIR = join(REPO_ROOT, 'generated-data')

class NodeFsReader implements RawFileReader {
  constructor(private files: string[]) {}
  listFiles(): string[] {
    return this.files
  }
  readFile(path: string): string {
    return readFileSync(path, 'utf-8')
  }
}

function resolveInputFiles(inputArg: string | undefined): string[] {
  const target = resolve(REPO_ROOT, inputArg ?? DEFAULT_INPUT)
  const stat = statSync(target, { throwIfNoEntry: false })

  if (!stat) {
    console.error(`No such file or directory: ${target}`)
    process.exit(1)
  }

  if (stat.isFile()) {
    return [target]
  }

  return readdirSync(target)
    .filter((f) => extname(f).toLowerCase() === '.json')
    .map((f) => join(target, f))
}

async function main() {
  const inputArg = process.argv[2]
  const files = resolveInputFiles(inputArg)

  if (files.length === 0) {
    console.log('No .json files found to import.')
    return
  }

  const reader = new NodeFsReader(files)
  const importer = new StarBreakerImporter(reader)
  const normalizer = new ShipNormalizer()

  const packages: NormalizedShipPackage[] = []
  const failures: Array<{ file: string; error: string }> = []

  for (const sourcePath of await importer.listSources()) {
    const relativePath = relative(REPO_ROOT, sourcePath)
    try {
      const raw = await importer.read(sourcePath)
      const pkg = normalizer.normalize(raw, relativePath)
      const validation = validateNormalizedPackage(pkg)
      applyValidation(pkg, validation)
      packages.push(pkg)
    } catch (err) {
      failures.push({ file: relativePath, error: (err as Error).message })
    }
  }

  if (packages.length > 0) {
    new GeneratedDataWriter().write(packages, OUTPUT_DIR)
  }

  const imageSummary = writeImageManifest(packages, OUTPUT_DIR)
  mergeImageSummaryIntoReport(OUTPUT_DIR, imageSummary)

  printSummary(packages, failures, imageSummary)

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

/** Adds the `images` summary block to import-report.json, if it exists. */
function mergeImageSummaryIntoReport(outputDir: string, imageSummary: ImageManifestSummary) {
  const reportPath = join(outputDir, 'import-report.json')
  if (!existsSync(reportPath)) return
  const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
  report.images = imageSummary
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8')
}

/**
 * Builds generated-data/ship-images.json covering both the seed fleet
 * (via src/data/shipImageOverrides.ts — manual, already-approved URLs)
 * and every ship imported in this run. Reads back any existing manifest
 * first so a resolved/manual entry from a previous run is never
 * downgraded just because this run didn't touch that ship — see
 * buildShipImageManifest's merge precedence.
 */
function writeImageManifest(packages: NormalizedShipPackage[], outputDir: string): ImageManifestSummary {
  const manifestPath = join(outputDir, 'ship-images.json')
  let existingManifest: ShipImageManifestEntry[] = []
  if (existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch {
      existingManifest = []
    }
  }

  // Seed fleet ids (manual overrides) plus every ship touched this run —
  // a ship id appearing in both is fine, entries are deduped by shipId.
  const shipIds = Array.from(new Set([...Object.keys(shipImageOverrides), ...packages.map((p) => p.ship.id)]))

  const { manifest, summary } = buildShipImageManifest(shipIds, shipImageOverrides, existingManifest)
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  return summary
}

function printSummary(packages: NormalizedShipPackage[], failures: Array<{ file: string; error: string }>, imageSummary: ImageManifestSummary) {
  console.log('\n=== SFM Ship Import Summary ===\n')

  for (const pkg of packages) {
    const warnings = pkg.normalizationWarnings.filter((w) => w.severity === 'warning').length + pkg.compatibilityWarnings.filter((w) => w.severity === 'warning').length
    const errors = pkg.normalizationWarnings.filter((w) => w.severity === 'error').length + pkg.compatibilityWarnings.filter((w) => w.severity === 'error').length

    console.log(`${pkg.ship.name} (${pkg.sourceMetadata.sourceFile})`)
    console.log(`  ships imported:      1`)
    console.log(`  ports included:      ${pkg.ports.length}`)
    console.log(`  components:          ${pkg.components.length}`)
    console.log(`  assignments created: ${pkg.factoryLoadout.portAssignments.length}`)
    console.log(`  warnings:            ${warnings}`)
    console.log(`  errors:              ${errors}`)
    if (errors > 0) {
      for (const w of [...pkg.normalizationWarnings, ...pkg.compatibilityWarnings].filter((w) => w.severity === 'error')) {
        console.log(`    ERROR [${w.code}] ${w.message}`)
      }
    }

    const golden = goldenFixtures[pkg.ship.name]
    if (golden) {
      const results = compareToGoldenFixture(pkg, golden)
      const passed = results.filter((r) => r.pass).length
      console.log(`  golden fixture:      ${passed}/${results.length} passed`)
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`    FAIL [${r.label}] expected ${r.expected.minSize}-${r.expected.maxSize} ${r.expected.itemDisplayName}, got ${r.actual ? `${r.actual.minSize}-${r.actual.maxSize} ${r.actual.itemDisplayName}` : 'no assignment'}`)
      }
    }
    console.log('')
  }

  if (failures.length > 0) {
    console.log('Failed to import:')
    for (const f of failures) {
      console.log(`  ${f.file}: ${f.error}`)
    }
    console.log('')
  }

  const totalPorts = packages.reduce((sum, p) => sum + p.ports.length, 0)
  const totalComponents = packages.reduce((sum, p) => sum + p.components.length, 0)
  const totalAssignments = packages.reduce((sum, p) => sum + p.factoryLoadout.portAssignments.length, 0)
  const totalWarnings = packages.reduce((sum, p) => sum + p.normalizationWarnings.filter((w) => w.severity === 'warning').length + p.compatibilityWarnings.filter((w) => w.severity === 'warning').length, 0)
  const totalErrors = packages.reduce((sum, p) => sum + p.normalizationWarnings.filter((w) => w.severity === 'error').length + p.compatibilityWarnings.filter((w) => w.severity === 'error').length, 0)

  console.log('--- Totals ---')
  console.log(`ships imported:      ${packages.length}`)
  console.log(`ports included:      ${totalPorts}`)
  console.log(`components:          ${totalComponents}`)
  console.log(`assignments created: ${totalAssignments}`)
  console.log(`warnings:            ${totalWarnings}`)
  console.log(`errors:              ${totalErrors}`)
  console.log('\n--- Ship Images ---')
  console.log(`resolved:            ${imageSummary.resolved}`)
  console.log(`manual:              ${imageSummary.manual}`)
  console.log(`preserved existing:  ${imageSummary.preservedExisting}`)
  console.log(`fallback:            ${imageSummary.fallback}`)
  console.log(`failed:              ${imageSummary.failed}`)
  console.log(`ambiguous:           ${imageSummary.ambiguous}`)
  console.log(`\nWrote generated-data/ (${packages.length > 0 ? 'ships.json, ports.json, components.json, factory-loadouts.json, installed-loadouts.json, target-builds.json, display-name-map.json, equipment-assignments.json, ship-images.json, import-report.json' : 'ship-images.json only — no packages produced'})`)
}

main()
