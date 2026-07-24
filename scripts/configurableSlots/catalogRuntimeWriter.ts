import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FleetSweepResult } from './fleetSweep'
import {
  CONFIGURABLE_SLOTS_RUNTIME_FILENAME,
  CONFIGURABLE_SLOTS_RUNTIME_SCHEMA_VERSION,
  type ConfigurableSlotRuntimeRecord,
  type ConfigurableSlotsRuntimeFile,
} from './catalogRuntimeSchema'

/**
 * SW-011A — derives the small, committed runtime catalog from a live
 * `FleetSweepResult` (the same sweep SW-010B's certification report is
 * built from). Only Category A/B/C slots are included — Category D
 * (rejected false positives) and unclassified/unresolved slots (ordinary,
 * non-configurable ports — the overwhelming majority) never reach the
 * browser at all. See `catalogRuntimeSchema.ts`'s own doc comment for why.
 */
export function deriveConfigurableSlotsRuntimeCatalog(sweep: FleetSweepResult, gameVersion: string, generatedAt: string): ConfigurableSlotsRuntimeFile {
  const ships: Record<string, ConfigurableSlotRuntimeRecord[]> = {}

  for (const shipResult of sweep.ships) {
    const records: ConfigurableSlotRuntimeRecord[] = []
    for (const slot of shipResult.topology.configurableSlots) {
      const row = shipResult.rows.find((r) => r.portName === slot.portName && r.swapGroupId === slot.swapGroupId)
      const category = row?.category ?? null
      if (category !== 'A-confirmed' && category !== 'B-newly-discovered' && category !== 'C-review-required') continue

      records.push({
        portName: slot.portName,
        parentPortName: slot.parentPortName,
        defaultComponentEntityClass: slot.defaultComponentEntityClass,
        swapGroupId: slot.swapGroupId,
        eligibleComponentCount: slot.eligibleComponents.length,
        eligibleComponents: slot.eligibleComponents,
        confidence: slot.confidence,
        sourceAuthority: slot.sourceAuthority,
        category,
        diagnostics: slot.diagnostics.map((d) => ({ message: d.message, severity: d.severity })),
      })
    }
    if (records.length > 0) ships[shipResult.entityClass] = records
  }

  return {
    schemaVersion: CONFIGURABLE_SLOTS_RUNTIME_SCHEMA_VERSION,
    source: { gameVersion, generatedAt },
    ships,
  }
}

/** Writes the derived runtime catalog to `<outputDir>/configurable-slots.runtime.json` and nothing else. */
export function writeConfigurableSlotsRuntimeFile(outputDir: string, catalog: ConfigurableSlotsRuntimeFile): string {
  const path = join(outputDir, CONFIGURABLE_SLOTS_RUNTIME_FILENAME)
  writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n', 'utf-8')
  return path
}
