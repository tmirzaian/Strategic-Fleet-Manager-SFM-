import { resolveComponentLabel } from '../utils/componentPresentation'

/**
 * EWO-019A — the one shared rendering contract for a Factory/Installed/
 * Target component cell: a Commander-facing primary name, an optional
 * identity secondary line, and the raw internal identifier exposed only
 * as a title attribute (never a third permanent line). Used identically
 * by LoadoutPortTree (Ship Detail), MissionComposer's Factory/Installed
 * columns, and Ship Workspace's Manage Loadout/Change Installed
 * Components lenses so the same assignment never shows a display name in
 * one place and a raw identifier in another.
 *
 * CAT-001 (Objective 7) — renders `identityLine` (the shared, family-aware
 * formatter also used by Ship Workspace's New Target picker), not the
 * older `classificationLabel`: the same component's secondary line must
 * be identical across Installed, Current Target, and New Target, which
 * only holds if every one of those surfaces draws from the exact same
 * formatter output.
 */
export default function ComponentAssignmentLabel({ value, className }: { value: string | null | undefined; className?: string }) {
  const { primaryLabel, identityLine, diagnosticInternalName } = resolveComponentLabel(value)
  return (
    <span title={diagnosticInternalName ?? undefined} className={className}>
      {/* EWO-068 (Part D) — each truncatable line carries its own full-
          value title so a Commander hovering directly over ellipsized
          text (e.g. inside Ship Assessment's constrained columns) reads
          its real value, not the outer diagnostic identifier above. */}
      <span className="block truncate" title={primaryLabel}>
        {primaryLabel}
      </span>
      {identityLine && (
        <span className="block text-[11px] text-muted/70 truncate" title={identityLine}>
          {identityLine}
        </span>
      )}
    </span>
  )
}
