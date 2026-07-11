import type { HardpointStatus } from '../types'
import { validateTargetCompatibility } from '../data/componentCatalog'

/**
 * The one sanctioned placeholder string for factory data we genuinely
 * don't have (see src/data/seed.ts's `row()` helper and
 * docs/DATA_ENGINE.md). Whenever a hardpoint's *factory* item is this
 * placeholder, its status is never allowed to read 'OK' just because the
 * same placeholder string happens to also sit in installedItem/targetItem
 * (Alpha 2.1, Part 12 — "Unknown Factory Item must not receive an OK
 * status merely because the same placeholder string exists in all three
 * columns"). This is a general rule, not a fix for one ship's data.
 */
export const UNKNOWN_FACTORY_PLACEHOLDER = 'Unknown Factory Item'

/**
 * Corrected hardpoint status logic (Sprint 1.1 fix).
 *
 * - Factory data itself is unresolved (the placeholder) → Unresolved,
 *   regardless of what installedItem/targetItem say — placeholder
 *   equality can never manufacture a false OK (Alpha 2.1, Part 12).
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

  if (factory === UNKNOWN_FACTORY_PLACEHOLDER) return 'Unresolved'
  if (!target || target === '—') return 'OK'
  if (installed && installed === target) return 'OK'
  if (!installed || installed === '—') return 'Missing'
  if (installed === factory && target !== factory) return 'Missing'
  return 'Upgrade Available'
}

/**
 * Canonical entry point for hardpoint status, taking a hardpoint-shaped
 * object instead of positional args. Thin wrapper around
 * computeHardpointStatus so both call styles stay in sync with one rule set.
 */
export function getHardpointStatus(hardpoint: {
  installedItem: string | null | undefined
  targetItem: string | null | undefined
  factoryItem: string | null | undefined
}): HardpointStatus {
  return computeHardpointStatus(hardpoint.installedItem, hardpoint.targetItem, hardpoint.factoryItem)
}

export interface HardpointStatusResult {
  status: HardpointStatus
  invalidMessage?: string
}

/**
 * Compatibility-aware status (Sprint 1.3B.1 fix). Runs target-item
 * compatibility validation FIRST, via the real compatibility engine (see
 * src/data/componentCatalog.ts), and only falls through to the ordinary
 * Missing/Upgrade Available/OK rules once the target is confirmed to be a
 * legal fit for the port. An incompatible target (e.g. an S1 Quantum
 * Drive targeted at an S2 port) must never be silently treated as a
 * normal Missing state — it's a data problem, not a to-do item.
 *
 * This is the version seed data and store mutations should use whenever
 * a Port's type/size is available; `computeHardpointStatus` above stays
 * as the simpler positional-args version for callers that don't have
 * port type/size on hand.
 */
export function computeHardpointStatusWithValidation(
  installedItem: string | null | undefined,
  targetItem: string | null | undefined,
  factoryItem: string | null | undefined,
  portType: string,
  portSize: string
): HardpointStatusResult {
  const validation = validateTargetCompatibility(targetItem, portType, portSize)
  if (!validation.valid) {
    return { status: 'Invalid Target', invalidMessage: validation.message }
  }
  return { status: computeHardpointStatus(installedItem, targetItem, factoryItem) }
}
