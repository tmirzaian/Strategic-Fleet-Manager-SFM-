import { CheckCircle2 } from 'lucide-react'
import { StandingReportRegion } from '../../components/stationShell'

/**
 * EWO-108 (Part L) + EWO-109 (Part D) — Standing Watch is a first-class
 * Flight Commander report, never an empty state. Every line below is
 * exactly the EWO-108 work order's own required copy — no fabricated
 * activity, no warning/error/failure tone. This component now owns only
 * that Flight-Commander-specific copy; the panel framing and the
 * monitoring-visual (radar sweep) presentation moved to the shell's
 * `StandingReportRegion` (EWO-109 Part B/E) — this file supplies content,
 * not the report's own architecture.
 */
export default function StandingWatchPanel() {
  return (
    <StandingReportRegion testId="standing-watch-panel">
      <p className="text-xs uppercase tracking-[0.25em] text-cyan/70">Flight Intelligence</p>
      <div className="flex items-center justify-center gap-2 mt-2">
        <CheckCircle2 className="text-gold" size={22} aria-hidden="true" />
        <p className="text-lg font-display font-bold text-white">Standing Watch</p>
      </div>
      <p className="text-sm text-muted mt-4 max-w-md mx-auto">Fleet Intelligence has no active acquisition targets.</p>
      <p className="text-sm text-muted mt-2 max-w-md mx-auto">
        Current Commander doctrine is fully supported by installed equipment, known fleet inventory, and valid reservations.
      </p>
      <p className="text-sm text-muted mt-2 max-w-md mx-auto">Continue normal operations.</p>
      <p className="text-sm text-muted mt-2 max-w-md mx-auto">Flight Commander will identify new target opportunities when fleet procurement requirements change.</p>

      <div className="mt-6 pt-5 border-t border-white/10 max-w-sm mx-auto text-left">
        <p className="text-[11px] uppercase tracking-widest text-gold/70 mb-2 text-center">Intelligence Status</p>
        <ul className="space-y-1.5">
          <li className="text-[11px] text-cyan/70 uppercase tracking-widest flex items-start gap-2">
            <span className="text-gold/60 mt-0.5" aria-hidden="true">
              &bull;
            </span>
            Monitoring known factory configurations
          </li>
          <li className="text-[11px] text-cyan/70 uppercase tracking-widest flex items-start gap-2">
            <span className="text-gold/60 mt-0.5" aria-hidden="true">
              &bull;
            </span>
            Monitoring Commander procurement requirements
          </li>
          <li className="text-[11px] text-cyan/50 uppercase tracking-widest flex items-start gap-2">
            <span className="text-gold/60 mt-0.5" aria-hidden="true">
              &bull;
            </span>
            Awaiting actionable target opportunities
          </li>
        </ul>
      </div>
    </StandingReportRegion>
  )
}
