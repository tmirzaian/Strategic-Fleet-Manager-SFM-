# Founder Insights

Product principles behind Strategic Fleet Manager, distilled from Founder QA
on Sprint 1 and carried forward into every later sprint.

## Players do not need another spreadsheet

Star Citizen players already track their fleet in spreadsheets, Notion docs,
and Discord pins. Those tools are honest about what they are: passive
records. This app only earns its place if it does something a spreadsheet
can't — tell the player what to do next, not just what's true right now.

## The ship becomes the MMO class

In most MMOs, "what should I do right now" is answered by your class and
build. In Star Citizen, that role is played by the ship and its Build. Ship
Detail is the character sheet. If it's wrong, unclear, or slow, the whole
mental model the player relies on breaks — which is why it's treated as P0.

## Two-Minute Rule

A player should be able to record a real session change — installed a part,
picked up loot, claimed a ship — in under two minutes, from opening the app
to a Captain's Log entry existing. Every added field, dropdown, or
confirmation step on Quick Update is a tax against this rule and has to earn
its place.

## Decision Support > Information Display

Listing data is easy. Telling a player what to do with it is the actual
product. Decision Center doesn't just show whether an item matches a build —
it recommends Keep or Ignore. Mission Control doesn't just show ships — it
ranks Top Priority. Procurement List doesn't just show gaps — it tells the
player what to go get, fleet-wide, sorted by how much is needed.

## Procurement List > Missing Components

A per-ship "missing items" list is information display. A fleet-wide
Procurement List — one row per component, aggregated across every Build that
wants it — is decision support. It answers "what should I buy or go get
next," which is a different (and more useful) question than "what does this
one ship lack."

## Hangar, not Warehouse

Word choice sets expectations. "Warehouse" implies cold storage and logistics
overhead. "Hangar" implies things that are close to being useful, staged for
a ship. The Hangar Inventory is written and designed around "what do I own
that could go on a ship soon," not generic inventory management.

## Build, not Mission Configuration / Profile

"Build" is the term the player community already uses and understands. A
"Mission Configuration" or "Profile" sounds like enterprise software and
signals the wrong kind of complexity. Every label in the product — Factory
Loadout, Installed Loadout, Target Build — stays in player language, never
system language.

## Vendor trash should not be tracked

Tracking every low-value item a player intends to sell to an NPC adds
bookkeeping without adding decisions. It clutters the Hangar Inventory and
Captain's Log with noise that doesn't change what the player does next.
Vendor trash isn't a disposition option, isn't stored, and isn't logged —
Decision Center recommends **Ignore** for anything no active Build needs, and
that's the end of the workflow for that item.
