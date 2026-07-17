# Contributing

Strategic Fleet Manager is in Beta and its architecture is still settling.
This guide is intentionally lightweight — a few rules that keep the
codebase consistent, not a full process document.

## Before you start

- **Open an Issue before major changes.** For anything beyond a small fix,
  open an Issue first so we can talk through the approach before you invest
  time in an implementation.

## What we ask

- **Do not submit copyrighted game assets.** Ship imagery, text, or other
  Star Citizen assets pulled directly from the game files must not be
  committed to this repository without permission. Generated *metadata*
  (names, port structures, categories) derived through the documented
  pipeline is fine; raw extracted assets are not.
- **Preserve the authoritative-data architecture.** Ship and component data
  flows from Star Citizen's own game data through a documented
  import/normalization pipeline (see `docs/DataModel.md`,
  `docs/ImportPipeline.md`, and `docs/DATA_ENGINE.md`). Please don't
  bypass it with hand-authored shortcuts.
- **Avoid ship-specific hard-coded fixes when a pipeline correction is
  possible.** If a bug affects one ship because of a general resolution or
  classification gap, prefer fixing the general case over patching that one
  ship. Ship-specific exceptions are sometimes genuinely necessary (see the
  documented exceptions in the test suite) — but they should be a
  last resort, not a first instinct.
- **Run the full verification suite before submitting changes:**

  ```bash
  npm test
  npx tsc -b
  npm run build
  ```

  All three should pass cleanly.

## Questions

If you're not sure whether something fits, open an Issue and ask — that's
faster for everyone than guessing.
