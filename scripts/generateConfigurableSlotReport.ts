#!/usr/bin/env tsx
/**
 * SW-010A (Objective 6) — Configurable Slot Adapter validation driver.
 *
 * Runs the full Stage 7 -> 8 -> 9 pipeline (`scripts/configurableSlots/`)
 * against the known, live-verified validation set from ADR-014 / SW-010A:
 * the Hornet Mk II center assembly, the Retaliator's front and rear
 * modules, the RSI Scorpius turret, and the Argo MOTH missile turret.
 *
 * This script is a development/certification tool, not part of the
 * runtime app and not wired into `generate:component-catalog` — SW-010A
 * is infrastructure-only (no Commander-visible behavior, no catalog
 * changes). It exists to *prove* the pipeline discovers real configurable
 * slots correctly, and to produce the diagnostics report Objective 5
 * requires.
 *
 * Usage:
 *   npm run generate:configurable-slot-report
 *
 * Override the default local paths via:
 *   STARBREAKER_EXE=<path to starbreaker.exe>
 *   SC_DATA_P4K=<path to Data.p4k>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runDcbQuery, parseDcbQueryResult } from './componentCatalog/dcbQuery'
import { runBulkFieldQuery } from './universeCatalog/dcbBulkQuery'
import { extractDefaultLoadoutConfiguration, normalizeEntityClassReference } from './configurableSlots/defaultLoadoutExtractor'
import { buildGlobalTagIndex, resolveSwapGroup } from './configurableSlots/swapGroupResolver'
import { buildEntityClassCaseIndex, resolveEntityClassReference } from './configurableSlots/referenceResolution'
import { mergeConfigurableTopology, type ResolvedConfigurationEntry } from './configurableSlots/canonicalMerge'
import { buildConfigurableSlotDiagnosticsReport, formatConfigurableSlotDiagnosticsSummary } from './configurableSlots/diagnostics'
import type { CanonicalConfigurableTopology, PhysicalPortFact, SwapGroup } from './configurableSlots/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const DEFAULT_STARBREAKER_EXE = 'D:\\StarBreaker-main\\StarBreaker-main\\target\\release\\starbreaker.exe'
const DEFAULT_DATA_P4K = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k'

/** ADR-014 / SW-010A's own proven validation set — real vessels, real
 * ports, chosen because Phase 1/2 of the SW-008C Revision 1 investigation
 * already live-verified each one's swap-group tag family by hand. Not a
 * ship-specific rule inside the pipeline itself (Objective 2's "no
 * ship-specific code" applies to the resolver/merge modules, which never
 * reference this list) — this is only the certification driver's own
 * fixed input set, exactly like `docs/ImportPipeline.md`'s certification
 * fixtures section names specific real ships without the pipeline itself
 * knowing their names. */
const VALIDATION_SHIPS = ['ANVL_Hornet_F7CS_Mk2', 'AEGS_Retaliator', 'RSI_Scorpius', 'ARGO_MOTH']

/** Real raw-data StarBreaker geometry fixtures already in this repo,
 * reused here only for their materialized port-name list (the minimal
 * `PhysicalPortFact[]` Stage 9 needs to decide "attach vs. synthesize") —
 * never re-parsed for anything else. This driver does not duplicate
 * `src/normalizer`; it reads only `port`/`children` from the raw
 * StarBreaker loadout shape. */
const RAW_DATA_FILE_BY_SHIP: Record<string, string> = {
  ANVL_Hornet_F7CS_Mk2: 'ANVL_Hornet_F7CS_Mk2.json',
  AEGS_Retaliator: 'AEGS_Retaliator.json',
  RSI_Scorpius: 'RSI_Scorpius.json',
  ARGO_MOTH: 'ARGO_MOTH.json',
}

function collectPhysicalPortNames(loadoutNode: unknown, out: Set<string>): void {
  if (!Array.isArray(loadoutNode)) return
  for (const node of loadoutNode) {
    if (!node || typeof node !== 'object') continue
    const port = (node as { port?: unknown }).port
    if (typeof port === 'string' && port) out.add(port)
    collectPhysicalPortNames((node as { children?: unknown }).children, out)
  }
}

function loadPhysicalPorts(shipEntityClass: string): PhysicalPortFact[] {
  const fileName = RAW_DATA_FILE_BY_SHIP[shipEntityClass]
  const path = join(REPO_ROOT, 'raw-data', fileName)
  if (!existsSync(path)) return []
  const doc = JSON.parse(readFileSync(path, 'utf-8'))
  const names = new Set<string>()
  collectPhysicalPortNames(doc.loadout, names)
  return [...names].map((itemPortName) => ({ itemPortName, hasFactoryItem: true }))
}

