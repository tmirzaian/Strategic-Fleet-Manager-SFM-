# ADR-013 — Atomic Inventory Transactions

- **Status:** Accepted
- **Date:** 2026-07-20

## Context

ADR-010 established the unified installation engine
(`src/engine/installation/`) as the sole authority for every component
installation operation, with a pipeline documented as strictly
validate-then-mutate: "a failure at any validation stage returns
`{ ok: false }` having invoked no effect callback at all — there is no
partial commit to roll back, because nothing is written until every check
has already passed." That guarantee was, and remains, correct.

EWO-052 (Inventory Transaction Integrity Initiative) found a real gap
**inside** that already-centralized engine, not a bypass of it: a
hardpoint whose status is `'Missing'` or `'Upgrade Available'` — not
`'OK'` — can still have a real, different component physically installed
(e.g. the ship's own factory-original part, never explicitly removed
before the Commander set a new Target). `resolveDestinationHardpoint`
already refused to touch an `'OK'` slot, but INSTALL's mutation step then
unconditionally overwrote `installedItem`, with zero accounting for
whatever was previously there — never returned to Hangar Inventory, never
logged, gone from every tracked ownership state at once.

**A hidden partial-transaction bug was found and corrected during this
same investigation**, directly on point for this ADR: a first fix attempt
called the engine's existing injected `returnToInventory` effect
immediately on displacement. That effect writes straight to **live** store
state via `get()`. But the same transaction's later `commitHangarItems`
call is derived from `planHangarDecrement`, a **pure** function fed the
**snapshot** captured once at the top of `executeInstallation` — so that
later commit silently overwrote/erased the just-returned item the instant
it landed, reintroducing exactly the class of bug this mission exists to
close. Confirmed by direct reproduction before being considered fixed.

## Decision

**Displacement and consumption affecting the same ownership collection
must be planned together and committed atomically.** Concretely: a new
pure function, `planHangarReturn` (`src/engine/installation/inventoryTransactionService.ts`),
folds a displaced occupant into the same `hangarItems` array
`planHangarDecrement` then consumes from — one composed pure computation,
one final `commitHangarItems` call, never two independent writes to the
same collection within one transaction. TRANSFER's identical destination-
side gap uses the live `returnToInventory` effect directly instead,
because `executeTransfer` never separately calls `commitHangarItems`
afterward in that same transaction — no staleness risk exists there. The
rule is not "always use the pure path" or "always use the live effect" —
it is: **whichever effect touches a collection last must see every prior
effect on that same collection already composed in**, never a live write
a later pure snapshot can overwrite.

This extends, rather than replaces, ADR-010's existing pipeline (Resolve
Identity → Resolve Destination → Validate Compatibility → Validate
Ownership → Apply Ship Mutation → Apply Inventory Transaction →
Recalculate Readiness → Commit) with an explicit rule for the "Apply
Inventory Transaction" step whenever it must account for more than one
effect on the same array:

1. Every ownership mutation is fully planned before state mutation.
2. Validation completes before commit.
3. A transaction commits once.
4. Failed transactions leave prior state unchanged.
5. UI code does not mutate ownership independently — it calls the engine.
6. Displacement and consumption affecting the same state collection are
   composed into the same transaction plan, never fired as separate
   effects against the same collection within one transaction.

Both INSTALL and TRANSFER's displacement checks are identity-aware
(`identitiesMatch`, entityClass-first, per ADR-010): re-installing the
exact same component already occupying a slot never triggers a spurious
return-then-reconsume, and two differently-cataloged components sharing a
display name are never conflated.

## Consequences

An install or transfer that displaces a real, physically-installed
occupant now returns it to Hangar Inventory as part of the same atomic
commit — never silently destroyed, never duplicated. REMOVE required no
change: its `returnToInventory` call is the only hangar-touching effect in
that transaction, so no staleness risk existed there to begin with. This
principle — plan every effect against a shared collection together, then
commit once — governs any future mutation the installation engine gains
(a future Ship Management or Fleet Synchronization operation, per this
mission's own Chief Architect framing) that touches more than one
collection-affecting effect in a single transaction.

**Known, documented, not-yet-fixed gap surfaced during this mission
(out of hard-ownership-duplication scope):** `updateHangarDisposition`
changes a Hangar Item's `Disposition` field
(`'Install'|'Store'|'Stockpile'|'Trade'|'Ignore'`) with zero interaction
with `calculateComponentAvailability` — disposition is a pure
planning-intent tag today, never consulted by availability or install
logic. A component marked `'Trade'` or `'Ignore'` can still be silently
consumed by an install. Flagged for a future, narrowly-scoped follow-up
mission; not addressed here.
