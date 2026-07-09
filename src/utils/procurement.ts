import type { Ship, Build, Hardpoint } from '../types'

export interface ProcurementLine {
  itemName: string
  type: string
  size: string
  qtyNeeded: number
  neededBy: string[]
}

/**
 * Aggregates fleet-wide demand for components across every Build's
 * hardpoints (not just the currently active one), so the Procurement List
 * reflects everything the fleet needs, not just what's on screen elsewhere.
 * Decision Support > Information Display: this is "what should I go get",
 * not just "what's missing on this one ship".
 */
export function buildProcurementList(hardpoints: Hardpoint[], builds: Build[], ships: Ship[]): ProcurementLine[] {
  const groups = new Map<string, ProcurementLine>()

  for (const hp of hardpoints) {
    if (hp.status === 'OK') continue
    if (!hp.targetItem || hp.targetItem === '—') continue

    const build = builds.find((b) => b.id === hp.buildId)
    const ship = build ? ships.find((s) => s.id === build.shipId) : undefined
    const label = ship && build ? `${ship.name} — ${build.name}` : undefined

    const existing = groups.get(hp.targetItem)
    if (existing) {
      existing.qtyNeeded += 1
      if (label && !existing.neededBy.includes(label)) existing.neededBy.push(label)
    } else {
      groups.set(hp.targetItem, {
        itemName: hp.targetItem,
        type: hp.type,
        size: hp.size,
        qtyNeeded: 1,
        neededBy: label ? [label] : [],
      })
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.qtyNeeded - a.qtyNeeded)
}
