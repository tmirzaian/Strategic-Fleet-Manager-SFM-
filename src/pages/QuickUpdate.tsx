import { useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { findItemCatalog } from '../data/seed'
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
const changeTypes: ChangeType[] = ['Add Component to Hangar', 'Install Component', 'Remove Component', 'Move Component Between Ships', 'Set Active Loadout']
const slots = ['Weapon 1', 'Weapon 2', 'Power 1', 'Power 2', 'Shield 1', 'Shield 2', 'Cooler 1', 'Cooler 2', 'Quantum Drive', 'Radar', 'Life Support']

export default function QuickUpdate() {
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const addLogEntry = useFleetStore((s) => s.addLogEntry)
  const installComponent = useFleetStore((s) => s.installComponent)
  const removeComponent = useFleetStore((s) => s.removeComponent)
  const moveComponentBetweenShips = useFleetStore((s) => s.moveComponentBetweenShips)
  const addHangarItem = useFleetStore((s) => s.addHangarItem)
  const setActiveBuild = useFleetStore((s) => s.setActiveBuild)

  const [changeType, setChangeType] = useState<ChangeType>('Install Component')
  const [itemQuery, setItemQuery] = useState('')
  const [shipId, setShipId] = useState(ships[0]?.id ?? '')
  const [slot, setSlot] = useState(slots[0])
  const [toShipId, setToShipId] = useState(ships[1]?.id ?? ships[0]?.id ?? '')
  const [toSlot, setToSlot] = useState(slots[0])
  const [buildId, setBuildId] = useState('')
  const [buildContextId, setBuildContextId] = useState('')
  const [returnToHangar, setReturnToHangar] = useState(false)
  const [summary, setSummary] = useState<null | { success: boolean; headline: string; detail: string }>(null)

  const matches = useMemo(() => {
    if (!itemQuery.trim()) return []
    return findItemCatalog.filter((c) => c.item.toLowerCase().includes(itemQuery.toLowerCase()))
  }, [itemQuery])

  const selectedShip = ships.find((s) => s.id === shipId)
  const shipBuilds = builds.filter((b) => b.shipId === shipId)
  const buildName = (id: string) => builds.find((b) => b.id === id)?.name ?? 'Unknown Build'
  // Loadout Context defaults to this Fleet Asset's Active Build, but Install
  // /Remove Component can target any Build assigned to it (Part 19-21) —
  // installing under a non-active context never changes activeBuildId.
  const effectiveBuildContextId = buildContextId && shipBuilds.some((b) => b.id === buildContextId) ? buildContextId : selectedShip?.activeBuildId ?? ''
  const buildContext = builds.find((b) => b.id === effectiveBuildContextId)

  function handleSave() {
    if (changeType === 'Install Component') {
      const before = buildContext?.readiness
      const result = installComponent(shipId, itemQuery || 'Component', slot, effectiveBuildContextId || undefined)
      const after = useFleetStore.getState().builds.find((b) => b.id === effectiveBuildContextId)?.readiness
      const contextNote = effectiveBuildContextId !== selectedShip?.activeBuildId ? ` (Loadout Context: ${buildContext?.name ?? 'selected build'} — Active Loadout unchanged)` : ''
      if (result.matched) {
        addLogEntry({
          action: 'Installed component',
          shipName: selectedShip?.name,
          itemName: itemQuery,
          details: `Installed ${itemQuery || 'component'} on ${selectedShip?.name ?? 'ship'} (${slot})${contextNote}`,
          readinessBefore: before,
          readinessAfter: after,
        })
        setSummary({ success: true, headline: 'Update logged', detail: `Installed ${itemQuery || 'component'} on ${selectedShip?.name} (${slot})${contextNote} · Progress ${before}% → ${after}%` })
      } else {
        setSummary({ success: false, headline: 'No open slot matched', detail: `${buildContext?.name ?? 'The selected build'} has no outstanding hardpoint for "${itemQuery || 'that item'}" in ${slot}. Nothing was changed.` })
      }
    } else if (changeType === 'Remove Component') {
      const before = buildContext?.readiness
      const result = removeComponent(shipId, slot, returnToHangar, effectiveBuildContextId || undefined)
      const after = useFleetStore.getState().builds.find((b) => b.id === effectiveBuildContextId)?.readiness
      const contextNote = effectiveBuildContextId !== selectedShip?.activeBuildId ? ` (Loadout Context: ${buildContext?.name ?? 'selected build'} — Active Loadout unchanged)` : ''
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
          headline: 'Update logged',
          detail: `Removed ${result.itemName} from ${selectedShip?.name} (${slot})${contextNote} · Progress ${before}% → ${after}%${returnToHangar ? ' · Returned to Hangar' : ''}`,
        })
      } else {
        setSummary({ success: false, headline: 'Nothing to remove', detail: `${slot} on ${selectedShip?.name} (${buildContext?.name ?? 'selected build'}) is already empty.` })
      }
    } else if (changeType === 'Add Component to Hangar') {
      addHangarItem({ name: itemQuery || 'Component', type: 'Component', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
      setSummary({ success: true, headline: 'Update logged', detail: `Added ${itemQuery || 'item'} to Hangar` })
    } else if (changeType === 'Move Component Between Ships') {
      const toShip = ships.find((s) => s.id === toShipId)
      const result = moveComponentBetweenShips(shipId, slot, toShipId, toSlot)
      if (result.matched) {
        setSummary({ success: true, headline: 'Update logged', detail: `Moved ${result.itemName} from ${selectedShip?.name} to ${toShip?.name}` })
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
          action: 'Active Build changed',
          shipName: selectedShip.name,
          itemName: build.name,
          details: `Switched ${selectedShip.name} to ${build.name}`,
          readinessBefore: before,
          readinessAfter: build.readiness,
        })
        setSummary({ success: true, headline: 'Update logged', detail: `${selectedShip.name} is now on ${build.name}` })
      } else {
        setSummary({ success: false, headline: 'Pick a build', detail: 'Select a ship and a Build to switch to.' })
      }
    }
    setItemQuery('')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Quick Update</p>
        <h1 className="text-2xl font-display font-bold text-white">What changed?</h1>
        <p className="text-sm text-muted mt-1">Log it in under two minutes. Nothing here should feel heavy.</p>
      </div>

      <div className="panel p-6 space-y-5">
        <div>
          <label className="text-xs uppercase tracking-widest text-muted block mb-2">What changed?</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {changeTypes.map((type) => (
              <button
                key={type}
                onClick={() => setChangeType(type)}
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

        {(changeType === 'Install Component' || changeType === 'Add Component to Hangar') && (
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Find Item</label>
            <input
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder="Start typing an item name…"
              className="w-full"
            />
            {matches.length > 0 && (
              <div className="mt-2 space-y-1">
                {matches.map((m) => (
                  <button
                    key={m.item}
                    onClick={() => setItemQuery(m.item)}
                    className="w-full text-left px-3 py-2 rounded-md bg-black/20 hover:bg-cyan/10 border border-white/5 hover:border-cyan/30 transition-colors"
                  >
                    <span className="font-mono text-xs text-muted">{m.path}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(changeType === 'Install Component' || changeType === 'Remove Component') && (
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
                Installing under a non-active Build only changes that Build's progress — {selectedShip?.name}'s Active Build stays {buildName(selectedShip?.activeBuildId ?? '')}.
              </p>
            )}
          </div>
        )}

        {(changeType === 'Install Component' || changeType === 'Remove Component' || changeType === 'Move Component Between Ships' || changeType === 'Set Active Loadout') && (
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
                <label className="text-xs uppercase tracking-widest text-muted block mb-2">Build</label>
                <select value={buildId} onChange={(e) => setBuildId(e.target.value)} className="w-full">
                  <option value="">Select a build…</option>
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
          onClick={handleSave}
          className="w-full inline-flex items-center justify-center gap-2 bg-cyan text-bg font-semibold text-sm py-3 rounded-lg hover:bg-cyan/90 transition-colors"
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
            {summary.success && <p className="text-xs text-muted mt-2">Added to Captain's Log.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
