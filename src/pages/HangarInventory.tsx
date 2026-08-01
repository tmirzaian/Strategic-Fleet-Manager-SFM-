import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, AlertOctagon, PackageX, Pencil, Trash2, Lock, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { selectActiveShips } from '../utils/fleetLifecycle'
import SortableHeader from '../components/SortableHeader'
import CatalogComponentSearch from '../components/CatalogComponentSearch'
import EnvironmentBay from '../components/layout/EnvironmentBay'
import type { HangarItem } from '../types'
import { sortHangarEntries, type HangarSortColumn, type SortDirection } from '../utils/hangarSort'
import {
  applyHangarFilters,
  hangarFilterChips,
  isHangarFilterActive,
  sizesInHangar,
  typesInHangar,
  DEFAULT_HANGAR_FILTERS,
  type AvailabilityFilterValue,
  type HangarFilterState,
  type ReservationFilterValue,
} from '../utils/hangarFilters'
import { resolveReservationEligibility } from '../utils/hangarReservationEligibility'
import { catalogComponentsByName } from '../generated/componentCatalog'
import {
  resolveInventoryDependencies,
  formatDependencyLabel,
  totalClaimedQuantity,
  type InventoryDependency,
  type NeededByEntry,
} from '../utils/inventoryDependencies'

/** EWO-072 (Part H) — the compact, always-visible ship/build summary line
 * ("Ghost Stealth · Corsair Gunship"), deduplicated per (ship, build) pair
 * since one Build can have more than one unresolved requirement for the
 * same component (e.g. twin mounts). */
function neededBySummary(neededBy: NeededByEntry[]): string {
  const unique = new Map<string, string>()
  for (const e of neededBy) unique.set(`${e.shipId}:${e.buildId}`, `${e.fleetAssetLabel} ${e.buildName}`)
  return Array.from(unique.values()).join(' · ')
}

function neededByTooltip(neededBy: NeededByEntry[]): string {
  return neededBy.map((e) => `${e.fleetAssetLabel} — ${e.buildName} (${e.slotLabel})${e.reserved ? ' — Reserved' : ' — Unreserved'}`).join('\n')
}

/** EWO-072 (Part G) — a true-zero historical record: nothing installed,
 * nothing reserved, nothing available. Fleet-wide demand (Needed By) is
 * deliberately NOT part of this check — the Chief Architect's own ruling
 * treats an unowned-but-needed component as procurement demand, not owned
 * inventory, so it still hides under the default view; it remains fully
 * visible the moment the Commander disables the toggle. */
function isTrueZero(installedQuantity: number, reservedQuantity: number, availableQuantity: number): boolean {
  return installedQuantity === 0 && reservedQuantity === 0 && availableQuantity === 0
}

