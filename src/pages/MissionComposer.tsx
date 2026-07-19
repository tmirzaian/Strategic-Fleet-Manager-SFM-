import { useEffect, useMemo, useState, Fragment, type ReactNode } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Rocket, Save, CheckCircle2, ChevronDown, ChevronRight, AlertOctagon, Layers, Trash2, Maximize2, Minimize2, Copy, ShipWheel } from 'lucide-react'
import { useFleetStore, type TargetOverrideValue } from '../store/useFleetStore'
import { validateTargetCompatibility, isComponentSelectableForPort, isPlayerSelectableRecord } from '../data/componentCatalog'
import { findItemCatalog as demoFindItemCatalog } from '../data/seed'
import { catalogComponentsByName, componentsByEntityClass, resolveComponentByName, CATEGORY_TO_PORT_TYPE, type CanonicalComponentRecord } from '../generated/componentCatalog'
import { shipFactoryTemplates } from '../data/shipDefinitions'
import { buildLoadoutEditorModel, assignmentsBySlotLabel, resolveShipDefinitionId } from '../utils/loadoutEditorModel'
import type { TargetComponentOption } from '../components/TargetComponentPicker'

/**
 * Mission M-012: the target-item autocomplete now draws from the full
 * authoritative component catalog, not just the 5-entry seed demo table —
 * "target-build selectors use the same component source as inventory and
 * current loadout workflows." The demo entries are kept first (existing,
 * already-tested behavior for the seed fleet) and never duplicated.
 *
 * EWO-STAB-004A (ADR-010, Assignment 9) — rebuilt from `componentsByEntityClass`
 * (entityClass-first, includes PDCTurret components `catalogComponentsByName`
 * still excludes) rather than that legacy, translated-category map. A
 * display name shared by two or more genuinely different real components
 * (`resolveComponentByName` returns `ambiguous` — e.g. `M2C "Swarm"`)
 * produces one option PER real entityClass, each carrying that
 * entityClass and a disambiguating `label`; an unambiguous name still
 * produces exactly one option, `item` alone, unchanged from before. Every
 * option's `item` stays the real catalog display name (never the
 * decorated label) — what gets committed to a Hardpoint's `targetItem` on
 * selection, and therefore what `saveMissionConfiguration` resolves
 * afterward, is completely unaffected by this list's own presentation.
 */
function categoryLabelFor(record: CanonicalComponentRecord): string {
  if (record.subtype === 'PDCTurret') return 'PDC Turret'
  return CATEGORY_TO_PORT_TYPE[record.category] ?? record.category
}

const catalogFindItemEntries: TargetComponentOption[] = []
{
  const displayNames = new Set(Array.from(componentsByEntityClass.values(), (r) => r.displayName))
  for (const name of displayNames) {
    const resolution = resolveComponentByName(name)
    const candidates = resolution.status === 'ambiguous' ? resolution.candidates : resolution.status === 'resolved' ? [resolution.record] : []
    const selectable = candidates.filter(isPlayerSelectableRecord)
    if (selectable.length === 0) continue
    if (selectable.length === 1) {
      const record = selectable[0]
      catalogFindItemEntries.push({ path: `${categoryLabelFor(record)} → ${name}`, item: name, entityClass: record.entityClass })
    } else {
      for (const record of selectable) {
        catalogFindItemEntries.push({
          path: `${categoryLabelFor(record)} → ${name}`,
          item: name,
          label: `${name} — ${categoryLabelFor(record)}, S${record.size}`,
          entityClass: record.entityClass,
        })
      }
    }
  }
  catalogFindItemEntries.sort((a, b) => (a.label ?? a.item).localeCompare(b.label ?? b.item))
}
const demoItemNames = new Set(demoFindItemCatalog.map((c) => c.item))
const findItemCatalog: TargetComponentOption[] = [...demoFindItemCatalog, ...catalogFindItemEntries.filter((c) => !demoItemNames.has(c.item))]
import Badge, { statusTone } from '../components/Badge'
import ComponentAssignmentLabel from '../components/ComponentAssignmentLabel'
import TargetComponentPicker from '../components/TargetComponentPicker'
import { buildPortTree } from '../utils/portTree'
import { groupPortTree, flattenDisplayTree, displayNodeIds, type PortTreeDisplayNode } from '../utils/portTreeGrouping'
import { withComponentOwnedChildSlots } from '../utils/componentOwnedSlots'
import { formatHardpointLabel } from '../utils/hardpointLabelPresentation'
import type { Hardpoint } from '../types'

