import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Clock, Zap, ListChecks, ChevronDown, ShipWheel, Layers,
  AlertOctagon, FlaskConical, ChevronRight, Trash2, AlertTriangle, X, CheckCircle2, Pencil, PackageCheck,
} from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import Badge from '../components/Badge'
import ShipHeroFrame from '../components/ShipHeroFrame'
import EditFleetAssetModal from '../components/EditFleetAssetModal'
import LoadoutPortTree from '../components/LoadoutPortTree'
import { importedShipList, type ImportedShipView } from '../generated/importedShips'
import { calculateBuildProgress } from '../utils/buildProgress'
import { calculateMissionPackage } from '../engine/logistics/missionPackage'
import { deriveFleetBuildState } from '../utils/fleetBuildState'
import { buildPortTree } from '../utils/portTree'
import { resolveShipImage } from '../utils/resolveShipImage'
import { shipFactoryTemplates } from '../data/shipDefinitions'
import { overlayCanonicalHierarchy, resolveShipDefinitionId } from '../utils/loadoutEditorModel'
import { withComponentOwnedChildSlots, type ComponentOwnedSlotSpec } from '../utils/componentOwnedSlots'
import type { Hardpoint } from '../types'

/**
 * FTB-001A/FTB-001B — a synthetic "<label> Slot N" row for whichever
 * component currently owns real child attachment ports (mining heads,
 * missile racks — see src/utils/componentOwnedSlots.ts). Branches only on
 * `spec.label`, never on ship or rack identity:
 *   - A mining module slot (`label: 'Module'`) stays `isStructural: true`
 *     — this app has no Mining Module catalog/compatibility layer to
 *     target these against yet, so they are presented, not editable,
 *     exactly like a turret/mount shell (FTB-001A, unchanged).
 *   - A missile slot (`label: 'Missile'`) is a REAL, non-structural,
 *     targetable port (`type: 'Missile'`, sized to the rack's own
 *     source-derived missile size) — a Commander must be able to assign
 *     missiles into a swapped rack's new slots exactly as they could for
 *     the original factory ones (FTB-001B). It always starts empty
 *     (factory/installed/target all '—') — a swap must never silently
 *     retain a previous, possibly now-incompatible missile assignment.
 */
function makeHardpointChildSlotRow(host: Hardpoint, slotNumber: number, spec: ComponentOwnedSlotSpec): Hardpoint {
  const isMissileSlot = spec.label === 'Missile'
  return {
    ...host,
    id: `${host.id}-${spec.label.toLowerCase()}-slot-${slotNumber}`,
    slotLabel: `${host.slotLabel} — ${spec.label} Slot ${slotNumber}`,
    parentSlotLabel: host.slotLabel,
    isStructural: !isMissileSlot,
    type: isMissileSlot ? 'Missile' : 'Mining Module',
    size: spec.size ? `S${spec.size}` : host.size,
    factoryItem: '—',
    installedItem: '—',
    targetItem: '—',
    status: 'OK',
    factoryEntityClass: undefined,
    installedEntityClass: undefined,
    targetEntityClass: undefined,
    invalidMessage: undefined,
  }
}

function SummaryTile({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-black/20 border border-white/5 rounded-lg p-3 flex items-center gap-2.5">
      <Icon size={16} className="shrink-0" style={accent ? { color: accent } : undefined} />
      <div>
        <div className="text-sm font-display font-bold leading-none" style={accent ? { color: accent } : undefined}>
          {value}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{label}</div>
      </div>
    </div>
  )
}

/** Readiness color per Part 2's recommended interpretation. */
function readinessColor(pct: number): string {
  if (pct >= 100) return '#42E695'
  if (pct >= 85) return '#42E695'
  if (pct >= 50) return '#FFD166'
  return '#FF5F73'
}

const importedShipById = new Map(importedShipList.map((v) => [v.ship.id, v]))

