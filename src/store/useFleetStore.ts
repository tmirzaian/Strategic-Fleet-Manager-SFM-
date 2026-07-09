import { create } from 'zustand'
import type { Ship, Build, Hardpoint, HangarItem, LogEntry, Disposition } from '../types'
import { ships as seedShips, builds as seedBuilds, hardpoints as seedHardpoints, hangarItems as seedHangarItems, initialLog } from '../data/seed'
import { computeHardpointStatus } from '../utils/hardpointStatus'

interface FleetState {
  ships: Ship[]
  builds: Build[]
  hardpoints: Hardpoint[]
  hangarItems: HangarItem[]
  log: LogEntry[]

  // Ship Detail
  setActiveBuild: (shipId: string, buildId: string) => void

  // Build Manager
  addBuild: (shipId: string) => void
  editBuild: (buildId: string, updates: { name?: string; role?: string }) => void
  duplicateBuild: (buildId: string) => void
  deleteBuild: (buildId: string) => void

  // Hangar Inventory
  addHangarItem: (item: Omit<HangarItem, 'id'>) => void
  updateHangarDisposition: (itemId: string, disposition: Disposition) => void
  moveToShip: (itemId: string, shipId: string) => { success: boolean; message: string }

  // Quick Update
  installComponent: (shipId: string, itemName: string, slotLabel?: string) => { matched: boolean }
  removeComponent: (shipId: string, slotLabel: string) => { matched: boolean; itemName?: string }
  addLogEntry: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
}

function recomputeBuildDerivedState(get: () => FleetState, set: (partial: Partial<FleetState>) => void, buildId: string) {
  const state = get()
  const buildHardpoints = state.hardpoints.filter((h) => h.buildId === buildId)
  const missing = buildHardpoints.filter((h) => h.status !== 'OK').map((h) => h.targetItem)
  const okCount = buildHardpoints.filter((h) => h.status === 'OK').length
  const readiness = buildHardpoints.length > 0 ? Math.round((okCount / buildHardpoints.length) * 100) : 0

  const builds = state.builds.map((b) => (b.id === buildId ? { ...b, missing, readiness } : b))
  set({ builds })

  const build = builds.find((b) => b.id === buildId)
  if (!build) return
  const ships = state.ships.map((s) =>
    s.id === build.shipId && s.activeBuildId === buildId
      ? { ...s, missing, readiness, lastUpdated: 'Just now' }
      : s
  )
  set({ ships })
}

