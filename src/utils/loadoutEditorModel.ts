import type { FactoryHardpointTemplate } from '../data/shipDefinitions'
import type { FleetAsset, Hardpoint } from '../types'

/**
 * EWO-025 — root cause of "Edit an Existing Loadout flattens the
 * hierarchy": `saveMissionConfiguration` (src/store/useFleetStore.ts)
 * builds each new Hardpoint row from only
 * `{ slotLabel, type, size, factoryItem, installedItem, targetItem,
 * status, invalidMessage }` — it never carries `parentSlotLabel`,
 * `groupLabel`, `assemblyRole`, or `isStructural` onto a saved Build's
 * own rows. CREATE mode looked correct only because it happened to
 * preview the ACTIVE build's rows, and a fresh Fleet Asset's active build
 * is the Factory Loadout — built by `materializeFleetAsset` straight from
 * the canonical `FactoryHardpointTemplate`, which does carry all four
 * fields. The moment a saved (therefore stripped) Loadout became the
 * ship's active build, every page reading `hardpoints` directly for that
 * build — Loadout Manager's preview and Ship Detail's Loadout & Port Tree
 * alike — lost category headers and parent/child links, because the
 * rows themselves never had that data to begin with.
 *
 * Design Authority Ruling 5 (EWO-025): category membership, ordering,
 * parentage, structural status, and assembly roles belong to the
 * canonical ShipDefinition, never to a saved Build. This module is the
 * one shared builder (Ruling 1/4 — CREATE and EDIT both call it, nothing
 * else constructs a loadout's row set) that enforces this: every
 * structural/positional field always comes from
 * `shipFactoryTemplates[definition.id]` (see src/data/shipDefinitions.ts),
 * and a saved Build's own hardpoint rows are consulted ONLY for the
 * Commander's actual factory/installed/target values, joined by
 * `slotLabel`.
 *
 * `slotLabel` is deliberately the stable join key, not a new port ID —
 * confirmed by construction, not assumed: `materializeFleetAsset` copies
 * `slotLabel` verbatim from the ShipDefinition's own
 * `FactoryHardpointTemplate`, and `saveMissionConfiguration`'s `newRows`
 * copies `slotLabel: refRow.slotLabel` verbatim again when creating any
 * later Loadout — so a real port's `slotLabel` is identical across every
 * Build for that ship, today, with no migration required. This is not
 * the kind of "display label" Design Authority Ruling 3 warns against
 * (a resolved component/equipment name, which does change as
 * presentation normalization improves — see EWO-023) — it is the port's
 * own structural identity string (e.g. "Nose Mount — Weapon 1"), unique
 * by construction within one ship's hierarchy (see
 * `importedFactoryTemplate`'s own doc comment in shipDefinitions.ts).
 */

export interface LoadoutAssignment {
  factoryItem: string
  installedItem: string
  targetItem: string
  /** EWO-STAB-004B (ADR-010) — the existing Build row's own already-
   * persisted canonical identity, carried through so editing an existing
   * Mission Configuration doesn't lose the Commander's earlier selection
   * (e.g. a specific PDC turret entityClass) the moment it's reopened for
   * editing. Undefined for a legacy/name-only row or one with no resolved
   * identity — never fabricated. */
  targetEntityClass?: string
  installedEntityClass?: string
}

/** One row of the canonical, editable loadout hierarchy — shaped enough
 * like `Hardpoint` that `buildPortTree()`/`groupPortTree()` (both already
 * shared with Ship Detail) work on it completely unchanged (Ruling 4:
 * no second tree implementation). `id` is the `slotLabel` itself — a
 * real port's identity is now stable across every render, every save,
 * and every Build, unlike the previous `${buildId}-hp-${i}` scheme whose
 * id changed on every save and therefore could never carry
 * expand/collapse state or React identity across a reopen. */