type StartingState = 'FACTORY' | 'INSTALLED' | 'EMPTY' | 'EXISTING'

const startingStateLabels: Record<StartingState, string> = {
  FACTORY: 'Factory',
  INSTALLED: 'Current Installed Loadout',
  EMPTY: 'Blank / Empty',
  EXISTING: 'Copy an Existing Loadout',
}

/**
 * EWO-024 (Task 4) — "Commander cannot easily determine whether they are:
 * editing an existing loadout, saving changes, creating a new loadout, or
 * cloning a loadout." The root ambiguity: `startingState === 'EXISTING'`
 * previously did double duty as both "seed today's preview from this
 * build's targets" AND "save back into this exact build" — the same
 * control decided two different questions at once. WorkflowMode makes
 * "what am I doing" an explicit, primary choice, independent of "what do
 * I start editing from":
 *   - CREATE: always mints a new Loadout. "Start From" (Factory/
 *     Installed/Blank/Copy an Existing Loadout as a template) only seeds
 *     the initial preview — picking a template here never overwrites it.
 *   - EDIT: works on one specific existing Loadout, selected explicitly.
 *     Renaming is just editing the Name field, matching the mission's
 *     Task 4 note that a exact UI is left to Engineering — "Save
 *     Changes" persists the same build; "Save as New Loadout" (still
 *     available in this mode) branches the current edit into a new one
 *     without disturbing the original, covering Save/Save As/Clone/
 *     Rename with one consistent model rather than four separate ideas.
 */
