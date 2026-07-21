# Changelog

All notable changes to Strategic Fleet Manager are documented in this file.

## Strategic Fleet Manager Beta 1.2

Certified commit `a6eddaf`. Certified for Star Citizen LIVE
4.9.186.42610.

### Compatibility and Loadout Integrity

- Fleet-wide turret and gimbal-mount compatibility fixed — a Ship or
  ground vehicle whose factory loadout uses turret-shell hardware
  (previously reported on the Greycat MTC, also affecting the Ballista,
  Centurion, Spartan, 890 Jump, Lynx, Nova, and Ursa Rover/Medivac
  families) now validates through a genuine, verified match rather than
  an accidental pass.
- Correct validation restored for the affected vehicle and ship factory
  configurations fleet-wide, not just the one originally reported.
- Obsolete compatibility exceptions for these ships removed now that they
  validate for real.

### Manufacturer Integrity

- Canonical manufacturer naming throughout SFM — every ship now shows one
  consistent manufacturer name, with no more blank or duplicate spellings
  (e.g. "Rsi" vs. "Roberts Space Industries" vs. "RSI") anywhere in the
  certified ship catalog.
- Improved manufacturer search — searching by a manufacturer's common name
  or alias reliably finds every ship it makes.
- 34 previously-unlabeled ships (including the MTC, ROC, and Blade) now
  correctly display their real manufacturer.

### Inventory Transaction Integrity

- Installing a replacement component into a slot that still holds a
  different, real component now preserves that displaced component in
  Hangar Inventory instead of silently losing it.
- Transfers between ships correctly account for a real component already
  occupying the destination slot.
- A failed or incompatible installation attempt leaves both the ship and
  Hangar Inventory completely unchanged — no partial updates.
- Inventory mutations remain atomic and identity-aware throughout.

### Loadout Persistence Integrity

- Mining module and missile rack slot selections now reliably survive
  saving, reopening a Loadout for editing, navigating away and back, and
  a full application restart — previously, a saved selection could
  appear to vanish the moment it was made, or be silently lost on a
  later reload.

### Fleet Navigation

- Fleet Dashboard's filters — Ownership, Manufacturer, RSI Role, and
  Readiness — now combine freely (e.g. "Industrial ships built by Argo
  that are Ready"), instead of one filter replacing another.
- New Manufacturer filter, using each ship's canonical manufacturer
  identity.
- Sorting now also supports Ship Name, Manufacturer, and RSI Role,
  alongside the existing Priority and Readiness.
- The Commander's active filter and sort selections now survive
  navigating to Ship Detail and back.

### Known limitations carried into this release

- "::Tractor Beam" bare-name compatibility ambiguity (a separate,
  ToolArm-category gap) remains open — not addressed by this build.
- Hangar Inventory's Disposition tag (Install/Store/Stockpile/Trade/
  Ignore) is not yet enforced against availability/install logic — a
  component marked Trade or Ignore can still be consumed by an install.
- No Windows installer yet; no RSI/CCUGame synchronization yet.

## Strategic Fleet Manager Beta 1.0

Certified commit `e5d1708`. Certified for Star Citizen LIVE 4.9.186.42610.

### Golden Fleet certification

- Full Golden Fleet ship roster promoted from real Star Citizen LIVE data —
  deep-imported port trees and factory loadouts, not hand-authored fixtures.
- Canonical ship identity resolved against the game's own official naming
  and manufacturer data, so Commander-facing names match RSI's own
  presentation.
- Fleet role/classification metadata restored across the roster, so
  Fleet Dashboard's Combat/Transport/Industrial/Support/Ground/etc. filters
  work across the certified fleet.

### Fleet persistence and reconciliation

- A hardpoint reconciliation engine migrates a Commander's Custom/Mission
  Build assignments forward across a Fleet template change, quarantining
  only assignments that genuinely no longer have a match instead of
  discarding them.
- Installed-state resolution unified so persisted state is always the
  single source of truth for a hardpoint's installed component across a
  reload.

### Loadouts and component data

- Factory and Target loadouts initialize and compare correctly across the
  certified fleet.
- Component catalog regenerated from current Star Citizen LIVE data,
  including a fix for a stale local cache that had been silently hiding
  newly-added ships and components from a LIVE content update.

### Ship imagery

- Commander-maintained ship image workflow: a spreadsheet-driven registry
  that resolves real RSI imagery for the ships the Commander has supplied a
  URL for, with a universal fallback for the rest.

### New ships

- **Grey's Basher** and **Grey's Shiv** (manufacturer: Grey's Market)
  integrated with full factory port trees and loadouts, promoted through
  the same certified pipeline as the rest of the fleet.

### Local-first operation

- No backend, no account, and no telemetry — your fleet lives in your
  browser. See [PRIVACY.md](PRIVACY.md).

### Known Beta limitations

- Browser-local persistence only; no cloud sync
- No RSI or CCUGame synchronization yet
- No Windows installer yet — Node.js is required to launch the Beta
- Some fleet-wide component-name ambiguities remain under investigation
- No telemetry or automatic update service
- Some ship images use the SFM fallback artwork rather than real imagery
