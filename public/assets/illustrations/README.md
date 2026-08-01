# Illustrations

Small, bounded, card-scoped decorative accents — distinct from
`environments/` (whole-page/bounded-room artwork consumed via
`EnvironmentBay`/`PageEnvironment`) and `branding/` (SFM's own identity
assets). An illustration here decorates one specific, narrow UI element
as a plain CSS `background-image` layer, never a full room and never an
`<img>` element.

One directory per semantic accent, matching the relevant registry in
`src/config/assets/` (e.g. `CaptainsLogAccentId` /
`captainsLogAssets.ts` for `captains-log-certification/`).

```
captains-log-certification/
```

## Format

WebP for photographic accents, same policy as `environments/` — no
JPEG. Masters are kept alongside their derivatives (not deleted after
generation) as archival source for future higher-resolution derivative
tiers; see `docs/ASSET_PIPELINE.md`.
