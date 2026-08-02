/**
 * EWO-107 (Part B/D/E) — bridges the application's real boot telemetry
 * (bootTelemetry.ts) to the static, non-React splash markup index.html
 * already painted before this module could load. All DOM ownership of
 * the splash itself (fade/remove, reduced-motion, long-wait/failure
 * timers) lives in index.html's own inline script, so it keeps working
 * even if this module never loads; this file only supplies the "a real
 * stage happened" signal once it does.
 */
import { getBootTelemetry, onBootStage, onBootReady, type BootStage } from './bootTelemetry'

// Part E — every string here is one of the work order's own approved
// examples. Status only ever advances in response to a real recorded
// stage; nothing here is a fabricated percentage or a timer-driven
// rotation independent of actual application state.
const STAGE_STATUS: Partial<Record<BootStage, string>> = {
  'main-module-start': 'INITIALIZING COMMAND SYSTEMS',
  'store-seed-baseline-built': 'RESTORING FLEET MANIFEST',
  'hydration-start': 'RESTORING FLEET MANIFEST',
  'migration-complete': 'VERIFYING FLEET DATA',
  'merge-complete': 'VERIFYING FLEET DATA',
  'hydration-complete': 'VERIFYING FLEET DATA',
  'first-render': 'ESTABLISHING COMMAND LINK',
  'route-render': 'ESTABLISHING COMMAND LINK',
  ready: 'OPERATIONS READY',
}

interface SfmBootSplashApi {
  setStatus: (text: string) => void
  ready: () => void
}

declare global {
  interface Window {
    __sfmBootSplash?: SfmBootSplashApi
  }
}

function statusFor(stage: BootStage): string | undefined {
  return STAGE_STATUS[stage]
}

/**
 * Call once, as early as possible in the entry module. Some stages (e.g.
 * store hydration, which runs during this module's own import graph
 * evaluation — see useFleetStore.ts) may already have been recorded by
 * the time this function's body runs; `getBootTelemetry()` catches this
 * function up to whatever already happened before subscribing for the
 * rest, so no real stage is ever silently skipped.
 */
export function wireBootSplash(): void {
  const alreadyRecorded = getBootTelemetry()
  const latest = alreadyRecorded[alreadyRecorded.length - 1]
  if (latest) {
    const status = statusFor(latest.stage)
    if (status) window.__sfmBootSplash?.setStatus(status)
  }

  onBootStage((stage) => {
    const status = statusFor(stage)
    if (status) window.__sfmBootSplash?.setStatus(status)
  })

  onBootReady(() => {
    window.__sfmBootSplash?.ready()
  })
}
