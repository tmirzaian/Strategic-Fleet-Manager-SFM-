import { useMemo, useState, Fragment, type ReactNode } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Rocket, Save, CheckCircle2, ChevronDown, ChevronRight, AlertOctagon, Layers, Trash2, Library, Maximize2, Minimize2 } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { validateTargetCompatibility } from '../data/componentCatalog'
import { findItemCatalog } from '../data/seed'
import Badge, { statusTone } from '../components/Badge'
import { buildPortTree, flattenPortTree, type PortTreeNode } from '../utils/portTree'
import type { Hardpoint } from '../types'

type StartingState = 'FACTORY' | 'INSTALLED' | 'EMPTY' | 'EXISTING'

const startingStateLabels: Record<StartingState, string> = {
  FACTORY: 'Factory',
  INSTALLED: 'Current Installed Loadout',
  EMPTY: 'Blank / Empty',
  EXISTING: 'Clone Existing Loadout',
}

/**
 * Loadout Manager (Alpha 2.4 — renamed from "Mission Composer", Part 3).
 * The primary configuration page: manage ship-specific Loadouts, full
 * stop — not "Missions", "Templates", "Configurations" and "Builds" as
 * four different words for overlapping ideas. One vocabulary: Loadout.
 * Under the hood this still saves a `Build` record (kind: 'MISSION') via
 * the same store action from Alpha 2.2/2.3 — Part 3 asks for a UX/naming
 * pass, not an architecture change.
 *
 * Presets (formerly "Quartermaster Template") are optional starting
 * points, never a required workflow (Part 3/4) — the standalone Build
 * Manager page is retired; its two sections (Presets, Existing Loadouts)
 * now live here instead of a separate destination.
 */
