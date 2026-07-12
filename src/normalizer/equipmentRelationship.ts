/**
 * `equipmentRelationship` — the one place that decides whether a port
 * with children is a mount/rack **container** (its own factory item is
 * incidental hardware; the real, player-facing item is whatever's
 * installed in it) or **independent** equipment (its own factory item is
 * itself the real, player-facing item, regardless of what's nested
 * beneath it for structural/geometric reasons).
 *
 * Mission M-010 root cause: `equipmentResolver.ts` previously treated
 * "has children" as the *only* signal for "is a container" — true for a
 * weapon mount hosting a gun or a missile rack hosting missiles, but
 * false for a QuantumDrive hosting a nested JumpDrive (DataCore nests the
 * jump-drive entity under the quantum-drive entity in the raw export,
 * but both are independently real, separately-named ship equipment, not
 * a mount-and-its-cargo relationship). Collapsing unconditionally on
 * "has children" showed the JumpDrive's item ("Explorer") where the
 * QuantumDrive's own item ("Beacon") belonged.
 *
 * The decision here is based purely on `Port.canonicalPortType` — the
 * exact string `classifyPort()` was given, itself either a legacy
 * export's own verified `portType` or the Classification Translation
 * layer's output (Mission M-009). Never the port's or entity's name.
 */

export type EquipmentRelationship =
  | { kind: 'container'; reason: string }
  | { kind: 'independent'; reason: string }
  | { kind: 'unresolved'; reason: string }

/**
 * Canonical port types that are, by design, mounting apparatus for a
 * separately-swappable item rather than equipment in their own right —
 * this is the same distinction the original `equipmentResolver.ts`
 * already asserted in comments ("Ports with children are mount/rack
 * containers (a gimbal, a missile rack)"), now made explicit and keyed
 * on the canonical type instead of applying to every port with children
 * unconditionally.
 *
 * `WeaponGun`, `Missile`, `PowerPlant`, `Shield`, `Cooler`, `QuantumDrive`,
 * `JumpDrive`, `Radar`, `LifeSupport`, `Avionics`, `Relay`, `Bomb`, etc.
 * are deliberately NOT here — a bomb hardpoint's own item *is* the bomb, a
 * quantum drive's own item *is* the quantum drive, regardless of whatever
 * else DataCore happens to nest beneath either in the raw export.
 */
const CONTAINER_PORT_TYPES = new Set(['WeaponTurret', 'GimbalMount', 'Turret', 'MissileRack'])

/**
 * Classifies the relationship a port-with-children has to its own
 * factory item, from its canonical port type alone.
 *
 * - `container`: the port's own item is mount hardware — collapse to its
 *   leaf descendants' item(s) as the resolved equipment (existing,
 *   unchanged behavior for weapon mounts and missile racks).
 * - `independent`: the port's own item is itself the resolved equipment.
 *   Its children (if any) are resolved as their own, separate,
 *   independent assignments — never collapsed into this port's row.
 * - `unresolved`: no canonical port type was recorded at all (should not
 *   happen in practice — a `Port` only exists once `classifyPort()` had a
 *   non-empty type — but handled explicitly rather than assumed).
 *   Treated the same as `independent` by callers: preserving a port's own
 *   item is the safe default when uncertain, collapsing it away is not.
 */
export function classifyPortRelationship(canonicalPortType: string | undefined): EquipmentRelationship {
  if (!canonicalPortType) {
    return {
      kind: 'unresolved',
      reason: 'No canonical port type recorded for this port — cannot verify a mount/container relationship, so its own item is preserved rather than assumed to be incidental.',
    }
  }

  if (CONTAINER_PORT_TYPES.has(canonicalPortType)) {
    return {
      kind: 'container',
      reason: `"${canonicalPortType}" is a known mount/rack container type — its own factory item is mount hardware, not the primary resolved item.`,
    }
  }

  return {
    kind: 'independent',
    reason: `"${canonicalPortType}" is independently real equipment — its own factory item is never replaced by a nested child's item.`,
  }
}
