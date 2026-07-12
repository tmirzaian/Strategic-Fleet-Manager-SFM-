import { useState } from 'react'
import { Plus, Send, X, CheckCircle2, AlertCircle, PackageX } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import Badge, { dispositionTone } from '../components/Badge'
import SortableHeader from '../components/SortableHeader'
import type { Disposition } from '../types'
import { sortHangarItems, type HangarSortColumn, type SortDirection } from '../utils/hangarSort'
import { calculateComponentAvailability } from '../engine/logistics/availability'

const dispositions: Disposition[] = ['Install', 'Store', 'Stockpile', 'Trade', 'Ignore']

export default function HangarInventory() {
  const hangarItems = useFleetStore((s) => s.hangarItems)
  const ships = useFleetStore((s) => s.ships)
  const installedLoadouts = useFleetStore((s) => s.installedLoadouts)
  const reservations = useFleetStore((s) => s.reservations)
  const updateHangarDisposition = useFleetStore((s) => s.updateHangarDisposition)
  const addHangarItem = useFleetStore((s) => s.addHangarItem)
  const moveToShip = useFleetStore((s) => s.moveToShip)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', type: '', size: 'S1', qty: 1 })
  const [moveItemId, setMoveItemId] = useState<string | null>(null)
  const [moveShipId, setMoveShipId] = useState('')
  const [moveResult, setMoveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [sortColumn, setSortColumn] = useState<HangarSortColumn>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const sortedItems = sortHangarItems(hangarItems, sortColumn, sortDirection)

  function handleSort(column: HangarSortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const openMove = (itemId: string) => {
    setMoveItemId(itemId)
    setMoveShipId(ships[0]?.id ?? '')
    setMoveResult(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Hangar Inventory</p>
          <h1 className="text-2xl font-display font-bold text-white">What do I own?</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setNewItem({ name: '', type: '', size: 'S1', qty: 1 })
              setAddOpen(true)
            }}
            className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
          >
            <Plus size={15} /> Add New Item
          </button>
        </div>
      </div>

      {hangarItems.length === 0 ? (
        <div className="panel p-10 flex flex-col items-center text-center gap-2">
          <PackageX size={28} className="text-muted/60 mb-1" />
          <h2 className="font-display font-semibold text-white">No Inventory Recorded</h2>
          <p className="text-sm text-muted max-w-sm">Quartermaster has no components recorded for this command.</p>
        </div>
      ) : (
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                <SortableHeader label="Item" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Type" column="type" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Size" column="size" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <th className="px-3 py-3 font-medium">Installed</th>
                <th className="px-3 py-3 font-medium">Reserved</th>
                <th className="px-3 py-3 font-medium">Available</th>
                <th className="px-3 py-3 font-medium">Needed By</th>
                <th className="px-3 py-3 font-medium">Disposition</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => {
                const availability = calculateComponentAvailability(item.name, hangarItems, installedLoadouts, reservations)
                const itemReservations = reservations.filter((r) => r.componentName === item.name && r.status === 'ACTIVE')
                return (
                <tr key={item.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-white font-medium whitespace-nowrap">{item.name}</td>
                  <td className="px-5 py-3 text-muted whitespace-nowrap">{item.type}</td>
                  <td className="px-5 py-3 text-muted">{item.size}</td>
                  <td className="px-3 py-3 font-mono text-muted">{availability.installedQuantity}</td>
                  <td className="px-3 py-3 font-mono">
                    {availability.reservedQuantity > 0 ? (
                      <span className="text-cyan" title={itemReservations.map((r) => `${r.fleetAssetId} — ${r.targetSlotLabel}`).join(', ')}>
                        {availability.reservedQuantity}
                      </span>
                    ) : (
                      <span className="text-muted/50">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-success">{availability.availableQuantity}</td>
                  <td className="px-3 py-3 text-muted">
                    <span className="block max-w-[150px] truncate" title={item.neededBy}>
                      {item.neededBy}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {editingId === item.id ? (
                      <select
                        autoFocus
                        defaultValue={item.disposition}
                        onBlur={() => setEditingId(null)}
                        onChange={(e) => {
                          updateHangarDisposition(item.id, e.target.value as Disposition)
                          setEditingId(null)
                        }}
                        className="bg-black/30 border border-cyan/30 rounded-md px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        {dispositions.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button onClick={() => setEditingId(item.id)}>
                        <Badge tone={dispositionTone(item.disposition)}>{item.disposition}</Badge>
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => openMove(item.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan hover:underline"
                    >
                      <Send size={13} /> Move to Ship
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Add New Item modal */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setAddOpen(false)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-white">Add New Item</h3>
              <button onClick={() => setAddOpen(false)} className="text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Component Name</label>
                <input
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="e.g. Mirage"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-cyan/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Type</label>
                  <input
                    value={newItem.type}
                    onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                    placeholder="Shield"
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-cyan/50"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Size</label>
                  <input
                    value={newItem.size}
                    onChange={(e) => setNewItem({ ...newItem, size: e.target.value })}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={newItem.qty}
                  onChange={(e) => setNewItem({ ...newItem, qty: Number(e.target.value) })}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                />
              </div>
            </div>
            <button
              disabled={!newItem.name.trim()}
              onClick={() => {
                addHangarItem({ name: newItem.name.trim(), type: newItem.type || 'Component', size: newItem.size, qty: newItem.qty, neededBy: 'None', disposition: 'Store' })
                setAddOpen(false)
              }}
              className="mt-4 w-full bg-cyan text-bg font-semibold text-sm py-2 rounded-lg hover:bg-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add to Hangar
            </button>
          </div>
        </div>
      )}

      {/* Move to Ship modal */}
      {moveItemId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setMoveItemId(null)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-white">Move to Ship</h3>
              <button onClick={() => setMoveItemId(null)} className="text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Ship</label>
            <select
              value={moveShipId}
              onChange={(e) => setMoveShipId(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
            >
              {ships.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {moveResult && (
              <div className={`mt-3 flex items-start gap-2 text-xs ${moveResult.success ? 'text-success' : 'text-warning'}`}>
                {moveResult.success ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
                {moveResult.message}
              </div>
            )}
            <button
              onClick={() => {
                const result = moveToShip(moveItemId, moveShipId)
                setMoveResult(result)
                if (result.success) setTimeout(() => setMoveItemId(null), 900)
              }}
              className="mt-4 w-full bg-cyan text-bg font-semibold text-sm py-2 rounded-lg hover:bg-cyan/90 transition-colors"
            >
              Confirm Move
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