type WorkflowMode = 'CREATE' | 'EDIT'

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
  const [searchParams] = useSearchParams()
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)
  const quartermasterTemplates = useFleetStore((s) => s.quartermasterTemplates)
  const saveMissionConfiguration = useFleetStore((s) => s.saveMissionConfiguration)
  const deleteBuild = useFleetStore((s) => s.deleteBuild)
  const setActiveBuild = useFleetStore((s) => s.setActiveBuild)

  // FTB-001A (Workstream D) — previously defaulted to `ships[0]?.id`
  // whenever the page opened with no explicit `?shipId=` navigation
  // target, silently editing whichever ship happened to be first in
  // store order. Ship-Selection State Policy: entering with no explicit
  // target is a blank selection; only an explicit `?shipId=` (a real
  // navigation target, e.g. from a specific ship's own action) may
  // preselect a ship.
  const [shipId, setShipId] = useState(searchParams.get('shipId') ?? '')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [templateId, setTemplateId] = useState(searchParams.get('template') ?? '')
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('CREATE')
  const [startingState, setStartingState] = useState<StartingState>('FACTORY')
  const [existingBuildId, setExistingBuildId] = useState('')
  // EWO-STAB-004B (ADR-010) — each override now carries the Commander's
  // actually-selected canonical entityClass alongside the display name,
  // not just the name text. Every write REPLACES the whole per-slot
  // value (never merges a new targetItem onto a stale targetEntityClass
  // from a prior selection) — see the picker's onChange below.
  const [overrides, setOverrides] = useState<Record<string, TargetOverrideValue>>({})
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)

  // EWO-026 (Task 2) — `shipId` above only reads the URL's `?shipId=` once,
  // at first mount. Navigating from `/loadout-manager?shipId=A` to
  // `/loadout-manager?shipId=B` is the SAME route (only the query string
  // differs), so React Router re-renders this exact component instance
  // rather than remounting it — the `useState` initializer never runs
  // again, and the Ship selector silently stayed on A. This kept the
  // Fleet Asset context out of sync with the URL any time a Commander
  // arrived at Loadout Manager for a different ship without a full
  // remount — exactly the "correct Ship selected... Fleet Asset context"
  // requirement this mission calls out. Mirrors the manual Ship dropdown's
  // own onChange reset below, so switching ships via URL and switching
  // ships by hand behave identically.
  // FTB-001A (Workstream D) — only re-syncs from the URL when the target
  // ship still genuinely exists. Without this guard, the URL's own
  // `?shipId=` (unchanged after a Commander merely removes the currently
  // selected ship — no navigation occurs) would immediately re-apply the
  // now-deleted id right back onto `shipId` the instant the cleanup effect
  // below clears it, fighting it in an update loop and leaving the
  // deleted ship's stale editing state on screen.
  const shipIdParam = searchParams.get('shipId')
  useEffect(() => {
    if (shipIdParam && shipIdParam !== shipId && ships.some((s) => s.id === shipIdParam)) {
      setShipId(shipIdParam)
      setOverrides({})
      setExistingBuildId('')
      setWorkflowMode('CREATE')
      setName('')
      setResult(null)
      setCollapsed(new Set())
      setExpandedSlot(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipIdParam, ships])

  // FTB-001A (Workstream D) — "Deleted or unavailable selected ship: clear
  // the selection and return to the empty state." A ship the Commander
  // was actively configuring can disappear out from under this page (e.g.
  // removed from the fleet in another tab) — silently continuing to show
  // its now-stale editing state would let a save target a ship that no
  // longer exists. Never applies while `shipId` is already blank.
  useEffect(() => {
    if (shipId && !ships.some((s) => s.id === shipId)) {
      setShipId('')
      setOverrides({})
      setExistingBuildId('')
      setWorkflowMode('CREATE')
      setName('')
      setResult(null)
      setCollapsed(new Set())
      setExpandedSlot(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipId, ships])

  const ship = ships.find((s) => s.id === shipId)
  const shipBuilds = builds.filter((b) => b.shipId === shipId)
  // EDIT mode only ever offers a Commander's own real Loadouts — the
  // auto-derived Factory build isn't something to "edit," only to start a
  // new one from (still available via CREATE mode's own Start From choice).
  const editableShipBuilds = shipBuilds.filter((b) => b.kind !== 'FACTORY')
  const referenceBuildId = ship?.activeBuildId ?? shipBuilds[0]?.id
  const referenceRows = hardpoints.filter((h) => h.buildId === referenceBuildId)
  // The one control that actually decides the preview baseline — EDIT mode
  // always baselines from the Loadout being edited, matching what
  // "editing" a specific existing record means; CREATE mode uses whatever
  // "Start From" choice the Commander made (Task 4's other axis).
  const effectiveStartingState: StartingState = workflowMode === 'EDIT' ? 'EXISTING' : startingState

  // EWO-025 — the canonical, authoritative port hierarchy for this exact
  // ship, straight from the ShipDefinition (the same source a fresh
  // Factory Loadout materializes from) — never from any Build's own
  // hardpoint rows. This is the ONE hierarchy CREATE and EDIT both render
  // (Design Authority Ruling 1/4); only the overlaid assignment VALUES
  // differ between them.
  const canonicalTemplate = useMemo(() => {
    const definitionId = resolveShipDefinitionId(shipId, fleetAssets)
    if (!definitionId) return []
    return shipFactoryTemplates[definitionId] ?? []
  }, [shipId, fleetAssets])

  // EWO-025 (Task 2/3) — the one shared editor-model builder, overlaying
  // the reference Build's own saved factory/installed/target values onto
  // the canonical template by stable slotLabel. `editorModel.rows` always
  // carries the correct category/parentage/structural/assemblyRole data
  // regardless of whether the reference Build itself ever recorded it.
  const editorModel = useMemo(
    () => buildLoadoutEditorModel(canonicalTemplate, assignmentsBySlotLabel(referenceRows)),
    [canonicalTemplate, referenceRows]
  )

  // EWO-025 (Task 4) — a saved assignment that no longer matches any
  // canonical port (the ship's own data changed shape since this Build
  // was saved) is never silently dropped without a trace, never crashes,
  // and never re-attaches to the wrong port — surfaced as a restrained
  // development warning only; expected to be empty for every current
  // fixture (see EWO-025 report).
  if (editorModel.orphanedSlotLabels.length > 0 && typeof console !== 'undefined') {
    console.warn(
      `[SFM] Loadout Manager: ${editorModel.orphanedSlotLabels.length} saved assignment(s) for "${ship?.name ?? shipId}" no longer match a canonical port and were not applied:`,
      editorModel.orphanedSlotLabels
    )
  }

  // Preview: same precedence saveMissionConfiguration applies — starting
  // state, then Preset, then explicit per-slot overrides — computed here
  // purely for display so the table always shows what will actually save.
  const previewRows = useMemo(() => {
    const template = quartermasterTemplates.find((t) => t.id === templateId)
    const existingAssignments = effectiveStartingState === 'EXISTING' ? assignmentsBySlotLabel(hardpoints.filter((h) => h.buildId === existingBuildId)) : null

    return editorModel.rows.map((row) => {
      let target = row.factoryItem
      // EWO-STAB-004B (ADR-010) — the target's own resolved entityClass,
      // tracked alongside the string through every one of the same
      // sources below, mirroring saveMissionConfiguration's own
      // baseTargetEntityClasses precedence so the preview never disagrees
      // with what will actually be saved.
      let targetEntityClass: string | undefined = row.factoryEntityClass
      if (effectiveStartingState === 'INSTALLED') {
        target = row.installedItem
        targetEntityClass = row.installedEntityClass
      } else if (effectiveStartingState === 'EMPTY') {
        target = '—'
        targetEntityClass = undefined
      } else if (effectiveStartingState === 'EXISTING') {
        const existing = existingAssignments?.get(row.slotLabel)
        target = existing?.targetItem ?? row.targetItem
        targetEntityClass = existing ? existing.targetEntityClass : row.targetEntityClass
      }

      const fromTemplate = template?.targetAssignments.find((a) => a.slotLabel === row.slotLabel)
      if (fromTemplate) {
        target = fromTemplate.targetItem
        // A Quartermaster Template assignment carries no entityClass of
        // its own (same as saveMissionConfiguration's own treatment) —
        // the preview's compatibility check falls back to name resolution
        // for it, same as before.
        targetEntityClass = undefined
      }

      const override = overrides[row.slotLabel]
      if (override) {
        target = override.targetItem
        targetEntityClass = override.targetEntityClass
      }

      // EWO-STAB-004A/004B (ADR-010) — `itemEntityClass` is trusted
      // whenever the current target string has a resolved entityClass
      // tracked alongside it (the row's own factory/installed/existing
      // value, or a picker override that supplied one) — never
      // re-derived from display-name text once a real identity is known.
      // `destinationFactoryEntityClass` is always this port's own factory
      // identity regardless of which candidate is being checked — it
      // drives PDC_TURRET capability.
      const compatibility =
        target && target !== '—'
          ? validateTargetCompatibility(target, row.type, row.size, {
              itemEntityClass: targetEntityClass,
              destinationFactoryEntityClass: row.factoryEntityClass,
            })
          : { valid: true }
      return { ...row, previewTarget: target, previewTargetEntityClass: targetEntityClass, compatible: compatibility.valid, incompatibleMessage: 'message' in compatibility ? compatibility.message : undefined }
    })
  }, [editorModel, effectiveStartingState, existingBuildId, templateId, overrides, quartermasterTemplates, hardpoints])

  type PreviewRow = (typeof previewRows)[number]

  // FTB-001A (Workstream C) — a synthetic "Module Slot N" row for whichever
  // component currently owns real child attachment ports (mining heads
  // today — see src/utils/componentOwnedSlots.ts). isStructural: true,
  // matching every other "physical structure with no component of its
  // own" row already in this tree — this app has no Mining Module catalog/
  // compatibility layer to target these slots against yet, so they are
  // presented, not made editable, exactly like a turret/mount shell.
  function makePreviewModuleSlotRow(host: PreviewRow, slotNumber: number): PreviewRow {
    return {
      ...host,
      id: `${host.id}-module-slot-${slotNumber}`,
      slotLabel: `${host.slotLabel} — Module Slot ${slotNumber}`,
      parentSlotLabel: host.slotLabel,
      isStructural: true,
      type: 'Mining Module',
      factoryItem: '—',
      installedItem: '—',
      targetItem: '—',
      previewTarget: '—',
      previewTargetEntityClass: undefined,
      compatible: true,
      incompatibleMessage: undefined,
      factoryEntityClass: undefined,
      installedEntityClass: undefined,
      targetEntityClass: undefined,
    }
  }

  // Shared Port Tree (Mission M-011): the exact same buildPortTree()
  // utility Ship Detail's LoadoutPortTree uses, over the exact same
  // Hardpoint rows (previewRows spread the full Hardpoint shape plus
  // preview-only fields) — so a mount/turret/rack's children here are
  // identically structured and identically ID'd to what Ship Detail
  // shows for the same ship+build. Unlike Ship Detail (a read-only
  // inspection view, collapsed by default), every row here starts
  // expanded — this is an editing surface, and every configurable port
  // must be reachable without an extra click before a target can be set.
  const previewTree = useMemo(() => buildPortTree(withComponentOwnedChildSlots(previewRows, makePreviewModuleSlotRow)), [previewRows])
  const previewDisplayTree = useMemo(() => groupPortTree(previewTree), [previewTree])

  // EWO-024 (Task 2) — the Target picker's suggestion list is narrowed to
  // components not positively known to be incompatible with each row's own
  // type/size (e.g. no S1 Coolers suggested inside an S2 Cooler port).
  // Cached per (type, size, factoryEntityClass) rather than per row, since
  // dozens of rows on a real ship commonly share the same port type/size
  // (many S2 Coolers, several S4 Weapons) — filtering the ~900-entry
  // catalog once per distinct combination, not once per row, keeps this
  // cheap even for a fully-expanded Corsair. Free-text entry and full
  // save-time compatibility validation are both unchanged — this only
  // narrows what's suggested.
  //
  // EWO-STAB-004A (ADR-010, Assignment 9) — `factoryEntityClass` (the
  // destination port's own PDC_TURRET-capability driver) is now part of
  // the cache key and threaded into the filter, and each option's own
  // `entityClass` (when known) is preferred over re-resolving `c.item` by
  // name — the same entityClass-first rule every other compatibility path
  // in this mission uses. This is what keeps a PDC turret assembly out of
  // an ordinary S2 weapon port's suggestions while still offering it for
  // a native PDC port.
  const compatibleOptionsFor = useMemo(() => {
    const cache = new Map<string, typeof findItemCatalog>()
    return (type: string, size: string, factoryEntityClass?: string) => {
      const key = `${type}|${size}|${factoryEntityClass ?? ''}`
      let options = cache.get(key)
      if (!options) {
        options = findItemCatalog.filter((c) =>
          isComponentSelectableForPort(c.item, type, size, { itemEntityClass: c.entityClass, destinationFactoryEntityClass: factoryEntityClass })
        )
        cache.set(key, options)
      }
      return options
    }
  }, [])

  function isCollapsed(id: string) {
    return collapsed.has(id)
  }
  // FTB-001A (Workstream B) — collapsing/expanding a single row now
  // toggles its ENTIRE descendant subtree at once (displayNodeIds), not
  // just its immediate children, matching the same recursive rule
  // Ship Detail's LoadoutPortTree now applies. `collapsed` here uses
  // inverted semantics (membership means collapsed, not expanded) — every
  // row starts expanded on this editing surface (Mission M-011) — so a
  // currently-collapsed node toggling ON means removing its whole subtree
  // from the set (uncollapsing all of it), and vice versa.
  function toggleCollapsed(node: PortTreeDisplayNode<PreviewRow>) {
    const ids = displayNodeIds(node)
    setCollapsed((prev) => {
      const next = new Set(prev)
      const currentlyCollapsed = prev.has(node.id)
      for (const id of ids) {
        if (currentlyCollapsed) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }
  function expandAll() {
    setCollapsed(new Set())
  }
  function collapseAll() {
    setCollapsed(new Set(flattenDisplayTree(previewDisplayTree).filter((n) => n.children.length > 0).map((n) => n.id)))
  }

  // EWO-026 (Task 1/2) — saving never navigates away from Loadout Manager
  // (Design Authority Ruling 1): the Commander stays in this workspace to
  // create, edit, clone, and compare several Loadouts in sequence.
  // Instead, a successful save transitions straight into Edit Existing
  // Loadout mode with the just-saved (or just-cloned) Build selected —
  // `outcome.buildId` is always the Build that now holds what was just
  // saved, whether that's a brand-new CREATE, the same Build from Save
  // Changes, or a fresh clone from Save as New — so this one branch covers
  // all three without needing to know which button was pressed.
  function handleSave(setActive: boolean, saveAsNew = false, nameOverride?: string) {
    if (!ship) {
      setResult({ success: false, message: 'Select a Fleet Asset first.' })
      return
    }
    if (workflowMode === 'EDIT' && !existingBuildId) {
      setResult({ success: false, message: 'Select which Loadout to edit first.' })
      return
    }
    const resolvedName = nameOverride ?? name
    const outcome = saveMissionConfiguration({
      shipId: ship.id,
      name: resolvedName,
      startingState: effectiveStartingState,
      existingBuildId: effectiveStartingState === 'EXISTING' ? existingBuildId : undefined,
      quartermasterTemplateId: templateId || undefined,
      targetOverrides: overrides,
      setActive,
      saveAsNew,
    })
    if (outcome.success && outcome.buildId) {
      setWorkflowMode('EDIT')
      setExistingBuildId(outcome.buildId)
      setName(resolvedName)
      setOverrides({})
      setResult({ success: true, message: `"${resolvedName}" saved${setActive ? ' and set as the Active Loadout' : ''}.` })
    } else if (outcome.success) {
      // saveMissionConfiguration succeeded but returned no buildId — not a
      // real path today (every success branch mints/reuses one), but
      // guarded rather than silently assuming it here.
      setResult({ success: true, message: `"${resolvedName}" saved.` })
    } else {
      setResult({ success: false, message: outcome.message ?? 'Could not save this Loadout.' })
      if (nameOverride) setName(nameOverride)
    }
  }

  // EWO-024 (Task 4) — "Save as New Loadout" branches the current edit
  // into a new record. If the Name field still reads exactly as the
  // original Loadout's own name (the Commander hasn't deliberately
  // renamed it for the branch), suffix it the same way duplicateBuild's
  // existing clone convention already does elsewhere in this app, so two
  // Loadouts never silently share one name. Computed and passed directly
  // rather than via setName() first, since a state update isn't visible
  // to the very next line of code in the same event handler.
  function handleSaveAsNew(setActive: boolean) {
    const original = editableShipBuilds.find((b) => b.id === existingBuildId)
    const resolvedName = original && name.trim() === original.name.trim() ? `${original.name} (Copy)` : name
    handleSave(setActive, true, resolvedName)
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
  //
  // FTB-001A: handles BOTH 'group' (e.g. "Weapons", "Point Defense
  // Cannons") and 'port' display nodes uniformly at every depth, since
  // `children` is now always a fully processed `PortTreeDisplayNode[]`
  // (Workstream A's PDC subgrouping applies at any nesting level, not
  // just top-level categories).
  function renderDisplayRows(nodes: PortTreeDisplayNode<PreviewRow>[], depth: number): ReactNode[] {
    return nodes.flatMap((node) => {
      const hasChildren = node.children.length > 0
      const rowCollapsed = isCollapsed(node.id)

      if (node.kind === 'group') {
        const headerEl = (
          <tr key={node.id} className="border-b border-white/5 last:border-0 bg-white/[0.015] hover:bg-white/[0.03]">
            <td className="px-5 py-3 text-cyan/80 font-semibold uppercase tracking-wide text-xs whitespace-nowrap">
              <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-1">
                <button onClick={() => toggleCollapsed(node)} className="text-muted hover:text-cyan transition-colors shrink-0" aria-label={rowCollapsed ? 'Expand group' : 'Collapse group'}>
                  {rowCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
                {node.label}
              </div>
            </td>
            <td className="px-5 py-3" />
            <td className="px-5 py-3" />
            <td className="px-5 py-3" />
            <td className="px-5 py-3" />
            <td className="px-5 py-3" />
          </tr>
        )
        return !rowCollapsed ? [headerEl, ...renderDisplayRows(node.children, depth + 1)] : [headerEl]
      }

      const row = node.node.hardpoint
      const rowEl = (
        <Fragment key={row.id}>
          <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
            <td className="px-5 py-3 text-white font-medium whitespace-nowrap">
              <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-1">
                {hasChildren ? (
                  <button onClick={() => toggleCollapsed(node)} className="text-muted hover:text-cyan transition-colors shrink-0" aria-label={rowCollapsed ? 'Expand row' : 'Collapse row'}>
                    {rowCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                ) : (
                  <span className="w-[13px] shrink-0" />
                )}
                <button onClick={() => setExpandedSlot(expandedSlot === row.id ? null : row.id)} className="flex items-center gap-1 hover:text-cyan transition-colors">
                  {formatHardpointLabel(row.slotLabel)}
                </button>
              </div>
            </td>
            <td className="px-5 py-3 text-muted whitespace-nowrap">{row.size} {row.type}</td>
            <td className="px-5 py-3 text-muted/70">{row.isStructural ? <span className="text-muted/50">—</span> : <ComponentAssignmentLabel value={row.factoryItem} />}</td>
            <td className="px-5 py-3 text-muted">{row.isStructural ? <span className="text-muted/50">—</span> : <ComponentAssignmentLabel value={row.installedItem} />}</td>
            <td className="px-5 py-3">
              {row.isStructural ? (
                <span className="text-muted/50">—</span>
              ) : (
                <TargetComponentPicker
                  id={`catalog-${row.id}`}
                  value={row.previewTarget}
                  // EWO-STAB-004B (ADR-010, Assignments 2-4) — the whole
                  // per-slot override is REPLACED on every selection,
                  // never merged onto the previous one: a fresh
                  // entityClass (Rule A/D) or its absence (Rule B, free
                  // text/an unresolved option) is stored exactly as this
                  // one selection dictates — a stale entityClass from a
                  // prior choice can never survive onto new text.
                  onChange={(next, entityClass) => setOverrides((prev) => ({ ...prev, [row.slotLabel]: { targetItem: next, targetEntityClass: entityClass } }))}
                  options={compatibleOptionsFor(row.type, row.size, row.factoryEntityClass)}
                />
              )}
            </td>
            <td className="px-5 py-3">
              {row.isStructural ? null : row.compatible ? (
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

      return hasChildren && !rowCollapsed ? [rowEl, ...renderDisplayRows(node.children, depth + 1)] : [rowEl]
    })
  }

  return (
    // EWO-023 (Task 2) — this page previously capped itself to max-w-4xl
    // (896px) on top of App.tsx's shared <main> (max-w-[1400px]),
    // artificially squeezing the Target Equipment table into a container
    // roughly 500px narrower than every sibling page (Fleet Dashboard,
    // Mission Control, Ship Detail all rely on <main>'s width alone) —
    // confirmed the direct cause of the reported horizontal-scroll/width
    // complaint (a fully-expanded Corsair's table needs ~1360px, which
    // fits under 1400px but not under the old 896px cap). Matches sibling
    // pages by relying on the same shared container instead of adding its
    // own narrower one.
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Loadout Manager</p>
        <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">How do I configure this ship?</h1>
        <p className="text-sm text-muted mt-1">Edit every target equipment decision for one exact ship, then save it — optionally as the Active Loadout.</p>
      </div>

      <div className="panel p-5 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-widest text-muted block mb-2">Ship</label>
          {/* FTB-001A (Workstream D) — a real blank placeholder option
              (never an implicit first-ship `value`), styled prominently
              (border + focus ring) so this reads as the primary action on
              an otherwise-empty page. */}
          <select
            value={shipId}
            onChange={(e) => {
              setShipId(e.target.value)
              setOverrides({})
              setExistingBuildId('')
              setWorkflowMode('CREATE')
              setName('')
              setResult(null)
              // EWO-025 (Task 5) — a different ship means a different
              // canonical port tree; a previously-collapsed/expanded
              // slotLabel from the old ship has no meaning here (and could
              // coincidentally collide with an unrelated port of the same
              // name on the new ship).
              setCollapsed(new Set())
              setExpandedSlot(null)
            }}
            className="w-full sm:w-1/2 border-2 border-cyan/40 focus:border-cyan"
          >
            <option value="">Select a ship…</option>
            {ships.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} [{s.ownership}]
              </option>
            ))}
          </select>
        </div>

        {/* FTB-001A (Workstream D) — no ship selected yet: every
            editing-related control below (workflow mode, starting state,
            Target Equipment, Save actions) stays unavailable, and no
            other ship's data is implied here. */}
        {!ship && (
          <div className="flex flex-col items-center justify-center text-center gap-2 py-6">
            <ShipWheel size={26} className="text-cyan/50 mb-1" />
            <h2 className="font-display font-bold text-white text-base uppercase tracking-widest">Select a Ship</h2>
            <p className="text-sm text-muted max-w-sm">Choose a fleet vessel above to review or manage its loadout.</p>
          </div>
        )}

        {ship && (
          <>
        {/* EWO-024 (Task 4) — the primary, explicit choice: are we creating
            a new Loadout, or working on one specific existing one? Every
            downstream ambiguity Task 4 reported traced back to this
            decision never being asked directly. */}
        <div>
          <label className="text-xs uppercase tracking-widest text-muted block mb-2">What are you doing?</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                // EWO-027 (Scenario A) — starting a New Loadout is not
                // "Copy Existing": every piece of the previous Build's own
                // metadata and per-slot edits must reset, so only
                // whichever Starting Source the Commander ultimately
                // picks supplies equipment — never a stale Name, Category,
                // or leftover override from whatever was being edited a
                // moment ago (this button is reachable straight from an
                // EDIT-mode Loadout, including the one this page itself
                // switches into right after a save).
                setWorkflowMode('CREATE')
                setExistingBuildId('')
                setName('')
                setCategory('')
                setOverrides({})
                setResult(null)
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                workflowMode === 'CREATE' ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
              }`}
            >
              Create a New Loadout
            </button>
            <button
              onClick={() => {
                setWorkflowMode('EDIT')
                setResult(null)
                if (!existingBuildId && editableShipBuilds[0]) {
                  setExistingBuildId(editableShipBuilds[0].id)
                  setName(editableShipBuilds[0].name)
                }
              }}
              disabled={editableShipBuilds.length === 0}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                workflowMode === 'EDIT' ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
              }`}
              title={editableShipBuilds.length === 0 ? 'This ship has no existing Loadouts to edit yet.' : undefined}
            >
              Edit an Existing Loadout
            </button>
          </div>
        </div>

        {workflowMode === 'EDIT' ? (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">Which Loadout</label>
              <select
                value={existingBuildId}
                onChange={(e) => {
                  const id = e.target.value
                  setExistingBuildId(id)
                  const build = editableShipBuilds.find((b) => b.id === id)
                  if (build) setName(build.name)
                }}
                className="w-full"
              >
                <option value="">Select a Loadout…</option>
                {editableShipBuilds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.isActive ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">Loadout Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deep Salvage Run" className="w-full" />
              <p className="text-[11px] text-cyan/70 mt-1">Changing this renames the Loadout when you save changes.</p>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">Loadout Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deep Salvage Run" className="w-full" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">Category (optional)</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Combat, Industrial, Support" className="w-full" />
            </div>
          </div>
        )}

        {workflowMode === 'CREATE' && (
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
        )}

        {workflowMode === 'CREATE' && startingState === 'EXISTING' && (
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
            <p className="text-[11px] text-muted mt-1">Used only as a starting template for this new Loadout — the original is never changed.</p>
          </div>
        )}
          </>
        )}
      </div>

      {ship && (
      <>
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
            <tbody>{renderDisplayRows(previewDisplayTree, 0)}</tbody>
          </table>
        </div>
      </div>

      {result && !result.success && (
        <div className="flex items-center gap-2 bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
          <AlertOctagon size={16} /> {result.message}
        </div>
      )}
      {/* EWO-026 (Task 1/2) — saving no longer navigates away, so a
          restrained local confirmation is the only signal the Commander
          gets that the save succeeded and which Loadout is now selected. */}
      {result && result.success && (
        <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-lg px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} /> {result.message}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleSave(false)}
          className="inline-flex items-center gap-2 border border-white/15 text-white font-medium text-sm px-4 py-2 rounded-lg hover:border-white/35 transition-colors"
        >
          <Save size={15} /> {workflowMode === 'EDIT' ? 'Save Changes' : 'Create Loadout'}
        </button>
        <button
          onClick={() => handleSave(true)}
          className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
        >
          <CheckCircle2 size={15} /> {workflowMode === 'EDIT' ? 'Save Changes & Set as Active' : 'Create & Set as Active Loadout'}
        </button>
        {/* EWO-024 (Task 4) — "Clone" as its own explicit action: branch the
            Loadout currently being edited into a brand new one, leaving the
            original completely untouched. Only meaningful in EDIT mode —
            CREATE mode already has its own "Copy an Existing Loadout"
            starting point for the analogous new-from-template case. */}
        {workflowMode === 'EDIT' && (
          <button
            onClick={() => handleSaveAsNew(false)}
            disabled={!existingBuildId}
            className="inline-flex items-center gap-2 border border-white/15 text-muted hover:text-white text-sm px-4 py-2 rounded-lg hover:border-white/35 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Save the current edits as a brand new Loadout — the original is left unchanged."
          >
            <Copy size={15} /> Save as New Loadout
          </button>
        )}
        {/* EWO-026 (Task 3) — explicit navigation only, never implied by a
            save. `ship.id` is this exact selected Fleet Asset's own unique
            materialized id (not the shared hull/ShipDefinition id), so two
            owned copies of the same hull always route to the correct,
            distinct instance (Ruling 4/5) — the existing `/ship/:shipId`
            route already carries that per-instance identity; no second
            navigation/selection mechanism is introduced here (Ruling 8). */}
        <Link to={`/ship/${ship.id}`} className="inline-flex items-center gap-2 text-muted text-sm px-4 py-2 hover:text-white transition-colors">
          <Rocket size={15} /> View in Ship Detail
        </Link>
      </div>
      </>
      )}

      <div className="scanline-divider" />

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
