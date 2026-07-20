# ADR-012 — Canonical Domain Models

- **Status:** Accepted
- **Date:** 2026-07-20

## Context

EWO-051's Manufacturer Audit found two distinct, compounding defects in
`ShipDefinition.manufacturer`:

1. **A genuine importer omission.** 34 real deep-imported ships (Blade,
   MTC, ROC, Prowler, Talon, the Wolf/Merlin/Archimedes family, Nox
   family, San'tok.yāi, and more) had a blank `manufacturer` field — not
   because the manufacturer was unknown, but because the deep-import
   pipeline never cross-referenced the same real DataCore manufacturer
   record Mission M-012's ship-catalog generator had already resolved for
   the identical hull (by `sourceEntityClass`).
2. **A normalization omission.** 8+ real manufacturers were stored under
   2-3 different literal raw strings fleet-wide (`"Rsi"` / `"Roberts Space
   Industries"` / `"RSI"`; `"Aegis Dynamics"` / `"Aegis"`; etc.) — nothing
   ever canonicalized the raw value at all, so every consumer (ShipCard,
   Add Ship search, Ship Detail) inherited whichever spelling the source
   data happened to carry, and manufacturer search/filtering had to
   independently guess at every variant to match correctly.

This is the same class of problem ADR-011 addresses for equipment
categories — an external, inconsistent vocabulary reaching application
code with no single point of normalization — generalized to the
principle every canonical-identity field in this codebase should follow.

## Decision

**Normalize once. Consume everywhere.** An imported identity or display
value is normalized at the domain boundary — the one place raw generated
or imported data becomes a first-class SFM domain object — and every
downstream consumer (UI presentation, search, validation, persistence)
reads that already-canonical value. No consumer maintains its own
independent translation, alias table, or spelling-tolerance logic.

For manufacturers, the boundary is `src/data/shipDefinitions.ts`, at the
point each of the three `ShipDefinition` sources (`seedDefinitions`,
`importedDefinitions`, `catalogDefinitions`) is constructed:
`canonicalManufacturerName` (`src/utils/manufacturerLogo.ts`) is applied
to every raw manufacturer value before it is ever stored. The importer
omission is closed the same way: `importedManufacturerFor` falls back to
the ship-catalog's own already-resolved record (cross-referenced by
`sourceEntityClass`) whenever a deep-imported ship's own raw manufacturer
field is blank — only a hull with no catalog record *and* no raw value at
all resolves to `'Unknown'`. Manufacturer *search* (`manufacturerMatchesQuery`,
`manufacturerCodeFor`) is built on top of this same canonical value, not a
second independent alias resolution.

This mirrors the exact precedent ADR-010 already established for
component identity (`entityClass` resolved once, at the point a component
enters the system, then compared canonically everywhere downstream) and
ADR-011 for equipment category vocabulary — this ADR names the
general principle those two are each an instance of, so a future
canonical-identity field (a role, a career, a classification) has a named
pattern to follow rather than re-deriving the same decision independently.

## Consequences

Every `ShipDefinition` now carries exactly one canonical manufacturer
string; the same raw value never survives under two different spellings.
No UI, search, or validation code needs its own manufacturer-alias
awareness — a query like `"Roberts"` or `"Rsi"` matches through
`manufacturerMatchesQuery` against the one canonical form every ship
already stores. Fixing a future manufacturer-spelling gap means adding an
alias at `manufacturerLogo.ts`'s canonicalization boundary, never adding a
special case at a consumer.
