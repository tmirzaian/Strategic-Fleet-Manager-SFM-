import { assetPath } from './assetPaths'
import type { WorkflowIllustrationDefinition, WorkflowIllustrationId } from './types'

function definition(id: WorkflowIllustrationId, label: string, overrides: Partial<Omit<WorkflowIllustrationDefinition, 'id' | 'label'>> = {}): WorkflowIllustrationDefinition {
  return { id, label, enabled: false, ...overrides }
}

/**
 * EWO-011 — fixed illustrations for the two operational Workflow
 * Destination cards ("Found Loot?" wants a citizen/technician among
 * recovered components; "Something Changed?" wants a spacecraft in a
 * maintained hangar).
 *
 * EWO-035 — both are now Commander-approved Beta artwork, delivered under
 * `public/assets/environments/mission-control/` (the canonical Beta
 * artwork location per EWO-035, even though these two illustrations
 * render on Mission Control's cards rather than as its page background).
 * Beta 1.0 artwork only — Release 2.0 Quartermaster Edition may replace
 * either file later with no change to `WorkflowDestinationCard` or any
 * other consumer, same resolution boundary as every other asset registry
 * in this pipeline.
 */
export const WORKFLOW_ILLUSTRATIONS: Record<WorkflowIllustrationId, WorkflowIllustrationDefinition> = {
  'decision-center-found-loot': definition('decision-center-found-loot', 'Found Loot? — Decision Center', {
    src: assetPath('environments/mission-control/decision-center-found-loot.webp'),
    enabled: true,
  }),
  'quick-update-hangar': definition('quick-update-hangar', 'Something Changed? — Quick Update', {
    src: assetPath('environments/mission-control/quick-update-maintenance.webp'),
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
