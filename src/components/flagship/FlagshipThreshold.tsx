import { StructuralDivider } from '../stationKit'

/**
 * EWO-113 (Objective 2) — the architectural threshold immediately to the
 * right of the Sidebar. Persistent and unconditional: rendered once in
 * `App.tsx`, outside the routed `<Suspense>` boundary, so it never
 * remounts or flickers between Stations — the same "holds perfectly
 * still" property QDS-006 Part B names as half of what makes a
 * Navigation -> Bulkhead -> Station transition read as real rather than
 * a page load.
 *
 * Composes the Station Kit's own `StructuralDivider` (`variant="vertical"`)
 * for the seam itself — no gradient/color logic is reimplemented here,
 * per QDS-006 Part H's ownership rule ("a lower tier composes the tier
 * above it, never reimplements it"; the Flagship layer is free to
 * consume Kit content the same way a Shell region does). The soft glow
 * around it is the one Flagship-specific enhancement: more presence than
 * a bare 1px divider warrants when it has to read as a real bulkhead
 * spanning the full viewport height, not just a section break within a
 * panel.
 */
export default function FlagshipThreshold() {
  return (
    <div className="w-3 shrink-0 h-screen sticky top-0 flex items-stretch justify-center relative" aria-hidden="true" data-testid="flagship-threshold">
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-8 pointer-events-none" style={{ boxShadow: '0 0 24px 4px rgba(53,208,255,0.05)' }} />
      <StructuralDivider variant="vertical" testId="flagship-threshold-seam" />
    </div>
  )
}
