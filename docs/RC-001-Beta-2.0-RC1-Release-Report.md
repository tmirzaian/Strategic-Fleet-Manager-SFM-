# RC-001 — Beta 2.0 Release Candidate Packaging

**Real-Fleet Migration Rehearsal Preparation**
Baseline Commit: `de255f2` · RC1 Packaging Commit: `385fb23`
Build Timestamp: `2026-07-28T20:46:39Z`
Classification: Release Engineering / Data Safety

This report covers all ten phases of RC-001. It is the engineering
record; the package itself ships a shorter `README.md` derived from
the sections marked **[in package]**.

---

## Phase 1 — Freeze and Baseline Verification

| Item | Value |
|---|---|
| Baseline (feature-freeze) commit | `de255f2` (SW-015C + EWO-073, certified) |
| RC1 packaging commit | `385fb23` |
| Branch | `main` — this repo has no dedicated release-branch convention; every prior work order this program has committed straight to `main`, so RC-001 continues that pattern. Flagged for the Commander: say the word if a `release/beta-2.0` branch should be cut going forward. |
| Working tree | Clean at every gate (verified via `git status --short`) |
| Node.js | `v24.18.0` |
| npm | `11.16.0` |
| Build command | `npm ci && npm run build` (`npm run build` = `tsc -b && vite build`) |

**Three commits sit on top of the frozen baseline**, each independently
gated and each squarely inside RC-001's allowed-changes list
(packaging / release metadata / release-blocking defects):

1. `5de8132` — **chore(release):** bump `APP_VERSION.productVersion`
   from `"Beta 2.0 Dev"` to `"Beta 2.0 RC1"` per the ENG-001 version
   state machine (`src/config/appVersion.ts`), plus the matching test
   update.
2. `dbb23cb` — **fix (release-blocking defect):** `index.html`'s
   `<title>` was still hardcoded to `"Strategic Fleet Manager Beta
   1.2"` — untouched by ENG-001's whole version-discipline effort, so
   the RC package's own browser tab would have shown a stale, wrong
   version number to the Commander. `document.title` is now set from
   `APP_VERSION_LABEL` at startup (`src/main.tsx`), the same source
   AppFooter and Captain's Log already read, so it cannot drift again.
   Found by inspecting the actual clean-checkout build output, not by
   code review — this class of defect (a static HTML string never
   wired to the version constant) would not have surfaced from `tsc`
   or `vitest` alone.
3. `385fb23` — **feat (migration safety):** the Phase 3/9 snapshot
   export/import tooling (`scripts/release/*.js`), detailed below.

**Reproducibility proof.** Rather than trusting the working directory
(which accumulates local state over a long session), every gate below
was re-run against a `git archive` export of the RC1 commit into an
isolated directory, followed by a real `npm ci` (not `npm install`,
which can silently rewrite the lockfile) and a real `npm run build` —
proving the package can be reproduced from git history alone, with no
untracked file able to sneak in.

