#!/usr/bin/env tsx
/**
 * Component-Owned Port Constraint Generator (EWO-055 proving spike
 * follow-on — see the spike's own findings for the full investigation
 * this generalizes).
 *
 * Root-cause investigation (EWO-055 spike, `AEGS_Gladius` + its mount
 * entities) found that a ship's own DataCore record does NOT enumerate
 * its weapon/turret/rack ports' real accept-lists — querying
 * `AEGS_Gladius` directly surfaces only ship-utility ports (fuel,
 * docking, ATC, relay, cockpit flair). The authoritative acceptance data
 * — `Types`/`SubTypes`/`MinSize`/`MaxSize` per port — instead lives on
 * the OWNING PORT-CONTAINER entity's own record: a gimbal mount's own
 * `Mount_Gimbal_S3`, a fixed mount's own `ANVL_Valkyrie_Nose_Turret_S3`,
 * a manned turret's own `AEGS_Hammerhead_SCItem_Turret_Side_FrontLeft`,
 * a missile rack's own `MRCK_S09_AEGS_Eclipse` — exactly the same shape
 * `generateMissileRackSlots.ts`/`generateMiningModuleSlots.ts` already
 * read, generalized here from "MinSize/MaxSize only" to the full
 * Types/SubTypes accept-list those two never needed.
 *
 * Confirmed directly (dcb query, one entity per family):
 *   - Mount_Gimbal_S3:      1 port, MinSize=MaxSize=3, Types=[WeaponGun/Gun]
 *   - ANVL_Valkyrie_Nose_Turret_S3 (fixed mount, "Turret" in its NAME):
 *                           2 ports, Types=[WeaponGun/Gun] only — no
 *                           Turret/GunTurret entry, confirming entity
 *                           NAMES must never be used to infer mount role.
 *   - AEGS_Hammerhead_SCItem_Turret_Side_FrontLeft (real manned turret):
 *                           4 weapon ports, Types=[WeaponGun/Gun,
 *                           Turret/GunTurret] — the SECOND Types entry is
 *                           the real, positive turret signal. Also carries
 *                           non-weapon ports on the same record (Room,
 *                           Display) — confirming this generator must stay
 *                           generic and record every named port, never
 *                           filter down to a "weapon-shaped" subset.
 *   - MRCK_S09_AEGS_Eclipse (missile rack): 3 ports, Types=[Missile/
 *                           Missile,Torpedo] — the missile-rack family
 *                           carries real Type/SubType data too, not just
 *                           the MinSize/MaxSize `generateMissileRackSlots.ts`
 *                           already captures.
 *
 * Discovery: every distinct `sourceEntityClass` already present in the
 * committed `generated-data/ports.json` under one of the port-owning
 * assembly roles below — never a hand-authored list, and never a new
 * dependency (`ports.json` already exists from the ordinary ship-import
 * pipeline). Deliberately excludes GENERIC_MOUNT/QUANTUM_DRIVE/
 * JUMP_MODULE for this initial pass (weapon mounts, turrets, missile
 * racks only, per EWO-055's approved scope) — the role list below is the
 * only place a future family would be added; nothing else in this
 * generator is family-specific.
 *
 * Output: `generated-data/component-owned-port-constraints.json` — same
 * "small resolved fact, no raw DataCore paths/record ids retained"
 * licensing posture as the rack/mining-slot files. A port's `accepted[]`
 * preserves each DataCore Types[] entry's own type/subtypes PAIRING
 * (never flattened into two unrelated arrays — a SubTypes list only ever
 * means something in relation to the Type it came with).
 *
 * Usage:
 *   npm run generate:component-owned-port-constraints
 *
 * Depends on `generated-data/ports.json` already existing (run
 * `npm run import:ships` first). Requires the same local StarBreaker +
 * Data.p4k install as every other generator in this family; override via
 * the same env vars.
 *
 * Scope boundary (EWO-055): this generator and its runtime loader are
 * the ONLY things this mission produces. Nothing here is wired into
 * `validateTargetCompatibility`/`isComponentSelectableForPort`, no
 * Commander-facing badge changes, no VERIFIED/NOMINAL confidence
 * behavior — that consumer migration is explicitly future work, pending
 * separate Chief Architect review.
 *
 * EWO-056B — extended (no new traversal, no new queries) to also capture
 * `SItemPortDef.Flags`, normalized to `PortConstraintRecord.editable`
 * (`normalizePortEditability`, below). Authoritative source: EWO-056's
 * own investigation confirmed `Flags` is exactly why the Ironclad
 * Command Module's tractor beam reads locked in-game and in SPPV —
 * `Flags: "uneditable"` on its own `DRAK_Command_Module_Remote_Turret_Tractor_Beam`
 * record's `turret_weapon` port, contrasted directly against
 * `Flags: "editable"` on an ordinary missile rack port
 * (`MRCK_S09_AEGS_Eclipse`'s `missile_01_attach`). `uneditable` and
 * `$uneditable` are both confirmed real, both normalize to the same
 * locked (`false`) state — see `normalizePortEditability`'s own doc
 * comment for the exact rule and why check order matters. Acquisition
 * only, per EWO-056B's own scope: no consumer of this repository reads
 * `editable` yet, and this generator does not change how any existing
 * field (`minSize`/`maxSize`/`accepted`) is computed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { runDcbQuery, parseDcbQueryResult } from './componentCatalog/dcbQuery'
import { parseBuildManifest } from './componentCatalog/buildManifest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const DEFAULT_STARBREAKER_EXE = 'D:\\StarBreaker-main\\StarBreaker-main\\target\\release\\starbreaker.exe'
const DEFAULT_DATA_P4K = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k'

/** The only place a future port-owning family gets added. Every other
 * step of this generator is generic over whatever entityClasses this
 * produces. */
