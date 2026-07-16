import { Link } from 'react-router-dom'
import { ArrowRight, Image as ImageIcon } from 'lucide-react'
import { resolveWorkflowIllustration } from '../config/assets'
import type { WorkflowIllustrationId } from '../config/assets/types'

export interface WorkflowDestinationCardProps {
  to: string
  title: string
  supportingLine: string
  illustrationId: WorkflowIllustrationId
}

/**
 * EWO-011 — an operational workflow destination, not a metric. Visually
 * distinct from CriticalMetricTile/FleetStatusTile on purpose: a dedicated
 * illustration hardpoint stands in for a future fixed illustration (never
 * a small data-tile icon box, never a broken image, never a blank hole),
 * a strong title, one supporting line, and full-card click + keyboard
 * focus behavior since the whole card is the destination action.
 */
export default function WorkflowDestinationCard({ to, title, supportingLine, illustrationId }: WorkflowDestinationCardProps) {
  const illustrationSrc = resolveWorkflowIllustration(illustrationId)

  return (
    <Link
      to={to}
      className="panel overflow-hidden flex flex-col sm:flex-row min-w-0 group transition-colors hover:border-cyan/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <div className="hidden sm:flex sm:w-[34%] shrink-0 relative bg-black/30 min-h-[104px] items-center justify-center overflow-hidden">
        {illustrationSrc ? (
          <img src={illustrationSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="w-11 h-11 rounded-full border border-dashed border-white/15 flex items-center justify-center">
            <ImageIcon className="text-muted/30" size={18} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-center gap-1">
        <h3 className="font-display font-semibold text-white text-base leading-tight truncate">{title}</h3>
        <p className="text-xs text-muted">{supportingLine}</p>
        <div className="mt-2 flex items-center gap-1 text-sm font-medium text-cyan group-hover:gap-1.5 transition-all">
          <span>Open</span> <ArrowRight size={13} className="shrink-0" />
        </div>
      </div>
    </Link>
  )
}
