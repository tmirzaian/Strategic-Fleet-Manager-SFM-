# ADR-002 — Introduce a Loadout-Node Compatibility Adapter

- **Status:** Accepted
- **Date:** 2026-07-11

## Context

Legacy loadout nodes combine port constraints and installed component metadata. StarBreaker nodes provide entity hierarchy and port identity but omit structured classification and constraints.

## Decision

Represent raw nodes as a union of `LegacyLoadoutNode` and `StarBreakerLoadoutNode`.

Adapt both forms once through `adaptLoadoutNodes()` into `CanonicalLoadoutNode`.

Map only supported facts:

- StarBreaker `port` -> canonical `itemPortName`
- StarBreaker `entity` -> canonical component `internalName`

Do not guess missing metadata.

Malformed nodes are warned about and removed. Valid children are promoted.

## Consequences

- Raw schema branching remains isolated.
- Existing downstream code consumes one canonical shape.
- StarBreaker fixtures become structurally readable.
- Classification remains unresolved until authoritative metadata is available.