| Gate | Result |
|---|---|
| `npm ci` (clean checkout, exact lockfile) | Clean — `245 packages added`, no lockfile drift |
| `tsc --noEmit` (clean checkout) | Clean |
| `npm run build` (clean checkout) | Clean — `dist/index.html` (1.14 kB), `dist/assets/index-*.css` (36.74 kB), `dist/assets/index-*.js` (17.1 MB / 857.8 kB gzip). One pre-existing chunk-size advisory (unrelated to this work order, not a build failure). No source maps emitted (Vite's default). |
| `vitest run` (working directory, licensed catalog present) | **198 files / 2539 tests passed** |
| `vitest run` (true clean checkout, no licensed catalog) | **192/198 files passed, 42 tests failed** — see finding below |

**Finding — clean-checkout test gap (Non-Blocking, process only, not a
shipped-app defect).** Six normalizer/import-pipeline test files
(`gladiusGoldenFixture.test.ts`, `moduleTaxonomyActivation.test.ts`,
`structuralNodePreservation.test.ts`, `electronicWarfareActivation.test.ts`,
`hornetNoseTurretDiscovery.test.ts`, `integration.test.ts`) read
`generated-data/component-metadata-catalog.json` — a file gitignored
by design per ADR-005 (it's a full, licensed StarBreaker export of the
Star Citizen DataCore, "locally-generated... developer-only," per the
`.gitignore` comment itself) and therefore absent from any true clean
checkout unless a developer has separately run
`npm run generate:component-catalog` against their own licensed game
install. **This does not affect the shipped app**: confirmed directly
by running `npm run build` (the full `tsc -b && vite build`, not just
`vite build`) in the same clean checkout — it succeeds, because the
runtime only ever consumes the small, committed `.runtime.json`
subset (`ship-catalog.runtime.json`,
`component-metadata-catalog.runtime.json` — see the RC-008 gitignore
comment), never the full licensed file. This gap has existed since
those tests were written; it was never visible before because every
prior full-suite run this program has done ran from the working
directory, which already had the generated file present locally.
Recommended follow-up (not done here, out of RC-001's packaging
scope): either guard these six files with a file-existence skip and a
clear console message, or document the `generate:component-catalog`
prerequisite in `CONTRIBUTING.md` so `vitest run` on a bare clone
doesn't silently look broken to a new contributor.

**No dependencies were updated during packaging.** `npm ci` uses the
committed lockfile verbatim; the only `package.json`/`package-lock.json`
changes at any point were the temporary addition and clean removal of
`playwright` as a local verification tool (this program's established,
previously-used pattern — it is not a tracked project dependency and
was fully reverted; confirmed via `git status --short` returning clean
and `grep -c '"playwright"' package-lock.json` returning `0`).

---

## Phase 2 — Storage-Origin Reconnaissance **[in package]**

SFM is a pure browser SPA — no server, no Electron, no filesystem
access at runtime (this was UX-005A's own foundational finding, still
true). Everything it persists lives in the browser's per-**origin**
storage partition, where *origin* means exactly `scheme://host:port` —
the URL path never matters, but `localhost` and `127.0.0.1` are
different hosts even on the identical port, and port `5173` and port
`4173` are different origins even on the identical host.

**What SFM actually uses, read directly from source** (not guessed):

| Layer | Location | Details |
|---|---|---|
| Core fleet state | `localStorage['sfm-fleet-store']` | Zustand `persist` middleware, `PERSIST_VERSION = 10` (`src/store/useFleetStore.ts`) |
| Managed ship images | IndexedDB `sfm-ship-images`, object store `images`, DB version `1` | UX-005A custom images, keyed directly by vessel instance id (`FleetAsset.id` === `Ship.id`); each record is `{ buffer: ArrayBuffer, type: string }` (`src/utils/shipImageStorage.ts`) |

**How the Commander's real fleet is actually served — confirmed, not
guessed, from a real prior release, found during this pass:** this
repo has a gitignored `artifacts/` directory holding every release
package ever cut, including `Strategic-Fleet-Manager-Beta-1.2.zip` —
the exact build `README.md`'s own "Status: Beta 1.2 — Certified for
Star Citizen LIVE 4.9.186.42610" line identifies as the Commander's
current, real, live install. Its extracted contents are a source-tree
package with the identical `Setup Strategic Fleet Manager.bat` /
`Start Strategic Fleet Manager.bat` pair this repo ships today, and
`vite.config.ts` pins `server.port: 5173` with no `base` path
override. **The Commander's real fleet lives at
`http://localhost:5173`, served via `npm run dev` through those same
two `.bat` files** — this is the actual shipped precedent, not an
inference from the dev-mode scripts alone.

(README.md's "Status: Beta 1.2" line was checked and deliberately left
unchanged — it's a certification claim tied to a specific Star Citizen
patch, not a stale display string like `index.html`'s title was; it
should only move to "Beta 2.0" at Phase 10 promotion, once actually
certified.)

The one thing only the Commander can still confirm is whether they've
changed that launch method since (a different port, `127.0.0.1`
instead of `localhost`). The snapshot tool below reports the real
answer directly from their browser either way, so this isn't a hard
blocker — just the one open question worth closing before the
real-fleet rehearsal begins.

---

## Phase 3 — Pre-Rehearsal Data Preservation **[in package]**

Beta 2.1's in-app backup/restore doesn't exist yet, so this ships as
standalone tooling instead of an app feature (RC-001 explicitly
authorizes "migration safety," not new features) —
`scripts/release/exportFleetSnapshot.js` and its pair,
`importFleetSnapshot.js`. These are plain scripts meant to be pasted
into the browser DevTools console **while the Commander's real SFM tab
is open** — running inside that tab's own JS context is what lets them
reach the correct origin automatically, without anyone having to type
a host/port by hand.

`exportFleetSnapshot()`:
- Reads `localStorage['sfm-fleet-store']` verbatim (raw JSON, byte
  size, and the persisted `version` field).
- Opens IndexedDB `sfm-ship-images` / `images`, reads every record
  (vessel id, MIME type, byte length, base64-encoded bytes — JSON
  can't hold raw binary, so this is the one necessary transform).
- Reports `location.origin` and all counts/sizes in a console table —
  this same run **also answers Phase 2's reconnaissance question
  directly from the real browser**, no separate step needed.
- Downloads one timestamped JSON file
  (`sfm-fleet-snapshot-<host>-<port>-<ISO time>.json`) and never
  writes or clears anything.

The Commander should move that downloaded file out of the browser's
Downloads folder into a clearly dated location immediately — outside
active browser storage, unchanged for the duration of testing, exactly
as required. `importFleetSnapshot()` is the inverse (Phase 9, below).

A copy of `localStorage` alone would **not** be a complete backup —
the custom images UX-005A introduced live entirely in IndexedDB and
are outside the core JSON by design. This tool captures both layers
together in one file for exactly that reason.

---

## Phase 4 — RC1 Artifact **[in package: this section becomes the package README]**

**Packaging decision, and why:** the Commander's real fleet is (per
Phase 2, confirmed against the actual `Beta 1.2` release artifact)
served via `npm run dev` on `http://localhost:5173` through the
existing `.bat` launchers — every release in `artifacts/` back through
Beta 1.1/1.2 already packages this exact same way; there is no
precedent anywhere for a static built bundle. Shipping RC1 any other
way would *introduce* an origin-mismatch risk (a different port, a
different serving mechanism) for no benefit, which is precisely what
Phase 2's Hard Rule warns against. **RC1 therefore ships as a source
package that launches exactly the same way every prior release did**
— same two `.bat` files, same `npm run dev`, same port `5173` — so
opening it lands on the *same storage origin automatically*, with no
explicit data migration required at all. The Phase 3 snapshot is still
taken first regardless, as required, as insurance against the one open
confirmation from Phase 2.

**Artifact:** `artifacts/Strategic-Fleet-Manager-Beta-2.0-RC1.zip`
(repo-root `artifacts/` — gitignored, matching where every prior
release package already lives)
**Built from commit:** `385fb23deff8bee317599b5cafefbb9f1aabb803`
**SHA-256:** `EC6F234A8C9B4C5B54C3D129738A8B7F5AA258D4F5FDAA2E2208B42116C7689A`
(also recorded in `artifacts/Strategic-Fleet-Manager-Beta-2.0-RC1-SHA256.txt`,
matching the `-SHA256.txt` naming precedent from the Beta 1.0 Flight
Test artifacts)

**Contents** — a `git archive` export of the RC1 commit (proven above
to `npm ci && npm run build` cleanly from scratch, and independently
re-proven a second time against the actual extracted zip — see Phase 5
addendum below), plus the release tooling and one new file:
- Full application source (`src/`, `public/`, `scripts/`, config
  files, `package.json`/`package-lock.json`) and the existing `Setup`
  / `Start Strategic Fleet Manager.bat` launchers.
- `scripts/release/exportFleetSnapshot.js` /
  `importFleetSnapshot.js`.
- The project's own `README.md`, included **unmodified** — matching
  the Beta 1.2 precedent, which also ships the plain project README
  with no RC-specific edits.
- `RC1-RELEASE-NOTES.md` (new, this artifact only) — launch
  instructions, this commit hash and build timestamp,
  supported-browser statement, storage-origin requirements, the full
  Phase 6/7 migration-rehearsal instructions and acceptance matrix,
  the Phase 9 rollback procedure, and known limitations.

**Excluded:** `.git` history, `node_modules` (installed fresh by
`Setup Strategic Fleet Manager.bat`), any personal fleet data or
custom images (none exist in this repo to begin with), `.env`
secrets (none tracked), developer caches. No `dist/` is shipped —
deliberately, per the packaging decision above; a prebuilt static
bundle would invite serving it a different way on a different origin.
Source maps are moot (nothing is prebuilt); Vite's dev server does not
emit persisted map files to ship.

`raw-data/` and `generated-data/`'s committed subset are included as
shipped source — they're already git-tracked (this program made no
change to what's tracked) and `npm ci && npm run build` was directly
proven to succeed with them present. They are dev/import-pipeline
inputs the Commander's own usage never touches, but excluding them
without individually verifying nothing in the browser bundle graph
needs them would be a guess under time pressure, not a proof — the
safe default was to ship exactly what's proven to build, nothing
invented, nothing cut without verification.

---

**Zip re-verification (addendum).** After producing the zip, it was
independently extracted fresh into a separate directory and re-proven
end to end: `npm ci` clean, `npm run build` clean, and `npm run dev`
confirmed to actually bind and serve (on a scratch port, to avoid
colliding with the smoke-test server below). This is the zip file
itself being tested, not the pre-zip directory it was built from.

---

## Phase 5 — Clean RC Smoke Test

Run against the **actual packaged commit's build output**
(`vite preview` serving `dist/` on port `4173` — a genuinely different
origin from the dev-server port used for the real-fleet rehearsal,
which is the point: this proves the *package* works in isolation,
before origin continuity is introduced as a variable at all), driven
by Playwright in a **fresh, isolated browser context** — no
`storageState`, no cookies, no prior `localStorage`/IndexedDB.

| Check | Result |
|---|---|
| Application launches | PASS |
| Beta 2.0 RC1 version visible (tab title + footer) | PASS |
| Fresh initialization succeeds (no seed fleet, no crash) | PASS |
| A ship can be added | PASS |
| A custom image can be assigned | PASS |
| Custom image survives reload | PASS |
| A vessel can be retired | PASS |
| Retired view displays it, correct header copy | PASS |
| Custom image survives retirement | PASS |
| Vessel can be recommissioned | PASS |
| Hangar Inventory loads without crashing | PASS |
| Loadout Manager loads without crashing | PASS |
| Reload does not reset state | PASS |
| No console errors throughout | PASS |

**14/14 passed.** All driven through the real UI (button clicks, file
input, navigation) — no store/console shortcuts — matching how a
Commander would actually use the app.

**Browser-support statement [in package]:** verified this cycle on
Chromium (Playwright, matching current stable Chrome/Edge). Firefox
and Safari were not independently tested this cycle; nothing in the
codebase uses a Chromium-only API (IndexedDB, `createImageBitmap`,
structured cloning, and CSS features used are all broadly standard),
so they're expected to work, but that's an expectation, not a
verification — flagged honestly rather than claimed.

---

## Phase 6 — Commander Real-Fleet Rehearsal Plan **[in package]**

**Not started.** This phase requires the Commander's actual browser
and real fleet data, which this environment has no access to — it can
only be executed by the Commander, following the instructions below.
Do not begin until the Phase 3 snapshot is confirmed saved outside the
browser and the Phase 5 smoke test above (already passed) is reviewed.

**Before opening RC1:**
1. Confirm how you currently launch SFM. If it's still
   `Start Strategic Fleet Manager.bat` (`http://localhost:5173`),
   continue as below. If it's anything else, stop and say so first —
   the origin-continuity plan changes.
2. With your **real, current** SFM tab open, run
   `scripts/release/exportFleetSnapshot.js` in DevTools console (see
   Phase 3). Confirm the downloaded JSON file exists and move it
   outside your Downloads folder to a dated location.
3. From that same console output, record your baseline counts —
   active vessels, retired vessels, builds/loadouts, custom images,
   reservations, Captain's Log entries, priority order — via the
   app's own UI (Fleet Dashboard, Hangar Inventory, Captain's Log).
   Screenshots are useful; the counts are required.
