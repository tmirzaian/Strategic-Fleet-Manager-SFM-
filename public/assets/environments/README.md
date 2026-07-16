# Environment Artwork

Decorative, page-specific background artwork rendered behind existing page
content by `src/components/layout/PageEnvironment.tsx`. Presentation data
only — a missing or not-yet-produced environment must never block a route
or change page layout; see `docs/ASSET_PIPELINE.md`'s "how a missing asset
degrades safely" section.

One directory per semantic page ID, matching `EnvironmentId` in
`src/config/assets/types.ts` exactly:

```
mission-control/   fleet-dashboard/   ship-detail/
hangar-inventory/  loadout-manager/   decision-center/
captain-log/
shared/            (overlays/gradients reused across more than one page)
```

## Responsive variants

A production environment package may supply up to four raster widths per
background, named by pixel width:

```
<page-id>-background-3840.webp   (desktop4k)
<page-id>-background-2560.webp   (desktop)
<page-id>-background-1920.webp   (tablet)
<page-id>-background-1280.webp   (mobile)
```

Only the sizes actually produced need to exist — `ResponsiveEnvironmentSource`
fields are all optional, and `PageEnvironment` degrades to whatever's
available (see `docs/ASSET_PIPELINE.md`'s responsive-image strategy).

## Format

WebP for photographic environments; PNG only for an overlay that needs
real alpha transparency. No JPEG.
