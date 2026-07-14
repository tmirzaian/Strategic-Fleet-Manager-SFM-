# Strategic Fleet Manager — Asset Pipeline

Mission M-022 established this infrastructure. It ships **no finished
artwork** — every environment definition is disabled, no branding image
replaces the current vector-icon logo, and the Fleet Registry manifest is
empty. This document is the contract for how real assets get integrated
later without any page component being rewritten.

## Directory structure

```
public/assets/
  branding/
    logo/       marks/       icons/
  environments/
    mission-control/   fleet-dashboard/   ship-detail/
    hangar-inventory/  loadout-manager/   decision-center/
    captain-log/       shared/
  fleet-registry/
    aegis/  anvil/  argo/  consolidated-outland/  crusader/  drake/
    esperia/  gatac/  greycat/  kruger/  misc/  origin/  rsi/  tumbril/
    misc-manufacturers/
  overlays/
  audio/
    quartermaster/   ui/
  fonts/            (reserved — no files; see fonts/README.md)
```

Every file under `public/` is copied verbatim to the build root by Vite's
public-asset convention — nothing here is ever bundled into JavaScript.

```
src/config/assets/
  types.ts                 EnvironmentId, EnvironmentAssetDefinition,
                            ResponsiveEnvironmentSource, EnvironmentPresentation,
                            FleetRegistry*/BrandingAsset* types
  assetPaths.ts             assetPath() — pure path normalization/guard
  environmentAssets.ts      the environment registry + resolvers
  brandingAssets.ts         the branding registry + resolver
  fleetRegistryAssets.ts    resolveFleetRegistryImage()
  index.ts                  public entry point — import from here

src/components/layout/
  PageEnvironment.tsx       decorative background layer (not yet mounted)
```

## Semantic asset IDs

Application code never references a raw path. It references one of:

- an `EnvironmentId` — `'mission-control' | 'fleet-dashboard' | 'ship-detail'
  | 'hangar-inventory' | 'loadout-manager' | 'decision-center' | 'captain-log'`
  (`src/config/assets/types.ts`), matching `public/assets/environments/<id>/`
  exactly;
- a `BrandingAssetKey` — `'primaryLogo' | 'compactMark' | 'monochromeMark'
  | 'appIcon'`;
- a `{ manufacturerCode, shipSlug, variantSlug? }` triple for Fleet Registry
  imagery, resolved through `resolveFleetRegistryImage()`.

The config layer owns the translation from a semantic ID to an actual
`/assets/...` path — that mapping is the *only* place a real filename
ever appears.

## Environment lifecycle

1. **Defined, disabled** (current state for all seven pages): a full
   `EnvironmentAssetDefinition` exists in `environmentAssets.ts` with
   `enabled: false` and empty `sources`. `PageEnvironment` renders `null`.
2. **Artwork arrives**: drop the production files into
   `public/assets/environments/<id>/`, following the naming standard
   below.
3. **Wire the definition**: in `environmentAssets.ts`, set `sources` (via
   `assetPath(...)` for each width actually produced) and flip
   `enabled: true`. Adjust `presentation` only if the art director's
   spec calls for something other than the conservative defaults.
4. **Mount the component**: add `<PageEnvironment id="..." />` inside the
   relevant page's own positioned wrapper (see "Future integration
   point" below) — no earlier step requires this.

A definition can be defined-and-disabled indefinitely; nothing about the
app depends on any environment ever being enabled.

## Future integration point (component is built, not mounted)

`PageEnvironment` is not mounted anywhere yet — Mission M-022's own
constraint was "add it to a shared shell only if the app stays
pixel-identical," and the safer, zero-risk choice was to leave it ready
but unmounted rather than retrofit positioning context onto `App.tsx`'s
shared `<main>` (which has no `position: relative` today and isn't
route-aware).

When a page is ready to receive its environment:

```tsx
// Inside the specific page component (e.g. src/pages/MissionControl.tsx),
// wrapping the page's own root element in `position: relative` (or
// adding `relative` to whatever wrapper already exists):
<div className="relative ...">
  <PageEnvironment id="mission-control" />
  {/* existing page content, completely unchanged */}
</div>
```

`PageEnvironment` is `position: absolute; inset: 0` — it needs a
positioned ancestor. It does not itself add `relative` to anything, so
each page opts in explicitly and only when it's actually ready.

