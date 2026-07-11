# Next Tasks — Chief Architect Directive

## Task 1 — Add the documentation bundle

Copy these files into the repository's existing `docs` directory, preserving the `ADR` subdirectory.

Then run:

```powershell
git status
git add docs
git commit -m "docs(architecture): establish SFM engineering documentation"
```

## Task 2 — Reconcile the test baseline

Run:

```powershell
npm run test -- --run
rg "describe\.skip|it\.skip|test\.skip|xit|xdescribe|only\(" src
```

Record:

- total passed
- total failed
- skipped tests
- missing fixtures
- failure groups

Do not change tests during this task.

## Task 3 — Metadata-source investigation

Ask Claude Code to inspect the repository without modifying production code.

Required output:

- all possible entity-indexed component data sources
- exact file paths
- schema and keys
- coverage for weapons, shields, power plants, coolers, quantum drives, missiles, mounts, and geometry children
- example exact matches from the Gladius fixture
- recommended resolver API
- provenance strategy
- legacy embedded-metadata strategy
- unresolved-data behavior

## Task 4 — Missing Avenger Titan fixture

Determine whether the fixture:

- exists under another filename
- was omitted during cleanup
- should be regenerated from StarBreaker
- should be replaced by a different explicitly approved certification fixture

Do not weaken or skip the existing test merely to make the suite green.

## Definition of ready for implementation

Component metadata resolver implementation may begin only when:

1. an authoritative lookup source is identified;
2. its key is proven compatible with StarBreaker `entity`;
3. representative Gladius entities resolve correctly;
4. geometry/internal-node handling is designed;
5. unresolved behavior and provenance are defined.
