# Strategic Fleet Manager — Roadmap

## Alpha 2.5D

### Complete

- Local repository cleanup
- VS Code and Claude Code workflow
- Git repository initialization
- Strict StarBreaker JSON output
- Legacy and `root.entity` envelope compatibility
- Stable entity-prefix normalization
- Legacy and StarBreaker loadout-node adapter
- Focused adapter and envelope tests
- Authoritative component metadata-source investigation (Mission M-006)
- Component Catalog Generator, local-only, gitignored (Mission M-007)
- Component Metadata Resolver + enrichment integration (Mission M-008)
- Deterministic DataCore-to-SFM classification translation layer (Mission
  M-009) — the real Gladius fixture now produces classified,
  player-facing equipment ports instead of zero

### Active

- Test baseline reconciliation
- Missing Avenger Titan fixture decision
- Golden fixture reconciliation — several Sprint 1.3F hand-authored
  expectations no longer match authoritative DataCore-derived values
  (component identities, missile-rack loadout composition, one
  parent/child equipment-resolution ordering question); see
  docs/ImportPipeline.md and ADR-003 for the itemized differences from
  Mission M-009 pending a decision on whether to update the golden
  fixture or treat some as further mapping problems

### Remaining

- Complete import certification
- Resolve or intentionally replace missing fixture
- Full build/test verification
- Alpha 2.5D freeze

## Beta

- Fleet dashboard stabilization
- Current-versus-target build workflows
- Missing-target aggregation
- Inventory integration
- Ship image catalog integration
- Import UX and warning presentation
- User-data persistence and migration strategy

## Post-Beta

- Additional exporter/API integrations
- P4K catalog refresh workflow
- SPPV integration evaluation
- Organization logistics
- Crafted-quality support when the game data is stable enough
- Insurance/loadout-state evolution
