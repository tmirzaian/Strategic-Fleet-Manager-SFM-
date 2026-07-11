# Strategic Fleet Manager — Testing Standard

## Goals

Tests protect:

- schema compatibility
- stable IDs
- fail-safe behavior
- canonical-model boundaries
- metadata integrity
- import certification

## Test categories

### Unit tests

Cover individual resolvers, adapters, classifiers, builders, and validators.

### Schema compatibility tests

Verify legacy and StarBreaker forms produce equivalent canonical identity where they represent the same fact.

### Fixture tests

Use real exporter fixtures to expose changes that synthetic tests cannot reveal.

### Golden tests

Compare certified normalized output against approved expectations.

### Integration tests

Exercise the full import pipeline.

## Required checks before committing

```powershell
npm run test -- --run
npm run build
git diff --check
git status
```

Search for accidental test suppression:

```powershell
rg "describe\.skip|it\.skip|test\.skip|xit|xdescribe|only\(" src
```

## Failure reporting

Group failures by root cause rather than listing only counts.

Example:

- missing classification metadata
- absent fixture
- malformed envelope
- changed stable identifier
- expected warning mismatch

## Fixture discipline

A missing fixture must not be hidden by:

- weakening assertions
- substituting another ship silently
- skipping the test
- optional chaining around the failure

Either restore the intended fixture or explicitly revise the certification scope.
