import { useState } from 'react'
import { Search, Star, HelpCircle, EyeOff } from 'lucide-react'

type Verdict = {
  headline: 'KEEP' | 'IGNORE' | 'CHECK BUILD'
  stars: number
  reason: string
  disposition: string
  tone: 'success' | 'muted'
}

function evaluate(query: string): Verdict {
  const q = query.trim().toLowerCase()
  if (q === 'mirage') {
    return { headline: 'KEEP', stars: 5, reason: 'Needed by Ghost Stealth Build', disposition: 'Install / Store', tone: 'success' }
  }
  if (q === 'slipstream') {
    return { headline: 'KEEP', stars: 5, reason: 'Needed by Ghost Stealth Build', disposition: 'Install', tone: 'success' }
  }
  if (q === 'snowblind') {
    return { headline: 'KEEP', stars: 4, reason: 'Needed by Ghost Stealth Build', disposition: 'Install', tone: 'success' }
  }
  if (q === 'fr-86' || q === 'fr86') {
    return { headline: 'KEEP', stars: 4, reason: 'Needed by Corsair or Cutlass Black', disposition: 'Store', tone: 'success' }
  }
  if (q === 's4' || q === 'revenant') {
    return { headline: 'IGNORE', stars: 2, reason: 'No active build requires this item.', disposition: '—', tone: 'muted' }
  }
  return { headline: 'CHECK BUILD', stars: 0, reason: 'No exact match in demo data.', disposition: '—', tone: 'muted' }
}

const toneClasses: Record<Verdict['tone'], string> = {
  success: 'border-success/30 bg-success/5 text-success',
  muted: 'border-white/10 bg-white/[0.02] text-muted',
}

export default function DecisionCenter() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<Verdict | null>(null)

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Decision Center</p>
        <h1 className="text-2xl font-display font-bold text-white">Should I keep this?</h1>
        <p className="text-sm text-muted mt-1">
          Check found loot against your active builds. Anything no build needs gets Ignored — vendor trash isn't tracked here.
        </p>
      </div>

      <div className="panel p-6 space-y-4">
        <label className="text-xs uppercase tracking-widest text-muted block">Found Item</label>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setResult(evaluate(query))}
            placeholder="e.g. Mirage, Slipstream, FR-86…"
            className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-cyan/50"
          />
          <button
            onClick={() => setResult(evaluate(query))}
            className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-cyan/90 transition-colors"
          >
            <Search size={15} /> Check Item
          </button>
        </div>
      </div>

      {result && (
        <div className={`panel p-6 border ${toneClasses[result.tone]}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-2xl flex items-center gap-2">
              {result.headline === 'IGNORE' && <EyeOff size={20} />}
              {result.headline}
            </h2>
            {result.stars > 0 ? (
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={16} className={i < result.stars ? 'fill-current' : 'opacity-20'} />
                ))}
              </div>
            ) : (
              <HelpCircle size={20} />
            )}
          </div>
          <p className="text-sm text-white/80">{result.reason}</p>
          {result.disposition !== '—' && (
            <p className="text-xs uppercase tracking-widest mt-3 text-white/60">
              Disposition: <span className="font-semibold">{result.disposition}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
