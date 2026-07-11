import { resolveManufacturerLogo } from '../utils/manufacturerLogo'

/**
 * Renders a manufacturer's logo top-left of the ship identity block
 * (Alpha 2.5C, Part 1/10). No local logo image assets ship yet, so this
 * always renders the graceful text-code fallback via the resolver — the
 * moment real assets exist, only `resolveManufacturerLogo` needs to
 * change, not any caller.
 */
export default function ManufacturerLogo({ manufacturer }: { manufacturer: string }) {
  const info = resolveManufacturerLogo(manufacturer)

  if (info.logoPath) {
    return <img src={info.logoPath} alt={info.displayName} className="h-5 w-auto opacity-90" />
  }

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded border border-white/15 bg-black/30 font-mono text-[10px] tracking-[0.15em] text-muted/90"
      title={info.displayName}
    >
      {info.code}
    </span>
  )
}
