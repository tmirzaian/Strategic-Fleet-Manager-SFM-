/**
 * SW-010A (Objective 5) — Diagnostics.
 *
 * Aggregates per-ship Canonical Configurable Topology results into one
 * report proving the pipeline actually did what it claims: slots
 * discovered, swap groups resolved, merge completed, unresolved
 * references reported, duplicate groups detected. Development-only —
 * never consumed by runtime UI (Objective 4: "no UI consumption yet"),
 * mirroring `classificationDiagnostics.ts`'s exact "generation-time-only,
 * printed and written to a gitignored file" contract.
 */
import type { CanonicalConfigurableTopology } from './types'

export interface ConfigurableSlotDiagnosticsReport {
  shipsProcessed: number
  configurableSlotsDiscovered: number
  swapGroupsResolved: number
  slotsUnresolved: number
  duplicatePortNamesDetected: number
  perShip: {
    shipEntityClass: string
    slotCount: number
    resolvedCount: number
    unresolvedCount: number
  }[]
}

export function buildConfigurableSlotDiagnosticsReport(topologies: CanonicalConfigurableTopology[]): ConfigurableSlotDiagnosticsReport {
  let configurableSlotsDiscovered = 0
  let swapGroupsResolved = 0
  let slotsUnresolved = 0
  let duplicatePortNamesDetected = 0
  const perShip: ConfigurableSlotDiagnosticsReport['perShip'] = []

  for (const topology of topologies) {
    configurableSlotsDiscovered += topology.configurableSlots.length
    const resolvedCount = topology.configurableSlots.filter((s) => s.confidence !== 'unresolved').length
    const unresolvedCount = topology.configurableSlots.length - resolvedCount
    swapGroupsResolved += resolvedCount
    slotsUnresolved += unresolvedCount
    duplicatePortNamesDetected += topology.diagnostics.filter((d) => d.code === 'configuration-duplicate-port-name').length
    perShip.push({ shipEntityClass: topology.shipEntityClass, slotCount: topology.configurableSlots.length, resolvedCount, unresolvedCount })
  }

  return {
    shipsProcessed: topologies.length,
    configurableSlotsDiscovered,
    swapGroupsResolved,
    slotsUnresolved,
    duplicatePortNamesDetected,
    perShip,
  }
}

export function formatConfigurableSlotDiagnosticsSummary(report: ConfigurableSlotDiagnosticsReport): string {
  const lines = [
    'Configurable Slot diagnostics:',
    `  ships processed: ${report.shipsProcessed}`,
    `  configurable slots discovered: ${report.configurableSlotsDiscovered}`,
    `  swap groups resolved (confidence != unresolved): ${report.swapGroupsResolved}`,
    `  slots unresolved: ${report.slotsUnresolved}`,
    `  duplicate port names detected: ${report.duplicatePortNamesDetected}`,
    '  per ship:',
    ...report.perShip.map((s) => `    ${s.shipEntityClass}: ${s.slotCount} slot(s), ${s.resolvedCount} resolved, ${s.unresolvedCount} unresolved`),
  ]
  return lines.join('\n')
}
