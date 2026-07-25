#!/usr/bin/env tsx
/**
 * Dormant Hardpoint Fleet-Wide Reconnaissance Audit (SW-013C.2G, Objective 5).
 *
 * RECONNAISSANCE ONLY. This script never mutates any runtime-consumed
 * artifact and is never imported by application code — it produces a
 * standalone report (`generated-data/dormant-hardpoint-audit.json`) for
 * engineering review. Activating any candidate it finds is a separate,
 * deliberate, individually-reviewed step (see
 * `src/generated/dormantHardpoints.ts`'s own curated allowlist) — per the
 * work order's own explicit instruction: "Do not automatically activate
 * all candidates merely because the generic mechanism exists."
 *
 * Method (direct source evidence, never name/description inference):
 *   1. For every raw-data ship fixture, `root_nmc` (the StarBreaker
 *      geometry-hierarchy bone list — Authority 1, ADR-014) is the
 *      ground truth for "this physical mount point exists on this exact
 *      ship's own 3D model." Every node name is real, ship-specific
 *      evidence — never borrowed from a sibling.
 *   2. `loadout` (Authority 2) lists which of those mount points are
 *      actually factory-populated on this exact ship. A `hardpoint_*`
 *      node present in `root_nmc` but ABSENT from `loadout` (no entry at
 *      all, not merely an empty one) is a dormant candidate — the exact
 *      shape of evidence that resolved the Hornet Ghost Mk II Nose case
 *      (SW-013C.2G, docs/SW-013C.2G-Dormant-Hardpoint-Materialization-Report.md).
 *   3. For each dormant candidate, cross-reference the SAME internalName
 *      across every OTHER ship's own `loadout` — if some other ship
 *      really occupies a port with that exact internalName, that
 *      occupying entity's own category/size/children (already resolved
 *      in `generated-data/ports.json`/`component-metadata-catalog.json`)
 *      is real "shape donor" evidence for what the dormant candidate
 *      would be if populated. No occupying donor anywhere = no shape
 *      evidence at all, and the candidate is reported at the lowest
 *      confidence tier rather than guessed.
 *   4. Confidence is additionally raised when a confirmed swap group
 *      exists for that exact port name (`generated-data/configurable-slots.runtime.json`)
 *      on the donor ship — the same authority already used for every
 *      other swap-group-gated port in this codebase.
 *
 * Usage:
 *   npx tsx scripts/generateDormantHardpointAudit.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripTrailingCommas } from '../src/engine/importer/trailingCommaJson'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')
const RAW_DATA_DIR = join(REPO_ROOT, 'raw-data')
const OUTPUT_PATH = join(REPO_ROOT, 'generated-data', 'dormant-hardpoint-audit.json')

interface RawLoadoutNode {
  port?: string
  entity?: string
  children?: RawLoadoutNode[]
}
interface RawNmcNode {
  node?: string
}
interface RawShipFixture {
  root?: { entity?: string }
  root_nmc?: RawNmcNode[]
  loadout?: RawLoadoutNode[]
}

interface CatalogRecord {
  category: string | null
  subtype: string | null
  size: number | null
  displayName: string | null
}
interface Catalog {
  records: Record<string, CatalogRecord>
}

interface PortRow {
  shipId: string
  internalName: string
  sourceEntityClass?: string
  minSize: number | null
  maxSize: number | null
  canonicalPortType?: string
  childPortIds?: string[]
}

/** Player-relevant equipment categories only — the union of
 * `scripts/componentCatalog/componentTaxonomy.ts`'s `PLAYER_USABLE_COMPONENT_TYPES`
 * (generator-scoped) and `src/generated/componentCatalog.ts`'s
 * `CATEGORY_TO_PORT_TYPE` (runtime-scoped, includes `Turret`, confirmed
 * the Hornet Nose Turret's own donor category). A raw ship's `root_nmc`
 * geometry list is dominated by cosmetic/administrative mount points
 * (antennas, cockpit audio, decals, seat access, light glass) that are
 * real nodes but never player-equipment-relevant — filtering donor
 * evidence to this allowlist is what keeps this audit's signal usable
 * rather than an unbounded, noise-dominated dump (per the work order's
 * own "reconnaissance first... not another unbounded archaeological
 * expedition" instruction). A candidate whose ONLY real donor evidence
 * falls outside this allowlist is not reported at all — not because it
 * doesn't exist, but because it is categorically out of scope for
 * Commander-facing equipment materialization. */
