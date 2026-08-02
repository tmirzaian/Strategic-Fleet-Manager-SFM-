import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { __resetBootTelemetryForTests, markBootStage, reportHydrationComplete, reportFirstRenderComplete } from '../bootTelemetry'
import { wireBootSplash } from '../bootSplash'

// EWO-107 (Part I) — Honest Status Messaging (Part E) and splash removal
// (Part D): status may only advance through the approved strings, in the
// order real stages actually happened, and the splash may only be told to
// hide once genuine readiness (bootTelemetry.onBootReady) fires.
describe('bootSplash — status relay and readiness handoff (EWO-107 Part B/D/E)', () => {
  beforeEach(() => {
    __resetBootTelemetryForTests()
    window.__sfmBootSplash = { setStatus: vi.fn(), ready: vi.fn() }
  })

  it('advances status only through the approved strings, following the real stage sequence', () => {
    wireBootSplash()
    markBootStage('main-module-start')
    markBootStage('store-seed-baseline-built')
    markBootStage('hydration-start')
    markBootStage('migration-complete')
    markBootStage('merge-complete')
    reportHydrationComplete()
    reportFirstRenderComplete()

    const calls = (window.__sfmBootSplash!.setStatus as Mock).mock.calls.map((c) => c[0])
    expect(calls).toEqual([
      'INITIALIZING COMMAND SYSTEMS',
      'RESTORING FLEET MANIFEST',
      'RESTORING FLEET MANIFEST',
      'VERIFYING FLEET DATA',
      'VERIFYING FLEET DATA',
      'VERIFYING FLEET DATA',
      'ESTABLISHING COMMAND LINK',
      'OPERATIONS READY',
    ])
  })

  it('never tells the splash to hide before real readiness fires', () => {
    wireBootSplash()
    markBootStage('main-module-start')
    reportHydrationComplete()
    expect(window.__sfmBootSplash!.ready).not.toHaveBeenCalled()
    reportFirstRenderComplete()
    expect(window.__sfmBootSplash!.ready).toHaveBeenCalledTimes(1)
  })

  it('catches up to a stage already recorded before wireBootSplash() was called', () => {
    // Mirrors main.tsx's real ordering constraint: by the time main.tsx's
    // own top-level code runs, its import graph (including the store) has
    // already been evaluated, so some stages may already be recorded.
    markBootStage('main-module-start')
    markBootStage('hydration-complete')
    wireBootSplash()
    expect(window.__sfmBootSplash!.setStatus).toHaveBeenCalledWith('VERIFYING FLEET DATA')
  })

  it('does nothing if window.__sfmBootSplash was never installed (index.html script did not run)', () => {
    delete window.__sfmBootSplash
    expect(() => {
      wireBootSplash()
      markBootStage('main-module-start')
    }).not.toThrow()
  })
})
