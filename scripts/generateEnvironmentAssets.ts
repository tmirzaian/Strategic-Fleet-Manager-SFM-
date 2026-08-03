#!/usr/bin/env tsx
/**
 * Environment & Illustration Asset Pipeline (Chief Architect Asset Handoff
 * — Mission Control/Fleet Dashboard/Hangar Inventory empty-state
 * environments, Captain's Log certification accent).
 *
 * Approved master PNGs are the source of truth; every WebP derivative is
 * deterministically resized from them here — never re-generated,
 * re-cropped, or re-rendered. Masters stay in the repo permanently as
 * archival source (Chief Architect direction): if a future mission needs
 * a larger derivative (an 8K splash screen, a Steam page image), it is
 * regenerated from the same master, not recreated from scratch.
 *
 * Chief Architect Decision (Revision 1): masters were delivered below
 * several of the originally-requested tier widths. Per explicit
 * direction, this script never upscales — a requested width wider than
 * the master's own native width is skipped outright, never produced as a
 * softened/enlarged file mislabeled with a larger tier name. When a
 * higher-resolution master is delivered later for the same scene, add its
 * now-producible widths here without touching any semantic asset ID.
 *
 * Chief Architect Approval (Revision 2): the masters below were replaced
 * with higher-resolution artwork (3344x1882 for the three environments,
 * 1705x923 for the Captain's Log accent — the earlier low-resolution
 * masters are retired). Even though 3344px could technically support a
 * 2560 tier without upscaling, only 1920/1280 are requested this round
 * (explicit product scope, not a resolution constraint) — the
 * never-upscale guard below still applies independently as a safety net
 * for whatever masters exist at any given time.
 *
 * Run: npm run generate:environment-assets
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

interface DerivativeSpec {
  masterPath: string
  outputDir: string
  /** e.g. "mission-control-empty-priority-background" — width and .webp are appended per tier. */
  outputBaseName: string
  requestedWidths: number[]
}

const ENVIRONMENTS_ROOT = join(REPO_ROOT, 'public', 'assets', 'environments')
const ILLUSTRATIONS_ROOT = join(REPO_ROOT, 'public', 'assets', 'illustrations')

// Chief Architect Approval (Revision 2) — explicitly scoped to
// tablet(~1920)/mobile(~1280) only for this round; desktop(2560) and
// desktop4k(3840) are deliberately not requested even though the current
// 3344px masters could technically support a 2560 tier. Add them back
// here (and to each ENVIRONMENT_ASSETS source entry) only on explicit
// future direction.
const ENVIRONMENT_TIERS = [1920, 1280] as const

