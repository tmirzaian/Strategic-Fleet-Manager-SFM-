import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  markBootStage,
  onBootStage,
  onBootReady,
  reportHydrationComplete,
  reportFirstRenderComplete,
  isBootReady,
  getBootTelemetry,
  __resetBootTelemetryForTests,
} from '../bootTelemetry'

// EWO-107 (Part I) — Application Readiness Authority (Part C): the boot
// splash may only disappear once BOTH real readiness conditions are
// satisfied, and never on a fixed timeout.
describe('bootTelemetry — Application Readiness Authority (EWO-107 Part A/C)', () => {
  beforeEach(() => {
    __resetBootTelemetryForTests()
  })

  it('is not ready until both hydration and first render report complete', () => {
    expect(isBootReady()).toBe(false)
    reportHydrationComplete()
    expect(isBootReady()).toBe(false)
    reportFirstRenderComplete()
    expect(isBootReady()).toBe(true)
  })

  it('is not ready if only first render (never hydration) completes', () => {
    reportFirstRenderComplete()
    expect(isBootReady()).toBe(false)
  })

  it('fires onBootReady exactly once both real conditions are satisfied — never before', () => {
    const cb = vi.fn()
    onBootReady(cb)
    reportFirstRenderComplete()
    expect(cb).not.toHaveBeenCalled()
    reportHydrationComplete()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires onBootReady immediately for a listener registered after readiness was already reached', () => {
    reportHydrationComplete()
    reportFirstRenderComplete()
    const cb = vi.fn()
    onBootReady(cb)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('records the "ready" stage exactly once even if completion is reported repeatedly', () => {
    reportHydrationComplete()
    reportHydrationComplete()
    reportFirstRenderComplete()
    reportFirstRenderComplete()
    expect(getBootTelemetry().filter((e) => e.stage === 'ready')).toHaveLength(1)
  })

  it('notifies onBootStage listeners, in call order, for every subsequent stage', () => {
    const seen: string[] = []
    onBootStage((stage) => seen.push(stage))
    markBootStage('main-module-start')
    markBootStage('react-root-created')
    expect(seen).toEqual(['main-module-start', 'react-root-created'])
  })
})