const OWNER_ASSEMBLY_ROLES = ['GIMBAL_MOUNT', 'DIRECT_WEAPON_MOUNT', 'MANNED_TURRET', 'REMOTE_TURRET', 'MISSILE_RACK'] as const

export interface PortAcceptedType {
  type: string
  subtypes: string[]
}

export interface PortConstraintRecord {
  minSize: number | null
  maxSize: number | null
  accepted: PortAcceptedType[]
  /**
   * EWO-056B — the port's own authoritative DataCore upgrade-authority
   * state, from `SItemPortDef.Flags` (the exact source EWO-056's
   * investigation traced the Command Module tractor beam's lock to).
   * `true` = `Flags` says "editable"; `false` = `Flags` says
   * "uneditable" or "$uneditable" (treated as equivalent locked states —
   * both confirmed on real records, e.g. the Command Module's own
   * `hardpoint_engineering_screen`/`hardpoint_relay`); `null` = `Flags`
   * is absent, empty, or any other value this generator doesn't
   * recognize (e.g. `"dockingport1"`) — never guessed, never inferred
   * from anything else about the port. Source metadata only — no
   * consumer reads this field yet (EWO-056B is acquisition, not
   * behavior).
   */
  editable: boolean | null
}

export interface EntityPortExtraction {
  portsByName: Record<string, PortConstraintRecord>
  /** A per-entity data anomaly this generator refused to guess through —
   * e.g. two `Ports[]` entries sharing one `Name` with genuinely
   * different constraints. The offending name is omitted from
   * `portsByName` entirely rather than one of the disagreeing values
   * being picked arbitrarily. */
  anomalies: string[]
}

/** Every distinct `sourceEntityClass` already recorded against one of the
 * port-owning assembly roles in the committed ports.json — the discovery
 * source for every family this generator covers, never a hand-authored
 * list (matching `generateMissileRackSlots.ts`'s own discovery rule). */