const SPECS: DerivativeSpec[] = [
  {
    masterPath: join(ENVIRONMENTS_ROOT, 'mission-control-empty-priority', 'mission-control-empty-priority-background.png'),
    outputDir: join(ENVIRONMENTS_ROOT, 'mission-control-empty-priority'),
    outputBaseName: 'mission-control-empty-priority-background',
    requestedWidths: [...ENVIRONMENT_TIERS],
  },
  {
    masterPath: join(ENVIRONMENTS_ROOT, 'fleet-dashboard-empty', 'fleet-dashboard-empty-background.png'),
    outputDir: join(ENVIRONMENTS_ROOT, 'fleet-dashboard-empty'),
    outputBaseName: 'fleet-dashboard-empty-background',
    requestedWidths: [...ENVIRONMENT_TIERS],
  },
  {
    masterPath: join(ENVIRONMENTS_ROOT, 'hangar-inventory-empty', 'hangar-inventory-empty-background.png'),
    outputDir: join(ENVIRONMENTS_ROOT, 'hangar-inventory-empty'),
    outputBaseName: 'hangar-inventory-empty-background',
    requestedWidths: [...ENVIRONMENT_TIERS],
  },
  {
    // EWO-104 Amendment 2 (Part F) — Flight Commander hero. Master
    // delivered as "...-background-master.png" (the one master filename in
    // this pipeline carrying an explicit "-master" suffix — matched
    // verbatim, not renamed) at 6684x3764, comfortably above the
    // requested 1920/1280 tiers.
    masterPath: join(ENVIRONMENTS_ROOT, 'flight-commander', 'flight-commander-background-master.png'),
    outputDir: join(ENVIRONMENTS_ROOT, 'flight-commander'),
    outputBaseName: 'flight-commander-background',
    requestedWidths: [...ENVIRONMENT_TIERS],
  },
  {
    // EWO-111 (Part A) — Flight Commander V2 environment plate: a
    // genuine second, distinct scene (a visible bulkhead threshold on
    // the left, the CIC beyond it), delivered directly as a
    // web-ready .webp at 1672x941 rather than an oversized archival
    // master — no PNG master exists for this plate. Requesting the same
    // [1920, 1280] tier set as every other environment for consistency;
    // the never-upscale guard above skips 1920 automatically (1672 <
    // 1920) and only the 1280 tier is actually produced — the delivered
    // 1672-wide file itself is registered directly as the `tablet`
    // source in environmentAssets.ts, since generating a same-or-smaller
    // "1920" derivative from it would be pointless.
    masterPath: join(ENVIRONMENTS_ROOT, 'flight-commander', 'flight-commander-v2.webp'),
    outputDir: join(ENVIRONMENTS_ROOT, 'flight-commander'),
    outputBaseName: 'flight-commander-v2-background',
    requestedWidths: [...ENVIRONMENT_TIERS],
  },
  {
    masterPath: join(ILLUSTRATIONS_ROOT, 'captains-log-certification', 'captains-log-certification-accent.png'),
    outputDir: join(ILLUSTRATIONS_ROOT, 'captains-log-certification'),
    outputBaseName: 'captains-log-certification-accent',
    // Chief Architect Approval (Revision 2) — 1600/1200 only, matching
    // the explicit task list; the master (1705px) couldn't support 2400
    // anyway (the never-upscale guard would have skipped it).
    requestedWidths: [1600, 1200],
  },
  {
    // EWO-101 — Ship Management "Manage Loadout" workstation card accent.
    // Master delivered at 1672x940 — 1600/1200 tiers, matching the
    // Captain's Log accent's own precedent widths for this same low-
    // opacity card-background visual contract.
    masterPath: join(ILLUSTRATIONS_ROOT, 'ship-management', 'loadout-workstation-accent.png'),
    outputDir: join(ILLUSTRATIONS_ROOT, 'ship-management'),
    outputBaseName: 'loadout-workstation-accent',
    requestedWidths: [1600, 1200],
  },
  {
    // EWO-101 — Ship Management "Change Installed Components" (Maintenance
    // Bay) workstation card accent. Master delivered at 1672x940, same
    // tiers as its sibling card accent above.
    masterPath: join(ILLUSTRATIONS_ROOT, 'ship-management', 'maintenance-bay-accent.png'),
    outputDir: join(ILLUSTRATIONS_ROOT, 'ship-management'),
    outputBaseName: 'maintenance-bay-accent',
    requestedWidths: [1600, 1200],
  },
]

/** Visually lossless WebP (Chief Architect Approval, Revision 2),
 * matching the environments README's format standard (WebP for
 * photographic backgrounds, no JPEG). 92 is the conventional
 * visually-lossless threshold for photographic WebP content — no banding
 * or blocking artifacts perceptible at normal viewing distance — while
 * still meaningfully smaller than the source PNG. */
const WEBP_QUALITY = 92

async function generateDerivatives(spec: DerivativeSpec): Promise<void> {
  if (!existsSync(spec.masterPath)) {
    throw new Error(`Master not found: ${spec.masterPath}. Place the approved master artwork there before running this script.`)
  }

  const metadata = await sharp(spec.masterPath).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read dimensions for ${spec.masterPath}.`)
  }
  console.log(`\n${spec.outputBaseName}: master is ${metadata.width}x${metadata.height}`)

  const producible = spec.requestedWidths.filter((w) => w <= metadata.width!)
  const skipped = spec.requestedWidths.filter((w) => w > metadata.width!)
  if (skipped.length > 0) {
    console.log(`  Skipping (would upscale beyond native resolution, never produced): ${skipped.join(', ')}`)
  }
  if (producible.length === 0) {
    console.log('  No tier is at or below native resolution — nothing to generate for this master.')
    return
  }

  for (const width of producible) {
    // Height omitted — sharp derives it proportionally, preserving the
    // master's real aspect ratio exactly (no crop, no letterbox padding).
    const buffer = await sharp(spec.masterPath)
      .resize(width, undefined, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    const outPath = join(spec.outputDir, `${spec.outputBaseName}-${width}.webp`)
    writeFileSync(outPath, buffer)
    console.log(`  Wrote ${spec.outputBaseName}-${width}.webp`)
  }
}

async function main() {
  for (const spec of SPECS) {
    await generateDerivatives(spec)
  }
  console.log('\nEnvironment/illustration asset pipeline complete. Master PNGs retained as archival source.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
