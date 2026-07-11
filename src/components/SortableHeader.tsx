import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'

/**
 * Shared sortable column header (Alpha 2.4 Part 11, extended Alpha 2.5A
 * Part 6) — every sortable column gets a persistent sort indicator,
 * visible whether or not it's hovered or currently active. Inactive
 * columns show a neutral ⇅ (via lucide's ChevronsUpDown) so the player
 * always knows sorting is available here, not just on the
 * currently-active column. `aria-sort` on the <th> itself exposes the
 * active sort direction to assistive tech — 'none' when this column
 * isn't the active one, 'ascending'/'descending' when it is.
 *
 * Non-sortable columns (e.g. Needed By) simply don't use this component
 * at all — they render as a plain <th>, which is already correct: no
 * sort icon, no button, nothing implying interactivity.
 */
export default function SortableHeader<T extends string>({
  label,
  column,
  activeColumn,
  direction,
  onSort,
}: {
  label: string
  column: T
  activeColumn: T
  direction: 'asc' | 'desc'
  onSort: (column: T) => void
}) {
  const isActive = column === activeColumn
  const ariaSort = isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th className="px-5 py-3 font-medium" aria-sort={ariaSort}>
      <button onClick={() => onSort(column)} className={`flex items-center gap-1 hover:text-white transition-colors ${isActive ? 'text-cyan' : ''}`}>
        {label}
        {isActive ? direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ChevronsUpDown size={12} className="text-muted/50" />}
      </button>
    </th>
  )
}
