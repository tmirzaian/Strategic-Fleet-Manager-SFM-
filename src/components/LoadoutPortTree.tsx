import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Maximize2, Minimize2, Trash2, X } from 'lucide-react'
import Badge from './Badge'
import { derivePortLogistics, derivePortValidation, type PortTreeNode } from '../utils/portTree'
import { groupPortTree, flattenDisplayTree, displayNodeIds, type PortTreeDisplayNode } from '../utils/portTreeGrouping'
import { withMissileRackAggregation, makeMissileAggregateRow, type DisplayHardpoint } from '../utils/missileRackAggregation'
import type { HangarItem, InstalledLoadoutEntry, MissionReservation } from '../types'
import ComponentAssignmentLabel from './ComponentAssignmentLabel'
import { formatHardpointLabel } from '../utils/hardpointLabelPresentation'
import { componentCategoryIcon } from '../utils/componentCategoryIcon'

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
  onRemoveComponent,
}: {
  tree: PortTreeNode[]
  reservations: MissionReservation[]
  hangarItems: HangarItem[]
  installedLoadouts: InstalledLoadoutEntry[]
  /** EWO-030 (Task 7) — when provided, every installed, non-structural row
   * gets a "Remove" action opening the uninstall workflow (Remove ->
   * optional Return to Hangar -> Save). Omitted entirely by read-only/
   * dev-inspection callers (e.g. ImportedShipDetail) that have no real
   * Build to mutate — the Actions column itself is only rendered when
   * this is provided, so those callers' table is unchanged. */
  onRemoveComponent?: (slotLabel: string, returnToHangar: boolean) => { matched: boolean; itemName?: string }
}) {
  const displayTree = groupPortTree(withMissileRackAggregation<DisplayHardpoint>(tree, (h) => h.targetItem, makeMissileAggregateRow))
  // EWO-037 (Task 1) — first-run certification repeatedly read an
  // all-collapsed Ship Detail as "no ship data exists" until Expand All was
  // clicked. Seeding the initial expanded state with the Core Components
  // category (present for virtually every real ship — Power Plant at
  // minimum; renamed from "Core Systems" by SW-007A) gives the page
  // visible content on first paint without changing the expand/collapse
  // model itself: this only affects the very first render's starting Set,
  // never subsequent interaction.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const coreComponents = displayTree.find((node) => node.kind === 'group' && node.label === 'Core Components')
    return coreComponents ? new Set([coreComponents.id]) : new Set()
  })
  const [removeTarget, setRemoveTarget] = useState<{ slotLabel: string; itemLabel: string } | null>(null)
  const [returnToHangar, setReturnToHangar] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const hasActions = Boolean(onRemoveComponent)

  // FTB-001A (Workstream B) — expanding or collapsing a row now toggles
  // its ENTIRE descendant subtree at once (displayNodeIds), not just its
  // immediate children — a Commander expanding "Manned Turrets" sees every
  // turret mount, weapon slot, and nested PDC/mining-module child in one
  // click, and collapsing it hides all of them again. Each row still
  // toggles only its own subtree, so independently expanding/collapsing a
  // specific nested row afterward keeps working exactly as before.
  function toggle(node: PortTreeDisplayNode<DisplayHardpoint>) {
    const ids = displayNodeIds(node)
    setExpanded((prev) => {
      const next = new Set(prev)
      const currentlyExpanded = prev.has(node.id)
      for (const id of ids) {
        if (currentlyExpanded) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(flattenDisplayTree(displayTree).map((n) => n.id)))
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  // EWO-019B/EWO-020/FTB-001A: a "group" display node is a synthetic
  // header (e.g. "Weapons", "Manned Turrets", "Point Defense Cannons")
  // wrapping otherwise-independent sibling ports — same row shape and
  // expand/collapse behavior as a real parent port, but no assignment/
  // logistics/validation data of its own to show. Uses the table's own
  // base typeface (no `font-display` — Task 11: a competing display font
  // read as distracting; weight/case/spacing/color differentiate a
  // header row instead, matching this table's own existing <thead>
  // treatment rather than introducing a second design language). Handles
  // BOTH 'group' and 'port' kinds uniformly at every depth, since
  // `children` is now always a fully processed `PortTreeDisplayNode[]`.
  function renderRows(nodes: PortTreeDisplayNode<DisplayHardpoint>[], depth: number): ReactNode[] {
    return nodes.flatMap((node) => {
      const hasChildren = node.children.length > 0
      const isExpanded = expanded.has(node.id)

      if (node.kind === 'group') {
        const headerEl = (
          <tr key={node.id} className="border-b border-white/5 last:border-0 bg-white/[0.015] hover:bg-white/[0.03]">
            <td className="px-4 py-2.5 text-cyan/80 font-semibold uppercase tracking-wide text-xs whitespace-nowrap">
              <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-1.5">
                <button onClick={() => toggle(node)} className="text-muted hover:text-cyan transition-colors shrink-0" aria-label={isExpanded ? 'Collapse group' : 'Expand group'}>
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                {node.label}
              </div>
            </td>
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5" />
            {hasActions && <td className="px-4 py-2.5" />}
          </tr>
        )
        return isExpanded ? [headerEl, ...renderRows(node.children, depth + 1)] : [headerEl]
      }

      const hp = node.node.hardpoint

      // EWO-020 (Task 4): a structural assembly row (a mount/turret
      // preserved only to explain hierarchy) never had a real assignment
      // to validate or a logistics state to track — showing "OK"/"Not
      // Required" would misrepresent it as a checked, empty configurable
      // port rather than what it actually is: physical structure with no
      // component of its own.
      const logistics = hp.isStructural ? null : derivePortLogistics(hp, reservations, hangarItems, installedLoadouts)
      const validation = hp.isStructural ? null : derivePortValidation(hp)
      const CategoryIcon = componentCategoryIcon(hp)

      const rowEl = (
        <tr key={hp.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
          <td className={`px-4 py-2.5 whitespace-nowrap ${hp.isStructural ? 'text-white/80 font-semibold uppercase tracking-wide text-xs' : 'text-white font-medium'}`}>
            <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-1.5">
              {hasChildren ? (
                <button onClick={() => toggle(node)} className="text-muted hover:text-cyan transition-colors shrink-0" aria-label={isExpanded ? 'Collapse row' : 'Expand row'}>
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : (
                <span className="w-[13px] shrink-0" />
              )}
              <CategoryIcon size={13} className="text-muted/50 shrink-0" aria-hidden="true" />
              {formatHardpointLabel(hp.slotLabel)}
              {hp.missileAggregate && (
                <Badge tone="cyan">×{hp.missileAggregate.quantity}</Badge>
              )}
              {hp.missileAggregate?.inconsistent && (
                <span title={hp.invalidMessage}>
                  <Badge tone="invalid">Inconsistent — Select Missile</Badge>
                </span>
              )}
              {hp.missileAggregate?.countMismatch && (
                <span title={`Canonical capacity is ${hp.missileAggregate.quantity}, but ${hp.missileAggregate.childSlotLabels.length} slot(s) are materialized — reported, not auto-resolved.`}>
                  <Badge tone="warning">Count Mismatch</Badge>
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-2.5 text-muted whitespace-nowrap">{hp.size} {hp.type}</td>
          <td className="px-4 py-2.5 text-muted/70">{hp.isStructural ? <span className="text-muted/50">—</span> : <ComponentAssignmentLabel value={hp.factoryItem} />}</td>
          <td className="px-4 py-2.5 text-muted">{hp.isStructural ? <span className="text-muted/50">—</span> : <ComponentAssignmentLabel value={hp.installedItem} />}</td>
          <td className="px-4 py-2.5 text-cyan/90">{hp.isStructural ? <span className="text-muted/50">—</span> : <ComponentAssignmentLabel value={hp.targetItem} />}</td>
          <td className="px-4 py-2.5">{logistics && <Badge tone={logisticsTone(logistics)}>{logistics}</Badge>}</td>
          <td className="px-4 py-2.5">{validation && <Badge tone={validationTone(validation)}>{validation}</Badge>}</td>
          {hasActions && (
            <td className="px-4 py-2.5 text-right whitespace-nowrap">
              {!hp.isStructural && !hp.missileAggregate && hp.installedItem && hp.installedItem !== '—' && (
                <button
                  onClick={() => {
                    setRemoveTarget({ slotLabel: hp.slotLabel, itemLabel: hp.installedItem })
                    setReturnToHangar(false)
                    setRemoveError(null)
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-danger transition-colors"
                  title="Remove Installed Component"
                >
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </td>
          )}
        </tr>
      )

      return hasChildren && isExpanded ? [rowEl, ...renderRows(node.children, depth + 1)] : [rowEl]
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
              <th className="px-4 py-3 font-medium">VAL</th>
              {hasActions && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>{renderRows(displayTree, 0)}</tbody>
        </table>
      </div>

      {/* Remove Installed Component modal — EWO-030 (Task 7): Remove ->
          optional Return Component To Hangar -> Save. The official
          uninstall workflow, replacing Quick Update's now-hidden Remove
          Component tab. */}
      {removeTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setRemoveTarget(null)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-white">Remove "{removeTarget.itemLabel}"?</h3>
              <button onClick={() => setRemoveTarget(null)} className="text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted mb-4">Removing from {formatHardpointLabel(removeTarget.slotLabel)}. This clears the Installed assignment for the active Loadout.</p>
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer mb-4">
              <input type="checkbox" checked={returnToHangar} onChange={(e) => setReturnToHangar(e.target.checked)} className="accent-cyan" />
              Return removed component to Hangar
            </label>
            {removeError && <p className="text-xs text-danger mb-3">{removeError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setRemoveTarget(null)} className="flex-1 border border-white/15 text-white text-sm py-2 rounded-lg hover:border-white/35 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  const result = onRemoveComponent?.(removeTarget.slotLabel, returnToHangar)
                  if (result?.matched) {
                    setRemoveTarget(null)
                  } else {
                    setRemoveError('Could not remove this component.')
                  }
                }}
                className="flex-1 bg-danger text-white font-semibold text-sm py-2 rounded-lg hover:bg-danger/90 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
