# Strategic Fleet Manager — Architecture

## Mission

Strategic Fleet Manager (SFM) is a Star Citizen fleet-management platform designed to reduce cognitive load while preserving data integrity. It tracks owned ships, installed equipment, target builds, missing components, and future operational roles.

## Architectural principles

1. **Truth over convenience**  
   Unknown or unverified game data remains unresolved. SFM does not present guesses as facts.

2. **Stable canonical model**  
   External formats may change. SFM isolates those changes behind adapters and resolvers so downstream business logic remains stable.

3. **One responsibility per layer**  
   Each layer has a narrow purpose and must not absorb concerns belonging to another layer.

4. **Fail safe**  
   Malformed or incomplete data is excluded, warned about, or represented explicitly as unresolved.

5. **Main remains releasable**  
   Changes should build, test, and represent a known-good state before being committed to `main`.

6. **One architectural change per commit**  
   Commits should be small enough to review and revert independently.

## System layers

```text
External export / game data
        |
        v
Raw schema types
        |
        v
Compatibility adapters
        |
        v
Canonical normalization model
        |
        v
Authoritative metadata resolution
        |
        v
Classification and validation
        |
        v
Fleet / inventory / target-build domain logic
        |
        v
Application UI
```

## Current importer architecture

### Raw input

SFM currently supports:

- Legacy exports with a top-level `entity`
- StarBreaker exports with `root.entity`
- Legacy loadout nodes containing embedded structured component metadata
- StarBreaker loadout nodes containing entity identity and hierarchy

### Entity resolution

`resolveShipEntity(doc)` resolves either envelope and normalizes the `EntityClassDefinition.` prefix so stable IDs do not change when the exporter format changes.

### Loadout adaptation

`adaptLoadoutNodes()` is the sole branching boundary between legacy and StarBreaker loadout-node schemas.

Downstream normalization consumes `CanonicalLoadoutNode` only.

### Metadata gap

StarBreaker loadout nodes identify mounted entity classes and hierarchy but do not provide complete classification metadata such as:

- port type
- component category
- subtype
- size constraints
- grade
- class

This data must be resolved from an authoritative catalog. It must not be guessed from entity names.

## Domain boundaries

### Import and normalization

Responsible for:

- validating raw shape
- adapting versioned schemas
- producing stable canonical records
- recording warnings and unresolved data

Not responsible for:

- UI decisions
- fleet ownership
- inventory counts
- target-build comparison
- guessed component classification

### Metadata resolution

Responsible for:

- exact entity-class lookup
- verified component metadata
- provenance
- unresolved results
- filtering geometry or internal subcomponents when authoritative data supports that distinction

### Fleet domain

Responsible for:

- pledged and in-game ships
- ship roles and states
- current loadouts
- target loadouts
- missing-component calculations
- inventory allocation

### UI

Responsible for presenting domain state without reinterpreting raw exporter data.

## Engineering roles

- **Founder / Product Owner:** Todd Mirzaian
- **Chief Architect:** ChatGPT
- **Implementation Engineer:** Claude Code

## Version-control standard

- Branch: `main`
- `main` should remain buildable and reviewable.
- Commit messages should describe one coherent change.

Examples:

```text
fix(normalizer): support StarBreaker root.entity envelope
feat(normalizer): adapt StarBreaker loadout nodes
feat(metadata): resolve component entities from catalog
test(import): certify Gladius StarBreaker fixture
docs(architecture): record metadata resolution decision
```
