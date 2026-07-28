# UI Architecture — Strategic Fleet Manager

**Status: FROZEN (EWO-011 — Mission Control Design Freeze; §8 superseded
by EWO-012 — Fleet Registry Record Standard, refined by EWO-012A — Fleet
Registry Placeholder Master Integration, tuned by EWO-012B — Fleet
Registry Record Art-Layer Tuning, density-finalized by EWO-013 — Fleet
Registry Record Density & Design Freeze; §2 refined and §12.1's governing
Environmental Philosophy established by EWO-014 — Mission Control Brand
Lockup & Environmental Integration, mark resolution corrected by
EWO-014A, §2 superseded again by EWO-015 — Sidebar Branding Hardpoint
Integration, replacing the JSX-constructed lockup with one commissioned
image, density-tuned by EWO-015B — Sidebar Branding Presence Refinement,
optical-fit corrected and DESIGN FROZEN by EWO-015C — Sidebar Branding
Console Optical Fit).** This document records the
permanent visual architecture of Mission Control and the application
shell as approved by Design Authority. Future missions extend this
architecture; they do not re-litigate it. Any section marked **APPROVED
FUTURE HARDPOINT** is infrastructure the layout already accommodates but
which has no delivered asset yet — do not treat it as implemented, and do
not invent placeholder content for it beyond what is described here.
Sections marked **FUTURE SHIP ASSET MANUFACTURING STANDARD** describe
requirements for artwork that does not exist yet — do not manufacture it
in Engineering.

## 1. Mission Control operational cadence

Mission Control communicates, top to bottom, in this fixed order (current
as of EWO-058 — see §19-§27 for the full history of how it got here):

1. Application identity (sidebar, persistent, not part of the page itself)
2. Mission Control identity — "Mission Control" / "Fleet Operations"
3. The Command Briefing Hero (§20-§21 amendments) — three columns: Fleet
   Status (Ships Active / Mission Ready / Loadouts In Progress / Factory
   Loadout), Operations Center (pure atmosphere, no instrumentation), and
   Priority Actions (Overall Fleet Readiness + the Hero's own actionable
   queue)
4. Top Priority Ship(s) — up to four live records (EWO-012/EWO-033)
5. Quartermaster Report (§21/§25) — one consolidated panel: Logistics
   Demand (one card per canonical component category, always including
   the five stable categories — Coolers, Power Plants, Quantum Drives,
   Shields, Weapons — regardless of current demand), Quartermaster
   Assessment (always present, reacting to the current filter), and the
   Procurement Work Queue (actionable Available/Reserved rows only,
   unconditionally — §25), all filterable in place by clicking a
   Logistics Demand card
6. End-of-Briefing Action Center (§11/§24/§26, UX-001B.4/UX-001C) — Loot
   Lookup / Add Inventory / Modify Ship, the transition from assessment
   to execution

The page ends there — no application footer (§27, EWO-058 retired the
"Update Budget" footer as a leftover development-era artifact; §9/§10
below record its retirement).

No explanatory or marketing copy appears between these — the interface
explains itself. `src/pages/MissionControl.tsx` is the reference
implementation of this cadence.

## 2. Sidebar Branding Console — DESIGN FROZEN (EWO-015, density-tuned by EWO-015B, optical-fit corrected and re-frozen by EWO-015C)

**Sidebar branding is a commissioned production asset, not a JSX
construction (EWO-015).** `src/components/Sidebar.tsx`'s brand lockup is
no longer built from separate elements (a mark image plus hand-laid-out
"SFM"/"Strategic Fleet Manager"/motto text, as EWO-011/EWO-014 had it).
It is now one Design-Authority-owned, transparent, portrait production
image containing the commissioning mark, "SFM" wordmark, "Strategic
Fleet Manager" title, and motto already composed together, plus one
live text element beneath it:

1. **Brand-lockup image** — resolved via `resolveBrandingSrc('sidebarBrandLockup')`
   (semantic registry, never a hard-coded path), rendered inside a fixed
   `180px × 270px` hardpoint (`w-full h-full object-contain
   object-center`, `pointer-events-none select-none`, no border/shadow/
   glow on the image itself). Source: the approved master at
   `public/assets/branding/sidebar/sidebar-branding-master-1024.png`
   (1024×1536, portrait, RGBA, true alpha), deterministically resized to
   `public/assets/generated/branding/sidebar-branding-512.png` (and a
   256px derivative) by `scripts/generateBrandingAssets.ts` — the
   application never loads the 1024px master directly. The `180×270`
   hardpoint exactly matches the master's own 2:3 aspect ratio, so the
   artwork fills the entire hardpoint with zero internal letterboxing —
   no crop, no stretch, no distortion, and no wasted space within its
   own box.
2. **`{APP_VERSION_LABEL}`** (e.g. "ALPHA 2.5D") — the only text still
   rendered in JSX, `text-[8px] uppercase tracking-[0.15em] text-muted/40`,
   separated from the image by `mt-2` (EWO-015B — tightened from `mt-4`
   so it visually belongs to the lockup rather than reading as a
   separate block). **The application version is never baked into the
   brand-lockup artwork** — a future release requires only updating this
   live text, never regenerating or replacing the image.

**Console density (EWO-015B — Branding Presence Refinement).** Commander
visual inspection of EWO-015 found the technically-correct hardpoint
visually underutilized. The outer console's internal padding was reduced
from `px-4 py-6` to `px-2.5 py-3.5` (~38–42% less padding at each edge),
and the hardpoint itself grew from `170×240` to `180×270` — proportionally
matching the master's 2:3 ratio exactly, so the enlarged container is
fully utilized rather than letterboxed. The artwork now occupies
approximately 85% of the console's usable interior width (180px hardpoint
within a ~212px interior) while never touching the console's own border
(≥16px clearance remains on every side). This was a **container and
padding change only** — the source master and generated derivatives were
not regenerated, the semantic registry was not touched, and the artwork
itself was never scaled by any means other than the same `object-fit:
contain` it already used.

The outer console — a bordered, lightly-tinted panel
(`rounded-lg border border-white/5 bg-white/[0.02]`) inset from the
sidebar's own background, matching the navigation console's treatment
below it — is unchanged in kind from EWO-014 and holds the image
directly; no second panel is nested inside it around the image.

**Design Authority owns the complete branding composition** (mark,
wordmark, title, motto, their relative typography, spacing, and color,
all baked into one commissioned image). **Engineering owns semantic
resolution, hardpoint placement, and responsive scaling** — never
reconstructing typography in React again. A future Sidebar branding
revision requires only: replace the approved master at its fixed path,
rerun `npm run generate:branding-assets`, and (if the semantic key or
derivative size needs to change) update the registry entry — never
editing `Sidebar.tsx`'s JSX. No breakpoint-specific manual image edits
are permitted; CSS alone owns responsive presentation, and since the
Sidebar's own width never changes across breakpoints, this one
180×270 hardpoint applies uniformly at every width.

This Sidebar lockup is distinct from any future Welcome/About screen
lockup: a Welcome/About composition, if ever commissioned, would be its
own master and its own semantic key sized for that context — never a
reuse of `sidebarBrandLockup` or its derivatives outside the Sidebar.

Below the brand lockup, navigation remains wrapped in the same bordered,
lightly-tinted panel it already used
(`rounded-lg border border-white/5 bg-white/[0.02]`) so it continues to
read as a floating operational panel rather than a generic full-height
web menu — **neither EWO-015 nor EWO-015B made any changes here**:
navigation routes, `NavLink` behavior, active-state styling, icons, menu
order, spacing, and markup are byte-for-byte unchanged. This identity
lockup is the application-shell standard — every future compartment
inherits it unmodified.

This hardpoint is compatible with the future principle established in
§12.1: *the room owns the background, the consoles own the information*
— the transparent brand-lockup image is content for its console, not
scenery, and can float over the sidebar's own console surface today and
over a future Mission Control-wide environment later without any
structural change.

**Optical-fit correction (EWO-015C).** After EWO-015B, Commander visual
inspection found the branding still visually underutilized despite the
enlarged hardpoint. Engineering verified the console/hardpoint CSS live
(computed padding, margins, and hardpoint box) and confirmed it matched
the EWO-015B specification exactly — there was no residual wrapper-spacing
bug. The actual cause: the approved master's own transparent margins.
Direct pixel measurement of the corrected master (§ EWO-015A/EWO-015 art
edit history) found its visible content — mark, wordmark, title, and
motto together — fills only **~75% of the canvas in each dimension**,
with asymmetric top/bottom margins (top margin measurably smaller than
bottom margin). This is baked into the source pixels and cannot be
closed by any amount of wrapper/hardpoint CSS sizing.

Because no new asset or source-file edit was authorized, the correction
is a render-time-only optical crop: the hardpoint gained `overflow-hidden`
(box dimensions unchanged — still `180×270`), and the `<img>` gained a
uniform `scale-125` with `origin-[50%_40%]` (`object-fit`/
`object-position` unchanged). A single `scale-*` utility scales both axes
by the same factor, which is what guarantees no distortion; the origin is
biased toward the top (40% rather than 50%) to match the master's own
asymmetric margins, so the crop removes more of the larger bottom margin
than the smaller top margin. Both values were derived from the master's
measured content bounding box plus a safety buffer and verified live to
introduce zero clipping of real content (hexagonal mark, ship icon, all
three accent dots, "SFM," title, and the full motto all confirmed intact
at all four required breakpoints). This technique is fully reversible —
the source master and both generated derivatives are byte-identical to
EWO-015; only the `<img>`'s rendering is affected.

**DESIGN FROZEN (EWO-015C), pending Commander approval.** The Sidebar
Branding Console — composition, hardpoint sizing, console padding,
version-label placement, and now this optical-fit crop — is the final
visual refinement in this sequence (EWO-015 → EWO-015B → EWO-015C).
Further modifications require a new Engineering Work Order; routine
cosmetic experimentation is not authorized without one, consistent with
the Design Freeze precedent already established for the Fleet Registry
Record (§8.3).

## 3. Critical-data typography standard (IMPLEMENTED NOW)

`src/components/CriticalMetricTile.tsx` is the single shared visual
contract for every critical operational count:

- `panel p-4 flex items-start gap-3` container
- icon box `w-10 h-10` (`hidden sm:flex`), icon size 18
- value: `text-2xl font-display font-bold leading-none`, optional inline
  `accent` color
- label: `text-[11px] uppercase tracking-widest text-muted mt-1`
- optional `children` slot for supplementary content (used by
  `FleetStatusTile` for its ship-name context list)

Every one of the following renders through this exact contract: Ships
Active, Needed Items, Mission Ready, Loadouts In Progress, Factory
Loadout, Missing Components, Unreserved Inventory. `FleetStatusTile`
(`src/components/FleetStatusTile.tsx`) composes `CriticalMetricTile`
rather than duplicating its markup.

The **only** metric permitted to read larger is the Overall Fleet
Readiness percentage inside the readiness ring (`ReadinessRing`, local to
`MissionControl.tsx`) — the sole primary instrument.

## 4. Semantic color roles

| Role | Token | Hex | Use |
|---|---|---|---|
| Graphite / Deep Space | `bg`, `panel` | `#071016` / `#0D1B24` | structural surfaces, backgrounds |
| Quartermaster Blue | `cyan` | `#35D0FF` | authority, navigation, information, neutral instrumentation |
| Navigation White | `white` | — | primary neutral text/guidance |
| Readiness Green | `success` | `#42E695` | healthy / complete / operational / mission-ready |
| Operational Amber | `warning` | `#FFD166` | incomplete / active work / pending readiness / attention required |
| Advisory Gold | `gold` | `#C9A227` | reserved for restricted command/advisory authority only. Defined by EWO-014 for the Sidebar slogan's "Outfit" word, which EWO-015 removed from live JSX — that word (and its gold color) is now baked into the commissioned brand-lockup image (§2) rather than rendered by the Tailwind token. **UX-001A.1** is the first live-JSX use since EWO-015: Mission Control's Fleet Status "Ships Active" parent-metric outline and its children's connector bracket (`src/pages/MissionControl.tsx`), an explicit Design Authority instruction (the work order itself named "Quartermaster Gold outline" as an option) — narrowly scoped to that one parent/child relationship, not a general accent. **Do not extend it to a new use without a new explicit Design Authority instruction.** |
| Alert Red | `danger` | `#FF5F73` | genuine failure / critical / urgent only |

Counts derive their color from operational state through the one existing
source of truth, `colorFor()` in `src/components/ReadinessBar.tsx`
(≥85 green, ≥65 amber, else red) — reused by `ReadinessRing`. Counts with
no readiness semantics (e.g. Ships Active, Factory Loadout, Unreserved
Inventory) remain Navigation White / Quartermaster Blue rather than being
assigned an invented color.

## 5. Command-console rail (IMPLEMENTED NOW / APPROVED FUTURE HARDPOINT)

The right side of the Fleet Operations region (`MissionControl.tsx`) is
the permanent command-console rail: a `panel`-backed column, vertically
centered, containing (top to bottom):

- **IMPLEMENTED NOW:** `ReadinessRing` + "Overall Fleet Readiness" label
- **IMPLEMENTED NOW:** a divider
- **IMPLEMENTED NOW:** two `CriticalMetricTile`s stacked vertically —
  Ships Active, Needed Items (Update Budget was removed from this rail —
  see §9)

**APPROVED FUTURE HARDPOINT:** HP-002 (Commander identity/badge) and
HP-003 (UTC time/date) will dock above the readiness console, inside this
same vertical flex stack, without structural redesign. No visible
placeholder card is rendered for either today — inserting them is a
matter of prepending children to the existing column.

## 6. Fleet Readiness hierarchy

1. `ReadinessRing` (SVG ring + large percentage, `colorFor`-derived stroke)
2. "Overall Fleet Readiness" label
3. Supporting metrics: Ships Active, Needed Items — both `CriticalMetricTile`,
   stacked vertically, never compressed side-by-side.

## 7. Quartermaster Logistics card standard (IMPLEMENTED NOW)

One `panel` division with two departments, separated by a restrained
`divide-x divide-white/[0.04]` (desktop) rather than a heavy wall:

- **Fleet Status** (`lg:flex-[3]`): Mission Ready, Loadouts In Progress,
  Factory Loadout — each a `FleetStatusTile` (built on `CriticalMetricTile`,
  §3), each with a clickable ship-name context list.
- **Inventory Status** (`lg:flex-[2]`): Missing Components, Unreserved
  Inventory — each a plain `CriticalMetricTile`.

All five share identical card height, padding, number size, icon size,
and label hierarchy because all five route through `CriticalMetricTile`.

## 8. ShipRecordCard — the Fleet Registry Record standard (RETIRED — see §19)

> **@deprecated (EWO-032, Beta 1.0):** `ShipRecordCard` and its Mission
> Control wrapper `PriorityCard` are retired — neither is rendered by the
> live app anymore (Mission Control now consumes `ShipCard`, §19). Sea
> Trials found this record wasted screen space, presented less
> information than `ShipCard`, and required a secondary "Ship Detail"
> hyperlink instead of a click-anywhere card. Both files are kept on disk,
> not deleted, pending Commander migration verification — this section is
> preserved below as historical record of the design this superseded.

**DA-010 — Fleet Registry Record ("it is all one ship").** Frozen EWO-012,
art-layer architecture established by EWO-012A, tuned by EWO-012B. Every
ship is represented as one integrated record — the vessel appears to
exist *inside* the record, not attached to it. Superseded EWO-009's 30/70
image-left/content-right split, which read as an image panel bolted onto
a data card — explicitly rejected by Design Authority visual review.

`src/components/ShipRecordCard.tsx` was the canonical Fleet Registry
Record template, used by `PriorityCard` (Mission Control's Top Priority
Ship section) via a thin Mission-Control-specific wrapper that added only
the "PRIORITY N" badge — until EWO-032 (§19) retired both in favor of the
single canonical `ShipCard`.

**Composition (EWO-012A, tuned EWO-012B):** Fleet Registry artwork is a
**decorative integrated art layer**, not a photo panel and not the
record's identity. The record root is `relative isolate overflow-hidden`
(an isolated stacking context). Two layers share it:

- **Art layer** — `absolute`, inset from all four edges rather than
  bleeding to the record's own boundary:
  `inset-y-[10%] sm:inset-y-[9%] lg:inset-y-[8%]` (top/bottom breathing
  room) and `right-[2%] sm:right-[3%] lg:right-[4%]` (right breathing
  room — EWO-012B reversed EWO-012A's `right-[-4%]` edge-bleed once
  Commander review found it competed with metadata). Width:
  `w-[40%] sm:w-[50%] lg:w-[48%]` (down from EWO-012A's
  `46/58/55%` — roughly a 12–14% reduction per breakpoint, per EWO-012B).
  Opacity: `opacity-60 sm:opacity-95` (a light, uniform restraint at
  `sm:`+, still `opacity-60` at the narrowest breakpoint where the layer
  is meant to read as a restrained backdrop). `pointer-events-none`,
  `select-none`, `aria-hidden="true"`, and the `ShipImage` inside uses
  `alt=""` — the layer is purely decorative and is correctly excluded
  from the accessibility tree, since the ship's identity is already
  conveyed by the visible name text in the content layer. A CSS
  `mask-image` (linear gradient, transparent → opaque moving rightward,
  widened to `black 45%` under EWO-012B, up from `32%`) fades the art
  layer's left edge into the metadata field instead of ending in a hard
  rectangular seam, and keeps that left field visually calm — this is the
  "subtle mask/gradient fade" DA-010 calls for, implemented as a true
  alpha fade of the artwork itself (`mask-image`/`-webkit-mask-image`),
  not a color-matched overlay div, so it stays correct regardless of the
  art's own colors.
- **Content layer** — `relative z-10`, capped to the left ~58%
  (`max-w-[58%]` at `sm:`+, wider on mobile) of the record width, always
  on top, always interactive. Vertically centered via `flex flex-col
  justify-center` on the record root (the content block is the only
  normal-flow child; the art layer is `absolute` and removed from flow).

CSS alone owns placement, scaling, clipping, and responsiveness — the
source PNG is never manipulated to compensate for layout, and the master
artwork is used exactly as delivered, canonically centered on its own
1024×1024 canvas.

**Opaque legacy ship imagery (EWO-012B):** existing real ship photography
(CDN stills) is a fully opaque rectangle with no alpha channel, unlike the
approved transparent placeholder — Commander review flagged this via the
live 135c ship image. No reliable property in the current data model
distinguishes "known-transparent production art" from "legacy opaque
photography," and EWO-012B does not authorize inventing one. Rather than
add image-type-specific logic, the same four-edge inset above is the
single neutral treatment that improves both cases at once: an opaque
photo's own hard rectangular edges are now surrounded by the panel's own
background on three sides (top, bottom, right) instead of touching the
record's outer boundary directly, softening the perceived "boxiness"
without singling out any image source. The same inset is harmless to the
transparent placeholder, which has no hard edges to begin with.

Info hierarchy, top to bottom within the content layer:

1. optional badge (e.g. "PRIORITY 1")
2. ship name
3. role/category
4. active loadout ("Loadout: {buildName}")
5. readiness state (Mission Ready badge or `ReadinessBar`)
6. "Ship Detail →" action

### 8.1 Alpha 2.5D data-contract audit (EWO-013)

Before tuning density, EWO-013 audited every field ShipRecordCard renders
or could plausibly render, against what's actually available at its
component boundary (`ship: Ship`, `buildName: string`,
`progress: BuildProgressResult`, optional `badge`). Classification key:
**A** required, **B** conditional, **C** approved Alpha hardpoint (real
data, explicitly planned insertion point), **D** future/speculative
(excluded — must not justify permanent empty space).

| Field | Class | Notes |
|---|---|---|
| Priority badge | B | Caller-supplied (`PriorityCard` always supplies one on Mission Control); the component itself treats it as optional/generic. |
| Ship name (`ship.name`) | A | Always present. |
| Role/category (`ship.role`) | A | Always present. |
| Active loadout (`buildName`) | A | Always resolvable — falls back to "Unknown Loadout." |
| Readiness status / percentage / `ReadinessBar` | A | One of {Mission Ready badge, `ReadinessBar`+percentage} always renders, selected by `progress.isComplete`; a valid record always has a computed `BuildProgressResult`. |
| Ship Detail action | A | Always renders — route always resolvable via `ship.id`. |
| Missing-component count / loadout-progress detail | C | Real, already-computable data (`progress.missingAssignments.length` etc., already flowing through the existing `progress` prop) — the documented future progress hardpoint (§8.2). Not rendered today. |
| Warning/attention state (`mismatchedAssignments` / `invalidTargets` / `unresolvedAssignments`) | D | Real, computable via `progress`, but not part of the approved information hierarchy; a candidate for a later, dedicated mission alongside the progress hardpoint, not this one. |
| Manufacturer (`ship.manufacturer`) | D | Always present on `Ship`, but not part of the approved hierarchy for this record; a plausible Fleet Dashboard-only extension (§8.3), not an Alpha requirement here. |
| Ownership type (`ship.ownership`) | D | Same reasoning as manufacturer. |
| Career (`ship.career`) | D | Largely redundant with role for current data; not in the approved hierarchy. |
| Last updated (`ship.lastUpdated`) | D | Optional, sparsely populated; not part of the approved hierarchy for this record. |
| Fleet Profile `primaryRole`/`secondaryRole` | D | Optional, set only after a manual Ship Detail edit; role already occupies that hierarchy slot on this card. |
| Insurance | D | **Does not exist on the domain `Ship` type this component receives** (`src/types/index.ts`) — it exists only on an unrelated importer-only shape (`src/engine/types/ship.ts`) that never reaches `ShipRecordCard`. Excluded on that basis, not merely as a style choice. |

No field was found that belongs in the card merely because it exists
somewhere in the data model — every **D** exclusion above is either not
part of the frozen information hierarchy, or (insurance) not actually
reachable from this component's real props at all.

### 8.2 Card height and density (tuned EWO-013)

**Previous (EWO-012B):** `min-h-[260px] sm:min-h-[300px] lg:min-h-[320px]`,
content padding `p-4 sm:p-5`, `mt-2` spacers between metadata groups.

**Final (EWO-013):** `min-h-[220px] sm:min-h-[252px] lg:min-h-[268px]`
(≈15–16% shorter at every breakpoint), content padding tightened to
`p-3.5 sm:p-4`, and the `mt-2` spacers before the readiness block and
the Ship Detail action tightened to `mt-1.5`. The §8.1 audit found the
full required+conditional field set (badge?, name, role, loadout,
readiness state, Ship Detail) needs roughly 170–180px of content height
at these paddings — the new minimums retain modest headroom above that
figure for the still-conditional progress hardpoint (below) without
reserving a second field's worth of permanent empty space the way the
EWO-012B values did. The art layer's own inset/scale values are
percentage-based against the record's height and are otherwise
byte-for-byte frozen (§8.3) — they scale down proportionally with the
shorter record automatically; no art-layer CSS was touched to achieve
this reduction.

**Future progress hardpoint (documented EWO-012B, position and behavior
confirmed by EWO-013's audit — APPROVED FUTURE HARDPOINT, not
implemented, no data invented):** a compact secondary readiness/progress
detail (e.g. a missing-component count, or a more granular progress
breakdown than the existing percentage) can be inserted directly below
the existing Mission Ready/`ReadinessBar` block and above the "Ship
Detail" action, inside the same content-layer flex column — this is
exactly the "optional secondary metadata" slot EWO-012's information
hierarchy (item 7) already anticipated, and the underlying data (class
**C** in §8.1) is already flowing through the existing `progress` prop.
EWO-013 confirms the correct behavior is **conditional rendering with no
reserved space**: nothing renders there today, so the card already
contracts to exactly the height its real content needs, and a future
mission can insert the detail without any structural change. No such
element is added by this mission; no data is invented.

**`ShipImage` prop tuning (the one placeholder/art-layer-specific
adjustment EWO-012A permits — sizing/positioning only, never touching the
source pixels):** `imageClassName="block w-full h-full object-contain"`
(never `object-cover` for this layer) and `objectPosition="right center"`
so the vessel anchors toward the record's right field rather than
centering across the whole card. `presentation="cover"` is passed to
`ShipImage` *deliberately*, even though the rendered image is
`object-contain` — `ShipImage`'s own `"contain"` code path hard-codes a
centered `objectPosition` and an opaque background-color box on its
wrapper (correct for EWO-012's earlier full-bleed treatment, wrong for
this right-anchored, boundary-free one). Passing `"cover"` keeps
`ShipImage` on the branch that honors a caller-supplied `objectPosition`
and applies no background box, while the explicit `imageClassName` still
forces the actual `<img>` to render `object-contain`. `overlay={false}`
suppresses `ShipImage`'s own built-in gradient (this component's own
mask-fade replaces it). This exact prop configuration is the reusable
art-layer contract — it applies identically to any future transparent
production ship asset; no structural change is needed when real art
arrives.