export default function MissionComposer() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const quartermasterTemplates = useFleetStore((s) => s.quartermasterTemplates)
  const saveMissionConfiguration = useFleetStore((s) => s.saveMissionConfiguration)
  const deleteBuild = useFleetStore((s) => s.deleteBuild)
  const setActiveBuild = useFleetStore((s) => s.setActiveBuild)

  const [shipId, setShipId] = useState(searchParams.get('shipId') ?? ships[0]?.id ?? '')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [templateId, setTemplateId] = useState(searchParams.get('template') ?? '')
  const [startingState, setStartingState] = useState<StartingState>('FACTORY')
  const [existingBuildId, setExistingBuildId] = useState('')
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)

  const ship = ships.find((s) => s.id === shipId)
  const shipBuilds = builds.filter((b) => b.shipId === shipId)
  const referenceBuildId = ship?.activeBuildId ?? shipBuilds[0]?.id
  const referenceRows = hardpoints.filter((h) => h.buildId === referenceBuildId)

  // Preview: same precedence saveMissionConfiguration applies — starting
  // state, then Preset, then explicit per-slot overrides — computed here
  // purely for display so the table always shows what will actually save.
  const previewRows = useMemo(() => {
    const template = quartermasterTemplates.find((t) => t.id === templateId)
    const existingRows = startingState === 'EXISTING' ? hardpoints.filter((h) => h.buildId === existingBuildId) : []

    return referenceRows.map((row) => {
      let target = row.factoryItem
      if (startingState === 'INSTALLED') target = row.installedItem
      else if (startingState === 'EMPTY') target = '—'
      else if (startingState === 'EXISTING') target = existingRows.find((r) => r.slotLabel === row.slotLabel)?.targetItem ?? row.targetItem

      const fromTemplate = template?.targetAssignments.find((a) => a.slotLabel === row.slotLabel)
      if (fromTemplate) target = fromTemplate.targetItem

      if (row.slotLabel in overrides) target = overrides[row.slotLabel]

      const compatibility = target && target !== '—' ? validateTargetCompatibility(target, row.type, row.size) : { valid: true }
      return { ...row, previewTarget: target, compatible: compatibility.valid, incompatibleMessage: 'message' in compatibility ? compatibility.message : undefined }
    })
  }, [referenceRows, startingState, existingBuildId, templateId, overrides, quartermasterTemplates, hardpoints])

  type PreviewRow = (typeof previewRows)[number]

  // Shared Port Tree (Mission M-011): the exact same buildPortTree()
  // utility Ship Detail's LoadoutPortTree uses, over the exact same
  // Hardpoint rows (previewRows spread the full Hardpoint shape plus
  // preview-only fields) — so a mount/turret/rack's children here are
  // identically structured and identically ID'd to what Ship Detail
  // shows for the same ship+build. Unlike Ship Detail (a read-only
  // inspection view, collapsed by default), every row here starts
  // expanded — this is an editing surface, and every configurable port
  // must be reachable without an extra click before a target can be set.
  const previewTree = useMemo(() => buildPortTree(previewRows), [previewRows])

  function isCollapsed(id: string) {
    return collapsed.has(id)
  }
  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function expandAll() {
    setCollapsed(new Set())
  }
  function collapseAll() {
    setCollapsed(new Set(flattenPortTree(previewTree).filter((n) => n.children.length > 0).map((n) => n.hardpoint.id)))
  }

  function handleSave(setActive: boolean) {
    if (!ship) {
      setResult({ success: false, message: 'Select a Fleet Asset first.' })
      return
    }
    const outcome = saveMissionConfiguration({
      shipId: ship.id,
      name,
      startingState,
      existingBuildId: startingState === 'EXISTING' ? existingBuildId : undefined,
      quartermasterTemplateId: templateId || undefined,
      targetOverrides: overrides,
      setActive,
    })
    if (outcome.success) {
      navigate(`/ship/${ship.id}`)
    } else {
      setResult({ success: false, message: outcome.message ?? 'Could not save this Loadout.' })
    }
  }

  const shipName = (id: string) => ships.find((s) => s.id === id)?.name ?? 'Unknown Ship'

  // Recursive, nested render of the shared Port Tree — depth-indented
  // exactly like Ship Detail's LoadoutPortTree, but every row remains
  // directly editable (Target input) since this is the editing surface,
  // not a read-only inspection view. A port with children still shows
  // its own row (e.g. a turret mount's own Target/Status), immediately
  // followed by its children when not collapsed — parent selection never
  // hides or removes its child rows; a child mount/gimbal/rack always
  // stays visible and independently editable alongside its parent.
  function renderTargetRows(nodes: PortTreeNode[], depth: number): ReactNode[] {
    return nodes.flatMap((node) => {
      const row = node.hardpoint as PreviewRow
      const hasChildren = node.children.length > 0
      const rowCollapsed = isCollapsed(row.id)

      const rowEl = (
        <Fragment key={row.id}>
          <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
            <td className="px-5 py-3 text-white font-medium whitespace-nowrap">
              <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-1">
                {hasChildren ? (
                  <button onClick={() => toggleCollapsed(row.id)} className="text-muted hover:text-cyan transition-colors shrink-0" aria-label={rowCollapsed ? 'Expand row' : 'Collapse row'}>
                    {rowCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                ) : (
                  <span className="w-[13px] shrink-0" />
                )}
                <button onClick={() => setExpandedSlot(expandedSlot === row.id ? null : row.id)} className="flex items-center gap-1 hover:text-cyan transition-colors">
                  {row.slotLabel}
                </button>
              </div>
            </td>
            <td className="px-5 py-3 text-muted whitespace-nowrap">{row.size} {row.type}</td>
            <td className="px-5 py-3 text-muted/70">{row.factoryItem}</td>
            <td className="px-5 py-3 text-muted">{row.installedItem}</td>
            <td className="px-5 py-3">
              <input
                list={`catalog-${row.id}`}
                value={row.previewTarget}
                onChange={(e) => setOverrides((prev) => ({ ...prev, [row.slotLabel]: e.target.value }))}
                className="w-full min-w-[9rem]"
              />
              <datalist id={`catalog-${row.id}`}>
                {findItemCatalog.map((c) => (
                  <option key={c.item} value={c.item} />
                ))}
              </datalist>
            </td>
            <td className="px-5 py-3">
              {row.compatible ? (
                <Badge tone={statusTone(row.previewTarget === '—' || !row.previewTarget ? 'OK' : row.previewTarget === row.installedItem ? 'OK' : 'Upgrade Available')}>
                  {row.previewTarget === '—' || !row.previewTarget ? 'Not Required' : 'Ready to Save'}
                </Badge>
              ) : (
                <Badge tone="invalid">Incompatible</Badge>
              )}
            </td>
          </tr>
          {expandedSlot === row.id && (
            <tr className="bg-black/20">
              <td colSpan={6} className="px-5 py-3">
                <div className="flex items-start gap-2 text-xs text-muted">
                  <Layers size={13} className="mt-0.5 shrink-0 text-cyan/70" />
                  <div>
                    <p className="text-white/80">Port &amp; Mount Detail</p>
                    <p className="mt-1">
                      internalName: <span className="font-mono text-muted/80">{row.slotLabel}</span> · type: {row.type} · size: {row.size} · port id: <span className="font-mono text-muted/80">{row.id}</span>
                    </p>
                    {!row.compatible && row.incompatibleMessage && <p className="mt-1 text-danger">{row.incompatibleMessage}</p>}
                  </div>
                </div>
              </td>
            </tr>
          )}
        </Fragment>
      )

      if (hasChildren && !rowCollapsed) {
        return [rowEl, ...renderTargetRows(node.children, depth + 1)]
      }
      return [rowEl]
    })
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Loadout Manager</p>
        <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">How do I configure this ship?</h1>
        <p className="text-sm text-muted mt-1">Edit every target equipment decision for one exact ship, then save it — optionally as the Active Loadout.</p>
      </div>

      <div className="panel p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Ship</label>
            <select
              value={shipId}
              onChange={(e) => {
                setShipId(e.target.value)
                setOverrides({})
                setExistingBuildId('')
              }}
              className="w-full"
            >
              {ships.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} [{s.ownership}]
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Loadout Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deep Salvage Run" className="w-full" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Category (optional)</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Combat, Industrial, Support" className="w-full" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Preset (optional)</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full">
              <option value="">No preset — edit manually</option>
              {quartermasterTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-widest text-muted block mb-2">Start From</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(startingStateLabels) as StartingState[]).map((s) => (
              <button
                key={s}
                onClick={() => setStartingState(s)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  startingState === s ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                }`}
              >
                {startingStateLabels[s]}
              </button>
            ))}
          </div>
        </div>

        {startingState === 'EXISTING' && (
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Copy targets from</label>
            <select value={existingBuildId} onChange={(e) => setExistingBuildId(e.target.value)} className="w-full sm:w-1/2">
              <option value="">Select a Loadout…</option>
              {shipBuilds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display font-semibold text-white">Target Equipment</h3>
            <p className="text-xs text-muted mt-1">
              Every configurable port on this ship, nested exactly as Ship Detail shows it — only choices compatible with each port's size/type are treated as valid, an incompatible entry is
              flagged, never silently accepted.
            </p>
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
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                <th className="px-5 py-3 font-medium">Port</th>
                <th className="px-5 py-3 font-medium">Size / Type</th>
                <th className="px-5 py-3 font-medium">Factory</th>
                <th className="px-5 py-3 font-medium">Installed</th>
                <th className="px-5 py-3 font-medium">Target</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>{renderTargetRows(previewTree, 0)}</tbody>
          </table>
        </div>
      </div>

      {result && !result.success && (
        <div className="flex items-center gap-2 bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
          <AlertOctagon size={16} /> {result.message}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleSave(false)}
          className="inline-flex items-center gap-2 border border-white/15 text-white font-medium text-sm px-4 py-2 rounded-lg hover:border-white/35 transition-colors"
        >
          <Save size={15} /> Save Loadout
        </button>
        <button
          onClick={() => handleSave(true)}
          className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
        >
          <CheckCircle2 size={15} /> Save &amp; Set as Active Loadout
        </button>
        {ship && (
          <Link to={`/ship/${ship.id}`} className="inline-flex items-center gap-2 text-muted text-sm px-4 py-2 hover:text-white transition-colors">
            <Rocket size={15} /> Back to Ship Detail
          </Link>
        )}
      </div>

      <div className="scanline-divider" />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Library size={16} className="text-cyan" />
          <h2 className="font-display font-semibold text-white">Presets</h2>
        </div>
        <p className="text-xs text-muted mb-3">Optional reusable starting points — never a required step. Selecting one above seeds Target Equipment; it's never saved on its own.</p>
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                  <th className="px-5 py-3 font-medium">Preset Name</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quartermasterTemplates.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-white font-medium whitespace-nowrap">{entry.name}</td>
                    <td className="px-5 py-3">
                      <Badge tone="cyan">{entry.category ?? 'General'}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">{entry.description}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setTemplateId(entry.id)} className="text-xs font-medium text-cyan hover:underline">
                        Use as Starting Point
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-display font-semibold text-white mb-3">Existing Loadouts</h2>
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                  <th className="px-5 py-3 font-medium">Ship</th>
                  <th className="px-5 py-3 font-medium">Loadout</th>
                  <th className="px-5 py-3 font-medium">Kind</th>
                  <th className="px-5 py-3 font-medium">Active</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {builds
                  .filter((b) => b.kind !== 'FACTORY')
                  .map((build) => (
                    <tr key={build.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-white font-medium whitespace-nowrap">{shipName(build.shipId)}</td>
                      <td className="px-5 py-3 text-muted">{build.name}</td>
                      <td className="px-5 py-3 text-muted text-xs">{build.kind === 'MISSION' || build.kind === 'CUSTOM' ? 'Custom Loadout' : build.kind}</td>
                      <td className="px-5 py-3">
                        {build.isActive ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <button onClick={() => setActiveBuild(build.shipId, build.id)} className="text-xs text-cyan hover:underline">
                            Set Active
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => setDeleting({ id: build.id, name: build.name })} className="text-muted hover:text-danger transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {deleting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setDeleting(null)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-white">Delete "{deleting.name}"?</h3>
            <p className="text-sm text-muted mt-2">This removes the Loadout and any active reservations tied to it. This can't be undone.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setDeleting(null)} className="flex-1 border border-white/15 text-white text-sm py-2 rounded-lg hover:border-white/35 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteBuild(deleting.id)
                  setDeleting(null)
                }}
                className="flex-1 bg-danger text-white text-sm py-2 rounded-lg hover:bg-danger/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
