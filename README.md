# Strategic Fleet Manager

A local-first prototype for Star Citizen fleet and loadout management.
Sprint 1.2 polishes the working prototype from Founder QA and adds real ship
imagery. Still not production software.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173`).

To type-check and build a static production bundle:

```bash
npm run build
npm run preview
```

## Ship Import Pipeline (developer tooling)

A generalized StarBreaker ship-import pipeline lives alongside the app —
see `docs/DATA_ENGINE.md` for the full architecture. To (re)generate
`generated-data/` from the raw-data fixtures:

```bash
npm run import:ships                                   # every raw-data/*.json
npm run import:ship -- "raw-data/AEGS Gladius.json"     # one file
npm run test                                             # unit + integration tests
```

This runs entirely under Node — no dev server required — and is what
powers the "(Imported)" developer-only ship options on Ship Detail.

## Sprint 1.2 Scope

Ship Detail remains the P0 — every other workflow depends on it.

- **Ship images** — every ship in seed data now has a real RSI `imageUrl`.
  Fleet Dashboard cards show it with a dark gradient overlay so text stays
  readable; Ship Detail has a wide hero banner using the same image. Any ship
  without an `imageUrl` falls back to the existing placeholder icon.
- **Mission Control** — Procurement List column renamed to "Component Name",
  sorted A–Z by default; Size/Type is now a single combined column (e.g. "S1
  Power Plant") instead of two; Needed By stays unsorted. "Overall Fleet
  Readiness" and the Owned/Purchased/Loaner breakdown on Ships Active carry
  over from Sprint 1.1.
- **Fleet Dashboard** — Card/Table toggle retained; all existing
  filters/sorts still apply to both views.
- **Ship Detail (P0)** —
  - Ship **location has been removed entirely**, everywhere. Ships are
    claimable anywhere; only Components are location-bound (see Hangar
    Inventory below).
  - "Select Ship" is clearly labeled with an icon and now sorted
    alphabetically A–Z.
  - New hero image banner with a dark overlay, showing ship name,
    manufacturer, ownership, active Build, and readiness at a glance.
  - The hardpoint table always shows every relevant slot (Weapon 1/2, Power
    1/2, Shield 1/2, Cooler 1/2, Quantum Drive, Radar, Life Support), not
    just mismatches, and switching the Active Build selector recomputes
    missing items, readiness, and every hardpoint's status live.
  - Hardpoint status logic is unchanged from the corrected Sprint 1.1 rule
    set: Installed Loadout is seeded from Factory Loadout when a ship/build
    is created, and a part that's already been swapped away from factory
    stock but isn't the Target item yet shows **Upgrade Available**, not
    Missing.
- **Build Manager** — added a **Build Library** table above Assigned Ship
  Builds: reusable reference templates (Stealth, Military, Mining, Daily
  Driver, Cargo, Salvage) with name/category/description. Add/Edit/
  Duplicate/Delete-with-confirmation on Assigned Ship Builds are unchanged
  from Sprint 1.1 and still backed by real local state.
- **Hangar Inventory** — Vendor disposition remains removed (Install, Store,
  Stockpile, Trade, Ignore only). Add New Item and Move to Ship remain wired
  to local state. `HangarItem` now has an optional, unused `location` field
  reserved for a later sprint — Components are location-bound, ships aren't.
- **Quick Update** — "Vendor loot" and "Claimed ship" have both been removed.
  "What changed?" is now: Add Component to Hangar, Install Component, Remove
  Component, Move Component Between Ships, and Change Active Build. Each
  updates real local state (hardpoints, readiness, hangar, or active build)
  and appends a Captain's Log entry. Find Item search-preview behavior is
  unchanged and now also recognizes FR-86.
- **Decision Center** — replaced the exact-match input with a typeahead:
  start typing and matching catalog items appear, narrowing as you type
  ("M" → "Mi" → "Mirage"); clicking a suggestion fills the input and shows
  the recommendation immediately. KEEP/IGNORE/CHECK BUILD logic is unchanged
  (Mirage, Slipstream, Snowblind, FR-86 → KEEP; S4/Revenant → IGNORE;
  anything else → CHECK BUILD).
- **Captain's Log** — unchanged component; continues to receive entries from
  every mutating action, including the new Change Active Build and Move
  Component Between Ships flows. Vendor trash is still never logged, because
  it's never tracked.
- **Dropdown/input contrast fix** — every native `<select>`/`<option>` and
  text input now gets a consistent dark theme (`color-scheme: dark` plus
  explicit background/text colors matching the spec), fixing the light-gray-
  background-with-blue-text rendering some dropdowns had.

## Intentionally Out of Scope

- No backend, database, or auth — everything lives in local seed data and
  in-memory Zustand state. Refreshing the page resets any changes.
- No real item catalog or search beyond the seeded demo/decision catalogs.
- No crafting simulator, economy simulation, organization sharing, player
  marketplace, three-tier readiness score, GitHub version checker, splash
  screen, or logo integration.
- Hardpoint data beyond the Ghost Mk II and a handful of named-target ships
  is otherwise a factory-OK placeholder set, not exhaustive ship-accurate
  loadout data.
- Build Library "Use Template" is a mock confirmation, not a real seeding
  action yet.

## Notes for Sprint 2

- Wire Build Library "Use Template" to actually seed a new Assigned Ship
  Build from the template's category defaults.
- Add a real Location field/column to Hangar Inventory now that the type
  supports it, once the UI need is clear.
- Expand ship-accurate hardpoint data across the full fleet.
- Expand the Decision Center / Quick Update catalogs beyond the seeded demo
  items.
- Consider persistence so updates survive a page refresh.
- GitHub-based version checking remains explicitly deferred.