The image uses `ShipImage` with `fallbackSrc={FLEET_REGISTRY_PLACEHOLDER ?? ''}`
— resolved semantically through the asset registry, never a hard-coded
path — the approved Fleet Registry placeholder master
(`public/assets/fleet-registry/placeholders/ship-placeholder-master-1024.png`,
revised under EWO-012A: isolated Cutlass Black registry vessel art, soft
contact shadow, transparent canvas, baked-in "IMAGE UNAVAILABLE" / "DATA
LINK PENDING" status wording), never the deprecated presentation-board
artwork (`SHIP_PLACEHOLDER_URL` — not deleted, not requested by this
component). Because the art layer always renders via `object-fit:
contain`, the placeholder's baked-in status wording is never cropped at
any breakpoint — `contain` guarantees the entire square canvas is always
visible, only repositioned/rescaled by CSS, never cut. "Full fleet" lives
in the section header, always discoverable. Up to three priority ships
render without any filler/invented record.

**Future ship asset manufacturing standard (FUTURE SHIP ASSET
MANUFACTURING STANDARD — not implemented, no production art exists
today):** the component is ready to accept transparent ship PNGs without
structural change — they use the exact same art-layer contract (right
positioning, `object-contain`, mask-fade, no structural change) as the
placeholder does today. When commissioned, that artwork must have: a
transparent background; normalized perspective; normalized lighting;
normalized scale; a soft contact shadow baked in; no surrounding image
frame; content canonically centered on its own master canvas (never
pre-cropped or pre-positioned for any one breakpoint — CSS owns that, not
the source file). Engineering does not manufacture ship art, and no
per-breakpoint image editing is permitted — only the presentation
contract that will receive it.

### 8.3 Canonical component declaration and Design Freeze (EWO-013)

Upon Commander/Chief Architect visual acceptance of this mission,
**`ShipRecordCard` is THE CANONICAL FLEET REGISTRY RECORD** for Strategic
Fleet Manager. `ShipRecordCard` is deliberately generic — no
Mission-Control-only concept is baked into it — and is used today by
`PriorityCard` via a thin wrapper supplying only the same
`{ ship, buildName, progress, badge? }` props documented throughout this
section.

- **Mission Control is the reference implementation.** Its Top Priority
  Ship section is the one place this record is wired up today.
- **Fleet Dashboard must adopt `ShipRecordCard` in a later authorized
  migration** — not done by this mission (Fleet Dashboard is untouched).
  Fleet Dashboard may extend the record through composition (badges,
  manufacturer identification, filtering, or grouping) but **must not
  create a competing ship-card design**.
- **Routine cosmetic experimentation is prohibited after Design Freeze.**
  Once accepted, further revisions to the frozen elements listed
  throughout this section (§8's composition, art layer, information
  hierarchy, up-to-three selection, etc.) require Commander Design
  Authority, verified Alpha/Beta usability evidence, or a new
  gameplay/data requirement — not a routine visual pass.

**UI migration backlog:**

- **Fleet Dashboard `ShipRecordCard` adoption and layout reshuffle** —
  replace Fleet Dashboard's existing ship-card presentation with
  `ShipRecordCard`, and reflow Fleet Dashboard's layout around the
  adopted record (grid density, filtering/grouping controls, any
  Dashboard-specific badges) accordingly. Requires its own authorized
  mission; not started, not scoped further here.

## 9. Update Budget — single-instance rule (RETIRED — see §27)

Historical record: "Update Budget · 2 min" was a holdover from an early
Mission Control iteration — a literal, never a calculation — that
survived several redesigns as an orphaned single line once the rest of
the footer's original content (version/build identity) was relocated to
the Sidebar and Captain's Log by CWO-005. EWO-058 (Quartermaster Release
Housekeeping) removed it outright as a development-era artifact with no
remaining operational meaning to a Commander.

## 10. Footer standard (RETIRED — see §27)

Historical record: Mission Control previously ended in a full-width
operational footer, pinned to the viewport's bottom edge when content is
short. By the time of EWO-058 its only remaining content was the
orphaned "Update Budget · 2 min" line described in §9 (its original
right-hand version/build identity content had already been removed by
CWO-005 — see §1). EWO-058 removed the footer element entirely; Mission
Control's operational cadence (§1) now ends at the End-of-Briefing Action
Center.

## 11. WorkflowDestinationCard standard (IMPLEMENTED NOW / APPROVED FUTURE HARDPOINT)

`src/components/WorkflowDestinationCard.tsx` — an operational workflow
destination, not a metric. Visually distinct from `CriticalMetricTile`:

- a dedicated illustration hardpoint (`sm:w-[34%]`, `min-h-[104px]`) that
  today shows a neutral dashed-circle + icon treatment (never a small
  data-tile icon box, never a broken `<img>`, never a large blank hole)
- strong title, one supporting supporting line, an "Open →" action
- the entire card is a single `<Link>` (full-card click), with a visible
  `focus-visible:ring-2` keyboard focus state

**Mission Control's End-of-Briefing Action Center** (UX-001B.4
Deliverable 5, destinations corrected by UX-001C — see §26), three cards
closing the page: "Loot Lookup" → `/decision-center`, "Add Inventory" →
`/hangar`, "Modify Ship" → `/ship-workspace`. Chief Architect framing:
everything above this row answers "what is the condition of my fleet,"
everything in this row answers "what should I do next" — Observe → Decide
→ Execute, the three highest-frequency operational pathways rather than
a return trip to the nav menu.