const PLAYER_RELEVANT_CATEGORIES = new Set([
  'WeaponGun',
  'WeaponDefensive',
  'WeaponMining',
  'WeaponMount',
  'Shield',
  'Cooler',
  'PowerPlant',
  'QuantumDrive',
  'JumpDrive',
  'MissileLauncher',
  'GroundVehicleMissileLauncher',
  'Missile',
  'Radar',
  'LifeSupportGenerator',
  'Relay',
  'TractorBeam',
  'TowingBeam',
  'SalvageHead',
  'SalvageModifier',
  'MiningModifier',
  'Turret',
  'Bomb',
  'BombLauncher',
  'Module',
])

/** Presentation-noise suppression ONLY for the zero-donor-evidence bucket
 * (see its own call site) — a `hardpoint_*` node matching one of these
 * well-understood, already-confirmed-cosmetic/administrative naming
 * families (antennas, cockpit audio/flair, seat access, decals, light
 * glass, docking internals) is never reported as "Needs Investigation"
 * even with zero donor evidence, since every sampled instance of these
 * families across this corpus is already independently confirmed
 * non-equipment via their own donor entities' real DataCore categories
 * elsewhere in this same audit run. This pattern is NEVER used to
 * classify a candidate that already has real player-equipment donor
 * evidence (Confirmed/Probable) — only to keep the zero-evidence bucket
 * from drowning genuinely novel candidates in restated noise. */
const KNOWN_NON_EQUIPMENT_NODE_PATTERN = /^hardpoint_(antenna|cockpit|seat|decal|light|glass|docking|beacon|flag|placard|plate|logo|dashboard|screen|audio|camera|scope_glass)/

function readJson<T>(path: string): T {
  const text = readFileSync(path, 'utf-8')
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(stripTrailingCommas(text))
  }
}

function collectOccupiedPortNames(nodes: RawLoadoutNode[] | undefined, out: Set<string>): void {
  for (const node of nodes ?? []) {
    if (node.port && node.entity) out.add(node.port)
    collectOccupiedPortNames(node.children, out)
  }
}

function collectOccupiedEntries(nodes: RawLoadoutNode[] | undefined, shipFile: string, out: Map<string, { shipFile: string; entityClass: string }[]>): void {
  for (const node of nodes ?? []) {
    if (node.port && node.entity) {
      const list = out.get(node.port) ?? []
      list.push({ shipFile, entityClass: node.entity })
      out.set(node.port, list)
    }
    collectOccupiedEntries(node.children, shipFile, out)
  }
}

interface DormantCandidate {
  shipFile: string
  shipEntityClass: string
  dormantPort: string
  confidence: 'Confirmed' | 'Probable' | 'Needs Investigation'
  shapeDonors: { shipFile: string; entityClass: string; category: string | null; size: number | null; displayName: string | null }[]
  hasConfirmedSwapGroup: boolean
  swapGroupId: string | null
  swapGroupEligibleCount: number | null
  contributesChildren: boolean
  note: string
}

