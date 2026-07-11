# ADR-003 — Resolve Component Metadata Authoritatively

- **Status:** Proposed
- **Date:** 2026-07-11

## Context

StarBreaker loadout nodes identify entity classes but do not provide enough metadata to classify equipment safely.

Examples include weapons, mounts, and geometry subcomponents in the same hierarchy.

## Decision under consideration

Introduce a `ComponentMetadataResolver` between loadout adaptation and port classification.

The resolver should:

- look up exact entity class names
- return explicit resolved or unresolved results
- include provenance
- avoid certified name-pattern guesses
- identify configurable equipment when authoritative data supports it
- keep geometry/internal subcomponents out of the fleet loadout model

## Open questions

- Which repository or imported data source is authoritative?
- Does an existing P4K-derived catalog already contain the required keys?
- How should embedded legacy metadata interact with catalog data?
- How should curated corrections be versioned?
- What completeness threshold is required for import certification?

## Consequences

This decision will determine whether real StarBreaker fixtures can be certified without weakening SFM's truth-over-convenience principle.
