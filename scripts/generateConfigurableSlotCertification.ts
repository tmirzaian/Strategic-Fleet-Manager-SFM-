#!/usr/bin/env tsx
/**
 * SW-010B — Configurable Topology Certification.
 *
 * Runs the SW-010A Configurable Slot Adapter pipeline
 * (`scripts/configurableSlots/`) across every ship in `raw-data/` — the
 * repo's real, deep-imported "currently supported fleet" set (confirmed
 * during SW-010B investigation: `npm run import:ships` consumes every
 * `raw-data/*.json` file and produces exactly that many `generated-data/ships.json`
 * entries — 257 at the time of this sprint — so this IS the importer's
 * actual supported-ship universe, not a hand-picked sample).
 *
 * This is a certification tool, not runtime app code and not wired into
 * any `npm run generate:*` pipeline that feeds the app — SW-010B is
 * validation-only (Explicit Non-Goals: no Ship Workspace/UI changes, no
 * persistence changes). It exists to answer one question: does the
 * generalized swap-group/merge architecture actually scale across the
 * whole fleet without any ship-specific code path, or does it only work
 * for the 5 hand-verified SW-010A vessels?
 *
 * Query strategy note: a single whole-universe bulk query for the
 * Default Loadout component's nested `loadout[SItemPortLoadoutManualParams].entries`
 * field was attempted first (the same "one process invocation instead of
 * N" pattern `runBulkFieldQuery` already uses for scalar fields like
 * AttachDef.Tags). It did not return within 10+ minutes against the real
 * LIVE Data.p4k — StarBreaker resolving a deeply-nested, recursively-typed
 * polymorphic array across ~29k records appears substantially more
 * expensive than a scalar leaf field. Rather than gamble the certification
 * sprint on an unproven, seemingly-unbounded query, this driver falls
 * back to the proven, bounded SW-010A approach: one `dcb query --filter
 * <exact>` full-record fetch per ship (confirmed ~5-6s each), scoped only
 * to the 257 known raw-data entity classes (not the full ~29k universe) —
 * a predictable ~25 minute run, not a spawn-per-record scaling problem
 * for the ~29k-entity case ADR-014 originally worried about.
 *
 * Usage:
 *   npm run certify:configurable-slots
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runDcbQuery, parseDcbQueryResult } from './componentCatalog/dcbQuery'
import { runBulkFieldQuery } from './universeCatalog/dcbBulkQuery'
import { extractDefaultLoadoutConfiguration, normalizeEntityClassReference } from './configurableSlots/defaultLoadoutExtractor'
import { buildGlobalTagIndex, resolveSwapGroup } from './configurableSlots/swapGroupResolver'
import { buildEntityClassCaseIndex, resolveEntityClassReference } from './configurableSlots/referenceResolution'
import { mergeConfigurableTopology, type ResolvedConfigurationEntry } from './configurableSlots/canonicalMerge'
import { isNonPlayerVariantName } from './shipCatalog/playerVehicleTaxonomy'
import { stripTrailingCommas } from '../src/engine/importer/trailingCommaJson'
import type { CanonicalConfigurableTopology, ConfigurableSlot, PhysicalPortFact, SwapGroup } from './configurableSlots/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const DEFAULT_STARBREAKER_EXE = 'D:\\StarBreaker-main\\StarBreaker-main\\target\\release\\starbreaker.exe'
const DEFAULT_DATA_P4K = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k'

/** The 5 swap-group identifiers SW-010A hand-verified live against real
 * DataCore evidence before this certification sprint ever ran — the only
 * thing this constant is used for is Objective 2's Category A / Category
 * B split (has this exact group already been proven, or is the
 * generalized pipeline finding something new). It plays no role in
 * discovery, resolution, or merge — removing it would only change which
 * category a slot is labeled, never whether it's found. */
const CONFIRMED_SWAP_GROUP_IDS = new Set(['$ANVL_Hornet_Mk2_Center', 'AEGS_Retaliator_Module_Front', 'AEGS_Retaliator_Module_Rear', '$RSI_Scorpius_Turret', '$ARGO_MOTH_MissileTurret'])

interface RawDataShipEntry {
  entityClass: string
  file: string
}

function readJsonWithTrailingCommaFallback(path: string): unknown {
  const text = readFileSync(path, 'utf-8')
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(stripTrailingCommas(text))
  }
}