export interface LoadoutEditorRow {
  id: string
  slotLabel: string
  type: string
  size: string
  parentSlotLabel?: string
  groupLabel?: string
  assemblyRole?: string
  isStructural?: boolean
  factoryItem: string
  installedItem: string
  targetItem: string
  /** EWO-STAB-004A (ADR-010) — carried straight from the template's own
   * already-resolved entityClass (see FactoryHardpointTemplate's doc
   * comment); undefined for a hand-authored seed row or an uncataloged
   * factory item. Used to derive this port's PDC_TURRET destination
   * capability for the preview's own compatibility check — never
   * re-resolved from factoryItem's display-name text. */
  factoryEntityClass?: string
  /** EWO-STAB-004B (ADR-010) — the existing Build's own already-persisted
   * identity for this exact row (see LoadoutAssignment), when editing an
   * existing Mission Configuration; undefined otherwise. */
  targetEntityClass?: string
  installedEntityClass?: string
}

export interface LoadoutEditorModel {
  rows: LoadoutEditorRow[]
  /** EWO-025 (Task 4) — a saved assignment whose slotLabel no longer
   * matches anything in the canonical template (the ship's own port data
   * changed shape since the Build was saved). Never crashes, never
   * silently reattaches to a different port, never flattens the rest of
   * the tree — simply excluded from `rows`, reported here so a caller can
   * surface a restrained diagnostic. Expected to be empty for every
   * current fixture (see EWO-025 report). */
  orphanedSlotLabels: string[]
}

/**
 * Builds `assignmentsBySlotLabel` from one Build's own Hardpoint rows —
 * the shape `buildLoadoutEditorModel` overlays onto the canonical
 * template. A thin, separately-testable step so callers (CREATE's
 * reference build, EDIT/Clone's specific existing build) share the exact
 * same join logic.
 */
export function assignmentsBySlotLabel(
  rows: Array<Pick<LoadoutAssignment, 'factoryItem' | 'installedItem' | 'targetItem' | 'targetEntityClass' | 'installedEntityClass'> & { slotLabel: string }>
): Map<string, LoadoutAssignment> {
  return new Map(
    rows.map((r) => [
      r.slotLabel,
      { factoryItem: r.factoryItem, installedItem: r.installedItem, targetItem: r.targetItem, targetEntityClass: r.targetEntityClass, installedEntityClass: r.installedEntityClass },
    ])
  )
}

/**
 * The one canonical editor-model builder (EWO-025, Task 2). `template` is
 * always `shipFactoryTemplates[definition.id]` — the same authoritative
 * source a fresh Factory Loadout materializes from — never a Build's own
 * rows. `assignments` supplies only per-slot values; a canonical row with
 * no matching assignment (a port added to the ship definition after this
 * particular Build was saved) falls back to the template's own factory
 * value, matching the existing "no data yet" convention rather than
 * inventing one.
 */
export function buildLoadoutEditorModel(template: FactoryHardpointTemplate[], assignments: Map<string, LoadoutAssignment>): LoadoutEditorModel {
  const rows: LoadoutEditorRow[] = template.map((t) => {
    const a = assignments.get(t.slotLabel)
    return {
      id: t.slotLabel,
      slotLabel: t.slotLabel,
      type: t.type,
      size: t.size,
      parentSlotLabel: t.parentSlotLabel,
      groupLabel: t.groupLabel,
      assemblyRole: t.assemblyRole,
      isStructural: t.isStructural,
      factoryItem: t.factoryItem,
      installedItem: a?.installedItem ?? t.factoryItem,
      targetItem: a?.targetItem ?? t.factoryItem,
      factoryEntityClass: t.factoryEntityClass,
      // EWO-STAB-004B — an existing assignment's own persisted identity
      // wins; a row with no assignment falls back to the template's own
      // factory identity, matching the factoryItem fallback immediately
      // above it.
      targetEntityClass: a ? a.targetEntityClass : t.factoryEntityClass,
      installedEntityClass: a ? a.installedEntityClass : t.factoryEntityClass,
    }
  })

  const templateSlotLabels = new Set(template.map((t) => t.slotLabel))
  const orphanedSlotLabels = Array.from(assignments.keys()).filter((label) => !templateSlotLabels.has(label))

  return { rows, orphanedSlotLabels }
}

