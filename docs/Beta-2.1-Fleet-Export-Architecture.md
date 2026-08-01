# Beta 2.1 — Fleet Export Architecture (EWO-093)

**Classification:** Beta 2.1 Phase 2 — Feature Foundation
**Status:** Architecture + Export implementation. Import/Backup/Restore
are explicitly out of scope for this work order — this document defines
the extension points they will build on, per EWO-093's own instruction
to produce "an architecture-first implementation suitable for Commander
review before expanding into Import and Backup."

---

## 1. The one governing decision

**The Fleet Export schema is not a new data model. It is the exact
payload SFM already persists to `localStorage` on every state change,
wrapped in a small portability envelope.**

Every other decision in this document follows from that one choice.
Before writing any export code, `src/store/useFleetStore.ts`'s existing
`persist()` configuration was read in full — it already solves "what is
the canonical, authoritative, minimal representation of a Commander's
fleet" for local persistence:

- **`partialize`** (useFleetStore.ts:2275) selects exactly nine fields
  from live state — `fleetAssets` (minus seed-migration rows),
  `hangarItems`, `reservations`, `installedLoadouts`,
  `seedAssetOverrides`, `customBuilds`, `customBuildHardpoints`,
  `activeBuildByShipId`, `quarantinedAssignments` — plus one boolean
  flag (`seedFleetLegacyInstall`). Everything else (`ships`, factory
  `builds`/`hardpoints`, `log`, `shipDefinitions`, derived caches) is
  deliberately excluded — regenerated fresh from seed data + catalog +
  materialization on every load, never trusted as a source of truth.
- **`migrate`** (useFleetStore.ts:2147) already contains a complete,
  battle-tested, per-field validator suite (`isValidPersistedFleetAsset`,
  `isValidPersistedReservation`, `isValidPersistedBuild`,
  `isValidPersistedHardpoint`, `isValidSeedAssetOverride`,
  `isValidPersistedQuarantinedAssignment`) that defensively drops any
  malformed record with a console warning rather than crashing or
  wiping the rest of the Commander's state.
- **`merge`** (useFleetStore.ts:2325) already knows how to take that
  exact payload shape and reconcile it against a freshly-rebuilt seed
  baseline into a real, live `FleetState`.

A Commander's "fleet," for portability purposes, is precisely what
survives a browser refresh today — no more, no less. Export therefore
does not invent a second, richer, or narrower serialization concept.
It packages the SAME payload `partialize` already builds, and — this is
the load-bearing consequence — **Import (a future EWO) will not need a
new validation pipeline at all.** It can hand the envelope's payload to
the exact `migrate`/`merge` functions above, the same way a real browser
reload already does, and inherit every future `PERSIST_VERSION` bump
for free.

This is what "avoid parallel serialization implementations" means
concretely here: there is one function that decides what a fleet
payload contains, one set of validators that decide whether a payload
is trustworthy, and both are reused — not re-derived — by Export today
and by Import/Backup/Restore later.

---

## 2. Canonical serialization model

### 2.1 `FleetPersistencePayload` (`src/utils/fleetSerialization.ts`, new)

The exact shape `partialize` produces, now named and shared rather than
an inline object literal local to the `persist()` call:

```ts
export interface FleetPersistencePayload {
  fleetAssets: FleetAsset[]
  hangarItems: HangarItem[]
  reservations: MissionReservation[]
  installedLoadouts: InstalledLoadoutEntry[]
  seedAssetOverrides: Record<string, SeedAssetOverride>
  customBuilds: Build[]
  customBuildHardpoints: Hardpoint[]
  activeBuildByShipId: Record<string, string>
  quarantinedAssignments: QuarantinedAssignment[]
  seedFleetLegacyInstall: boolean
}
```

Built by one pure function, `buildFleetPersistencePayload(source)`,
which contains the field-selection logic verbatim-migrated out of
`partialize`'s object literal (same filters, same comments preserved).
`useFleetStore.ts`'s `partialize` now reads:

```ts
partialize: (state) => buildFleetPersistencePayload(state),
```

Two independent things now call one function: the browser's own
localStorage write, and Fleet Export. They cannot drift apart, because
there is only one implementation to drift from.

`buildFleetPersistencePayload` takes a narrow, explicit parameter type
(`FleetPersistenceSource` — the ~9 fields it actually reads), not the
full, unexported `FleetState` interface — `fleetSerialization.ts` has
zero dependency on `useFleetStore.ts`, avoiding a circular import and
keeping the module honestly reusable outside the store (unit-testable
with a plain object literal, no store bootstrap required).