export default function HangarInventory() {
  const hangarItems = useFleetStore((s) => s.hangarItems)
  // SW-015C (Deliverable 4) — same single-point interception as
  // DecisionCenter.tsx: every use of `ships` here feeds demand/
  // dependency/reservation-eligibility computation for the current fleet.
  const ships = selectActiveShips(useFleetStore((s) => s.ships))
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
  const [selectedName, setSelectedName] = useState('')
  const [addQtyInput, setAddQtyInput] = useState('1')
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null)
  const [sortColumn, setSortColumn] = useState<HangarSortColumn>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // EWO-072 (Part E) — collapsed by default, same disclosure pattern Fleet
  // Dashboard's own filter toolbar established; filter selections
  // themselves live in plain component state (not persisted — this
  // mission's Regression Requirements only ask that a selection survives
  // collapsing the panel, not surviving a reload) so collapsing never
  // clears anything.
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [filters, setFilters] = useState<HangarFilterState>(DEFAULT_HANGAR_FILTERS)
  // EWO-072 (Part G) — hidden by default; true-zero historical records are
  // not deleted, merely excluded from the operational "what do I own?" view.
  const [hideZeroBalance, setHideZeroBalance] = useState(true)

  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editQtyInput, setEditQtyInput] = useState('')
  const [editStep, setEditStep] = useState<'input' | 'confirm-reduction'>('input')
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)

  const [reserveItemId, setReserveItemId] = useState<string | null>(null)
  const [reserveShipId, setReserveShipId] = useState('')
  const [reserveBuildId, setReserveBuildId] = useState('')
  const [reserveSlotLabel, setReserveSlotLabel] = useState('')
  const [reserveQtyInput, setReserveQtyInput] = useState('1')
  const [reserveResult, setReserveResult] = useState<{ success: boolean; message: string } | null>(null)
  const reserveCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (reserveCloseTimeoutRef.current !== undefined) clearTimeout(reserveCloseTimeoutRef.current)
    }
  }, [])

  const [manageItemId, setManageItemId] = useState<string | null>(null)

  // EWO-072 (Part B/K) — one decoration pass per render, one canonical
  // resolver call per row (`resolveReservationEligibility`) feeding
  // display, filtering, sorting, and Reserve-eligibility alike — no
  // surface below independently recomputes Installed/Reserved/Available
  // or re-derives its own idea of "does this row have somewhere to go."
  const decoratedItems = useMemo(
    () =>
      hangarItems.map((item) => {
        const { availability, neededBy, unreservedNeededBy, eligible } = resolveReservationEligibility(
          item.name,
          item.entityClass,
          ships,
          builds,
          fleetAssets,
          hardpoints,
          hangarItems,
          installedLoadouts,
          reservations
        )
        return {
          item,
          installedQuantity: availability.installedQuantity,
          reservedQuantity: availability.reservedQuantity,
          availableQuantity: availability.availableQuantity,
          neededBy,
          neededByCount: neededBy.length,
          unreservedNeededBy,
          eligible,
        }
      }),
    [hangarItems, ships, builds, fleetAssets, hardpoints, installedLoadouts, reservations]
  )

  const typeOptions = useMemo(() => typesInHangar(hangarItems), [hangarItems])
  const sizeOptions = useMemo(() => sizesInHangar(hangarItems), [hangarItems])

  const explicitlyFilteredItems = useMemo(() => applyHangarFilters(decoratedItems, filters), [decoratedItems, filters])
  const visibleItems = useMemo(
    () => (hideZeroBalance ? explicitlyFilteredItems.filter((row) => !isTrueZero(row.installedQuantity, row.reservedQuantity, row.availableQuantity)) : explicitlyFilteredItems),
    [explicitlyFilteredItems, hideZeroBalance]
  )
  const sortedItems = useMemo(() => sortHangarEntries(visibleItems, sortColumn, sortDirection), [visibleItems, sortColumn, sortDirection])

  const filtersActive = isHangarFilterActive(filters)
  const filterChips = hangarFilterChips(filters)
  // EWO-072 (Part J) — distinguishes "a real filter combination excludes
  // everything" from "everything remaining is a true-zero record the
  // Commander has chosen to hide" — each gets its own intentional,
  // recoverable empty state rather than one generic blank-table message.
  const hiddenSolelyByZeroBalanceToggle = hangarItems.length > 0 && !filtersActive && explicitlyFilteredItems.length > 0 && visibleItems.length === 0

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

  function clearFilterDimension(key: keyof HangarFilterState) {
    setFilters((f) => ({ ...f, [key]: 'All' }))
  }

  // EWO-072 (Part B/K) — the Reserve modal's own Fleet Asset/Build/Target
  // options are the SAME `resolveReservationEligibility` call every row
  // already uses, never a second derivation.
  const reserveItem = reserveItemId ? hangarItems.find((i) => i.id === reserveItemId) ?? null : null
  const reserveEligibility = reserveItem
    ? resolveReservationEligibility(reserveItem.name, reserveItem.entityClass, ships, builds, fleetAssets, hardpoints, hangarItems, installedLoadouts, reservations)
    : null
  const reserveUnreservedNeededBy = reserveEligibility?.unreservedNeededBy ?? []
  const reserveShipOptions = useMemo(() => {
    const shipIds = new Set(reserveUnreservedNeededBy.map((e) => e.shipId))
    return ships.filter((s) => shipIds.has(s.id))
  }, [reserveUnreservedNeededBy, ships])
  const reserveBuildOptions = reserveUnreservedNeededBy.filter((e) => e.shipId === reserveShipId)
  const reserveSlotOptions = reserveBuildOptions.filter((e) => e.buildId === reserveBuildId)
  const parsedReserveQty = Number(reserveQtyInput)
  const isReserveQtyValid = Number.isInteger(parsedReserveQty) && parsedReserveQty > 0 && Boolean(reserveEligibility) && parsedReserveQty <= (reserveEligibility?.availability.availableQuantity ?? 0)

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
    if (reserveCloseTimeoutRef.current !== undefined) {
      clearTimeout(reserveCloseTimeoutRef.current)
      reserveCloseTimeoutRef.current = undefined
    }
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
      if (reserveCloseTimeoutRef.current !== undefined) clearTimeout(reserveCloseTimeoutRef.current)
      reserveCloseTimeoutRef.current = setTimeout(() => {
        reserveCloseTimeoutRef.current = undefined
        setReserveItemId(null)
      }, 900)
    } else {
      setReserveResult({ success: false, message: result.message ?? 'Could not reserve this component.' })
    }
  }

  const manageItem = manageItemId ? hangarItems.find((i) => i.id === manageItemId) ?? null : null
  const manageReservations: InventoryDependency[] = manageItem
    ? resolveInventoryDependencies(manageItem.name, ships, builds, fleetAssets, installedLoadouts, reservations).filter((d) => d.kind === 'RESERVED')
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Hangar Inventory</p>
          {/* EWO-100 (Phase 1) — standardized operational status line. */}
          <h1 className="text-2xl font-display font-bold text-white">Warehouse Inventory Available</h1>
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
        // Chief Architect Asset Handoff — genuine zero-recorded-inventory
        // only; the separate filtered-to-zero branch below (line ~445)
        // deliberately stays plain/compact, no artwork. EWO-095A — no
        // explicit vignetteOpacity override needed; EnvironmentBay's own
        // reduced default (0.15) already satisfies the canonical "crisp
        // plate, panel carries legibility" rule.
        <EnvironmentBay id="hangar-inventory-empty" minHeightClassName="lg:min-h-[300px]" contentClassName="max-w-md">
          <div className="panel lg:bg-panel/55 lg:backdrop-blur-md p-10 flex flex-col items-center text-center gap-2">
            <PackageX size={28} className="text-muted/60 mb-1" />
            <h2 className="font-display font-semibold text-white">No Inventory Recorded</h2>
            <p className="text-sm text-muted max-w-sm">Quartermaster has no components recorded for this command.</p>
          </div>
        </EnvironmentBay>
      ) : (
      <>
      {/* EWO-072 (Part E) — compact, collapsible, composable filters,
          mirroring Fleet Dashboard's own established toolbar pattern. */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              onClick={() => setFiltersExpanded((v) => !v)}
              aria-expanded={filtersExpanded}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-medium border border-white/10 text-muted hover:text-white hover:border-white/25 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
            >
              <SlidersHorizontal size={12} /> Filters {filtersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {filterChips.length === 0 ? (
              <span className="text-xs text-muted">All inventory</span>
            ) : (
              filterChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => clearFilterDimension(chip.key)}
                  title={`Remove ${chip.label} filter`}
                  aria-label={`Remove ${chip.label} filter`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-cyan/40 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors"
                >
                  {chip.label} <X size={11} />
                </button>
              ))
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideZeroBalance}
                onChange={(e) => setHideZeroBalance(e.target.checked)}
                className="rounded border-white/20 bg-black/30 text-cyan focus:ring-cyan/50"
              />
              Hide zero-balance items
            </label>
            {filtersActive && (
              <button onClick={() => setFilters(DEFAULT_HANGAR_FILTERS)} className="text-[11px] text-cyan/80 hover:text-cyan font-medium">
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {filtersExpanded && (
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted/50 w-24 shrink-0">Type</span>
              <button
                onClick={() => setFilters((f) => ({ ...f, type: 'All' }))}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filters.type === 'All' ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                }`}
              >
                All
              </button>
              {typeOptions.map((type) => (
                <button
                  key={type}
                  onClick={() => setFilters((f) => ({ ...f, type }))}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filters.type === type ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted/50 w-24 shrink-0">Size</span>
              <button
                onClick={() => setFilters((f) => ({ ...f, size: 'All' }))}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filters.size === 'All' ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                }`}
              >
                All
              </button>
              {sizeOptions.map((size) => (
                <button
                  key={size}
                  onClick={() => setFilters((f) => ({ ...f, size }))}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filters.size === size ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted/50 w-24 shrink-0">Reservation State</span>
              {(['All', 'Reserved', 'Unreserved'] as ReservationFilterValue[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setFilters((f) => ({ ...f, reservation: value }))}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filters.reservation === value ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted/50 w-24 shrink-0">Availability State</span>
              {(['All', 'Available', 'Unavailable'] as AvailabilityFilterValue[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setFilters((f) => ({ ...f, availability: value }))}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filters.availability === value ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-white/10 text-muted hover:text-white hover:border-white/25'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {sortedItems.length === 0 ? (
        // EWO-072 (Part J) — a functioning filter/toggle combination that
        // happens to exclude every row is not the same thing as an empty
        // Hangar (the hangarItems.length === 0 case above); each
        // exclusion reason gets its own intentional, recoverable state.
        <div className="panel p-10 flex flex-col items-center text-center gap-2">
          <PackageX size={28} className="text-muted/60 mb-1" />
          {filtersActive ? (
            <>
              <h2 className="font-display font-semibold text-white">No inventory items match these filters.</h2>
              <button
                onClick={() => setFilters(DEFAULT_HANGAR_FILTERS)}
                className="mt-2 inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
              >
                Clear Filters
              </button>
            </>
          ) : hiddenSolelyByZeroBalanceToggle ? (
            <>
              <h2 className="font-display font-semibold text-white">No owned inventory is currently recorded.</h2>
              <button
                onClick={() => {
                  setSelectedName('')
                  setAddQtyInput('1')
                  setAddResult(null)
                  setAddOpen(true)
                }}
                className="mt-2 inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
              >
                <Plus size={15} /> Add New Item
              </button>
            </>
          ) : (
            <h2 className="font-display font-semibold text-white">No inventory items match these filters.</h2>
          )}
        </div>
      ) : (
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          {/* EWO-072 (Part C/D) — Hangar Qty removed outright (Available
              already communicates free Hangar stock); the reclaimed width
              is redistributed via an explicit <colgroup> so Needed By
              genuinely gains room (Part H) rather than the browser
              distributing it arbitrarily. */}
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[12%]" />
              <col className="w-[7%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[24%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                <SortableHeader label="Item" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Type" column="type" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Size" column="size" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Installed" column="installed" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Reserved" column="reserved" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Available" column="available" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Needed By" column="neededBy" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((row) => {
                const { item, installedQuantity, reservedQuantity, availableQuantity, neededBy, unreservedNeededBy, eligible } = row
                return (
                <tr key={item.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-white font-medium truncate" title={item.name}>{item.name}</td>
                  <td className="px-5 py-3 text-muted truncate" title={item.type}>{item.type}</td>
                  <td className="px-5 py-3 text-muted">{item.size}</td>
                  <td className="px-3 py-3 font-mono text-muted">{installedQuantity}</td>
                  <td className="px-3 py-3 font-mono">
                    {reservedQuantity > 0 ? (
                      <button
                        onClick={() => setManageItemId(item.id)}
                        className="text-cyan hover:underline"
                        title="Manage reservations for this component"
                      >
                        {reservedQuantity}
                      </button>
                    ) : (
                      <span className="text-muted/50">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-success">{availableQuantity}</td>
                  <td className="px-3 py-3 text-muted">
                    {neededBy.length === 0 ? (
                      <span className="text-muted/50">—</span>
                    ) : (
                      <div title={neededByTooltip(neededBy)}>
                        <div className="text-white text-xs font-medium truncate">
                          Needed by {neededBy.length} Build{neededBy.length === 1 ? '' : 's'}
                        </div>
                        <div className="text-[11px] text-muted/70 truncate">{neededBySummary(neededBy)}</div>
                        {eligible && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[11px] text-cyan/80 whitespace-nowrap">
                              {unreservedNeededBy.length} unreserved match{unreservedNeededBy.length === 1 ? '' : 'es'}
                            </span>
                            <button onClick={() => openReserve(item)} className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan hover:underline">
                              <Lock size={11} /> Reserve
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-3">
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
      </>
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

      {/* Reserve modal — EWO-029 (Task 4/5), EWO-072 (Part A/B/K): exact
          Fleet Asset -> exact Build -> exact target requirement ->
          quantity, never automatic, and never independently derived from
          the row's own eligibility check. */}
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
                <p className="text-xs text-muted">{reserveEligibility?.availability.availableQuantity ?? 0} available to reserve.</p>
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
                      max={reserveEligibility?.availability.availableQuantity ?? 1}
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
