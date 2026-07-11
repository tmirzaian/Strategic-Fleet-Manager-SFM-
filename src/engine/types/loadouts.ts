/**
 * A `PortAssignment` maps a Port to the Component installed in it (or
 * `null` for an intentionally empty Port). Shared shape used by all three
 * loadout types below so they stay structurally comparable.
 */
export interface PortAssignment {
  portId: string
  componentId: string | null
}

/**
 * `FactoryLoadout` — Layer 2 (Normalized Game Data). CIG's stock loadout
 * for a ship, as shipped. Immutable: nothing in the app is ever allowed to
 * mutate a FactoryLoadout after the Normalizer produces it — it's the
 * fixed reference point that Installed Loadout is seeded from and that
 * hardpoint status logic compares against (see
 * src/utils/hardpointStatus.ts). Marked `readonly` at the type level as a
 * compile-time nudge; nothing here enforces it at runtime.
 */
export interface FactoryLoadout {
  readonly id: string
  readonly shipId: string
  readonly portAssignments: readonly PortAssignment[]
}

/**
 * `InstalledLoadout` — Layer 3 (Player Data). What the player currently
 * has installed, per Port. Seeded from the ship's FactoryLoadout when a
 * ship is first added/imported, and can drift from both FactoryLoadout and
 * any TargetBuild after that point.
 */
export interface InstalledLoadout {
  id: string
  shipId: string
  portAssignments: PortAssignment[]
  updatedAt?: string
}

/**
 * `TargetBuild` — Layer 3 (Player Data). What the player wants installed,
 * per Port, for a given named Build (e.g. "Stealth Build", "Escort
 * Build"). A ship can have more than one TargetBuild; exactly one is
 * "active" at a time from the UI's perspective.
 */
export interface TargetBuild {
  id: string
  shipId: string
  name: string
  role?: string
  isActive: boolean
  portAssignments: PortAssignment[]
}
