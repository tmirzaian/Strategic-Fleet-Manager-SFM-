import { useMemo, useState } from 'react'
import { Search, Star, HelpCircle, EyeOff } from 'lucide-react'
import { decisionCatalog, decisionCatalogNames } from '../data/seed'

type Verdict = {
  headline: 'KEEP' | 'IGNORE' | 'CHECK BUILD'
  stars: number
  reason: string
  disposition: string
  tone: 'success' | 'muted'
}

function evaluate(query: string): Verdict {
  const q = query.trim().toLowerCase()
  const catalogHit = decisionCatalog.find((c) => c.name.toLowerCase() === q)
  if (catalogHit) {
    return {
      headline: catalogHit.headline,
      stars: catalogHit.stars,
      reason: catalogHit.reason,
      disposition: catalogHit.disposition,
      tone: catalogHit.headline === 'KEEP' ? 'success' : 'muted',
    }
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
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return decisionCatalogNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 6)
  }, [query])

  function selectItem(name: string) {
    setQuery(name)
    setShowSuggestions(false)
    setResult(evaluate(name))
  }

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
        <div className="relative">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              onKeyDown={(e) => e.key === 'Enter' && setResult(evaluate(query))}
              placeholder="Start typing — e.g. M, Mi, Mirage…"
              className="flex-1"
            />
            <button
              onClick={() => setResult(evaluate(query))}
              className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-cyan/90 transition-colors shrink-0"
            >
              <Search size={15} /> Check Item
            </button>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1.5 w-full max-w-[calc(100%-6.5rem)] bg-black border border-cyan/30 rounded-lg overflow-hidden shadow-glow">
              {suggestions.map((name) => (
                <button
                  key={name}
                  onMouseDown={() => selectItem(name)}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cyan/15 transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
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
