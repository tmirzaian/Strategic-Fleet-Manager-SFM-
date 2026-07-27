import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { catalogComponentsByName } from '../generated/componentCatalog'
import { isComponentSelectableForPort } from '../data/componentCatalog'
import CatalogComponentSearch from '../components/CatalogComponentSearch'
import type { Ship } from '../types'

/**
 * Disambiguates Fleet Assets in any dropdown — always shows the ownership
 * type, since two Fleet Assets of the same Ship Definition with no
 * nickname would otherwise render as identical, indistinguishable option
 * text (Alpha 2.1, Part 18 / Golden Scenario E). Every option still maps
 * to a unique `ship.id` regardless of what it displays.
 */
function fleetAssetOptionLabel(ship: Ship): string {
  return `${ship.name} [${ship.ownership}]`
}

type ChangeType = 'Add Component to Hangar' | 'Install Component' | 'Remove Component' | 'Move Component Between Ships' | 'Set Active Loadout'
// EWO-030 (Tasks 6/8) — Remove Component and Move Component Between Ships
// are hidden from the visible tab list: Ship Detail's Port Tree is now the
// official uninstall workflow (Task 7), and moving a component directly
// between ships is deferred to a future roadmap item. Both branches' full
// implementation below (state, JSX, and handleSave logic) is left intact —
// only unreachable through this page's own UI.
const changeTypes: ChangeType[] = ['Add Component to Hangar', 'Install Component', 'Set Active Loadout']
const slots = ['Weapon 1', 'Weapon 2', 'Power 1', 'Power 2', 'Shield 1', 'Shield 2', 'Cooler 1', 'Cooler 2', 'Quantum Drive', 'Radar', 'Life Support']

