/**
 * EWO-021A — Canonical Ship Image URL Registry.
 *
 * The Commander's own correction layer: paste an official RSI image URL
 * here, keyed by canonical ship ID, and it appears on Fleet Dashboard,
 * Mission Control, and Ship Detail immediately — no StarBreaker export,
 * no generated-data edit, no component change, no asking Engineering.
 *
 * ── Keys are canonical ship IDs ──────────────────────────────────────
 * "Canonical" means the same identity EWO-021/ADR-008 already treats as
 * the single source of truth for a given real hull:
 *
 *   - A deep-imported ship (has a full StarBreaker export with real
 *     hardpoints/components) — use its raw StarBreaker entity class,
 *     e.g. "AEGS_Eclipse", "DRAK_Cutlass_Black", "DRAK_Corsair". This is
 *     the same id ADR-006/ADR-008 already alias to the same definition,
 *     so it always resolves correctly regardless of which generated id
 *     (e.g. "cutlass-black-imported") the import pipeline minted.
 *   - A seed-fleet ship (hand-authored in src/data/seed.ts, no
 *     StarBreaker export) — use its seed id exactly as written there,
 *     e.g. "ghost", "mole", "railen", "135c", "cutlass-red".
 *
 * Not sure which one a ship uses?
 *   - Deep-imported ship: open generated-data/ships.json, find the ship
 *     by its `name`, and copy its `sourceEntityClass` field verbatim.
 *   - Seed-fleet ship: open src/data/seed.ts and copy the ship's own
 *     `id` field verbatim.
 *   - A Mission M-012 catalog-only ship (no deep import, no seed entry —
 *     the vast majority of the ~290-ship roster Add Ship offers): its
 *     canonical id is already its raw entity class (e.g. "AEGS_Hammerhead"),
 *     the same `id` field `selectableShipDefinitions` (src/data/shipDefinitions.ts)
 *     exposes for it — open generated-data/ship-catalog.json, find the
 *     ship by its `displayName`, and copy the record's own key
 *     (`entityClass`) verbatim.
 * Either way it's one field lookup in a file you can Ctrl+F by ship
 * name — no need to run anything or understand the rest of the schema.
 * `src/data/shipDefinitions.ts`'s exported `selectableShipDefinitions`
 * array is also a valid, always-current read-only lookup for any of the
 * three cases above (each entry's own `.id` is exactly the key this
 * registry expects) — useful in a REPL/test/breakpoint if the generated
 * JSON files feel unfamiliar.
 *
 * ── Values ────────────────────────────────────────────────────────────
 * Official RSI-hosted image URLs, acceptable for the Alpha/Beta testing
 * period (Design Authority Ruling 1). Must be absolute HTTPS URLs — a
 * malformed or non-HTTPS value is ignored safely (see
 * src/utils/resolveShipImage.ts), never crashes the app.
 *
 * ── What NOT to do ───────────────────────────────────────────────────
 * - Never edit generated-data/*.json to add artwork — this file is the
 *   only place to do it.
 * - A missing entry is not an error — it simply falls through to the
 *   ship's existing image source, then the approved Fleet Registry
 *   placeholder. Partial coverage is the expected, approved state
 *   during Alpha/Beta (most catalog-only ships will have no entry here
 *   for a long time, and that's fine).
 * - A future local Fleet Registry asset pipeline (EWO-022) replaces
 *   these URL values with locally generated SFM artwork without
 *   changing any consumer of resolveShipImage() — this registry's key
 *   space and resolution boundary stay the same, only the values move
 *   from external RSI URLs to local asset paths.
 *
 * Example:
 *   DRAK_Cutlass_Black:
 *     'https://media.robertsspaceindustries.com/xxxxxxxxxxxxx/slideshow.jpg',
 */
export const SHIP_IMAGE_URLS: Readonly<Record<string, string>> = {
  // --- Seed-canonical hulls (migrated from src/data/shipImageOverrides.ts,
  // which remains the offline import pipeline's own manual-override input
  // — see that file's header — and is not read by the runtime resolver) ---
  ghost: 'https://media.robertsspaceindustries.com/thvu42fxnagbh/slideshow.jpg',
  mole: 'https://media.robertsspaceindustries.com/wgai60tvwa3vs/slideshow.jpg',
  railen: 'https://media.robertsspaceindustries.com/3hlrf4bj6k5r7/slideshow.jpg',
  '135c': 'https://media.robertsspaceindustries.com/ftaf8t452ad1o/slideshow.jpg',
  'cutlass-red': 'https://media.robertsspaceindustries.com/wqa6lfco4amc0/slideshow.jpg',
  m80: 'https://media.robertsspaceindustries.com/nledgsyyzmjov/slideshow.jpg',
  starlite: 'https://media.robertsspaceindustries.com/6cdv5u7nvigrn/slideshow.jpg',
  utv: 'https://media.robertsspaceindustries.com/szj2zc8m5hair/slideshow.jpg',
  vulture: 'https://media.robertsspaceindustries.com/jggtvws2rhu3y/slideshow.jpg',
  prospector: 'https://media.robertsspaceindustries.com/7rfmcpg9qcpmm/slideshow.jpg',

  // --- Deep-import-canonical hulls: EWO-021 made the deep-imported
  // definition canonical for these two (real hardpoints/factory data
  // outrank the seed fleet's hand-authored equivalent), but the real RSI
  // photo already in this repo was keyed to the now-superseded seed id
  // ('corsair', 'cutlass-black'). It is the same real ship photograph,
  // already present in the repository — re-keyed here to the id Add Ship
  // actually offers today, not invented or newly sourced. ---
  DRAK_Corsair: 'https://media.robertsspaceindustries.com/9y19hajivybqc/slideshow.jpg',
  DRAK_Cutlass_Black: 'https://media.robertsspaceindustries.com/56iszc92bl9oi/slideshow.jpg',

  // Aegis Eclipse (AEGS_Eclipse), Avenger Titan (AEGS_Avenger_Titan),
  // Gladius (AEGS_Gladius), Valkyrie (ANVL_Valkyrie): no existing official
  // URL was found anywhere in this repository as of EWO-021A. Left
  // intentionally absent — add one above whenever a Commander has one to
  // paste; each falls through to the approved placeholder until then.
}
