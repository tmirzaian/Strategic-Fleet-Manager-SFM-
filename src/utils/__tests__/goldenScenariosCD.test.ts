import { describe, it, expect } from 'vitest'
import { ships, builds, hardpoints } from '../../data/seed'
import { calculateBuildProgress } from '../buildProgress'
import { deriveFleetBuildState } from '../fleetBuildState'

function stateFor(shipId: string) {
  const ship = ships.find((s) => s.id === shipId)!
  const build = builds.find((b) => b.id === ship.activeBuildId)
  const shipHardpoints = hardpoints.filter((h) => h.buildId === ship.activeBuildId)
  const progress = calculateBuildProgress(shipHardpoints)
  return { state: deriveFleetBuildState(build, progress), progress, build }
}

describe('Golden Scenario C — Factory-only UTV (real seed data)', () => {
  it('12. UTV derives FACTORY_ONLY, not MISSION_READY, even though Installed = Factory = Target', () => {
    const { state, progress, build } = stateFor('utv')
    expect(build?.kind).toBe('FACTORY')
    expect(progress.isComplete).toBe(true) // numerically 100%...
    expect(state).toBe('FACTORY_ONLY') // ...but never labeled Build Complete.
    expect(state).not.toBe('MISSION_READY')
  })
})

describe('Golden Scenario D — completed Corsair custom Build (real seed data)', () => {
  it('13/Golden D: Corsair has a real CUSTOM Build that is genuinely MISSION_READY', () => {
    const { state, progress, build } = stateFor('corsair')
    expect(build?.kind).toBe('CUSTOM')
    expect(progress.isComplete).toBe(true)
    expect(progress.percentage).toBe(100)
    expect(state).toBe('MISSION_READY')
  })

  it('Corsair (MISSION_READY) and UTV (FACTORY_ONLY) are clearly distinct states despite both being 100% numerically', () => {
    const corsair = stateFor('corsair')
    const utv = stateFor('utv')
    expect(corsair.progress.percentage).toBe(utv.progress.percentage)
    expect(corsair.state).not.toBe(utv.state)
  })
})
