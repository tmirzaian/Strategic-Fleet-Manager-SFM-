/**
 * EWO-STAB-003B — the installation engine's public surface. This is the
 * ONLY file anything outside src/engine/installation/ may import from.
 * ComponentIdentityService, CompatibilityEngine, and the inventory
 * transaction functions are internal collaborators of `executeInstallation`
 * and are deliberately not re-exported here (EWO-STAB-003A §1/§2 — no
 * caller outside the engine resolves identity or compatibility directly).
 */
export { executeInstallation } from './installationEngine'
export type {
  ComponentReference,
  InstallationCommand,
  InstallationDestination,
  InstallationEffects,
  InstallationFailureReason,
  InstallationOperation,
  InstallationResult,
  InstallationStateSnapshot,
} from './types'
