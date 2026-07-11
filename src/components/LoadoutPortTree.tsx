import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import Badge from './Badge'
import { flattenPortTree, derivePortLogistics, derivePortValidation, type PortTreeNode } from '../utils/portTree'
import type { HangarItem, InstalledLoadoutEntry, MissionReservation } from '../types'

function logisticsTone(state: string) {
  if (state === 'Installed') return 'success' as const
  if (state === 'Reserved') return 'cyan' as const
  if (state === 'Unreserved') return 'warning' as const
  if (state === 'Missing') return 'danger' as const
  return 'muted' as const
}

function validationTone(state: string) {
  if (state === 'OK') return 'success' as const
  if (state === 'Invalid Target') return 'invalid' as const
  return 'warning' as const
}

/**
 * LOADOUT & PORT TREE (Alpha 2.5C, Part 4-7) — the single authoritative
 * table for one Fleet Asset's physical configuration. Replaces the old
 * split "summary table" + separate "expanded port view", which could
 * disagree with each other. Every top-level normalized port is always
 * visible; nested children (gimbals, turret weapons, mining heads,
 * missile types) expand inline, never behind separate navigation.
 *
 * Purely generic — reads whatever tree `buildPortTree()` produced for the
 * given ship's hardpoints. No per-ship branching exists here.
 */
export default function LoadoutPortTree({
  tree,
  reservations,
  hangarItems,
  installedLoadouts,
}: {
  tree: PortTreeNode[]
  reservations: MissionReservation[]
  hangarItems: HangarItem[]
  installedLoadouts: InstalledLoadoutEntry[]
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(flattenPortTree(tree).map((n) => n.hardpoint.id)))
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  function renderRows(nodes: PortTreeNode[], depth: number): ReactNode[] {
    return nodes.flatMap((node) => {
      const hp = node.hardpoint
      const hasChildren = node.children.length > 0
      const isExpanded = expanded.has(hp.id)
      const logistics = derivePortLogistics(hp, reservations, hangarItems, installedLoadouts)
      const validation = derivePortValidation(hp)

      const rowEl = (
        <tr key={hp.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
          <td className="px-4 py-2.5 text-white font-medium whitespace-nowrap">
            <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-1.5">
              {hasChildren ? (
                <button onClick={() => toggle(hp.id)} className="text-muted hover:text-cyan transition-colors shrink-0" aria-label={isExpanded ? 'Collapse row' : 'Expand row'}>
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : (
                <span className="w-[13px] shrink-0" />
              )}
              {hp.slotLabel}
            </div>
          </td>
          <td className="px-4 py-2.5 text-muted whitespace-nowrap">{hp.size} {hp.type}</td>
          <td className="px-4 py-2.5 text-muted/70">{hp.factoryItem}</td>
          <td className="px-4 py-2.5 text-muted">{hp.installedItem}</td>
          <td className="px-4 py-2.5 text-cyan/90">{hp.targetItem}</td>
          <td className="px-4 py-2.5">
            <Badge tone={logisticsTone(logistics)}>{logistics}</Badge>
          </td>
          <td className="px-4 py-2.5">
            <Badge tone={validationTone(validation)}>{validation}</Badge>
          </td>
        </tr>
      )

      if (hasChildren && isExpanded) {
        return [rowEl, ...renderRows(node.children, depth + 1)]
      }
      return [rowEl]
    })
  }

  return (
    <div className="panel overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-display font-semibold text-white">Loadout &amp; Port Tree</h3>
          <p className="text-xs text-muted mt-1">Every physical port on this ship. Expand a row with children to see mounts, turrets, racks, and their contents.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-3 py-1.5 transition-colors">
            <Maximize2 size={12} /> Expand All
          </button>
          <button onClick={collapseAll} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-3 py-1.5 transition-colors">
            <Minimize2 size={12} /> Collapse All
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel z-10">
            <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
              <th className="px-4 py-3 font-medium">Port / Position</th>
              <th className="px-4 py-3 font-medium">Size / Type</th>
              <th className="px-4 py-3 font-medium">Factory</th>
              <th className="px-4 py-3 font-medium">Installed</th>
              <th className="px-4 py-3 font-medium">Target Loadout</th>
              <th className="px-4 py-3 font-medium">Logistics</th>
              <th className="px-4 py-3 font-medium">Validation</th>
            </tr>
          </thead>
          <tbody>{renderRows(tree, 0)}</tbody>
        </table>
      </div>
    </div>
  )
}
