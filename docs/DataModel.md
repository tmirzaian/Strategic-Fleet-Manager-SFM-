# Strategic Fleet Manager — Data Model

## Raw models

Raw models represent external data and may change with exporter versions.

### RawShipExport

Supports both:

- legacy `entity`
- StarBreaker `root.entity`

### RawLoadoutNode

Union of:

- `LegacyLoadoutNode`
- `StarBreakerLoadoutNode`

Raw models must not become the application's business model.

## Canonical normalization model

`CanonicalLoadoutNode` is the stable internal input consumed by traversal and normalization.

Minimum conceptual fields:

```ts
interface CanonicalLoadoutNode {
  itemPortName: string;
  factoryComponent?: {
    internalName?: string;
    category?: string;
    subtype?: string;
    size?: number;
    grade?: string;
    class?: string;
  };
  portType?: string;
  allowedTypes?: string[];
  allowedSubtypes?: string[];
  minSize?: number;
  maxSize?: number;
  children: CanonicalLoadoutNode[];
}
```

The exact source code remains authoritative. This document records the architectural intent.

## Component metadata

The metadata catalog should eventually expose:

```ts
interface ComponentMetadata {
  internalName: string;
  displayName?: string;
  category?: string;
  subtype?: string;
  size?: number;
  grade?: string;
  class?: string;
  portType?: string;
  allowedTypes?: string[];
  allowedSubtypes?: string[];
  minSize?: number;
  maxSize?: number;
  configurable?: boolean;
}
```

## Provenance

Resolved fields should carry or reference provenance so SFM can distinguish:

- embedded legacy exporter metadata
- P4K-derived metadata
- curated SFM corrections
- external catalog metadata
- unresolved values

## Fleet model direction

The fleet domain should support:

- ship identity
- ownership source
- current loadout
- multiple target builds
- multiple operational roles/states
- inventory allocation
- missing-target quantities
- image references

## Stability rule

External exporter field names must not leak into fleet, inventory, target-build, or UI models.
