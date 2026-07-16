# Fleet Registry Ship Imagery

Future Quartermaster-approved ship photography/renders, organized by
manufacturer code (lowercase, matching `src/utils/manufacturerLogo.ts`'s
alias table):

```
aegis/  anvil/  argo/  consolidated-outland/  crusader/  drake/
esperia/  gatac/  greycat/  kruger/  misc/  origin/  rsi/  tumbril/
misc-manufacturers/   (any manufacturer without a dedicated directory yet)
```

**This directory is empty by design.** No artwork is generated or copied
into it by this mission. It is resolved through
`resolveFleetRegistryImage()` (`src/config/assets/fleetRegistryAssets.ts`),
which is entirely separate from — and does not change — the existing
RSI/CIG fallback ship-image system
(`src/data/shipImageOverrides.ts`, `src/utils/resolveShipImage.ts`,
`src/components/ShipImage.tsx`).

## Fallback order

1. An approved Fleet Registry asset in this directory, once one exists.
2. The existing manual ship-image override (`shipImageOverrides.ts`).
3. The existing official/imported ship image
   (`Ship.image.primaryUrl` / legacy `Ship.imageUrl`).
4. The current generic local fallback (`/images/ship-placeholder.png`).

See `docs/ASSET_PIPELINE.md` for the full resolver contract and
`resolveFleetRegistryImage`'s signature.

## Naming

`<ship-slug>-registry.webp`, optionally `<ship-slug>-<variant-slug>-registry.webp`
for a paint/variant image — e.g. `ghost-mk2-registry.webp`.
