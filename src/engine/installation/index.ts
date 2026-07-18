/**
 * EWO-STAB-003B/003C — the installation engine's public surface. This is
 * the ONLY file anything outside src/engine/installation/ may import
 * from. CompatibilityEngine and the inventory transaction functions
 * remain internal collaborators of `executeInstallation`, never
 * re-exported (EWO-STAB-003A §1/§2 — no caller resolves compatibility
 * independently).
 *
 * `resolveComponentIdentity` (ADR-010) IS re-exported, deliberately: a
 * second legitimate caller now exists outside the engine proper —
 * `reserveComponent` (src/store/useFleetStore.ts), which is not an
 * installation operation (EWO-STAB-003A §4 explicitly keeps reservation
 * *creation* outside the transaction) but must still resolve identity
 * through THIS one service rather than reimplementing its own lookup.
 * Exporting the official function for an authorized second caller is not
 * the same as callers resolving identity ad hoc — that principle governs
 * against a second, independent implementation, not against a second
 * legitimate use of the one real one.
 */
export { executeInstallation } from './installationEngine'
export { resolveComponentIdentity, identitiesMatch, type ResolvedComponentIdentity } from './componentIdentityService'
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
