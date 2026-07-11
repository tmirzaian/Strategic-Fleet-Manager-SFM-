# /generated-data

Layer 2 of the SFM Data Engine — Normalized Game Data, produced
automatically from `/raw-data` by a future Normalizer + Writer. Nothing in
this folder should ever be hand-edited; regenerate it by re-running the
(not-yet-built) importer pipeline instead.

No importer exists yet (see `docs/DATA_ENGINE.md`), so this folder is
currently empty. Once the Writer stage exists, it will produce:

```
ships.json
ports.json
components.json
factory-loadouts.json
compatibility.json
display-name-map.json
```

`src/generated/index.ts` currently exports typed, empty placeholders for
these — matching shapes, no data — so future code can start importing from
`src/generated` today and simply gain real data once a Writer starts
populating this folder.
