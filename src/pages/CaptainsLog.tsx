import { ScrollText, TrendingUp } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import DevValidationPanel from '../components/DevValidationPanel'

export default function CaptainsLog() {
  const log = useFleetStore((s) => s.log)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Captain's Log</p>
        <h1 className="text-2xl font-display font-bold text-white">What happened?</h1>
      </div>

      <DevValidationPanel />

      <div className="relative pl-6">
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-white/10" />
        <div className="space-y-4">
          {log.map((entry) => (
            <div key={entry.id} className="relative">
              <div className="absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full bg-cyan/20 border-2 border-cyan flex items-center justify-center" />
              <div className="panel p-4">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-xs font-medium text-cyan uppercase tracking-widest">{entry.action}</span>
                  <span className="text-[11px] text-muted font-mono">{entry.timestamp}</span>
                </div>
                <p className="text-sm text-white flex items-start gap-2">
                  <ScrollText size={14} className="text-muted mt-0.5 shrink-0" />
                  {entry.details}
                </p>
                {entry.readinessBefore !== undefined && entry.readinessAfter !== undefined && (
                  <p className="text-xs text-success flex items-center gap-1.5 mt-2">
                    <TrendingUp size={13} /> Readiness {entry.readinessBefore}% → {entry.readinessAfter}%
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