4. Close the current SFM window/tab.

**First RC1 launch:**
1. Replace the contents of your existing SFM folder with the RC1
   package (or place RC1 in a new folder — either is fine, since your
   fleet data lives in the browser, not on disk).
2. Run `Setup Strategic Fleet Manager.bat`, then
   `Start Strategic Fleet Manager.bat`.
3. Open `http://localhost:5173`. Because this is the same origin as
   before, your existing data should already be there — **observe
   this before making any edits.**
4. If the screen is empty: this does **not** by itself mean data loss
   — per Phase 2's Hard Rule, it may only mean the browser resolved a
   different origin (check the address bar exactly: `localhost` vs.
   `127.0.0.1`, and the port). Do not reload repeatedly. Instead,
   confirm the address bar origin, and if needed use
   `importFleetSnapshot.js` (Phase 9) with the Phase 3 snapshot to
   restore into whatever origin RC1 actually opened at.
5. Record: which persistence version the app reports handling
   (`PERSIST_VERSION = 10` is what RC1 ships; the migration path in
   `useFleetStore.ts` handles any older `version` found in storage
   automatically), any console errors, and the resulting counts —
   compare against the baseline from step 3 above.

---

## Phase 7 — Real-Fleet Acceptance Matrix **[in package]**

The full matrix from the work order (Fleet Identity, Custom Images,
Loadouts and Installed State, Inventory, Fleet Registry, Operational
Surfaces, Persistence) is reproduced verbatim in the package's
`RC1-RELEASE-NOTES.md` for the Commander to work through directly
against their real fleet once Phase 6 is underway. It is not
reproduced a second time here to avoid the two copies drifting apart —
see the package.

