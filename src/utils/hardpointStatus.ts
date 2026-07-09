import type { HardpointStatus } from '../types'

/**
 * Corrected hardpoint status logic (Sprint 1.1 fix).
 *
 * - No target required → OK
 * - Installed matches target → OK
 * - Nothing installed but a target exists → Missing
 * - Installed is still the untouched factory part and target differs → Missing
 *   (nothing has actually changed from the factory loadout yet)
 * - Installed differs from target but the player HAS already changed something
 *   away from factory → Upgrade Available (not Missing)
 */
export function computeHardpointStatus(
  installedItem: string | null | undefined,
  targetItem: string | null | undefined,
  factoryItem: string | null | undefined
): HardpointStatus {
  const installed = (installedItem ?? '').trim()
  const target = (targetItem ?? '').trim()
  const factory = (factoryItem ?? '').trim()

  if (!target || target === '—') return 'OK'
  if (installed && installed === target) return 'OK'
  if (!installed || installed === '—') return 'Missing'
  if (installed === factory && target !== factory) return 'Missing'
  return 'Upgrade Available'
}
