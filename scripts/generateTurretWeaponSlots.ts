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
import { runDcbQuery, parseDcbQueryResult } from './componentCatalog/dcbQuery'

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
 * ship's own factory loadout.
 *
 * SW-013C.2G — `ANVL_Hornet_F7A_Nose_Turret` added: the Hornet Mk II
 * canard nose turret, confirmed installed (factory-real, not inferred) on
 * the F7A Mk2/F7CM Mk2/F7CM Mk2 Heartseeker/F7 Mk2 Collector Mod raw-data
 * fixtures, each with two real `WeaponGun`-category children
 * (`hardpoint_weapon_S1_left`/`_right`, both S3 — confirmed directly via
 * `generated-data/ports.json`: AMRS_LaserCannon_S3/KLWE_LaserRepeater_S3).
 * This is the spec the F7C-S Hornet Ghost Mk II's own dormant nose
 * hardpoint (SW-013C.2G, docs/SW-013C.2G-Dormant-Hardpoint-Materialization-Report.md)
 * needs once a Commander targets a real turret there.
 *
 * `ANVL_Hornet_F7C_Mk2_Nose_Turret` — the swap group's OTHER confirmed
 * member (see `generated-data/configurable-slots.runtime.json`'s
 * `ANVL_Hornet_Mk2` group) — is deliberately NOT added here. Direct
 * `entity export --dump-hierarchy` on it confirmed identical geometry
 * (same .cga file, same `hardpoint_weapon_S1_left`/`_right` node names)
 * to the F7A variant, but its own `loadout` is empty (no ship in this
 * fixture set factory-installs it), so its own weapon-mount SIZE has no
 * direct, independent confirmation — only strong circumstantial identity
 * to the F7A variant, which this generator's own discipline (derive only
 * from real, installed, sized evidence — never geometry-name inference)
 * declines to assume. Selecting this specific swap-group member currently
 * produces zero synthesized children — an honest gap, not a defect; see
 * the SW-013C.2G report's own "Remaining Risks" section. */
const CONFIRMED_TURRET_ENTITY_CLASSES = new Set([
  'ANVL_Hornet_F7CM_Mk2_Ball_Turret',
  'ANVL_Hornet_F7CM_Mk2_Ball_Turret_Bespoke',
  'ANVL_Hornet_F7A_Nose_Turret',
])

/**
 * SW-013C.2G Amendment C — a turret assembly that is never factory-installed
 * on any real ship in the `raw-data/*.json` corpus (so the derivation above
 * has no installed-child evidence to read) can still carry authoritative,
 * independently-confirmable weapon-slot geometry: its OWN intrinsic
 * `SItemPortDef` children, declared directly on the turret's own DataCore
 * component definition (`EntityClassDefinition.<class>.Components[].Ports[]`),
 * independent of installation anywhere. This is a live `dcb query` per
 * entity (STARBREAKER_EXE/SC_DATA_P4K, same convention as
 * `scripts/generateConfigurableSlotReport.ts`) — a genuinely different
 * authority from the raw-data geometry-hierarchy fixtures above, so it is
 * kept as an explicit, separate, opt-in second pass rather than folded into
 * the loop above: a size range (MinSize !== MaxSize) is real, common on
 * these ports, and deliberately skipped here (never guessed down to one
 * value) rather than treated as a confirmed uniform size.
 *
 * `ANVL_Hornet_F7C_Mk2_Nose_Turret` — the Hornet Mk II Nose Turret swap
 * group's OTHER member (`ANVL_Hornet_Mk2`,
 * `generated-data/configurable-slots.runtime.json`), never factory-installed
 * anywhere in this corpus (see the CONFIRMED_TURRET_ENTITY_CLASSES doc
 * comment above for the prior "honest gap" finding) — confirmed via direct
 * `dcb query` to carry two intrinsic `WeaponGun` ports, both
 * `MinSize: 2, MaxSize: 2` (a fixed, uniform S2 — not a range), independent
 * of any ship's own loadout. This directly corroborates the Commander's own
 * independent SPPV validation (SW-013C.2G Amendment C): "Mk II S2 Nose
 * Turret — Turret mount size S3, Number of weapon ports 2, Child weapon
 * size S2." SPPV was used only as a validation oracle prompting this
 * re-investigation, per Amendment C's own explicit instruction — the actual
 * geometry recorded here is the live DataCore query result, not a value
 * copied from SPPV.
 */
