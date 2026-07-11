/**
 * Manual ship image overrides — manually approved image URLs, authoritative
 * until an automatic resolver exists (see src/engine/importer/shipImageResolver.ts).
 *
 * These are the URLs already in use by the seed fleet (src/data/seed.ts).
 * They are duplicated here, rather than only living in seed.ts, so the
 * import pipeline's image manifest (generated-data/ship-images.json) has
 * a single authoritative source to check before ever falling back —
 * satisfying "never overwrite working manual image URLs" without the
 * pipeline needing to import seed.ts (a Layer 3/player-data module) at all.
 *
 * Keyed by the seed ship id used throughout src/data/seed.ts and
 * src/store/useFleetStore.ts.
 */
export const shipImageOverrides: Record<string, string> = {
  ghost: 'https://media.robertsspaceindustries.com/thvu42fxnagbh/slideshow.jpg',
  corsair: 'https://media.robertsspaceindustries.com/9y19hajivybqc/slideshow.jpg',
  mole: 'https://media.robertsspaceindustries.com/wgai60tvwa3vs/slideshow.jpg',
  railen: 'https://media.robertsspaceindustries.com/3hlrf4bj6k5r7/slideshow.jpg',
  '135c': 'https://media.robertsspaceindustries.com/ftaf8t452ad1o/slideshow.jpg',
  'cutlass-black': 'https://media.robertsspaceindustries.com/56iszc92bl9oi/slideshow.jpg',
  'cutlass-red': 'https://media.robertsspaceindustries.com/wqa6lfco4amc0/slideshow.jpg',
  m80: 'https://media.robertsspaceindustries.com/nledgsyyzmjov/slideshow.jpg',
  starlite: 'https://media.robertsspaceindustries.com/6cdv5u7nvigrn/slideshow.jpg',
  utv: 'https://media.robertsspaceindustries.com/szj2zc8m5hair/slideshow.jpg',
  vulture: 'https://media.robertsspaceindustries.com/jggtvws2rhu3y/slideshow.jpg',
  prospector: 'https://media.robertsspaceindustries.com/7rfmcpg9qcpmm/slideshow.jpg',
}
