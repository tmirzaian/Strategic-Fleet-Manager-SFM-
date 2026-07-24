import type { HardpointStatus } from '../types'
import { validateTargetCompatibility } from '../data/componentCatalog'
// EWO-STAB-003D (ADR-010) — imported directly from componentIdentityService,
// NOT from the installation engine's public barrel (src/engine/installation
// index.ts). The barrel re-exports executeInstallation, which pulls in
// inventoryTransactionService.ts, which itself imports
// calculateComponentAvailability from src/engine/logistics/availability.ts —
// going through the barrel here would close a real import cycle. This file
// only ever needs identitiesMatch's pure comparison, never identity
// resolution or the installation pipeline, so importing the one leaf module
// that has no path back into this file is both sufficient and cycle-free.
import { identitiesMatch } from '../engine/installation/componentIdentityService'

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
export interface HardpointStatusIdentity {
  installedEntityClass?: string | null
  targetEntityClass?: string | null
  factoryEntityClass?: string | null
  /** SW-013C.2D (Objective 3) — forwarded verbatim to
   * `validateTargetCompatibility`'s own identity hint of the same name;
   * see `CompatibilityIdentityHint.knownCompatibleEntityClasses`'s doc
   * comment in src/data/componentCatalog.ts for the full reasoning. */
  knownCompatibleEntityClasses?: ReadonlySet<string> | null
}

/**
 * EWO-STAB-003D (ADR-010) — the one shared component-match rule this file
 * uses for every installed/target/factory comparison below. When BOTH sides
 * of a comparison carry a resolved entityClass, identity wins over display
 * name (the Slipstream/Snowblind class of two differently-cataloged parts
 * that happen to share a name must never read as a match). When either side
 * lacks one — an uncataloged component, or a record persisted before
 * EWO-STAB-003C — this falls through to the exact same case-sensitive `===`
 * comparison this file has always used, never to identitiesMatch's own
 * case-insensitive display-name fallback. That distinction matters here
 * specifically: silently loosening every legacy name comparison to
 * case-insensitive would be a real behavior change this consolidation
 * mission is not authorized to make.
 */
function componentsMatch(nameA: string, entityClassA: string | null | undefined, nameB: string, entityClassB: string | null | undefined): boolean {
  if (entityClassA && entityClassB) {
    return identitiesMatch(
      { displayName: nameA, entityClass: entityClassA, category: null, size: null },
      { displayName: nameB, entityClass: entityClassB, category: null, size: null }
    )
  }
  return nameA === nameB
}

export function computeHardpointStatus(
  installedItem: string | null | undefined,
  targetItem: string | null | undefined,
  factoryItem: string | null | undefined,
  identity?: HardpointStatusIdentity
): HardpointStatus {
  const installed = (installedItem ?? '').trim()
  const target = (targetItem ?? '').trim()
  const factory = (factoryItem ?? '').trim()
  const installedEntityClass = identity?.installedEntityClass
  const targetEntityClass = identity?.targetEntityClass
  const factoryEntityClass = identity?.factoryEntityClass

  if (factory === UNKNOWN_FACTORY_PLACEHOLDER) return 'Unresolved'
  if (!target || target === '—') return 'OK'
  if (installed && componentsMatch(installed, installedEntityClass, target, targetEntityClass)) return 'OK'
  if (!installed || installed === '—') return 'Missing'
  if (componentsMatch(installed, installedEntityClass, factory, factoryEntityClass) && !componentsMatch(target, targetEntityClass, factory, factoryEntityClass)) return 'Missing'
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
  installedEntityClass?: string | null
  targetEntityClass?: string | null
  factoryEntityClass?: string | null
}): HardpointStatus {
  return computeHardpointStatus(hardpoint.installedItem, hardpoint.targetItem, hardpoint.factoryItem, {
    installedEntityClass: hardpoint.installedEntityClass,
    targetEntityClass: hardpoint.targetEntityClass,
    factoryEntityClass: hardpoint.factoryEntityClass,
  })
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
  portSize: string,
  identity?: HardpointStatusIdentity
): HardpointStatusResult {
  // EWO-STAB-004A (ADR-010, Assignment 6) — the target's own resolved
  // entityClass (when known) is preferred over re-deriving everything
  // from `targetItem`'s display-name text, and the port's own
  // factoryEntityClass drives PDC_TURRET destination-capability
  // derivation. This is the one call site every computeHardpointStatusWithValidation
  // caller already threads an identity object through (fleetAssetMaterializer,
  // fleetAssetReconciliation, applyInstalledChange, saveMissionConfiguration,
  // the persisted-state merge) — no new caller wiring needed.
  const validation = validateTargetCompatibility(targetItem, portType, portSize, {
    itemEntityClass: identity?.targetEntityClass,
    destinationFactoryEntityClass: identity?.factoryEntityClass,
    knownCompatibleEntityClasses: identity?.knownCompatibleEntityClasses,
  })
  if (!validation.valid) {
    return { status: 'Invalid Target', invalidMessage: validation.message }
  }
  return { status: computeHardpointStatus(installedItem, targetItem, factoryItem, identity) }
}