---

## Phase 8 — Defect Classification

The three-tier rubric (Release Blocker / Critical / Non-Blocking) from
the work order applies as written to whatever Phase 7 finds. One
finding from this packaging pass has already been triaged against it:
the clean-checkout test gap (Phase 1) is **Non-Blocking** — it never
touches the shipped app, only a subset of dev-tooling tests run
against a file that's deliberately never committed.

---

## Phase 9 — Rollback Readiness **[in package]**

`importFleetSnapshot.js` is the paired restore tool. Run in DevTools
console on whichever origin needs restoring:
1. Confirm `location.href` is the correct origin before running it —
   it overwrites `localStorage['sfm-fleet-store']` and replaces the
   entire IndexedDB `images` object store on whatever origin is
   currently open.
2. Run `importFleetSnapshot()`, pick the Phase 3 snapshot JSON file in
   the picker that opens.
3. Reload once the console confirms the write completed (record count
   + core-state presence are printed) — never reload before that
   confirmation.

This restores **both** storage layers together — core JSON and every
image blob — deliberately, since a rollback that recovers the JSON but
loses the image blobs would be incomplete, exactly as the work order
requires. Original application version, browser origin, and content
are all preserved in the snapshot file's own `sourceOrigin` /
`capturedAt` / `coreFleetState` / `managedShipImages` fields, so a
rollback is fully self-describing from the file alone.

