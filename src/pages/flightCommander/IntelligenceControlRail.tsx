import { Search } from 'lucide-react'
import { CANONICAL_STABLE_CATEGORY_KEYS, CANONICAL_COMPONENT_CATEGORY_LABEL } from '../../utils/componentCategoryIcon'

/**
 * EWO-108 (Part F) — Intelligence Control Rail. Behavior is byte-for-byte
 * unchanged from the certified EWO-104 filter bar (same search
 * placeholder/aria-label, same category set, same active-filter toggle
 * logic — all owned by the parent, this component is presentation only).
 * Restyled as a compact mounted rail (recessed dark housing, matching the
 * instrument/glyph housing language) rather than a plain `.panel` card.
 */
function pillClass(active: boolean): string {
  return `text-xs font-medium rounded-full px-3 py-1 border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan/60 focus-visible:outline-offset-1 ${
    active ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/10 text-muted hover:text-white hover:border-cyan/30'
  }`
}

export default function IntelligenceControlRail({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  categoryFilter: string | null
  onCategoryFilterChange: (value: string | null) => void
}) {
  return (
    <div className="bg-black/30 backdrop-blur-md border border-white/10 rounded-md p-3 flex flex-wrap items-center gap-3" data-testid="intelligence-control-rail">
      {/* EWO-108 (Part O) — min-w-0 (not a fixed 220px) below the `sm:`
          breakpoint so this can shrink to fit narrow viewports instead of
          forcing horizontal overflow; the original 220px minimum is
          preserved from `sm:` up, unchanged from tablet/desktop. */}
      <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search source ship or component..."
          aria-label="Search target roster"
          className="w-full pl-8 bg-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan/60"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onCategoryFilterChange(null)} className={pillClass(categoryFilter === null)}>
          All
        </button>
        {CANONICAL_STABLE_CATEGORY_KEYS.map((key) => (
          <button key={key} type="button" onClick={() => onCategoryFilterChange(categoryFilter === key ? null : key)} className={pillClass(categoryFilter === key)}>
            {CANONICAL_COMPONENT_CATEGORY_LABEL[key]}
          </button>
        ))}
      </div>
    </div>
  )
}
