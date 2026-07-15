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

Mission Control communicates, top to bottom, in this fixed order:

1. Application identity (sidebar, persistent, not part of the page itself)
2. Mission Control identity — "Mission Control" / "Fleet Operations"
3. Overall Fleet Readiness (command-console rail, right side of the Fleet
   Operations region)
4. Fleet size ("Ships Active") and Needed Items (same rail)
5. Top Priority Ship(s) — up to three live records (EWO-012)
6. Quartermaster Fleet Status (Mission Ready / Loadouts In Progress /
   Factory Loadout)
7. Quartermaster Inventory Status (Missing Components / Unreserved
   Inventory)
8. Procurement
9. Operational workflow destinations (Found Loot? / Something Changed?)
10. Application footer (Update Budget + version identity)

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
| Advisory Gold | `gold` | `#C9A227` | reserved for restricted command/advisory authority only. Defined by EWO-014 for the Sidebar slogan's "Outfit" word, which EWO-015 removed from live JSX — that word (and its gold color) is now baked into the commissioned brand-lockup image (§2) rather than rendered by the Tailwind token. The `gold` token itself remains defined (harmless, currently unreferenced in application code) in case a future JSX use case needs it. **Do not use it as a general accent without a new explicit Design Authority instruction.** |
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

## 8. ShipRecordCard — the Fleet Registry Record standard (IMPLEMENTED NOW)

**DA-010 — Fleet Registry Record ("it is all one ship").** Frozen EWO-012,
art-layer architecture established by EWO-012A, tuned by EWO-012B. Every
ship is represented as one integrated record — the vessel appears to
exist *inside* the record, not attached to it. Superseded EWO-009's 30/70
image-left/content-right split, which read as an image panel bolted onto
a data card — explicitly rejected by Design Authority visual review.

`src/components/ShipRecordCard.tsx` is the canonical Fleet Registry
Record template, used today by `PriorityCard` (Mission Control's Top
Priority Ship section) via a thin Mission-Control-specific wrapper that
adds only the "PRIORITY N" badge.

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

## 9. Update Budget — single-instance rule (IMPLEMENTED NOW)

"Update Budget" renders in exactly one place application-wide: the
Mission Control footer (§10). It no longer appears in the command-console
rail, and the sidebar's former duplicate status strip has been removed.
The underlying "2 min" value is an unchanged literal, not a calculation.

## 10. Footer standard (IMPLEMENTED NOW)

One full-width operational footer at the bottom of Mission Control's
content, pinned to the viewport's bottom edge when content is short (via
the page root's `min-h-[calc(100vh-*rem)] flex flex-col` + `flex-1`
content wrapper) and following content naturally when it overflows.
Content: left, "Update Budget · 2 min"; right, "Strategic Fleet Manager ·
Quartermaster Edition · {APP_VERSION_LABEL}". No server status, build ID,
or network state is invented.

## 11. WorkflowDestinationCard standard (IMPLEMENTED NOW / APPROVED FUTURE HARDPOINT)

`src/components/WorkflowDestinationCard.tsx` — an operational workflow
destination, not a metric. Visually distinct from `CriticalMetricTile`:

- a dedicated illustration hardpoint (`sm:w-[34%]`, `min-h-[104px]`) that
  today shows a neutral dashed-circle + icon treatment (never a small
  data-tile icon box, never a broken `<img>`, never a large blank hole)
- strong title, one supporting supporting line, an "Open →" action
- the entire card is a single `<Link>` (full-card click), with a visible
  `focus-visible:ring-2` keyboard focus state

Used today for "Found Loot? Check It." → `/decision-center` and
"Something Changed?" → `/quick-update`, placed near the bottom of the
operational cadence, after Procurement.

**Semantic illustration registry (APPROVED FUTURE HARDPOINT):**
`src/config/assets/workflowAssets.ts` registers two semantic illustration
IDs — `decision-center-found-loot` and `quick-update-hangar` — both
`enabled: false` today, mirroring the branding/environment asset pattern.
`MissionControl.tsx` references only the semantic ID, never a raw path.
Approved future concepts (not yet commissioned): a citizen/technician
standing among recovered components, uncertain what to keep
(`decision-center-found-loot`); a spacecraft in a maintained hangar while
components are fitted or hoisted into position (`quick-update-hangar`).

## 12. PageEnvironment and future hardpoints (APPROVED FUTURE HARDPOINT)

`src/components/layout/PageEnvironment.tsx` is mounted inside Mission
Control's Fleet Operations region (`id="mission-control"`) today. Every
`EnvironmentAssetDefinition` in `src/config/assets/environmentAssets.ts`
ships `enabled: false` — the component always renders `null` currently.
This is intentional dormant infrastructure, not a bug. The Fleet
Operations region's height (`lg:min-h-[400px]`) was sized to support a
future cinematic environment without the current, asset-less page reading
as an empty rectangle — every pixel in the region today is either the
command-console rail or a reserved, bordered/bracketed frame.

Do not claim the Commander badge (HP-002), UTC clock (HP-003), cinematic
environment, workflow illustrations, or full Fleet Registry imagery exist
— none are delivered as of this mission.

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
