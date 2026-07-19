#!/usr/bin/env tsx
/**
 * Missile Rack Slot Generator (FTB-001B, extending FTB-001A's
 * component-owned child-slot architecture — see
 * scripts/generateMiningModuleSlots.ts for the sibling generator and the
 * original investigation this one mirrors).
 *
 * Root-cause investigation (FTB-001B) found that a missile rack's own
 * child attach points (count + accepted missile size) are NOT a ship-level
 * concept the way Ship Detail's existing "Missile Slot N" rows might
 * suggest: they are properties of the RACK COMPONENT's own DataCore
 * record, exactly like a mining head's module ports (FTB-001A). Tracing
 * the pipeline:
 *
 *   1. A ship's raw export (e.g. raw-data/RSI_Polaris.json via
 *      generated-data/ports.json) DOES already show nested "Attach
 *      Missile N" child ports under a factory rack's own mount point —
 *      but only because the ship was normalized once against whichever
 *      rack happened to be factory-installed at generation time. That
 *      static structure never updates if a Commander later targets a
 *      different real rack.
 *   2. A direct, narrow `dcb query` against a rack's own entityClass
 *      (e.g. `MRCK_S10_RSI_Polaris_Right`) shows a `Components[].Ports[]`
 *      array whose length and per-port `MinSize`/`MaxSize` exactly match
 *      the ship-baked data (8 ports, MinSize=MaxSize=3) — confirming this
 *      is the same authoritative source, readable independent of any one
 *      ship. Every port on a rack's own record was found to share one
 *      uniform MinSize/MaxSize (no PortTags-based filtering was needed
 *      here, unlike mining heads' cosmetic "VEN" port).
 *   3. Verified across many real rack families with genuinely different
 *      counts/sizes (Polaris 8xS3, Talon/Starlancer "MSD-543"/"MSD-683"
 *      4xS3 vs Asgard's own "MSD-683" 16xS3, BEHR single racks 1xS1/S2/S3,
 *      Fury's dual rack 2xS1) — confirming this must be derived per
 *      entityClass, never a per-size or per-display-name constant. The
 *      ambiguous display names this mission calls out ("MSD-543",
 *      "MSD-683") are exactly the cases where two different real
 *      entityClasses share one displayName but carry genuinely different
 *      real slot counts (325a/Starlancer's MSD-543 = 4 slots vs the
 *      "majority" BEHR_Quad_S03 variant = 4 slots at a different overall
 *      rack size; Talon's MSD-683 = 4 slots vs Asgard's MSD-683 = 16
 *      slots) — never safely resolvable from the name alone, exactly
 *      the reason canonical entityClass identity is used throughout.
 *
 * Output: `generated-data/missile-rack-slots.json` — a small, committed
 * `{ entityClass: { slotCount, missileSize } }` map, same "small resolved
 * fact" licensing posture as RC-008's runtime files and FTB-001A's mining
 * artifact — no raw DataCore ports/paths/record ids retained.
 *
 * Usage:
 *   npm run generate:missile-rack-slots
 *
 * Depends on generated-data/component-metadata-catalog.json already
 * existing (run `npm run generate:component-catalog` first) — that file
 * is this script's ONLY source for discovering which entity classes are
 * real missile racks (`category === 'MissileLauncher' && subtype ===
 * 'MissileRack'` — deliberately excludes the sibling `BombLauncher`/
 * `BombRack` and `GroundVehicleMissileLauncher`/`GroundVehicleMissileRack`
 * categories, which are a different real component family), never a
 * hand-authored list. Requires the same local StarBreaker + Data.p4k
 * install as every other generator in this family; override via the same
 * env vars.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDcbQuery, parseDcbQueryResult } from './componentCatalog/dcbQuery'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const DEFAULT_STARBREAKER_EXE = 'D:\\StarBreaker-main\\StarBreaker-main\\target\\release\\starbreaker.exe'
const DEFAULT_DATA_P4K = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k'

interface RawPort {
  MinSize?: number
  MaxSize?: number
}

/** Every `Ports[]` entry (across any `Components[]` index) on a missile
 * rack's own record is a real missile attach point — confirmed against
 * every rack family sampled during investigation, no tag-based filtering
 * needed (unlike mining heads' cosmetic "VEN" port). Asserts every port
 * shares one uniform MinSize/MaxSize; throws (never silently averages or
 * guesses) if a future rack ever violates that — this generator must stop
 * and report, not invent a value, per FTB-001B's explicit instruction. */
