#!/usr/bin/env tsx
/**
 * Branding Asset Pipeline (EWO-003 — Deterministic Asset Manufacturing).
 *
 * AI manufacturing produces exactly one artifact: the master logo. Every
 * other logo file is mathematically derived from it here, deterministically,
 * with no re-generation, cropping, sharpening, recoloring, or padding.
 *
 * Master input:
 *   public/assets/branding/logo/sfm-logo-master-1024.png
 *
 * To ship a new logo, replace that file and rerun:
 *   npm run generate:branding-assets
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const LOGO_DIR = join(REPO_ROOT, 'public', 'assets', 'branding', 'logo')
const MASTER_PATH = join(LOGO_DIR, 'sfm-logo-master-1024.png')
const MASTER_SIZE = 1024

// Every raster size derived from the master. Order is descending so a
// failure at a smaller size still leaves the larger, already-written
// files in place for inspection.
const OUTPUT_SIZES = [512, 256, 128, 64, 48, 32, 16] as const

// Sizes packed into favicon.ico, per the common multi-resolution favicon
// convention (16/32/48 covers browser tab, taskbar, and Windows shortcut use).
const FAVICON_SIZES = [16, 32, 48] as const

// EWO-015 — the Sidebar brand-lockup master is a distinct, portrait
// (non-square) commissioned asset, kept in its own source directory
// rather than alongside the square commissioning-mark master. Its
// derivatives are written under public/assets/generated/branding/ —
// a separate "generated derivatives" tree from the square logo's
// alongside-the-master convention — per EWO-015's explicit resume
// instruction.
const SIDEBAR_MASTER_DIR = join(REPO_ROOT, 'public', 'assets', 'branding', 'sidebar')
const SIDEBAR_MASTER_PATH = join(SIDEBAR_MASTER_DIR, 'sidebar-branding-master-1024.png')
const GENERATED_BRANDING_DIR = join(REPO_ROOT, 'public', 'assets', 'generated', 'branding')

// Widths only — height is derived proportionally from the master's real
// aspect ratio (see resizeSidebarMaster), never hard-coded, so the
// pipeline stays correct if the approved master's exact proportions
// ever change.
const SIDEBAR_OUTPUT_WIDTHS = [512, 256] as const

async function resizeMaster(size: number): Promise<Buffer> {
  return sharp(MASTER_PATH)
    // 'inside' with equal width/height on a square master fits exactly
    // (no crop, no padding) and would letterbox only if the master were
    // ever non-square — fail loudly instead via the metadata check below.
    .resize(size, size, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()
}

async function resizeSidebarMaster(width: number): Promise<Buffer> {
  return sharp(SIDEBAR_MASTER_PATH)
    // Height omitted deliberately — sharp derives it proportionally from
    // the master's real aspect ratio. 'inside' guarantees no crop and no
    // padding regardless of the master's exact proportions.
    .resize(width, undefined, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()
}

async function generateSidebarBrandingAssets() {
  if (!existsSync(SIDEBAR_MASTER_PATH)) {
    throw new Error(`Sidebar branding master not found at ${SIDEBAR_MASTER_PATH}. Place the approved master artwork there before running this script.`)
  }

  const metadata = await sharp(SIDEBAR_MASTER_PATH).metadata()
  if (!metadata.width || !metadata.height || metadata.height <= metadata.width) {
    throw new Error(`Expected a portrait Sidebar branding master (height > width), got ${metadata.width}x${metadata.height}. Refusing to derive variants from an unexpected source.`)
  }
  if (!metadata.hasAlpha) {
    throw new Error('Sidebar branding master has no alpha channel — transparency cannot be preserved. Refusing to generate variants.')
  }

  console.log(`Sidebar branding master verified: ${metadata.width}x${metadata.height}, ${metadata.channels} channels, alpha=${metadata.hasAlpha}`)

  if (!existsSync(GENERATED_BRANDING_DIR)) {
    mkdirSync(GENERATED_BRANDING_DIR, { recursive: true })
  }

  for (const width of SIDEBAR_OUTPUT_WIDTHS) {
    const buffer = await resizeSidebarMaster(width)
    const outPath = join(GENERATED_BRANDING_DIR, `sidebar-branding-${width}.png`)
    writeFileSync(outPath, buffer)
    console.log(`Wrote sidebar-branding-${width}.png (generated/branding/)`)
  }
}

async function main() {
  if (!existsSync(MASTER_PATH)) {
    throw new Error(`Master logo not found at ${MASTER_PATH}. Place the approved master artwork there before running this script.`)
  }

  const metadata = await sharp(MASTER_PATH).metadata()
  if (metadata.width !== MASTER_SIZE || metadata.height !== MASTER_SIZE) {
    throw new Error(`Expected a ${MASTER_SIZE}x${MASTER_SIZE} master, got ${metadata.width}x${metadata.height}. Refusing to derive variants from an unexpected source.`)
  }
  if (!metadata.hasAlpha) {
    throw new Error('Master logo has no alpha channel — transparency cannot be preserved. Refusing to generate variants.')
  }

  console.log(`Master verified: ${metadata.width}x${metadata.height}, ${metadata.channels} channels, alpha=${metadata.hasAlpha}`)

  const buffers = new Map<number, Buffer>()
  for (const size of OUTPUT_SIZES) {
    const buffer = await resizeMaster(size)
    buffers.set(size, buffer)
    const outPath = join(LOGO_DIR, `sfm-logo-${size}.png`)
    writeFileSync(outPath, buffer)
    console.log(`Wrote sfm-logo-${size}.png`)
  }

  const faviconSources = await Promise.all(
    FAVICON_SIZES.map((size) => buffers.get(size) ?? resizeMaster(size))
  )
  const icoBuffer = await pngToIco(faviconSources)
  writeFileSync(join(LOGO_DIR, 'favicon.ico'), icoBuffer)
  console.log(`Wrote favicon.ico (sizes: ${FAVICON_SIZES.join(', ')})`)

  // EWO-015 — independent pipeline; a missing/invalid Sidebar master fails
  // this run without touching the square-logo outputs already written above.
  await generateSidebarBrandingAssets()

  console.log('Branding asset pipeline complete.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