export const useFleetStore = create<FleetState>((set, get) => ({
  ships: seedShips,
  builds: seedBuilds,
  hardpoints: seedHardpoints,
  hangarItems: seedHangarItems,
  log: initialLog,

  setActiveBuild: (shipId, buildId) => {
    const build = get().builds.find((b) => b.id === buildId)
    if (!build) return
    set({
      builds: get().builds.map((b) => (b.shipId === shipId ? { ...b, isActive: b.id === buildId } : b)),
      ships: get().ships.map((s) =>
        s.id === shipId ? { ...s, activeBuildId: buildId, missing: build.missing, readiness: build.readiness } : s
      ),
    })
  },

  addBuild: (shipId) => {
    const ship = get().ships.find((s) => s.id === shipId)
    if (!ship) return
    const id = `${shipId}-build-${Date.now()}`
    const newBuild: Build = { id, shipId, name: 'New Build', role: ship.role, readiness: 100, isActive: false, missing: [] }
    const slots: Array<{ slotLabel: string; type: string; size: string }> = [
      { slotLabel: 'Weapon 1', type: 'Weapon', size: 'S4' },
      { slotLabel: 'Weapon 2', type: 'Weapon', size: 'S4' },
      { slotLabel: 'Power 1', type: 'Power Plant', size: 'S1' },
      { slotLabel: 'Power 2', type: 'Power Plant', size: 'S1' },
      { slotLabel: 'Shield 1', type: 'Shield', size: 'S1' },
      { slotLabel: 'Shield 2', type: 'Shield', size: 'S1' },
      { slotLabel: 'Cooler 1', type: 'Cooler', size: 'S1' },
      { slotLabel: 'Cooler 2', type: 'Cooler', size: 'S1' },
      { slotLabel: 'Quantum Drive', type: 'Quantum Drive', size: 'S2' },
      { slotLabel: 'Radar', type: 'Radar', size: 'S1' },
      { slotLabel: 'Life Support', type: 'Life Support', size: 'S1' },
    ]
    const newHardpoints: Hardpoint[] = slots.map((slot, i) => ({
      id: `${id}-hp-${i}`,
      shipId,
      buildId: id,
      slotLabel: slot.slotLabel,
      type: slot.type,
      size: slot.size,
      factoryItem: 'Factory Component',
      installedItem: 'Factory Component',
      targetItem: 'Factory Component',
      status: 'OK',
    }))
    set({ builds: [...get().builds, newBuild], hardpoints: [...get().hardpoints, ...newHardpoints] })
    get().addLogEntry({ action: 'Build created', shipName: ship.name, itemName: newBuild.name, details: `Created ${newBuild.name} for ${ship.name}` })
  },

  editBuild: (buildId, updates) => {
    const build = get().builds.find((b) => b.id === buildId)
    if (!build) return
    set({ builds: get().builds.map((b) => (b.id === buildId ? { ...b, ...updates } : b)) })
    const ship = get().ships.find((s) => s.id === build.shipId)
    get().addLogEntry({ action: 'Build edited', shipName: ship?.name, itemName: updates.name ?? build.name, details: `Edited ${build.name}${updates.name ? ` → renamed to ${updates.name}` : ''}` })
  },

  duplicateBuild: (buildId) => {
    const build = get().builds.find((b) => b.id === buildId)
    if (!build) return
    const id = `${build.id}-copy-${Date.now()}`
    const newBuild: Build = { ...build, id, name: `${build.name} (Copy)`, isActive: false }
    const sourceHardpoints = get().hardpoints.filter((h) => h.buildId === buildId)
    const newHardpoints: Hardpoint[] = sourceHardpoints.map((h, i) => ({ ...h, id: `${id}-hp-${i}`, buildId: id }))
    set({ builds: [...get().builds, newBuild], hardpoints: [...get().hardpoints, ...newHardpoints] })
    const ship = get().ships.find((s) => s.id === build.shipId)
    get().addLogEntry({ action: 'Build duplicated', shipName: ship?.name, itemName: newBuild.name, details: `Duplicated ${build.name} as ${newBuild.name}` })
  },

  deleteBuild: (buildId) => {
    const build = get().builds.find((b) => b.id === buildId)
    if (!build) return
    const remaining = get().builds.filter((b) => b.id !== buildId)
    const ship = get().ships.find((s) => s.id === build.shipId)
    set({
      builds: remaining,
      hardpoints: get().hardpoints.filter((h) => h.buildId !== buildId),
      ships: get().ships.map((s) => {
        if (s.id !== build.shipId || s.activeBuildId !== buildId) return s
        const fallback = remaining.find((b) => b.shipId === build.shipId)
        return fallback ? { ...s, activeBuildId: fallback.id, missing: fallback.missing, readiness: fallback.readiness } : s
      }),
    })
    get().addLogEntry({ action: 'Build deleted', shipName: ship?.name, itemName: build.name, details: `Deleted ${build.name} from ${ship?.name ?? 'ship'}` })
  },

  addHangarItem: (item) => {
    const newItem: HangarItem = { ...item, id: `item-${Date.now()}` }
    set({ hangarItems: [newItem, ...get().hangarItems] })
    get().addLogEntry({ action: 'Hangar item added', itemName: newItem.name, details: `Added ${newItem.name} to Hangar` })
  },

  updateHangarDisposition: (itemId, disposition) => {
    const item = get().hangarItems.find((i) => i.id === itemId)
    set({ hangarItems: get().hangarItems.map((i) => (i.id === itemId ? { ...i, disposition } : i)) })
    if (item) {
      get().addLogEntry({ action: 'Disposition changed', itemName: item.name, details: `${item.name} disposition set to ${disposition}` })
    }
  },

  moveToShip: (itemId, shipId) => {
    const item = get().hangarItems.find((i) => i.id === itemId)
    const ship = get().ships.find((s) => s.id === shipId)
    if (!item || !ship) return { success: false, message: 'Item or ship not found.' }
    const result = get().installComponent(shipId, item.name)
    if (!result.matched) {
      return { success: false, message: `${ship.name}'s active build has no open slot for ${item.name}.` }
    }
    set({
      hangarItems: get().hangarItems.map((i) => (i.id === itemId ? { ...i, qty: Math.max(0, i.qty - 1) } : i)),
    })
    get().addLogEntry({ action: 'Component moved to ship', shipName: ship.name, itemName: item.name, details: `Moved ${item.name} from Hangar to ${ship.name}` })
    return { success: true, message: `${item.name} installed on ${ship.name}.` }
  },

  installComponent: (shipId, itemName, slotLabel) => {
    const ship = get().ships.find((s) => s.id === shipId)
    if (!ship) return { matched: false }
    const buildId = ship.activeBuildId
    const candidates = get().hardpoints.filter((h) => h.buildId === buildId && (slotLabel ? h.slotLabel === slotLabel : true))
    const target = candidates.find((h) => h.targetItem.toLowerCase() === itemName.toLowerCase() && h.status !== 'OK') ?? candidates.find((h) => h.status !== 'OK')
    if (!target) return { matched: false }

    set({
      hardpoints: get().hardpoints.map((h) =>
        h.id === target.id
          ? { ...h, installedItem: itemName, status: computeHardpointStatus(itemName, h.targetItem, h.factoryItem) }
          : h
      ),
    })
    recomputeBuildDerivedState(get, set, buildId)
    return { matched: true }
  },

  removeComponent: (shipId, slotLabel) => {
    const ship = get().ships.find((s) => s.id === shipId)
    if (!ship) return { matched: false }
    const buildId = ship.activeBuildId
    const target = get().hardpoints.find((h) => h.buildId === buildId && h.slotLabel === slotLabel)
    if (!target || target.installedItem === '—' || !target.installedItem) return { matched: false }
    const removedItem = target.installedItem

    set({
      hardpoints: get().hardpoints.map((h) =>
        h.id === target.id ? { ...h, installedItem: '—', status: computeHardpointStatus('—', h.targetItem, h.factoryItem) } : h
      ),
    })
    recomputeBuildDerivedState(get, set, buildId)
    return { matched: true, itemName: removedItem }
  },

  addLogEntry: (entry) => {
    const newEntry: LogEntry = { ...entry, id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: 'Just now' }
    set({ log: [newEntry, ...get().log] })
  },
}))
