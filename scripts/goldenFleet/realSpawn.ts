/**
 * Operation Golden Fleet — GF-002B real process execution.
 *
 * The one place this tool actually shells out to StarBreaker. Kept
 * separate from `acquisitionRunner.ts` so tests can inject a fake
 * `SpawnFn` and never invoke a real process (Task 10).
 */
import { spawnSync } from 'node:child_process'
import type { SpawnFn } from './acquisitionRunner'

export const realSpawn: SpawnFn = (command, args, timeoutMs) => {
  const result = spawnSync(command, args, { encoding: 'utf-8', timeout: timeoutMs, killSignal: 'SIGTERM' })
  const timedOut = result.signal === 'SIGTERM' && result.status === null
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut,
  }
}
