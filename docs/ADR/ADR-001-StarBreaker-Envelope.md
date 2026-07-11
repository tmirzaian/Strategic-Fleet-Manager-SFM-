# ADR-001 — Support StarBreaker `root.entity` Envelope

- **Status:** Accepted
- **Date:** 2026-07-11

## Context

Legacy ship exports expose the ship entity at `doc.entity`. Strict StarBreaker exports expose it at `doc.root.entity`.

Without a compatibility boundary, downstream normalization would depend directly on exporter version.

## Decision

Add a single exported `resolveShipEntity(doc)` function.

Resolution order:

1. usable legacy `doc.entity`
2. usable StarBreaker `doc.root.entity`
3. explicit failure

Normalize the `EntityClassDefinition.` prefix in both forms.

## Consequences

- Stable IDs remain consistent across exporter envelopes.
- Downstream normalization does not branch on envelope format.
- Missing entity data fails explicitly.
