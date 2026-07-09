# Strategic Fleet Manager

A local-first prototype for Star Citizen fleet and loadout management.
Sprint 1.1 stabilizes the Sprint 1 concept based on Founder QA — it is still
not production software.

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

## Sprint 1.1 Scope

Ship Detail is the P0 of this sprint — every other workflow depends on it
being trustworthy.

- **Mission Control** — "Overall Fleet Readiness" (renamed), a Ships Active
  card broken out by Owned / Purchased / Loaner, "Ship Detail" buttons on
  priority cards, and a new **Procurement List** widget that aggregates
  every open hardpoint target across the whole fleet (component, type/size,
  quantity needed, and which ships/builds need it) — not just what's missing
  on one ship.
- **Fleet Dashboard** — a Card / Table view toggle. Table view adds Ownership,
  Career, Role, Active Build, Readiness, Missing Items, and a Ship Detail
  action, and existing filters/sorts still apply to both views.
- **Ship Detail (P0)** — a ship header/image area, a clearly labeled "Select
  Ship" control, and full support for multiple Builds per ship. The Ghost Mk
  II now has both a **Stealth Build** and an **Escort Build**; switching the
  build selector recomputes missing items and every hardpoint's status
  against that build's targets. Hardpoint status now follows the corrected
  rule set: Installed Loadout is seeded from Factory Loadout when a
  ship/build is created and can drift from both Factory and Target — a part
  that's already been swapped away from factory-stock but isn't yet the
  Target item shows **Upgrade Available**, not Missing.
- **Build Manager** — Add New Build (picks a ship, seeds a fresh Build from
  Factory Loadout), Edit (name/role), Duplicate, and Delete (with a
  confirmation step) are wired to real local state, not just a modal.
- **Hangar Inventory** — "Vendor" has been removed as a disposition entirely.
  Allowed dispositions are Install, Store, Stockpile, Trade, and Ignore.
  Add New Item and Move to Ship are wired to local state; moving an item to a
  ship consumes an open hardpoint on that ship's active Build if one exists.
- **Quick Update** — "Vendor loot" has been removed from "What changed?" and
  replaced with "Removed component" (alongside Installed component, Added to
  Hangar, and Claimed ship). Saving an Installed/Removed component update
  changes the ship's actual hardpoint state and readiness, not just a
  cosmetic log line. The Find Item search-preview behavior is unchanged.
- **Decision Center** — vendor recommendations are gone. Items no build needs
  are recommended **Ignore**, not Vendor, and FR-86 now returns a KEEP
  recommendation (needed by Corsair or Cutlass Black).
- **Captain's Log** — auto-generates entries for Quick Update saves, Hangar
  items added, disposition changes, components moved to a ship, and Builds
  created/edited/duplicated/deleted. Vendor trash is never logged, because it
  is never tracked.

## Intentionally Out of Scope

- No backend, database, or auth — everything lives in local seed data and
  in-memory Zustand state. Refreshing the page resets any changes.
- No real item catalog or search — Quick Update's "Find Item" only recognizes
  the demo items from the spec (Slipstream, Mirage, Snowblind, Revenant).
- No crafting simulator, economy simulation, organization sharing, or player
  marketplace.
- No three-tier readiness scoring — readiness is a single 0–100 number per
  ship/build, derived from the ratio of OK hardpoints to total hardpoints.
- Hardpoint data beyond the Ghost Mk II, MOLE, Railen, Cutlass Black/Red, M80,
  Starlite, Vulture, and Prospector's named targets is otherwise a factory-OK
  placeholder set, not exhaustive ship-accurate loadout data.

## Notes for Sprint 2

- Expand ship-accurate hardpoint data across the full fleet (right now the
  Ghost Mk II has the deepest, most realistic detail).
- Expand the Quick Update "Find Item" search to a full local item catalog
  instead of the four demo entries.
- Consider persistence (e.g., localStorage or a lightweight backend) so
  updates survive a page refresh.
- Revisit Move to Ship so it can target a specific open slot when a ship has
  more than one outstanding hardpoint, instead of matching the first open
  one.
- GitHub-based version checking, mentioned in the original concept, is
  explicitly deferred past Sprint 1.