### 2.2 `FleetExportEnvelope`

```ts
export interface FleetExportEnvelope {
  schemaVersion: number
  appVersion: string
  exportedAt: string
  payload: FleetPersistencePayload
}
```

- **`schemaVersion`** is `PERSIST_VERSION` at export time — not an
  independent counter (see §3).
- **`appVersion`** is `APP_VERSION.productVersion` (`src/config/appVersion.ts`,
  e.g. `"Beta 2.1 Dev"`) — informational only, for Commander/support
  display ("this file was produced by Beta 2.0"), never consulted by
  any migration or validation logic. Schema compatibility is decided by
  `schemaVersion` alone.
- **`exportedAt`** is an ISO timestamp, for the same informational
  purpose (and to build a sensible default filename).
- **`payload`** is exactly §2.1.

`buildFleetExportEnvelope(payload, schemaVersion, appVersion)` lives in
`fleetSerialization.ts` too (pure, no store dependency). The one place
that knows `PERSIST_VERSION` — `useFleetStore.ts`, where that constant
is deliberately kept private — is also the one place that calls it, via
a new exported helper:

```ts
// useFleetStore.ts
export function buildFleetExportSnapshot(state: FleetPersistenceSource): FleetExportEnvelope {
  return buildFleetExportEnvelope(buildFleetPersistencePayload(state), PERSIST_VERSION, APP_VERSION.productVersion)
}
```

`serializeFleetExportEnvelope(envelope)` (also in `fleetSerialization.ts`)
does the actual `JSON.stringify(envelope, null, 2)` — pretty-printed,
since an exported fleet file is something a Commander may reasonably
open and read, not just round-trip through Import.

---

## 3. Versioning strategy

**`schemaVersion` reuses `PERSIST_VERSION` directly. There is no second,
independent "export format version."**

Rationale: the payload is byte-identical to what `PERSIST_VERSION`
already governs. Keeping them the same number means:

