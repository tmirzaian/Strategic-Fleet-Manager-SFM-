export type Ownership = 'Owned' | 'Purchased' | 'Loaner'

export interface Ship {
  id: string
  name: string
  manufacturer: string
  ownership: Ownership
  career: string
  role: string
  activeBuildId: string
  readiness: number
  priority: number
  missing: string[]
  imageUrl?: string
  location?: string
  lastUpdated?: string
}

export interface Build {
  id: string
  shipId: string
  name: string
  role: string
  readiness: number
  isActive: boolean
  missing: string[]
}

export type HardpointStatus = 'OK' | 'Missing' | 'Upgrade Available'

// Hardpoints belong to a specific Build (not just a ship) so that switching
// the Active Build on Ship Detail swaps in a different set of targets/status
// without mutating the ship's other builds. Factory Loadout seeds Installed
// Loadout when a ship/build is first created; Installed can later drift from
// both Factory and Target.
export interface Hardpoint {
  id: string
  shipId: string
  buildId: string
  slotLabel: string
  type: string
  size: string
  factoryItem: string
  installedItem: string
  targetItem: string
  status: HardpointStatus
}

// Allowed dispositions for Hangar items. "Vendor" is intentionally excluded —
// vendor trash is not tracked in the Hangar Inventory.
export type Disposition = 'Install' | 'Store' | 'Stockpile' | 'Trade' | 'Ignore'

export interface HangarItem {
  id: string
  name: string
  type: string
  size: string
  qty: number
  neededBy: string
  disposition: Disposition
}

export interface LogEntry {
  id: string
  timestamp: string
  action: string
  shipName?: string
  itemName?: string
  details: string
  readinessBefore?: number
  readinessAfter?: number
}
