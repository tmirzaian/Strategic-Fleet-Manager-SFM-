# Changelog

All notable changes to Strategic Fleet Manager are documented in this file.

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
