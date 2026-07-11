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

## Update — Mission M-006 / M-007 progress (still Proposed)

Two follow-on missions made concrete progress toward the open questions
above, without resolving this ADR:

- **M-006 (investigation):** confirmed a local StarBreaker install plus
  the installed Star Citizen `Data.p4k` (LIVE, build `4.8.184.64329`) can
  resolve exact-entity-class DataCore records — 13/13 traced Gladius
  entities matched exactly, answering "which repository is authoritative"
  and "is the key compatible with StarBreaker `entity`" in the affirmative
  for local StarBreaker generation specifically.
- **M-007 (implementation):** built `scripts/generateComponentCatalog.ts`
  (`npm run generate:component-catalog`), a standalone generator that
  produces `generated-data/component-metadata-catalog.json` from exactly
  that source, scoped to the entity classes SFM's `raw-data/*.json`
  fixtures actually mount. This is **not** the `ComponentMetadataResolver`
  itself — nothing in `src/` reads this catalog yet, and no
  legacy-embedded-metadata interaction, curated-correction versioning, or
  completeness-threshold policy has been decided.

**Still open:** the licensing/redistribution question (can this catalog
ever be committed to the repo, or must every developer generate their
own locally, forever?) is unresolved and blocks moving this ADR to
Accepted. The generated catalog is `.gitignore`d pending that decision.

## Update — Mission M-008 / M-009 progress (still Proposed — licensing unresolved)

- **M-008:** built `src/normalizer/componentMetadataResolver.ts` (the
  `ComponentMetadataResolver` this ADR proposed — pure exact-key lookup,
  lazy-loaded, cached, explicit resolved/unresolved results, provenance
  tag `'catalog'`) and `src/normalizer/componentMetadataEnrichment.ts` (a
  separate stage that fills missing `factoryComponent` fields, legacy
  data always wins). Wired into `ShipNormalizer`. This answered "how
  should embedded legacy metadata interact with catalog data" (legacy
  wins, nullish-coalesced) but deliberately did **not** touch
  classification — `node.portType` was left alone on purpose.
- **M-009:** built the classification translation layer this ADR's
  original "identify configurable equipment" and "keep geometry/internal
  subcomponents out of the fleet loadout model" bullets called for:
  `src/normalizer/classificationTranslator.ts` (exact DataCore
  Type/SubType -> canonical port type, or explicit `excluded`/`unresolved`)
  and `src/normalizer/classificationEnrichment.ts` (the pipeline stage
  that applies it). See docs/ImportPipeline.md's "Stage 4b" for the full
  mapping table and the `Mount_Gimbal_S3` structural-disambiguation
  decision. **Result: the real Gladius fixture now certifies 26 classified
  ports across 9 equipment groups with zero validation errors** — this
  ADR's central question ("can real StarBreaker fixtures be certified
  without weakening SFM's truth-over-convenience principle") is answered
  **yes** for the classification half of the problem specifically.

**Completeness threshold:** not fully answered — `Armor` and any
unrecognized category remain `unresolved` by design (see Stage 4b), and
several `goldenFixture.ts` expectations now disagree with the
authoritative DataCore-derived result (component identity, missile-rack
loadout composition, a parent/child equipment-resolution ordering
question for nested QuantumDrive/JumpDrive equipment) — reconciling the
golden fixture is explicitly left as a follow-on decision, not resolved
by M-009.

**Still open, unchanged:** the licensing/redistribution question. This
ADR stays "Proposed" for that reason alone — every other open question
from the original list now has a concrete, implemented, tested answer.
