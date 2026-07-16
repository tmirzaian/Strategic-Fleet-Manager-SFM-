import { useEffect, useMemo, useState } from 'react'
import { catalogComponentsByName } from '../generated/componentCatalog'
import { resolveComponentLabel } from '../utils/componentPresentation'
import { manufacturerFullNameForCode, manufacturerNameForCode } from '../utils/manufacturerLogo'

const componentCatalogNames = Array.from(catalogComponentsByName.keys()).sort((a, b) => a.localeCompare(b))

function manufacturerNameFor(code: string | null): string | undefined {
  if (!code) return undefined
  return manufacturerFullNameForCode(code) ?? manufacturerNameForCode(code)
}

export interface CatalogComponentSearchProps {
  selectedName: string
  onSelect: (name: string) => void
  placeholder?: string
}

/**
 * EWO-030 (Task 1) — the one canonical catalog-driven component search +
 * select renderer. Originally Hangar Inventory's "Add New Item" markup
 * (EWO-028), extracted here so Quick Update renders a component search with
 * the exact same font/spacing/Type/Size/Class/Grade/Manufacturer treatment
 * by sharing this component outright, not by visually matching it. A search
 * narrow enough to leave exactly one catalog match auto-selects it
 * (EWO-029, Task 1); every keystroke clears the prior selection first, so
 * broadening the search or reaching zero matches never leaves a stale
 * selection pointed at an option no longer listed.
 *
 * EWO-031 (Task 2) — a blank search shows the complete, alphabetically
 * sorted canonical catalog (no artificial cap); the listbox itself
 * (`size={6}`) scrolls to reach the rest. Typed search is the same
 * substring filter as before, also uncapped, so a broad query can never
 * silently hide a real match past a fixed limit (Task 3 — every
 * canonical component must be discoverable both blank and by search).
 */
export default function CatalogComponentSearch({ selectedName, onSelect, placeholder = 'Search catalog components…' }: CatalogComponentSearchProps) {
  const [nameQuery, setNameQuery] = useState('')

  const filteredCatalogMatches = useMemo(() => {
    const q = nameQuery.trim().toLowerCase()
    return q ? componentCatalogNames.filter((n) => n.toLowerCase().includes(q)) : componentCatalogNames
  }, [nameQuery])

  useEffect(() => {
    if (filteredCatalogMatches.length === 1 && filteredCatalogMatches[0] !== selectedName) {
      onSelect(filteredCatalogMatches[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCatalogMatches])

  const selectedCatalogEntry = selectedName ? catalogComponentsByName.get(selectedName) : undefined
  const selectedLabel = selectedName ? resolveComponentLabel(selectedName) : null

  return (
    <div>
      <input
        value={nameQuery}
        onChange={(e) => {
          setNameQuery(e.target.value)
          onSelect('')
        }}
        placeholder={placeholder}
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-cyan/50"
      />
      <select
        size={6}
        value={selectedName}
        onChange={(e) => onSelect(e.target.value)}
        className="mt-2 w-full bg-black/30 border border-white/10 rounded-lg text-sm text-white"
      >
        {filteredCatalogMatches.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {nameQuery && filteredCatalogMatches.length === 0 && <p className="text-xs text-muted mt-1.5">No matching catalog component — free-text entries are not accepted.</p>}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Type</label>
          <div className="w-full bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-sm text-muted/80">{selectedCatalogEntry?.category ?? '—'}</div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Size</label>
          <div className="w-full bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-sm text-muted/80">{selectedCatalogEntry ? `S${selectedCatalogEntry.size}` : '—'}</div>
        </div>
      </div>
      {selectedCatalogEntry && (selectedLabel?.classificationLabel || manufacturerNameFor(selectedCatalogEntry.manufacturerCode)) && (
        <div className="text-xs text-muted flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {selectedLabel?.classificationLabel && <span>{selectedLabel.classificationLabel}</span>}
          {manufacturerNameFor(selectedCatalogEntry.manufacturerCode) && <span>{manufacturerNameFor(selectedCatalogEntry.manufacturerCode)}</span>}
        </div>
      )}
    </div>
  )
}