async function main(): Promise<void> {
  const starbreakerExe = process.env.STARBREAKER_EXE ?? DEFAULT_STARBREAKER_EXE
  const dataP4k = process.env.SC_DATA_P4K ?? DEFAULT_DATA_P4K
  if (!existsSync(starbreakerExe)) throw new Error(`StarBreaker executable not found at "${starbreakerExe}". Set STARBREAKER_EXE to override.`)
  if (!existsSync(dataP4k)) throw new Error(`Data.p4k not found at "${dataP4k}". Set SC_DATA_P4K to override.`)

  console.log('Running full-catalog AttachDef.Tags bulk query (Authority 3)...')
  const tagsResult = runBulkFieldQuery(starbreakerExe, dataP4k, 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Tags')
  console.log(`  ${tagsResult.values.size} entities carry a Tags value.`)

  const globalTagIndex = buildGlobalTagIndex(tagsResult.values)
  const caseIndex = buildEntityClassCaseIndex(tagsResult.values.keys())
  const knownCatalogEntityClasses = new Set(tagsResult.values.keys())

  // Swap groups are resolved once per distinct default entity class
  // across the whole validation run, then cached — never re-resolved per
  // ship (SwapGroupSpecification.md §6).
  const swapGroupCache = new Map<string, SwapGroup | null>()
  function resolveSwapGroupCached(defaultEntityClass: string): SwapGroup | null {
    if (swapGroupCache.has(defaultEntityClass)) return swapGroupCache.get(defaultEntityClass)!
    const resolved = resolveSwapGroup({ defaultEntityClass, knownCatalogEntityClasses }, tagsResult.values, globalTagIndex)
    swapGroupCache.set(defaultEntityClass, resolved)
    return resolved
  }

  const topologies: CanonicalConfigurableTopology[] = []

  for (const shipEntityClass of VALIDATION_SHIPS) {
    console.log(`\nProcessing ${shipEntityClass}...`)
    const dcbResult = runDcbQuery(starbreakerExe, dataP4k, shipEntityClass)
    const outcome = parseDcbQueryResult(shipEntityClass, dcbResult)
    if (outcome.kind !== 'resolved') {
      console.log(`  SKIPPED: ${outcome.reason}`)
      continue
    }

    const extraction = extractDefaultLoadoutConfiguration(outcome.record)
    console.log(`  Default Loadout entries: ${extraction.entries.length} (${extraction.referenceOnlyEntries.length} reference-only)`)

    const physicalPorts = loadPhysicalPorts(shipEntityClass)
    console.log(`  Physical Port Graph (from raw-data fixture): ${physicalPorts.length} materialized ports`)

    const resolvedEntries: ResolvedConfigurationEntry[] = extraction.entries.map((entry) => {
      let resolvedDefaultEntityClass: string | null = entry.factoryEntityClassName
      if (!resolvedDefaultEntityClass && entry.factoryEntityClassReference) {
        const normalized = normalizeEntityClassReference(entry.factoryEntityClassReference)
        resolvedDefaultEntityClass = resolveEntityClassReference(normalized, caseIndex)
      }
      return { entry, resolvedDefaultEntityClass }
    })

    const topology = mergeConfigurableTopology({
      shipEntityClass,
      physicalPorts,
      configurationEntries: resolvedEntries,
      resolveSwapGroupFor: resolveSwapGroupCached,
    })
    topologies.push(topology)

    const resolvedSlots = topology.configurableSlots.filter((s) => s.confidence !== 'unresolved')
    console.log(`  Configurable slots discovered: ${topology.configurableSlots.length} (${resolvedSlots.length} with a resolved swap group)`)
    for (const slot of resolvedSlots) {
      console.log(`    - ${slot.portName}: default=${slot.defaultComponentEntityClass}, swapGroup="${slot.swapGroupId}", eligible=[${slot.eligibleComponents.join(', ')}], confidence=${slot.confidence}`)
    }
  }

  const report = buildConfigurableSlotDiagnosticsReport(topologies)
  console.log(`\n${formatConfigurableSlotDiagnosticsSummary(report)}`)

  const outputDir = join(REPO_ROOT, 'generated-data')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'configurable-slot-report.json')
  writeFileSync(outputPath, JSON.stringify({ report, topologies }, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
