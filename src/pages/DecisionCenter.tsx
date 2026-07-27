import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Star, HelpCircle, Lock, CheckCircle2 } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { catalogComponentsByName } from '../generated/componentCatalog'
import { resolveNeededByBuilds, type NeededByEntry } from '../utils/inventoryDependencies'

// EWO-031 (Task 1/4) — the same canonical, generated component catalog
// Hangar Inventory, Quick Update, and the Loadout Manager already search
// against (`catalogComponentsByName`, src/generated/componentCatalog.ts) —
// replacing the old hand-authored, ~8-item `decisionCatalog` demo list.
// The Commander now gets the same component results regardless of page.
const componentCatalogNames = Array.from(catalogComponentsByName.keys()).sort((a, b) => a.localeCompare(b))
const MAX_SUGGESTIONS = 8

type Verdict =
  // EWO-031 (Task 5, Scenario A) — still required by one or more of this
  // component's own active Loadouts.
  | { kind: 'REQUIRED'; entries: NeededByEntry[] }
  // EWO-031 (Task 5, Scenario B) — every active Loadout that could use it
  // is already satisfied (or none ever targeted it at all).
  | { kind: 'SATISFIED' }
  | { kind: 'UNKNOWN' }

function evaluate(
  name: string,
  ships: ReturnType<typeof useFleetStore.getState>['ships'],
  builds: ReturnType<typeof useFleetStore.getState>['builds'],
  fleetAssets: ReturnType<typeof useFleetStore.getState>['fleetAssets'],
  hardpoints: ReturnType<typeof useFleetStore.getState>['hardpoints'],
  reservations: ReturnType<typeof useFleetStore.getState>['reservations']
): Verdict {
  if (!catalogComponentsByName.has(name)) return { kind: 'UNKNOWN' }
  // "Active Loadouts" specifically (Task 5's own wording) — not every saved
  // Build a Fleet Asset happens to own, only each Ship's currently-Active one.
  const activeEntries = resolveNeededByBuilds(name, ships, builds, fleetAssets, hardpoints, reservations).filter(
    (e) => ships.find((s) => s.id === e.shipId)?.activeBuildId === e.buildId
  )
  if (activeEntries.length > 0) return { kind: 'REQUIRED', entries: activeEntries }
  return { kind: 'SATISFIED' }
}

export default function DecisionCenter() {
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const reservations = useFleetStore((s) => s.reservations)

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ name: string; verdict: Verdict } | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return componentCatalogNames.filter((name) => name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS)
  }, [query])

  function check(name: string) {
    setResult({ name, verdict: evaluate(name, ships, builds, fleetAssets, hardpoints, reservations) })
  }

  function selectItem(name: string) {
    setQuery(name)
    setShowSuggestions(false)
    check(name)
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        {/* EWO-061 — Operational Header Standardization (§30): the
            functional-description paragraph is dropped — the Found Item
            search field and verdict cards immediately below already
            communicate the page's purpose. */}
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Decision Center</p>
        <h1 className="text-2xl font-display font-bold text-white">Should I keep this?</h1>
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
              onKeyDown={(e) => e.key === 'Enter' && check(query)}
              placeholder="Start typing — e.g. M, Mi, Mirage…"
              className="flex-1"
            />
            <button
              onClick={() => check(query)}
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

      {result?.verdict.kind === 'REQUIRED' && (
        <div className="panel p-6 border border-success/30 bg-success/5 text-success">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-2xl flex items-center gap-2">
              <Star size={20} className="fill-current" /> KEEP
            </h2>
          </div>
          <p className="text-sm text-white/80">
            "{result.name}" is required by {result.verdict.entries.length} active Loadout{result.verdict.entries.length === 1 ? '' : 's'}.
          </p>
          <ul className="mt-3 space-y-2">
            {result.verdict.entries.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3 bg-black/20 border border-white/5 rounded-lg px-3 py-2.5">
                <div className="text-sm text-white min-w-0">
                  <div className="truncate">
                    {e.fleetAssetLabel} ({e.hullName}) — {e.buildName}
                  </div>
                  <div className="text-xs text-muted">Needed By: {e.slotLabel}</div>
                </div>
                {e.reserved ? (
                  <span className="shrink-0 text-xs font-medium text-cyan">Already Reserved</span>
                ) : (
                  <Link
                    to="/hangar"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
                    title={`Reserve ${result.name} in Hangar Inventory`}
                  >
                    <Lock size={13} /> Reserve
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result?.verdict.kind === 'SATISFIED' && (
        <div className="panel p-6 border border-white/10 bg-white/[0.02] text-muted">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-2xl flex items-center gap-2 text-white">
              <CheckCircle2 size={20} className="text-success" /> Already Satisfied
            </h2>
          </div>
          <p className="text-sm text-white/80">
            No active Loadout has an unresolved requirement for "{result.name}" right now — every active Loadout that could use it already has it.
          </p>
          <p className="text-xs uppercase tracking-widest mt-3 text-white/60">
            Recommendation: <span className="font-semibold text-white">Store in Hangar</span> — no reservation required.
          </p>
        </div>
      )}

      {result?.verdict.kind === 'UNKNOWN' && (
        <div className="panel p-6 border border-white/10 bg-white/[0.02] text-muted">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-2xl flex items-center gap-2 text-white">
              <HelpCircle size={20} /> No Catalog Match
            </h2>
          </div>
          <p className="text-sm text-white/80">"{result.name}" doesn't match a real catalog component. Check the spelling or pick a suggestion from the list.</p>
        </div>
      )}
    </div>
  )
}
