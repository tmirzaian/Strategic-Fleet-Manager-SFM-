# Strategic Fleet Manager — Production Asset Manifest

This directory is the single home for every production visual/audio asset
Strategic Fleet Manager ships. It is served as-is by Vite's public-asset
convention — everything under `public/` is copied verbatim to the build
output root, so a file at `public/assets/environments/mission-control/x.webp`
is reachable at runtime as `/assets/environments/mission-control/x.webp`.

No file in this tree is ever imported into the JavaScript bundle. Pages
reference assets through the typed registry in `src/config/assets/`, which
resolves a semantic identifier (e.g. `mission-control`) to one of these
paths — application code never hardcodes a path into this directory. See
`docs/ASSET_PIPELINE.md` for the full integration contract.

## Asset-domain ownership

| Domain | Directory | Owned by |
|---|---|---|
| Environment artwork | `environments/<page-id>/` | Chief Architect production art handoff |
| Card-scoped illustration accents | `illustrations/<accent-id>/` | Chief Architect production art handoff |
| Decorative overlays/gradients | `overlays/` | Shared across environments |
| Strategic Fleet Manager branding | `branding/{logo,marks,icons}/` | Product/brand |
| Fleet Registry ship imagery | `fleet-registry/<manufacturer>/` | Quartermaster Fleet Registry (separate from RSI fallback ship photography) |
| Future Quartermaster/UI audio | `audio/{quartermaster,ui}/` | Future audio mission |
| Fonts | `fonts/` | **Not populated** — see `fonts/README.md` |

Each domain is deliberately separate — see Architectural Principles 6-8 in
`docs/ASSET_PIPELINE.md` for why environment artwork, Fleet Registry
imagery, and branding assets are never mixed into one tree.

## Naming conventions

Lowercase kebab-case only. No spaces, no timestamps, no temporary prompt
names encoded into filenames. Include the pixel width for responsive
raster variants.

```
mission-control-background-3840.webp
mission-control-background-2560.webp
mission-control-background-1920.webp
mission-control-overlay.png
ghost-mk2-registry.webp
```

## Environment vs. Fleet Registry vs. branding

- **Environment** (`environments/`): decorative page-background artwork
  behind existing page content — presentation data, never business data,
  never required for a route to function.
- **Fleet Registry** (`fleet-registry/`): future Quartermaster-approved
  ship imagery, organized by manufacturer. Entirely separate from the
  existing RSI/CIG fallback ship photography system
  (`src/data/shipImageOverrides.ts`, `src/constants/shipImage.ts`) — see
  `docs/ASSET_PIPELINE.md`'s fallback order.
- **Branding** (`branding/`): Strategic Fleet Manager's own identity
  (logo, marks, app icon) — never a ship or environment image.

## Allowed file formats

- **WebP** — photographic production environments (preferred raster format).
- **PNG** — only when true alpha transparency is required (overlays, marks).
- **SVG** — logos/icons, only where an approved vector source exists.
- **WAV** (master) + a compressed runtime format (future audio) — no audio
  ships with this mission.
- **No JPEG** unless a specific, documented reason is recorded alongside
  the asset.

## Accessibility expectations

Environment artwork and overlays are strictly decorative: rendered with
`aria-hidden="true"` and `pointer-events: none` by
`src/components/layout/PageEnvironment.tsx`, and must never be the sole
carrier of information a screen-reader user needs. Fleet Registry and
branding images that convey identity (a ship photo, the app logo) must
always have a real `alt` value supplied by the calling component — this
directory holds no alt text itself.

## Fonts

No font files are stored here. See `fonts/README.md` — licensing has not
been approved for any typeface yet.
