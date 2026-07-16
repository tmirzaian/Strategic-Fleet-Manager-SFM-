# ADR-009 — Separating Role, Loadout, and Mission (Architecture Recommendation)

- **Status:** Proposed (EWO-024, Task 6 — architecture recommendation only, no implementation)
- **Date:** 2026-07-14

## Context

Commander Sea Trials feedback (EWO-024) observed that Strategic Fleet Manager
currently has no clean separation between three genuinely different
concepts:

- **Role** — the ship's operational purpose (General Purpose, Medical,
  Cargo Escort, Bounty Hunting, Mining, Exploration).
- **Loadout** — the physical equipment currently installed.
- **Mission** — what the ship is doing *today*.

A real Star Citizen build routinely mixes several equipment *classes*
(Military, Competition, Industrial, Civilian, Stealth) in one
configuration, and a single hull can serve different Roles at different
times without any hardware changing at all (a Cutlass Black used for
bounty hunting this week and escort duty next week is still the exact
same Loadout). The current data model cannot represent that.

### What the current model actually does today (verified against the live type definitions, not assumed)

| Field | Where | What it actually is today |
|---|---|---|
| `Ship.role` (`src/types/index.ts`) | Fleet Dashboard/Mission Control card subtitle | Copied from the **active Build's own `role` field** at materialization/save time — not independently set. Changing the Active Loadout silently changes what card readers perceive as the ship's "role." |
| `Build.role` (`src/types/index.ts`) | Set once per Build, at `saveMissionConfiguration`/`materializeFleetAsset` time | Literally copied from `ship.role` (or `definition.role`) at the moment the Build is created — a Loadout has no role concept of its own; it just inherits whatever the ship's role happened to be. |
| `Ship.career` | Card subtitle, seed/import data | A coarse RSI career bucket ("Combat", "Industrial", "Medical") — closer to a genuine Role taxonomy, but sourced from the *ship type's* factory classification, not a Commander's own intent for *this specific Fleet Asset*. |
| `Ship.primaryRole` / `Ship.secondaryRole` (Alpha 2.4, Fleet Profile) | Ship Detail's Fleet Profile editor | **Already** an explicit, player-editable, free-text field — already independent of `role`/loadout and of `ShipClassification`, by original design intent. Under-surfaced: not shown on Fleet Dashboard/Mission Control cards, not used by sorting/filtering, not referenced by Loadout Manager. |
| `ShipClassification.rsiRoles` / `.focusTags` (`emptyClassification()`) | Reserved, currently always empty for every ship (deep-import and seed alike) | The *authoritative*, catalog-level classification slot this architecture already reserved for exactly this purpose — never populated by any current pipeline (see EWO-023's Task 7 audit: 0 of 6 deep-imported ships have non-empty classification). |
| **Mission** | *(no dedicated field exists)* | Renamed away in Alpha 2.4 ("Mission Composer" → "Loadout Manager", "Mission Configuration" → "Loadout") in favor of one vocabulary: Loadout. The closest analog today is "Active Loadout" itself, which conflates *equipment configuration* with *current task* — switching what a ship is doing today currently requires switching its whole physical configuration, even when the hardware doesn't actually need to change.

**Finding:** the seams for Role/Loadout separation already exist
(`primaryRole`/`secondaryRole`, `ShipClassification`) — they're just
disconnected from the rest of the app and never populated by any current
pipeline. Mission has no seam at all; it was actively designed out of the
vocabulary in Alpha 2.4 for good reason (four overlapping words for one
idea was a real, previously-diagnosed confusion — EWO's own Loadout
Manager doc comment says so directly) and now needs to be reintroduced as
a **distinct**, narrower concept, not as a return to the old overlap.

## Recommendation

Three independent concepts, each with its own field(s), each editable
without disturbing the others:

### 1. Role — operational purpose (Commander intent, ship-level, persistent)

- Promote `Ship.primaryRole`/`secondaryRole` (Fleet Profile) from an
  under-surfaced edit-only field to the **authoritative** Role — shown on
  Fleet Dashboard/Mission Control cards *instead of* (or alongside,
  clearly distinguished from) the current `Ship.role` passthrough.
  Structurally this already fits the mission's request exactly (General
  Purpose, Medical, Cargo Escort, Bounty Hunting, Mining, Exploration —
  all natural free-text or a small closed enum for `primaryRole`).
