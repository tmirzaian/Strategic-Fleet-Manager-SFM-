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

## Stock role/focus vs. operational role (EWO-033)

Three distinct, non-interchangeable "role" concepts exist and must never be
conflated:

- **`ShipDefinition.role`** — the ship *model's* stock role/focus (e.g.
  "Rescue / Medical", "Stealth Bomber"). Catalog/game data, never
  implies ownership, never player-editable.
- **`Ship.role` / `Build.role`** — set once at Fleet Asset materialization
  time from `ShipDefinition.role` (`fleetAssetMaterializer.ts`); despite
  the name, this is a materialized snapshot of the active Build's role
  text at creation, not stock metadata, and is not kept in sync with the
  definition afterward. Never read directly for a stock role/focus
  display — see `resolveShipStockRoleFocus()` below.
- **`Ship.primaryRole` / `secondaryRole`** — the Commander's own future
  Fleet Profile fields (Alpha 2.4, Part 7). Player-editable, independent
  of both fields above and of the authoritative RSI/CIG
  `ShipClassification`, unset until the player edits them via Ship
  Detail. Never substituted into the stock role/focus line.

**Resolution** (`src/utils/shipIdentityLine.ts`, `resolveShipStockRoleFocus()`):
resolves a Fleet Asset's canonical `ShipDefinition` and reads its `role`
directly when non-blank (true for every seed ship and every Mission
M-012 catalog-only ship); when the canonical definition is deep-imported
and its own `role`/`career` came back empty (the raw StarBreaker `root`
export envelope carries no such field — a real upstream gap, not a
wiring bug), falls back to the M-012 catalog's own record for that exact
entity class. Formatted for display via `formatShipIdentityLine()` as
"Manufacturer · Stock Role/Focus", or manufacturer alone when nothing
resolved — never a dangling separator.

## Stability rule

External exporter field names must not leak into fleet, inventory, target-build, or UI models.
