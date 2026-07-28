import { APP_VERSION_LABEL } from '../../config/appVersion'

/**
 * UX-004A — Universal Footer. A visual boundary, not a content panel
 * (Deliverable 2): a subtle top divider, compact height, and restrained
 * typography — no card container, no environmental background. Mounted
 * once inside App.tsx's own shell (Deliverable 7) so every primary page
 * ends the same way without per-page markup.
 *
 * Version is the canonical `APP_VERSION_LABEL` (Deliverable 1) — this is
 * now the *only* place the release version renders; the Sidebar branding
 * cell's own copy was removed (Deliverable 4, see Sidebar.tsx).
 *
 * Slogan color treatment matches the commissioned Sidebar brand-lockup
 * artwork exactly (`public/assets/branding/sidebar/sidebar-branding-
 * master-1024.png`): Plan/Succeed both read Quartermaster Blue (the
 * artwork bookends the motto in the same hue), Outfit reads Readiness
 * Green, Prepare reads Quartermaster Gold — all three already-established
 * tokens, no new color introduced.
 */
export default function AppFooter() {
  return (
    <footer className="px-6 md:px-10 py-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-0 text-center sm:text-left">
      <p className="text-[11px] font-mono text-muted/50">SFM {APP_VERSION_LABEL}</p>
      <p className="text-[10px] uppercase tracking-[0.2em] font-display font-semibold">
        <span className="text-cyan">Plan</span>
        <span className="text-muted/30 mx-2">•</span>
        <span className="text-success">Outfit</span>
        <span className="text-muted/30 mx-2">•</span>
        <span className="text-gold">Prepare</span>
        <span className="text-muted/30 mx-2">•</span>
        <span className="text-cyan">Succeed</span>
      </p>
    </footer>
  )
}
