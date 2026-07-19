#!/usr/bin/env tsx
/**
 * Mining Module Slot Generator (FTB-001A, Workstream C).
 *
 * Root-cause investigation (FTB-001A) found Ship Detail's port tree stops
 * at a mining head's own row (e.g. "Arbor MH2 Mining Laser") with no child
 * "Module Slot" rows beneath it, even though a real MOLE genuinely has two
 * physical Mining Module attachment points on that exact laser. Tracing
 * the pipeline:
 *
 *   1. The ship's own raw export (raw-data/ARGO_MOLE.json) has NO nested
 *      ItemPort hierarchy under the mining laser's attachment point
 *      ("hardpoint_weapon_mining") — the laser is a single leaf entity
 *      binding at the ship level. Module slots are not a SHIP-level
 *      concept at all.
 *   2. They ARE real, however — as component-owned ports on the mining
 *      laser's OWN DataCore entity record. A direct, narrow `dcb query`
 *      against e.g. `Mining_Laser_GRIN_Arbor_S2` shows a
 *      `Components[].Ports[]` array whose entries carry
 *      `PortTags`/`RequiredPortTags` containing "miningConsumable" — the
 *      real, in-game Mining Module attachment points. A "VEN" port on the
 *      same record (no miningConsumable tag) is a cosmetic/vent bone, not
 *      a Commander-relevant slot, and is correctly excluded.
 *   3. `scripts/componentCatalog/dcbQuery.ts`'s `extractItemDefinitionFields`
 *      only ever reads `Type`/`SubType`/`Size`/`Grade`/`Manufacturer`/
 *      `Localization.Name` from the first AttachDef-bearing component —
 *      the `Ports[]` array on a LATER component index is discarded
 *      entirely. `generated-data/component-metadata-catalog.json` (and
 *      therefore the runtime catalog) never retained this.
 *   4. The materializer (`src/utils/fleetAssetMaterializer.ts`,
 *      `src/data/shipDefinitions.ts`) is limited to the ship's own
 *      port tree — no existing code path reads a component's own Ports.
 *
 * Verified directly against 17 real mining-laser entity classes: real,
 * genuinely varying counts were found (0 for `Mining_Laser_SHIN_Klein_S1`,
 * 1 for most S1 heads, 2 for most S2 heads, 3 for the Helix/Impact S2
 * heads) — confirming this is NOT a fixed per-size constant and must be
 * derived per entity, never hardcoded (per FTB-001A's explicit rule).
 * Every Mining Arm/Turret housing assembly checked (ROC, Prospector,
 * Golem, SRV, Prowler, Zeus) shows zero — module slots belong to the
 * mining LASER child, never the structural arm/turret shell.
 *
 * Output: `generated-data/mining-module-slots.json` — a small, committed
 * (not gitignored) `{ entityClass: moduleSlotCount }` map, the same
 * "small resolved fact" licensing posture as RC-008's `*.runtime.json`
 * files (no raw DataCore PortTags/record ids/paths are retained, only the
 * derived count).
 *
 * Usage:
 *   npm run generate:mining-module-slots
 *
 * Depends on `generated-data/component-metadata-catalog.json` already
 * existing (run `npm run generate:component-catalog` first) — that file
 * is this script's ONLY source for discovering which entity classes are
 * real mining heads (`category === 'WeaponMining'`), never a hand-authored
 * list. Requires the same local StarBreaker + Data.p4k install as every
 * other generator in this family; override via the same env vars.
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
const MINING_CONSUMABLE_TAG = /miningConsumable/i

interface RawPort {
  PortTags?: string
  RequiredPortTags?: string
}

/** Counts this entity's own real Mining Module attachment points — every
 * `Ports[]` entry (on any `Components[]` index; unlike
 * `extractItemDefinitionFields`, every component is checked, not just the
 * first AttachDef) whose tags mention "miningConsumable". Never counts a
 * non-tagged port (e.g. "VEN") as a module slot. */
function countMiningConsumablePorts(recordValue: unknown): number {
  const components = recordValue && typeof recordValue === 'object' ? (recordValue as { Components?: unknown }).Components : undefined
  if (!Array.isArray(components)) return 0

  let count = 0
  for (const component of components) {
    const ports = component && typeof component === 'object' ? (component as { Ports?: unknown }).Ports : undefined
    if (!Array.isArray(ports)) continue
    for (const port of ports as RawPort[]) {
      const tags = `${port.PortTags ?? ''} ${port.RequiredPortTags ?? ''}`
      if (MINING_CONSUMABLE_TAG.test(tags)) count++
    }
  }
  return count
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
    throw new Error(`${catalogPath} does not exist — run "npm run generate:component-catalog" first (this generator discovers mining heads from its output, never a hand-authored list).`)
  }
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8')) as { records: Record<string, { entityClass: string; category: string }> }
  const miningEntityClasses = Object.values(catalog.records)
    .filter((r) => r.category === 'WeaponMining')
    .map((r) => r.entityClass)
    .sort()

  console.log(`Discovered ${miningEntityClasses.length} WeaponMining entity classes from the component catalog.`)

  const result: Record<string, number> = {}
  for (const entityClass of miningEntityClasses) {
    const raw = runDcbQuery(starbreakerExe, dataP4k, entityClass)
    const outcome = parseDcbQueryResult(entityClass, raw)
    if (outcome.kind === 'not-found') {
      console.warn(`  ${entityClass}: ${outcome.reason} — skipped.`)
      continue
    }
    const count = countMiningConsumablePorts(outcome.record._RecordValue_)
    result[entityClass] = count
    console.log(`  ${entityClass}: ${count} module slot(s)`)
  }

  const outputPath = join(REPO_ROOT, 'generated-data', 'mining-module-slots.json')
  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'starbreaker-datacore (Components[].Ports[] tagged miningConsumable)',
    moduleSlotCountByEntityClass: result,
  }
  writeFileSync(outputPath, JSON.stringify(document, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${outputPath} (${Object.keys(result).length} entities).`)
}

main()