export function discoverOwnerEntityClasses(portsRecords: Array<{ assemblyRole?: string | null; sourceEntityClass?: string | null }>): string[] {
  const roles: readonly string[] = OWNER_ASSEMBLY_ROLES
  const set = new Set<string>()
  for (const p of portsRecords) {
    if (p.sourceEntityClass && p.assemblyRole && roles.includes(p.assemblyRole)) set.add(p.sourceEntityClass)
  }
  return [...set].sort()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** One raw `Types[]` entry -> `{type, subtypes}`, preserving the pairing.
 * A malformed entry (non-string `Type`, or entirely non-object) is
 * skipped — never fabricated, never allowed to crash extraction for the
 * rest of a perfectly good record. `SubTypes` defaults to `[]` (a real,
 * confirmed shape — e.g. Gladius's own `DockingCollar` port), never
 * omitted or guessed at. */
function extractAcceptedType(raw: unknown): PortAcceptedType | null {
  if (!isPlainObject(raw) || typeof raw.Type !== 'string') return null
  const subtypesRaw = raw.SubTypes
  const subtypes = Array.isArray(subtypesRaw) ? subtypesRaw.filter((s): s is string => typeof s === 'string') : []
  return { type: raw.Type, subtypes }
}

/**
 * EWO-056B — normalizes `SItemPortDef.Flags` into the tri-state
 * `editable` field. `Flags` is a free-form string that may carry other,
 * unrelated tokens alongside the editability one (confirmed real values
 * sampled so far: `""`, `"editable"`, `"uneditable"`, `"$uneditable"`,
 * `"dockingport1"`) — checked as substrings, in lock-first order, so a
 * hypothetical compound value is never misread (`"uneditable"` itself
 * contains the substring `"editable"`, so the lock check MUST run
 * first). Anything that isn't a recognized token — including a
 * genuinely new future value — resolves to `null` ("unknown/
 * unavailable") rather than being guessed either way, per EWO-056B
 * Objective B.
 */
export function normalizePortEditability(flags: unknown): boolean | null {
  if (typeof flags !== 'string') return null
  if (flags.includes('uneditable')) return false
  if (flags.includes('editable')) return true
  return null
}

/** One raw `Ports[]` entry -> `{name, record}` (name kept separate so the
 * caller can detect a duplicate before committing it to the map). `null`
 * when the entry has no usable `Name` — a nameless port can never be
 * looked up by name, so it is excluded rather than assigned a fabricated
 * key. */
function extractPort(raw: unknown): { name: string; record: PortConstraintRecord } | null {
  if (!isPlainObject(raw) || typeof raw.Name !== 'string' || raw.Name.length === 0) return null
  const minSize = typeof raw.MinSize === 'number' ? raw.MinSize : null
  const maxSize = typeof raw.MaxSize === 'number' ? raw.MaxSize : null
  const typesRaw = Array.isArray(raw.Types) ? raw.Types : []
  const accepted = typesRaw.map(extractAcceptedType).filter((t): t is PortAcceptedType => t !== null)
  const editable = normalizePortEditability(raw.Flags)
  return { name: raw.Name, record: { minSize, maxSize, accepted, editable } }
}

function sameConstraint(a: PortConstraintRecord, b: PortConstraintRecord): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Every real, named port on an owning entity's own DataCore record —
 * every `Ports[]` entry on ANY `Components[]` index (like both sibling
 * generators, never just the first), across every kind of port the
 * record happens to carry (a manned turret's own weapon ports sit
 * alongside unrelated Room/Display ports on the SAME record — confirmed
 * on `AEGS_Hammerhead_SCItem_Turret_Side_FrontLeft` — so this stays
 * fully generic rather than filtering toward a "weapon-shaped" subset).
 *
 * A `Name` that repeats within one entity is a genuine data anomaly, not
 * a normal shape (multi-port turrets/racks use distinct names per slot
 * in every real record sampled) — recorded and excluded from
 * `portsByName` UNLESS both occurrences carry byte-identical constraints
 * (a harmless duplicate, not an ambiguity), matching this codebase's
 * "never silently pick one of several disagreeing values" rule
 * throughout (see `withMissileRackAggregation`'s `inconsistent`).
 */
export function extractOwnedPortConstraints(recordValue: unknown): EntityPortExtraction {
  const components = isPlainObject(recordValue) ? recordValue.Components : undefined
  const componentList = Array.isArray(components) ? components : []

  const portsByName: Record<string, PortConstraintRecord> = {}
  const conflicted = new Set<string>()
  const anomalies: string[] = []

  for (const component of componentList) {
    const ports = isPlainObject(component) && Array.isArray(component.Ports) ? component.Ports : []
    for (const raw of ports) {
      const extracted = extractPort(raw)
      if (!extracted) continue
      const { name, record } = extracted
      if (name in portsByName) {
        if (!sameConstraint(portsByName[name], record)) {
          conflicted.add(name)
          anomalies.push(`duplicate port name "${name}" with disagreeing constraints — excluded from portsByName rather than guessed`)
        }
        continue
      }
      portsByName[name] = record
    }
  }
  for (const name of conflicted) delete portsByName[name]

  // Deterministic key order regardless of source array order.
  const sorted: Record<string, PortConstraintRecord> = {}
  for (const name of Object.keys(portsByName).sort()) sorted[name] = portsByName[name]

  return { portsByName: sorted, anomalies }
}

/** Mirrors `generateComponentCatalog.ts`'s own `requireVersion` exactly —
 * duplicated rather than shared, matching every other piece of this
 * generator family's CLI boilerplate (DEFAULT_STARBREAKER_EXE/
 * DEFAULT_DATA_P4K above are already duplicated the same way). */
function requireStarbreakerVersion(starbreakerExePath: string): string {
  const result = spawnSync(starbreakerExePath, ['--version'], { encoding: 'utf-8' })
  if (result.error) {
    throw new Error(`Failed to execute StarBreaker at "${starbreakerExePath}": ${result.error.message}`)
  }
  if (result.status !== 0 || !result.stdout) {
    throw new Error(`Could not determine StarBreaker version ("${starbreakerExePath} --version" exited ${result.status}).`)
  }
  const match = /starbreaker\s+(\S+)/i.exec(result.stdout)
  if (!match) {
    throw new Error(`Could not parse StarBreaker version output: "${result.stdout.trim()}"`)
  }
  return match[1]
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

  // EWO-055 (Verification Note 2) — the committed catalog must be
  // byte-identical across two runs against the same game patch, so
  // provenance is derived from the installed build itself
  // (`build_manifest.id`, same source `generateComponentCatalog.ts`
  // already certifies against) plus the StarBreaker tool's own
  // `--version`, never `new Date().toISOString()` — a wall-clock stamp
  // would silently break byte-identity on every run regardless of
  // whether the underlying DataCore data actually changed. This is
  // STRONGER provenance than a timestamp, not weaker: it ties the file
  // to an exact, independently-verifiable game version/changelist
  // instead of an arbitrary generation moment.
  const manifestPath = join(dirname(dataP4k), 'build_manifest.id')
  if (!existsSync(manifestPath)) {
    throw new Error(`Build manifest not found at "${manifestPath}" — cannot verify the installed game build.`)
  }
  const manifest = parseBuildManifest(readFileSync(manifestPath, 'utf-8'))
  console.log(`Game build: branch=${manifest.branch} version=${manifest.version} p4Change=${manifest.requestedP4ChangeNum}`)
  const starbreakerVersion = requireStarbreakerVersion(starbreakerExe)
  console.log(`StarBreaker version: ${starbreakerVersion}`)

  const portsPath = join(REPO_ROOT, 'generated-data', 'ports.json')
  if (!existsSync(portsPath)) {
    throw new Error(`${portsPath} does not exist — run "npm run import:ships" first (this generator discovers owner entityClasses from its output, never a hand-authored list).`)
  }
  const portsRecords = JSON.parse(readFileSync(portsPath, 'utf-8')) as Array<{ assemblyRole?: string | null; sourceEntityClass?: string | null }>
  const ownerEntityClasses = discoverOwnerEntityClasses(portsRecords)
  console.log(`Discovered ${ownerEntityClasses.length} port-owning entity classes from ports.json (roles: ${OWNER_ASSEMBLY_ROLES.join(', ')}).`)

  const byEntityClass: Record<string, { portsByName: Record<string, PortConstraintRecord> }> = {}
  const anomaliesByEntity: { entityClass: string; anomalies: string[] }[] = []
  const skipped: { entityClass: string; reason: string }[] = []
  let emptyCount = 0

  for (const entityClass of ownerEntityClasses) {
    const raw = runDcbQuery(starbreakerExe, dataP4k, entityClass)
    const outcome = parseDcbQueryResult(entityClass, raw)
    if (outcome.kind === 'not-found') {
      console.warn(`  ${entityClass}: ${outcome.reason} — skipped.`)
      skipped.push({ entityClass, reason: outcome.reason })
      continue
    }
    try {
      const { portsByName, anomalies } = extractOwnedPortConstraints(outcome.record._RecordValue_)
      const portCount = Object.keys(portsByName).length
      if (portCount === 0) {
        emptyCount++
        console.warn(`  ${entityClass}: no named Components[].Ports[] found — skipped (no fallback fabricated).`)
        skipped.push({ entityClass, reason: 'no named Components[].Ports[] found' })
        continue
      }
      byEntityClass[entityClass] = { portsByName }
      if (anomalies.length > 0) anomaliesByEntity.push({ entityClass, anomalies })
      console.log(`  ${entityClass}: ${portCount} named port(s)${anomalies.length > 0 ? ` (${anomalies.length} anomaly/anomalies)` : ''}`)
    } catch (err) {
      console.warn(`  ${entityClass}: ${(err as Error).message} — skipped.`)
      skipped.push({ entityClass, reason: (err as Error).message })
    }
  }

  const outputPath = join(REPO_ROOT, 'generated-data', 'component-owned-port-constraints.json')
  const document = {
    schemaVersion: 1,
    // Stable, reproducible provenance — NOT a wall-clock timestamp (see
    // the comment above on why). Two runs against the same installed
    // build produce byte-identical output.
    generatedFrom: {
      gameBranch: manifest.branch,
      gameVersion: manifest.version,
      p4ChangeNum: manifest.requestedP4ChangeNum,
      starbreakerVersion,
    },
    source: "starbreaker-datacore (Components[].Ports[] Name/MinSize/MaxSize/Types on the owning port-container entity's own record)",
    discoveredFrom: `generated-data/ports.json (assemblyRole in ${OWNER_ASSEMBLY_ROLES.join('/')})`,
    byEntityClass,
    // Documented, not fabricated — matches generateMissileRackSlots.ts's
    // own skipped/anomaly reporting convention.
    anomalies: anomaliesByEntity,
    skipped,
  }
  writeFileSync(outputPath, JSON.stringify(document, null, 2) + '\n', 'utf-8')
  console.log(
    `\nWrote ${outputPath} (${Object.keys(byEntityClass).length} entities resolved, ${emptyCount} empty, ${skipped.length - emptyCount} unresolved/other-skipped, ${anomaliesByEntity.length} entities with anomalies).`
  )
}

if (process.argv[1] === __filename) {
  main()
}