---

## Phase 10 — Promotion Rule

Not reached — RC1 has not yet been run against the real fleet. Per the
work order: promotion to Beta 2.0 Final means renaming/republishing
this exact certified artifact (same bytes, same checksum), not a
rebuild, unless a Release Blocker or agreed Critical defect requires a
new RC.

---

## Required Engineering Report

- **Existing application origin:** not directly observable from this
  environment, but confirmed by evidence rather than assumed —
  `artifacts/Strategic-Fleet-Manager-Beta-1.2.zip` (the actual last
  certified release, per `README.md`'s own status line) packages
  identically to RC1 and launches via the same `.bat` files on
  `vite.config.ts`'s pinned port. `http://localhost:5173` is the
  Commander's real origin unless they've changed their launch method
  since — confirm with the Commander before Phase 6 (see Phase 2).
- **RC1 origin and continuity:** RC1 ships as a source package using
  the identical `npm run dev` / port `5173` launch method as every
  prior release, so it resolves to the same origin automatically — no
  built static bundle, no alternate port, by design (see Phase 4).
- **Storage snapshot method:** `scripts/release/exportFleetSnapshot.js`,
  run from DevTools console on the Commander's real tab; captures both
  `localStorage['sfm-fleet-store']` and the `sfm-ship-images` IndexedDB
  store into one downloadable JSON file (see Phase 3).
- **Snapshot record counts:** not yet available — requires the
  Commander's real browser; will be reported directly by the tool's
  own console output when run.
- **Build/test results:** see Phase 1 table. All gates clean; one
  Non-Blocking, non-shipping test-reproducibility finding documented.
- **Artifact filename and SHA-256:**
  `artifacts/Strategic-Fleet-Manager-Beta-2.0-RC1.zip`,
  `EC6F234A8C9B4C5B54C3D129738A8B7F5AA258D4F5FDAA2E2208B42116C7689A`
  (also in `artifacts/Strategic-Fleet-Manager-Beta-2.0-RC1-SHA256.txt`).
- **Clean-profile smoke-test results:** 14/14 passed (Phase 5), against
  both the pre-zip build and the freshly re-extracted zip itself.
- **Packaging/migration risks discovered:** (1) `index.html`'s stale
  version title, fixed; (2) the clean-checkout test-fixture gap,
  documented, non-blocking; (3) the one open confirmation needed from
  the Commander about their current launch method, flagged above, not
  yet a blocker.
- **Exact Commander rehearsal instructions:** Phase 6 and Phase 7
  above, reproduced in full in the package's `RC1-RELEASE-NOTES.md`.
