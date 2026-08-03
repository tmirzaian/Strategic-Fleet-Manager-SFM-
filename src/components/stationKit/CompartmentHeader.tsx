export interface CompartmentHeaderProps {
  /** The blue eyebrow — e.g. "MISSION CONTROL." Rendered uppercase regardless of casing supplied, matching every existing shipped compartment header. */
  designation: string
  /** The white operational-status title — e.g. "Operations Standing By." Station-owned content (QDS-003 Station Identification/Operational Condition); this component never invents or defaults it. */
  title: string
  subtitle?: string
  /** e.g. "EXECUTIVE OFFICER REPORTING" — optional, per ADR-005 officer attribution. Never a fictional name, only the Station's own officer role. */
  officerDesignation?: string
  testId?: string
}

/**
 * EWO-110 (Part D) — the single compartment-header authority. Every
 * shipped page already renders this exact two-line shape by hand
 * (`text-xs uppercase tracking-[0.25em] text-cyan/70` eyebrow +
 * `text-2xl font-display font-bold text-white` title) — this component
 * makes that the one implementation instead of seven independent copies.
 *
 * Presentation only: `designation`/`title`/`subtitle`/`officerDesignation`
 * are always caller-supplied. This EWO does not rename any shipped
 * Station's title — see docs/EWO-110-Quartermaster-Station-Kit.md for
 * the explicit note on the work order's own illustrative examples
 * ("Fleet Operations Bridge," etc.) versus real, unchanged copy.
 */
export default function CompartmentHeader({ designation, title, subtitle, officerDesignation, testId }: CompartmentHeaderProps) {
  return (
    <div data-testid={testId ?? 'compartment-header'}>
      <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">{designation}</p>
      <h1 className="text-2xl font-display font-bold text-white">{title}</h1>
      {subtitle && <p className="text-sm text-muted mt-1.5">{subtitle}</p>}
      {officerDesignation && <p className="text-[10px] uppercase tracking-widest text-gold/60 mt-1">{officerDesignation}</p>}
    </div>
  )
}