/** Enumerates every `raw-data/*.json` fixture and resolves its real entity
 * class from `root.entity` (`"EntityClassDefinition.<class>"`) — never
 * derived from the filename, which is inconsistently formatted (some
 * carry spaces, some underscores) across the fixture set. */
function enumerateRawDataShips(): RawDataShipEntry[] {
  const dir = join(REPO_ROOT, 'raw-data')
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const entries: RawDataShipEntry[] = []
  for (const file of files) {
    const doc = readJsonWithTrailingCommaFallback(join(dir, file)) as { root?: { entity?: unknown } }
    const entity = doc.root?.entity
    if (typeof entity !== 'string' || !entity.startsWith('EntityClassDefinition.')) continue
    entries.push({ entityClass: entity.slice('EntityClassDefinition.'.length), file })
  }
  return entries
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

function loadPhysicalPorts(file: string): PhysicalPortFact[] {
  const doc = readJsonWithTrailingCommaFallback(join(REPO_ROOT, 'raw-data', file)) as { loadout?: unknown }
  const names = new Set<string>()
  collectPhysicalPortNames(doc.loadout, names)
  return [...names].map((itemPortName) => ({ itemPortName, hasFactoryItem: true }))
}

type SlotCategory = 'A-confirmed' | 'B-newly-discovered' | 'C-review-required' | 'D-rejected'

interface DiscoveryRow {
  hull: string
  manufacturer: string | null
  portName: string
  swapGroupId: string | null
  eligibleComponentCount: number
  confidence: ConfigurableSlot['confidence']
  sourceAuthority: ConfigurableSlot['sourceAuthority']
  category: SlotCategory | null // null for unresolved slots — never classified, see classifySlot's doc comment
  rejectionReason: string | null
}

/**
 * The largest distinct-port-name span any SW-010A-confirmed swap group
 * exhibits on its own hull: the Argo MOTH's `$ARGO_MOTH_MissileTurret`
 * legitimately covers 2 ports (`hardpoint_turret_top` and
 * `turret_launcher` — a turret mount and its paired missile launcher,
 * live-verified as one real assembly). No confirmed group exceeds 2.
 * SW-010B's fleet sweep found a second, distinct false-positive pattern
 * the membership ceiling above doesn't catch: hull-IDENTITY tags (e.g.
 * `ANVL_Hornet_F7A`, `RSI_Perseus`) reused as the "relevant" tag for many
 * structurally unrelated ports on the same ship (armor + engine + six
 * different thrusters, all under one tag) — small enough in raw member
 * count to clear the plausibility ceiling, but not a real per-port
 * swap-group signal. Unlike the membership ceiling, this is NOT a data
 * error (the tag co-membership is real) — it's genuinely ambiguous
 * provenance, so it routes to Category C (Review Required) rather than
 * being rejected or silently accepted. Grounded in the one real proven
 * precedent (2), applied uniformly to any hull/tag, not tuned to exclude
 * any specific one.
 */
const MAX_CONFIRMED_PORT_SPAN_PER_HULL = 2

/**
 * Objective 2 classification. Deliberately reuses ONE pre-existing,
 * general-purpose mechanism (`isNonPlayerVariantName`, already
 * established and reviewed for an unrelated purpose — Mission M-012's
 * ship-catalog inclusion filter) rather than inventing a new heuristic —
 * per this work order's own constraint, "no heuristic should be added
 * solely to eliminate a single hull." A swap group whose eligible set
 * contains an AI/mission/test/wreck spawn-variant name is definitionally
 * not a real Commander-installable component alternative, regardless of
 * which hull it was found on.
 *
 * An `unresolved` slot (no swap-group tag found at all — the overwhelming
 * majority of ordinary, non-configurable ports) is never classified into
 * A/B/C/D — Objective 2 asks for "every discovered configurable slot,"
 * and a slot with no swap group is not a discovery, it's the baseline.
 */
function classifySlot(slot: ConfigurableSlot, portSpanForThisGroupOnThisHull: number): { category: SlotCategory | null; rejectionReason: string | null } {
  if (slot.confidence === 'unresolved') return { category: null, rejectionReason: null }

  const noiseMember = slot.eligibleComponents.find(isNonPlayerVariantName)
  if (noiseMember) {
    return { category: 'D-rejected', rejectionReason: `Eligible set includes "${noiseMember}", which matches the established non-player-variant name taxonomy (AI/mission/test/wreck spawn markers) — not a real installable alternative.` }
  }

  if (slot.swapGroupId && CONFIRMED_SWAP_GROUP_IDS.has(slot.swapGroupId)) {
    return { category: 'A-confirmed', rejectionReason: null }
  }

  if (portSpanForThisGroupOnThisHull > MAX_CONFIRMED_PORT_SPAN_PER_HULL) {
    return {
      category: 'C-review-required',
      rejectionReason: `Tag "${slot.swapGroupId}" is the resolved swap group for ${portSpanForThisGroupOnThisHull} distinct ports on this hull — exceeds the largest confirmed real precedent (${MAX_CONFIRMED_PORT_SPAN_PER_HULL}, the MOTH turret+launcher pair). Likely a hull-identity tag reused across unrelated port roles, not a per-port swap family — needs human review, not auto-acceptance.`,
    }
  }

  const ambiguous = slot.diagnostics.some((d) => d.code === 'swap-group-shared-across-slots')
  if (slot.eligibleComponents.length > 1 && !ambiguous) {
    return { category: 'B-newly-discovered', rejectionReason: null }
  }

  return { category: 'C-review-required', rejectionReason: null }
}

async function main(): Promise<void> {
  const starbreakerExe = process.env.STARBREAKER_EXE ?? DEFAULT_STARBREAKER_EXE
  const dataP4k = process.env.SC_DATA_P4K ?? DEFAULT_DATA_P4K
  if (!existsSync(starbreakerExe)) throw new Error(`StarBreaker executable not found at "${starbreakerExe}". Set STARBREAKER_EXE to override.`)
  if (!existsSync(dataP4k)) throw new Error(`Data.p4k not found at "${dataP4k}". Set SC_DATA_P4K to override.`)

  const ships = enumerateRawDataShips()
  console.log(`Fleet-wide certification: ${ships.length} raw-data ships enumerated.`)

  console.log('Running full-catalog AttachDef.Tags bulk query...')
  const tagsResult = runBulkFieldQuery(starbreakerExe, dataP4k, 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Tags')
  console.log(`  ${tagsResult.values.size} entities carry a Tags value.`)

  console.log('Running full-catalog manufacturer Code bulk query...')
  const manufacturerResult = runBulkFieldQuery(starbreakerExe, dataP4k, 'EntityClassDefinition.Components[VehicleComponentParams].manufacturer.Code')
  console.log(`  ${manufacturerResult.values.size} entities carry a manufacturer Code.`)

  const globalTagIndex = buildGlobalTagIndex(tagsResult.values)
  const caseIndex = buildEntityClassCaseIndex(tagsResult.values.keys())
  const knownCatalogEntityClasses = new Set(tagsResult.values.keys())

  const swapGroupCache = new Map<string, SwapGroup | null>()
  function resolveSwapGroupCached(defaultEntityClass: string): SwapGroup | null {
    if (swapGroupCache.has(defaultEntityClass)) return swapGroupCache.get(defaultEntityClass)!
    const resolved = resolveSwapGroup({ defaultEntityClass, knownCatalogEntityClasses }, tagsResult.values, globalTagIndex)
    swapGroupCache.set(defaultEntityClass, resolved)
    return resolved
  }

  const topologies: CanonicalConfigurableTopology[] = []
  const shipsWithNoLiveRecord: string[] = []
  const rows: DiscoveryRow[] = []

  for (let i = 0; i < ships.length; i++) {
    const { entityClass, file } = ships[i]
    process.stdout.write(`[${i + 1}/${ships.length}] ${entityClass}...`)

    const dcbResult = runDcbQuery(starbreakerExe, dataP4k, entityClass)
    const outcome = parseDcbQueryResult(entityClass, dcbResult)
    if (outcome.kind !== 'resolved') {
      console.log(` SKIPPED (${outcome.reason})`)
      shipsWithNoLiveRecord.push(entityClass)
      continue
    }

    const extraction = extractDefaultLoadoutConfiguration(outcome.record)
    const physicalPorts = loadPhysicalPorts(file)

    const resolvedEntries: ResolvedConfigurationEntry[] = extraction.entries.map((entry) => {
      let resolvedDefaultEntityClass: string | null = entry.factoryEntityClassName
      if (!resolvedDefaultEntityClass && entry.factoryEntityClassReference) {
        const normalized = normalizeEntityClassReference(entry.factoryEntityClassReference)
        resolvedDefaultEntityClass = resolveEntityClassReference(normalized, caseIndex)
      }
      return { entry, resolvedDefaultEntityClass }
    })

    const topology = mergeConfigurableTopology({
      shipEntityClass: entityClass,
      physicalPorts,
      configurationEntries: resolvedEntries,
      resolveSwapGroupFor: resolveSwapGroupCached,
    })
    topologies.push(topology)

    const manufacturer = manufacturerResult.values.get(entityClass) ?? null
    const resolvedSlotCount = topology.configurableSlots.filter((s) => s.confidence !== 'unresolved').length
    console.log(` ${topology.configurableSlots.length} slot(s), ${resolvedSlotCount} resolved.`)

    const portsPerGroupOnThisHull = new Map<string, Set<string>>()
    for (const slot of topology.configurableSlots) {
      if (!slot.swapGroupId) continue
      if (!portsPerGroupOnThisHull.has(slot.swapGroupId)) portsPerGroupOnThisHull.set(slot.swapGroupId, new Set())
      portsPerGroupOnThisHull.get(slot.swapGroupId)!.add(slot.portName)
    }

    for (const slot of topology.configurableSlots) {
      const portSpan = slot.swapGroupId ? (portsPerGroupOnThisHull.get(slot.swapGroupId)?.size ?? 1) : 1
      const { category, rejectionReason } = classifySlot(slot, portSpan)
      rows.push({
        hull: entityClass,
        manufacturer,
        portName: slot.portName,
        swapGroupId: slot.swapGroupId,
        eligibleComponentCount: slot.eligibleComponents.length,
        confidence: slot.confidence,
        sourceAuthority: slot.sourceAuthority,
        category,
        rejectionReason,
      })
    }
  }

  // Objective 3 — Coverage Metrics
  const resolvedRows = rows.filter((r) => r.confidence !== 'unresolved')
  const shipsWithConfigurableTopology = new Set(resolvedRows.map((r) => r.hull)).size
  const uniqueSwapGroups = new Set(resolvedRows.map((r) => r.swapGroupId).filter((id): id is string => id !== null))
  const avgEligible = resolvedRows.length > 0 ? resolvedRows.reduce((sum, r) => sum + r.eligibleComponentCount, 0) / resolvedRows.length : 0
  const unresolvedReferenceCount = topologies.reduce((sum, t) => sum + t.configurableSlots.filter((s) => s.confidence === 'unresolved' && s.diagnostics.some((d) => d.code === 'swap-group-unresolved-reference')).length, 0)
  const duplicateGroupDiagnostics = topologies.reduce((sum, t) => sum + t.diagnostics.filter((d) => d.code === 'configuration-duplicate-port-name').length, 0)
  const confidenceDistribution: Record<string, number> = {}
  for (const r of rows) confidenceDistribution[r.confidence] = (confidenceDistribution[r.confidence] ?? 0) + 1

  const categoryDistribution: Record<string, number> = {}
  for (const r of resolvedRows) {
    const key = r.category ?? '(unclassified)'
    categoryDistribution[key] = (categoryDistribution[key] ?? 0) + 1
  }

  const coverageMetrics = {
    totalShipsAnalyzed: ships.length,
    shipsWithNoLiveRecord: shipsWithNoLiveRecord.length,
    shipsWithConfigurableTopology,
    totalConfigurableSlots: rows.length,
    resolvedConfigurableSlots: resolvedRows.length,
    uniqueSwapGroups: uniqueSwapGroups.size,
    averageEligibleComponentsPerResolvedGroup: Number(avgEligible.toFixed(2)),
    unresolvedReferences: unresolvedReferenceCount,
    duplicateGroupIdentifiersDetected: duplicateGroupDiagnostics,
    confidenceDistribution,
    categoryDistribution,
  }

  console.log('\n=== Coverage Metrics ===')
  console.log(JSON.stringify(coverageMetrics, null, 2))

  const outputDir = join(REPO_ROOT, 'generated-data')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'configurable-slot-certification.json'), JSON.stringify({ coverageMetrics, shipsWithNoLiveRecord, rows }, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${join(outputDir, 'configurable-slot-certification.json')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