export default function ShipDetail() {
  const { shipId } = useParams()
  const navigate = useNavigate()
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)
  const installedLoadouts = useFleetStore((s) => s.installedLoadouts)
  const reservations = useFleetStore((s) => s.reservations)
  const hangarItems = useFleetStore((s) => s.hangarItems)
  const setActiveBuild = useFleetStore((s) => s.setActiveBuild)
  const removeFleetAsset = useFleetStore((s) => s.removeFleetAsset)
  const removeComponent = useFleetStore((s) => s.removeComponent)
  const addLogEntry = useFleetStore((s) => s.addLogEntry)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const sortedShips = [...ships].sort((a, b) => a.name.localeCompare(b.name))

  // Shared "Select Ship" control — lists only the Commander's actual live
  // Fleet Assets (EWO-033A-V1). Developer-only imported preview ships
  // (src/generated/importedShips.ts, produced offline by `npm run
  // import:ships`) are deliberately NOT offered here — they have no
  // corresponding Fleet Asset and must not appear as a selectable "ship in
  // the fleet." That preview remains reachable directly by URL
  // (importedShipById / ImportedShipDetail below), just not from this
  // dropdown.
  // FTB-001A (Workstream D) — the control itself must make "nothing is
  // selected yet" visually unambiguous: a real blank placeholder option
  // (never silently defaulting its `value` to the first fleet ship), and
  // large/prominent styling (border + background) so it reads as the
  // primary action on an otherwise-empty page, not an easy-to-miss detail.
  const selectShip = (
    <div>
      <label className="text-[11px] uppercase tracking-widest text-muted flex items-center gap-1.5 mb-1.5">
        <ShipWheel size={13} /> Select Ship
      </label>
      <select
        value={shipId ?? ''}
        onChange={(e) => (e.target.value ? navigate(`/ship/${e.target.value}`) : navigate('/ship'))}
        className="min-w-[240px] border-2 border-cyan/40 focus:border-cyan"
      >
        <option value="">Select a ship…</option>
        {sortedShips.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )

  // All store hooks are called above, unconditionally — Ship Detail must
  // not call a different number of hooks depending on which ship is
  // selected, since switching between a seed ship and an imported ship
  // re-renders this same component instance rather than remounting it.
  const importedView = shipId ? importedShipById.get(shipId) : undefined
  if (importedView) {
    return <ImportedShipDetail view={importedView} selectShip={selectShip} />
  }

  // FTB-001A (Workstream D) — the previous `?? ships[0]` fallback here
  // meant opening Ship Detail with no explicit navigation target (or with
  // a shipId that no longer exists — a deleted Fleet Asset, or a stale
  // bookmark) silently displayed WHICHEVER ship happened to be first in
  // store order. A Commander could edit or remove the wrong vessel without
  // ever realizing a different ship was showing. Ship-Selection State
  // Policy: entering with no explicit target is a blank selection, never
  // an inferred first-ship default; a deleted/unavailable selected ship
  // clears back to the same empty state rather than falling back.
  const ship = ships.find((s) => s.id === shipId)
  if (!ship) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Ship Detail</p>
            <h1 className="text-2xl font-display font-bold text-white">Is this ship ready?</h1>
          </div>
          {selectShip}
        </div>
        <div className="panel p-10 flex flex-col items-center justify-center text-center gap-2">
          <ShipWheel size={28} className="text-cyan/50 mb-2" />
          <h2 className="font-display font-bold text-white text-lg uppercase tracking-widest">Select a Ship</h2>
          <p className="text-sm text-muted max-w-sm">Choose a fleet vessel above to review or manage its loadout.</p>
        </div>
      </div>
    )
  }
  const shipBuilds = builds.filter((b) => b.shipId === ship.id)
  const activeBuild = builds.find((b) => b.id === ship.activeBuildId) ?? shipBuilds[0]
  const shipHardpoints = hardpoints.filter((h) => h.buildId === activeBuild?.id)

  // EWO-026 (Task 1) — the canonical, authoritative port hierarchy for
  // this exact ship (same source MissionComposer's Loadout Manager
  // already uses via EWO-025), overlaid onto `shipHardpoints` by stable
  // slotLabel.
  const canonicalTemplate = (() => {
    const definitionId = resolveShipDefinitionId(ship.id, fleetAssets)
    return definitionId ? shipFactoryTemplates[definitionId] ?? [] : []
  })()
  // FTB-001B — previously, progress/readiness/missing-item math (below)
  // read `shipHardpoints` unchanged, while only the RENDERED TREE ran
  // through the component-owned child-slot correction (EWO-026's original
  // "for DISPLAY ONLY" separation). That was safe while the correction was
  // purely additive (FTB-001A's mining modules, which never had real
  // ship-baked children to begin with). A swapped missile rack's STALE
  // child rows are real, already-counted Hardpoint rows, though — leaving
  // them out of the tree but still in the progress calculation would
  // report readiness/missing-items against slots the Commander can no
  // longer even see. Both now read the same corrected set.
  const effectiveHardpoints = withComponentOwnedChildSlots(overlayCanonicalHierarchy(shipHardpoints, canonicalTemplate), makeHardpointChildSlotRow)

  // Missing, Upgrade Available, and Invalid Target are kept fully distinct —
  // an interim upgrade is not the same situation as an empty slot, and an
  // incompatible target (bad data) is not a to-do item at all. All of it
  // comes from the single shared Build Progress engine — this page never
  // computes its own percentage/complete state.
  const progress = calculateBuildProgress(effectiveHardpoints)
  const buildState = deriveFleetBuildState(activeBuild, progress)
  // Package Readiness ("do I own/commit everything?") stays secondary
  // logistics context (Part 2) — it never competes with Readiness
  // (Installed Match, "is it physically configured now?") for primary
  // billing. FTB-001B: this build's own rows are substituted for the
  // corrected set too — every other ship/build's rows are untouched.
  const missionPackageHardpoints = activeBuild ? [...hardpoints.filter((h) => h.buildId !== activeBuild.id), ...effectiveHardpoints] : hardpoints
  const missionPackage = calculateMissionPackage(activeBuild?.id ?? '', missionPackageHardpoints, installedLoadouts, reservations, hangarItems, activeBuild?.kind === 'FACTORY')
  const portTree = buildPortTree(effectiveHardpoints)
  const isMissionReady = buildState === 'MISSION_READY'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Ship Detail</p>
          <h1 className="text-2xl font-display font-bold text-white">Is this ship ready?</h1>
        </div>
        {selectShip}
      </div>

      <div className="panel overflow-hidden">
        <ShipHeroFrame
          imageSrc={ship.imageUrl}
          name={ship.name}
          manufacturer={ship.manufacturer}
          ownership={ship.ownership}
          activeBuildLabel={activeBuild?.name ?? '—'}
          isMissionReady={isMissionReady}
        />

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Clock size={13} /> Updated {ship.lastUpdated}
          </div>

          <div className="scanline-divider" />

          {/* Primary status — ONE Readiness card (Part 2), never competing
              headline tiles for Installed Match vs Package Readiness. Every
              value comes from the same calculateBuildProgress() +
              deriveFleetBuildState() calls Fleet Dashboard and Mission
              Control use, so this page can never disagree with them. */}
          {buildState === 'INVALID_BUILD' ? (
            <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 rounded-lg px-4 py-3">
              <AlertOctagon size={18} className="text-danger shrink-0 mt-0.5" />
              <div>
                <span className="font-display font-bold text-danger uppercase tracking-widest text-sm">Invalid Loadout / Data Issue</span>
                <p className="text-sm text-white/80 mt-1">
                  {activeBuild ? `${activeBuild.name} references incompatible or unresolved data.` : 'No valid Loadout record is referenced for this Fleet Asset.'} See the Loadout &amp; Port Tree below rather than trusting a readiness number.
                </p>
              </div>
            </div>
          ) : buildState === 'FACTORY_ONLY' ? (
            <div className="flex items-center gap-2 bg-cyan/5 border border-cyan/20 rounded-lg px-4 py-3">
              <Layers size={18} className="text-cyan shrink-0" />
              <div>
                <span className="font-display font-bold text-cyan uppercase tracking-widest text-sm">Factory Loadout</span>
                <p className="text-xs text-muted mt-0.5">Factory-issued equipment installed — no custom Loadout assigned yet. This is valid and usable.</p>
              </div>
              <Link to={`/loadout-manager?shipId=${ship.id}`} className="ml-auto text-xs font-medium text-cyan hover:underline whitespace-nowrap">
                Create Custom Loadout →
              </Link>
            </div>
          ) : buildState === 'MISSION_READY' ? (
            <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-lg px-4 py-3">
              <CheckCircle2 size={18} className="text-success shrink-0" />
              <span className="font-display font-bold text-success uppercase tracking-widest text-sm">Mission Ready</span>
              <span className="text-xs text-muted ml-auto">Active Loadout: {activeBuild?.name ?? '—'}</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-black/20 border border-white/5 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-widest text-muted">Readiness</span>
                  <span className="text-2xl font-display font-bold" style={{ color: readinessColor(progress.percentage) }}>
                    {progress.percentage}%
                  </span>
                </div>
                <div className="readiness-bar-track w-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${progress.percentage}%`, background: readinessColor(progress.percentage), boxShadow: `0 0 8px ${readinessColor(progress.percentage)}88` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryTile icon={Layers} label="Active Loadout" value={activeBuild?.name ?? '—'} />
                <SummaryTile icon={ChevronRight} label="Missing Items" value={progress.missingAssignments.length} accent={progress.missingAssignments.length > 0 ? '#FF5F73' : undefined} />
                <SummaryTile icon={ChevronRight} label="Upgrade Opportunities" value={progress.upgradeOpportunities.length} accent={progress.upgradeOpportunities.length > 0 ? '#FFD166' : undefined} />
                <SummaryTile icon={AlertOctagon} label="Invalid Targets" value={progress.invalidTargets.length} accent={progress.invalidTargets.length > 0 ? '#FF5F73' : undefined} />
              </div>
              {/* Secondary logistics context — Package Readiness never
                  competes with Readiness for primary billing (Part 2). */}
              <div className="bg-black/10 border border-white/5 rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs text-muted">
                <PackageCheck size={13} className="text-cyan/70 shrink-0" />
                <span className="uppercase tracking-widest text-[10px] text-muted/70 mr-1">Logistics</span>
                Reserved Package: {missionPackage.packagePercentage}% · Unreserved Matches: {missionPackage.availableUnreservedMatches} · Missing: {missionPackage.missingAssignments.length}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs uppercase tracking-widest text-muted">Active Loadout</label>
            <div className="relative">
              <select
                value={activeBuild?.id}
                onChange={(e) => setActiveBuild(ship.id, e.target.value)}
                className="appearance-none pr-8"
              >
                {shipBuilds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cyan pointer-events-none" />
            </div>
            {activeBuild?.role && <span className="text-[11px] text-muted">Role: {activeBuild.role}</span>}
            {shipBuilds.length > 1 && <span className="text-[11px] text-muted">{shipBuilds.length} Loadouts available for this ship</span>}
          </div>

          {progress.invalidTargets.length > 0 && (
            <div className="bg-danger/10 border border-danger rounded-lg px-4 py-3">
              <p className="text-xs uppercase tracking-widest text-white font-bold mb-1 flex items-center gap-1.5">
                <AlertOctagon size={13} /> Invalid Target Data for {activeBuild?.name}
              </p>
              <ul className="text-sm text-white space-y-0.5">
                {effectiveHardpoints.filter((h) => h.status === 'Invalid Target').map((h) => (
                  <li key={h.id}>{h.slotLabel}: {h.invalidMessage ?? `${h.targetItem} is not compatible with this port.`}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              to="/quick-update"
              className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
            >
              <Zap size={15} /> Quick Update
            </Link>
            <Link
              to="/hangar"
              className="inline-flex items-center gap-2 border border-white/15 text-white font-medium text-sm px-4 py-2 rounded-lg hover:border-white/35 transition-colors"
            >
              <ListChecks size={15} /> Change Disposition
            </Link>
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 border border-white/15 text-white font-medium text-sm px-4 py-2 rounded-lg hover:border-white/35 transition-colors"
            >
              <Pencil size={15} /> Edit
            </button>
            <button
              onClick={() => setRemoveConfirmOpen(true)}
              className="ml-auto inline-flex items-center gap-2 border border-danger/30 text-danger font-medium text-sm px-4 py-2 rounded-lg hover:bg-danger/10 hover:border-danger/50 transition-colors"
            >
              <Trash2 size={15} /> Remove from Fleet
            </button>
          </div>
        </div>
      </div>

      {editOpen && <EditFleetAssetModal ship={ship} onClose={() => setEditOpen(false)} />}

      {removeConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setRemoveConfirmOpen(false)}>
          <div className="panel p-6 max-w-sm w-full border-danger/30" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-danger shrink-0 mt-0.5" size={20} />
                <div>
                  <h3 className="font-display font-semibold text-white">Remove "{ship.name}" from Fleet?</h3>
                  <p className="text-sm text-muted mt-1">
                    This removes your Fleet Asset — its Loadout and installed equipment go with it. The ship model itself (and any other copy you own) is unaffected. This can't be undone.
                  </p>
                </div>
              </div>
              <button onClick={() => setRemoveConfirmOpen(false)} className="text-muted hover:text-white shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setRemoveConfirmOpen(false)}
                className="flex-1 border border-white/15 text-white font-medium text-sm py-2 rounded-lg hover:border-white/35 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  removeFleetAsset(ship.id)
                  setRemoveConfirmOpen(false)
                  navigate('/fleet')
                }}
                className="flex-1 bg-danger text-white font-semibold text-sm py-2 rounded-lg hover:bg-danger/90 transition-colors"
              >
                Remove from Fleet
              </button>
            </div>
          </div>
        </div>
      )}

      <LoadoutPortTree
        tree={portTree}
        reservations={reservations}
        hangarItems={hangarItems}
        installedLoadouts={installedLoadouts}
        onRemoveComponent={
          activeBuild
            ? (slotLabel, returnToHangarChecked) => {
                const before = activeBuild.readiness
                const result = removeComponent(ship.id, slotLabel, returnToHangarChecked, activeBuild.id)
                if (result.matched) {
                  const after = useFleetStore.getState().builds.find((b) => b.id === activeBuild.id)?.readiness
                  addLogEntry({
                    action: returnToHangarChecked ? 'Removed component to Hangar' : 'Removed component',
                    shipName: ship.name,
                    itemName: result.itemName,
                    details: `Removed ${result.itemName} from ${ship.name} (${slotLabel})${returnToHangarChecked ? ' — returned to Hangar' : ''}`,
                    readinessBefore: before,
                    readinessAfter: after,
                  })
                }
                return result
              }
            : undefined
        }
      />
    </div>
  )
}

/**
 * Dev-only render path for any imported ship — generalized from the
 * earlier Gladius-only proof-of-concept component. Everything here comes
 * from `src/generated/importedShips.ts`, which reads back the output of
 * `npm run import:ships` — no seed Hardpoint data, no Zustand store, no
 * ship-specific code path. Uses the same unified LoadoutPortTree by first
 * translating the engine's real Port graph into the same Hardpoint shape
 * the tree already knows how to render — one tree component for every ship.
 */
function ImportedShipDetail({ view, selectShip }: { view: ImportedShipView; selectShip: React.ReactNode }) {
  const { ship, componentById, equipmentAssignments } = view

  const nameFor = (componentId: string | null | undefined) => (componentId ? componentById.get(componentId)?.displayName ?? componentId : '—')

  const matchedCount = equipmentAssignments.filter((a) => a.resolvedItemId !== null).length
  const readiness = equipmentAssignments.length > 0 ? Math.round((matchedCount / equipmentAssignments.length) * 100) : 100
  const isMissionReady = readiness === 100 && equipmentAssignments.every((a) => !a.mixedChildItems)

  // Translate engine Port/Component data into the same Hardpoint shape
  // LoadoutPortTree already renders, preserving mount hierarchy via
  // parentSlotLabel exactly like the legacy-model ships do.
  const importedHardpoints = view.ports.map((p) => {
    const parent = p.parentPortId ? view.ports.find((parentPort) => parentPort.id === p.parentPortId) : undefined
    const installedName = nameFor(p.installedItemId)
    const targetName = nameFor(p.targetItemId)
    const factoryName = nameFor(p.factoryItemId)
    const status = !p.factoryItemId ? ('Unresolved' as const) : installedName === targetName ? ('OK' as const) : targetName === '—' ? ('OK' as const) : ('Missing' as const)
    return {
      id: p.id,
      shipId: ship.id,
      buildId: 'factory-loadout-imported',
      slotLabel: p.displayName,
      type: p.equipmentGroup,
      size: p.minSize !== null ? `S${p.minSize}` : '—',
      factoryItem: factoryName,
      installedItem: installedName,
      targetItem: targetName,
      status,
      parentSlotLabel: parent?.displayName,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Ship Detail</p>
          <h1 className="text-2xl font-display font-bold text-white">Is this ship ready?</h1>
        </div>
        {selectShip}
      </div>

      <div className="bg-cyan/5 border border-cyan/25 rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs text-cyan">
        <FlaskConical size={14} className="shrink-0" />
        Rendering entirely from imported Data Engine structures (generated-data, from `npm run import:ships`) — no seed data, developer option only.
      </div>

      <div className="panel overflow-hidden">
        <ShipHeroFrame
          // EWO-021A: routed through the same shared resolver as every
          // other ship-image consumer, so the Commander's registry
          // (src/data/shipImageRegistry.ts) applies here too.
          imageSrc={resolveShipImage({
            id: ship.id,
            imageUrl: ship.imageUrl,
            image: { primaryUrl: ship.image?.primaryUrl ?? view.imageManifestEntry?.primaryUrl ?? undefined },
          })}
          imageMeta={view.imageManifestEntry}
          name={ship.name}
          manufacturer={ship.manufacturer}
          ownership={ship.ownership}
          activeBuildLabel="Factory Loadout"
          imported
          isMissionReady={isMissionReady}
        />

        <div className="p-6 space-y-5">
          <div className="scanline-divider" />
          <div className="flex items-center gap-2 bg-cyan/5 border border-cyan/20 rounded-lg px-4 py-3">
            <Layers size={18} className="text-cyan shrink-0" />
            <div>
              <span className="font-display font-bold text-cyan uppercase tracking-widest text-sm">Factory Loadout</span>
              <p className="text-xs text-muted mt-0.5">Imported Ship Definition catalog view — developer inspection only.</p>
            </div>
            <span className="text-xs text-muted ml-auto">Readiness: {readiness}%</span>
          </div>
        </div>
      </div>

      <LoadoutPortTree tree={buildPortTree(importedHardpoints)} reservations={[]} hangarItems={[]} installedLoadouts={[]} />
    </div>
  )
}
