# Branding Assets

Strategic Fleet Manager's own identity assets — never a ship photo, never
page-environment artwork. Resolved through `src/config/assets/brandingAssets.ts`
via semantic keys (`primaryLogo`, `compactMark`, `monochromeMark`, `appIcon`),
never a hardcoded path in application code.

No logo image currently ships — the sidebar renders a vector icon
(lucide-react) plus styled text. This directory is ready to receive the
first approved logo package without any page component changing.

- `logo/` — primary full logo lockups (SVG preferred; PNG only if a raster
  master is all that's approved).
- `marks/` — standalone marks/monograms usable at small sizes, including a
  monochrome variant for dark/light contexts.
- `icons/` — app/favicon-style icons.

Format preference: SVG wherever an approved vector source exists; PNG only
when transparency is required and no vector source is available. See
`public/assets/README.md` for the full format policy.
