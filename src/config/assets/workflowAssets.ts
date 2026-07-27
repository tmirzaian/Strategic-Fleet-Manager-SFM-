import { assetPath } from './assetPaths'
import type { WorkflowIllustrationDefinition, WorkflowIllustrationId } from './types'

function definition(id: WorkflowIllustrationId, label: string, overrides: Partial<Omit<WorkflowIllustrationDefinition, 'id' | 'label'>> = {}): WorkflowIllustrationDefinition {
  return { id, label, enabled: false, ...overrides }
}

/**
 * EWO-011 — fixed illustrations for the three End-of-Briefing Execution
 * Action cards (Loot Lookup, Add Inventory, Modify Ship).
 *
 * EWO-057 — all three now carry Commander-approved production artwork,
 * delivered under `public/assets/environments/mission-control/` (the
 * canonical Beta artwork location per EWO-035, even though these
 * illustrations render on Mission Control's cards rather than as its
 * page background). The illustration *ids* below are stable semantic
 * identifiers describing each card's destination/purpose and are
 * intentionally NOT renamed just because the underlying asset filename
 * changed — `decision-center-found-loot` and `hangar-add-inventory` both
 * predate this asset swap (see UX-001B.4/UX-001C) and remain correct
 * identifiers for what they represent. `ship-workspace-modify` is newly
 * enabled here — it had no commissioned art before EWO-057 and rendered
 * `WorkflowDestinationCard`'s neutral dashed-circle fallback. A future
 * Release 2.0 Quartermaster Edition commission may replace any of these
 * three files again with no change to `WorkflowDestinationCard` or any
 * other consumer, same resolution boundary as every other asset registry
 * in this pipeline.
 */
export const WORKFLOW_ILLUSTRATIONS: Record<WorkflowIllustrationId, WorkflowIllustrationDefinition> = {
  'decision-center-found-loot': definition('decision-center-found-loot', 'Loot Lookup — Decision Center', {
    src: assetPath('environments/mission-control/decision-center-card.webp'),
    enabled: true,
  }),
  'hangar-add-inventory': definition('hangar-add-inventory', 'Add Inventory — Hangar Inventory', {
    src: assetPath('environments/mission-control/add-inventory-card.webp'),
    enabled: true,
  }),
  'ship-workspace-modify': definition('ship-workspace-modify', 'Modify Ship — Ship Workspace', {
    src: assetPath('environments/mission-control/ship-workspace-card.webp'),
    enabled: true,
  }),
}

export function getWorkflowIllustration(id: WorkflowIllustrationId): WorkflowIllustrationDefinition {
  return WORKFLOW_ILLUSTRATIONS[id]
}

/** Resolved src, or undefined when no illustration is approved/enabled yet — callers must render their existing neutral hardpoint treatment rather than a broken image. */
export function resolveWorkflowIllustration(id: WorkflowIllustrationId): string | undefined {
  const def = WORKFLOW_ILLUSTRATIONS[id]
  return def.enabled && def.src ? def.src : undefined
}
