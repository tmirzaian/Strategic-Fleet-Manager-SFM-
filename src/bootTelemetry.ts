/**
 * EWO-107 (Part A/C) — Quartermaster Boot Readiness Authority.
 *
 * The one narrow coordinator tracking when the application is genuinely
 * ready to be shown to the Commander — composed entirely from existing
 * lifecycle signals (React's own commit cycle, Zustand persist's own
 * `hasHydrated`/`onFinishHydration` hooks). This is deliberately NOT a
 * second application state store — it is a handful of module-scope
 * booleans and callbacks, the smallest primitive that satisfies "the
 * splash must be removed only when real readiness conditions are
 * satisfied, no arbitrary timeout."
 *
 * Timing marks (`performance.mark`/`measure`) are gated behind
 * `import.meta.env.DEV` — Vite statically replaces this with a literal
 * `false` in production builds, so the entire branch (including the
 * `performance.mark` calls themselves) is dead-code-eliminated from the
 * production bundle. Nothing here is noisy in production.
 */

export type BootStage =
  | 'main-module-start'
  | 'react-root-created'
  | 'store-seed-baseline-built'
  | 'hydration-start'
  | 'migration-complete'
  | 'merge-complete'
  | 'hydration-complete'
  | 'first-render'
  | 'route-render'
  | 'ready'

interface BootTelemetryEntry {
  stage: BootStage
  /** Milliseconds since navigation start (`performance.now()`), always recorded — even in production — so a future diagnostics surface can read it, but never logged/marked to the browser's own Performance panel outside dev. */
  timestamp: number
}

const entries: BootTelemetryEntry[] = []
const stageListeners: Array<(stage: BootStage) => void> = []

/** Records a boot-lifecycle checkpoint. Safe to call multiple times for the same stage (e.g. a stage that fires once per hardpoint-heavy computation) — every call is recorded, not deduplicated, so real duration between repeated stages is still visible. */
export function markBootStage(stage: BootStage): void {
  const timestamp = performance.now()
  entries.push({ stage, timestamp })
  if (import.meta.env.DEV) {
    performance.mark(`sfm-boot:${stage}`)
  }
  for (const listener of stageListeners) listener(stage)
}

/**
 * EWO-107 (Part E) — lets the boot splash advance its status text only in
 * response to a real recorded stage, without the splash module needing to
 * be wired into every individual `markBootStage` call site. Fires
 * synchronously, in call order, for every stage from this point forward
 * (no replay of stages already recorded — the splash always starts on
 * "main-module-start", the first stage there is).
 */
export function onBootStage(listener: (stage: BootStage) => void): void {
  stageListeners.push(listener)
}

/** Read-only snapshot of every recorded checkpoint, in order — the "measured startup timeline" Part A asks for, available at runtime, not just captured ad hoc for this report. */
export function getBootTelemetry(): readonly BootTelemetryEntry[] {
  return entries
}

let hydrationDone = false
let firstRenderDone = false
let readyFired = false
const readyCallbacks: Array<() => void> = []

function maybeSignalReady(): void {
  if (readyFired || !hydrationDone || !firstRenderDone) return
  readyFired = true
  markBootStage('ready')
  for (const cb of readyCallbacks.splice(0)) cb()
}

/** Call once Zustand's persist middleware reports hydration finished (via `hasHydrated()`/`onFinishHydration`) — composing the existing lifecycle hook, never a new one. */
export function reportHydrationComplete(): void {
  if (hydrationDone) return
  hydrationDone = true
  markBootStage('hydration-complete')
  maybeSignalReady()
}

/** Call once from the root of the routed application, after its first commit (e.g. a `useEffect` with an empty dependency array in `App`). */
export function reportFirstRenderComplete(): void {
  if (firstRenderDone) return
  firstRenderDone = true
  markBootStage('first-render')
  maybeSignalReady()
}

/** Registers a callback for the moment both readiness conditions are satisfied — fires immediately if that moment has already passed, matching the same "fire now or later" contract `persist.onFinishHydration` itself uses. */
export function onBootReady(callback: () => void): void {
  if (readyFired) {
    callback()
    return
  }
  readyCallbacks.push(callback)
}

export function isBootReady(): boolean {
  return readyFired
}

/** Test-only reset — never called from application code. */
export function __resetBootTelemetryForTests(): void {
  entries.length = 0
  hydrationDone = false
  firstRenderDone = false
  readyFired = false
  readyCallbacks.length = 0
  stageListeners.length = 0
}
