import { useEffect, useMemo, useState } from 'react'
import { Plus, Send, X, AlertOctagon, PackageX, Pencil, Trash2, Lock, Sparkles } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import SortableHeader from '../components/SortableHeader'
import CatalogComponentSearch from '../components/CatalogComponentSearch'
import type { HangarItem } from '../types'
import { sortHangarItems, type HangarSortColumn, type SortDirection } from '../utils/hangarSort'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { catalogComponentsByName } from '../generated/componentCatalog'
import {
  resolveInventoryDependencies,
  formatDependencyLabel,
  totalClaimedQuantity,
  resolveNeededByBuilds,
  type InventoryDependency,
  type NeededByEntry,
} from '../utils/inventoryDependencies'

export default function HangarInventory() {
  const hangarItems = useFleetStore((s) => s.hangarItems)
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const installedLoadouts = useFleetStore((s) => s.installedLoadouts)
  const reservations = useFleetStore((s) => s.reservations)
  const addHangarItem = useFleetStore((s) => s.addHangarItem)
  const updateHangarItemQuantity = useFleetStore((s) => s.updateHangarItemQuantity)
  const deleteHangarItem = useFleetStore((s) => s.deleteHangarItem)
  const reserveComponent = useFleetStore((s) => s.reserveComponent)
  const releaseReservation = useFleetStore((s) => s.releaseReservation)

  const [addOpen, setAddOpen] = useState(false)
  // EWO-028 (Task 2) — catalog-driven Add: `selectedName` is set
  // exclusively by CatalogComponentSearch picking a real catalog match,
  // never by typing — "Add to Hangar" stays disabled until a real
  // selection exists (Design Authority Ruling 3). EWO-030 (Task 1)
  // extracted the search/select renderer itself into the shared
  // CatalogComponentSearch component (also used by Quick Update), so this
  // page no longer owns the search-query or auto-select logic directly.
  const [selectedName, setSelectedName] = useState('')
  const [addQtyInput, setAddQtyInput] = useState('1')
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null)
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

  // EWO-029 (Task 4) — Reserve. `reserveShipId`/`reserveBuildId`/
  // `reserveSlotLabel` narrow step by step — each selection filters the
  // next, exactly like the mission's own required flow (exact Fleet
  // Asset -> exact Build -> exact target requirement).
  const [reserveItemId, setReserveItemId] = useState<string | null>(null)
  const [reserveShipId, setReserveShipId] = useState('')
  const [reserveBuildId, setReserveBuildId] = useState('')
  const [reserveSlotLabel, setReserveSlotLabel] = useState('')
  const [reserveQtyInput, setReserveQtyInput] = useState('1')
  const [reserveResult, setReserveResult] = useState<{ success: boolean; message: string } | null>(null)

  // EWO-029 (Task 6) — Manage/Release Reservations for one component.
  const [manageItemId, setManageItemId] = useState<string | null>(null)

  const sortedItems = sortHangarItems(hangarItems, sortColumn, sortDirection)

  const selectedCatalogEntry = selectedName ? catalogComponentsByName.get(selectedName) : undefined
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

  // EWO-029 (Task 4) — Reserve workflow. `reserveNeededBy` is this exact
  // component's own unresolved-and-unreserved requirements fleet-wide
  // (the shared resolver, Task 7's own EWO-028 principle extended) —
  // narrowed by chosen ship, then by chosen Build, to the exact target
  // slot list Design Authority Ruling 11 requires ("compatible Build
  // requirements only").
  const reserveItem = reserveItemId ? hangarItems.find((i) => i.id === reserveItemId) ?? null : null
  const reserveAvailability = reserveItem ? calculateComponentAvailability(reserveItem.name, hangarItems, installedLoadouts, reservations, reserveItem.entityClass) : null
  const reserveNeededBy: NeededByEntry[] = reserveItem ? resolveNeededByBuilds(reserveItem.name, ships, builds, fleetAssets, hardpoints, reservations) : []
  const reserveUnreservedNeededBy = reserveNeededBy.filter((e) => !e.reserved)
  const reserveShipOptions = useMemo(() => {
    const shipIds = new Set(reserveUnreservedNeededBy.map((e) => e.shipId))
    return ships.filter((s) => shipIds.has(s.id))
  }, [reserveUnreservedNeededBy, ships])
  const reserveBuildOptions = reserveUnreservedNeededBy.filter((e) => e.shipId === reserveShipId)
  const reserveSlotOptions = reserveBuildOptions.filter((e) => e.buildId === reserveBuildId)
  const parsedReserveQty = Number(reserveQtyInput)
  const isReserveQtyValid = Number.isInteger(parsedReserveQty) && parsedReserveQty > 0 && Boolean(reserveAvailability) && parsedReserveQty <= (reserveAvailability?.availableQuantity ?? 0)

  useEffect(() => {
    if (reserveShipOptions.length === 1) setReserveShipId(reserveShipOptions[0].id)
  }, [reserveShipOptions])
  useEffect(() => {
    const buildIds = Array.from(new Set(reserveBuildOptions.map((e) => e.buildId)))
    if (buildIds.length === 1) setReserveBuildId(buildIds[0])
  }, [reserveBuildOptions])
  useEffect(() => {
    if (reserveSlotOptions.length === 1) setReserveSlotLabel(reserveSlotOptions[0].slotLabel)
  }, [reserveSlotOptions])

  function openReserve(item: HangarItem) {
    setReserveItemId(item.id)
    setReserveShipId('')
    setReserveBuildId('')
    setReserveSlotLabel('')
    setReserveQtyInput('1')
    setReserveResult(null)
  }

  function confirmReserve() {
    if (!reserveItem || !reserveBuildId || !reserveShipId || !reserveSlotLabel || !isReserveQtyValid) return
    const result = reserveComponent({
      missionConfigurationId: reserveBuildId,
      fleetAssetId: reserveShipId,
      targetSlotLabel: reserveSlotLabel,
      componentName: reserveItem.name,
      quantity: parsedReserveQty,
    })
    if (result.success) {
      setReserveResult({ success: true, message: `Reserved ${parsedReserveQty} ${reserveItem.name} for ${reserveBuildOptions.find((e) => e.buildId === reserveBuildId)?.buildName ?? 'the selected Loadout'}.` })
      setTimeout(() => setReserveItemId(null), 900)
    } else {
      setReserveResult({ success: false, message: result.message ?? 'Could not reserve this component.' })
    }
  }

  // EWO-029 (Task 6) — Manage/Release Reservations.
  const manageItem = manageItemId ? hangarItems.find((i) => i.id === manageItemId) ?? null : null
  const manageReservations: InventoryDependency[] = manageItem
    ? resolveInventoryDependencies(manageItem.name, ships, builds, fleetAssets, installedLoadouts, reservations).filter((d) => d.kind === 'RESERVED')
    : []

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
              {/* EWO-029 (Task 2/3) — the row-wide Disposition column is
                  removed for Beta (Design Authority Rulings 3/9/10):
                  Available/Reserved/Installed are the only authoritative,
                  calculated allocation states now shown. Hangar Quantity
                  is added so the raw owned-and-not-installed stock a
                  Commander is editing is never ambiguous relative to the
                  calculated columns beside it. */}
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                <SortableHeader label="Item" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Type" column="type" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Size" column="size" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <th className="px-3 py-3 font-medium" title="Total units recorded in Hangar Inventory, before Installed is subtracted — Available + Reserved.">
                  Hangar Qty
                </th>
                <th className="px-3 py-3 font-medium">Installed</th>
                <th className="px-3 py-3 font-medium">Reserved</th>
                <th className="px-3 py-3 font-medium">Available</th>
                <th className="px-3 py-3 font-medium">Needed By</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => {
                const availability = calculateComponentAvailability(item.name, hangarItems, installedLoadouts, reservations, item.entityClass)
                const neededBy = resolveNeededByBuilds(item.name, ships, builds, fleetAssets, hardpoints, reservations)
                const unreservedNeededBy = neededBy.filter((e) => !e.reserved)
                // EWO-029 (Task 8/9/10) — an Available, unreserved match:
                // real fleet demand exists AND stock is free to cover it.
                // Never auto-reserved, never marked Installed — only surfaced.
                const upgradeOpportunityCount = Math.min(unreservedNeededBy.length, availability.availableQuantity)
                return (
                <tr key={item.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-white font-medium whitespace-nowrap">{item.name}</td>
                  <td className="px-5 py-3 text-muted whitespace-nowrap">{item.type}</td>
                  <td className="px-5 py-3 text-muted">{item.size}</td>
                  <td className="px-3 py-3 font-mono text-muted/80">{item.qty}</td>
                  <td className="px-3 py-3 font-mono text-muted">{availability.installedQuantity}</td>
                  <td className="px-3 py-3 font-mono">
                    {availability.reservedQuantity > 0 ? (
                      <button
                        onClick={() => setManageItemId(item.id)}
                        className="text-cyan hover:underline"
                        title="Manage reservations for this component"
                      >
                        {availability.reservedQuantity}
                      </button>
                    ) : (
                      <span className="text-muted/50">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-success">{availability.availableQuantity}</td>
                  <td className="px-3 py-3 text-muted">
                    {neededBy.length === 0 ? (
                      <span className="text-muted/50">—</span>
                    ) : (
                      <div
                        className="max-w-[190px]"
                        title={neededBy.map((e) => `${formatDependencyLabel({ kind: 'RESERVED', fleetAssetId: e.shipId, fleetAssetLabel: e.fleetAssetLabel, hullName: e.hullName, buildId: e.buildId, buildName: e.buildName, quantity: 1 })}${e.reserved ? ' (Reserved)' : ' (Unreserved)'} — ${e.slotLabel}`).join('\n')}
                      >
                        <span className="block truncate">
                          Needed by {neededBy.length} Build{neededBy.length === 1 ? '' : 's'}
                        </span>
                        {upgradeOpportunityCount > 0 && (
                          <button
                            onClick={() => openReserve(item)}
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-cyan hover:underline"
                          >
                            <Sparkles size={11} /> {upgradeOpportunityCount} unreserved match{upgradeOpportunityCount === 1 ? '' : 'es'} — Reserve
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-3">
                      {availability.availableQuantity > 0 && (
                        <button
                          onClick={() => openReserve(item)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
                        >
                          <Lock size={13} /> Reserve
                        </button>
                      )}
                      {/* EWO-STAB-002 — Move to Ship disabled during Beta
                          stabilization: its underlying store path
                          (moveToShip -> installComponent with no explicit
                          slot) let a component land in the first open slot
                          on a ship regardless of type/size compatibility.
                          Use Quick Update -> Install Component instead,
                          which always requires an explicit, compatible
                          slot. Kept visible (not removed) so this reads as
                          a known, intentional, temporary restriction. */}
                      <button
                        type="button"
                        disabled
                        title="Temporarily unavailable during Beta stabilization. Use Quick Update → Install Component."
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted/40 cursor-not-allowed"
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
                <CatalogComponentSearch
                  selectedName={selectedName}
                  onSelect={(name) => {
                    setSelectedName(name)
                    setAddResult(null)
                  }}
                />
              </div>
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

      {/* Reserve modal — EWO-029 (Task 4/5): exact Fleet Asset -> exact
          Build -> exact target requirement -> quantity, never automatic. */}
      {reserveItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setReserveItemId(null)}>
          <div className="panel p-6 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-white">Reserve "{reserveItem.name}"</h3>
              <button onClick={() => setReserveItemId(null)} className="text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            {reserveUnreservedNeededBy.length === 0 ? (
              <p className="text-sm text-muted">No saved Loadout currently has an unresolved, unreserved requirement for "{reserveItem.name}".</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted">{reserveAvailability?.availableQuantity ?? 0} available to reserve.</p>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Fleet Asset</label>
                  <select
                    value={reserveShipId}
                    onChange={(e) => {
                      setReserveShipId(e.target.value)
                      setReserveBuildId('')
                      setReserveSlotLabel('')
                    }}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                  >
                    <option value="">Select a Fleet Asset…</option>
                    {reserveShipOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                {reserveShipId && (
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Build / Loadout</label>
                    <select
                      value={reserveBuildId}
                      onChange={(e) => {
                        setReserveBuildId(e.target.value)
                        setReserveSlotLabel('')
                      }}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                    >
                      <option value="">Select a Loadout…</option>
                      {Array.from(new Map(reserveBuildOptions.map((e) => [e.buildId, e.buildName])).entries()).map(([buildId, buildName]) => (
                        <option key={buildId} value={buildId}>
                          {buildName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {reserveBuildId && (
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Target Requirement</label>
                    <select
                      value={reserveSlotLabel}
                      onChange={(e) => setReserveSlotLabel(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                    >
                      <option value="">Select a target…</option>
                      {reserveSlotOptions.map((e) => (
                        <option key={e.slotLabel} value={e.slotLabel}>
                          {e.slotLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {reserveSlotLabel && (
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      max={reserveAvailability?.availableQuantity ?? 1}
                      step={1}
                      value={reserveQtyInput}
                      onChange={(e) => setReserveQtyInput(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                    />
                    {!isReserveQtyValid && <p className="text-xs text-danger mt-1">Quantity must be a positive whole number, no more than what's Available.</p>}
                  </div>
                )}
                {reserveResult && (
                  <p className={`text-xs ${reserveResult.success ? 'text-success' : 'text-danger'}`}>{reserveResult.message}</p>
                )}
                <button
                  disabled={!reserveSlotLabel || !isReserveQtyValid}
                  onClick={confirmReserve}
                  className="w-full bg-cyan text-bg font-semibold text-sm py-2 rounded-lg hover:bg-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirm Reservation
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manage / Release Reservations modal — EWO-029 (Task 6) */}
      {manageItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setManageItemId(null)}>
          <div className="panel p-6 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-white">Reservations for "{manageItem.name}"</h3>
              <button onClick={() => setManageItemId(null)} className="text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            {manageReservations.length === 0 ? (
              <p className="text-sm text-muted">No active reservations.</p>
            ) : (
              <ul className="space-y-2">
                {manageReservations.map((dep) => (
                  <li key={dep.reservationId} className="flex items-center justify-between gap-3 bg-black/20 border border-white/5 rounded-lg px-3 py-2.5">
                    <div className="text-sm text-white min-w-0">
                      <div className="truncate">{formatDependencyLabel(dep)}</div>
                      <div className="text-xs text-muted">Qty {dep.quantity}</div>
                    </div>
                    <button
                      onClick={() => {
                        if (dep.reservationId) releaseReservation(dep.reservationId)
                        if (manageReservations.length <= 1) setManageItemId(null)
                      }}
                      className="shrink-0 text-xs font-medium text-danger hover:underline"
                    >
                      Release
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