export default function QuickUpdate() {
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const addLogEntry = useFleetStore((s) => s.addLogEntry)
  const installComponent = useFleetStore((s) => s.installComponent)
  const removeComponent = useFleetStore((s) => s.removeComponent)
  const moveComponentBetweenShips = useFleetStore((s) => s.moveComponentBetweenShips)
  const addHangarItem = useFleetStore((s) => s.addHangarItem)
  const setActiveBuild = useFleetStore((s) => s.setActiveBuild)

  // EWO-037 (Task 2) — "Add Component to Hangar" is now the default landing
  // workflow (was "Install Component"); Install Component itself is
  // unchanged, just no longer pre-selected on page load.
  const [changeType, setChangeType] = useState<ChangeType>('Add Component to Hangar')
  // EWO-030 (Task 1) — set exclusively by CatalogComponentSearch picking a
  // real catalog component, replacing the old free-text itemQuery search
  // for both Install Component and Add Component to Hangar.
  const [selectedComponentName, setSelectedComponentName] = useState('')
  const [shipId, setShipId] = useState(ships[0]?.id ?? '')
  const [slot, setSlot] = useState(slots[0])
  const [toShipId, setToShipId] = useState(ships[1]?.id ?? ships[0]?.id ?? '')
  const [toSlot, setToSlot] = useState(slots[0])
  const [buildId, setBuildId] = useState('')
  const [buildContextId, setBuildContextId] = useState('')
  const [returnToHangar, setReturnToHangar] = useState(false)
  const [summary, setSummary] = useState<null | { success: boolean; headline: string; detail: string }>(null)

  const selectedShip = ships.find((s) => s.id === shipId)
  const shipBuilds = builds.filter((b) => b.shipId === shipId)
  const buildName = (id: string) => builds.find((b) => b.id === id)?.name ?? 'Unknown Loadout'
  // Loadout Context defaults to this Fleet Asset's Active Build, but Install
  // /Remove Component can target any Build assigned to it (Part 19-21) —
  // installing under a non-active context never changes activeBuildId.
  const effectiveBuildContextId = buildContextId && shipBuilds.some((b) => b.id === buildContextId) ? buildContextId : selectedShip?.activeBuildId ?? ''
  const buildContext = builds.find((b) => b.id === effectiveBuildContextId)

  // EWO-030 (Task 3) — after a Component and a Loadout are both chosen,
  // narrow to hardpoints that are (a) not already fulfilled and (b)
  // positively type/size-compatible with the selected component, via the
  // same isComponentSelectableForPort the Loadout Manager's Target picker
  // already uses (EWO-024, Task 2) — "what's offered" can never disagree
  // with "what installComponent will actually accept."
  //
  // EWO-STAB-004A (ADR-010, Assignment 9) — each candidate hardpoint's own
  // factoryEntityClass drives its PDC_TURRET destination-capability check,
  // so a PDC turret assembly typed here is never offered an ordinary S2
  // weapon slot, and an ordinary component is never offered a native PDC
  // slot. `selectedComponentName` itself stays name-based (this page's
  // free-text entry is unchanged) — an ambiguous typed name simply isn't
  // selectable anywhere, the same safe refusal every other caller applies.
  const compatibleSlotOptions = useMemo(() => {
    if (!selectedComponentName || !effectiveBuildContextId) return []
    return hardpoints.filter(
      (h) =>
        h.buildId === effectiveBuildContextId &&
        h.status !== 'OK' &&
        isComponentSelectableForPort(selectedComponentName, h.type, h.size, { destinationFactoryEntityClass: h.factoryEntityClass })
    )
  }, [hardpoints, selectedComponentName, effectiveBuildContextId])

  // EWO-030 (Task 4) — a single compatible destination is pre-selected
  // automatically; the Commander is never asked to answer a question with
  // only one possible answer.
  useEffect(() => {
    if (compatibleSlotOptions.length === 1) setSlot(compatibleSlotOptions[0].slotLabel)
    else if (compatibleSlotOptions.length === 0) setSlot('')
  }, [compatibleSlotOptions])

  const canSave =
    changeType === 'Install Component'
      ? Boolean(selectedComponentName && shipId && effectiveBuildContextId && slot)
      : changeType === 'Add Component to Hangar'
        ? Boolean(selectedComponentName)
        : changeType === 'Set Active Loadout'
          ? Boolean(shipId && buildId)
          : true

  function handleSave() {
    if (changeType === 'Install Component') {
      const before = buildContext?.readiness
      const result = installComponent(shipId, selectedComponentName || 'Component', slot, effectiveBuildContextId || undefined)
      const after = useFleetStore.getState().builds.find((b) => b.id === effectiveBuildContextId)?.readiness
      const contextNote = effectiveBuildContextId !== selectedShip?.activeBuildId ? ` (Loadout Context: ${buildContext?.name ?? 'selected Loadout'} — Active Loadout unchanged)` : ''
      if (result.matched) {
        addLogEntry({
          action: 'Installed component',
          shipName: selectedShip?.name,
          itemName: selectedComponentName,
          details: `Installed ${selectedComponentName || 'component'} on ${selectedShip?.name ?? 'ship'} (${slot})${contextNote}`,
          readinessBefore: before,
          readinessAfter: after,
        })
        setSummary({ success: true, headline: 'Fleet Registry Updated', detail: `Installed ${selectedComponentName || 'component'} on ${selectedShip?.name} (${slot})${contextNote} · Progress ${before}% → ${after}%` })
        // Component and its Slot are reset for the next install — Ship and
        // Loadout are deliberately kept so installing several components
        // in a row on the same Fleet Asset never re-asks those questions.
        setSelectedComponentName('')
        setSlot('')
      } else if (result.blocked === 'reserved-elsewhere') {
        // EWO-029 (Task 7, Scenario F) — never silently steal a unit
        // committed to a different Fleet Asset/Build's active reservation.
        setSummary({
          success: false,
          headline: 'Reserved for another Fleet Asset',
          detail: `"${selectedComponentName || 'That item'}" has no Available stock — the remaining unit(s) are reserved for a different Fleet Asset/Build. Release that reservation first, or install using its own Fleet Asset and Loadout. Nothing was changed.`,
        })
      } else {
        // EWO-030 (Task 5) — the compatible-slot-filtering + auto-select
        // above means the normal workflow can no longer reach this path;
        // it remains as defensive programming only (e.g. a slot's status
        // changed out from under a stale selection).
        setSummary({ success: false, headline: 'No open slot matched', detail: `${buildContext?.name ?? 'The selected Loadout'} has no outstanding hardpoint for "${selectedComponentName || 'that item'}" in ${slot}. Nothing was changed.` })
      }
    } else if (changeType === 'Remove Component') {
      const before = buildContext?.readiness
      const result = removeComponent(shipId, slot, returnToHangar, effectiveBuildContextId || undefined)
      const after = useFleetStore.getState().builds.find((b) => b.id === effectiveBuildContextId)?.readiness
      const contextNote = effectiveBuildContextId !== selectedShip?.activeBuildId ? ` (Loadout Context: ${buildContext?.name ?? 'selected Loadout'} — Active Loadout unchanged)` : ''
      if (result.matched) {
        addLogEntry({
          action: returnToHangar ? 'Removed component to Hangar' : 'Removed component',
          shipName: selectedShip?.name,
          itemName: result.itemName,
          details: `Removed ${result.itemName} from ${selectedShip?.name ?? 'ship'} (${slot})${contextNote}${returnToHangar ? ' — returned to Hangar' : ''}`,
          readinessBefore: before,
          readinessAfter: after,
        })
        setSummary({
          success: true,
          headline: 'Fleet Registry Updated',
          detail: `Removed ${result.itemName} from ${selectedShip?.name} (${slot})${contextNote} · Progress ${before}% → ${after}%${returnToHangar ? ' · Returned to Hangar' : ''}`,
        })
      } else {
        setSummary({ success: false, headline: 'Nothing to remove', detail: `${slot} on ${selectedShip?.name} (${buildContext?.name ?? 'selected Loadout'}) is already empty.` })
      }
    } else if (changeType === 'Add Component to Hangar') {
      const entry = selectedComponentName ? catalogComponentsByName.get(selectedComponentName) : undefined
      if (!selectedComponentName || !entry) {
        setSummary({ success: false, headline: 'Select a component', detail: 'Choose a real catalog component before saving.' })
        return
      }
      addHangarItem({ name: selectedComponentName, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass })
      setSummary({ success: true, headline: 'Fleet Registry Updated', detail: `Added ${selectedComponentName} to Hangar` })
      setSelectedComponentName('')
    } else if (changeType === 'Move Component Between Ships') {
      const toShip = ships.find((s) => s.id === toShipId)
      const result = moveComponentBetweenShips(shipId, slot, toShipId, toSlot)
      if (result.matched) {
        setSummary({ success: true, headline: 'Fleet Registry Updated', detail: `Moved ${result.itemName} from ${selectedShip?.name} to ${toShip?.name}` })
      } else {
        setSummary({ success: false, headline: 'Move failed', detail: result.message ?? `Either ${slot} on ${selectedShip?.name} is empty, or ${toShip?.name} has no compatible open slot.` })
      }
    } else {
      // Set Active Loadout
      const build = builds.find((b) => b.id === buildId)
      if (build && selectedShip) {
        const before = selectedShip.readiness
        setActiveBuild(shipId, buildId)
        addLogEntry({
          action: 'Operational Assignment Updated',
          shipName: selectedShip.name,
          itemName: build.name,
          details: `Switched ${selectedShip.name} to ${build.name}`,
          readinessBefore: before,
          readinessAfter: build.readiness,
        })
        setSummary({ success: true, headline: 'Fleet Registry Updated', detail: `${selectedShip.name} is now on ${build.name}` })
      } else {
        setSummary({ success: false, headline: 'Select a Loadout', detail: 'Select a ship and a Loadout to switch to.' })
      }
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        {/* EWO-061 — Operational Header Standardization (§30): the
            reassurance-copy paragraph is dropped — the single-field form
            immediately below already communicates the page's purpose. */}
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Quick Update</p>
        <h1 className="text-2xl font-display font-bold text-white">What changed?</h1>
      </div>

      <div className="panel p-6 space-y-5">
        <div>
          <label className="text-xs uppercase tracking-widest text-muted block mb-2">What changed?</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {changeTypes.map((type) => (
              <button
                key={type}
                onClick={() => {
                  setChangeType(type)
                  setSummary(null)
                }}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border text-left transition-colors ${
                  changeType === type
                    ? 'bg-cyan/10 border-cyan/40 text-cyan'
                    : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* EWO-030 (Task 2) — Install Component now walks Component -> Ship
            -> Loadout -> Compatible Slot, each step revealed only once the
            one before it is answered, and the canonical catalog search
            renderer (Task 1) replaces the old free-text search. */}
        {changeType === 'Install Component' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">Component</label>
              <CatalogComponentSearch
                selectedName={selectedComponentName}
                onSelect={(name) => {
                  setSelectedComponentName(name)
                  setSlot('')
                }}
              />
            </div>

            {selectedComponentName && (
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-2">Ship</label>
                <select
                  value={shipId}
                  onChange={(e) => {
                    setShipId(e.target.value)
                    setBuildContextId('')
                    setSlot('')
                  }}
                  className="w-full"
                >
                  {ships.map((s) => (
                    <option key={s.id} value={s.id}>
                      {fleetAssetOptionLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedComponentName && shipId && (
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-2">Loadout</label>
                <select
                  value={effectiveBuildContextId}
                  onChange={(e) => {
                    setBuildContextId(e.target.value)
                    setSlot('')
                  }}
                  className="w-full"
                >
                  {shipBuilds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}{b.id === selectedShip?.activeBuildId ? ' (Active)' : ''}
                    </option>
                  ))}
                </select>
                {effectiveBuildContextId !== selectedShip?.activeBuildId && (
                  <p className="text-[11px] text-cyan/80 mt-1.5">
                    Installing under a non-active Loadout only changes that Loadout's progress — {selectedShip?.name}'s Active Loadout stays {buildName(selectedShip?.activeBuildId ?? '')}.
                  </p>
                )}
              </div>
            )}

            {selectedComponentName && effectiveBuildContextId && (
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-2">Slot</label>
                {compatibleSlotOptions.length === 0 ? (
                  <p className="text-xs text-warning">No compatible open slot for {selectedComponentName} in {buildContext?.name ?? 'this Loadout'}.</p>
                ) : (
                  <select value={slot} onChange={(e) => setSlot(e.target.value)} className="w-full">
                    {compatibleSlotOptions.length > 1 && <option value="">Select a slot…</option>}
                    {compatibleSlotOptions.map((hp) => (
                      <option key={hp.id} value={hp.slotLabel}>
                        {hp.slotLabel} ({hp.size} {hp.type})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        )}

        {changeType === 'Add Component to Hangar' && (
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Component</label>
            <CatalogComponentSearch selectedName={selectedComponentName} onSelect={setSelectedComponentName} />
          </div>
        )}

        {(changeType === 'Remove Component' || changeType === 'Move Component Between Ships') && (
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Loadout Context</label>
            <select value={effectiveBuildContextId} onChange={(e) => setBuildContextId(e.target.value)} className="w-full">
              {shipBuilds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.id === selectedShip?.activeBuildId ? ' (Active)' : ''}
                </option>
              ))}
            </select>
            {effectiveBuildContextId !== selectedShip?.activeBuildId && (
              <p className="text-[11px] text-cyan/80 mt-1.5">
                Installing under a non-active Loadout only changes that Loadout's progress — {selectedShip?.name}'s Active Loadout stays {buildName(selectedShip?.activeBuildId ?? '')}.
              </p>
            )}
          </div>
        )}

        {(changeType === 'Remove Component' || changeType === 'Move Component Between Ships' || changeType === 'Set Active Loadout') && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">
                {changeType === 'Move Component Between Ships' ? 'From Ship' : 'Ship'}
              </label>
              <select value={shipId} onChange={(e) => setShipId(e.target.value)} className="w-full">
                {ships.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fleetAssetOptionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            {changeType === 'Set Active Loadout' ? (
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-2">Loadout</label>
                <select value={buildId} onChange={(e) => setBuildId(e.target.value)} className="w-full">
                  <option value="">Select a Loadout…</option>
                  {shipBuilds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-2">
                  {changeType === 'Move Component Between Ships' ? 'From Slot' : 'Slot'}
                </label>
                <select value={slot} onChange={(e) => setSlot(e.target.value)} className="w-full">
                  {slots.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {changeType === 'Remove Component' && (
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input type="checkbox" checked={returnToHangar} onChange={(e) => setReturnToHangar(e.target.checked)} className="accent-cyan" />
            Return removed component to Hangar
          </label>
        )}

        {changeType === 'Move Component Between Ships' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">To Ship</label>
              <select value={toShipId} onChange={(e) => setToShipId(e.target.value)} className="w-full">
                {ships.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fleetAssetOptionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">To Slot</label>
              <select value={toSlot} onChange={(e) => setToSlot(e.target.value)} className="w-full">
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <button
          disabled={!canSave}
          onClick={handleSave}
          className="w-full inline-flex items-center justify-center gap-2 bg-cyan text-bg font-semibold text-sm py-3 rounded-lg hover:bg-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Zap size={16} /> Save Update
        </button>
      </div>

      {summary && (
        <div className={`panel p-5 flex items-start gap-3 ${summary.success ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
          {summary.success ? (
            <CheckCircle2 className="text-success shrink-0 mt-0.5" size={20} />
          ) : (
            <AlertCircle className="text-warning shrink-0 mt-0.5" size={20} />
          )}
          <div>
            <p className={`font-display font-semibold ${summary.success ? 'text-success' : 'text-warning'}`}>{summary.headline}</p>
            <p className="text-sm text-white/80 mt-1">{summary.detail}</p>
            {summary.success && <p className="text-xs text-muted mt-2">Recorded in Captain's Log.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
