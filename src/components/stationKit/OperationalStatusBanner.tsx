import { CheckCircle2, Wrench, Eye, AlertTriangle, ShieldCheck, Info, ShieldAlert, XOctagon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Tone } from '../Badge'

export type OperationalStatusVariant = 'mission-ready' | 'maintenance-required' | 'standing-watch' | 'attention-required' | 'operational' | 'information' | 'warning' | 'critical'

interface VariantSpec {
  label: string
  tone: Tone
  icon: LucideIcon
}

/**
 * EWO-110 (Part E) — every variant maps to the app's one existing color
 * vocabulary (`Badge.tsx`'s `Tone`, itself ADR-004 §6's palette) — no new
 * color is introduced anywhere in this file. `'critical'` is an addition
 * beyond the work order's own seven named variants: ADR-004 §6 defines a
 * fifth palette meaning (Red — "Critical, Failure, Immediate
 * intervention") that none of the seven named variants reach, and a
 * status-banner system with no way to express it would be incomplete
 * against the app's own existing color authority. See
 * docs/EWO-110-Quartermaster-Station-Kit.md for the full reasoning.
 */
const VARIANTS: Record<OperationalStatusVariant, VariantSpec> = {
  'mission-ready': { label: 'Mission Ready', tone: 'success', icon: ShieldCheck },
  operational: { label: 'Operational', tone: 'success', icon: CheckCircle2 },
  'standing-watch': { label: 'Standing Watch', tone: 'gold', icon: Eye },
  'attention-required': { label: 'Attention Required', tone: 'gold', icon: AlertTriangle },
  'maintenance-required': { label: 'Maintenance Required', tone: 'warning', icon: Wrench },
  warning: { label: 'Warning', tone: 'warning', icon: ShieldAlert },
  information: { label: 'Information', tone: 'cyan', icon: Info },
  critical: { label: 'Critical', tone: 'danger', icon: XOctagon },
}

const TONE_CLASSES: Record<Tone, { border: string; text: string; bg: string }> = {
  cyan: { border: 'border-cyan/30', text: 'text-cyan', bg: 'bg-cyan/10' },
  success: { border: 'border-success/30', text: 'text-success', bg: 'bg-success/10' },
  warning: { border: 'border-warning/30', text: 'text-warning', bg: 'bg-warning/10' },
  danger: { border: 'border-danger/30', text: 'text-danger', bg: 'bg-danger/10' },
  muted: { border: 'border-white/10', text: 'text-muted', bg: 'bg-white/5' },
  invalid: { border: 'border-danger', text: 'text-white', bg: 'bg-danger/30' },
  gold: { border: 'border-gold/30', text: 'text-gold', bg: 'bg-gold/10' },
}

export interface OperationalStatusBannerProps {
  variant: OperationalStatusVariant
  /** Overrides the variant's own default label — for a Station-specific phrasing of the same underlying condition (e.g. Flight Commander's "Target Intelligence Available" instead of the generic "Operational"). The semantic tone/icon always still comes from `variant`. */
  label?: string
  description?: string
  testId?: string
}

/**
 * EWO-110 (Part E) — the canonical operational status banner. A compact
 * horizontal strip (icon + label, optional description) rather than a
 * full panel — for a fuller "nothing to report" surface, compose this
 * with `OfficerBriefingBlock` inside a `StandingReportRegion`
 * (`src/components/stationShell`) instead.
 */
export default function OperationalStatusBanner({ variant, label, description, testId }: OperationalStatusBannerProps) {
  const spec = VARIANTS[variant]
  const classes = TONE_CLASSES[spec.tone]
  const Icon = spec.icon
  return (
    <div data-testid={testId ?? 'operational-status-banner'} className={`flex items-start gap-3 rounded-md border ${classes.border} ${classes.bg} px-4 py-3`}>
      <Icon size={18} className={`shrink-0 mt-0.5 ${classes.text}`} aria-hidden="true" />
      <div>
        <p className={`text-sm font-display font-bold ${classes.text}`}>{label ?? spec.label}</p>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
    </div>
  )
}
