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

export default function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`badge ${toneStyles[tone]}`}>{children}</span>
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
