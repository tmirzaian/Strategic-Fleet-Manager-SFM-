# Strategic Fleet Manager — Import Pipeline

## Purpose

The import pipeline converts exporter-specific Star Citizen data into stable SFM domain records.

## Pipeline

```text
JSON document
   |
   v
RawShipExport parsing
   |
   v
Envelope resolution
   |
   v
Loadout-node adaptation
   |
   v
Canonical loadout tree
   |
   v
Component metadata resolution
   |
   v
Port classification and constraints
   |
   v
Normalized ship package
   |
   v
Validation and certification
```

## Stage 1 — Raw parsing

Raw TypeScript types describe external formats accurately. Separate external schemas should use separate types or discriminated unions rather than one oversized interface with loosely optional fields.

## Stage 2 — Envelope resolution

Supported forms:

```ts
doc.entity
```

and:

```ts
doc.root.entity
```

The resolver strips the `EntityClassDefinition.` prefix from either source to preserve stable ship identifiers.

Failure condition:

- neither envelope contains a usable entity class

## Stage 3 — Loadout-node adaptation

Legacy nodes combine the port and installed component:

```ts
{
  itemPortName,
  portType,
  factoryComponent,
  children
}
```

StarBreaker nodes represent mounted entity hierarchy:

```ts
{
  entity,
  port,
  parent,
  children
}
```

The adapter maps only facts supported by the source:

- `port` -> canonical `itemPortName`
- `entity` -> canonical `factoryComponent.internalName`

Missing classification and constraint fields remain undefined.

Malformed nodes without a usable port identifier are dropped with a warning. Valid children are promoted so recoverable data is not lost.

## Stage 4 — Component metadata resolution

This stage is required for new StarBreaker data.

Input:

- exact mounted entity class
- canonical node
- optional embedded legacy metadata

Output should be an explicit result:

```ts
type MetadataResolution =
  | {
      status: "resolved";
      metadata: ComponentMetadata;
      provenance: MetadataProvenance;
    }
  | {
      status: "unresolved";
      entityClass: string;
      reason: string;
    };
```

Resolution must be based on authoritative imported data keyed by exact entity class.

Prohibited behavior:

- certifying data from name-pattern guesses
- silently assigning default port types
- inventing size constraints
- treating every geometry child as configurable equipment

## Stage 5 — Classification

Existing port classifiers and constraint builders operate only after canonical adaptation and metadata enrichment.

Unknown nodes must continue to fail safe.

## Stage 6 — Validation

Validation should report:

- malformed raw nodes
- unresolved entity classes
- missing authoritative metadata
- duplicate stable IDs
- unsupported categories
- excluded geometry/internal entities
- fixture or catalog inconsistencies

## Certification fixtures

Certification should include:

- synthetic legacy fixture
- synthetic StarBreaker fixture
- real AEGS Gladius fixture
- equivalence cases where both formats represent the same equipment
- malformed-node recovery
- missing entity envelope
- missing metadata
- absent fixture detection

## Current known gaps

1. Real StarBreaker nodes contain no direct classification fields.
2. The Gladius fixture therefore yields no certified ports without metadata resolution.
3. `raw-data/AEGS Avenger Titan.json` is referenced by tests but absent.