/**
 * Resolves the canonical ShipDefinition id for a ship id as it appears in
 * `useFleetStore`'s materialized `ships` array. Mirrors
 * `resolveFleetAssetId` (src/store/useFleetStore.ts, private to that
 * module) exactly: a manually-added FleetAsset shares its id with its
 * materialized Ship (`ship.id === asset.id`), but the original
 * seed-migrated fleet's FleetAsset id is `${shipId}-asset-seed` while its
 * Ship/Build/Hardpoint rows keep the plain seed id — both conventions are
 * checked, never assumed.
 */
export function resolveShipDefinitionId(shipId: string, fleetAssets: FleetAsset[]): string | undefined {
  const direct = fleetAssets.find((a) => a.id === shipId)
  if (direct) return direct.shipDefinitionId
  const seedAsset = fleetAssets.find((a) => a.id === `${shipId}-asset-seed`)
  return seedAsset?.shipDefinitionId
}

/**
 * EWO-026 (Task 1) — Ship Detail's own latent instance of EWO-025's root
 * cause, deferred at the time (see that mission's report: "ShipDetail.tsx
 * has the identical latent bug... flagged as a known, related,
 * unaddressed latent defect"). `saveMissionConfiguration` still never
 * writes `parentSlotLabel`/`groupLabel`/`assemblyRole`/`isStructural` onto
 * a saved Build's own Hardpoint rows, so Ship Detail's Loadout & Port Tree
 * flattens (no category headers, no real nesting) the moment a ship's
 * active build is anything other than its pristine Factory Loadout.
 *
 * Unlike `buildLoadoutEditorModel` (which produces synthetic
 * `LoadoutEditorRow`s for MissionComposer's editing surface),
 * this returns real `Hardpoint` rows — identical `id`/`shipId`/`buildId`/
 * `status`/`invalidMessage`/`factoryItem`/`installedItem`/`targetItem` —
 * with only the four structural fields overlaid from the canonical
 * template by stable `slotLabel`. That distinction matters: Ship Detail's
 * readiness/logistics/validation calculations
 * (`calculateBuildProgress`, `derivePortLogistics`, `derivePortValidation`)
 * all consume `Hardpoint[]` directly and must keep doing so unchanged
 * (EWO-026 Task 1 explicitly forbids touching readiness) — only the
 * DISPLAY tree passed to `LoadoutPortTree` should be overlaid, never the
 * rows readiness math reads. A row with no canonical match (the ship's
 * own data changed shape since the build was saved) is returned
 * unchanged, exactly like `buildLoadoutEditorModel`'s orphan handling —
 * never crashes, never invents a match.
 */
export function overlayCanonicalHierarchy(hardpoints: Hardpoint[], template: FactoryHardpointTemplate[]): Hardpoint[] {
  const templateBySlot = new Map(template.map((t) => [t.slotLabel, t]))
  return hardpoints.map((hp) => {
    const t = templateBySlot.get(hp.slotLabel)
    if (!t) return hp
    return {
      ...hp,
      parentSlotLabel: t.parentSlotLabel,
      groupLabel: t.groupLabel,
      assemblyRole: t.assemblyRole,
      isStructural: t.isStructural,
      // SW-013C.2G — same "recomputed from the current template, never
      // persisted on the saved row" treatment as the four fields above.
      isDormant: t.isDormant,
      dormantDonorShipEntityClass: t.dormantDonorShipEntityClass,
      dormantAllowedComponentEntityClasses: t.dormantAllowedComponentEntityClasses,
    }
  })
}
