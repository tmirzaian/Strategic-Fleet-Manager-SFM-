#!/usr/bin/env tsx
/**
 * Turret Weapon-Slot Generator (SW-013C.2C — Child-Port Semantic Modes).
 *
 * Extends the component-owned child-slot architecture (FTB-001A mining
 * heads, FTB-001B missile racks) with a THIRD family: a turret/ball-turret
 * assembly's own independently-targetable weapon-mount children — Mode B
 * ("Independent Equipment Ports") in the Chief Architect's amendment,
 * deliberately distinct from Mode A ("Payload Array", the pre-existing
 * missile-rack/mining-head precedent). Every existing family's behavior
 * (count/size derivation, structural synthesis, persistence, rendering)
 * is reused unchanged — this generator only supplies the same shape of
 * fact (`{ entityClass: { slotCount, weaponSize } }`) for a new family.
 *
 * Root-cause/derivation: unlike the missile-rack generator (which queries
 * a rack's own DataCore record live, per-entity), this generator derives
 * from the already-downloaded, checked-in `raw-data/*.json` fixtures —
 * equally authoritative (the same underlying DataCore-sourced geometry
 * StarBreaker's `--dump-hierarchy` already exported), because a turret
 * assembly's real weapon-mount children are only reachable this way when
 * some real, currently-imported ship happens to factory-ship it (e.g. the
 * Hornet F7CM Mk2's own native Ball Turret) — the exact same "ship-baked
 * real geometry" data every other stage of this pipeline already trusts.
 *
 * Scope (Objective 1/2 of the amendment — narrow, evidence-gated, never
 * inferred from quantity or name): only entity classes individually
 * confirmed, by direct inspection of their real raw-data children, to be
 * a Turret-category assembly whose own DIRECT children are real,
 * independently-armed weapon-mount positions (never a nested payload
 * array — see `EXCLUDED_CHILD_CATEGORIES` below, which explicitly skips
 * any MissileRack-family child so a turret's own nested rack is never
 * folded into this Mode-B spec; it remains a real, separate Mode-A child
 * of the ship's real geometry wherever the turret is factory-installed,
 * and is a documented, deliberate non-goal for the swap-synthesis case —
 * see the SW-013C.2C report).
 *
 * Output: `generated-data/turret-weapon-slots.json` — same "small
 * resolved fact" licensing posture as the missile-rack/mining-module
 * artifacts.
 *
 * Usage:
 *   npx tsx scripts/generateTurretWeaponSlots.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripTrailingCommas } from '../src/engine/importer/trailingCommaJson'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')
const RAW_DATA_DIR = join(REPO_ROOT, 'raw-data')
const CATALOG_PATH = join(REPO_ROOT, 'generated-data', 'component-metadata-catalog.json')
const OUTPUT_PATH = join(REPO_ROOT, 'generated-data', 'turret-weapon-slots.json')

interface CatalogRecord {
  category: string | null
  subtype: string | null
  size: number | null
}
interface Catalog {
  records: Record<string, CatalogRecord>
}

/** SW-013C.2C — individually confirmed (direct raw-data inspection this
 * session) Turret-category assemblies whose own direct children are real,
 * independent weapon-mount positions — never a blanket "every Turret
 * entity" sweep. Each entry here was traced to a real, currently-imported
 * ship's own factory loadout. */
const CONFIRMED_TURRET_ENTITY_CLASSES = new Set(['ANVL_Hornet_F7CM_Mk2_Ball_Turret', 'ANVL_Hornet_F7CM_Mk2_Ball_Turret_Bespoke'])

/** A child whose own category is one of these is a Mode-A payload array
 * (or otherwise not a Mode-B weapon position) — never folded into this
 * turret's own Mode-B weapon-slot count, regardless of how it's mounted. */
const EXCLUDED_CHILD_CATEGORIES = new Set(['MissileLauncher', 'Missile', 'Bomb', 'BombLauncher'])

interface RawNode {
  port?: string
  entity?: string
  children?: RawNode[]
}

function readJsonWithTrailingCommaFallback(path: string): { loadout?: RawNode[] } {
  const text = readFileSync(path, 'utf-8')
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(stripTrailingCommas(text))
  }
}

function findNodesByEntity(nodes: RawNode[] | undefined, entityClass: string, out: RawNode[]): void {
  for (const node of nodes ?? []) {
    if (node.entity === entityClass) out.push(node)
    findNodesByEntity(node.children, entityClass, out)
  }
}

function main() {
  if (!existsSync(CATALOG_PATH)) throw new Error(`Component metadata catalog not found at "${CATALOG_PATH}" — run generate:component-catalog first.`)
  const catalog: Catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))

  const files = readdirSync(RAW_DATA_DIR).filter((f) => f.endsWith('.json'))
  const result: Record<string, { slotCount: number; weaponSize: number }> = {}

  for (const entityClass of CONFIRMED_TURRET_ENTITY_CLASSES) {
    let found: RawNode | null = null
    let foundFile = ''
    for (const file of files) {
      const doc = readJsonWithTrailingCommaFallback(join(RAW_DATA_DIR, file))
      const matches: RawNode[] = []
      findNodesByEntity(doc.loadout, entityClass, matches)
      if (matches.length > 0) {
        found = matches[0]
        foundFile = file
        break
      }
    }
    if (!found) {
      console.warn(`"${entityClass}": not found as an installed entity in any raw-data fixture — skipped (no real geometry to derive from).`)
      continue
    }

    const weaponChildren = (found.children ?? []).filter((child) => {
      if (!child.entity) return false
      const record = catalog.records[child.entity]
      if (!record?.category) return false
      if (EXCLUDED_CHILD_CATEGORIES.has(record.category)) return false
      // A weapon-relevant mount: WeaponGun (direct gun) or Turret-category
      // sub-mount (a gimbal shell, e.g. Mount_Gimbal_S3 — confirmed real
      // via ADR-011/M-009's own Turret+WeaponGun-child precedent).
      return record.category === 'WeaponGun' || record.category === 'Turret' || record.category === 'WeaponMount'
    })

    if (weaponChildren.length === 0) {
      console.warn(`"${entityClass}" (found in ${foundFile}): no direct weapon-mount children found — skipped.`)
      continue
    }

    const sizes = weaponChildren.map((c) => catalog.records[c.entity!]?.size).filter((s): s is number => typeof s === 'number')
    const uniformSize = sizes.length > 0 && sizes.every((s) => s === sizes[0]) ? sizes[0] : null
    if (uniformSize === null) {
      console.warn(`"${entityClass}" (found in ${foundFile}): weapon-mount children do not share one uniform size (${JSON.stringify(sizes)}) — skipped rather than guessed.`)
      continue
    }

    result[entityClass] = { slotCount: weaponChildren.length, weaponSize: uniformSize }
    console.log(`"${entityClass}" (${foundFile}): ${weaponChildren.length} weapon slot(s), size S${uniformSize}.`)
  }

  const document = { schemaVersion: 1, turretWeaponSlotSpecByEntityClass: result }
  writeFileSync(OUTPUT_PATH, JSON.stringify(document, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${OUTPUT_PATH} (${Object.keys(result).length} confirmed turret entity classes).`)
}

main()
