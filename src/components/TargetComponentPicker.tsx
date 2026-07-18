import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { resolveComponentLabel } from '../utils/componentPresentation'

export interface TargetComponentOption {
  /** The real catalog display name — always what's committed via
   * `onChange` when this option is chosen, so a saved Target string
   * still resolves against the catalog exactly as before. */
  item: string
  path: string
  /** EWO-STAB-004A (ADR-010, Assignment 9) — an optional disambiguating
   * label (e.g. `M2C "Swarm" — PDC Turret, S2`), shown in place of `item`
   * only when this option's display name is genuinely ambiguous across
   * more than one real, differently-shaped component. Absent for every
   * ordinary, unambiguous option — never a raw entityClass shown as the
   * primary label. */
  label?: string
  /** EWO-STAB-004A (ADR-010) — this option's own resolved entityClass,
   * when known. Carried through to the compatibility filter that builds
   * this list (never shown in the UI itself); not read by this component
   * directly. */
  entityClass?: string
}

const MAX_VISIBLE_OPTIONS = 40

/**
 * EWO-023 (Task 1) — replaces a native `<input list> + <datalist>` combo
 * for the Loadout Manager's Target column. Root cause of "the dropdown
 * never opens": a native datalist popup is browser-chrome-rendered
 * (unverifiable, inconsistent across browsers) and, more concretely, this
 * page previously rendered one full `<datalist>` of the entire ~600+
 * component catalog PER ROW regardless of whether that row's picker was
 * open — tens of thousands of `<option>` DOM nodes simultaneously for a
 * ship with 40-90 ports (confirmed: 27,240 option elements for a single
 * Corsair). This component only ever renders its option list while
 * actually open, capped at `MAX_VISIBLE_OPTIONS`, and is a fully
 * React-controlled listbox — its open/closed state, filtering, and
 * selection are all real component state, not implicit browser UI, so
 * "does it open" is directly testable rather than a native-control
 * guessing game.
 *
 * Typing still free-form updates the value directly (an exact custom
 * target the catalog doesn't list is still accepted, matching the
 * previous datalist input's behavior — this was never a closed enum).
 */
export default function TargetComponentPicker({
  value,
  onChange,
  options,
  id,
}: {
  value: string
  /** EWO-STAB-004B (ADR-010) — `entityClass` is the chosen option's own
   * resolved identity, passed alongside the display name whenever a real
   * catalog option was selected (click or Enter-on-match) — `undefined`
   * for an option with no known entityClass (an ordinary demo/unresolved
   * entry), exactly as before. There is currently no path in this
   * component that commits genuinely free-typed, non-matching text (see
   * test 5's own documented behavior) — every `onChange` call here
   * originates from a real `options` entry. */
  onChange: (value: string, entityClass?: string) => void
  options: TargetComponentOption[]
  id: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  // A pre-filled Target value must never filter the list down to itself
  // the moment the picker opens — this is the exact defect that made the
  // native datalist this replaces feel broken (a port's factory-assigned
  // value rarely substring-matches anything else, so the "menu" appeared
  // to show nothing). Filtering only activates once the Commander has
  // actually typed something new since opening.
  const [filterText, setFilterText] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep the local edit buffer in sync when the committed value changes
  // from outside (switching ship/starting-state/preset), but never while
  // the Commander is actively typing in this exact field.
  useEffect(() => {
    if (!open) setQuery(value)
  }, [value, open])

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    const matches = q ? options.filter((o) => o.item.toLowerCase().includes(q) || o.label?.toLowerCase().includes(q)) : options
    return matches.slice(0, MAX_VISIBLE_OPTIONS)
  }, [options, filterText])

  function openList() {
    setFilterText('')
    setOpen(true)
  }

  function commit(next: string, entityClass?: string) {
    onChange(next, entityClass)
    setQuery(next)
    setOpen(false)
  }

  // EWO-036B (Task 3) — the currently-committed value's compact
  // classification subtitle renders the same way Factory/Installed
  // already do (ComponentAssignmentLabel), so comparing a Target choice
  // against what's already installed never requires memorizing a
  // component name.
  const committedLabel = resolveComponentLabel(value)

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        // Closing on blur would fire before a click on an option inside
        // this same container registers — only close once focus has
        // genuinely left the whole picker, not moved between its own
        // input and its own listbox.
        if (!containerRef.current?.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        autoComplete="off"
        value={query}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          setQuery(e.target.value)
          setFilterText(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQuery(value)
            setOpen(false)
          } else if (e.key === 'Enter' && filtered[0]) {
            commit(filtered[0].item, filtered[0].entityClass)
          }
        }}
        className="w-full min-w-[9rem]"
      />
      {!open && committedLabel.classificationLabel && (
        <div className="mt-0.5 leading-tight">
          <span className="block text-[11px] text-muted/70 truncate">{committedLabel.classificationLabel}</span>
        </div>
      )}
      {open && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-max min-w-full overflow-y-auto rounded-lg border border-white/10 bg-[#0b141b] shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted flex items-center gap-1.5">
              <Search size={12} /> No matching component — press Enter to use this exact text.
            </li>
          ) : (
            filtered.map((o) => {
              const optionLabel = resolveComponentLabel(o.item)
              return (
                <li key={o.item}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(o.item, o.entityClass)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-cyan/10 hover:text-cyan transition-colors ${o.item === value ? 'text-cyan' : 'text-white/85'}`}
                  >
                    <span className="block truncate">{o.label ?? o.item}</span>
                    {optionLabel.classificationLabel && <span className="block text-[10px] text-muted/60 truncate">{optionLabel.classificationLabel}</span>}
                  </button>
                </li>
              )
            })
          )}
          {options.length > MAX_VISIBLE_OPTIONS && filtered.length === MAX_VISIBLE_OPTIONS && (
            <li className="px-3 py-1.5 text-[11px] text-muted/60 border-t border-white/5">Keep typing to narrow down further results…</li>
          )}
        </ul>
      )}
    </div>
  )
}
