import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShipNormalizer } from '../shipNormalizer'
import { validateNormalizedPackage } from '../validation'

const RAW_DATA_DIR = resolve(__dirname, '../../../raw-data')

function loadFixture(filename: string) {
  const text = readFileSync(resolve(RAW_DATA_DIR, filename), 'utf-8')
  return JSON.parse(text)
}

describe('ShipNormalizer against real raw-data fixtures', () => {
  const normalizer = new ShipNormalizer()

  it('processes the Gladius fixture with no errors', () => {
    const raw = loadFixture('AEGS Gladius.json')
    const pkg = normalizer.normalize(raw, 'raw-data/AEGS Gladius.json')
    const result = validateNormalizedPackage(pkg)
    const errors = [...result.normalizationWarnings, ...result.compatibilityWarnings].filter((w) => w.severity === 'error')

    expect(pkg.ship.name).toBe('Gladius')
    expect(pkg.ports.length).toBeGreaterThan(0)
    expect(errors).toEqual([])
    // Recursive missile rack children must survive normalization.
    expect(pkg.ports.some((p) => p.parentPortId !== null && p.parentPortId !== undefined)).toBe(true)
  })

  it('processes the Avenger Titan fixture with the exact same normalizer class, no errors', () => {
    const raw = loadFixture('AEGS Avenger Titan.json')
    const pkg = normalizer.normalize(raw, 'raw-data/AEGS Avenger Titan.json')
    const result = validateNormalizedPackage(pkg)
    const errors = [...result.normalizationWarnings, ...result.compatibilityWarnings].filter((w) => w.severity === 'error')

    expect(pkg.ship.name).toBe('Avenger Titan')
    expect(pkg.ports.length).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  it('excludes doors/seats/controllers/thrusters from both fixtures', () => {
    const gladius = normalizer.normalize(loadFixture('AEGS Gladius.json'), 'g.json')
    const avenger = normalizer.normalize(loadFixture('AEGS Avenger Titan.json'), 'a.json')

    for (const pkg of [gladius, avenger]) {
      expect(pkg.ports.some((p) => p.internalName.startsWith('door_'))).toBe(false)
      expect(pkg.ports.some((p) => p.internalName.includes('seat'))).toBe(false)
      expect(pkg.ports.some((p) => p.internalName.includes('controller'))).toBe(false)
      expect(pkg.ports.some((p) => p.internalName.includes('thruster'))).toBe(false)
    }
  })

  it('produces globally-unique ship ids across both fixtures (no collision)', () => {
    const gladius = normalizer.normalize(loadFixture('AEGS Gladius.json'), 'g.json')
    const avenger = normalizer.normalize(loadFixture('AEGS Avenger Titan.json'), 'a.json')
    expect(gladius.ship.id).not.toBe(avenger.ship.id)
  })
})
