import { useMemo, useState } from 'react'
import { Plus, Send, X, CheckCircle2, AlertCircle, AlertOctagon, PackageX, Pencil, Trash2 } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import Badge, { dispositionTone } from '../components/Badge'
import SortableHeader from '../components/SortableHeader'
import type { Disposition, HangarItem } from '../types'
import { sortHangarItems, type HangarSortColumn, type SortDirection } from '../utils/hangarSort'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { catalogComponentsByName } from '../generated/componentCatalog'
import { resolveComponentLabel } from '../utils/componentPresentation'
import { manufacturerFullNameForCode, manufacturerNameForCode } from '../utils/manufacturerLogo'
import { resolveInventoryDependencies, formatDependencyLabel, totalClaimedQuantity, type InventoryDependency } from '../utils/inventoryDependencies'

const dispositions: Disposition[] = ['Install', 'Store', 'Stockpile', 'Trade', 'Ignore']
// EWO-028 (Task 2) — authoritative component names for the catalog-driven
// "Add New Item" search. Sorted once at module scope, same convention as
// the pre-existing datalist this replaces.
const componentCatalogNames = Array.from(catalogComponentsByName.keys()).sort((a, b) => a.localeCompare(b))
const MAX_VISIBLE_CATALOG_MATCHES = 40

function manufacturerNameFor(code: string | null): string | undefined {
  if (!code) return undefined
  return manufacturerFullNameForCode(code) ?? manufacturerNameForCode(code)
}

