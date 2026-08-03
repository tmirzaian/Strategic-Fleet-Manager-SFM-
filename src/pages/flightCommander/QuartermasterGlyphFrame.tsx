import type { LucideIcon } from 'lucide-react'
import { QuartermasterIconHousing } from '../../components/stationKit'

/**
 * EWO-108 (Part I) + EWO-110 (Part H) — Quartermaster Iconography.
 *
 * A structural housing around an existing Lucide category glyph (never a
 * new taxonomy — `Icon`/`label` always come from
 * `CANONICAL_COMPONENT_CATEGORY_ICON`/`CANONICAL_COMPONENT_CATEGORY_LABEL`,
 * componentCategoryIcon.ts). The housing itself is now the Station Kit's
 * canonical `QuartermasterIconHousing` (EWO-110 Part H, generalizing this
 * component's own `matched: boolean` into `active: boolean`) — this file
 * keeps only what's genuinely Flight-Commander-specific: computing the
 * "X match"/"X not matched" accessible label text for a category-match
 * glyph specifically, a wording choice a generic icon housing has no
 * business knowing about.
 *
 * `matched` never encodes readiness/validity/warning semantics; those
 * remain the exclusive province of the existing Badge/STATUS_PILL system
 * elsewhere in the app.
 */
export default function QuartermasterGlyphFrame({
  Icon,
  label,
  matched,
  size = 'md',
}: {
  Icon: LucideIcon
  label: string
  matched: boolean
  size?: 'sm' | 'md'
}) {
  return <QuartermasterIconHousing icon={Icon} label={matched ? `${label} match` : `${label} not matched`} active={matched} size={size} />
}
