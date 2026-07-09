import { useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { findItemCatalog } from '../data/seed'

type ChangeType = 'Installed component' | 'Added to Hangar' | 'Claimed ship' | 'Removed component'
const changeTypes: ChangeType[] = ['Installed component', 'Added to Hangar', 'Claimed ship', 'Removed component']
const slots = ['Weapon 1', 'Weapon 2', 'Power 1', 'Power 2', 'Shield 1', 'Shield 2', 'Cooler 1', 'Cooler 2', 'Quantum Drive', 'Radar', 'Life Support']

export default function QuickUpdate() {
  const ships = useFleetStore((s) => s.ships)
  const addLogEntry = useFleetStore((s) => s.addLogEntry)
  const installComponent = useFleetStore((s) => s.installComponent)
  const removeComponent = useFleetStore((s) => s.removeComponent)
  const addHangarItem = useFleetStore((s) => s.addHangarItem)

  const [changeType, setChangeType] = useState<ChangeType>('Installed component')
  const [itemQuery, setItemQuery] = useState('')
  const [shipId, setShipId] = useState(ships[0]?.id ?? '')
  const [slot, setSlot] = useState(slots[0])
  const [summary, setSummary] = useState<null | { success: boolean; headline: string; detail: string }>(null)

  const matches = useMemo(() => {
    if (!itemQuery.trim()) return []
    return findItemCatalog.filter((c) => c.item.toLowerCase().includes(itemQuery.toLowerCase()))
  }, [itemQuery])

  const selectedShip = ships.find((s) => s.id === shipId)
  const needsItem = changeType === 'Installed component' || changeType === 'Added to Hangar'
  const needsSlot = changeType === 'Installed component' || changeType === 'Removed component'
  const needsShip = changeType !== 'Added to Hangar'

  function handleSave() {
    if (changeType === 'Installed component') {
      const before = selectedShip?.readiness
      const result = installComponent(shipId, itemQuery || 'Component', slot)
      const after = ships.find((s) => s.id === shipId)?.readiness
      if (result.matched) {
        addLogEntry({
          action: 'Installed component',
          shipName: selectedShip?.name,
          itemName: itemQuery,
          details: `Installed ${itemQuery || 'component'} on ${selectedShip?.name ?? 'ship'} (${slot})`,
          readinessBefore: before,
          readinessAfter: after,
        })
        setSummary({
          success: true,
          headline: 'Update logged',
          detail: `Installed ${itemQuery || 'component'} on ${selectedShip?.name} (${slot}) · Readiness ${before}% → ${after}%`,
        })
      } else {
        setSummary({
          success: false,
          headline: 'No open slot matched',
          detail: `${selectedShip?.name}'s active build has no outstanding hardpoint for "${itemQuery || 'that item'}" in ${slot}. Nothing was changed.`,
        })
      }
    } else if (changeType === 'Removed component') {
      const before = selectedShip?.readiness
      const result = removeComponent(shipId, slot)
      const after = ships.find((s) => s.id === shipId)?.readiness
      if (result.matched) {
        addLogEntry({
          action: 'Removed component',
          shipName: selectedShip?.name,
          itemName: result.itemName,
          details: `Removed ${result.itemName} from ${selectedShip?.name ?? 'ship'} (${slot})`,
          readinessBefore: before,
          readinessAfter: after,
        })
        setSummary({
          success: true,
          headline: 'Update logged',
          detail: `Removed ${result.itemName} from ${selectedShip?.name} (${slot}) · Readiness ${before}% → ${after}%`,
        })
      } else {
        setSummary({
          success: false,
          headline: 'Nothing to remove',
          detail: `${slot} on ${selectedShip?.name} is already empty.`,
        })
      }
    } else if (changeType === 'Added to Hangar') {
      addHangarItem({ name: itemQuery || 'Component', type: 'Component', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
      setSummary({
        success: true,
        headline: 'Update logged',
        detail: `Added ${itemQuery || 'item'} to Hangar`,
      })
    } else {
      addLogEntry({
        action: 'Claimed ship',
        shipName: selectedShip?.name,
        details: `Claimed ${selectedShip?.name || 'ship'}`,
      })
      setSummary({
        success: true,
        headline: 'Update logged',
        detail: `Claimed ${selectedShip?.name || 'ship'}`,
      })
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
          <div className="grid grid-cols-2 gap-2">
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

        {needsItem && (
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Find Item</label>
            <input
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder="Start typing an item name…"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-cyan/50"
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

        <div className="grid sm:grid-cols-2 gap-4">
          {needsShip && (
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">Ship</label>
              <select
                value={shipId}
                onChange={(e) => setShipId(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
              >
                {ships.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {needsSlot && (
            <div>
              <label className="text-xs uppercase tracking-widest text-muted block mb-2">Slot</label>
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
              >
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

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