export default function HangarInventory() {
  const hangarItems = useFleetStore((s) => s.hangarItems)
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)
  const installedLoadouts = useFleetStore((s) => s.installedLoadouts)
  const reservations = useFleetStore((s) => s.reservations)
  const updateHangarDisposition = useFleetStore((s) => s.updateHangarDisposition)
  const addHangarItem = useFleetStore((s) => s.addHangarItem)
  const updateHangarItemQuantity = useFleetStore((s) => s.updateHangarItemQuantity)
  const deleteHangarItem = useFleetStore((s) => s.deleteHangarItem)
  const moveToShip = useFleetStore((s) => s.moveToShip)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  // EWO-028 (Task 2) — catalog-driven Add: `nameQuery` is free-text
  // search only; `selectedName` is set exclusively by picking a real
  // catalog match, never by typing — "Add to Hangar" stays disabled
  // until a real selection exists (Design Authority Ruling 3).
  const [nameQuery, setNameQuery] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [addQtyInput, setAddQtyInput] = useState('1')
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null)
  const [moveItemId, setMoveItemId] = useState<string | null>(null)
  const [moveShipId, setMoveShipId] = useState('')
  const [moveResult, setMoveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [sortColumn, setSortColumn] = useState<HangarSortColumn>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // EWO-028 (Task 4/6) — Edit Quantity. `editStep` gates the Task 6
  // below-allocation safeguard: 'input' is the normal editable form,
  // 'confirm-reduction' is the explicit warning step a Commander must
  // pass through before a reduction below claimed stock is allowed to save.
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editQtyInput, setEditQtyInput] = useState('')
  const [editStep, setEditStep] = useState<'input' | 'confirm-reduction'>('input')
  const [editError, setEditError] = useState<string | null>(null)

  // EWO-028 (Task 5) — Delete. Dependencies are resolved once when the
  // modal opens (resolveInventoryDependencies — the one shared resolver,
  // Task 7) so the warning and the eventual delete act on the same
  // snapshot the Commander actually read.
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)

  const sortedItems = sortHangarItems(hangarItems, sortColumn, sortDirection)

  const filteredCatalogMatches = useMemo(() => {
    const q = nameQuery.trim().toLowerCase()
    const matches = q ? componentCatalogNames.filter((n) => n.toLowerCase().includes(q)) : componentCatalogNames
    return matches.slice(0, MAX_VISIBLE_CATALOG_MATCHES)
  }, [nameQuery])
  const selectedCatalogEntry = selectedName ? catalogComponentsByName.get(selectedName) : undefined
  const selectedLabel = selectedName ? resolveComponentLabel(selectedName) : null
  const parsedAddQty = Number(addQtyInput)
  const isAddQtyValid = Number.isInteger(parsedAddQty) && parsedAddQty > 0
  const canAddToHangar = Boolean(selectedCatalogEntry) && isAddQtyValid

  const editItem = editItemId ? hangarItems.find((i) => i.id === editItemId) ?? null : null
  const editDependencies: InventoryDependency[] = editItem ? resolveInventoryDependencies(editItem.name, ships, builds, fleetAssets, installedLoadouts, reservations) : []
  const editClaimed = totalClaimedQuantity(editDependencies)
  const parsedEditQty = Number(editQtyInput)
  const isEditQtyValid = Number.isInteger(parsedEditQty) && parsedEditQty >= 0

  const deleteItem = deleteItemId ? hangarItems.find((i) => i.id === deleteItemId) ?? null : null
  const deleteDependencies: InventoryDependency[] = deleteItem ? resolveInventoryDependencies(deleteItem.name, ships, builds, fleetAssets, installedLoadouts, reservations) : []

  function openEdit(item: HangarItem) {
    setEditItemId(item.id)
    setEditQtyInput(String(item.qty))
    setEditStep('input')
    setEditError(null)
  }

  function confirmEditSave() {
    if (!editItem) return
    if (!isEditQtyValid) {
      setEditError('Quantity must be a non-negative whole number.')
      return
    }
    if (parsedEditQty < editClaimed && editStep === 'input') {
      setEditStep('confirm-reduction')
      return
    }
    const result = updateHangarItemQuantity(editItem.id, parsedEditQty)
    if (result.success) {
      setEditItemId(null)
    } else {
      setEditError(result.message ?? 'Could not update quantity.')
    }
  }

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
              setNameQuery('')
              setSelectedName('')
              setAddQtyInput('1')
              setAddResult(null)
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
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-3">
                      <button
                        onClick={() => openMove(item.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan hover:underline"
                      >
                        <Send size={13} /> Move to Ship
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-white transition-colors"
                        title="Edit Quantity"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteItemId(item.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-danger transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Add New Item modal — EWO-028 (Task 2): catalog-driven. The
          Commander must select a real catalog component from the list;
          typing alone never creates a record (Design Authority Ruling 3). */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setAddOpen(false)}>
          <div className="panel p-6 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                  value={nameQuery}
                  onChange={(e) => {
                    setNameQuery(e.target.value)
                    setSelectedName('')
                    setAddResult(null)
                  }}
                  placeholder="Search catalog components…"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-cyan/50"
                />
                <select
                  size={6}
                  value={selectedName}
                  onChange={(e) => {
                    setSelectedName(e.target.value)
                    setAddResult(null)
                  }}
                  className="mt-2 w-full bg-black/30 border border-white/10 rounded-lg text-sm text-white"
                >
                  {filteredCatalogMatches.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {nameQuery && filteredCatalogMatches.length === 0 && <p className="text-xs text-muted mt-1.5">No matching catalog component — free-text entries are not accepted.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Type</label>
                  <div className="w-full bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-sm text-muted/80">{selectedCatalogEntry?.category ?? '—'}</div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Size</label>
                  <div className="w-full bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-sm text-muted/80">{selectedCatalogEntry ? `S${selectedCatalogEntry.size}` : '—'}</div>
                </div>
              </div>
              {selectedCatalogEntry && (selectedLabel?.gradeLabel || manufacturerNameFor(selectedCatalogEntry.manufacturerCode)) && (
                <div className="text-xs text-muted flex flex-wrap gap-x-3 gap-y-1">
                  {selectedLabel?.gradeLabel && <span>{selectedLabel.gradeLabel}</span>}
                  {manufacturerNameFor(selectedCatalogEntry.manufacturerCode) && <span>{manufacturerNameFor(selectedCatalogEntry.manufacturerCode)}</span>}
                </div>
              )}
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Quantity</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={addQtyInput}
                  onChange={(e) => {
                    setAddQtyInput(e.target.value)
                    setAddResult(null)
                  }}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                />
                {!isAddQtyValid && addQtyInput !== '' && <p className="text-xs text-danger mt-1">Quantity must be a positive whole number.</p>}
              </div>
            </div>
            {addResult && (
              <p className={`mt-3 text-xs ${addResult.success ? 'text-success' : 'text-danger'}`}>{addResult.message}</p>
            )}
            <button
              disabled={!canAddToHangar}
              onClick={() => {
                if (!selectedCatalogEntry) return
                const result = addHangarItem({
                  name: selectedName,
                  type: selectedCatalogEntry.category,
                  size: `S${selectedCatalogEntry.size}`,
                  qty: parsedAddQty,
                  neededBy: 'None',
                  disposition: 'Store',
                  entityClass: selectedCatalogEntry.entityClass,
                })
                if (result.success) {
                  setAddResult({ success: true, message: result.merged ? `Added to existing ${selectedName} stock.` : `${selectedName} added to Hangar.` })
                  setTimeout(() => setAddOpen(false), 700)
                } else {
                  setAddResult({ success: false, message: result.message ?? 'Could not add item.' })
                }
              }}
              className="mt-4 w-full bg-cyan text-bg font-semibold text-sm py-2 rounded-lg hover:bg-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add to Hangar
            </button>
          </div>
        </div>
      )}

      {/* Edit Quantity modal — EWO-028 (Task 4/6) */}
      {editItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setEditItemId(null)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-white">Edit "{editItem.name}"</h3>
              <button onClick={() => setEditItemId(null)} className="text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            {editStep === 'input' ? (
              <>
                <p className="text-xs text-muted mb-3">Component identity, Type, and Size are read-only — delete and re-add to record a different component.</p>
                <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Quantity</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  autoFocus
                  value={editQtyInput}
                  onChange={(e) => {
                    setEditQtyInput(e.target.value)
                    setEditError(null)
                  }}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                />
                {editError && <p className="text-xs text-danger mt-1.5">{editError}</p>}
                <button
                  onClick={confirmEditSave}
                  className="mt-4 w-full bg-cyan text-bg font-semibold text-sm py-2 rounded-lg hover:bg-cyan/90 transition-colors"
                >
                  Save
                </button>
              </>
            ) : (
              <div>
                <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 text-sm text-white">
                  <AlertOctagon size={16} className="text-warning shrink-0 mt-0.5" />
                  <div>
                    <p>
                      You own {editItem.qty} {editItem.name}
                      {editItem.qty === 1 ? '' : 's'}.
                    </p>
                    <ul className="mt-2 space-y-1 text-muted">
                      {editDependencies.map((dep, i) => (
                        <li key={i}>
                          {dep.quantity} {dep.kind === 'INSTALLED' ? 'is installed on' : 'is reserved for'}: {formatDependencyLabel(dep)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2">
                      Reducing quantity to {parsedEditQty} will leave {editClaimed - parsedEditQty} allocation{editClaimed - parsedEditQty === 1 ? '' : 's'} unfulfilled.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setEditStep('input')} className="flex-1 border border-white/15 text-white text-sm py-2 rounded-lg hover:border-white/35 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={confirmEditSave}
                    className="flex-1 bg-warning text-bg font-semibold text-sm py-2 rounded-lg hover:bg-warning/90 transition-colors"
                  >
                    Continue Anyway
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal — EWO-028 (Task 5) */}
      {deleteItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setDeleteItemId(null)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-white">Delete "{deleteItem.name}"?</h3>
              <button onClick={() => setDeleteItemId(null)} className="text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            {deleteDependencies.length === 0 ? (
              <p className="text-sm text-muted">Are you sure you want to delete "{deleteItem.name}" from Hangar Inventory?</p>
            ) : (
              <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-white">
                <AlertOctagon size={16} className="text-danger shrink-0 mt-0.5" />
                <div>
                  <p>This component is currently in use:</p>
                  <ul className="mt-2 space-y-1 text-muted">
                    {deleteDependencies.map((dep, i) => (
                      <li key={i}>
                        {dep.kind === 'INSTALLED' ? 'Installed on' : 'Reserved for'}: {formatDependencyLabel(dep)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">Deleting it will leave {deleteDependencies.length === 1 ? 'that allocation' : 'those allocations'} unfulfilled.</p>
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDeleteItemId(null)} className="flex-1 border border-white/15 text-white text-sm py-2 rounded-lg hover:border-white/35 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteHangarItem(deleteItem.id)
                  setDeleteItemId(null)
                }}
                className="flex-1 bg-danger text-white font-semibold text-sm py-2 rounded-lg hover:bg-danger/90 transition-colors"
              >
                {deleteDependencies.length === 0 ? 'Delete' : 'Delete Anyway'}
              </button>
            </div>
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
