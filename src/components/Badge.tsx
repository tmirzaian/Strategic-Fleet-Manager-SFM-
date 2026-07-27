type Tone = 'cyan' | 'success' | 'warning' | 'danger' | 'muted' | 'invalid'

const toneStyles: Record<Tone, string> = {
  cyan: 'bg-cyan/10 text-cyan ring-1 ring-inset ring-cyan/30',
  success: 'bg-success/10 text-success ring-1 ring-inset ring-success/30',
  warning: 'bg-warning/10 text-warning ring-1 ring-inset ring-warning/30',
  danger: 'bg-danger/10 text-danger ring-1 ring-inset ring-danger/30',
  muted: 'bg-white/5 text-muted ring-1 ring-inset ring-white/10',
  // Deliberately more intense than 'danger' — Invalid Target is a data
  // problem, not a routine Missing state, and should read as one at a glance.
  invalid: 'bg-danger/30 text-white ring-1 ring-inset ring-danger font-bold',
}

export default function Badge({ children, tone = 'muted', wrap = false }: { children: React.ReactNode; tone?: Tone; wrap?: boolean }) {
  return <span className={`badge ${wrap ? 'badge-wrap' : ''} ${toneStyles[tone]}`}>{children}</span>
}

export function ownershipTone(ownership: string): Tone {
  if (ownership === 'Owned') return 'success'
  if (ownership === 'Purchased') return 'cyan'
  return 'warning'
}

export function dispositionTone(disposition: string): Tone {
  switch (disposition) {
    case 'Install':
      return 'success'
    case 'Trade':
      return 'cyan'
    case 'Stockpile':
      return 'muted'
    case 'Store':
      return 'muted'
    case 'Ignore':
      return 'muted'
    default:
      return 'muted'
  }
}

export function statusTone(status: string): Tone {
  if (status === 'OK') return 'success'
  if (status === 'Invalid Target') return 'invalid'
  if (status === 'Missing') return 'danger'
  if (status === 'Unresolved') return 'muted'
  return 'warning'
}

/** UX-001B.3 (Deliverable 1/2) — Canonical Procurement State Colors, one
 * semantic color system for operational inventory state across the whole
 * app, never a Mission-Control-only palette:
 *   - Available → `success` (green) — owned, unreserved, ready for
 *     immediate installation.
 *   - Reserved → `cyan` ("Quartermaster Blue") — owned, but already
 *     committed to another Loadout; available only through
 *     reprioritization, not immediately deployable. This reuses the
 *     EXACT existing Reserved-state color, not a new one: Hangar
 *     Inventory's own reserved-quantity cell (`HangarInventory.tsx`) and
 *     `LoadoutPortTree.tsx`'s `logisticsTone()` both already render
 *     Reserved in `cyan`. UX-001B's first pass wrongly used `success`
 *     here (reasoning Reserved and Available both read as "zero-friction
 *     wins") — Commander review corrected this: they are visually
 *     identical today only by accident, and Reserved is NOT immediately
 *     deployable the way Available is, so it must not share Available's
 *     color.
 *   - Purchase Required → `muted` (white/gray) — not owned, external
 *     procurement required (matches `componentAcquisitionHint.ts`'s own
 *     established "Purchase Required" tone).
 * Future states (Craft Required, Loot Source) are reserved for distinct
 * colors (purple/orange) but not implemented — no such states exist yet,
 * so no unused Tone values are added ahead of need.
 *
 * Takes a plain string, like `dispositionTone`/`ownershipTone` above,
 * rather than importing `quartermasterBriefing.ts`'s own
 * `ProcurementRowState` union — this stays a leaf presentation module. */
export function procurementRowStateTone(state: string): Tone {
  if (state === 'RESERVED') return 'cyan'
  if (state === 'PURCHASE_REQUIRED') return 'muted'
  return 'success'
}

export function procurementRowStateLabel(state: string): string {
  if (state === 'RESERVED') return 'Reserved'
  if (state === 'AVAILABLE') return 'Available'
  return 'Purchase Required'
}
