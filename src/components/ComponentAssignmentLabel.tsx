import { resolveComponentLabel } from '../utils/componentPresentation'

/**
 * EWO-019A — the one shared rendering contract for a Factory/Installed/
 * Target component cell: a Commander-facing primary name, an optional
 * classification secondary line, and the raw internal identifier exposed
 * only as a title attribute (never a third permanent line). Used
 * identically by LoadoutPortTree (Ship Detail) and MissionComposer's
 * Factory/Installed columns so the same assignment never shows a display
 * name in one place and a raw identifier in another.
 */
export default function ComponentAssignmentLabel({ value, className }: { value: string | null | undefined; className?: string }) {
  // EWO-036B (Task 3) — Class and Grade render as one compact combined
  // line ("Military A"), not two separate lines — see
  // formatComponentClassGrade's own doc comment for the exact precedence.
  const { primaryLabel, classificationLabel, diagnosticInternalName } = resolveComponentLabel(value)
  return (
    <span title={diagnosticInternalName ?? undefined} className={className}>
      <span className="block truncate">{primaryLabel}</span>
      {classificationLabel && <span className="block text-[11px] text-muted/70 truncate">{classificationLabel}</span>}
    </span>
  )
}
