import type { ReactNode } from 'react'

export interface OfficerBriefingBlockProps {
  standingCondition?: ReactNode
  summary?: ReactNode
  concern?: ReactNode
  recommendation?: ReactNode
  nextAction?: ReactNode
  testId?: string
}

interface SlotSpec {
  key: keyof Omit<OfficerBriefingBlockProps, 'testId'>
  eyebrow: string
  eyebrowClassName: string
  bodyClassName: string
}

/**
 * EWO-110 (Part B) — the canonical Officer Briefing Block, presentation
 * only for QDS-003's own reporting grammar (Station Identification is
 * carried by whatever `CompartmentHeader` this block sits beneath, per
 * QDS-003 Part C.1 — never duplicated here). This component owns none of
 * the five slots' text — Mission Control, Decision Center, Captain's
 * Log, and Flight Commander each supply their own content; the component
 * only supplies consistent eyebrow labeling, spacing, and the
 * recommendation accent (Quartermaster Gold, matching every existing
 * shipped "Recommendation:" line already in the app — Decision Center's
 * own SATISFIED verdict, QDS-003 Part E).
 *
 * Any slot may be omitted — QDS-003 Part B's own "not every layer is a
 * separate visible panel" rule applies here directly: a narrow-domain
 * Station renders only the slots it has real content for.
 */
const SLOTS: SlotSpec[] = [
  { key: 'standingCondition', eyebrow: 'Standing Condition', eyebrowClassName: 'text-cyan/70', bodyClassName: 'text-white font-display font-bold' },
  { key: 'summary', eyebrow: 'Summary', eyebrowClassName: 'text-muted', bodyClassName: 'text-white/90' },
  { key: 'concern', eyebrow: 'Concern', eyebrowClassName: 'text-muted', bodyClassName: 'text-white/90' },
  { key: 'recommendation', eyebrow: 'Recommendation', eyebrowClassName: 'text-gold/70', bodyClassName: 'text-gold' },
  { key: 'nextAction', eyebrow: 'Next Action', eyebrowClassName: 'text-cyan/70', bodyClassName: 'text-cyan' },
]

export default function OfficerBriefingBlock(props: OfficerBriefingBlockProps) {
  const presentSlots = SLOTS.filter((slot) => props[slot.key] != null)
  return (
    <div className="space-y-2.5" data-testid={props.testId ?? 'officer-briefing-block'}>
      {presentSlots.map((slot) => (
        <div key={slot.key} data-testid={`officer-briefing-${slot.key}`}>
          <p className={`text-[10px] uppercase tracking-widest ${slot.eyebrowClassName}`}>{slot.eyebrow}</p>
          <div className={`text-sm mt-0.5 ${slot.bodyClassName}`}>{props[slot.key]}</div>
        </div>
      ))}
    </div>
  )
}
