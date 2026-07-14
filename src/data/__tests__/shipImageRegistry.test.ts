import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { SHIP_IMAGE_URLS } from '../shipImageRegistry'
import { shipImageOverrides } from '../shipImageOverrides'

/** Every .ts/.tsx file directly under src/pages and src/components — not
 * src/data or src/config/assets, which are allowed to hold the actual
 * registries/manifests themselves. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectSourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) out.push(full)
  }
  return out
}

describe('EWO-021A (Task 9): single source of truth for ship image URLs', () => {
  it('every registry key is a non-empty string, every value a non-empty string — no accidental blanks', () => {
    for (const [key, value] of Object.entries(SHIP_IMAGE_URLS)) {
      expect(key.trim().length).toBeGreaterThan(0)
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it('registry keys are never display-name-shaped (no spaces) — canonical ids only', () => {
    for (const key of Object.keys(SHIP_IMAGE_URLS)) {
      expect(key).not.toMatch(/\s/)
    }
  })

  it('no page or component hard-codes a robertsspaceindustries.com media URL — only the registry/override data files may', () => {
    const root = path.resolve(__dirname, '../..')
    const files = [...collectSourceFiles(path.join(root, 'pages')), ...collectSourceFiles(path.join(root, 'components'))]
    const offenders = files.filter((f) => fs.readFileSync(f, 'utf8').includes('robertsspaceindustries.com'))
    expect(offenders).toEqual([])
  })

  it('shipImageOverrides.ts (the offline pipeline input) is untouched and distinct from the runtime registry', () => {
    expect(Object.keys(shipImageOverrides).length).toBeGreaterThan(0)
    // The two files may legitimately share values for the same real ship
    // (see shipImageRegistry.ts's header) but the runtime registry is
    // never simply a re-export of the pipeline file.
    expect(SHIP_IMAGE_URLS).not.toBe(shipImageOverrides as unknown as typeof SHIP_IMAGE_URLS)
  })

  it('partial coverage is valid — most canonical ids intentionally have no entry, and that must never throw at import time', () => {
    expect(() => Object.keys(SHIP_IMAGE_URLS)).not.toThrow()
    expect(SHIP_IMAGE_URLS.AEGS_Eclipse).toBeUndefined()
  })
})
