# Commander Ship Image Update

This folder is the only place you ever need to touch to update a ship's
image in Strategic Fleet Manager. You never need to edit TypeScript,
JSON, or any file under `src/` or `generated-data/`.

## COMMANDER SHIP IMAGE UPDATE

1. Open `ship-image-master.csv` in Excel or Google Sheets.
2. Locate the ship by its `manufacturer` and `ship_name` columns.
3. Paste the official RSI image URL into that row's `rsi_image_url`
   column. (Leave it blank if you want that ship to keep using the
   universal fallback image.)
4. Save the CSV.
5. Run:

   ```
   npm run ship-images:generate
   ```

6. Review the summary it prints (how many entries were retained,
   replaced, added, or removed).
7. Refresh Strategic Fleet Manager in your browser.

That's it — no other file needs to change.

## What each file in this folder is

- **`Commander RSI URL Master.xlsx`** — the original one-time source
  workbook (ship name + RSI image URL, 221 rows). This was the initial
  import source for EWO-038 and is kept here for provenance; it is not
  re-read by normal day-to-day maintenance.
- **`ship-image-master.csv`** — **this is the file you edit.** One row
  per real ship SFM currently offers (258 as of EWO-038), sorted by
  manufacturer then ship name. Columns:
  - `manufacturer` / `ship_name` — for you to find the row; never edit.
  - `canonical_id` / `source_entity_class` — internal identifiers the
    tooling uses; never edit.
  - `rsi_image_url` — **the only column you ever need to change.**
  - `coverage_status` — `REGISTRY` (has a real image), `FALLBACK` (uses
    the universal placeholder), or `REVIEW_REQUIRED`. Informational —
    regenerated automatically, don't hand-edit.
  - `match_method` / `notes` — informational, explains how that row's
    URL was determined (or why it's blank). Don't hand-edit.
- **`ship-image-import-report.json`** — a machine-readable coverage
  report (totals, unmatched names, ambiguous names, etc.), regenerated
  each time you run an import or generate command.

## If CIG adds new ships

When Strategic Fleet Manager's ship catalog is refreshed (a separate,
Engineering-run step) and picks up new ships, re-run:

```
npm run ship-images:import:xlsx
```

This rebuilds `ship-image-master.csv` from the current, complete ship
list — but **every URL you've already entered is preserved untouched**,
whether it came from the original workbook or you typed it directly into
the CSV. Only genuinely new ships are added (as blank rows for you to
fill in later), and if a ship your CSV mentions has since been removed
from SFM's catalog, it's reported to Engineering rather than silently
dropped.

## If something looks wrong

Run:

```
npm run ship-images:check
```

This prints a full coverage report (matches, unmatched names, ambiguous
names, malformed URLs) without changing any file — safe to run any time
you want to sanity-check the current state.
