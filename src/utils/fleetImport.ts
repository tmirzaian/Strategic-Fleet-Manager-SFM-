import type { Ship, HangarItem, Build, InstalledLoadoutEntry, MissionReservation } from '../types'
import type { FleetExportEnvelope, FleetPersistencePayload } from './fleetSerialization'

/**
 * EWO-094 — "Fleet Import Preview & Replace Workflow." Pure, store-agnostic
 * envelope parsing and summary/warning derivation — the same layering
 * EWO-093 established for `fleetSerialization.ts`. All real validation
 * and migration logic stays in `useFleetStore.ts`'s existing
 * `migrateFleetPersistedState`/`mergeFleetPersistedState` (themselves
 * extracted, unchanged, from the persist middleware's own `migrate`/
 * `merge` — never a second, parallel implementation). This module only
 * ever checks the OUTER envelope shape; inner field-level validity is
 * already the existing per-record validators' job — see
 * docs/Beta-2.1-Fleet-Export-Architecture.md and the EWO-094 work order's
 * own architectural principle: "There shall be one import pipeline."
 */
export interface FleetImportEnvelopeError {
  code: 'INVALID_JSON' | 'NOT_AN_OBJECT' | 'MISSING_SCHEMA_VERSION' | 'MISSING_PAYLOAD'
  message: string
}

export type FleetImportEnvelopeParseResult = { valid: true; envelope: FleetExportEnvelope } | { valid: false; error: FleetImportEnvelopeError }

/**
 * Checks only what a Fleet Export envelope must structurally have to be
 * worth handing to the existing migration pipeline: valid JSON, a plain
 * object, a numeric `schemaVersion`, and an object `payload`. Deliberately
 * does NOT inspect `payload`'s own fields — that's `migrateFleetPersistedState`'s
 * existing, battle-tested job, reused verbatim rather than duplicated here.
 */
export function parseFleetImportFile(rawText: string): FleetImportEnvelopeParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { valid: false, error: { code: 'INVALID_JSON', message: 'This file is not valid JSON.' } }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: { code: 'NOT_AN_OBJECT', message: 'This file does not contain a Fleet Export envelope.' } }
  }
  const obj = parsed as Record<string, unknown>
  if (typeof obj.schemaVersion !== 'number') {
    return { valid: false, error: { code: 'MISSING_SCHEMA_VERSION', message: 'This file is missing a valid schemaVersion.' } }
  }
  if (typeof obj.payload !== 'object' || obj.payload === null || Array.isArray(obj.payload)) {
    return { valid: false, error: { code: 'MISSING_PAYLOAD', message: 'This file does not contain a fleet payload.' } }
  }
  return {
    valid: true,
    envelope: {
      schemaVersion: obj.schemaVersion,
      appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : 'Unknown',
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
      payload: obj.payload as FleetPersistencePayload,
    },
  }
}

/** The Preview's "Fleet Summary" — counted from the already fully
 * migrated + merged (would-be) hydrated state, never from the raw file,
 * so the Preview is a true inspection of what Replace would actually
 * produce, not a separate estimate. */
export interface FleetImportSummary {
  ships: number
  hangarItems: number
  installedComponents: number
  customBuilds: number
  reservations: number
}

export function buildFleetImportSummary(hydrated: { ships: Ship[]; hangarItems: HangarItem[]; installedLoadouts: InstalledLoadoutEntry[]; builds: Build[]; reservations: MissionReservation[] }): FleetImportSummary {
  return {
    ships: hydrated.ships.length,
    hangarItems: hydrated.hangarItems.length,
    installedComponents: hydrated.installedLoadouts.filter((e) => e.installedItem !== '—').length,
    customBuilds: hydrated.builds.filter((b) => b.kind !== 'FACTORY').length,
    reservations: hydrated.reservations.length,
  }
}

/**
 * Derived, never re-validated: compares each category's raw record count
 * (as it appeared in the untrusted file) against how many of those the
 * existing validators inside `migrateFleetPersistedState` actually kept.
 * A shortfall is the same "malformed record dropped" signal the
 * validators already log to the console during a normal reload — this
 * just also surfaces it to the Commander in the Preview, without
 * inspecting or re-checking a single field itself.
 */
export function computeFleetImportWarnings(rawPayload: unknown, migratedCounts: { fleetAssets: number; reservations: number; customBuilds: number; customBuildHardpoints: number; quarantinedAssignments: number; seedAssetOverrideKeys: number }): string[] {
  const warnings: string[] = []
  const raw = typeof rawPayload === 'object' && rawPayload !== null ? (rawPayload as Record<string, unknown>) : {}

  const rawArrayLength = (key: string): number => (Array.isArray(raw[key]) ? (raw[key] as unknown[]).length : 0)
  const rawObjectKeyCount = (key: string): number => (raw[key] && typeof raw[key] === 'object' && !Array.isArray(raw[key]) ? Object.keys(raw[key] as object).length : 0)

  const checks: Array<{ label: string; rawCount: number; keptCount: number }> = [
    { label: 'Fleet Asset', rawCount: rawArrayLength('fleetAssets'), keptCount: migratedCounts.fleetAssets },
    { label: 'Reservation', rawCount: rawArrayLength('reservations'), keptCount: migratedCounts.reservations },
    { label: 'Custom Build', rawCount: rawArrayLength('customBuilds'), keptCount: migratedCounts.customBuilds },
    { label: 'Custom Build Hardpoint', rawCount: rawArrayLength('customBuildHardpoints'), keptCount: migratedCounts.customBuildHardpoints },
    { label: 'Quarantined Assignment', rawCount: rawArrayLength('quarantinedAssignments'), keptCount: migratedCounts.quarantinedAssignments },
    { label: 'Seed Asset Override', rawCount: rawObjectKeyCount('seedAssetOverrides'), keptCount: migratedCounts.seedAssetOverrideKeys },
  ]
  for (const { label, rawCount, keptCount } of checks) {
    if (keptCount < rawCount) {
      const dropped = rawCount - keptCount
      warnings.push(`${dropped} ${label} record${dropped === 1 ? '' : 's'} could not be validated and ${dropped === 1 ? 'was' : 'were'} skipped.`)
    }
  }
  return warnings
}
