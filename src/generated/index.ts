/**
 * `src/generated` — browser-side access to the import pipeline's output.
 *
 * A real Writer now exists (scripts/generatedDataWriter.ts) and produces
 * the /generated-data files this module reads via `importedShips.ts`.
 * There's no longer a placeholder/empty-arrays state to keep here — run
 * `npm run import:ships` to (re)generate the data these exports read.
 */
export * from './importedShips'