## Fleet Registry fallback order

`resolveFleetRegistryImage({ manufacturerCode, shipSlug, variantSlug?, existingShipImage? })`
resolves, in order:

1. **Fleet Registry** — an approved asset in
   `public/assets/fleet-registry/<manufacturer-slug>/`. The manifest
   (`FLEET_REGISTRY_MANIFEST` in `fleetRegistryAssets.ts`) ships empty
   this mission.
2. **Ship-image override** — `src/data/shipImageOverrides.ts`, unchanged,
   keyed by the same slug passed as `shipSlug`.
3. **Existing official/imported ship image** — only when the caller
   supplies `existingShipImage`, resolved via the existing, unmodified
   `resolveDisplayImageUrl()`.
4. **Generic local fallback** — `SHIP_PLACEHOLDER_URL`
   (`/images/ship-placeholder.png`), always available.

`manufacturerSlugForCode()` maps a manufacturer badge code (as produced
by `src/utils/manufacturerLogo.ts`) to its fleet-registry directory;
any code without a dedicated directory resolves to `misc-manufacturers`,
never an invented directory name.

## Responsive-image strategy

`ResponsiveEnvironmentSource` carries up to four optional widths
(`desktop4k` ~3840px, `desktop` ~2560px, `tablet` ~1920px, `mobile`
~1280px). `resolveResponsiveSource()` picks the widest one actually
present — a production package that only ships one or two sizes still
works with zero code changes; there is no requirement to backfill every
width before enabling a definition.