**Semantic illustration registry — EWO-057 production artwork:**
`src/config/assets/workflowAssets.ts` registers three semantic
illustration IDs, all now `enabled: true` with Commander-approved
production art delivered under
`public/assets/environments/mission-control/`: `decision-center-found-loot`
(`decision-center-card.webp`, backs "Loot Lookup" — Decision Center was
always this illustration's real destination), `hangar-add-inventory`
(`add-inventory-card.webp`, renamed from the retired `quick-update-hangar`
id now that this card routes to Hangar Inventory, never Quick Update),
and `ship-workspace-modify` (`ship-workspace-card.webp`, backs "Modify
Ship" — newly commissioned by EWO-057; before that it rendered
`WorkflowDestinationCard`'s neutral dashed-circle fallback). All three ids
are stable semantic identifiers, intentionally not renamed just because
an underlying asset filename changed. `MissionControl.tsx` references
only the semantic ID, never a raw path. A future Release 2.0
Quartermaster Edition commission may replace any of the three files again
with no change to `WorkflowDestinationCard` or `MissionControl.tsx`.

## 12. PageEnvironment and future hardpoints (APPROVED FUTURE HARDPOINT)

`src/components/layout/PageEnvironment.tsx` is mounted inside Mission
Control's Fleet Operations region (`id="mission-control"`). As of
EWO-035, this is the first `EnvironmentAssetDefinition`
(`src/config/assets/environmentAssets.ts`) to ship `enabled: true` —
`sources.desktop` points at the Commander-supplied
`mission-control-operations-wall.webp` (one production file, no
per-breakpoint variants yet; every viewport renders it via
`resolveResponsiveSource()`'s widest-available-first order), rendered
`object-cover` at the existing conservative presentation defaults
(0.16 opacity, 0.7 brightness) — no CSS/layout change, no new overlay.
Every other page's `EnvironmentAssetDefinition` still ships
`enabled: false` (the component still renders `null` for them) —
intentional dormant infrastructure, not a bug. The Fleet Operations
region's height (`lg:min-h-[400px]`) was sized to support this without
the page ever reading as an empty rectangle — every pixel in the region
is either the command-console rail, the artwork, or a reserved,
bordered/bracketed frame.

This is Beta 1.0 artwork — a future Release 2.0 Quartermaster Edition
commission may replace `mission-control-operations-wall.webp` with no
change to `PageEnvironment` or `MissionControl.tsx`. Do not claim the
Commander badge (HP-002), UTC clock (HP-003), or full Fleet Registry
imagery exist — none are delivered as of this mission.

### 12.1 Mission Control Environmental Philosophy (EWO-014 — governing design rule)

**Mission Control is not a web application page. Mission Control is a
physical Fleet Operations compartment aboard a starship.** The Fleet
Operations environment (§12) is the parent — the room. Every visible
interface element is a subordinate operational console mounted inside
that room, not a page section competing with it for identity. This
applies to:

- Branding (the sidebar brand lockup, §2)
- Navigation (the sidebar nav console, §2)
- Fleet Readiness (the command-console rail, §5–§6)
- Quartermaster Logistics (§7)
- Priority Ship Records (`ShipRecordCard`, §8)
- Workflow Destination Cards (§11)

**The room owns the background. The consoles own the information.** No
console should attempt to supply its own competing sense of place
(background imagery, scenery, decorative chrome) — that belongs solely
to the room (the future Fleet Operations cinematic environment, §12).
Consoles present information via bordered/panel surfaces, instrumentation
typography, and semantic color — never by trying to look like a
standalone page section.

This is the governing design rule for all future Mission Control work.
A change that makes a console look more like an independent dashboard
widget — rather than a display mounted inside the compartment — moves
away from this philosophy and should not be accepted without Design
Authority review.

### 12.2 Sidebar environmental readiness audit (EWO-014, Task 3 — audit only, no structural change)

**Finding: the architecture already supports the required hierarchy**
(Mission Control Environment → Floating Branding Console → Floating
Navigation Console) **once a future environment layer is enabled — no
structural change beyond EWO-014's own brand-lockup work was needed.**

- The `<aside>` root (`sticky top-0`) already establishes a positioning
  context sufficient for a future absolutely-positioned environment layer
  to be added as an early DOM child, exactly mirroring
  `PageEnvironment`'s existing pattern in the Fleet Operations region
  (§12) — no explicit `z-index` would be needed for the two console
  blocks to paint above it, the same way the hero region's reserved
  `flex-1` area needs none.
- The navigation console already had its own bordered/tinted panel
  surface (`rounded-lg border border-white/5 bg-white/[0.02]`),
  independent of the sidebar's own background — this was already
  "environment-ready."
  The branding block did **not** have this treatment before EWO-014 (it
  was a plain divider-bordered strip that blended into the sidebar
  background) — this was the one gap, and it is exactly what EWO-014's
  Task 1/Task 2 work closes by giving branding the matching console
  treatment.
- With both console blocks now sharing the same bordered-panel language,
  the sidebar is structurally ready to receive a future environment
  layer with **no further changes**: make no structural changes beyond
  what this mission already did; nothing further is required.

### 12.3 Hero viewport relationship audit (EWO-014, Task 4 — audit only, no redesign)

**Finding: the Hero Observation Window already functions as a viewport
into the Fleet Operations compartment, not a dashboard card — no
redesign is needed.**

- The region's root (`relative overflow-hidden rounded-xl`, with
  `lg:border lg:border-white/15 lg:bg-gradient-to-br lg:from-panel/70
  lg:to-bg/60`) uses a soft gradient rather than a flat `panel` fill —
  it already reads as atmospheric depth rather than a card surface.
- The corner-bracket frame elements (top-left, bottom-left,
  `border-cyan/20`/`border-cyan/10`) are a HUD/viewport framing device,
  reinforcing "a window being looked through" rather than "a card being
  read."
- `PageEnvironment id="mission-control"` is mounted as a sibling
  positioned `absolute inset-0` against the region's own root — meaning
  once enabled, the environment image fills the **entire** hero region,
  including behind the command-console rail, not just the empty
  `flex-1` "window" area.
- The command-console rail already uses `lg:bg-transparent` at the `lg:`
  breakpoint — so once the environment is enabled, the rail's own
  instrumentation will float directly over the environment image with no
  opaque backing, reading as a HUD overlay inside the compartment rather
  than a separate card floating beside a picture.

Together, these confirm the hero region is already the correct
"viewport into the compartment" relationship the environmental
philosophy (§12.1) requires. No changes were made.

## 13. Responsive rules

- **Wide desktop (≥1536px, Tailwind `2xl:`):** Fleet Operations region is
  a row — environment area left/center, command rail (`w-[300px]`) right;
  three Priority Ship records render as three balanced columns
  (`2xl:grid-cols-3`), each an integrated Fleet Registry Record; Quartermaster
  cards display across the full width; workflow destinations sit side by
  side.
- **Laptop (`sm:`–`2xl:`, e.g. ~1366px):** two Priority Ship records per
  row (`sm:grid-cols-2`); a third record wraps cleanly onto its own row
  rather than compressing three into the same row. The command rail may
  visually tighten but its `CriticalMetricTile`s never compress into
  unreadable rows.
- **Tablet (`sm:`, e.g. ~834px):** one or two Priority Ship records per row
  depending on available width (same `sm:grid-cols-2` rule); the Fleet
  Operations region collapses to a column (`flex-col`) — command rail
  stacks below/within the region; operational order is otherwise
  unchanged.
- **Mobile (`<640px`):** single-column throughout, including Priority Ship
  records; ring and critical metrics remain readable at `text-2xl`/ring's
  own responsive sizing; the Fleet Registry Record's full-bleed image
  scales with the card rather than being hidden (it is integral to the
  record, not a detachable panel); `WorkflowDestinationCard` images still
  hide (`hidden sm:flex`) below `sm:`; no new horizontal overflow is
  introduced. The known global persistent-sidebar mobile limitation is
  out of scope for this mission.
- A single live Priority Ship renders one record capped at a reasonable
  maximum width (`max-w-md`) rather than stretching awkwardly to fill the
  row; two ships split evenly; three ships never compress into three
  illegibly narrow columns below `2xl:`.

## 14. Visual acceptance process

Technical verification (`tsc`, `vitest`, `npm run build`, manual
multi-breakpoint preview) is necessary but not sufficient. A change to
this frozen architecture is accepted only after: (1) the Commander runs
the live application, (2) the Commander supplies a current screenshot,
(3) a punch list is resolved if raised, (4) Chief Architect Design
Authority review, (5) corrections are completed, (6) commit occurs. Do
not commit changes to this architecture without that cycle completing.

## 15. Known unimplemented assets (do not claim these exist)

- Commander identity/badge (HP-002) and UTC time/date (HP-003) in the
  command-console rail
- Any Fleet Operations cinematic environment artwork (`environmentAssets.ts`
  — all definitions `enabled: false`)
- Workflow destination illustrations (`workflowAssets.ts` — both
  definitions `enabled: false`)
- Fleet Registry manufacturer/ship imagery (`FLEET_REGISTRY_MANIFEST` is
  empty — every ship resolves through the override tier or the approved
  generic placeholder)
- `primaryLogo`, `monochromeMark`, `appIcon` branding variants (`enabled: false`)

## 16. Component presentation contract (EWO-019A)

Factory/Installed/Target cells in the Loadout & Port Tree (`LoadoutPortTree.tsx`, Ship Detail) and MissionComposer's Factory/Installed columns share one rendering contract, `ComponentAssignmentLabel` (`src/components/ComponentAssignmentLabel.tsx`), backed by the pure formatter `resolveComponentLabel()` (`src/utils/componentPresentation.ts`):

- **Raw CIG internal identifiers are engineering data** — never the primary label when any resolved name exists; exposed only via a `title` attribute for diagnostics/support/DataCore cross-checking, never as a permanent third line.
- **Resolved display names are Commander-facing data.** Priority order: (1) Mission M-012's bulk catalog's real localized name (`generated-data/component-metadata-catalog.json`, joined by the component's own internal name — never guessed or reconstructed from a mangled string); (2) the deep-import pipeline's own resolved `Component.displayName`, when not itself raw-identifier-shaped; (3) a conservatively cleaned internal name (strips `_SCItem`, a leading category-code token, and bare size tokens) when the value is shaped like a raw identifier; (4) the original string unchanged — covers hand-authored seed values (already readable) and explicit "nothing assigned" sentinels (`—`, `Unknown Factory Item`).
- **Class and grade are supporting metadata**, rendered as a secondary line (`Class · Grade X`, `Class`, `Grade X`, or omitted entirely — never a dangling separator, never `Unknown · Grade Unknown`). Grade is normalized from DataCore's raw 1–4 integer to the standard `Grade A`–`Grade D` display convention (`Component.grade`'s own doc comment already specifies "e.g. 'A', 'B', 'C'" as the intended contract) — a display-form conversion of a real resolved value, not a fabrication. `Component.class` (Stealth/Military/Civilian/Competition/Industrial) is currently unpopulated for every deep-imported component today (a pre-existing, honest metadata-resolution gap, not something this contract invents); the secondary line reduces to grade-only until that's resolved upstream.
- **Size / Type remains a separate, port-context field** (`hp.size`/`hp.type`, Column 2) — the component cell never repeats the port's own category/size.
- **No metadata is fabricated.** Both lookup layers are additive readers of already-generated data (`src/generated/importedShips.ts`'s `componentByDisplayName`, `src/generated/componentCatalog.ts`'s `catalogComponentsByEntityClass`); neither alters import/generation scripts, assignment identity, compatibility, readiness, procurement, or persistence.
- **Future compartments** (Hangar Inventory, Quick Update, Decision Center, or any other view rendering a factory/installed/target-style component value) should adopt `ComponentAssignmentLabel`/`resolveComponentLabel()` when migrated, rather than reformatting independently.

### 16.1 Canonical component *search* renderer (EWO-030, Task 1)

`ComponentAssignmentLabel` (above) is the contract for *displaying* a component value already assigned to a cell. Picking a new component from the full catalog is a related but distinct surface — search text, a filterable listbox, and the candidate's Type/Size/Grade/Manufacturer — and now has its own single shared implementation: `CatalogComponentSearch` (`src/components/CatalogComponentSearch.tsx`), built on the same `resolveComponentLabel()` plus `manufacturerFullNameForCode`/`manufacturerNameForCode` (`src/utils/manufacturerLogo.ts`).

- Originally Hangar Inventory's "Add New Item" search (EWO-028), extracted verbatim so **Quick Update's Install Component and Add Component to Hangar steps render an identical search experience** — same input, same `size={6}` listbox, same Type/Size fields, same Grade/Manufacturer line — by sharing the component outright, not by visual convention.
- A search narrowing to exactly one catalog match auto-selects it (the EWO-029 Task 1 fix, now shared); every keystroke clears the prior selection first, so broadening the search or reaching zero matches never leaves a stale selection.
- Ship Detail and the Loadout Manager's Target column continue to use `TargetComponentPicker` (`src/components/TargetComponentPicker.tsx`) for in-place target editing on an existing port row — a different interaction shape (inline combobox, not a standalone search-and-add step) that this mission left unchanged. `CatalogComponentSearch` is specifically for "add/install a new component" flows.

### 16.2 Full-catalog browsing, no artificial truncation (EWO-031, Task 2/3)

`CatalogComponentSearch`'s listbox previously capped at 40 visible entries (`MAX_VISIBLE_CATALOG_MATCHES`) regardless of query — with the real generated catalog at 679 selectable components, a blank search silently showed only the first 40 alphabetically, and a broad typed query could just as silently hide real matches past the same cap. The cap is removed entirely: a blank search now lists the complete, alphabetically sorted catalog, and a typed search is filtered from that same complete list — the native `size={6}` listbox scrolls to reach the rest. Typed search's filtering logic itself (case-insensitive substring match) is unchanged. Every canonical component is now discoverable both ways — confirmed against representative samples across Weapons, Shields, Coolers, Power Plants, Quantum Drives, Missile Racks, Missiles, Mining, and Salvage components (`src/components/__tests__/CatalogComponentSearch.test.tsx`).

### 16.3 Decision Center reads the same canonical catalog (EWO-031, Task 1/4)

Decision Center previously ran entirely against a hand-authored, ~8-item demo list (`decisionCatalog`/`decisionCatalogNames` in `src/data/seed.ts`) with zero connection to live fleet state — confirmed fully disconnected during EWO-029's own audit. Both are now removed. Decision Center's typeahead reads `catalogComponentsByName` directly (`src/generated/componentCatalog.ts`) — the same canonical source Hangar Inventory, Quick Update, and the Loadout Manager already search — so the Commander gets the same component results regardless of page. Its recommendation is no longer a static lookup table either: it queries live `useFleetStore` state (`ships`/`builds`/`hardpoints`/`reservations`) via `resolveNeededByBuilds()` (the same shared resolver Hangar Inventory's Needed By column and Reserve workflow already use, EWO-029), filtered to each Ship's own **Active** Loadout only (not every saved Build):

- **Still required** by one or more active Loadouts → **KEEP**, a per-entry **Reserve** action (linking to Hangar Inventory) or **Already Reserved** label, and a Needed By listing naming the exact Fleet Asset/Build/slot.
- **Every active Loadout already satisfied** (nothing currently targets it unresolved, or everything that does already has it installed) → **Already Satisfied** / **Store in Hangar** — no reservation required.
- **No catalog match at all** → an honest "No Catalog Match" result, never a guessed verdict.

Nothing here auto-reserves or auto-installs — same Design Authority principle EWO-029 established for the unreserved-match signal elsewhere in the app.

## 17. Port hierarchy grouping (EWO-019B, extended EWO-020)

`LoadoutPortTree.tsx` (Ship Detail) and MissionComposer's Target Equipment table both layer a generic grouping pass, `groupPortTree()` (`src/utils/portTreeGrouping.ts`), on top of the existing `buildPortTree()` output — never a per-ship or per-system special case. A top-level physical port carrying `Hardpoint.groupLabel` renders nested beneath a synthetic header sharing that label, alongside every sibling top-level port carrying the same one; ports without a `groupLabel` render exactly as before (unaffected systems keep their pre-existing flat presentation).

- **Fixed, player-oriented category order (EWO-020, Task 10)** — `groupLabel` is now derived from the real, source-evidenced `assemblyRole` (see ADR-007), not just `equipmentGroup`, and top-level groups sort into a stable, Chief-Architect-approved order: Core Systems, Detection / Navigation, Weapons, Manned Turrets, Remote Turrets, Ordnance, Utility Systems, Support Systems (`TOP_LEVEL_GROUP_ORDER`, `src/data/shipDefinitions.ts`). A category this list doesn't define stays visible in its original relative position rather than being forced into an approximate bucket.
- **Same table, same columns, same base typeface** (EWO-020, Task 11) — a group header is a normal row: `font-semibold uppercase tracking-wide` in the accent color, in the table's own inherited base font — never `font-display` (Rajdhani), which read as a second, competing design language on Commander review. Blank Size/Type/Factory/Installed/Target/Logistics/Validation cells, the same expand/collapse chevron and `id`-keyed expand state every real parent row already uses.
- **A structural row** (a mount/turret preserved only to explain hierarchy — `Hardpoint.isStructural`, ADR-007) renders its own slotLabel in the same header-adjacent treatment, shows a neutral `"—"` in place of Factory/Installed/Target, and never shows a Logistics/Validation badge or (in MissionComposer) an editable target input — it never had a real assignment to validate.
- **Default expand state matches each page's existing convention** — collapsed by default in Ship Detail (a read-only inspection view, matching every existing nested row there), expanded by default in MissionComposer (an editing surface, matching Mission M-011's "every configurable port must be reachable without an extra click" rule).
- **A group is never invented from a name-shaped guess.** `assemblyRole` is derived from a mount's own raw entity class naming convention (`Mount_Gimbal_*`, `WeaponMount_*`, a `Turret` token disambiguated by `Remote`/`Nose` tokens — see `src/normalizer/assemblyRole.ts`), never from a port/hardpoint name (EWO-019B already proved that unreliable). `GENERIC_MOUNT`/`UNKNOWN` are legitimate outcomes, not forced into a specific role.
- **Presentation-only**: `groupPortTree()` operates on the tree handed to it for rendering; it never touches the underlying `hardpoints` array, so compatibility, readiness, procurement, and persistence are unaffected. `derivePortLogistics`/`derivePortValidation` are never called for a synthetic group header or a structural row — only for real, configurable port nodes.

## 18. Canonical Commander workflow: Install and Remove a component (EWO-030)

Installing and removing an equipped component are now two deliberately separate, single-purpose workflows in two different places, replacing Quick Update's earlier one-page, five-branch form.

### 18.1 Install — Quick Update, Component → Ship → Loadout → Compatible Slot

Quick Update's "Install Component" step asks exactly one question at a time, each revealed only once the one before it is answered, and lets the application resolve everything it can determine on its own:

1. **Component** — `CatalogComponentSearch` (§16.1). A single catalog match auto-selects.
2. **Ship** — defaults to the first Fleet Asset; only shown once a Component is chosen.
3. **Loadout** — filtered to the selected Ship's own Builds (`shipBuilds`), defaulting to that Ship's Active Loadout; installing under a non-active Loadout only changes that Loadout's own progress (pre-existing behavior, unchanged — see the "Loadout Context" note).
4. **Compatible Slot** — the Slot dropdown is filtered to hardpoints on the selected Loadout that are (a) not already fulfilled (`status !== 'OK'`) and (b) positively type/size-compatible with the selected component, via `isComponentSelectableForPort()` (`src/data/componentCatalog.ts`) — the same function the Loadout Manager's Target picker already uses (EWO-024, Task 2), so "what's offered" can never disagree with "what `installComponent` will actually accept." **Exactly one compatible slot auto-selects.** Zero compatible slots renders a plain message ("No compatible open slot for X in Y") instead of a doomed dropdown.

`installComponent`'s own store-side matching/compatibility checks (unchanged by this mission) remain fully in place — with the UI now only ever offering choices that already satisfy them, that logic is exercised as **defensive programming**, not as the normal path a Commander has to reason about or recover from.

### 18.2 Remove — Ship Detail's Loadout & Port Tree, the official uninstall workflow

Quick Update's old "Remove Component" tab (a fifth, generic-slot-list branch of the same form) is hidden from the UI — its implementation (`removeComponent` store action, `handleSave`'s branch, state) is untouched and still reachable programmatically, but no button in Quick Update's "What changed?" list sets `changeType` to it anymore.

Removal now lives where the Commander is already looking at what's installed: every installed, non-structural row in `LoadoutPortTree` (Ship Detail's Loadout & Port Tree, §17) gets a **Remove** action (an `Actions` column, shown only when the host page supplies an `onRemoveComponent` callback — Ship Detail's own live Fleet Asset view does; the read-only/dev-inspection `ImportedShipDetail` path deliberately does not, since it has no real Build to mutate). The workflow is exactly: **Remove → optional Return Component To Hangar → Save**, mirroring the checkbox Quick Update's old Remove tab used. A successful removal is recorded in the Captain's Log the same way Quick Update's Install/Remove always have been.

### 18.3 Hidden, not deleted: Move Component Between Ships

"Move Component Between Ships" is likewise hidden from Quick Update's tab list — `moveComponentBetweenShips` and its full UI branch remain in the code, unreachable only through this page's own buttons. Deferred to a future roadmap item (see `docs/Roadmap.md`); re-exposing it is a UI-only change (no store work required) when that's prioritized.

### 18.4 Set Active Loadout — unchanged

Not touched by this mission (Commander-verified during Sea Trials, per EWO-030's own instruction) — still its own tab, still Ship → Loadout → Save.

## 19. ShipCard — THE canonical Ship Card (EWO-032, Beta UI Lock)

**`src/components/ShipCard.tsx` is the application's one universal Ship Card.** Sea Trials found it the strongest information presentation already in the app (originally Fleet Dashboard-only) — Mission Control's Priority Cards were migrated onto this exact component rather than continuing to maintain a second, diverged layout (`ShipRecordCard`/`PriorityCard`, §8, both retired). Every current and future ship-grid surface consumes it: Fleet Dashboard, Mission Control, and (per Commander Intent) any future Fleet Roadmap or Squadron view — no page maintains its own card layout.

**What it preserves (Task 5 — no information reduction from the pre-migration Fleet Dashboard card):** Ship Image, Ship Name, Manufacturer, Ownership Badge, Active Loadout, Readiness %, Missing Component Warning, Progress Bar.

**Click-anywhere navigation (Task 4):** the whole card is a single `<Link to={/ship/${ship.id}}>` — there is no separate "Ship Detail →" hyperlink anywhere inside it. This was already Fleet Dashboard's behavior; Mission Control's migration removed its own former "Ship Detail" text link to match exactly.

**Priority is page-level wrapper context, never embedded inside ShipCard** — a "PRIORITY N" label renders as a sibling *above* the card via the shared `PriorityLabel` component (`src/components/PriorityLabel.tsx`, `div[data-testid="priority-card-wrapper"]`), the only concept that varies per page. As of EWO-033, **both** pages render it: Mission Control shows positional rank 1-4 within its Top 4 slice (`[...ships].sort(...).slice(0, 4)` — see §19.1); Fleet Dashboard shows every Fleet Asset's own stored `priority` value, in Card view, always (not only while Priority sort is active) — never a recomputed rank, so it stays correct after any sort or filter.

**Verified byte-identical** between Mission Control and Fleet Dashboard for the same ship via an automated `outerHTML` comparison test (`src/pages/__tests__/MissionControl.test.tsx`) — not just visually similar, the literal same component instance with the same props shape.

**Out of scope, deliberately deferred** (Commander Intent): Quartermaster Edition visual enhancements/artwork — this mission is presentation standardization only, not a redesign. No readiness logic, logistics, importer, or persistence changes were made.

### 19.1 Beta Ship Card Lock Correction (EWO-033)

Sea Trials found three browser-verified gaps after EWO-032's migration, all corrected as presentation-only fixes (no redesign, no logic changes):

- **Fleet Dashboard now always shows its Priority wrapper in Card view** (§19 above) — previously it showed no Priority indicator at all, even though Priority sort was already available.
- **Mission Control now shows the Top 4** Priority Fleet Assets (`slice(0, 4)`, was 3) per Commander direction — the sort/slice logic itself, and the 0/1-3/4+ ship empty-and-small-fleet behavior, are otherwise unchanged.
- **The Priority grid uses one shared responsive breakpoint contract** on both pages (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, `items-stretch`) — Mission Control's 4-card case never renders narrower cards than Fleet Dashboard would at the same viewport width, and no page-specific compact card variant exists.

**Canonical card dimension contract (Task 4):** `ShipCard` now has four structural regions, each with a Tailwind-scale reserved minimum height (`min-h-11` identity, `min-h-5` Active Loadout, `min-h-11 flex-1` status), present identically regardless of which `FleetBuildState` branch is active — INVALID_BUILD, FACTORY_ONLY, MISSION_READY, and the in-progress/readiness-bar branch all populate the exact same regions, so a shorter-content card never renders shorter than a longer-content one in the same grid. The root card is `h-full` so a CSS-grid row's automatic `items-stretch` fills any remaining height evenly via the status region's `flex-1`. No arbitrary fixed pixel height, no data-specific conditional heights, no second page-specific card variant — one contract, defined once in `ShipCard` itself.

### 19.2 Beta Ship Image Coverage & Universal Fallback Standardization (EWO-033A)

Sea Trials flagged the universal fallback artwork rendering as a small object surrounded by an oversized blank hero/card region on wide frames. Root cause: both candidate fallback PNGs (`public/images/ship-placeholder.png`, i.e. `SHIP_PLACEHOLDER_URL`, and the unused `ship-placeholder-master-1024.png` under Fleet Registry scaffolding — confirmed byte-identical artwork, both exactly 1024×1024) were rendered with `object-contain` inside 16:9 (`ShipCard`) and full-width (`ShipHeroFrame`) frames, necessarily letterboxing. `ShipHeroFrame` additionally hard-coded a taller fixed height (`h-[360px]`) for the fallback branch than the real-photo branch (`h-44 sm:h-56`), compounding the effect.

**Fix — frame-filling presentation, one dimension contract regardless of image availability:**
- `ShipImage.tsx`'s fallback (`mode === 'contain'`) branch now renders `object-cover` instead of `object-contain`, and no longer applies a flat `backgroundColor` box (nothing left to letterbox). `mode` itself (`'contain'` vs `'cover'`) remains the semantic real-vs-fallback flag every caller already branches on (e.g. `ShipHeroFrame`'s overlay-vs-metadata-band switch, §19.2 below) — only the rendered CSS changed, confirmed safe by direct visual inspection: the artwork's "IMAGE UNAVAILABLE" text and ship silhouette both sit in the vertical-center band and survive any reasonable center-crop.
- `ShipCard.tsx`'s fallback `imageClassName` branch matches (`object-cover`, no hover-zoom — the zoom-on-hover treatment stays real-photo-only).
- `ShipHeroFrame.tsx` now uses one fixed height (`h-44 sm:h-56`) for both branches — no layout shift based on image availability. This did **not** touch the EWO-033 `ShipCard` dimension contract (§19 above) — the reserved-height regions are unchanged; only the image's own fit-mode CSS moved.

**Universal fallback source — one, not two:** `SHIP_PLACEHOLDER_URL`, reached via `src/utils/resolveShipImage.ts`'s default `fallbackSrc` on every live surface (`ShipCard`, `ShipHeroFrame`). The separate `FLEET_REGISTRY_PLACEHOLDER` / `resolveFleetRegistryImage()` path (§10 below, `fleetRegistryAssets.ts`) is confirmed via exhaustive grep to have **zero live callers** anywhere in the app — it is now explicitly marked `@deprecated` in its own file rather than deleted (kept only as possible Release 2.0 scaffolding). There was never a real visual choice to make between the two fallback assets — they are the same artwork.

**Canonical registry, resolution precedence, and Commander editing workflow — unchanged, re-confirmed correct:** `src/data/shipImageRegistry.ts` remains the single Commander-maintained file (§ "Canonical ship image URL registry" in `docs/ASSET_PIPELINE.md`); `resolveShipImage()`'s three-tier precedence (registry → existing official/imported image → `undefined`/fallback) was audited end-to-end this mission, including seed ships (re-resolved fresh on every store construction via `withResolvedSeedImages()`, never persisted/frozen), deep-imported and catalog-only ships (via `presentationImageKeyById`'s alias keys), and manually-added Fleet Assets (`materializeFleetAsset()`'s own direct `resolveShipImage()` call, replayed on every rehydration) — no live surface bypasses it. No code changes were needed to `resolveShipImage.ts` itself.

**Coverage audit (Task 9, as of this mission — a snapshot, not a static guarantee; re-run the live tests in `src/data/__tests__/shipImageRegistry.test.ts` for the current count):** 258 total canonical selectable hulls, 12 with a registry-resolved image, 246 falling through to the universal fallback, 0 orphan registry keys, 0 duplicate keys, 0 malformed entries. Partial coverage is the expected, approved Beta state — the Commander adds entries incrementally, one HTTPS URL per line, no generation step, no re-import.

**Stock role/focus (Tasks 6-9):** the identity line's second segment ("Manufacturer · Stock Role/Focus") is resolved by `resolveShipStockRoleFocus()` (`src/utils/shipIdentityLine.ts`) — deliberately independent of `Ship.role` (which mirrors the active Build's role text at materialization time, not stock metadata — see `docs/DataModel.md`'s "Stock role/focus vs. operational role"). Precedence: (1) the canonical `ShipDefinition.role`, when genuinely populated; (2) for a deep-imported definition whose own role/career came back empty (a real gap in the raw StarBreaker export envelope, not a wiring bug — see `docs/ImportPipeline.md`'s "Current known gaps" #8), the Mission M-012 catalog's own record for that same real hull, cross-referenced by entity class; (3) no text — never invented from the ship's name, never substituted from a Build or the Commander's future Fleet Profile role. `formatShipIdentityLine()` joins manufacturer and the resolved role with " · ", or renders manufacturer alone — never a dangling separator. **Coverage: 100% of the 258 canonical selectable hull definitions resolve a real stock role/focus** (252 at tier 1, 6 — every deep-imported ship — at tier 2) — see the EWO-033 final report for the full numbers and representative examples (Cutlass Red, 135c, Cutlass Black, Eclipse, Gladius).

## 20. ActionCard — the canonical operational action standard (UX-001A.2–UX-001A.4A, IMPLEMENTED NOW / APPROVED FUTURE HARDPOINT)

`src/components/ActionCard.tsx` — the canonical presentation for an
operational action (a Commander decision, as distinct from an
operational metric — see §7/§3's `CriticalMetricTile` for the metric
side of that same visual language). First consumer: Mission Control's
Priority Actions panel, replacing the prior `PriorityActionRow` floating
notification-list treatment (retired, deleted — superseded, not kept
alongside).

- a colored left border stripe (`border-l-[3px]`), an icon housing
  tinted with that same accent color, and the count rendered in that
  same accent — three independent places the same severity signal
  lands, so relative importance scans before any text is read
- **UX-001A.4 — internal typography shares `CriticalMetricTile`'s own
  hierarchy, not merely its bone structure.** The count renders first,
  the action title renders beneath it using Fleet Status's own label
  treatment (`text-[11px] uppercase tracking-widest text-muted`) rather
  than a bespoke notification-style heading, and ship context renders
  last, same subordinate treatment as `FleetStatusTile`'s own context row
  (`text-[11px] text-muted/80`). The result: Fleet Status reads "Number →
  State → Ship Context," Priority Actions reads "Number → Action → Ship
  Context" — a shared scan rhythm.
- **UX-001A.4A correction — shared hierarchy does not mean shared
  geometry.** UX-001A.4's first pass copied Fleet Status's dimensions too
  literally (`text-2xl` count, `w-10 h-10` icon housing, `p-4` padding),
  stretching each card past what three compact lines need and leaving
  unused space in the Priority Actions column. The fix keeps the
  hierarchy and typography *family* but steps the geometry down: count is
  `text-xl font-display font-bold leading-none` (one scale step below
  Fleet Status's own `text-2xl`, still display font, bold, and
  accent-colored — still unmistakably the primary scan target), icon
  housing is `w-8 h-8` (was `w-10 h-10`), card padding is `p-3` (was
  `p-4`). Label and ship-context treatment are unchanged from UX-001A.4 —
  those never caused the fitment problem. **Design System guidance:**
  document *shared hierarchy* between related components (count-first
  scan order, label treatment, supporting-context treatment), not
  mandatory identical CSS classes — a classification panel (Fleet Status)
  and a compact work queue (Priority Actions) are related, not
  interchangeable.
- the icon housing stayed accent-tinted rather than adopting Fleet
  Status's uniform cyan tint — Priority Actions' glyph-plus-color pairing
  is the one place the two panels are meant to diverge, per Design
  Intent: "they should not be identical, but they should share the same
  visual grammar"
- domain-agnostic: no ship/fleet concept baked into the component
  itself (an optional `to` prop for a whole-card link, an optional
  `children` slot for supporting context) — Mission Control supplies
  its own ship-context rendering via a local `renderShipContext()`
  helper rather than teaching `ActionCard` about ships
- one card = one action = one decision: each `PriorityActionGroup`
  (`src/utils/priorityActions.ts`) renders as its own bounded `.panel`
  element — never a divided list, never rows sharing one shared panel.
  The stack container (`flex-1 flex flex-col justify-between gap-2.5`,
  UX-001A.4A Deliverable 4) absorbs whatever leftover vertical space the
  Hero row's `items-stretch` gives the Priority Actions panel and
  distributes it as extra gaps between cards, rather than leaving it as
  dead space below the last card — `gap-2.5` remains the floor either
  way, so this never compresses cards below their own compact height.

Used today for Mission Control's five Priority Action categories
(Reserved — Awaiting Install, Ready to Install, Upgrade Opportunities,
Invalid Targets, Critical Missing Components). Intended for reuse
anywhere else in Strategic Fleet Manager an operational action needs the
same treatment — Decision Center, Fleet Dashboard, Organization
Management, Manufacturing, Insurance, and future Quartermaster modules
are the named future consumers; no changes to `ActionCard` itself should
be required to adopt it elsewhere.

**Design System Amendment (UX-001A.2):** *Operational concepts are
encapsulated. Metrics, status summaries, and operational actions should
be presented as bounded visual units whenever they represent independent
Commander decisions. Containment improves scan efficiency, reinforces
information hierarchy, and establishes consistent interaction targets.
Lists remain appropriate for supporting information within a card, but
top-level operational concepts should be visually encapsulated.*

## 21. Quartermaster Report — Logistics Demand, Assessment & Procurement Work Queue (UX-001B/UX-001B.1/UX-001B.5, IMPLEMENTED NOW)

Mission Control's lower half was an inventory report ("which database
rows exist") — a flat Missing Components / Unreserved Inventory tile
pair, then every procurement row in the fleet. UX-001B rebuilt it into a
logistics briefing answering "what is limiting fleet readiness"; UX-001B.5
renamed and consolidated it into the **Quartermaster Report** — one
`.panel` reading top to bottom as a single document (Logistics Demand →
Quartermaster Assessment → Procurement Work Queue), not three
independent dashboard widgets stitched together. Same reuse discipline
throughout: no second accounting authority, no second category taxonomy.

**Logistics Demand** — the report's first section. A grid of
`ActionCard`s, one per demand category, each showing the category's own
true shortage (`qtyNeeded`, never `availableToReserve` — a category with
everything already available shows Complete, never absent). Categories
are **not** a new taxonomy invented for this feature — see §22, the
Canonical Component Taxonomy. All demand cards share one neutral
Quartermaster Blue accent (`#35D0FF`) rather than an invented severity
color — these are aggregate counts, not state classifications, so
Priority Actions' green/gold/red vocabulary (§4) does not apply, except
the deliberate Complete exception (§23).

**Category cards are filters, not links (`ActionCard`'s `onClick`
mode).** Clicking a demand card scopes the ENTIRE Quartermaster Report
below it to that category in place (toggles off on a second click) — no
route change, no panel collapse, no repositioned surrounding content
(UX-001B.5 Deliverable 5). `ActionCard` gained a third interaction mode
for this alongside the existing `to` (Link) and bare (static) modes:
`onClick` + `active`, rendered as a real `<button>` for native keyboard
operability. Mutually exclusive with `to`.

**Quartermaster Assessment** — the report's second section, always
present, reacting to the current scope (one category, or the whole
fleet). Exactly one of three operational outcomes
(`assessCategoryWorkQueue()` in `src/utils/quartermasterBriefing.ts`),
and no two ever share a presentation:

| Assessment | Meaning | Presentation |
|---|---|---|
| `ACTIONABLE` | Reserved/Available rows exist in scope | "N inventory assets are immediately available…" + the Work Queue table below it. |
| `PROCUREMENT_ONLY` ("No Inventory Available") | Real demand exists, but nothing owned | A muted assessment line explaining procurement is required; no table — there is nothing actionable to tabulate. |
| `COMPLETE` ("Fleet Demand Complete") | Nothing outstanding at all | The green Quartermaster completion treatment (reusing §23's own Complete vocabulary); no table. |

**Procurement Work Queue** — the report's third section, rendered only
when the assessment is `ACTIONABLE`. **UX-001B.5 Deliverable 3 —
Available/Reserved rows only, unconditionally.** Purchase Required rows
never render in Mission Control, full stop — this supersedes UX-001B.4's
own per-category exception (which kept a bare "must purchase" list
visible for a category with no owned inventory; Commander review
reclassified that as procurement planning, which belongs to a future
dedicated tool, not today's execution-focused briefing). Colors remain
canonical, not Mission-Control-specific — see §23 for the full Design
System Amendment.

| State | Badge tone | Meaning |
|---|---|---|
| Reserved | `cyan` (Quartermaster Blue) | Owned, committed to another Loadout — available only through reprioritization, not immediately deployable. |
| Available | `success` (green) | Owned, unreserved — go reserve it, immediate readiness gain possible. |
| ~~Purchase Required~~ | — | Never rendered in Mission Control (UX-001B.5). Still a real `ProcurementRowState` and still colored `muted` wherever else it's shown (e.g. a future dedicated procurement-planning surface) — the state and its color remain canonical, only Mission Control's own display of it was removed. |

Reused, not reinvented: `buildProcurementList` (unchanged — still the
one true-shortage/available-to-reserve authority) supplies
Available/Purchase-Required rows; the new, additive
`buildReservedAwaitingInstallLines` (`src/utils/procurement.ts`) walks
the same hardpoints with the *inverse* reservation filter to surface the
"reserved but not yet installed" rows `buildProcurementList` deliberately
excludes (Alpha 2.3 Part 15 — installing a reserved unit is execution,
not acquisition). `filterActionableWorkQueue()` then unconditionally
strips Purchase Required rows for Mission Control's own display — the
underlying `WorkQueueRow[]` (including Purchase Required) is still what
`assessCategoryWorkQueue()` reads, so the Assessment section above can
still tell "no inventory, but real demand" apart from "genuinely nothing
outstanding" even though the table itself never shows that row.

**Needed By is a hyperlink; inventory state is a badge (Deliverable
5/6).** `ProcurementLine.neededBy` is structured `{ shipId, buildId,
label }[]` so each entry links straight to `/ship-workspace/{shipId}`.
Badges (`Badge.tsx`'s `procurementRowStateTone`/`procurementRowStateLabel`)
communicate state; links communicate destinations — never the reverse.

**Scrolling reduction.** A row only exists if it represents real
actionable quantity — `buildQuartermasterWorkQueue` never emits a
zero-quantity row. Hangar Inventory remains the complete system of
record; Mission Control shows only what the fleet can act on today.

## 22. Canonical Component Taxonomy (UX-001B.1, Design System Amendment, IMPLEMENTED NOW)

UX-001B's first pass grouped Quartermaster demand using
`commanderSystemTaxonomy.ts`'s `TOP_LEVEL_GROUP_ORDER` — the taxonomy
that groups a ship's *ports* into layout sections for Ship Detail's
Loadout Tree and Ship Management's Systems Workspace (Manned Turrets,
Remote Turrets, Modules, and one catch-all "Core Components" bucket
containing Coolers, Power Plants, Quantum Drives, Shields, and Life
Support together). Commander review found this wrong for a demand
summary: a Quartermaster does not think "I need sixty core components,"
they think "I am short twenty-one shields." Grouping by physical mounting
layout answers a different question than grouping by what you'd actually
go acquire.

**The corrected authority is `src/utils/componentCategoryIcon.ts`**,
elevated from a Ship-Management-only icon picker into the one canonical
component-*system* taxonomy — glyph, label, and display order together,
not just glyph:

- `canonicalComponentCategoryKey(hp)` — the one classification switch
  (unchanged from the original `componentCategoryIcon` body, only
  factored out so nothing else has to duplicate this matching logic).
- `CANONICAL_COMPONENT_CATEGORY_ICON` / `_LABEL` — per-category icon and
  plural display label (`Cooler` → Wind icon / "Coolers", `PowerPlant` →
  Zap / "Power Plants", `QuantumDrive` → Rocket / "Quantum Drives",
  `Shield` → Shield / "Shields", `Weapon` → Crosshair / "Weapons", and so
  on through Missile Racks, Missiles, Jump Drives, Radar, Mining, Salvage,
  Utility, Life Support, Manned/Remote Turrets, and an `Other Systems`
  fail-safe).
- `CANONICAL_COMPONENT_CATEGORY_ORDER` — the fixed display order:
  Coolers, Power Plants, Quantum Drives, Shields, and Weapons lead (the
  WO's own required set), the remaining categories follow in the same
  additive pattern.
- `componentCategoryIcon(hp)` itself — Ship Management's Systems table and
  `LoadoutPortTree`'s own per-row icon — is now a one-line composition of
  the key lookup and the icon map, byte-identical behavior to before
  (verified by the existing "SW-007B Rev 2" regression test asserting
  Power Plant still renders `lucide-zap`).

Mission Control's `quartermasterBriefing.ts` imports
`canonicalComponentCategoryLabel`/`CANONICAL_COMPONENT_CATEGORY_ORDER`
directly; its demand-card icon map (`MissionControl.tsx`) is built by
zipping the same order/label/icon exports together — no icon is
independently re-picked for Mission Control's own use, satisfying "no
alternate icons or naming conventions... for the same component systems."

**Design System Amendment.** *Strategic Fleet Manager shall maintain one
component taxonomy across the application. Component systems shall use
the same glyph, ordering, terminology, and semantic meaning regardless of
page. The Commander should learn the visual language once and encounter
it consistently throughout Strategic Fleet Manager. Component glyphs
represent systems, not individual parts.* Future features — Fleet
Dashboard analytics, Decision Center, Manufacturing, Procurement,
Inventory, Analytics, Reporting, Notifications — should import from
`componentCategoryIcon.ts` rather than introducing an alternate grouping.
`commanderSystemTaxonomy.ts`'s `TOP_LEVEL_GROUP_ORDER` remains correct
and unchanged for its own original purpose (port layout sections within
a single ship's Systems Workspace/Loadout Tree) — the two taxonomies
answer different questions and both remain in use, each in its own
domain.

## 23. Canonical Operational State Language (UX-001B.3, Design System Amendment, IMPLEMENTED NOW)

Glyph and color are independent systems that must never compete: **glyph
answers "what system am I looking at," color answers "what is its
operational state."** §22 covers the glyph half (one canonical icon per
component system); this section covers the color half (one canonical
color per operational inventory state) and completes the Quartermaster
Logistics stable-layout behavior.

**Canonical Procurement State Colors.** `Badge.tsx`'s
`procurementRowStateTone()` maps each `ProcurementRowState` to one fixed
tone, reused verbatim everywhere the app shows this state — never a
Mission-Control-only palette:

| State | Tone | Reuses |
|---|---|---|
| Available | `success` (green) | Readiness Green (§4) — ready now. |
| Reserved | `cyan` (Quartermaster Blue) | The exact existing Reserved color: Hangar Inventory's own reserved-quantity cell and `LoadoutPortTree.tsx`'s `logisticsTone()` both already render Reserved in `cyan` — Mission Control's first pass (UX-001B) wrongly reused `success` here instead, reasoning Reserved and Available both read as zero-friction wins. Commander review corrected it: Reserved is owned but committed elsewhere, not immediately deployable the way Available is, and must not share Available's color. |
| Purchase Required | `muted` (white/gray) | `componentAcquisitionHint.ts`'s own established "Purchase Required" tone. |

Two future states are named but not implemented — Craft Required
(purple) and Loot Source (orange) — no unused `Tone` values were added
ahead of actual need; when those states exist, they extend this same
table rather than requiring a redesign.

**Design System Amendment.** *Strategic Fleet Manager shall maintain one
semantic color system for operational inventory states. The same state
shall always use the same color throughout the application. State colors
become part of the user's learned operational vocabulary and shall not
vary between Mission Control, Hangar Inventory, Ship Management,
Procurement, or future Quartermaster modules.*

**Stable Logistics Categories (Deliverable 3/4).** Quartermaster
Logistics' five required demand categories (Coolers, Power Plants,
Quantum Drives, Shields, Weapons —
`CANONICAL_STABLE_CATEGORY_KEYS` in `componentCategoryIcon.ts`) always
render, even at zero outstanding demand, so the layout becomes familiar
through repetition rather than growing/shrinking with fleet state. A
category at zero demand does not disappear — it renders **Complete**:
its `ActionCard` accent switches from Quartermaster Blue to Readiness
Green (`#42E695`, the same green `success` already means everywhere
else), its count becomes a checkmark rather than "0," and a "Complete"
caption replaces the ship-context line. This is the one deliberate
exception to §22's "demand cards carry one neutral accent, not a state
color" rule — Complete is a real operational state (nothing to do here),
just not a severity one. Every other (additive/future) category still
follows the original "only render with real demand" rule — only the
stable five are exempt, so the grid never grows into a wall of empty
cards for systems a fleet has no Mining/Salvage/Turret presence in.

**Console stability (Deliverable 5/6/7, unchanged from UX-001B).**
Selecting a category card filters the Work Queue in place — no route
change, no Hero movement, no column-width shift. State badges remain
informational, never a navigation target; "Needed By" remains the one
hyperlink, carrying the Commander to Ship Management to actually perform
the work. Mission Control identifies work; Ship Management performs it.

## 24. Commander Acceptance Polish — Locked Columns, Actionable-Only Filtering, Dual Assessment States (UX-001B.4, IMPLEMENTED NOW)

The final Mission Control refinement pass before Commander certification.
No architectural change — presentation and workflow refinement only,
completing the console feel §21-§23 established.

**Locked column widths (Deliverable 1).** The Procurement Work Queue
`<table>` uses `table-fixed` with an explicit `<colgroup>` (26% / 18% /
18% / 10% / 28% — Component Name, Size/Type, State, Qty, Needed By),
based on the Quantum Drives category's own natural proportions. Every
category filter reuses the identical widths; only row contents change
when a Logistics Demand card is clicked, never column geometry. Cell
text that would have wrapped under the old auto-layout now truncates
(`truncate` on Component Name, Size/Type, and Needed By) rather than
reflowing the table.

**Actionable-only filtering (Deliverable 2) — superseded by UX-001B.5,
see §25.** UX-001B's own first pass at "actionable inventory only" would
have hidden every Purchase Required row unconditionally; this mission
(UX-001B.4) instead applied the rule per-category, keeping a bare "must
acquire" list visible for a category with no owned inventory at all.
Commander operational testing later reclassified that per-category
exception as procurement planning rather than execution — §25 documents
the unconditional rule that replaced it. Kept here as the historical
record of the intermediate design; `filterActionableWorkQueue()` no
longer behaves as described in this paragraph.

**Dual category assessment states (Deliverable 3/4).** `quartermasterBriefing.ts`'s
`assessCategoryWorkQueue()` classifies a category-filtered Work Queue
into exactly one of three outcomes, and Case A/B must never share a
presentation — this classification function itself is unchanged by
UX-001B.5; only what the Work Queue table renders for `PROCUREMENT_ONLY`
changed (see §25):

| Assessment | Trigger | Presentation |
|---|---|---|
| `ACTIONABLE` | Reserved/Available rows present | Normal table, no banner. |
| `PROCUREMENT_ONLY` (Case A — "No Inventory Available") | Only Purchase Required rows remain | A muted "Quartermaster Assessment" banner. |
| `COMPLETE` (Case B — "Fleet Demand Complete") | No rows at all | The green Quartermaster completion banner. |

Case B reuses the exact completion vocabulary §23 established for a
zero-demand Logistics Demand card (Readiness Green, checkmark glyph,
explicit "Complete" designation) — the same visual language at two
different points in the same operational story, never a competing one.

**End-of-Briefing Action Center (Deliverable 5) — see §11/§26** for the
full three-card breakdown (Loot Lookup / Add Inventory / Modify Ship —
destinations corrected by UX-001C) and the illustration-registry changes
it required.

**Chief Architect's organizing principle**, recorded here because it
governs how future Mission Control sections should be designed: the page
tells one complete operational story, Observe → Decide → Execute.
Everything above the Action Center answers "what is the condition of my
fleet"; the Action Center itself answers "what should I do next." A
future addition to Mission Control should say which of those three beats
it belongs to before it is built.

## 25. Quartermaster Report Consolidation (UX-001B.5, IMPLEMENTED NOW)

The final Quartermaster sprint. No architectural redesign — information
architecture and presentation only, closing out the arc §21-§24 opened.

**Rename (Deliverable 1).** "Quartermaster Logistics" → "Quartermaster
Report" — the title now names what the section actually is: the
Quartermaster's own briefing to the Commander, not a logistics data
panel.

**One reporting surface, not three panels (Deliverable 2).** Logistics
Demand, Quartermaster Assessment, and Procurement Work Queue now live
inside a single `<div className="panel">`, separated by plain `border-t`
dividers rather than separate `.panel` boundaries — read top to bottom as
one document. The Work Queue's table wrapper dropped its own nested
`.panel` styling (now a lighter `rounded-lg border border-white/5`) for
the same reason: a card-within-a-card reads as two things, not one.

**Unconditional actionable-only filtering (Deliverable 3) — the
correction to UX-001B.4.** Commander operational testing drew a hard
line between execution and planning: *"If a component does not
currently exist in inventory, the Commander cannot act on it during
today's operational briefing."* `filterActionableWorkQueue()` simplified
from UX-001B.4's per-category conditional (keep Purchase Required rows
visible for a category with nothing else actionable) to an unconditional
one — Purchase Required rows never render in Mission Control, full stop,
regardless of category state. Procurement planning is explicitly deferred
to a future dedicated tool.

**Contextual assessment, now always present (Deliverable 4).** Because
Purchase Required rows never render, a category (or the whole fleet)
with only Purchase Required demand would otherwise show an empty table
with no explanation — worse than UX-001B.4's own "No Inventory Available"
banner, which at least still showed the bare purchase list. UX-001B.5
keeps the banner and drops the list: the Quartermaster Assessment is now
a permanent, always-rendered part of the report (not a conditional
edge-case banner), reacting to whichever scope is active:

- **Inventory Exists** (`ACTIONABLE`) — *"N inventory assets are
  immediately available to improve fleet readiness[for {category}]."*
  Table renders below it.
- **No Inventory Available** (`PROCUREMENT_ONLY`) — *"There are
  currently no inventory assets available to satisfy the selected target
  loadouts[for {category}]."* No table.
- **Fleet Demand Complete** (`COMPLETE`) — *"All target loadouts
  [for {category}] have been satisfied. Quartermaster Report complete."*
  Green completion treatment, no table.

Critically, `assessCategoryWorkQueue()` itself is called on the
**unfiltered** `WorkQueueRow[]` for the current scope (before
`filterActionableWorkQueue()` strips Purchase Required rows) — this is
the one place Mission Control still looks at Purchase Required rows at
all, purely to distinguish "no inventory, but real demand exists" from
"genuinely nothing outstanding." The Commander never sees a Purchase
Required row; the Assessment text is the only trace that distinction
leaves in the UI.

**Stable filtering and canonical taxonomy (Deliverable 5/6) —
unchanged.** Category selection remains an in-place filter (§21); no
navigation, no panel collapse, no repositioned Hero content. The
canonical component taxonomy (§22) is untouched — Coolers, Power Plants,
Quantum Drives, Shields, Weapons remain the stable five, with the same
additive model for Mining, Salvage, Missile Racks, Utility, and future
systems.

**Mission Control's three-stage operational flow**, the organizing
structure this mission formalized:

1. **Commander Briefing** (the Hero) — Fleet Status, Fleet Readiness,
   Priority Actions, Priority Ships. *What is the condition of my fleet?*
2. **Quartermaster Report** (§21, this section) — Logistics Demand,
   Quartermaster Assessment, Procurement Work Queue. *What can I act on
   today?*
3. **Execute Orders** (§24/§26's End-of-Briefing Action Center) — Loot
   Lookup, Add Inventory, Modify Ship. *What do I do next?*

Observe → Assess → Execute. Chief Architect's framing: this is no longer
a polish pass on a page, it's the rhythm of opening Strategic Fleet
Manager — the same three beats, every session, until the Commander stops
thinking about navigation and starts thinking about the fleet.

## 26. Mission Control Execution Links Correction (UX-001C, IMPLEMENTED NOW)

The final Mission Control sprint — a navigation correction, not a
redesign. Commander acceptance testing found all three End-of-Briefing
Action Center cards (§11/§24) pointing at the wrong, or wrongly-labeled,
destinations.

| Card | Before | After | Why |
|---|---|---|---|
| Loot Lookup | "Loot Lockup" → `/hangar` | "Loot Lookup" → `/decision-center` | The label typo is fixed ("a real component still gets reviewed, not arrested" — Chief Architect), and the destination reverts to Decision Center, where unresolved/recovered/unassigned component decisions actually live. This restores the pre-UX-001B.4 destination; UX-001B.4's own detour through Hangar Inventory is fully undone. |
| Add Inventory | "Add Inventory" → `/quick-update` | "Add Inventory" → `/hangar` | Hangar Inventory is the intended future home of the reusable Add Inventory workflow. Quick Update itself is untouched by this mission — only this one card no longer routes there. |
| Modify Ship | "Modify Ship" → `/ship-workspace` | Unchanged | Already correct. |

**Illustration registry.** `decision-center-found-loot` is reused
unchanged for "Loot Lookup" (it was always Decision Center's own art).
`quick-update-hangar` — UX-001B.4's own id, real art, but now misleadingly
named given this mission's explicit "never route to Quick Update"
directive — is renamed to `hangar-add-inventory`, same asset file, no
new commissioning. `hangar-loot-lockup` (UX-001B.4's id for the retired
Hangar-bound "Loot Lockup" card, never commissioned) is deleted outright —
no remaining consumer. Net: three illustration IDs, not four.

**Regression coverage** (`MissionControl.test.tsx`) explicitly asserts
the negative space this correction closes: the string "Loot Lockup"
never renders anywhere in Mission Control, and no `<a>` on the page
carries `href="/quick-update"` — not just that the three cards route
correctly, but that the two specific mistakes Commander review found are
provably gone, not just superficially relabeled.

With this correction shipped, Mission Control is functionally and
visually complete for Beta 2.0 per Chief Architect certification:
Commander Briefing, Fleet Status, Fleet Readiness, Priority Actions, Top
Priority Ships, Quartermaster Report, and Execution Actions all read as
one coherent operational briefing — Observe → Assess → Execute — with no
further Hero or Quartermaster Report work anticipated before release.

## 27. Quartermaster Release Housekeeping (EWO-058, IMPLEMENTED NOW)

A housekeeping pass, not a feature mission: a sweep of the whole
application for development-era artifacts a Commander could stumble on —
placeholder text, abandoned labels, prototype wording, stale internal
process references — with no new features, redesign, layout changes,
component refactors, or architecture changes in scope.

**Findings and fixes:**

- **Mission Control's "Update Budget" footer (§9/§10)** — an orphaned
  single line, left behind once CWO-005 relocated the rest of the
  footer's original content elsewhere, with no remaining operational
  meaning. Removed outright; Mission Control's cadence (§1) now ends at
  the End-of-Briefing Action Center.
- **Fleet Roadmap's Vision card** — read "well past Sprint 1 scope," an
  internal development-process term ("Sprint") leaking into Commander-
  facing copy on a page about the in-universe fleet, not the engineering
  process building it. Reworded to "a distant future goal, well beyond
  current fleet priorities."

**Reviewed and confirmed already correct, no action taken:** the
"Prototype" badge on Ship Management (retired earlier, by SW-013B — see
§19); `ShipWorkspacePrototype` as a source-level module name (never
rendered to a Commander, and renaming it would be a component refactor,
explicitly out of this mission's scope); the Developer Mode toggle on
Ship Management (a deliberate, permanently-gated diagnostic feature, off
by default, not a leftover); the `VITE_SFM_DEV_SEED_FLEET` local-dev seed
flag (gated behind an explicit, gitignored, opt-in environment variable —
never on for a real Commander); and the `APP_VERSION` "Beta 1.2" label
(a genuine, actively-maintained version identity, not placeholder text).

No layout, component, or architectural change accompanied this mission —
every fix above is a content-only correction or removal.

## 28. Fleet Dashboard — RSI Role Filter Repair & Collapsible Quick Filters (EWO-059, IMPLEMENTED NOW)

Fleet Dashboard sits outside this document's primary Mission Control/
app-shell scope (see §1's framing), but this mission's disclosure pattern
is recorded here as a reusable standard for any future filter-heavy list
page, alongside the bug fix itself.

**Part A — root cause.** The RSI Role filter read
`shipDefinitionById.get(ship.id)` directly. `Ship.id` is a FleetAsset
*instance* id — for any ship materialized through "Add Ship"
(`fleetAssetMaterializer.ts`), that id carries a generated
`${shipDefinitionId}-asset-<suffix>` form, never the bare ShipDefinition
id itself. The lookup only ever worked by coincidence for the original
seed fleet (whose Ship record kept its bare seed id for backward
compatibility while its FleetAsset carries the id normally). Fixed by
resolving through the same `resolveShipDefinitionId` indirection every
other per-ship lookup in `src/utils/shipIdentityLine.ts` already uses,
exposed as `resolveShipRsiRoles(shipId, fleetAssets)`.

**Part B — collapsible Quick Filters.** Fleet Dashboard's four
independent filter dimensions (Ownership/RSI Role/Manufacturer/Readiness,
§EWO-053) are unchanged in behavior, but now start collapsed behind one
compact toolbar: a "Filters" disclosure toggle, an active-filter summary
(one removable chip per active dimension, or "All ships" when none are
active), and a "Clear Filters" action. Expanding reveals the exact same
matrix that always existed, directly below the toolbar — a pure
disclosure, never a redesign of the filtering system itself. Collapsing
never clears a selection; the summary chips and filtered results both
survive it. A filter combination that legitimately excludes every ship
renders an intentional empty state ("No ships match these filters." / a
recovery instruction / a Clear Filters action) rather than a blank
results area, distinguishing "a working filter with no matches" from
a broken page — the same principle Mission Control's own zero-result
states (§21/§25) already establish for the Quartermaster Report.

## 29. Fleet Dashboard Table Cleanup & Ship Workspace → Ship Management Rename (EWO-060, IMPLEMENTED NOW)

**Part A — dead columns removed.** Fleet Dashboard's Table view dropped
its Career and Role columns (low-value, near-duplicate of information
already visible elsewhere) and redistributes the reclaimed width via an
explicit `<colgroup>` — the same locked-column-width pattern Mission
Control's own Procurement Work Queue table already established (§21) —
rather than leaving it to browser auto-layout. Remaining columns, in
order: Ship, Ownership, Active Loadout, Loadout Progress, Missing Items,
Action. No replacement columns were introduced.

**Part B — table action renamed.** The per-row action link reads "Manage
Ship" (was "Ship Workspace"); its destination (`/ship-workspace/:shipId`)
is unchanged.

**Part C — the terminology rename.** "Ship Workspace" is retired from
every Commander-facing surface in favor of **Ship Management** (the
navigation/page name) and **Manage Ship** (the action link/button
verb) — the Sidebar nav item, the page's own header (read "Ship
Management" as its `<h1>` since SW-013B; EWO-061/§30 later moved that
exact text into the header's small section label instead, as part of
standardizing the header pattern itself — the name is unchanged, only
which line of the header carries it), and every cross-link into the
page (Loadout Manager's "View in Ship Management," Mission Control's
Needed By hyperlinks, the Quartermaster Report's Execute Orders card).
Per the same Internal Naming Policy EWO-058 established ("user-facing
terminology is product, internal naming is architecture"), the
`/ship-workspace` route, the `ShipWorkspacePrototype` component/module
name, and every internal comment referencing the historical "Ship
Workspace Promotion" (SW-013B) decision are deliberately left alone —
renaming them would be churn with no Commander-facing benefit. The
separate, unrelated Ship Detail page is untouched.

## 30. Operational Header Standard (EWO-061, Design System Amendment, IMPLEMENTED NOW)

**One approved header pattern, now used by every operational page**
(Mission Control, Fleet Dashboard, Decision Center, Hangar Inventory,
Ship Management, Captain's Log, Quick Update, Loadout Manager, Fleet
Roadmap, Ship Detail):

```tsx
<div>
  <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">{Section Label}</p>
  <h1 className="text-2xl font-display font-bold text-white">{Operational Title}</h1>
</div>
```

Two lines, nothing more. The **section label** is small, uppercase,
cyan, and matches the page's own Sidebar nav item verbatim (never a
different string) — it identifies *where the Commander is*. The
**operational title** is the one large `<h1>`, always phrased as a short
Commander-voice question or statement of purpose (never a restatement of
the label) — it identifies *what this screen is for* ("Should I keep
this?", "What do I own?", "Which ship needs attention?", "What
happened?", "Is this ship ready?", "What changed?", "How do I configure
this ship?", "What does this ship need?", "Where is the fleet headed?").
A page may place other elements (Add/action buttons, view toggles, Ship
Selection) beside this block in the same flex row — HangarInventory and
Fleet Dashboard already did this before this mission — but never a third
line of body text inside the header block itself.

**What changed to reach this state:**

- **Mission Control** previously inverted the pattern (large uppercase
  `<h1>Mission Control</h1>` first, a smaller "Fleet Operations" tagline
  second, its own distinct sizing/tracking) — reordered and retyped to
  match exactly. Both strings are unchanged; "Mission Control" is now the
  section label and "Fleet Operations" is now the operational title.
- **Ship Management** had no section label at all — its `<h1>` carried
  the page name itself ("Ship Management") followed by a functional-
  description paragraph. It now carries a "Ship Management" label (same
  text, demoted to its standard position) and a new operational title,
  "What does this ship need?", in the same Commander-voice-question style
  every other page already used. See §29's Part C note on this.
- **Decision Center, Quick Update, Loadout Manager, and Fleet Roadmap**
  each had a third-line descriptive/reassurance paragraph explaining how
  the page works — all four are removed. Every one of these pages already
  communicates its purpose through its own primary action (a search
  field, a form, a selector, a set of cards) immediately below the
  header; retaining explanatory header copy duplicated what the
  interface itself already shows, which conflicts with the same
  philosophy Mission Control's own header has held since EWO-011 ("the
  interface explains itself; no instructional copy") — this mission
  extends that discipline app-wide rather than leaving it unique to one
  page.
- **Fleet Dashboard, Hangar Inventory, Captain's Log, and Ship Detail**
  already matched the approved pattern exactly and needed no change —
  they are the pages this standard was extracted from.

No navigation, routing, or page content below the header changed as part
of this mission.

## 31. Quartermaster Bay Empty-State (EWO-062, IMPLEMENTED NOW)

Ship Management's `ship-operational-banner` panel — the first thing a
Commander sees before selecting a ship — previously showed a generic
callout (icon, "Select a Ship," a one-line instruction). It now shows the
first piece of environmental artwork this codebase treats as part of the
*application* rather than the *brand shell* (distinct from Mission
Control's Operations Wall / `EnvironmentAssets`, which are whole-page
ambient washes, not a bounded panel illustration):

```tsx
<div className="relative h-44 sm:h-56 overflow-hidden">
  <img src={quartermasterBayEmptySrc} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
  <div className="absolute inset-0 bg-black/50" />
  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
    <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Maintenance Bay Ready</p>
    <h2 className="text-2xl font-display font-bold text-white">Select a ship above to begin management.</h2>
  </div>
</div>
```

**Registry.** `src/config/assets/shipManagementAssets.ts` — a new,
dedicated `ShipManagementIllustrationId` registry (`quartermaster-bay-
empty` | `ship-management-active` | `ship-management-engineering`),
sibling to `WorkflowIllustrationId` (Mission Control's card art) and
`EnvironmentId` (whole-page washes) rather than reusing either — this is
a bounded, full-cover hero illustration inside one specific panel, the
same visual contract `ShipHeroFrame`'s own hero region already uses.
Artwork delivered under `public/assets/environments/ship-management/`.
Only `quartermaster-bay-empty` is enabled this mission; `ship-management-
active` (a ship selected) and `ship-management-engineering` (a future
engineering-focused lens) have real files already delivered as part of
the same set but are deliberately left disabled/unwired — reserved for
the future Ship Management Header redesign this empty state explicitly
anticipates, per this mission's own Commander framing ("the artwork
remains visible until the Ship Management Header redesign replaces this
section in the future").

**No layout shift on selection.** The empty state's hero region was
originally sized `h-44 sm:h-56`, matching `ShipHeroFrame`'s own hero
*image* region alone — corrected by EWO-062A (§32) to match the
selected-ship header's actual full rendered footprint instead (image
region plus, for a fallback/no-photo ship, its metadata band), since
that combined footprint is what a Commander actually sees change size
underneath them. Overlay content is exactly the standardized EWO-061
label/title pair (§30) and nothing else — no icon, no description, no
controls, no buttons.

## 32. Ship Management Hero Alignment & Navigation Retirement (EWO-062A, IMPLEMENTED NOW)

**Part A — hero footprint corrected.** §31's empty-state hero is resized
from `h-44 sm:h-56` to `h-44 sm:h-[343px]` — a single named constant,
`SHIP_MANAGEMENT_HERO_HEIGHT_CLASS` (`ShipWorkspacePrototype.tsx`), used
at the one call site so the value can't silently drift out of sync with
itself again. 343px matches the selected-ship header's own measured
rendered footprint at the 1320px-wide reference desktop viewport — for a
ship whose image resolves to `ShipHeroFrame`'s fallback ("Data Link
Pending") presentation, that's the hero image region (`h-44 sm:h-56`)
*plus* the fallback metadata band beneath it, not the image region
alone, which is what the original EWO-062 h-56 (224px) value had
matched. `ShipHeroFrame` itself is unchanged — this mission updates only
the empty state's own container to match it, not the other way around.
Width, border radius, outer spacing, and container alignment were
already shared automatically (both states are children of the same
`data-testid="ship-operational-banner"` `.panel` element) and needed no
change. Known limitation, disclosed rather than silently glossed over:
because `ShipHeroFrame`'s real rendered height still varies by ship
(224px for a ship with real photography and no metadata band, ~343px for
one on fallback artwork), the empty state's fixed 343px only achieves
*true* zero layout shift against the fallback case the Chief Architect
measured — selecting a ship with real photography still changes height
by the same amount it always did. Fixing that fully would mean changing
`ShipHeroFrame`'s own rendered height, which this mission's scope
explicitly excludes ("Ship Header redesign").

**Part B — Navigation Retirement.** The Sidebar (`Sidebar.tsx`) drops
Loadout Manager, Quick Update, and Ship Detail from `navItems` — three
fewer primary destinations, not three deleted features. Every route
(`/loadout-manager`, `/quick-update`, `/ship`, `/ship/:shipId`) and page
component in `App.tsx` is untouched and still reachable by direct URL,
deep link, or regression test; only their Sidebar presence is gone.
`navItems` is a flat array rendered by one `.map()` with no separator
elements between entries, so removing three entries closed the gap
automatically — no dedicated "remove the divider" step existed to do.
One existing regression test (`navigationFlow.test.tsx`) had relied on
the now-retired Sidebar "Loadout Manager" link as its only way to reach
that page — rewritten to simulate a direct URL visit instead (a
`cleanup()` + fresh `render()` at `/loadout-manager?shipId=...`), which
this mission's own "preserve current behavior when an old route is
reached directly" guarantee explicitly keeps working; Zustand store
state lives at module scope, not the React tree, so this still
genuinely proves data persists across the hop.

**Part C — developer/legacy controls removed from the Commander
experience.** Ship Management's Developer Mode toggle now renders only
when `DEV_SEED_FLEET_ENABLED` is true (exported from `useFleetStore.ts`,
the same flag §27 already established for gating the demo fleet) — not
`import.meta.env.DEV`, because the packaged Beta launcher ("Start
Strategic Fleet Manager.bat") runs `npm run dev`, so `import.meta.env.DEV`
alone is true for a real Commander too and would not have hidden
anything (see that flag's own doc comment). This is a real conditional
render, not a disabled/dimmed button — a Commander session never mounts
it. "View in Ship Detail" is removed outright (not gated) — SW-013B's
original "Preserve Legacy Access" rationale for that link is superseded
by this mission; the legacy Ship Detail page remains reachable, just no
longer advertised from Ship Management.

**Part D — header control group.** With both controls gone, the
upper-right group contains only the Ship selector ("SHIP [Select a
ship…]"). No extra rebalancing markup was needed — the group's existing
`flex items-center gap-3` wrapper collapses naturally to a single child
in the ordinary Commander case (Developer Mode still occupies its slot
correctly on the rare local-developer session where the flag is on).

## 33. Hero State Synchronization (EWO-063, IMPLEMENTED NOW)

**Audit finding, disclosed rather than silently assumed away:** targeted
live browser reproduction (rapid switching between ships with genuinely
differing readiness — a Factory-only 100%-ready ship and one with a real
unresolved target; a ship with real photography and one without) and a
full static read of every `useMemo`/`useEffect`/`useState` in
`ShipWorkspacePrototype.tsx` found Readiness %, Missing Components,
Decision Summary, and the image-presentation mode all already
recalculating correctly and immediately on every ship switch — none of
this page's Hero-relevant values (`activeProgress`, `missingSummary`,
`decisionCount`, `prioritizedDecisions`, `actionableDecisions`) are
memoized against a dependency array at all; they are plain `const`s
recomputed fresh on every render, and `ship` itself is `ships.find((s)
=> s.id === shipId)` recomputed fresh from `useParams()` on every
render — there is no `useFleetStore.getState()` snapshot read and no
module-level cache anywhere in the Hero's own data path. No reproducible
staleness was found.

Two hardening changes were made anyway, directly answering this
mission's own stated concern, as defense-in-depth rather than a fix to
an observed defect:

- **`<ShipHeroFrame key={ship.id} .../>`** — forces React to fully
  unmount/remount `ShipHeroFrame` (and its child `ShipImage`) on every
  ship change, rather than reusing the same component instance. This is
  the one piece of Hero-adjacent state that lives inside a child
  component (`ShipHeroFrame`'s own `mode`, `ShipImage`'s own load/
  fallback `state`) rather than being derived fresh on every
  `ShipWorkspacePrototype` render; a `key` change is the idiomatic React
  guarantee that no such internal state can ever leak from one ship to
  the next, regardless of prop-driven `useEffect` timing.
- **A single consolidated per-ship reset effect** (`[shipId]`) for the
  Change Installed Components row-level UI state
  (`expandedInstallRowId`, `installNotice`, `reassignConfirmKey`,
  `borrowConfirmKey`, `newComponentFormHpId`/`newComponentSelection`,
  `inspectedConfigurableSlotId`) that had no explicit per-ship reset
  before. Each is keyed by a build-scoped Hardpoint/candidate id, so a
  stale key already harmlessly matched nothing on a different ship's own
  hardpoint set — but an orphaned "still open" disclosure is stale UI
  state a Commander never asked to carry across a ship switch, and this
  mission's own bar is "no Commander action required," not merely "no
  visible wrong data." Joins the existing per-ship resets this file
  already had for `reviewedBuildId`, `expandedGroups`, and the New
  Loadout form.

Regression coverage locks in what the audit already found true: rapid
repeated switching between a 100%-ready ship and one with a real
Missing gap never shows stale Readiness/Missing/Decision Summary data,
and the Hero image `<img>` genuinely changes (not just its wrapping
layout) on every switch — via the same live `navigate()` route-param
transition a real Commander's dropdown triggers, never a fresh
`render()` per ship (which would trivially mask a genuine
client-navigation-only bug, the same principle §32's Part B navigation
test already documents).

## 34. ShipManagementSummary — One Authoritative Calculation (EWO-063 v2, IMPLEMENTED NOW)

A Commander-reported follow-up to §33: a screenshot showed the Hero and
the Systems Workspace table appearing to disagree. Re-investigation
(Part B) found no cached/stale object anywhere in the derivation layer —
every Hero-relevant value was already a fresh `const` recomputed every
render — but did confirm the real, by-design split §33 already
documents: the Hero always reflects the ship's **Active** Loadout, while
the Systems Workspace tables reflect whichever Loadout the Commander is
currently **Reviewing** ("the ship never changes, only the tools
change" — SW-002's own founding principle, unchanged by this mission).
When Active and Reviewed differ, a screenshot comparing the two can read
as a bug even though it's the intended design. Regardless of that
finding, five independent hand-maintained expressions computing from the
same hardpoint set — real duplication risk even without a proven active
defect — is exactly what this mission's Part C asks to eliminate.

**`src/utils/shipManagementSummary.ts`** — the one authoritative
calculation. `buildShipManagementSummary(hardpoints, context)` returns a
single `ShipManagementSummary`: Readiness (`progress`, `buildState`),
Missing Components (`missingSummary`), Decision Summary
(`decisionHardpoints`/`decisionCount`/`prioritizedDecisions`/
`actionableDecisions`/`actionableCount`/`hasNonActionableGaps`), and two
precomputed per-hardpoint maps — `hintByHardpointId` (acquisition hint,
every non-structural hardpoint) and `availabilityByHardpointId`
(inventory availability, every non-structural hardpoint's own saved
target) — so notification icons (the Priority Components strip) and
Availability badges (Change Installed Components) look up a value
instead of each independently calling `describeAcquisitionHint`/
`calculateComponentAvailability` a second (or third, or fourth) time for
the same hardpoint. `criticalHardpointsInPriorityOrder` (previously
defined in `ShipWorkspacePrototype.tsx`, re-exported unchanged from
there for existing test imports) moved here too, as the pure derivation
it always was.

**One principled exception, not a gap.** Manage Loadout's New Target
column shows availability for a live, unsaved, per-keystroke pending
edit (`desiredTargets`) — that value doesn't exist until the Commander
starts typing, so it cannot come from a summary computed once per
render pass over saved hardpoint data. It keeps its own inline
`calculateComponentAvailability` call against the pending value. This is
ephemeral UI-editing feedback, not part of the ship's own summary — the
one case "one calculation" deliberately doesn't reach into.

**Active vs Reviewed, preserved, not collapsed.** `ShipWorkspacePrototype`
computes `activeSummary = buildShipManagementSummary(activeHardpoints,
...)` unconditionally (powers the Hero, Decision Summary, and the
Priority Components strip) and `reviewedSummary` — literally the *same
object* when the Reviewed Loadout is the Active one (the common case,
zero extra computation), or a second `buildShipManagementSummary` call
against `reviewedHardpoints` only when the Commander is genuinely
reviewing a different Loadout (powers the Systems Workspace tables'
Availability badges and hint disclosures). Same function, same logic,
different input for a legitimate different purpose — "one calculation,"
not "one input everywhere," since collapsing Active and Reviewed into a
single concept would be a materially different, much larger change than
this mission asked for (and would contradict SW-002's own founding
design this document has recorded since §19).

Regression coverage: a dedicated unit-test suite for
`buildShipManagementSummary` itself (readiness/missing/decision/hint/
availability correctness against constructed fixtures), plus an
integration test proving Part A/B directly — removing an installed
component via the real Change Installed Components UI immediately
updates the Hero's own rendered Readiness % and Missing Components text,
with no separate refresh action, because Hero and Table now derive from
the same one calculation by construction.

## 35. Commander Operations Panel — Hero Refactor (EWO-064, IMPLEMENTED NOW)

**Governing principle, layered on top of SW-002/§34's Active-vs-Reviewed
split: "Sticky Header owns context, Hero owns action."** The Sticky
Context Bar (`data-testid="sticky-context-bar"`, pre-existing, unchanged
by this mission) is the single owner of Ship / Reviewed Loadout /
Current Intent / Pending Changes. The Hero owns Operational Readiness,
Immediate Actions, Priority Components, and the Decision Summary — no
contextual duplication between them.

**Part F — the Hero now reflects Reviewed, not merely Active.**
§34 deliberately preserved Active-vs-Reviewed as two separate summary
objects (`activeSummary` powering the Hero, `reviewedSummary` powering
the Systems Workspace tables) and flagged that choice explicitly as a
judgment call the Commander could reverse. EWO-064 reverses it for the
Hero specifically: `ShipHeroFrame`, the Priority Components strip, and
the Decision Summary panel now all read `reviewedSummary` — the same
object the Systems Workspace tables already used. This is a
**presentation** change, not an **architecture** change (Part H): the
underlying Active/Reviewed data model, the Loadout pill selector, and
the Sticky Context Bar are byte-for-byte unchanged — only which of the
two already-computed `ShipManagementSummary` objects feeds the Hero
moved. Because the Sticky Context Bar already names which Loadout is
Reviewed, the Hero switching to match it removes the exact
screenshot-reads-as-a-bug ambiguity §34 diagnosed, rather than papering
over it.

**Part C — the Decision Summary's "no decisions" state is now
genuinely empty-only.** Previously `ShipManagementSummary` additionally
tracked `actionableDecisions`/`actionableCount`/`hasNonActionableGaps`,
and any hardpoint whose only acquisition path was "Purchase Required"
(not yet owned) was excluded from the Decision Summary entirely,
falling back to a "No Immediate Actions" placeholder even when real
readiness gaps existed. That three-state model (Immediate Decisions /
No Immediate Actions / No Immediate Decisions) is retired. Every
Missing or Upgrade Available hardpoint is now a real decision,
regardless of acquisition tier — recording an acquisition plan for a
not-yet-owned component is itself a Commander action now, surfaced as
"Record {item}" with a "Purchase Required" badge. "No Immediate
Decisions" renders only when `decisionCount === 0` — the genuinely
empty case. `Upgrade Available` hardpoints (a real, non-factory
component installed but differing from Target) are newly included in
`criticalHardpointsInPriorityOrder` alongside `Missing` — they already
counted against readiness % and appeared in the "Missing: …" summary
text, but were previously invisible to every decision-facing surface.

**Acquisition priority order, reordered (Part C/G).** Within the
Missing/Upgrade Available tier, decisions now rank Reserved-elsewhere
(`warning` — resolving an existing commitment via reassignment) >
Available Inventory (`success` — genuinely free stock, including stock
already reserved for this exact port) > Borrow Available (`cyan`) >
Purchase Required (`muted`, no longer excluded). `acquisitionRank` in
`shipManagementSummary.ts` encodes this order; Invalid Target rows
still sort ahead of all of it, unchanged.

**Part D — the Priority Components strip is restored and reactive.**
Each entry now renders the canonical `componentCategoryIcon(hp)` glyph
(the same Cooler/PowerPlant/QuantumDrive/Shield/Weapon taxonomy §22
established for Mission Control's Quartermaster Report and already used
in the Systems Workspace table rows) plus an acquisition-tone `Badge`
underneath, both driven by `reviewedSummary.prioritizedDecisions` /
`hintByHardpointId` — no separate calculation, no generic `Package`
placeholder icon.

**Part E — `buildShipManagementSummary()` remains the single engine,**
now with a narrower interface: `actionableDecisions`/`actionableCount`/
`hasNonActionableGaps` are removed (every decision is actionable now, so
the distinction no longer exists); `decisionCount`/`prioritizedDecisions`
carry the full ordered set the Hero, Decision Summary, and Priority
Strip all read directly.

**Part G — Change Installed Components' disclosure reordered** to the
Commander-approved priority: Reserved Target Component (resolving an
existing commitment) → Available Inventory Target Component → a new
**Compatible Upgrade Opportunity** informational callout (renders only
when the row's own status is `Upgrade Available` — names what's already
happening on that row; the tiers around it still resolve how to source
the Target) → Record Newly Acquired Component → **Borrow From Another
Ship** (collapsed by default, `borrowSectionOpen`) → **Remaining
Compatible Components** (collapsed by default, `remainingSectionOpen`).
Both collapse toggles reset on ship switch and whenever a different
row's own disclosure opens, matching the existing per-ship/per-row reset
discipline §33 established.

Regression coverage: `shipManagementSummary.test.ts` rewritten for the
new interface and acquisition order (including a dedicated
Reserved-elsewhere > Available > Borrow > Purchase-Required priority
fixture, and an Upgrade Available inclusion test); the
`ShipWorkspacePrototype.test.tsx` and `sw014aInlineInstalledComponent
Workflow.test.tsx` suites updated everywhere they asserted the retired
three-state Decision Summary model, the old exclusion of Purchase
Required/Upgrade Available, or the pre-collapse Borrow/Remaining
disclosure text — all rewritten to assert this mission's intended
behavior rather than defensively preserved against it. Full project
regression (`tsc --noEmit`, 181 test files / 2197 tests) and a
production build both pass clean.

## 36. Hero Intelligence & Completion Reward (EWO-065, IMPLEMENTED NOW)

Refines §35's Hero into three things at once: a Ship Settings entry
point, a compact category-level demand report, and a completion
ceremony — without adding clutter. Governing principle, extending §35's
"Sticky Header owns context, Hero owns action": **Hero owns action and
accomplishment.**

**Part A — Ship Settings replaces the manufacturer plate.** The
manufacturer abbreviation badge in the Hero image's top-left corner is
retired in favor of a Ship Settings control (`ShipHeroFrame`'s new
`onOpenSettings` prop) that opens the existing `EditFleetAssetModal`
verbatim — this mission establishes the access point only, not a modal
redesign. The manufacturer name itself is unaffected; it already lives
on the identity subtitle line beneath. Scoped to Ship Management only:
`onOpenSettings` is opt-in, so Ship Detail/ImportedShipDetail (the
other two `ShipHeroFrame` consumers) keep the original manufacturer
badge unchanged — this mission's objective and every Part explicitly
names the Ship Management Hero, never those other pages.

**Part B/D — Category Demand Cards replace the per-component Priority
Strip.** §35's Priority Components strip (one small tile per missing
component) is retired in favor of compact category-level cards —
glyph, outstanding count, category label — reusing
`componentCategoryIcon.ts`'s canonical taxonomy/order/icon verbatim
(the same resolver Mission Control's Quartermaster Report already
uses), never a second classification table. `buildCategoryDemand()` in
`shipManagementSummary.ts` aggregates `decisionHardpoints` (the same
authoritative set already backing the Decision Summary — Part D) by
`canonicalComponentCategoryKey`, so a component cannot appear under
different categories on different pages. Demand-driven visibility only
(unlike the Quartermaster Report's stable-5-always-visible rule) — a
category with zero outstanding targets renders no card at all, so this
region collapses to nothing (no reserved empty height) as gaps clear.

**Part C — Missing text keeps exact names, gains an inline View All.**
The "Missing: …" text is retained (precise, actionable detail) but now
caps at `MISSING_SUMMARY_VISIBLE_LIMIT` (6) names before appending a
plain inline text link — never a tile, badge, or icon — that scrolls to
Ship Systems via the same `scrollToSystemsWorkspace` handler §35's old
strip button used. Absent whenever every name already fits or nothing
is outstanding.

**Part E/F — the Quartermaster Completion Seal.** `shipManagementSummary
.ts` adds `isFullyCompletedCustomLoadout`, true only when ALL of: the
reviewed Build is real custom (`kind !== 'FACTORY'`), it defines at
least one real target (`progress.requiredAssignments > 0`), and every
target is satisfied (`decisionCount === 0`, `percentage === 100`). The
middle condition is the one genuinely new rule this mission adds:
`deriveFleetBuildState`'s own `MISSION_READY` state (§33's old
`isMissionReady` prop) already excludes Factory, but its underlying
`progress.isComplete` treats zero required assignments as trivially
complete — without the explicit `requiredAssignments > 0` check, an
entirely empty/undefined custom Build would silently earn the seal
purely from having no targets at all, exactly the false positive Part E
names. `ShipHeroFrame` gets a new `quartermasterSeal` prop (headline +
detail medallion block, `data-testid="quartermaster-completion-seal"`)
that renders instead of (never alongside) the old `isMissionReady`
placeholder icon — opt-in, Ship Management only, same reasoning as
Part A's `onOpenSettings`.

**Part G — natural compaction, not a separate collapsed layout.** No
dedicated "completed" branch was written for the Hero: `categoryDemand`
is already empty (nothing renders) and the Missing text is already
absent whenever `decisionCount === 0` — the exact condition that also
grants the Seal. The Hero compacts to readiness bar + Decision Summary
("No Immediate Decisions") + the Seal purely as a consequence of the
existing conditional rendering already in place, never a second
"completed Hero" code path to keep in sync with the normal one.

**Part H — unchanged.** Category cards remain informational only,
never a click target and never a duplicate of the Decision Summary's
own per-item action list — confirmed by inspection; nothing in Parts
B/C/D introduces an `onClick` on a card.

Regression coverage: `shipManagementSummary.test.ts` gains dedicated
`categoryDemand` (aggregation, canonical order, zero-omission) and
`isFullyCompletedCustomLoadout` (true/false across Factory-at-100%,
empty-custom-Build, real-gap-remaining, and no-Build-at-all cases)
suites. `ShipHeroFrame.test.tsx` gains coverage for both new opt-in
props alongside their unaffected defaults. `ShipWorkspacePrototype
.test.tsx` gains a dedicated EWO-065 describe block (Ship Settings
control, manufacturer plate absence, Completion Seal presence/absence
across Corsair's real finished custom Build vs 135c's Factory-only
100% vs Ghost's incomplete custom Build, seal removal on switching
ships and on removing a required installed component) plus every prior
test that referenced the retired `priority-components-strip` testid
rewritten against `category-demand-cards`. Full project regression
(`tsc --noEmit`, 181 test files / 2217 tests) and a production build
both pass clean.

## 37. Hero Palette Alignment & Certification Polish (EWO-065A, IMPLEMENTED NOW)

Visual polish only (per this mission's own explicit "no business logic
or workflow behavior changes" constraint) — §36's Category Demand
Cards, Decision Summary, and Quartermaster Completion Seal all keep
their exact prior data/behavior, restyled to match the semantic palette
rule below.

**The semantic palette rule** (Part D — the canonical reference this
mission establishes; every future color choice on an operational
surface should map to one of these five, not invent a sixth):

| Color | Meaning |
|---|---|
| **Cyan** (`cyan`) | Operational information, navigation, structure — "where and what." |
| **Green** (`success`) | Satisfied, available, complete — "this is done." |
| **Quartermaster Gold** (`gold`) | Recommended action, procurement intelligence, certification — "the Quartermaster suggests/recognizes this." |
| **Yellow** (`warning`, "Caution Yellow") | An unsafe or attention-worthy condition — never used interchangeably with Gold, even though both read as "amber" at a glance. |
| **Red** (`danger`) | Critical failure or a missing requirement. |

**Part A — Category Demand Cards now visually belong to the Mission
Control Quartermaster Report family.** Restyled from a bare `bg-black/20
border border-white/10` tile to the `panel` surface (the same dark
operational card background/border every `ActionCard` — Mission
Control's own Quartermaster Report cards — already uses) plus a
`border-l-[3px] border-l-cyan` accent edge, a cyan-tinted icon housing,
and a bumped-up `text-lg` cyan count over a `text-[10px]` muted label —
proportionally smaller than `ActionCard`'s own `w-8 h-8`/`text-xl`
scale, not a literal reuse of that component, since these cards are
always non-interactive here (no hover treatment) unlike Mission
Control's clickable category filters. Cyan only, on every card,
regardless of category — color communicates "this is an operational
demand card," never which category, matching Part A's explicit "do not
introduce category-specific colors."

**Part B — a non-zero Decision Summary reads in Quartermaster Gold.**
Previously `warning` (Caution Yellow) for both the container accent and
the callout icon, with the count/label text always plain white. Now
`gold` throughout the non-zero state (container background/border,
`AlertTriangle` icon, and the count/label text itself) — a Decision
Summary is the Quartermaster recommending an action (install/reassign/
borrow/record), not warning of an unsafe condition, so it never shares
Caution Yellow's color. The genuinely-empty "No Immediate Decisions"
state is untouched — still the calm green `CheckCircle2` treatment §35
established.

**Part C — the Quartermaster Certification Card's border and label are
gold; its glyph stays green.** The seal's border/background (previously
`border-success/40`, plain dark background) is now `border-gold/50`
with a soft gold ambient glow (`shadow-[0_0_16px_rgba(201,162,39,0.3)]`)
— recognition and certification, not the "this specific thing is
satisfied" meaning green already carries elsewhere on the same block.
The `QUARTERMASTER CERTIFIED` headline is `text-gold`; the `ShieldCheck`
glyph itself deliberately stays `text-success` green — two colors,
two meanings, on the same card (gold = "the Quartermaster certifies
this," green = "and it's complete"). Supporting text is now exactly
`{Ship Name} — {Reviewed Loadout Name}` (e.g. "Corsair — Gunship
Build") — the "· Mission Ready" suffix is removed (readiness is
already conveyed by the 100% bar, the green glyph, and "No Immediate
Decisions," so restating it here was redundant), and no ownership/
manufacturer/role is ever added (those already live on the identity
subtitle line above). `truncate` plus the existing `title` attribute
(unchanged from §36) keep a long combination on one line without
overflowing the card, with the full value still reachable via tooltip.

**Part D — token, not a refactor.** `gold` (`#C9A227`) already existed
(tailwind.config.js, first authorized by EWO-014 for the sidebar
slogan's "Outfit" word) — no new token was created. Its own doc comment
is widened from "restricted... narrowly-scoped... do not use as a
general accent" to name the two authorized uses this mission adds
(Decision Summary callout, Certification Seal), while still explicitly
not becoming a general-purpose accent. No other color values changed;
no broad palette audit was performed, per this mission's own explicit
scope boundary.

Regression coverage: `ShipHeroFrame.test.tsx` gains a dedicated
gold-border/gold-label/green-glyph assertion for `quartermasterSeal`.
`ShipWorkspacePrototype.test.tsx` gains an EWO-065A describe block
covering the category cards' `panel`/`border-l-cyan` family styling and
cyan count prominence, the Decision Summary's gold-vs-untouched-green
split across a non-zero (Ghost) and genuinely-empty (Corsair) case, and
the Certification Card's gold border/label with green glyph plus the
exact supporting-text content (no "Mission Ready," ownership,
manufacturer, or role). Full project regression (`tsc --noEmit`, full
test suite) and a production build both pass clean.

## 38. Actionable Decision Qualification (EWO-065B, IMPLEMENTED NOW)

A logic correction, explicitly reversing EWO-064 (Part C)'s own choice
to include Purchase Required gaps in the Decision Summary. Restores the
distinction SW-002 Revision C originally established and this mission's
own framing states directly: **Missing tells the Commander what the
build lacks. Immediate Decisions tells them what they can do about it
right now.** A target that exists only in the catalog and must still be
obtained is real, trackable demand — but it is not something the
Commander can act on this instant, so it no longer belongs in the
Hero's own actionable list.

**Qualification rule.** A Missing/Upgrade Available gap qualifies as an
Immediate Decision only when its acquisition hint tone is NOT `'muted'`
(Purchase Required) — i.e. the exact target is reserved for this build,
genuinely available in inventory, or borrowable from another ship. An
Invalid Target row is unconditionally actionable regardless of any
acquisition hint — resolving one is always immediate (pick a different,
compatible target), never an inventory problem.

**`shipManagementSummary.ts` — two collections, two purposes.**
`decisionHardpoints`/`decisionCount`/`prioritizedDecisions` are
unchanged: the FULL unresolved-demand set (including Purchase
Required), still the sole source for `missingSummary` and
`categoryDemand` — Missing text and the Category Demand Cards continue
to reflect every real gap, exactly as §36 established. New
`actionableDecisions`/`actionableCount` filter that same ordered list
down to the genuinely-actionable subset described above; the Hero's own
Decision Summary panel reads ONLY these two fields now, never
`decisionCount`/`prioritizedDecisions` directly. `isFullyCompletedCustomLoadout`
(§36, Part E) deliberately keeps checking `decisionCount === 0`, not
`actionableCount === 0` — a ship with only Purchase-Required gaps has
zero actionable items but is very much NOT complete, and must not earn
the Quartermaster Completion Seal.

**Record New Component stays a workflow entry point, not a standing
recommendation.** Because `actionableDecisions` never includes a
Purchase-Required row, the Decision Summary can no longer auto-generate
a "Record {item}" line from a catalog-only gap — the exact behavior
this mission's own acceptance criteria names. The Record Newly Acquired
Component button inside Change Installed Components' own disclosure
(§35's "Add Newly Acquired Component" tier) is untouched: it remains a
real, explicit, Commander-invoked workflow entry point, always
reachable from any row regardless of that row's own status.

Regression coverage: `shipManagementSummary.test.ts` gains a dedicated
`actionableDecisions`/`actionableCount` suite (Purchase-Required
excluded, Available/Reserved/Borrowable/Invalid-Target included, a
mixed-set case confirming the count reflects only the actionable
subset in the same acquisition-priority order). `ShipWorkspacePrototype
.test.tsx`'s EWO-064-era Purchase-Required-inclusion tests are rewritten
to assert the restored exclusion, and a new EWO-065B describe block adds
a real-fixture procurement-only case (MOLE — Decision Summary reads "No
Immediate Decisions" while Missing text and Category Demand Cards still
show the real Cooler gap), plus dedicated inventory-available/reserved/
borrow-only/mixed-state coverage and a reactive removal-updates-the-count
case. Full project regression (`tsc --noEmit`, 181 test files / 2235
tests) and a production build both pass clean.

## 39. Loadout Safety Capsule & Fleet Priority Refactor (EWO-066, IMPLEMENTED NOW)

A UX architecture refactor with one real logic addition (the Priority
Model itself, explicitly authorized) — otherwise no changes to
readiness, inventory, reservation logic, or ship behavior. STV — a ship
with only its Factory Loadout, no Commander customization at all — is
this mission's own canonical reference state (Part H): the golden path
every more complex Loadout scenario builds on, so this mission is
mostly about making that state read cleanly rather than layering
complexity on top of it. (135c fills the same real-fixture role STV did
conceptually — no such fixture exists in seed.ts, matching §36's own
"STV" precedent.)

**Part A — the Safety Capsule splits into two zones sharing one
panel.** The single `panel p-4` Loadout section is now a `grid
md:grid-cols-3` — Loadout at `md:col-span-2` (~2/3), Ship Priority to
its right behind a `md:border-l` divider (~1/3) — still one capsule,
one `<div className="panel">`, never two separate ones. Every existing
Loadout behavior (pill selection, Set Active, the guarded-switch
confirm, New Loadout's inline form) is unchanged; only where it sits
moved.

**Part B — Factory presentation simplified.** A Factory build's own
stored name has always been the literal string `"Factory Loadout"`
(`fleetAssetMaterializer.ts`), and the pill additionally rendered a
`Badge tone="cyan"` reading "Factory" — together, "Factory Loadout •
Factory." The pill now renders `build.kind === 'FACTORY' ? 'Factory' :
build.name` and drops the redundant badge entirely; the real `ACTIVE`
badge (unchanged) still applies when it's the ship's active Loadout.
Every other build keeps its own real name — this only ever touches the
Factory case. The underlying stored `Build.name` is untouched (still
`"Factory Loadout"` internally — other surfaces like New Loadout's own
"Initialize From: Factory Loadout" source-selector button intentionally
keep that fuller phrase, a different context than the pill's identity).

**Part E/F/G — Fleet Priority becomes a real unique manual ranking,**
not a free-form number. New `src/utils/fleetPriority.ts` is the one
place ranks are ever computed:
- `reorderFleetPriority(ships, targetId, requestedPriority)` — a
  Commander-initiated re-rank; every other ranked ship shifts as needed
  to stay a unique, gap-free `1..N` sequence (de-ranking closes the gap
  it leaves; ranking/re-ranking shifts everything at or after the
  target position down by one). `requestedPriority` clamps into `[1,
  rankedCount + 1]` — requesting beyond the fleet size lands at the end,
  never a gap or an error.
- `closePriorityGapOnRemoval(ships, removedId)` — `removeFleetAsset`'s
  own convenience wrapper for the same shift, minus the departing
  ship's own now-irrelevant entry.
- `normalizeFleetPriorities(ships)` — the read-path self-heal (Part G),
  called at the end of `useFleetStore.ts`'s `merge()` on every
  hydration, not a one-time schema migration. Repairs duplicate
  priorities, gaps, and invalid values (anything not a positive
  integer) into a clean sequence, preserving relative order (current
  priority, then original array position) wherever possible.
  Idempotent — a no-op against already-clean data. This also self-heals
  the seed baseline's own known duplicate: MOLE and Vulture are both
  hand-authored as `priority: 2` in seed.ts, and always have been; every
  ship ranked after that duplicate shifts by one once normalized (e.g.
  Cutlass Red's raw `priority: 7` becomes `8`) — a real, deliberate
  effect of this engine, not a bug, and specifically not "undone" by
  anything else in the store (see the `seedImageResolution.test.ts` fix
  this surfaced).
- `Ship.priority`/`FleetAsset.priority`/`SeedAssetOverride.priority` are
  now `number | null` — `null` is "Unprioritized," a first-class value,
  never a magic number like `0`. `comparePriority(a, b)` is the one
  null-safe ascending comparator (Unprioritized always sorts last),
  reused everywhere Priority is a sort key: Fleet Dashboard's Priority
  sort, Mission Control's Top 4 slice and tile-context names, and
  `compareByReadinessRank`'s own tiebreak — Part F's "canonical value"
  requirement extends to how it sorts, not only how it's stored.
- **`setFleetPriority(shipId, priority)`** — the sole entry point that
  mutates Fleet Priority, replacing `updateFleetProfile`'s own former
  ad hoc `priority` field (removed from its type entirely — that action
  now only ever touches Primary/Secondary Role). Applies the same
  dual/triple-write persistence pattern
  (`ships`/`fleetAssets`/`seedAssetOverrides` for a seed-migrated asset)
  every other Fleet Asset mutation already uses, across every ship
  `reorderFleetPriority` says actually changed — often more than the
  one the Commander directly edited.
- A freshly-added ship now defaults to Unprioritized (`null`), never
  auto-appended to the end of the ranking the way `addFleetAsset` used
  to (`max(existing) + 1`) — the Commander assigns a real priority
  explicitly if and when they want one.
- The Ship Priority field is removed from `EditFleetAssetModal` — Ship
  Management's own new panel is the one place it's edited now, rather
  than two competing surfaces (one enforcing the uniqueness invariant,
  one not).

**Ship Priority panel UI** — a `<select>` (`Unprioritized` plus
`Priority 1..N`, `N` = the current ranked fleet size, extended by one
when this ship is the one about to become newly ranked) calling
`setFleetPriority` on change. Purely fleet metadata — confirmed by a
dedicated regression test that changing it never touches Readiness,
Missing Components, or the Decision Summary.

**Part D — New Loadout unchanged in place.** Still the last element of
the Loadout group, never Ship Priority's — unaffected by the split
apart from which column it now renders inside.

**Part C/H/I — preserved by construction, not by new logic.** Reviewed
vs Active safety (SW-002) required no code change — selecting a
Loadout pill still only ever changes the reviewed Loadout; `Set
Active` remains the one explicit action that changes the ship's real
Active Loadout. A Factory-only ship was already the entire Loadout
zone's content whenever no custom Loadout exists (the capsule itself
is conditionally rendered only when a ship is selected) — there was
never an empty placeholder state to eliminate; Part H's acceptance
criterion is satisfied by inspection, confirmed by a dedicated test.

Regression coverage: `fleetPriority.ts` behavior is exercised via
`fleetProfile.test.ts`'s rewritten `setFleetPriority` suite (specific
rank, Unprioritized gap-closing, insertion-shifts-others, clamping
beyond fleet size, rejecting non-positive/non-integer values, unknown
ship). A new EWO-066 describe block in `ShipWorkspacePrototype
.test.tsx` covers the split-zone structure, the Factory pill's
simplified text/badge, New Loadout's placement, the Ship Priority
selector's value/options/onChange and its non-interference with
readiness/decisions, the 135c Factory-only reference state, and
Reviewed-vs-Active safety post-restructure. Every direct
`a.priority - b.priority` sort comparison across the codebase (Fleet
Dashboard, Mission Control, `fleetBuildState.ts`, `fleetNavigation.ts`,
`tileContextNames.ts`, and their own tests) was replaced with
`comparePriority` for null-safety. Full project regression (`tsc
--noEmit`, 181 test files / 2253 tests) and a production build both
pass clean.

## 40. Fleet Priority Behavior Refinement (EWO-066A, IMPLEMENTED NOW)

A small, immediate follow-on to §39, filed after Commander review of the
shipped result rather than reopening EWO-066 itself.

**Part A — the Factory ACTIVE badge bug.** "One ship. One active
Loadout. One ACTIVE badge" was already the intended rule, but the pill
render, `showSetActive`, and the page's own `activeBuild` lookup all
compared against each Build's own denormalized `isActive` boolean
rather than the ship's single authoritative `activeBuildId` field. Any
drift between the two (a real risk any per-row mirror carries) could
read as two simultaneously-active pills — Factory and whichever custom
Loadout is genuinely active. All three now compare `build.id ===
ship.activeBuildId` directly, which makes "exactly one ACTIVE badge"
true by construction rather than by hoping every `isActive` flag stays
in sync. `Build.isActive` itself is untouched (still written correctly
elsewhere) — only these three read sites changed.

**Part B — renamed "Ship Priority" → "Fleet Priority."** Small wording
change, correct mental model: the Commander is editing this ship's
*position within the fleet*, not an intrinsic property of the ship
itself.

**Part C — the selector shows the fleet's real order, not anonymous
numbers.** "Priority 1" alone invites "relative to what?" New
`buildFleetPriorityOptions()` (`fleetPriority.ts`) renders the actual
current sequence — `"1 • Corsair," "2 • Ghost Mk II," "3 • MOLE
(Current)," "4 • STV"` — so picking a different ship's slot is
self-explanatory: the target takes that position, and that ship (and
everyone after it) shifts down by one. An Unprioritized target gets one
extra trailing option (`"{N+1} • (Last Priority)"`) since inserting it
displaces no one. The literal `"Unprioritized"` option remains, for
removing a ship from the ranking entirely.

**Part D — no confirmation dialog.** Never had one to begin with (this
mission's own review reconsidered an earlier internal discussion and
decided against adding one) — selecting an occupied position reorders
the fleet immediately via the same `reorderFleetPriority` engine §39
established. What changed here: `reorderFleetPriority` now genuinely
returns *only* the entries whose rank actually changed (previously its
own doc comment claimed this but the implementation always
recomputed the full affected range regardless of whether individual
values actually moved) — a request that clamps back to a ship's own
current position now correctly produces zero writes and zero log
noise, closing an edge case where a wildly out-of-range request (e.g.
asking for rank 999 on an already-last ship) would have logged a
misleading "moved to 999" despite no real change taking effect. The
store's own Captain's-Log message always uses the *resulting* clamped
rank, never the raw requested number.

**Part E — Captain's Log records the transition, not just the new
value.** `setFleetPriority` captures the ship's prior rank before
reordering and logs `action: 'Fleet Priority Updated'`, `details:
"{Ship}: Priority {from} → Priority {to}"` (or `"Unprioritized"` on
either side) — a single Commander choice can shift the whole fleet, so
the log names the one ship that actually moved by choice, not the
positions everyone else was pushed into.

Regression coverage: a new dedicated `fleetPriority.test.ts` unit suite
covers `comparePriority`, `normalizeFleetPriorities`,
`reorderFleetPriority` (including the corrected "only genuinely-changed
entries" guarantee and the Chief Architect's own worked example via
`buildFleetPriorityOptions`), and `closePriorityGapOnRemoval` directly.
A new EWO-066A describe block in `ShipWorkspacePrototype.test.tsx`
covers the single-ACTIVE-badge invariant for both a Factory-active ship
and a custom-Loadout-active ship, the "Fleet Priority" rename, the
ordered dropdown's exact label format, a full fleet reorder with no
confirmation UI present, and the Captain's Log transition message
(including the no-op-produces-no-log-entry case). Full project
regression (`tsc --noEmit`, 182 test files / 2275 tests) and a
production build both pass clean.

## 41. Operations Workspace Visual Enhancement (EWO-067, IMPLEMENTED NOW)

Visual enhancement only — the "What do you want to change?" pair
(`ShipWorkspacePrototype.tsx`) is still the exact same two real
`<button>`s, same `onClick`/`aria-pressed`/keyboard contract, same
underlying Commander Intent state machine. Only what's layered on top
changed.

**Design Principle (Engineering note, carried forward from the work
order itself):** these are no longer "buttons" — they're operational
workstations. Every future Ship Management workflow should begin by
entering one of the two, and their visual treatment should reinforce
that mental model (a dedicated console a Commander steps into) rather
than merely inviting a click.

**Part B/C — distinct workstation identity, same palette.** Manage
Loadout (`WORKSTATION_BLUEPRINT_PATTERN`) gets a faint grid — the
"planning console" language — while Change Installed Components
(`WORKSTATION_PANEL_PATTERN`) gets a diagonal panel-seam hatch — the
"maintenance bay" language. Both are CSS gradients built from the exact
`cyan` token (`#35D0FF` = `rgb(53,208,255)`) at very low alpha via
inline `style`, since a multi-stop gradient has no concise Tailwind
utility form — deliberately no new color, per the work order's own
explicit constraint. Each card also gets a large (104px), low-opacity,
`aria-hidden` glyph watermark (the same canonical icon already used for
that workstation's small inline title icon — `ListChecks`/`WrenchIcon`,
never a new icon) and a soft radial "internal lighting" glow in the
top-left corner, same cyan token again.

**Part D — typography re-tiered, not rewritten.** The old single
paragraph-heavy description is split into three tiers with no
information lost: the large existing title, a new concise one-line
operational statement (`COMMANDER_INTENT_STATEMENT`), and a smaller
supporting description carrying the original detail
(`COMMANDER_INTENT_DESCRIPTION`) — content preserved, only its
presentation re-tiered.

**Part E — workstation labels.** A small, letter-spaced, low-emphasis
identifier in each card's upper-right corner ("Loadout Workstation" /
"Maintenance Bay"), styled consistently with this page's own existing
section-label language (the same treatment the page's `h3` eyebrows
already use).

**Part F — premium hover, reusing an existing pattern.** `hover:
-translate-y-0.5 hover:border-cyan/30 hover:shadow-glow`, `transition-
all duration-200` — the exact same hover language Fleet Dashboard's own
`ShipCard.tsx` already established (`hover:shadow-glow hover:border-
cyan/30`), including reusing the pre-existing `shadow-glow` box-shadow
token from `tailwind.config.js` rather than inventing a new glow value.
The watermark glyph and title also brighten on hover
(`group-hover:text-cyan/[0.12]`, `group-hover:text-cyan/90`) via the
same `group`/`group-hover` mechanism already idiomatic in this
codebase. 200ms sits inside the requested 150–200ms window; deliberately
no scale/bounce — "premium rather than flashy."

**Part G — consistency, not a new visual language.** Every new value
(the `cyan` token, the `shadow-glow` shadow, the `group`/`group-hover`
hover mechanism, the small-uppercase-letter-spaced label treatment) is
reused verbatim from an existing SFM surface (Fleet Dashboard, Mission
Control, or this page's own established section-label pattern) — no
net-new design token was introduced.

**Part H — verified structurally unchanged.** A dedicated regression
block confirms `aria-pressed` still toggles correctly, the Systems
Workspace lens still switches (Manage Loadout's own "New Target"
column still appears), and re-clicking still deselects back to
Operational Review — the exact same behavior as before this mission,
now underneath the new visual treatment.

Regression coverage: a new EWO-067 describe block in
`ShipWorkspacePrototype.test.tsx` covers the three-tier typography
content, the workstation labels, the presence of `aria-hidden` watermark
glyphs, the two cards' distinct (never identical) background patterns,
the reused `hover:shadow-glow`/`hover:border-cyan/30` hover classes and
transition duration, and the Part H behavioral-preservation checks. Full
project regression (`tsc --noEmit`, 182 test files / 2282 tests) and a
production build both pass clean.

## 42. Operations Workspace Premium Refinement (EWO-067A, IMPLEMENTED NOW — supersedes §41's own artwork)

EWO-067A explicitly reverses §41's own decorative treatment. The Chief
Architect's own framing: "Less artwork. More confidence. The Ship
Header is the cinematic hero of the page. Every section beneath it
should become progressively quieter, allowing typography, spacing, and
refined materials to communicate quality." Still visual-only — the
same two real `<button>`s, same `onClick`/`aria-pressed`/keyboard
contract, same Commander Intent state machine, byte-for-byte unchanged
(Part H, both missions).

**Part A — background artwork removed.** `WORKSTATION_BLUEPRINT_PATTERN`
and `WORKSTATION_PANEL_PATTERN` (§41's inline-`style` CSS gradients),
the 104px low-opacity watermark glyph, and the radial "internal
lighting" glow are all deleted outright — no blueprint grid, no
diagonal hatch, no oversized icon, on either card.

**Part B — premium materials replace decoration.** A darker internal
surface (`bg-black/20`) and a soft inner-shadow edge
(`shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`) carry the "premium"
read that the background artwork used to — restrained material cues
instead of visible texture.

**Part C — typography is now the primary visual feature.** The middle
and bottom copy tiers (`COMMANDER_INTENT_STATEMENT`/
`COMMANDER_INTENT_DESCRIPTION`) are rewritten to the work order's own
example copy, tightened to fragment-style phrasing rather than full
sentences: Manage Loadout reads "Configure this ship's preferred
configuration." / "Target loadout • doctrine • mission builds"; Change
Installed Components reads "Modify the physical ship." / "Install,
replace, remove or borrow physical components." Same variable names
and structure as §41 — only the values changed.

**Part D — one restrained accent, Engineering's call.** In place of
§41's watermark and internal-lighting wash: a single thin holographic
line (`bg-gradient-to-r from-cyan/60 via-cyan/20 to-transparent`)
along each card's top edge, at low opacity at rest and brightening on
hover/selection (`opacity-40 group-hover:opacity-90`, `opacity-100`
when selected) — still the same `cyan` token, still no new color.

**Part E — workstation labels unchanged.** "Loadout Workstation" /
"Maintenance Bay" render exactly as in §41 — already doing their job,
explicitly retained.

**Part F — premium hover retained.** `hover:-translate-y-0.5
hover:border-cyan/30 hover:shadow-glow`, `duration-200`, title
brightening on hover/selection — all carried forward from §41
unchanged; smooth and confident, never flashy.

**Part G/H — quieter by construction, timeless placeholder.** With the
background artwork gone, these cards no longer compete visually with
the Ship Header above them or risk clashing with a future cinematic
Quartermaster Edition workstation treatment — refined typography,
spacing, and materials read as a deliberately restrained placeholder
rather than a finished decorative system.

Regression coverage: the EWO-067 describe block in
`ShipWorkspacePrototype.test.tsx` was updated in place — the
typography test now asserts the new copy; the old "watermark glyph"
and "distinct background patterns" tests (whose premise §41's own
artwork no longer exists to satisfy) were removed, since Part A
retires that treatment outright; the workstation-label, hover-glow,
and Part H behavioral-preservation tests are unchanged and still pass.
Full project regression (`tsc --noEmit`, full `vitest run`) and a
production build pass clean.

## 43. Operational Review Table Cleanup & Containment (EWO-068, IMPLEMENTED NOW)

Finalizes the Ship Assessment Operational Review table (Lens 1,
`commanderIntent === null`) as a clean, non-editable, fully contained
assessment surface — the stable reference view the two editable
workstations (Manage Loadout, Change Installed Components) are now
evaluated against. Scoped strictly to Lens 1's own 6-column table;
Lens 2 (8 columns)/Lens 3 (7 columns) keep their pre-existing
auto-layout table entirely untouched.

**Part A — confirmed already read-only.** Lens 1's own cell renderer
was already read-only (`ComponentAssignmentLabel` + a `Badge`, no
inputs/selects/workflow buttons) — no change required beyond Part B.

**Part B — CONFIGURABLE retired from Operational Review.** The
Configurable Slot badge (`renderLensRows`) and its click-to-inspect
disclosure (`renderConfigurableSlotDisclosure`) are workflow-facing
implementation metadata (swap-group identifier, confidence level,
source authority) — they don't help a Commander read Factory/Installed/
Target/Status. Both are now gated to `commanderIntent !== null`,
including the disclosure's own render guard (so a slot inspected inside
a workflow lens doesn't leak into view if the Commander switches back
to Operational Review without closing it first). The underlying
`configurableSlotFor` lookup is untouched — still available the instant
a Commander enters either workstation.

**Part C — fixed layout, explicit `<colgroup>`, scoped to Lens 1 only.**
The table gets `table-fixed` plus a 6-column `<colgroup>`
(Port 30%, Size/Type 12%, Factory 15%, Installed 15%, Target 15%,
Status 13%) only when `commanderIntent === null`; Lens 2/3 render the
same `<table>` element without either, preserving their own existing
auto-layout untouched (Explicitly Out of Scope).

**Part D — wrap vs. truncate, split by column.** Port permits wrapping
(`flex-wrap`, `break-words`) rather than truncation — a Commander needs
the full port name — with indentation capped at 4 levels
(`Math.min(depth, 4) * 16`) so a single deep branch can't keep eating
into the column's own fixed width. Factory/Installed/Target keep
`ComponentAssignmentLabel`'s existing two-line name/classification
treatment (already `truncate`-based) constrained against the new fixed
column width via `max-w-0`; both its name and classification lines now
carry their own `title` with the FULL value (not the outer diagnostic
internal identifier), so a truncated cell's real content is always one
hover away. Status keeps `whitespace-nowrap` in a column sized for the
longest approved label ("Upgrade Available").

**Part E — nested containment.** Covered by Part D's capped
indentation plus Part C's fixed column width — hierarchy depth can no
longer widen the Port column or the table, regardless of how deep a
missile-rack/turret/gimbal branch goes.

**Part F — not separately implemented.** Part C/D's fixed-width,
truncate/wrap-based containment already holds at the 1320px reference
desktop viewport (live-verified — see below); the pre-existing
`overflow-x-auto` wrapper remains only as the last-resort fallback Part
F itself permits below the supported breakpoint, never triggered at
standard desktop width.

**Part G — no new decoration.** Factory muted, Installed neutral,
Target cyan, Status semantic badge tones all unchanged.

Regression coverage: a new EWO-068 describe block in
`ShipWorkspacePrototype.test.tsx` covers no editable controls in
Operational Review, CONFIGURABLE's absence there (and continued
presence the moment a workflow lens is entered), all six columns
rendering in order, the `table-fixed`/`<colgroup>` scoping (present in
Lens 1, absent in Lens 2), and Status's one-line containment; a new
EWO-068 block in `ComponentAssignmentLabel.test.tsx` covers the
full-value title on both truncatable lines. Three existing test files
(`sw013c2dEclipseCompatibility`, `sw013c2fAmendmentB`,
`sw014aInlineInstalledComponentWorkflow`) had their own local
`.tagName === 'DIV'` port-row lookup helper — a testing convenience
that assumed the port label was the outer `<div>`'s own direct text —
broken by Part D's new wrapping `<span>`; all were widened to match any
element inside a `<tr>` regardless of tag, not a functional change.
Full project regression (`tsc --noEmit`, full `vitest run`) and a
production build pass clean. Playwright live-verified at the 1320px
reference desktop viewport against a real seeded combat ship (missile
racks, gimbal mounts, and a manned turret with nested weapon/missile
children — genuine multi-level nesting) plus a synthetic
deliberately-long target name: collapsed and fully-expanded assessment,
`scrollWidth <= clientWidth` for both the page and the table/panel
container (confirmed equal, zero overflow), the Status column's right
edge inside the viewport, the long name truncating to an ellipsis with
its full value recoverable via `title`, and no CONFIGURABLE text
anywhere in the DOM.

## 44. Operational Review Status Alignment (EWO-068A, IMPLEMENTED NOW)

The Status column now shows the same highest-priority fulfillment state
the Hero's own Decision Summary already computes, instead of an
independent grade/match comparison — "One port. One target. One
authoritative operational status."

**Part A/E — match state vs. fulfillment state.** `hp.status`
(`computeHardpointStatus` — a pure installed/target/factory identity
comparison) is untouched and still drives readiness/internal-logic
calculations exactly as before. A new pure derivation,
`resolveOperationalReviewStatus(hp, hint)`
(`src/utils/shipManagementSummary.ts`), sits on top of it for display
only: OK, Invalid Target, and Unresolved pass `hp.status` straight
through (a data problem or a satisfied target is never re-litigated by
an inventory fact); for every other unresolved target (`hp.status` is
'Missing' or the old grade-only 'Upgrade Available'), the resolver
defers entirely to the hardpoint's own `AcquisitionHint` — the exact
same per-hardpoint classification `hintByHardpointId` already produces
for the Hero, never a second calculation (Part D).

**Part B — canonical precedence.** `hint.label` maps to the column's
new vocabulary: 'Reserved For This Port' and 'Available in Inventory'
pass through verbatim (green, `success` tone — literally the same
strings the Hero's own Decision Summary renders, so the two surfaces
can never contradict each other on the same hardpoint); 'Available to
Reserve' (owned, but committed to a different port — a real,
inventory-backed fact) becomes the column's own narrower 'Upgrade
Available', now in a new `gold` Badge tone (Quartermaster Gold, never
`warning`/Caution Yellow — the same EWO-065A §37/38 distinction) rather
than the old grade-only trigger; 'Borrow Available' passes through
(cyan); 'Purchase Required' (no reserved/available/upgrade/borrow
option exists) reads as 'Missing' — a real gap, but never fabricated as
something more specific.

**Part F — pill containment.** The Status `<colgroup>` share
(established EWO-068 §43) grew from 13% to 25% (Port trimmed from 30%
to 25%, Size/Type from 12% to 8%) and the cell's own horizontal padding
was reduced (`px-2`, was `px-4`) — both tuned against the actual
rendered "Reserved For This Port" pill (the longest approved label) at
the 1320px reference viewport, not estimated from character count; a
first pass at 16%/`px-2` still overflowed by 21px, caught by Playwright
measurement before landing.

**A real discrepancy, disclosed rather than silently resolved:** the
work order's own "Ghost Reference State" (Part C) names three specific
labels for Ghost's Stealth Build — SnowBlind → Reserved For This Port,
Slipstream → Available in Inventory, Mirage (Left Shield Generator) →
Available in Inventory. Tracing the actual committed fixture
(`src/data/seed.ts`) shows: SnowBlind is owned (qty 1) and **unreserved**
(no `MissionReservation` exists anywhere in seed data by default — this
is also independently confirmed by an existing, already-certified test:
`ShipWorkspacePrototype.test.tsx`'s "Immediate Decision Intelligence" —
'SnowBlind is owned (qty 1) and unreserved in the seed Hangar'), so it
correctly resolves to Available in Inventory, not Reserved; Slipstream's
seed hangar entry is `qty: 0`, so it correctly resolves to Missing
(Purchase Required), not Available; and Left Shield Generator's target
on Ghost's Stealth Build is already `Mirage` with `installedItem: 'Mirage'`
— i.e. already OK, not unresolved at all. Rather than silently forcing
these three labels to match the work order's prose (which would require
either fabricating seed reservation/inventory data — "Inventory
reservation behavior" is Explicitly Out of Scope — or asserting
incorrect values), the regression suite proves the SnowBlind/Slipstream
cases against their real, verified current values, and separately
proves the Reserved-For-This-Port path end-to-end with a genuine
`reserveComponent` call against the real SnowBlind/Left-Cooler fixture
(`ShipWorkspacePrototype.test.tsx`) — which does produce exactly
'Reserved For This Port', matching the work order's own claimed label
once that real reservation actually exists. The likely explanation:
the Chief Architect's own live "Commander inspection" session had
already reserved SnowBlind through some prior action before observing
this state — a transient in-session fact, not a static seed.ts value.

Regression coverage: `shipManagementSummary.test.ts` proves
`resolveOperationalReviewStatus`/`operationalReviewStatusTone`'s full
precedence table in isolation (all 7 tiers, plus "exact-target
availability outranks the old grade-only Upgrade Available" using the
identical underlying hardpoint with only the hint varying). A new
EWO-068A block in `ShipWorkspacePrototype.test.tsx` proves the wiring
end-to-end against real Ghost fixture data and a real store reservation
(not a mock), and confirms Table/Hero agreement on the same hardpoint.
`Badge.tsx` gains an exported `Tone` type and a `gold` tone (reused
verbatim, no new color). Full project regression (`tsc --noEmit`, full
`vitest run`) and a production build pass clean. Playwright live-verified
at the 1320px reference viewport against a real seeded ship with a
rigged Missing → Available in Inventory → Reserved For This Port
transition (the exact same code path the Ghost fixture exercises,
reproducible without the dev-only seed flag this isolated browser
doesn't have): both states render correctly, Table and Hero agree
verbatim, and — after the colgroup fix — zero horizontal overflow.

## 45. Canonical Status Pills & Column Rebalance (EWO-068B, IMPLEMENTED NOW)

Standardizes status-pill wording, sizing, and semantic color across all
three Ship Management tree layouts — "Hero explains. Tables classify.
Workflows act." §44's own `OperationalReviewStatus`/`hint`-derived
classification is unchanged; only how it's PRESENTED in a tree/table
cell changes.

**Part A/D — one canonical mapping, two vocabularies.**
`STATUS_PILL: Record<OperationalReviewStatus, {compactLabel, longLabel,
tone}>` (`shipManagementSummary.ts`) is now the single source every
tree/table pill reads from — Operational Review's Status column and
Change Installed Components' inline acquisition-hint badge
(`renderInstallDisclosure`, via the newly-exported
`fulfillmentStatusFromHint(hint)`, the hint-only half of §44's own
resolver, pulled out so a raw `AcquisitionHint` — not just a
`Hardpoint` — can resolve the same classification). Both render
`compactLabel` ("OK"/"RESERVED"/"AVAILABLE"/"UPGRADE"/"BORROW?"/
"MISSING"/"INVALID"/"UNRESOLVED"), never the longer Hero wording. The
Hero/Decision Summary are explicitly untouched (Explicitly Out of
Scope: "Hero pill wording") — they still render `AcquisitionHint.label`/
`.tone` directly, an intentionally separate, established path from
EWO-064/065B this mission does not consume or alter. `longLabel` is
recorded on `STATUS_PILL` anyway (Part D's own suggested shape) so the
relationship between the two vocabularies is documented in one place.

**Part B — retuned tone, mirroring Mission Control.** Reserved gets its
OWN `cyan` tone — Badge.tsx's pre-existing Mission Control
`procurementRowStateTone('RESERVED')` already uses cyan for the
identical concept — deliberately split from Available's `success`
green, even though both previously rendered identically via the raw
`AcquisitionHint.tone` (EWO-068A's own `operationalReviewStatusTone`,
retired this mission in favor of `STATUS_PILL`). Upgrade keeps
`gold` (EWO-068A). Borrow becomes `muted` — neutral gray, "must not
visually compete with Reserved/Available/Upgrade" — instead of the
Hero's own cyan informational treatment; the "?" in "BORROW?" alone
signals "an option exists, evaluate the consequences." Missing/Invalid
keep their pre-existing `danger`/`invalid` distinction (a routine
procurement gap vs. a genuine data problem) unchanged.

**Part E — column rebalance, live-measured.** Operational Review's
`<colgroup>` (§43) shrinks Status from 25% back to 10% now that no
compact label exceeds 9 characters, redistributing the reclaimed width
to Port (25% → 33%), Size/Type (8% → 12%), and Target (14% → 15%) — the
columns Part E names as the intended beneficiaries. Verified against
the actual rendered "AVAILABLE" pill (the longest compact label) via
Playwright measurement, not estimated from character count. Manage
Loadout/Change Installed Components' own Availability/Reservations
badges (`{n} Available`, a live quantity count — genuinely different
information from the state-classification vocabulary this mission
standardizes) were already using the correct canonical colors
(`success`/`muted` for availability, `cyan` for Reserved) before this
mission and needed no change — verified, not modified, consistent with
"No availability, reservation... logic changes are authorized."

**A pre-existing bug found, not fixed (out of scope).** Live
verification surfaced a genuine, PRE-EXISTING crash in Change Installed
Components — `Cannot read properties of undefined (reading
'ownedQuantity')` at its own main-row rendering
(`availabilityByHardpointId.get(hp.id)!` in `renderLensCells`),
triggered by clicking "Expand All" and then switching into Change
Installed Components on certain ships. Confirmed via bisection to
reproduce on a completely vanilla, freshly-added ship with none of this
mission's own rigging involved, and confirmed the crash site is
untouched by this mission's own edit (a different function,
`renderInstallDisclosure`) — a real bug worth its own dedicated work
order, not something EWO-068B's scope covers or this fix touches.

Regression coverage: `shipManagementSummary.test.ts`'s EWO-068A/EWO-068B
describe block now asserts `STATUS_PILL`'s full compactLabel/tone table
directly (including "Reserved and Available must never share a tone"
and "every compact label ≤10 characters, no spaces") and
`fulfillmentStatusFromHint`'s standalone hint-to-status mapping. A new
EWO-068B block in `ShipWorkspacePrototype.test.tsx` proves: the same
hardpoint reads the identical compact label in both Operational Review
and Change Installed Components' own disclosure (Part D, real
end-to-end, not a mock); a real borrow-only fixture renders the neutral
`BORROW?` pill in both surfaces; the colgroup's Status share shrank
below 20% while Port grew larger than Status (Part E); and every
Status-column label observed across a real ship's fully-expanded
Operational Review is drawn from the approved 8-word vocabulary. Every
pre-existing test asserting the old long labels in a tree/table cell
was updated to the new compact ones; Hero-facing assertions
(`decision-summary`) were left on the long wording. Full project
regression (`tsc --noEmit`, full `vitest run`) and a production build
pass clean. Playwright live-verified at the 1320px reference viewport
against a real seeded ship with three rigged states (Available/
Reserved/Borrow, the reservation via a real `reserveComponent` call):
correct compact labels, correct tones (cyan/gold/muted verified via
rendered class names), zero horizontal overflow in both Operational
Review and Change Installed Components.

## 46. Manage Loadout Table Simplification & Status Consolidation (EWO-069, IMPLEMENTED NOW)

Consolidates Manage Loadout's former separate Availability + Reservations
columns into one live Status column, consuming the exact same canonical
`STATUS_PILL` mapping EWO-068B established — "Hero explains. Tables
classify. Workflows act." Still a target-planning surface only; no
physical-installation behavior changed (Part A).

**Part B/C/D/H — one live Status column, one shared vocabulary.** The
former `{n} Available`/`Reservations` badge pair is replaced by a single
Status cell, computed against whatever the Commander currently has
SELECTED (`desired`) via a new resolver,
`resolveNewTargetStatus({hp, desiredTargetItem, desiredTargetEntityClass,
isEdited, hint})` (`shipManagementSummary.ts`) — never a second,
independent pill vocabulary. Precedence: an unedited selection whose
SAVED status is Invalid Target/Unresolved passes through unchanged
(mirrors §44's own resolver); otherwise, if the selection identity-matches
what's physically installed (via `computeHardpointStatus`, the same
identity-aware comparison every other status resolver in this codebase
already uses), it reads the new `Installed` tier (`STATUS_PILL` gains
this 8th member — compact "INSTALLED," reusing OK's own `success` tone
verbatim, never a new color); otherwise a LIVE `AcquisitionHint` — computed
against `desired`, not the saved `hp.targetItem` — resolves
Reserved/Available/Upgrade/Borrow/Missing exactly as §44/§45 already do.
Quantity (Part C) is appended only for the Available tier and only when
genuinely nonzero (`${qty} AVAILABLE`) — every other tier, including a
real zero-stock Missing gap, shows its own canonical label alone, never
"0 AVAILABLE." Reserved deliberately stays quantity-free per Part C's own
allowance ("unless multiple reserved copies... are a real supported state
the Commander must distinguish" — not yet true here).

**Part E — redundant Port-row badge retired for this lens only.** The
inline diagnostic badge beneath the port name (`showInlineDiagnostic`)
used to render in both Manage Loadout and Change Installed Components,
since neither had a Status column of its own. Now that Manage Loadout
has one, duplicating it there is exactly the restatement Part E names by
example — gated to Change Installed Components only (still no Status
column there, Explicitly Out of Scope). Structural diagnostics
independent of fulfillment state (missile-rack `×N` quantity, "Count
Mismatch," "Inconsistent — Select Missile," the Configurable Slot badge)
are untouched in every lens — only the fulfillment-state restatement was
retired, per Part E's own "important distinction."

**Part F — full-value tooltip, no interaction redesign.** `TargetComponentPicker`
gains one new optional `title` prop (additive; every pre-existing caller
omits it, byte-for-byte unchanged), passed as `title={desired}` from
Manage Loadout's own call site — a long selected value clipped by the
input's own width is still recoverable on hover. The picker's own
interaction, filtering, and free-text behavior are otherwise untouched.

**Part G — column rebalance, live-measured.** Manage Loadout gains the
same `table-fixed` + explicit `<colgroup>` treatment §43 established for
Operational Review (7 columns now that Availability + Reservations
collapsed into one Status column): Port 18%, Size/Type 8%, Installed 13%,
Current Target 13%, **New Target 27%** (Part G's own "widest operational
column" call — the `TargetComponentPicker`'s own `w-full` input naturally
fills whatever width its cell provides), Status 13% (sized for the
longest realistic compact pill, "3 AVAILABLE"), Actions 8%. Change
Installed Components (no Status column, its own Availability/Actions
machinery untouched) remains Explicitly Out of Scope and keeps its
pre-existing auto-layout table.

Regression coverage: `shipManagementSummary.test.ts` unit-tests
`resolveNewTargetStatus`'s full precedence in isolation (the Installed
tier, the unedited-Invalid/Unresolved passthrough, editing away from a
stale Invalid Target, and every non-Installed hint tier agreeing with
§44/§45's own resolver). `TargetComponentPicker.test.tsx` covers the new
`title` prop, present only when passed. A new EWO-069 block in
`ShipWorkspacePrototype.test.tsx` proves: Availability/Reservations are
gone and Status renders in their place, in the approved column order;
real Ghost fixture data renders "1 AVAILABLE" (SnowBlind, unedited) and
"MISSING" — never "0 AVAILABLE" — for a real zero-stock target
(Slipstream, Power Plant); selecting the port's own currently-installed
component live-reads INSTALLED; a real `reserveComponent` call live-reads
RESERVED, cyan, quantity-free; changing the New Target selection
recalculates Status immediately (Available → Missing, real Ghost data,
zero saves); a synthetic borrow-only fixture renders the neutral
`BORROW?` pill, visually distinct from Reserved/Available/Upgrade; Missing
and Invalid keep their established red-intensity distinction; the
redundant Port-column badge is gone while a genuinely structural
diagnostic (missile-rack `×N`) remains; and the `<colgroup>` sums to a
fully-accounted 100% with New Target the widest data column. Full project
regression (`tsc --noEmit`, full `vitest run`) and a production build
pass clean. Playwright live-verified at the 1320px reference viewport
against a real seeded ship with rigged Available/Reserved rows: correct
compact labels and quantities, zero horizontal overflow across the fully
expanded table, and a live UI selection change (via the real picker, not
a mock) flipping the Status pill from "3 AVAILABLE" to "INSTALLED" with
no save/reload — the exact reactivity Part I requires.

## 47. Remove Orphaned Actions Column & Rejustify Manage Loadout (EWO-069A, IMPLEMENTED NOW)

Retires Manage Loadout's own Actions column outright — previously blank
for every row except a currently-edited one — and rejustifies the
remaining six columns; also retires the CONFIGURABLE badge from this
lens, matching §43's own rule for Operational Review.

**Part A — column removed completely, not hidden.** `lensColumnCount`
for `MANAGE_LOADOUT` drops from 7 to 6; the header `<th>Actions</th>`,
the `<colgroup>`'s 7th `<col>`, and the cell itself are all deleted
outright — every other size (structural rows' `colSpan={lensColumnCount
- 2}`, group rows' `colSpan={lensColumnCount}`) is already computed
FROM `lensColumnCount`, so they shrink automatically with no separate
edit needed. The one action the column used to hold (restore to factory
target) relocates into the New Target cell itself, directly beneath the
`TargetComponentPicker` it acts on — same `onClick`, same conditional
`isEdited` visibility, same icon, only its home changed; no functionality
was dropped, only the column.

**Part B — rejustified per the Chief Architect's own proportions.** Port
18%, Size/Type 10%, Installed 14%, Current Target 14%, New Target 29%
(unchanged from EWO-069's own "widest operational column" call — the
picker's `w-full` input already fills whatever the cell provides), Status
15% (still sized for "X AVAILABLE," the longest realistic compact pill).
Live-verified via Playwright rather than assumed correct from the
percentages alone.

**Part D — CONFIGURABLE retired from Manage Loadout too.** Both the
trigger badge and its own stale-state disclosure guard are gated to
`commanderIntent === 'CHANGE_INSTALLED'` only (previously `!== null`,
covering both workflow lenses) — the same rule §43 already applied to
Operational Review: Manage Loadout's own live Status column already
communicates fulfillment state, so this badge was pure Commander-facing
developer remnant here as well. Change Installed Components remains the
one lens where a Commander physically installing a component may
genuinely need to know a port supports configurable alternatives; the
underlying `configurableSlot` lookup itself is untouched.

**A pre-existing bug fixed in passing, not merely worked around.**
§45's own "found, not fixed" disclosure (`Cannot read properties of
undefined (reading 'ownedQuantity')`, Change Installed Components +
Expand All) turned out to directly block this mission's own SW-011A
regression coverage once those tests moved from Manage Loadout to
Change Installed Components (Part D's own consequence — CONFIGURABLE's
one remaining home). Root-caused precisely: `draftHardpoints` (this
component's own `commanderTree` source) additively materializes
component-owned child-slot rows via `withComponentOwnedChildSlots` —
genuinely Commander-visible rows (the SW-011A Configurable Slot feature's
own child ports) that never passed through `reviewedSummary`'s own
per-hardpoint loop, since that loop only ever iterates
`reviewedHardpoints`, the pre-materialization array. Both unsafe
non-null lookups this reaches (`availabilityByHardpointId.get(hp.id)!`
in the main Change Installed Components row, `hintByHardpointId.get(hp.id)!`
in its own inline disclosure) now fall back to a live recomputation —
the exact same `calculateComponentAvailability`/`describeAcquisitionHint`
calls `reviewedSummary` itself used to build those maps — rather than
crashing outright. (The Hero's own `actionableDecisions`-driven lookup
was NOT touched — it's provably safe by construction, since
`actionableDecisions` is itself derived from the same map it reads.)

Regression coverage: a new EWO-069A block in
`ShipWorkspacePrototype.test.tsx` proves exactly six headers ending in
Status, Actions nowhere in the DOM, every leaf row carrying exactly six
real `<td>` cells, group rows spanning exactly six columns, the relocated
restore-to-factory action still functioning end-to-end, CONFIGURABLE
absent even fully expanded, and nested-row indentation surviving the
column removal untouched. The SW-011A describe block and §43's own
"configurable metadata remains available" test were moved from Manage
Loadout to Change Installed Components, which incidentally exercised
(and proved the fix for) the pre-existing crash above. Full project
regression (`tsc --noEmit`, full `vitest run`) and a production build
pass clean. Playwright live-verified at the 1320px reference viewport:
exactly six headers ending at Status, zero horizontal overflow across
the fully expanded table, zero Configurable badges, and every row
carrying either 1 (group) or 6 (leaf) real `<td>` cells — no orphaned
seventh cell anywhere.

## 48. Manage Loadout Commander Readability & Workspace Containment (EWO-069B, IMPLEMENTED NOW)

The final Commander polish pass for Manage Loadout: Port-column
terminology cleanup, one more column-width rebalance, and constraining
the sticky Save/Discard bar to the Ship Workspace's own boundaries. The
Chief Architect's own framing: "Once these refinements are in, Manage
Loadout will have the same visual maturity as the Header and Loadout
sections" — Beta 2.0 quality.

**Part A/B — Port label cleanup, in the one shared formatter.**
`formatHardpointLabel` (`hardpointLabelPresentation.ts`) is the single
authority every lens (Operational Review/Manage Loadout/Change Installed
Components) AND Ship Detail/Loadout Manager already render Port labels
through — the fix belongs there, not duplicated per-surface. Two
additions, both verified against real, currently-committed fixture
data:
- A new `(Manned Turret)` parenthetical-stripping rule — an explicit,
  evidenced REVERSAL of EWO-036's own "keep Turret/Remote Turret
  wording" rule, scoped to exactly the shape this mission names:
  `quartermasterTemplates.ts`'s real `Front Cab Mining Laser (Manned
  Turret)` (MOLE) now renders `Front Mining Laser` — the mission's own
  literal example. `stripEngineeringTokens` also now strips `Cab` (a
  real raw-data token on the same fixture). `(Remote Turret)` and bare,
  non-parenthesized `Manned Turret` wording are deliberately untouched —
  neither was named by this mission, and EWO-036's original protection
  for both still stands.
- `"Generator02 Shield"`-style fused-index reformatting was
  **deliberately not implemented** as a general rule. No such raw string
  exists anywhere in this repo's own current data to verify a pattern
  against, and a first-attempt general `"{Word}{NN} {Type}"` regex
  demonstrably collided with real, differently-meaning data already in
  the fleet — Vulture's own `SubItem01 Salvage Head`/`SubItem02 Salvage
  Head` (a positional qualifier, not a repeated-instance type name) was
  silently mangled to `Salvage Head SubItem 1`. Reverted outright rather
  than shipped as an unaudited guess; left for a future mission once the
  actual raw data is available to audit against (the way EWO-036B's own
  250-ship audit established every other rule in this file).

Part B's own "avoid repeating words already implied by the parent" is
already satisfied by the module's pre-existing depth-agnostic, leaf-only
design (each row only ever renders its OWN local name, never an
ancestor chain) — confirmed against the real MOLE fixture: the turret's
own child renders `Mining Weapon`, never repeating the parent's newly
-shortened `Mining Laser`-family name.

**Part C — one more width rebalance, live-measured.** Manage Loadout's
`<colgroup>` shifts again: Port 18% → 22%, Installed 14% → 16%, Current
Target 14% → 16%, New Target gives back the difference (29% → 23%),
Status stays unchanged (15%, "already correctly compact" per the work
order itself), Size/Type stays compact (10% → 8%, never flagged as an
issue). New Target still receives more room than any single other
column, satisfying EWO-069's own "widest operational column" call even
after giving some back.

**Part D — truncation mechanism unchanged, only its width.** No new
code: `ComponentAssignmentLabel`'s existing `truncate` + full-value
`title` (EWO-068 Part D) already satisfies "maintain tooltip behavior,
preserve accessibility labels" — Part C's extra width is what actually
reduces how often truncation fires.

**Part E/F/G — sticky footer constrained to the Ship Workspace.** The
bar previously used `fixed inset-x-0 md:left-64` with no right-edge
constraint of its own, so its visible background/border spanned all the
way to the browser's own right edge on a wide viewport — well past
App.tsx's own `<main className="... max-w-[1400px]">`, the exact
container Hero/Loadout/Workspace cards/Ship Assessment all render
inside. Adding `md:max-w-[1400px]` directly to the bar (left-aligned
from the same `md:left-64` offset, matching Sidebar.tsx's own real
`w-64`) caps it at the identical box — live-measured via Playwright at a
1920px viewport: bar right edge and `<main>` right edge both land at
exactly 1656px (`256px` sidebar + `1400px` cap), leaving the same
visible gap beyond it that `<main>` itself already has. The now-
redundant inner `max-w-[1400px] mx-auto` wrapper was dropped in favor of
matching `<main>`'s own horizontal padding (`px-6 md:px-10`) directly.
Elevation, shadow, Pending Changes badge, and Save (primary) / Discard
(secondary) button hierarchy are all untouched — only containment
changed.

Regression coverage: `hardpointLabelPresentation.test.ts` gains cases
for the Mining Laser/Turret parenthetical-stripping rule (the mission's
own literal examples), confirms `(Remote Turret)`/bare `Manned Turret`
stay untouched, and documents the reverted Generator-index rule via a
regression guard using the real Vulture `SubItem0N` fixture that ruled
it out. Every pre-existing test asserting the old `(Manned Turret)`
-suffixed text (`ShipWorkspacePrototype`, `ShipDetail`, `MissionComposer`,
`LoadoutPortTree` — confirming this formatter really is shared beyond
Ship Workspace) was updated to the new stripped text, using real Railen/
MOLE/Cutlass Black fixtures throughout — genuine, not synthetic. A new
EWO-069B block in `ShipWorkspacePrototype.test.tsx` proves the exact
new `<colgroup>` percentages and the sticky bar's `md:max-w-[1400px]`
containment class. Full project regression (`tsc --noEmit`, full
`vitest run`) and a production build pass clean. Playwright live-
verified: zero horizontal overflow at the 1320px reference viewport,
and — via real `boundingBox()` pixel measurement at a 1920px viewport —
the sticky bar's right edge lands exactly on `<main>`'s own right edge,
never the browser's.

## 49. Maintenance Bay Table Cleanup & Target-Mutation Blocker (EWO-070, IMPLEMENTED NOW)

A critical, **release-blocking** functional correction paired with the
same table-cleanup polish EWO-068/069/069A/069B already gave the other
two lenses. Governing rule, stated verbatim in the work order: "Manage
Loadout owns desired configuration. Change Installed Components owns
physical ship state."

**Part A/B — the critical fix.** Reproduction: reviewed Loadout has a
Target saved via Manage Loadout (e.g. "Quantum Drive → Hemera"); the
Commander then installs a *different* physical component via Change
Installed Components. The bug: both `installedItem` **and**
`targetItem` silently became the newly-installed component — the
Commander's own saved plan was destroyed by a physical-installation
action that should never have touched it.

Root cause, confirmed by direct reading: the shared installation
*engine* (`installationEngine.ts`) never writes `targetItem` — the bug
lived entirely in `ShipWorkspacePrototype.tsx`'s own `performInstall`
wrapper, which called `saveMissionConfiguration` (a retarget) as a
workaround for the engine's own deliberate, tested
`resolveDestinationHardpoint` gate: it refuses to target a port whose
status is already `'OK'` (installed already matches target — nothing
outstanding to install into), the same gate every other installation
surface (Ship Detail, Loadout Manager) shares and this mission does not
touch. The retarget is deleted outright. The fix clears the gate
instead by **removing** the port's current occupant first — an
ordinary, already-certified REMOVE (returned to Hangar) — whenever
`hp.status === 'OK'` and something is genuinely installed; once
removed, `installedItem` no longer matches the unchanged `targetItem`,
so the gate no longer applies and the install proceeds normally.
`performInstall` is the single funnel every install path (Available
Inventory, Reserved/Reassign, Borrow/Transfer, Newly Acquired) already
uses, so one fix in one function corrects all of them at once. One
accepted, disclosed behavior change: a port with **no** Target at all
and nothing installed can no longer be "installed into" by picking a
component (there is nothing to legitimately work around) — the
Commander must set a Target in Manage Loadout first, which is the
correct consequence of this mission's own governing rule, not a
regression.

**Part C — mismatch is intelligence, never auto-resolved.** Installing
a component that differs from the saved Target is a real, valuable
signal (e.g. "borrowed a stopgap, still owe the real part") — the
Status column (EWO-068B's `resolveOperationalReviewStatus`/
`STATUS_PILL`) reads it plainly (MISSING/UPGRADE/etc, never a false
`OK`) and the disclosure surfaces it directly ("Compatible Upgrade
Opportunity — Mirage is installed; FR-66 is the current Target,"
confirmed live). No auto-resolve, no follow-up prompt — explicitly out
of scope for Beta 2.0.

**Part D — Commander-facing port names, and the CONFIGURABLE reversal.**
Change Installed Components now renders port labels through the exact
same `formatHardpointLabel` every other lens already uses — nothing new
to build, just confirming no lens-local wording ever diverged. More
consequential: the Configurable Slot badge, which EWO-069A had
*deliberately kept* in this one lens ("a Commander physically installing
a component may genuinely need to know a port supports configurable
alternatives"), is retired here too — a direct, explicit reversal of
that decision. No lens renders it any longer. The underlying
`configurableSlotFor` lookup stays real, load-bearing infrastructure
(still consumed by New Target's own compatible-options resolution); only
every Commander-facing trigger is gone. `renderConfigurableSlotDisclosure`
itself is now unreachable and was deliberately left in place rather than
deleted outright — rewriting its own large, established SW-011A test
suite wholesale was a bigger blast radius than this mission needed;
that suite was instead rewritten to prove absence in all three lenses
(see Regression coverage below).

**Part E/F — Inventory column removed, six-column final layout.** The
former separate Inventory (raw owned quantity) + Availability
("N Available") columns are gone entirely — header, colgroup, cells, all
of it — replaced by the one canonical Status column Operational Review
and Manage Loadout already established. Final column set, matching the
work order's own recommended proportions exactly: Port 22% / Size·Type
12% / Installed 18% / Target 18% / Status 13% / Actions 17%. Change
Installed Components is also the last of the three lenses to gain the
`table-fixed` + `<colgroup>` containment treatment (EWO-068 → 069 →
069B → now here) — the table's own className simplifies from a
per-lens conditional to one unconditional `table-fixed`, and
`lensColumnCount` collapses from a three-way branch to a flat `6`.

**Part G/H — success wording and reactive state.** The install success
message already read "Installed {item} on {port}." with no
target-implying language — confirmed, not changed. Installed updates
immediately in the row; Target and its Status pill recalculate from the
**unchanged** Target, never miscounted as satisfied just because
*something* got installed (live-verified: readiness stayed numerically
identical immediately before and immediately after an install that
left the real mismatch unresolved). Switching lenses away and back
preserves the distinction with no refresh required.

Regression coverage: `sw014aInlineInstalledComponentWorkflow.test.tsx`
(SW-014A's own suite, which already exercises every install tier —
Available Inventory, Reserved-for-this-port, Reserved-elsewhere/
Reassign, Borrow/Transfer, Newly Acquired, Persistence — against a real
`'OK'`-status port) gained an explicit `targetItem` preservation
assertion in every one of those tiers, catching that the suite's own
prior doc comment and one assertion had encoded the *old, buggy*
behavior as intended design. A new dedicated
`ewo070TargetMutationRegression.test.tsx` drives the full Corsair-
equivalent scenario end-to-end through real UI interaction — Manage
Loadout sets and **saves** a Target, Change Installed Components
installs a different real component, asserting Target preservation,
Status-pill mismatch (never `OK`), unmoved readiness, target-neutral
success wording, and survival across a genuine module-level reload
(real `localStorage` read, not in-memory carryover) — using real,
catalog-backed substitute names (Shimmer/FR-66/Mirage) since "Hemera"/
"Crossfield" don't exist in this repo's own catalog data, matching this
session's established substitution precedent. The SW-011A Configurable
Slot suite (`ShipWorkspacePrototype.test.tsx`) was rewritten from
exercising the (now nonexistent) badge trigger to proving its absence
across all three lenses on a ship with genuine underlying configurable
ports. Full project regression (`tsc --noEmit`, full `vitest run`: 183
files / 2344 tests) and a production build pass clean.

Playwright live-verified end to end against the running dev server: a
real Corsair-equivalent ship/build/hardpoint was injected directly into
the live store (the demo seed fleet is intentionally disabled by
default per CAT-001A), then driven entirely through real clicks —
Manage Loadout set-and-save Target (FR-66), confirmed the port stayed
`Missing`/`Shimmer` installed (never silently retargeted), switched to
Change Installed Components, installed Mirage, and confirmed live:
Installed → Mirage, Target still FR-66, Status pill `MISSING` →
`UPGRADE` (never `OK`), success message "Installed Mirage on Right
Shield Generator." with no target language, and the disclosure's own
"Compatible Upgrade Opportunity" line surfacing the intentional
mismatch — screenshot-verified. Full-page-reload persistence is instead
certified at the vitest level (see above): a hand-injected synthetic
ship (built by direct `setState`, bypassing the real "add a Fleet
Asset" pipeline) doesn't round-trip through the live app's
`fleetAssets`-normalized persistence shape, so this script's own
injection method — not the fix — is the limiting factor for that one
leg live; disclosed rather than silently skipped.

## 50. Install/Change Source Ladder Refactor (EWO-071, IMPLEMENTED NOW)

Refactors the Install/Change disclosure (Change Installed Components'
own inline "what can I put here" panel) from SW-014A's original five
loosely-ordered tiers into exactly four canonical, priority-ordered
groups — RESERVED > AVAILABLE > UPGRADE > BORROW — plus one always-
reachable secondary action, Record Newly Acquired Component. "The
Commander should see only realistic choices for satisfying or improving
the selected port": every remaining piece of development-era
instructional copy is gone, and the open-ended "browse the whole
catalog" tier is retired outright.

**Part A — instructional copy removed.** The numbered "SW-002 Component
Selection Priority" reference block (Reserved Components/Available
Inventory/Add Newly Acquired Component/Installed On Other Ships/
Remaining Compatible Components) and the redundant "Compatible Upgrade
Opportunity — {Installed} is installed; {Target} is the current Target"
callout are both deleted outright, no replacement paragraph — the
Installed/Target columns and each group's own canonical pill already
communicate exactly that.

**Part B/H — `installCandidates.ts` rewritten onto the new four-group
model.** Supersedes the old `{availableInventory, reserved, borrowable,
remainingCompatible}` shape (where "reserved" meant "committed to a
*different* Loadout, needs Reassign," and "availableInventory" mixed
together every owned compatible candidate regardless of whether it
matched the Target) with `{reserved, available, upgrade, borrowable}`,
each restricted to real qualification rules:
- **Reserved/Available** — the exact Target only, split by whether a
  specific unit is already committed to this port/reviewed Loadout
  (Reserved) or genuinely free Hangar stock (Available). Both can
  legitimately render at once for the exact same component when they
  represent distinct physical units (Part H's own example) — computed
  independently rather than the old first-match-wins bucketing.
- **Upgrade** — an owned, genuinely-free candidate *other than* the
  Target whose real Grade (the same numeric `catalogComponentsByName`/
  `catalogComponentsByEntityClass` field `componentPresentation.ts`
  already resolves for the Class+Grade subtitle everywhere else) is
  strictly better than what's currently Installed. Unconfirmed Grade on
  either side never qualifies — an unverified improvement is never shown
  as one. This is new qualification logic; no such comparison existed
  before this mission.
- **Borrow** — a compatible candidate (the Target itself included, when
  no owned copy exists anywhere) physically installed on another ship —
  functionally unchanged from SW-014A's own Tier 3.
- A cross-group `seenItems` dedup enforces Reserved > Available > Upgrade
  > Borrow priority — a component already rendered in a higher group
  never repeats in a lower one.

**Disclosed scope decision:** the old "reserved for a *different*
Loadout, Reassign releases it" tier is dropped from this disclosure
entirely — not merged into any of the four canonical groups, not kept as
a fifth. Part H's own group definitions are an exhaustive, closed list,
"Reassign" is never named anywhere in the work order, and Part C's own
RESERVED example is a plain one-click Install with no confirm step,
unlike the old two-step "releasing this disrupts another Loadout, are
you sure" flow. Releasing another Loadout's own commitment is a bigger
decision than this simplified ladder is meant to carry; the underlying
`releaseReservation` store action is untouched (still used elsewhere),
only this disclosure's own UI path to it is gone — verified live (a
reservation belonging to a different Build no longer renders anywhere in
the panel, and no "Reassign" text remains).

**Part C/D/E/F — canonical pill headings, reusing EWO-068B's own
`STATUS_PILL` map directly** (`STATUS_PILL['Reserved For This Port']` /
`['Available in Inventory']` / `['Upgrade Available']` /
`['Borrow Available']`) rather than inventing new colors — RESERVED is
cyan, AVAILABLE is green, UPGRADE is Quartermaster Gold, BORROW? is
neutral muted (deliberately never green/cyan/gold — "a potentially
disruptive fleet decision, not a recommendation"). One shared compact
row component (`candidateRow`) renders Reserved/Available/Upgrade alike
— component identity left, a small context line beneath (quantity, or
quantity + the real Class+Grade subtitle for Upgrade, e.g. "Military
B · 1 Available" — the mission's own worked example, verified live with
real data as "Stealth A · 1 Available"), Install aligned right. Record
Newly Acquired Component is always reachable regardless of whether any
owned Upgrade candidate exists, but stays a small, visually subordinate
link — never rendered as its own pilled group, never a false UPGRADE
candidate. Borrow keeps its own distinct two-step Transfer?/Confirm
Transfer flow (a genuinely bigger decision than a plain Install),
collapsed by default behind a `BORROW? · N ship(s) available ›` toggle,
recolored from its old cyan treatment to neutral.

**Part G — Remaining Compatible Components removed outright,** header,
collapsed toggle, and reference list all deleted along with the dead
`remainingSectionOpen` state — no lower-grade catalog browsing, no
"+N more — see Loadout Manager" text, anywhere in this disclosure.
Open-ended component discovery is explicitly deferred to a future Hangar
Inventory refactor; the underlying compatible-candidate list itself
(`newTargetOptionsFor`) is untouched and still feeds Upgrade/Borrow/
Record Newly Acquired.

**Part J — reactive, no second action.** Installing from any group
recalculates the disclosure immediately (a consumed Hangar unit's own
group empties out and stops rendering on the very next paint, live-
verified: installing the last free Available unit made both RESERVED and
AVAILABLE disappear from the still-open disclosure with no re-click),
the Installed cell and Status pill update, and Hero Readiness/Decision
Summary recalculate from the store's one shared `ShipManagementSummary`
— live-verified jumping from a partial percentage straight to 100%/"No
Immediate Decisions" the instant the Target's own last gap closed.

Regression coverage: `sw014aInlineInstalledComponentWorkflow.test.tsx`
rewritten per-group (Reserved/Available/Upgrade/Borrow/Record Newly
Acquired), each still asserting EWO-070's own Target-preservation
guarantee through the OK-slot remove-then-install path, plus a new test
proving a different-Loadout reservation no longer renders anywhere. A
new dedicated `ewo071InstallChangeSourceLadder.test.tsx` covers the
work order's own itemized list directly: absence of every retired
instructional string and the redundant callout, exact DOM group order,
empty groups rendering nothing, each group's real canonical CSS tone,
Borrow's collapsed-by-default state, a confirmed real lower-grade
candidate never appearing anywhere, Remaining Compatible Components'
total absence, and reactive quantity/group recalculation immediately
after an install with no second action. Full project regression
(`tsc --noEmit`, full `vitest run`: 184 files / 2354 tests) and a
production build pass clean.

Playwright live-verified against the running dev server: a synthetic
Corsair-equivalent ship was injected exercising all four groups plus
Record Newly Acquired at once (RESERVED/AVAILABLE FR-66, UPGRADE Mirage,
BORROW Veil from a donor ship) — screenshot-verified matching the exact
canonical order/colors/copy this section describes, zero horizontal
overflow at the 1320px reference viewport, then installed the free
AVAILABLE unit and confirmed live: Target unchanged, Status flipped
straight to `OK`, RESERVED/AVAILABLE/UPGRADE all correctly emptied out
with the disclosure still open, Readiness jumped to 100%, Decision
Summary read "No Immediate Decisions," and the success message ("Installed
FR-66 on Right Shield Generator.") carried no target-implying language.

## 51. Install Candidate Hierarchy & Acquisition Card Refinement (EWO-071A, IMPLEMENTED NOW)

A direct refinement of EWO-071's own four-group ladder, from Commander
testing: "the Commander is forced to inspect both [Reserved and
Available] before discovering the reserved copy." Two changes — a strict
fulfillment hierarchy so Reserved always wins outright, and a first-class
card treatment for Record Newly Acquired Component.

**Part A — Reserved always wins.** EWO-071 originally let a Reserved row
and an Available row render side by side for the same exact Target when
both a committed unit and separate genuinely-free stock existed (its own
Part H explicitly allowed this "distinct physical assets" case). EWO-071A
reverses that: whenever a Reserved candidate exists for the Target, the
Available group never independently renders for it at all — any
additional genuinely-free stock folds into that SAME Reserved row instead,
as a compact secondary line ("+N additional available"), never a second
competing group. `installCandidates.ts`'s target-resolution block now
computes availability first, then branches: a reservation present ->
one Reserved candidate carrying an optional `additionalAvailableQuantity`;
no reservation -> the ordinary Available candidate, unchanged from
EWO-071. A structural consequence worth naming: since Reserved and
Available are both strictly scoped to the one exact Target (EWO-071 Part
D), and a Target can have at most one reservation state, **Reserved and
Available can now never coexist as two groups for the same port** —
verified directly (a scenario with 3 owned units, 1 reserved, renders
one Reserved row reading "Reserved for this port" / "+2 additional
available," with no Available pill anywhere).

**Part B/D — Record Newly Acquired Component becomes a first-class
acquisition card.** Previously a small `text-[11px]` hyperlink beneath
the Upgrade section; now a full-width button reusing the exact same
container language as an ordinary candidate row (`bg-black/20`,
`rounded-md`, `px-2.5 py-1.5`, `hover:bg-white/5 transition-colors`) with
a cyan `PackagePlus` icon, headline, a one-line description ("Record
newly looted, purchased, or crafted — install it immediately."), and a
right-aligned "Record →" action — "another acquisition option," not
unrelated helper text. Still never wrapped in its own pilled group
header (would read as a false UPGRADE recommendation) and still opens
the exact same pre-existing inline picker/Record & Install form
unchanged. `candidateRow` (the shared Reserved/Available/Upgrade row
renderer) gained the same `hover:bg-white/5 transition-colors` so every
row in the stack — including the new card — shares one hover language.

Regression coverage: `sw014aInlineInstalledComponentWorkflow.test.tsx`'s
own former "Reserved + Available render as distinct rows" test is
rewritten to assert the new merge (single Reserved row, no Available
pill, `+1 additional available`, exactly one occurrence of the Target's
own name in the disclosure). `ewo071InstallChangeSourceLadder.test.tsx`'s
group-order and color-treatment tests are split into a Reserved-present
scenario (Reserved → Upgrade → Borrow, Available absent) and a
Reserved-absent scenario (Available → Upgrade → Borrow), since the two
can no longer coexist. A new dedicated
`ewo071aCandidateHierarchyAndAcquisitionCard.test.tsx` covers the work
order's own Part E checklist directly: Reserved-before-Available with no
duplicate rendering, the secondary-indicator text appearing only when
real extra stock exists (absent otherwise), the acquisition card's own
container classes matching an ordinary candidate row's exactly
(`rounded-md`/`px-2.5`/`py-1.5`/`hover:bg-white/5`/`transition-colors`),
and its absence from any UPGRADE grouping. Full project regression
(`tsc --noEmit`, full `vitest run`: 185 files / 2360 tests) and a
production build pass clean.

Playwright live-verified against the running dev server: a Target with 3
owned units (1 reserved, 2 free) rendered exactly one Reserved row
reading "FR-66 / Reserved for this port / +2 additional available,"
zero competing Available pill, alongside a real Upgrade candidate and
the new Record Newly Acquired Component card — screenshot-verified
matching the work order's own worked example precisely, including a
close-up hover screenshot of the acquisition card confirming its
elevation state. Zero horizontal overflow at the 1320px reference
viewport.

## 52. Candidate Hierarchy Enforcement & Acquisition Action Promotion (EWO-071B, IMPLEMENTED NOW)

Closes the one gap EWO-071A's own hierarchy fix left open, and finishes
promoting the acquisition card to a true peer of the fulfillment groups.
Chief Architect framing: "A browser asks 'here are all your options.' A
Quartermaster says 'here's the one you should use first.'"

**Part A — Status now agrees with the disclosure's own highest-priority
group.** Root cause: `componentAcquisitionHint.ts`'s `describeAcquisitionHint`
— the single shared authority the Status column, Hero, and Decision
Summary all read — checked genuinely-free stock (`availableQuantity > 0`)
*before* checking whether this exact port already has the component
reserved. EWO-071A already fixed the disclosure's own Reserved/Available
rendering (Part A there), but this OTHER, older priority check was left
untouched — so a component reserved for this port with extra free stock
sitting alongside it could show the Status column reading "1 AVAILABLE"
directly above a disclosure whose own top row read RESERVED: two
contradictory statements about the same physical asset. Fixed by moving
the "reserved for this exact port" check to the very top of the
function, checked unconditionally before the availability check — every
caller (Status column, Hero, Decision Summary) gets the corrected
priority for free, since there is only ever the one shared authority.
The "reserved for a *different* Loadout" tier (`Available to Reserve` /
`Upgrade Available` pill) is untouched and still meaningful for those
other surfaces, even though EWO-071 already dropped its own Reassign
action from the Install/Change disclosure specifically.

**Parts C/D/E — Install New Component promoted to a full peer group.**
Renamed from "Record Newly Acquired Component" (and its form's own
"Record & Install" submit button renamed to "Install") — "the Commander
is not recording something, they're installing something they just
looted, crafted, or purchased." Given its own cyan `NEW` pill header,
pulled out of the Upgrade section's wrapping `<div>` into an independent
sibling group with the exact same header/color/spacing/rhythm every
other group already has ("nothing appears as an orphaned hyperlink
anymore") — and, unlike Upgrade/Available/Reserved/Borrow, NEW always
renders regardless of what else exists, preserving "always reachable."
Final disclosure order: RESERVED (or AVAILABLE, when nothing is
reserved) → UPGRADE → NEW → BORROW?, matching the work order's own Part
E ordering exactly — verified live and via `sw014a`'s Persistence/Remove
regressions, which exercise this exact DOM position unchanged.

Regression coverage: a new `componentAcquisitionHint.test.ts` case
proves the exact contradiction scenario the work order named (2 owned, 1
reserved, 1 genuinely free) now resolves to `Reserved For This Port`,
not `Available in Inventory`. A new dedicated
`ewo071bStatusPriorityAndNewGroup.test.tsx` verifies the Status column
itself (not just the disclosure) reads `RESERVED` — never `AVAILABLE` —
in that same scenario, reads the correct `1 AVAILABLE` when nothing is
reserved, confirms the exact `RESERVED → UPGRADE → NEW → BORROW?` and
`AVAILABLE → UPGRADE → NEW → BORROW?` DOM orders, and confirms NEW
renders even when every other group is empty. Every prior EWO-071/071A
test referencing the old "Record Newly Acquired Component"/"Record &
Install" text was updated to the new naming. Full project regression
(`tsc --noEmit`, full `vitest run`: 186 files / 2366 tests) and a
production build pass clean.

Playwright live-verified against the running dev server, reusing
EWO-071A's own Reserved-plus-extra-stock-plus-Upgrade-plus-Borrow
scenario: the row's own Status column reads exactly `RESERVED` (not "1
AVAILABLE"), and the disclosure shows RESERVED → UPGRADE → NEW → BORROW?
in that exact order, with NEW rendering its own cyan pill and the "Install
New Component / Looted, purchased, or crafted. / Install →" card —
screenshot-verified matching the work order's own worked example
precisely. Zero horizontal overflow at the 1320px reference viewport.