1. A future Import feature's entire migration story is: take the
   envelope, reconstruct `{ state: envelope.payload, version:
   envelope.schemaVersion }` — the exact shape zustand's own
   `createJSONStorage` already writes to `localStorage` — and hand it to
   `migrate`. If `envelope.schemaVersion < PERSIST_VERSION` (an export
   from an older SFM build), the EXISTING `migrate` function runs,
   unmodified, exactly as it already does for a same-browser upgrade.
   No new migration code, ever, for Import specifically — every future
   `PERSIST_VERSION` bump (and its accompanying `migrate` logic, which
   Engineering already writes for every schema change regardless of
   Export's existence) automatically also becomes Import's migration
   path.
2. Two numbers tracking the same underlying fact would eventually
   drift — a `PERSIST_VERSION` bump that forgets a matching export-schema
   bump is exactly the kind of "parallel implementation" this EWO's
   objectives explicitly warn against.

**Consequence for future work:** any EWO that changes what gets
persisted (adds/removes a `partialize` field) already bumps
`PERSIST_VERSION` and writes a `migrate` clause, per this codebase's
long-established discipline (see the running commentary above
`PERSIST_VERSION`'s own declaration, EWO-027 through SW-015C). That
discipline now transparently covers Export/Import too — no additional
process is required of future engineers.

`appVersion` is explicitly NOT part of the versioning strategy. It is
provenance metadata, not a compatibility gate — an export produced by
"Beta 2.0" and one produced by "Beta 2.1 Dev" are equally valid Import
candidates as long as their `schemaVersion` is recognized.

---

## 4. Validation boundaries

- **Export boundary: none needed.** Export serializes whatever the live
  store currently holds. Every store mutation path already enforces its
  own invariants before committing state; `partialize`'s own existing
  role has always been "select fields," never "validate them" — Export
  inherits that same boundary unchanged. There is nothing new to trust
  here beyond what the app already trusts every time it saves to
  `localStorage`.
- **Import boundary (future EWO): envelope-level only.** The only
  validation Import needs to add is: is this valid JSON; does it have
  `schemaVersion` (a number) and `payload` (an object) keys at the top
  level. Once past that, `envelope.payload` is handed to the SAME
  `migrate`/`merge` pipeline and the SAME per-field validators
  (`isValidPersistedFleetAsset` etc.) that already run on every normal
  page load — a malformed or hand-edited record inside a bad export
  file is dropped with a console warning exactly the way a corrupted
  `localStorage` entry already is today. No second validator suite is
  ever written.
- **Trust boundary crossed by Import specifically:** a real browser
  reload trusts `localStorage` (same origin, same browser, effectively
  the Commander's own prior session). An imported FILE crosses a
  stronger trust boundary — it could be hand-edited, come from a
  different Commander, or be stale. The existing per-field validators
  already treat every persisted record as untrusted input (that is
  precisely why they exist), so this boundary shift does not require
  new validation logic — it is already validation-boundary-appropriate
  for exactly this case, just not yet wired to a file-upload entry
  point.

---

## 5. Extension points for Import, Backup, Restore, and migration

| Future capability | Mechanism, reusing this architecture |
|---|---|
| **Import** | Parse uploaded file → envelope-level check (§4) → **Preview** (Commander reviews the validated `envelope.payload` before anything is written — decided by Chief Architect Certification, EWO-093; see the note below this table) → on confirmation, `localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify({ state: envelope.payload, version: envelope.schemaVersion }))` → reload. The existing `migrate`/`merge` pipeline does everything else, unmodified. Replace-vs-merge semantics for the confirmation step are deferred to EWO-094. |
| **Backup** | Call the same `buildFleetExportSnapshot` + `serializeFleetExportEnvelope` pair Export already uses, on a schedule or Commander action, writing to a rotating/dated store (e.g. a small IndexedDB table or a sequence of downloaded files) instead of a single manual download. No new serialization — only a new trigger and destination. |
| **Restore** | Exactly the Import mechanism above, sourced from a specific stored backup entry instead of a Commander-picked file. |
| **Cross-device / cross-browser transfer** | Already solved by Export + the future Import — the envelope carries everything `partialize` considers "the Commander's data," independent of which browser/device produced or consumes it. |
| **Future `PERSIST_VERSION` bumps** | Automatically covered — see §3. No Export/Import-specific migration code is ever written; the existing `migrate` discipline is the only place that changes. |

**Decided by Chief Architect Certification (EWO-093): Import shows a
Preview first.** The Commander sees what an uploaded file contains —
at minimum ship/build/inventory counts, and enough per-record detail to
recognize the fleet — before anything is written to `localStorage`.
This directly follows from §4's validation boundary: the envelope-level
check and the existing per-field validators already produce, as a side
effect, exactly the information a Preview needs to render (which
records are present, which would be dropped as malformed). Preview is
not an additional pass over the data — it is the same validated
`envelope.payload` the write step would use, just not yet committed.

**Still explicitly deferred to EWO-094 (not decided here):** the exact
Replace-vs-Merge semantics once a Preview is accepted — whether Import
always fully replaces the current fleet, offers a field-by-field or
per-record merge, or requires a distinct confirmation step given its
destructive potential (overwriting `localStorage` wholesale). This
remains a product/UX decision, not an architecture one, and is called
out here rather than silently assumed. EWO-094 should design that
decision against the Preview step above, not around it.

---

## 6. What EWO-093 actually implements

Per its own scope ("before expanding into Import and Backup"), this
work order implements **Export only**:

1. `src/utils/fleetSerialization.ts` (new) — `FleetPersistencePayload`,
   `FleetPersistenceSource`, `FleetExportEnvelope` types;
   `buildFleetPersistencePayload`, `buildFleetExportEnvelope`,
   `serializeFleetExportEnvelope`, `suggestFleetExportFilename`
   functions. Pure, store-agnostic, fully unit-tested.
2. `src/store/useFleetStore.ts` — `partialize` now calls
   `buildFleetPersistencePayload(state)` instead of its own inline
   object literal (identical output, single implementation). New
   exported `buildFleetExportSnapshot(state)` helper, the only place
   `PERSIST_VERSION` and the export envelope meet.
3. A Commander-facing "Export Fleet Data" action on Captain's Log
   (`src/pages/CaptainsLog.tsx`) — already the page that displays
   build/version/certification metadata, a natural home for a
   fleet-data action. Downloads a JSON file via the standard
   Blob/object-URL browser pattern; no new dependency.
4. Regression coverage proving: the exported payload is byte-identical
   in shape to what `partialize` already writes to `localStorage`
   (round-trip proof, not just "looks right"); `schemaVersion` always
   equals the live `PERSIST_VERSION`; the Export button produces a
   downloadable file with the expected filename/content-type/JSON
   shape.

Explicitly NOT built under EWO-093: any Import UI or file-upload
handling, any Backup scheduling/storage, any Restore UI, any merge/
preview/confirmation flow. §5 exists so that work can be scoped as its
own narrowly-focused EWO without re-deriving the schema.