- Stop deriving `Ship.role`/`Build.role` display text from one another.
  `Build` should not carry a `role` field at all in the target
  architecture — a Loadout is equipment, not a job description; a ship's
  Role does not change when its Active Loadout changes.
- `ShipClassification.rsiRoles`/`focusTags` remains the **catalog-level**
  authoritative classification (what the *hull type* is designed for,
  per real RSI data, once a pipeline populates it) — a reference/default
  Role can be suggested from it, but the Commander's own Fleet-Profile
  Role always wins, matching the existing, already-correct field
  precedence comment in `types/index.ts`.

### 2. Loadout — installed equipment (unchanged in kind, decoupled in naming)

- Stays exactly what it is today structurally (a `Build`/Hardpoint set) —
  this mission's Task 4 already improved *how* a Loadout is saved/edited/
  cloned without touching what it fundamentally represents.
- The one required change: **remove `Build.role`**. A Loadout's
  "category" (the free-text field Task 5 discussed hiding Presets for)
  should describe the *equipment class* mix it actually contains
  (Military/Competition/Industrial/Civilian/Stealth — Task 5's own
  language) rather than reusing the ship's operational Role vocabulary.
  These are different axes today conflated into one `category` string;
  a future Loadout could legitimately be tagged with more than one
  equipment class simultaneously (the mission's own example: "Actual
  builds frequently combine Military, Competition, Industrial, Civilian,
  Stealth within a single configuration").

### 3. Mission — what the ship is doing today (new, narrow, ship-level, transient)

- A new, small, **optional** field — e.g. `Ship.currentMission?: string`
  or a dedicated `MissionAssignment` record (`{ shipId, description,
  since }`) — completely independent of which Loadout is active. Changing
  a ship's Mission never touches its Build/Hardpoint records at all.
- Deliberately the *thinnest* of the three: free text or a small preset
  list ("Escort Convoy," "Bounty Contract," "Standby"), no compatibility
  engine, no readiness calculation, no persistence-model weight — this is
  a Commander's own situational note, not authoritative game data.
- This is genuinely new scope, not a renaming of something that already
  exists — unlike Role and Loadout, there is no existing seam to repurpose.

## Why this needs its own release, not a fold-in to EWO-024

- Changing what `Ship.role`/`Build.role` mean is a **breaking display
  change** for every existing page that currently reads `ship.role`
  (Fleet Dashboard, Mission Control, Ship Detail, Loadout Manager) —
  requires a coordinated pass across all of them, plus a persisted-data
  migration decision for existing saves (`schemaVersion` bump), which
  EWO-024's own "no persistence model changes" constraint correctly
  excludes from this mission.
- Populating `ShipClassification.rsiRoles`/`focusTags` for real requires
  an import-pipeline change (a new field discovered from raw StarBreaker/
  DataCore data, the same category of work as EWO-023's manufacturer
  fix) — its own scoped mission, not a UI refinement.
- Mission is entirely new data, not a refactor — it needs its own design
  pass on where it's surfaced (a Fleet Dashboard badge? A Mission Control
  widget? Both?) before implementation, independent of this mission's
  Loadout-workflow scope.

## Recommended sequencing for a future release

1. Surface existing `primaryRole`/`secondaryRole` more prominently
   first (lowest risk — the field and its editor already exist, this is
   purely a visibility/adoption change).
2. Remove `Build.role`'s dependency on `Ship.role` (decouple the two
   fields so a Loadout's category and a Ship's Role stop mirroring each
   other) — a contained, single-file-ish change once Role's display
   surface is settled.
3. Introduce Mission as new, optional, narrow-scope data.
4. Populate `ShipClassification` from the import pipeline as a separate,
   later mission, once a real DataCore source field is identified and
   verified (do not guess a mapping the way EWO-023's manufacturer fix
   required verified evidence, not invention).

No code changes are included in this mission per Task 6's explicit
instruction — this document is the deliverable.
