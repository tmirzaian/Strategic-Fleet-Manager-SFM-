import { describe, it, expect } from 'vitest'
import { runFullValidation, validateActiveBuildReference, validateCatalogIntegrity } from '../index'
import { ships, builds, hardpoints } from '../../../data/seed'
import { shipDefinitions } from '../../../data/shipDefinitions'
import { migrateSeedFleetToAssets } from '../../../data/fleetAssetMigration'
import type { Ship, Build } from '../../../types'

describe('runFullValidation (Part 2, test 38)', () => {
  it('38. returns structured, queryable ValidationIssue records with severity/code/entityType/entityId/message', () => {
    const summary = runFullValidation({ ships, builds, hardpoints, fleetAssets: migrateSeedFleetToAssets(), shipDefinitions })
    expect(Array.isArray(summary.issues)).toBe(true)
    for (const issue of summary.issues) {
      expect(['ERROR', 'WARNING', 'INFO']).toContain(issue.severity)
      expect(typeof issue.code).toBe('string')
      expect(typeof issue.entityType).toBe('string')
      expect(typeof issue.entityId).toBe('string')
      expect(typeof issue.message).toBe('string')
    }
  })

  it('the real seed dataset produces at least one WARNING for unresolved factory data (M80) without crashing', () => {
    const summary = runFullValidation({ ships, builds, hardpoints, fleetAssets: migrateSeedFleetToAssets(), shipDefinitions })
    expect(summary.issues.some((i) => i.code === 'UNRESOLVED_FACTORY_DATA')).toBe(true)
  })

  it('the real seed dataset produces an INCOMPATIBLE_TARGET issue for M80 Atlas (Golden Scenario A)', () => {
    const summary = runFullValidation({ ships, builds, hardpoints, fleetAssets: migrateSeedFleetToAssets(), shipDefinitions })
    expect(summary.issues.some((i) => i.code === 'INCOMPATIBLE_TARGET')).toBe(true)
  })

  it('the real seed dataset has exactly the one known intentional invalid-target ERROR (M80), no other structural errors', () => {
    const summary = runFullValidation({ ships, builds, hardpoints, fleetAssets: migrateSeedFleetToAssets(), shipDefinitions })
    const errors = summary.issues.filter((i) => i.severity === 'ERROR')
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('INCOMPATIBLE_TARGET')
    expect(errors[0].entityId).toContain('m80')
  })

  it('does not crash on empty/incomplete inputs', () => {
    expect(() => runFullValidation({ ships: [], builds: [], hardpoints: [], fleetAssets: [], shipDefinitions: [] })).not.toThrow()
  })
})

describe('validateActiveBuildReference (test 22)', () => {
  it('22. flags a ship whose activeBuildId does not reference a real Build record', () => {
    const brokenShip: Ship = { id: 's1', name: 'Broken Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'does-not-exist', readiness: 0, priority: 1, missing: [] }
    const issues = validateActiveBuildReference([brokenShip], [])
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('MISSING_ACTIVE_BUILD')
    expect(issues[0].severity).toBe('ERROR')
  })

  it('a ship with a real activeBuildId reference produces no issue', () => {
    const realBuild: Build = { id: 'b1', shipId: 's1', name: 'Build', role: 'Role', readiness: 100, isActive: true, missing: [], kind: 'CUSTOM' }
    const ship: Ship = { id: 's1', name: 'Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'b1', readiness: 100, priority: 1, missing: [] }
    expect(validateActiveBuildReference([ship], [realBuild])).toEqual([])
  })
})

describe('validateCatalogIntegrity (duplicate IDs)', () => {
  it('flags duplicate ship ids', () => {
    const dup: Ship = { id: 'dup', name: 'A', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'b', readiness: 0, priority: 1, missing: [] }
    const issues = validateCatalogIntegrity([dup, { ...dup, name: 'B' }], [], [])
    expect(issues.some((i) => i.code === 'DUPLICATE_ID' && i.entityType === 'Ship')).toBe(true)
  })
})

describe('Build Library vs Assigned Build (Part 14, tests 20-21)', () => {
  it('20/21: an assigned custom Build (Cutlass Red Medical Support Build) is a real, valid Build record even without a Library template', () => {
    const cutlassRedBuild = builds.find((b) => b.id === 'cutlass-red-medical')
    expect(cutlassRedBuild).toBeDefined()
    expect(cutlassRedBuild?.kind).toBe('CUSTOM')
    const cutlassRed = ships.find((s) => s.id === 'cutlass-red')!
    expect(cutlassRed.activeBuildId).toBe(cutlassRedBuild!.id)
    const issues = validateActiveBuildReference([cutlassRed], builds)
    expect(issues).toEqual([])
  })
})
