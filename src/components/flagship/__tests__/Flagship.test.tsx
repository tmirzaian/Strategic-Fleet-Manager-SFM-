import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import FlagshipFrame from '../FlagshipFrame'
import FlagshipThreshold from '../FlagshipThreshold'

afterEach(() => cleanup())

/**
 * EWO-113 (Objective 4) — like the Station Shell/Station Kit test suites
 * before it, this uses generic invented content ("probe") rather than any
 * real Station's own data, to prove the Flagship layer has no per-Station
 * awareness: it is the one layer every Station, present or future,
 * inherits automatically and unconditionally.
 */
describe('Flagship layer — structural components render (EWO-113)', () => {
  it('FlagshipFrame renders its children inside the ambient environmental wrapper', () => {
    render(
      <FlagshipFrame>
        <div data-testid="probe">probe content</div>
      </FlagshipFrame>
    )
    expect(screen.getByTestId('flagship-frame')).toBeInTheDocument()
    expect(screen.getByTestId('probe')).toBeInTheDocument()
  })

  it('FlagshipThreshold renders the persistent bulkhead marker, composing the Station Kit divider rather than reimplementing it', () => {
    render(<FlagshipThreshold />)
    expect(screen.getByTestId('flagship-threshold')).toBeInTheDocument()
    expect(screen.getByTestId('flagship-threshold-seam')).toBeInTheDocument()
  })
})

describe('Flagship layer — accessibility (EWO-113)', () => {
  it('FlagshipThreshold is aria-hidden, purely decorative — never announced to assistive tech', () => {
    render(<FlagshipThreshold />)
    expect(screen.getByTestId('flagship-threshold')).toHaveAttribute('aria-hidden', 'true')
  })
})

/**
 * EWO-113 (Objective 4) — the Flagship layer must know nothing about any
 * Station's own business logic, exactly like the Shell and Kit tiers
 * beneath it. Verified structurally: every Flagship source file's own
 * import statements are scanned for any dependency on a specific
 * Station's business logic, store, or page directory.
 */
describe('Flagship layer — no dependency on any Station\'s business logic (EWO-113)', () => {
  const flagshipDir = resolve(__dirname, '..')
  const flagshipSourceFiles = readdirSync(flagshipDir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  const forbiddenImportFragments = ['factoryLoadoutTargetIntelligence', 'flightCommanderPresentation', 'flightCommanderComponentIdentity', 'useFleetStore', '/pages/', 'shipDefinitions']

  it.each(flagshipSourceFiles)('%s imports nothing from a Station\'s own business logic, store, or page tree', (file) => {
    const source = readFileSync(resolve(flagshipDir, file), 'utf-8')
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'))
    for (const fragment of forbiddenImportFragments) {
      expect(importLines.some((line) => line.includes(fragment))).toBe(false)
    }
  })
})