`PageEnvironment` currently renders a single `background-image` (the
resolved widest source) via CSS — true `<picture>`/`srcset`
breakpoint-swapping is deliberately not built in this mission (no new
responsive-breakpoint behavior; see "Do not modify... current responsive
breakpoints"). Adding real `srcset` selection is future work once actual
multi-width artwork exists to test against.

## Replacement/versioning strategy

Production assets are replaced in place by filename — there is no
asset-hash/versioning layer in this mission. Because everything is
referenced through the semantic-ID registry rather than a path scattered
through page components, replacing
`public/assets/environments/mission-control/background-2560.webp` with a
new version requires touching exactly one line (or zero, if the filename
is kept identical) in `environmentAssets.ts`, never a page file.

## Licensing and provenance

Every asset dropped into `public/assets/` must have its licensing terms
recorded by whoever adds it — this pipeline does not track
license/provenance metadata itself (out of scope for infrastructure).
Fonts specifically require **explicit Chief Architect approval** before
any file is added to `fonts/` — see that directory's README.

## How future Chief Architect asset packages get integrated

1. Files land in the matching `public/assets/<domain>/...` directory,
   following the kebab-case naming standard (`docs/ASSET_PIPELINE.md`'s
   sibling `public/assets/README.md` has the exact examples).
2. The corresponding registry file (`environmentAssets.ts`,
   `brandingAssets.ts`, or `fleetRegistryAssets.ts`'s manifest) gets a
   `sources`/`src`/manifest-entry update, wrapped in `assetPath(...)`,
   plus `enabled: true` where applicable.
3. Run `npm run build` and the full test suite — the registry-validation
   tests (`validateEnvironmentRegistry`, `assetPath` traversal/format
   tests) catch a malformed entry before it ships.
4. Only after step 2 does a page ever change — and only to mount
   `<PageEnvironment id="..." />` (environments) or swap an `<img src>`
   (branding/Fleet Registry) inside its own existing markup. No routing,
   no layout restructuring.
5. Manually verify the specific page in `npm run dev` and confirm no
   console errors / failed asset requests before considering the
   integration complete.

## Canonical ship image URL registry (EWO-021A)

A separate, simpler chain from Fleet Registry above — this is the
Commander's own lightweight, interim way to backfill a hero image for a
canonical ship definition (most urgently the deep-imported ships, which
have full engineering data but often no resolved photo) without waiting
for the Fleet Registry local-asset pipeline (EWO-022, below).

`resolveShipImage({ id, imageUrl, image })` (`src/utils/resolveShipImage.ts`)
resolves, in order:

1. **The canonical manual image registry** —
   `src/data/shipImageRegistry.ts`, keyed by canonical ship id (a
   deep-imported ship's raw StarBreaker entity class, e.g.
   `"DRAK_Cutlass_Black"`, or a seed ship's own id, e.g. `"cutlass-red"`
   — see that file's header for the full editing contract). A malformed
   or non-HTTPS entry is ignored safely, never thrown.
2. **The ship's own existing image** — `resolveDisplayImageUrl()`
   (structured `image.primaryUrl`, then legacy `imageUrl`) — whatever
   the generated import pipeline or seed data already resolved.
3. **`undefined`** — the caller's `<ShipImage fallbackSrc=...>` renders
   the approved placeholder.

Wired into `materializeFleetAsset()` (`src/utils/fleetAssetMaterializer.ts`)
— the single chokepoint every non-seed FleetAsset's `Ship.imageUrl` already
flows through — so Fleet Dashboard, Mission Control, and Ship Detail all
pick up a registry entry automatically with no per-page change.

**EWO-021A-1 closed the one remaining bypass**: the seed fleet's own 12
store-initialization ships are still baked directly from `src/data/seed.ts`
(see ADR-008's `SEED_MIGRATION` note — their Build/Hardpoint/ownership/
priority/nickname data is never replayed through the materializer, by
design), but their `imageUrl` is now separately re-resolved through the
exact same `resolveShipImage()` at store construction
(`src/store/useFleetStore.ts`'s `withResolvedSeedImages()`), on every
fresh load and every rehydration alike. `seed.ts`'s own hardcoded
`imageUrl` per ship is legacy fallback data only now — it renders as-is
only when the registry has no entry for that hull — so the Commander has
exactly one file to maintain for *any* runtime ship image, seed-backed or
not: `src/data/shipImageRegistry.ts`. A seed hull superseded by a
deep-import canonical definition (Corsair, Cutlass Black — ADR-008) still
keeps its own seed engineering/loadout identity forever, but its
*presentation* converges on the canonical hull's registry entry via
`presentationImageKeyById` (`src/data/shipDefinitions.ts`) — visual
identity and loadout identity are allowed to diverge on purpose.

`src/data/shipImageOverrides.ts` is a *different*, pre-existing file:
input to the **offline** import pipeline (`npm run import:ships`,
`src/normalizer/shipImageManifest.ts`), keyed specifically by seed ship
id. It is not read by any runtime page/component and is not this
mission's registry — see both files' headers for the full distinction.

### Future: EWO-022 — Local Fleet Registry Asset Pipeline

Not implemented by this mission. The external RSI URLs in
`shipImageRegistry.ts` are an explicitly interim Alpha/Beta measure
(Design Authority Ruling 1). The planned future architecture:

```
canonical ship ID
  → semantic Fleet Registry asset registry (this mission's existing
    FLEET_REGISTRY_MANIFEST / resolveFleetRegistryImage(), tier 1 above)
  → local generated SFM ship artwork under
    public/assets/fleet-registry/<manufacturer-slug>/
  → placeholder
```

Source artwork kept separate from optimized runtime derivatives (PNG/WebP),
deterministic generation, no dependency on RSI availability at runtime —
Shipyard-produced SFM artwork eventually replaces the interim URL values
in `shipImageRegistry.ts` without changing `resolveShipImage()` or any
of its consumers, preserving the same canonical-id resolution boundary
established here.

## How a missing asset degrades safely

- **Environment**: `isEnvironmentUsable()` requires both `enabled: true`
  and a real resolved source; anything else — disabled, no source, or an
  unrecognized ID reaching the component at runtime — makes
  `PageEnvironment` render `null`. A configured `fallback` ID is tried
  once (bounded to 3 hops) before giving up. Never throws.
- **Branding**: `resolveBrandingSrc()` returns `undefined` unless the
  entry is both `enabled: true` and has a `src` — callers must keep
  their existing fallback (e.g. the current vector-icon lockup) for the
  `undefined` case.
- **Fleet Registry**: `resolveFleetRegistryImage()` always returns a
  usable `url` — it walks all four fallback tiers and the last one
  (`SHIP_PLACEHOLDER_URL`) is a real, always-available local file, so
  this resolver can never itself produce a broken image.
- **`assetPath()`**: throws only for a genuinely malformed *input*
  (path traversal, remote URL, empty string) — a caller passing a
  well-formed but non-existent filename gets a normal `/assets/...` URL
  back; the resulting 404 is a browser-level missing-image event, not a
  thrown error, and never crashes the route.
