import type { Build, HangarItem, Hardpoint, InstalledLoadoutEntry, MissionReservation, Ship } from '../../types'

/**
 * EWO-STAB-003B — shared types for the installation engine. Deliberately
 * defined here rather than imported from src/store/useFleetStore.ts's own
 * `FleetState`: the engine must never depend on the store (the store
 * depends on the engine, not the reverse) so it stays usable by any
 * future caller that isn't Zustand-backed at all (e.g. a future RSI
 * synchronization process — see EWO-STAB-003A §7).
 */

export type InstallationOperation = 'INSTALL' | 'REMOVE' | 'TRANSFER'

/** Identifies the component an operation concerns. A caller passes
 * whatever it already has — resolution into a canonical identity happens
 * once, inside the engine (see componentIdentityService.ts). Never
 * resolved by callers themselves (EWO-STAB-003A §2). */
export type ComponentReference = { entityClass: string } | { displayName: string } | { hangarItemId: string }

export interface InstallationDestination {
  shipId: string
  buildId?: string
  // EWO-STAB-002 requires this to be present, non-empty, and validated for
  // INSTALL/REMOVE — no slot ever means no mutation, never a guess. TRANSFER
  // is the one deliberate exception, preserving moveComponentBetweenShips'
  // own pre-existing "scan for a compatible open slot" behavior when
  // omitted — a behavior EWO-STAB-001/002 never found unsafe, since it was
  // already constrained by a real type/size check, unlike installComponent's
  // former no-slotLabel fallback. See installationEngine.ts.
  slotLabel?: string
}

export interface InstallationCommand {
  operation: InstallationOperation
  // Required for INSTALL only — REMOVE resolves the removed item's
  // identity from the destination hardpoint's own installedItem, and
  // TRANSFER resolves it from the donor hardpoint, so neither reads this.
  component?: ComponentReference
  destination: InstallationDestination
  /** TRANSFER only — the donor side, same explicit shape as destination. */
  source?: InstallationDestination
  /** Whether this operation should touch Hangar Inventory bookkeeping at
   * all. 'NONE' preserves the long-standing Quick Update use case:
   * recording an install with no inventory bookkeeping involved
   * (EWO-029). Omitted defaults to 'HANGAR'. */
  inventorySource?: 'HANGAR' | 'NONE'
  /** The specific Hangar Inventory record being consumed, when known (Move
   * to Ship's case) — lets the transaction service decrement the exact
   * unit the Commander picked rather than the first row matching by name. */
  hangarItemId?: string
  /** REMOVE only. */
  returnToInventory?: boolean
  /** TRANSFER only — preserves moveComponentBetweenShips' own,
   * intentionally different compatibility rule (destination must equal
   * the donor hardpoint's own type/size) rather than the catalog-based
   * check every other operation uses. See compatibilityEngine.ts. Never
   * set by INSTALL/REMOVE callers. */
  compatibilityMode?: 'catalog' | 'exact-slot-match'
}

export type InstallationFailureReason = 'ship-not-found' | 'destination-invalid' | 'source-invalid' | 'incompatible' | 'reserved-elsewhere'

export type InstallationResult =
  | {
      ok: true
      shipId: string
      buildId: string
      slotLabel: string
      resolvedDisplayName: string
      resolvedEntityClass: string | null
      reservationFulfilled: boolean
      hangarItemId?: string
      /** TRANSFER only. */
      source?: { shipId: string; buildId: string; slotLabel: string }
    }
  | { ok: false; reason: InstallationFailureReason; message: string }

/** The minimal state slice the engine reads. A plain snapshot, never a
 * live store reference — the engine never mutates this directly. */
export interface InstallationStateSnapshot {
  ships: Ship[]
  builds: Build[]
  hardpoints: Hardpoint[]
  hangarItems: HangarItem[]
  reservations: MissionReservation[]
  installedLoadouts: InstalledLoadoutEntry[]
}

/** How the engine actually commits a validated plan. Every field is an
 * injected callback rather than an import, so this module has zero
 * dependency on Zustand or src/store/useFleetStore.ts — the store injects
 * its own `applyInstalledChange`/`set`/`addHangarItem` here instead of the
 * engine reaching into the store. */
export interface InstallationEffects {
  /** The shared, unchanged hardpoint/InstalledLoadout/build-readiness
   * mutation (src/store/useFleetStore.ts's applyInstalledChange). Already
   * centralized before this mission (EWO-STAB-001) and reused as-is,
   * never reimplemented here. */
  applyShipMutation: (shipId: string, slotLabel: string, newInstalledItem: string) => void
  commitHangarItems: (items: HangarItem[]) => void
  commitReservations: (reservations: MissionReservation[]) => void
  /** REMOVE + returnToInventory only — the store's existing addHangarItem,
   * already the single correct merge-by-entityClass-then-name+type+size
   * implementation (EWO-STAB-001 found no duplication here to consolidate). */
  returnToInventory: (item: { name: string; type: string; size: string }) => void
}
