/**
 * SW-010B/SW-011A — Fleet-Wide Configurable Slot Sweep.
 *
 * Extracted from `scripts/generateConfigurableSlotCertification.ts` so the
 * certification report and the Commander-facing runtime catalog
 * (`scripts/generateConfigurableSlotRuntimeCatalog.ts`, SW-011A) share
 * ONE live fleet sweep instead of each re-running the ~25-minute,
 * 257-ship StarBreaker query sequence independently. Not itself
 * runtime-app code — this is generation-time-only I/O orchestration,
 * same isolation boundary as every other `scripts/` module.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { runDcbQuery, parseDcbQueryResult } from '../componentCatalog/dcbQuery'
import { runBulkFieldQuery } from '../universeCatalog/dcbBulkQuery'
import { extractDefaultLoadoutConfiguration, normalizeEntityClassReference } from './defaultLoadoutExtractor'
import { buildGlobalTagIndex, resolveSwapGroup } from './swapGroupResolver'
import { buildEntityClassCaseIndex, resolveEntityClassReference } from './referenceResolution'
import { mergeConfigurableTopology, type ResolvedConfigurationEntry } from './canonicalMerge'
import { classifySlot, computePortSpansPerGroup, type SlotCategory } from './classification'
import { stripTrailingCommas } from '../../src/engine/importer/trailingCommaJson'
import type { CanonicalConfigurableTopology, ConfigurableSlot, PhysicalPortFact, SwapGroup } from './types'

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
function enumerateRawDataShips(repoRoot: string): RawDataShipEntry[] {
  const dir = join(repoRoot, 'raw-data')
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

function loadPhysicalPorts(repoRoot: string, file: string): PhysicalPortFact[] {
  const doc = readJsonWithTrailingCommaFallback(join(repoRoot, 'raw-data', file)) as { loadout?: unknown }
  const names = new Set<string>()
  collectPhysicalPortNames(doc.loadout, names)
  return [...names].map((itemPortName) => ({ itemPortName, hasFactoryItem: true }))
}

export interface DiscoveryRow {
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

export interface FleetSweepShipResult {
  entityClass: string
  topology: CanonicalConfigurableTopology
  manufacturer: string | null
  rows: DiscoveryRow[]
}

export interface FleetSweepResult {
  totalShips: number
  shipsWithNoLiveRecord: string[]
  ships: FleetSweepShipResult[]
}

/**
 * Runs the full Stage 7 -> 8 -> 9 -> classification pipeline live against
 * every `raw-data/*.json` ship. One `dcb query --filter <exact>` per ship
 * (confirmed ~5-6s each, ~25 minutes total for 257 ships — see this
 * module's own history in `docs/SW-010B-Certification-Report.md` §2 for
 * why a whole-universe bulk query was tried first and abandoned), plus
 * two whole-universe bulk field queries (AttachDef.Tags, manufacturer
 * Code) run once and shared across every ship.
 */
export function runFleetSweep(starbreakerExe: string, dataP4k: string, repoRoot: string, onProgress?: (message: string) => void): FleetSweepResult {
  const log = onProgress ?? (() => {})

  const ships = enumerateRawDataShips(repoRoot)
  log(`Fleet-wide sweep: ${ships.length} raw-data ships enumerated.`)

  log('Running full-catalog AttachDef.Tags bulk query...')
  const tagsResult = runBulkFieldQuery(starbreakerExe, dataP4k, 'EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Tags')
  log(`  ${tagsResult.values.size} entities carry a Tags value.`)

  log('Running full-catalog manufacturer Code bulk query...')
  const manufacturerResult = runBulkFieldQuery(starbreakerExe, dataP4k, 'EntityClassDefinition.Components[VehicleComponentParams].manufacturer.Code')
  log(`  ${manufacturerResult.values.size} entities carry a manufacturer Code.`)

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

  const shipResults: FleetSweepShipResult[] = []
  const shipsWithNoLiveRecord: string[] = []

  for (let i = 0; i < ships.length; i++) {
    const { entityClass, file } = ships[i]
    let progressLine = `[${i + 1}/${ships.length}] ${entityClass}...`

    const dcbResult = runDcbQuery(starbreakerExe, dataP4k, entityClass)
    const outcome = parseDcbQueryResult(entityClass, dcbResult)
    if (outcome.kind !== 'resolved') {
      log(`${progressLine} SKIPPED (${outcome.reason})`)
      shipsWithNoLiveRecord.push(entityClass)
      continue
    }

    const extraction = extractDefaultLoadoutConfiguration(outcome.record)
    const physicalPorts = loadPhysicalPorts(repoRoot, file)

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

    const manufacturer = manufacturerResult.values.get(entityClass) ?? null
    const resolvedSlotCount = topology.configurableSlots.filter((s) => s.confidence !== 'unresolved').length
    progressLine += ` ${topology.configurableSlots.length} slot(s), ${resolvedSlotCount} resolved.`
    log(progressLine)

    const portSpansPerGroup = computePortSpansPerGroup(topology.configurableSlots)
    const rows: DiscoveryRow[] = topology.configurableSlots.map((slot) => {
      const portSpan = slot.swapGroupId ? (portSpansPerGroup.get(slot.swapGroupId) ?? 1) : 1
      const { category, rejectionReason } = classifySlot(slot, portSpan)
      return {
        hull: entityClass,
        manufacturer,
        portName: slot.portName,
        swapGroupId: slot.swapGroupId,
        eligibleComponentCount: slot.eligibleComponents.length,
        confidence: slot.confidence,
        sourceAuthority: slot.sourceAuthority,
        category,
        rejectionReason,
      }
    })

    shipResults.push({ entityClass, topology, manufacturer, rows })
  }

  return { totalShips: ships.length, shipsWithNoLiveRecord, ships: shipResults }
}
