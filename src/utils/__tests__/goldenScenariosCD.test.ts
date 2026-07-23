import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../../store/useFleetStore'
import { calculateBuildProgress } from '../buildProgress'
import { deriveFleetBuildState } from '../fleetBuildState'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

// SW-005 Phase 2 — UTV's Factory Loadout is now constructed fresh from
// canonical topology (useFleetStore.ts's buildCanonicalSeedFactoryBuilds),
// not hand-authored in src/data/seed.ts, so this reads the live store
// rather than raw seed.ts exports.
function stateFor(shipId: string) {
  const s = useFleetStore.getState()
  const ship = s.ships.find((sh) => sh.id === shipId)!
  const build = s.builds.find((b) => b.id === ship.activeBuildId)
  const shipHardpoints = s.hardpoints.filter((h) => h.buildId === ship.activeBuildId)
  const progress = calculateBuildProgress(shipHardpoints)
  return { state: deriveFleetBuildState(build, progress), progress, build }
}

describe('Golden Scenario C — Factory-only UTV (live canonical topology)', () => {
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
