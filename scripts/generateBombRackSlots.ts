#!/usr/bin/env tsx
/**
 * Bomb Rack Slot Generator (SW-013C.2D, Objectives 3/4) — sibling to
 * scripts/generateMissileRackSlots.ts, same architecture, deliberately a
 * SEPARATE generator rather than widening that one's own filter.
 *
 * generateMissileRackSlots.ts's own doc comment explicitly scopes itself
 * to `category === 'MissileLauncher' && subtype === 'MissileRack'`,
 * "deliberately excludes the sibling BombLauncher/BombRack... category,
 * which is a different real component family" — a decision this mission
 * does not revisit. SW-013C.2D Objective 3 (Eclipse Mission Rack
 * Compatibility) traced why the Aegis Retaliator's own torpedo rack was
 * selectable as a New Target on the Eclipse: both `MRCK_S09_AEGS_Eclipse`
 * (Eclipse's factory rack) and `MRCK_S09_AEGS_Retaliator_Fore`/`_Rear`
 * share the exact same DataCore category (MissileLauncher/MissileRack)
 * AND the exact same catalog `size` field (9 — the accepted TORPEDO size
 * class, not a rack-family identifier), so the generic size/category
 * compatibility sweep (src/data/componentCatalog.ts's checkCompatibility)
 * could never tell them apart. The one real, authoritative distinction is
 * the Eclipse's own confirmed swap group (`Eclipse_BombRack`,
 * generated-data/configurable-slots.runtime.json) — a real, tag-derived
 * "this exact set of components genuinely swaps on this exact port" fact
 * that already correctly lists the Eclipse's own three real BombLauncher-
 * category alternates (`BMBRCK_S10_AEGS_Eclipse`/`_S05_AEGS_Eclipse`/
 * `_S03_AEGS_Eclipse`) and never the Retaliator's rack. Objective 4 asked
 * whether these three alternates are real, LIVE-confirmed equipment (not
 * fabricated) — confirmed via a direct `dcb query` against each entity's
 * own record:
 *   - BMBRCK_S10_AEGS_Eclipse: 1 port @ S10  ("Aegis Eclipse 1xS10 Bomb Rack")
 *   - BMBRCK_S05_AEGS_Eclipse: 4 ports @ S5  ("Aegis Eclipse 4xS5 Bomb Rack")
 *   - BMBRCK_S03_AEGS_Eclipse: 20 ports @ S3 ("Aegis Eclipse 20xS3 Bomb Rack")
 * — all three match their own displayName's embedded slot count exactly,
 * confirmed independently via the real DataCore record rather than
 * trusted from the name alone.
 *
 * For a Commander to actually select one of these three (Objective 4:
 * "Expose through the canonical compatibility pipeline") and see its real
 * child payload topology materialize (SW-013C.2C's payload-array mode),
 * `componentOwnedChildSlotSpec` needs the same kind of small, committed
 * `{ entityClass: { slotCount, size } }` fact table generateMissileRackSlots.ts
 * already provides for MissileRack — this generator produces the BombRack
 * equivalent, scoped to the whole real BombLauncher/BombRack family found
 * in the component catalog (14 entities as of this mission — Retaliator,
 * Gladiator, Spirit, Starlancer, Castillo, and Eclipse all carry real
 * BombRack-category equipment), never Eclipse-only in scope even though
 * Eclipse is what exposed the gap.
 *
 * Output: `generated-data/bomb-rack-slots.json` — same schema shape as
 * missile-rack-slots.json.
 *
 * Usage:
 *   npm run generate:bomb-rack-slots
 *
 * Depends on generated-data/component-metadata-catalog.json already
 * existing (run `npm run generate:component-catalog` first). Requires the
 * same local StarBreaker + Data.p4k install as every other generator in
 * this family; override via the same env vars.
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

/** Identical extraction rule to generateMissileRackSlots.ts's own
 * extractRackSlotSpec — every `Ports[]` entry on a bomb rack's own record
 * is a real bomb attach point; throws (never guesses) on a non-uniform
 * MinSize/MaxSize spread rather than fabricating one value. */
function extractRackSlotSpec(entityClass: string, recordValue: unknown): { slotCount: number; bombSize: number } | null {
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

  return { slotCount: ports.length, bombSize: minSize }
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
    throw new Error(`${catalogPath} does not exist — run "npm run generate:component-catalog" first (this generator discovers bomb racks from its output, never a hand-authored list).`)
  }
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8')) as { records: Record<string, { entityClass: string; category: string; subtype: string | null }> }
  const rackEntityClasses = Object.values(catalog.records)
    .filter((r) => r.category === 'BombLauncher' && r.subtype === 'BombRack')
    .map((r) => r.entityClass)
    .sort()

  console.log(`Discovered ${rackEntityClasses.length} BombLauncher/BombRack entity classes from the component catalog.`)

  const result: Record<string, { slotCount: number; bombSize: number }> = {}
  const skipped: { entityClass: string; reason: string }[] = []
  for (const entityClass of rackEntityClasses) {
    const raw = runDcbQuery(starbreakerExe, dataP4k, entityClass)
    const outcome = parseDcbQueryResult(entityClass, raw)
    if (outcome.kind === 'not-found') {
      console.warn(`  ${entityClass}: ${outcome.reason} — skipped.`)
      skipped.push({ entityClass, reason: outcome.reason })
      continue
    }
    try {
      const spec = extractRackSlotSpec(entityClass, outcome.record._RecordValue_)
      if (!spec) {
        console.warn(`  ${entityClass}: no Components[].Ports[] found on this record — skipped (no fallback fabricated).`)
        skipped.push({ entityClass, reason: 'no Components[].Ports[] found' })
        continue
      }
      result[entityClass] = spec
      console.log(`  ${entityClass}: ${spec.slotCount} slot(s) @ S${spec.bombSize}`)
    } catch (err) {
      console.warn(`  ${entityClass}: ${(err as Error).message} — skipped.`)
      skipped.push({ entityClass, reason: (err as Error).message })
    }
  }

  const outputPath = join(REPO_ROOT, 'generated-data', 'bomb-rack-slots.json')
  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'starbreaker-datacore (Components[].Ports[] MinSize/MaxSize on the rack\'s own record)',
    rackSlotSpecByEntityClass: result,
    skipped,
  }
  writeFileSync(outputPath, JSON.stringify(document, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${outputPath} (${Object.keys(result).length} entities, ${skipped.length} skipped).`)
  if (skipped.length > 0) {
    console.log('Skipped entities:', skipped.map((s) => `${s.entityClass} (${s.reason})`).join('; '))
  }
}

main()