const CONFIRMED_INTRINSIC_PORT_TURRET_ENTITY_CLASSES = new Set(['ANVL_Hornet_F7C_Mk2_Nose_Turret'])

interface RawPortDef {
  MinSize?: number
  MaxSize?: number
  Types?: Array<{ Type?: string }>
}
interface RawComponent {
  Ports?: RawPortDef[]
}

function deriveFromIntrinsicPorts(entityClass: string, starbreakerExe: string, dataP4k: string): { slotCount: number; weaponSize: number } | null {
  const outcome = parseDcbQueryResult(entityClass, runDcbQuery(starbreakerExe, dataP4k, entityClass))
  if (outcome.kind !== 'resolved') {
    console.warn(`"${entityClass}": ${outcome.reason} — skipped (intrinsic-port derivation).`)
    return null
  }
  const recordValue = outcome.record._RecordValue_
  const components = recordValue && typeof recordValue === 'object' ? (recordValue as { Components?: unknown }).Components : undefined
  const componentList = Array.isArray(components) ? (components as RawComponent[]) : []

  const weaponPorts = componentList
    .flatMap((c) => c.Ports ?? [])
    .filter((p) => (p.Types ?? []).some((t) => t.Type === 'WeaponGun'))

  if (weaponPorts.length === 0) {
    console.warn(`"${entityClass}": no intrinsic WeaponGun ports found on its own component definition — skipped.`)
    return null
  }
  const sizes = weaponPorts.map((p) => (p.MinSize === p.MaxSize ? p.MinSize : null))
  if (sizes.some((s) => s === null || typeof s !== 'number')) {
    console.warn(`"${entityClass}": intrinsic weapon ports are a size RANGE (MinSize !== MaxSize) or unsized — skipped rather than guessed. Sizes: ${JSON.stringify(weaponPorts.map((p) => [p.MinSize, p.MaxSize]))}`)
    return null
  }
  const uniform = sizes[0]
  if (!sizes.every((s) => s === uniform)) {
    console.warn(`"${entityClass}": intrinsic weapon ports do not share one uniform size (${JSON.stringify(sizes)}) — skipped rather than guessed.`)
    return null
  }
  return { slotCount: weaponPorts.length, weaponSize: uniform as number }
}

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

  if (CONFIRMED_INTRINSIC_PORT_TURRET_ENTITY_CLASSES.size > 0) {
    const starbreakerExe = process.env.STARBREAKER_EXE ?? 'D:\\StarBreaker-main\\StarBreaker-main\\target\\release\\starbreaker.exe'
    const dataP4k = process.env.SC_DATA_P4K ?? 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k'
    if (!existsSync(starbreakerExe) || !existsSync(dataP4k)) {
      console.warn(`StarBreaker executable or Data.p4k not found — skipping intrinsic-port derivation pass for: ${[...CONFIRMED_INTRINSIC_PORT_TURRET_ENTITY_CLASSES].join(', ')}. Set STARBREAKER_EXE/SC_DATA_P4K to include it.`)
    } else {
      for (const entityClass of CONFIRMED_INTRINSIC_PORT_TURRET_ENTITY_CLASSES) {
        if (entityClass in result) continue
        const derived = deriveFromIntrinsicPorts(entityClass, starbreakerExe, dataP4k)
        if (!derived) continue
        result[entityClass] = derived
        console.log(`"${entityClass}" (intrinsic ports, live DataCore query): ${derived.slotCount} weapon slot(s), size S${derived.weaponSize}.`)
      }
    }
  }

  const document = { schemaVersion: 1, turretWeaponSlotSpecByEntityClass: result }
  writeFileSync(OUTPUT_PATH, JSON.stringify(document, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${OUTPUT_PATH} (${Object.keys(result).length} confirmed turret entity classes).`)
}

main()