function extractRackSlotSpec(entityClass: string, recordValue: unknown): { slotCount: number; missileSize: number } | null {
  const components = recordValue && typeof recordValue === 'object' ? (recordValue as { Components?: unknown }).Components : undefined
  if (!Array.isArray(components)) return null

  const ports: RawPort[] = []
  for (const component of components) {
    const compPorts = component && typeof component === 'object' ? (component as { Ports?: unknown }).Ports : undefined
    if (Array.isArray(compPorts)) ports.push(...(compPorts as RawPort[]))
  }
  if (ports.length === 0) return null

  const sizes = new Set(ports.map((p) => `${p.MinSize ?? 'null'}:${p.MaxSize ?? 'null'}`))
  if (sizes.size > 1) {
    throw new Error(`${entityClass}: rack ports carry non-uniform MinSize/MaxSize (${[...sizes].join(', ')}) — stopping rather than guessing one. Investigate before adding a fallback.`)
  }
  const [minSize, maxSize] = [...sizes][0].split(':').map((s) => (s === 'null' ? null : Number(s)))
  if (minSize === null || maxSize === null || minSize !== maxSize) {
    throw new Error(`${entityClass}: rack ports have no usable uniform size (Min=${minSize}, Max=${maxSize}) — stopping rather than guessing one.`)
  }

  return { slotCount: ports.length, missileSize: minSize }
}

function main(): void {
  const starbreakerExe = process.env.STARBREAKER_EXE ?? DEFAULT_STARBREAKER_EXE
  const dataP4k = process.env.SC_DATA_P4K ?? DEFAULT_DATA_P4K

  if (!existsSync(starbreakerExe)) {
    throw new Error(`StarBreaker executable not found at "${starbreakerExe}". Set STARBREAKER_EXE to override.`)
  }
  if (!existsSync(dataP4k)) {
    throw new Error(`Star Citizen Data.p4k not found at "${dataP4k}". Set SC_DATA_P4K to override.`)
  }

  const catalogPath = join(REPO_ROOT, 'generated-data', 'component-metadata-catalog.json')
  if (!existsSync(catalogPath)) {
    throw new Error(`${catalogPath} does not exist — run "npm run generate:component-catalog" first (this generator discovers missile racks from its output, never a hand-authored list).`)
  }
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8')) as { records: Record<string, { entityClass: string; category: string; subtype: string | null }> }
  const rackEntityClasses = Object.values(catalog.records)
    .filter((r) => r.category === 'MissileLauncher' && r.subtype === 'MissileRack')
    .map((r) => r.entityClass)
    .sort()

  console.log(`Discovered ${rackEntityClasses.length} MissileLauncher/MissileRack entity classes from the component catalog.`)

  const result: Record<string, { slotCount: number; missileSize: number }> = {}
  const skipped: { entityClass: string; reason: string }[] = []
  for (const entityClass of rackEntityClasses) {
    const raw = runDcbQuery(starbreakerExe, dataP4k, entityClass)
    const outcome = parseDcbQueryResult(entityClass, raw)
    if (outcome.kind === 'not-found') {
      console.warn(`  ${entityClass}: ${outcome.reason} — skipped.`)
      skipped.push({ entityClass, reason: outcome.reason })
      continue
    }
    // A per-entity anomaly (e.g. a record whose Ports[] genuinely mix two
    // different sizes — confirmed for one real rack during investigation,
    // `MRCK_S10_RSI_Polaris_Torpedo_lb`) is recorded and skipped, never
    // allowed to fabricate a value NOR to abort the whole run and discard
    // every other entity already resolved cleanly.
    try {
      const spec = extractRackSlotSpec(entityClass, outcome.record._RecordValue_)
      if (!spec) {
        console.warn(`  ${entityClass}: no Components[].Ports[] found on this record — skipped (no fallback fabricated).`)
        skipped.push({ entityClass, reason: 'no Components[].Ports[] found' })
        continue
      }
      result[entityClass] = spec
      console.log(`  ${entityClass}: ${spec.slotCount} slot(s) @ S${spec.missileSize}`)
    } catch (err) {
      console.warn(`  ${entityClass}: ${(err as Error).message} — skipped.`)
      skipped.push({ entityClass, reason: (err as Error).message })
    }
  }

  const outputPath = join(REPO_ROOT, 'generated-data', 'missile-rack-slots.json')
  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'starbreaker-datacore (Components[].Ports[] MinSize/MaxSize on the rack\'s own record)',
    rackSlotSpecByEntityClass: result,
    // Documented, not fabricated: entities this generator could not
    // safely resolve, and why. A future investigation can extend
    // extractRackSlotSpec if one of these turns out to need real support
    // (e.g. a per-slot rather than per-rack size model).
    skipped,
  }
  writeFileSync(outputPath, JSON.stringify(document, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${outputPath} (${Object.keys(result).length} entities, ${skipped.length} skipped).`)
  if (skipped.length > 0) {
    console.log('Skipped entities:', skipped.map((s) => `${s.entityClass} (${s.reason})`).join('; '))
  }
}

main()
