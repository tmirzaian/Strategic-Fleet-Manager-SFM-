import { componentsByEntityClass, resolveComponentByName, CATEGORY_TO_PORT_TYPE, type CanonicalComponentRecord } from '../generated/componentCatalog'
import { isPlayerSelectableRecord } from '../data/componentCatalog'
import type { TargetComponentOption } from '../components/TargetComponentPicker'

/**
 * SW-008A Revision 1 — the one authoritative, full-catalog option list
 * every real-catalog-backed Target picker in Strategic Fleet Manager
 * builds from. Originally inline in `MissionComposer.tsx` (Mission M-012 /
 * EWO-STAB-004A); extracted here so Ship Workspace's Manage Loadout New
 * Target selector consumes the exact same canonical source rather than a
 * second, independently-derived one — "compatibility must derive from the
 * same canonical authority used by installation validation."
 *
 * Built from `componentsByEntityClass` (entityClass-first, includes
 * PDCTurret components the legacy `catalogComponentsByName` map excludes).
 * A display name shared by two or more genuinely different real
 * components (`resolveComponentByName` returns `ambiguous`) produces one
 * option PER real entityClass, each carrying that entityClass and a
 * disambiguating `label`; an unambiguous name still produces exactly one
 * option, `item` alone. Every option's `item` is always the real catalog
 * display name — what gets committed to a Hardpoint's `targetItem` on
 * selection. Sorted alphabetically by display label so any consumer that
 * simply filters this list (rather than reordering it) gets deterministic
 * order for free.
 */
function categoryLabelFor(record: CanonicalComponentRecord): string {
  if (record.subtype === 'PDCTurret') return 'PDC Turret'
  return CATEGORY_TO_PORT_TYPE[record.category] ?? record.category
}

export const fullComponentCatalog: TargetComponentOption[] = (() => {
  const entries: TargetComponentOption[] = []
  const displayNames = new Set(Array.from(componentsByEntityClass.values(), (r) => r.displayName))
  for (const name of displayNames) {
    const resolution = resolveComponentByName(name)
    const candidates = resolution.status === 'ambiguous' ? resolution.candidates : resolution.status === 'resolved' ? [resolution.record] : []
    const selectable = candidates.filter(isPlayerSelectableRecord)
    if (selectable.length === 0) continue
    if (selectable.length === 1) {
      const record = selectable[0]
      entries.push({ path: `${categoryLabelFor(record)} → ${name}`, item: name, entityClass: record.entityClass })
    } else {
      for (const record of selectable) {
        entries.push({
          path: `${categoryLabelFor(record)} → ${name}`,
          item: name,
          label: `${name} — ${categoryLabelFor(record)}, S${record.size}`,
          entityClass: record.entityClass,
        })
      }
    }
  }
  entries.sort((a, b) => (a.label ?? a.item).localeCompare(b.label ?? b.item))
  return entries
})()