function main() {
  const catalogPath = join(REPO_ROOT, 'generated-data', 'component-metadata-catalog.json')
  const catalog: Catalog = existsSync(catalogPath) ? readJson(catalogPath) : { records: {} }

  const configurableSlotsPath = join(REPO_ROOT, 'generated-data', 'configurable-slots.runtime.json')
  const configurableSlots: { ships: Record<string, Record<string, { portName: string; swapGroupId: string; eligibleComponentCount: number; eligibleComponents: string[] }>> } = existsSync(
    configurableSlotsPath
  )
    ? readJson(configurableSlotsPath)
    : { ships: {} }

  const portsJsonPath = join(REPO_ROOT, 'generated-data', 'ports.json')
  const allPorts: PortRow[] = existsSync(portsJsonPath) ? readJson(portsJsonPath) : []
  const occupiedByShipAndName = new Map<string, Set<string>>()
  for (const p of allPorts) {
    const set = occupiedByShipAndName.get(p.shipId) ?? new Set<string>()
    set.add(p.internalName)
    occupiedByShipAndName.set(p.shipId, set)
  }

  const files = readdirSync(RAW_DATA_DIR).filter((f) => f.endsWith('.json'))

  // Pass 1: for every port internalName, collect every real ship that occupies it.
  const occupationByPortName = new Map<string, { shipFile: string; entityClass: string }[]>()
  const fixtures = new Map<string, RawShipFixture>()
  for (const file of files) {
    const doc = readJson<RawShipFixture>(join(RAW_DATA_DIR, file))
    fixtures.set(file, doc)
    collectOccupiedEntries(doc.loadout, file, occupationByPortName)
  }

  // Pass 2: for every ship, find hardpoint_* geometry nodes present in
  // root_nmc but never occupied in THIS ship's own loadout.
  const candidates: DormantCandidate[] = []
  for (const [file, doc] of fixtures) {
    const shipEntityClass = (doc.root?.entity ?? '').replace(/^EntityClassDefinition\./, '')
    const ownOccupied = new Set<string>()
    collectOccupiedPortNames(doc.loadout, ownOccupied)

    const hardpointNodeNames = new Set((doc.root_nmc ?? []).map((n) => n.node).filter((n): n is string => !!n && n.startsWith('hardpoint_')))

    for (const nodeName of hardpointNodeNames) {
      if (ownOccupied.has(nodeName)) continue // already real and occupied on this exact ship — not dormant

      const donorsAll = (occupationByPortName.get(nodeName) ?? []).filter((d) => d.shipFile !== file)
      // Player-equipment-relevant donors only — see PLAYER_RELEVANT_CATEGORIES's
      // own doc comment. A donor whose category falls outside this allowlist
      // (antenna, seat access, cockpit audio/flair, light glass, etc.) is not
      // real equipment evidence and is excluded before any confidence tier
      // is assigned, never used to positively or negatively judge one.
      const donorsRaw = donorsAll.filter((d) => {
        const rec = catalog.records[d.entityClass]
        return !!rec?.category && PLAYER_RELEVANT_CATEGORIES.has(rec.category)
      })
      if (donorsRaw.length === 0) {
        // No player-equipment donor anywhere in the current corpus. Still
        // reported (the work order's own required "Needs Investigation"
        // tier), but a small, explicit, naming-convention-only denylist
        // suppresses the dominant, already-well-understood noise sources
        // (antennas, cockpit audio/flair, seat access, decals, light
        // glass) so the report stays a usable engineering artifact rather
        // than an unbounded dump — this NEVER decides equipment identity,
        // only whether an already-zero-evidence row is worth printing.
        if (KNOWN_NON_EQUIPMENT_NODE_PATTERN.test(nodeName)) continue
        candidates.push({
          shipFile: file,
          shipEntityClass,
          dormantPort: nodeName,
          confidence: 'Needs Investigation',
          shapeDonors: [],
          hasConfirmedSwapGroup: false,
          swapGroupId: null,
          swapGroupEligibleCount: null,
          contributesChildren: false,
          note: 'Physically present in this ship\'s own geometry (root_nmc) but never occupied by any player-equipment-relevant entity anywhere in the current raw-data corpus — no shape/compatibility evidence exists yet.',
        })
        continue
      }

      const shapeDonors = donorsRaw.map((d) => {
        const rec = catalog.records[d.entityClass]
        return { shipFile: d.shipFile, entityClass: d.entityClass, category: rec?.category ?? null, size: rec?.size ?? null, displayName: rec?.displayName ?? null }
      })

      // Does a donor ship have a confirmed swap group for this exact port name?
      let hasConfirmedSwapGroup = false
      let swapGroupId: string | null = null
      let swapGroupEligibleCount: number | null = null
      for (const donor of donorsRaw) {
        const donorShipEntityClass = (fixtures.get(donor.shipFile)?.root?.entity ?? '').replace(/^EntityClassDefinition\./, '')
        const shipSlots = configurableSlots.ships[donorShipEntityClass]
        if (!shipSlots) continue
        const entry = Object.values(shipSlots).find((e) => e.portName === nodeName)
        if (entry) {
          hasConfirmedSwapGroup = true
          swapGroupId = entry.swapGroupId
          swapGroupEligibleCount = entry.eligibleComponentCount
          break
        }
      }

      // Does the donor's own real port (on the donor ship, in ports.json) have children?
      const donorPortRow = allPorts.find((p) => donorsRaw.some((d) => p.internalName === nodeName))
      const contributesChildren = !!donorPortRow?.childPortIds && donorPortRow.childPortIds.length > 0

      const allSameCategory = new Set(shapeDonors.map((d) => d.category)).size === 1
      const confidence: DormantCandidate['confidence'] = hasConfirmedSwapGroup && allSameCategory ? 'Confirmed' : allSameCategory ? 'Probable' : 'Needs Investigation'

      candidates.push({
        shipFile: file,
        shipEntityClass,
        dormantPort: nodeName,
        confidence,
        shapeDonors,
        hasConfirmedSwapGroup,
        swapGroupId,
        swapGroupEligibleCount,
        contributesChildren,
        note: hasConfirmedSwapGroup
          ? `A confirmed swap group ("${swapGroupId}", ${swapGroupEligibleCount} member(s)) exists for this exact port name on at least one donor ship.`
          : allSameCategory
            ? 'Real donor(s) exist with a consistent category, but no confirmed swap-group authority was found for this exact port name.'
            : 'Donor ships disagree on this port name\'s own category — likely two structurally different physical hardpoints sharing one generic internal name; needs manual review before any activation.',
      })
    }
  }

  // SW-013C.2G — a zero-donor-evidence dormant port name recurring across
  // an implausibly large number of ships (paint/ping/heat-sink/battery/
  // landing-gear/avionics-style internal system markers, confirmed by
  // direct sampling of this exact bucket) is a fleet-wide engine/system
  // convention, never a genuine per-family equipment gap — a real
  // equipment mount point is ship- or hull-family-scoped, never
  // universal. This is a FREQUENCY filter (how many ships share this
  // exact name), never a name-content filter — it makes no claim about
  // what any specific candidate IS, only suppresses the "Needs
  // Investigation" tier's dominant, already-confirmed-noise shape so the
  // report stays a usable engineering artifact. Confirmed/Probable
  // candidates (which already carry real player-equipment donor
  // evidence) are never touched by this filter.
  const NEEDS_INVESTIGATION_SHIP_COUNT_CEILING = 15
  const needsInvestigationShipCounts = new Map<string, Set<string>>()
  for (const c of candidates) {
    if (c.confidence !== 'Needs Investigation') continue
    const set = needsInvestigationShipCounts.get(c.dormantPort) ?? new Set<string>()
    set.add(c.shipFile)
    needsInvestigationShipCounts.set(c.dormantPort, set)
  }
  const filteredCandidates = candidates.filter((c) => {
    if (c.confidence !== 'Needs Investigation') return true
    return (needsInvestigationShipCounts.get(c.dormantPort)?.size ?? 0) <= NEEDS_INVESTIGATION_SHIP_COUNT_CEILING
  })

  const byConfidence = { Confirmed: 0, Probable: 0, 'Needs Investigation': 0 } as Record<DormantCandidate['confidence'], number>
  for (const c of filteredCandidates) byConfidence[c.confidence]++

  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    method: 'root_nmc (geometry) vs loadout (factory occupation) diff, cross-ship shape-donor lookup, confirmed-swap-group cross-reference. See this script\'s own header comment for the full method.',
    summary: byConfidence,
    suppressedAsFleetWideSystemMarkers: candidates.length - filteredCandidates.length,
    candidates: filteredCandidates.sort((a, b) => a.shipFile.localeCompare(b.shipFile) || a.dormantPort.localeCompare(b.dormantPort)),
  }
  writeFileSync(OUTPUT_PATH, JSON.stringify(document, null, 2) + '\n', 'utf-8')
  console.log(`Wrote ${OUTPUT_PATH}`)
  console.log(`  Confirmed: ${byConfidence.Confirmed}`)
  console.log(`  Probable: ${byConfidence.Probable}`)
  console.log(`  Needs Investigation: ${byConfidence['Needs Investigation']}`)
  console.log(`  Total candidates: ${filteredCandidates.length} (${candidates.length - filteredCandidates.length} suppressed as fleet-wide system markers)`)
}

main()
