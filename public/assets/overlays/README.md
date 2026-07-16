# Overlays

Shared decorative overlay/gradient assets (vignettes, scan-line textures,
color-grade gradients) referenced by an `EnvironmentPresentation.overlay`
path — not tied to any single page, which is why they live outside
`environments/<page-id>/`.

PNG only when true alpha transparency is required; otherwise prefer
expressing a gradient as CSS in `EnvironmentPresentation` rather than a
raster asset here.
