# EWO-095 (Proposal) — Ship Image Presentation Standardization

**Status:** Proposal only. No code changes are included in or authorized by
this document — filed per Chief Architect direction on the Environment
Asset Pipeline handoff ("Do not change ship cards under this work. Open a
new EWO proposal..."). Numbered provisionally as EWO-095 (next available
in sequence after EWO-094); recommend the Chief Architect confirm or
reassign the number when this proposal is scheduled.

## Why this is a separate effort

The environment-artwork work (EWO-093/094 asset handoff) tuned
presentation values — blur, vignette strength, overlay opacity — for
`EnvironmentBay`/`PageEnvironment`, the whole-page/bounded-room artwork
system. Ship cards and hero frames are a **different, older presentation
system** (`ShipImage.tsx`, `ShipHeroFrame.tsx`, `ShipCard.tsx`) that was
never touched by that work and was never in its scope. Reviewing it now
found real, pre-existing inconsistency worth its own scoped EWO rather
than a drive-by fix under an unrelated work order.

## Findings (discovery only, from direct code reading)

1. **Two different overlay treatments coexist.** `ShipImage.tsx`'s own
   `overlay` prop (default `true`) renders `bg-gradient-to-t from-black/80
   via-black/10 to-transparent` directly over the image whenever it's in
   `cover` mode. `ShipHeroFrame.tsx` instead passes `overlay={false}` to
   `ShipImage` and renders its **own**, separately-authored gradient —
   `bg-gradient-to-t from-panel via-panel/40 to-transparent` (a
   panel-background-colored fade, not the black gradient `ShipImage`
   would have used). Two visually different darkening treatments for
   "an image with text over it," chosen per call site rather than by one
   shared policy.
2. **No blur is currently applied to any ship photography.** The only
   `backdrop-blur-sm` usages found are on small glass-chrome UI
   elements (the Ship Settings button, a status badge, the Quartermaster
   Completion Seal) — never the ship image itself. Worth confirming as
   the deliberate baseline (not an oversight) before any future change,
   and worth deciding whether the `EnvironmentBay` precedent (blur
   available, currently tuned to 0 for crisp high-res artwork) should
   extend here at all.
3. **No vignette (edge-darkening radial gradient) exists on ship cards
   or hero frames**, unlike the `EnvironmentBay` system's own edge
   vignette. Ship photography currently relies solely on the linear
   bottom-up gradient described in (1) for text legibility — a
   different visual language than the environment-artwork rooms a
   Commander now also sees elsewhere in the app (Mission Control,
   Decision Center, and the three new empty-state bays). Whether ship
   cards should adopt a comparable "room" treatment, stay linear-gradient-only,
   or something else entirely is exactly the kind of question this
   proposal exists to scope, not answer unilaterally.
4. **Fallback vs. real-photo presentation already diverges by design**
   (EWO-033A, `docs/ASSET_PIPELINE.md`) — both currently render
   `object-cover` with the same frame, but confirming the overlay/blur
   policy from findings 1-3 is applied (or deliberately not applied)
   identically to both is in scope for this proposal, not assumed here.

## Proposed scope for the future EWO

- **Ship-card vignette removal or standardization** — decide whether
  `ShipCard`/`ShipHeroFrame` should gain an edge vignette matching the
  `EnvironmentBay` visual language, or explicitly stay vignette-free by
  design; document the decision either way.
- **Overlay consistency** — one shared overlay treatment (color, gradient
  stops, opacity) for every ship-photography consumer, replacing the
  current `ShipImage`-default vs. `ShipHeroFrame`-override split found
  in (1). Likely resolved by extending `ShipImage`'s own `overlay` prop
  to accept a caller-supplied gradient rather than a binary on/off, so
  there's still one implementation, not two.
- **Blur policy** — an explicit, documented decision (not implicit
  absence) on whether ship photography ever blurs, and under what
  conditions, consistent with whatever the environment-artwork system's
  own now-established 0-1px "crisp, premium" standard implies for
  ship imagery specifically.
- **Image presentation standards** — a single reference doc (parallel to
  `docs/ASSET_PIPELINE.md`'s own environment-presentation contract)
  covering fit mode, overlay, blur, and vignette for every ship-image
  consumer (`ShipCard`, `ShipHeroFrame`, `ShipImage`, and any future
  consumer), so a new component doesn't have to rediscover the policy
  from scratch the way this proposal had to.

## Explicitly out of scope for this proposal document

No implementation, no visual review, no presentation-value changes.
This document only records the discovery and scopes the future work —
per Chief Architect direction, "this is intentionally a separate
architectural effort."
