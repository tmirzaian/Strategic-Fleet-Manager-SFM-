# ADR-005 — Operational Command Structure

**Strategic Fleet Manager Quartermaster Edition**
**Chief Architect Draft**
**Status: Proposed Foundation**

## Purpose

Quartermaster Edition extends beyond visual presentation.

Strategic Fleet Manager is not organized as a collection of software
pages.

It is organized as the Command Staff of the flagship.

The Commander does not navigate menus.

The Commander receives operational reports from trusted officers, each
responsible for a defined operational domain.

ADR-004 established the ship.

ADR-005 establishes the crew.

## Mission Statement

Strategic Fleet Manager represents the Command Information System of the
flagship.

The left navigation is not merely navigation.

It is the Commander's chain of command.

Each Station owns one operational responsibility.

Each Station answers one category of Commander questions.

Every workflow should reinforce this relationship.

## Design Philosophy

Traditional software asks:

> Which page do you want?

Quartermaster Edition asks:

> Which officer do you wish to consult?

The Commander never thinks in terms of screens.

The Commander thinks in terms of operational responsibility.

## Command Hierarchy

### Commander

**Role:** Strategic authority. Mission intent. Final decision maker.

The Commander delegates rather than performs every operational task
personally.

The Commander never manually manages logistics, engineering analysis, or
records.

Instead, trusted officers report their operational status.

### Executive Officer (XO)

| | |
|---|---|
| **Primary Responsibility** | Overall fleet readiness. |
| **Owns** | Mission Control |
| **Answers** | *"Commander... here is the current operational picture."* |

**Responsibilities:**

- Fleet readiness
- Mission readiness
- Priority actions
- Executive summary
- Immediate concerns

The Executive Officer speaks first.

Mission Control remains the application's landing compartment.

### Quartermaster

| | |
|---|---|
| **Primary Responsibility** | Fleet logistics. |
| **Owns** | Fleet Dashboard, Ship Management, Hangar Inventory, Decision Center |
| **Answers** | *"Commander... here is the current logistical status of the fleet."* |

**Responsibilities:**

- Fleet inventory
- Component management
- Ship maintenance
- Procurement
- Equipment disposition
- Fleet readiness support

The Quartermaster answers the question:

> What do we own, what do we need, and what should we do with it?

### Flight Commander

| | |
|---|---|
| **Primary Responsibility** | Operational mission planning. |
| **Owns** | Flight Commander, Mission Packages (future), Squadron Operations (future), Tactical Intelligence (future) |
| **Answers** | *"Commander... here are today's operational opportunities."* |

**Responsibilities:**

- Factory Loadout Intelligence
- Target acquisition
- Mission planning
- Tactical opportunities
- Future mission recommendations

Flight Commander is intentionally positioned later in the workflow.

Most Commander sessions begin with logistics.

Flight Commander becomes relevant once operational planning begins.

### Yeoman

| | |
|---|---|
| **Primary Responsibility** | Official fleet records. |
| **Owns** | Captain's Log, Settings, Import, Export, Backup, Restore, Documentation |
| **Answers** | *"Commander... fleet records have been updated."* |

**Responsibilities:**

- Historical records
- Administrative functions
- Data integrity
- Fleet history
- Operational archives

The Yeoman safeguards the official record.

### Engineering Officer (Reserved)

| | |
|---|---|
| **Status** | Future Expansion |
| **Potential Responsibilities** | Blueprint research, engineering optimization, component simulation, power analysis, heat analysis, signature management, future design tools |

This Station is intentionally reserved.

**No implementation is authorized under this ADR.**

## Operational Stations

Every Station owns one operational domain.

No Station should gradually absorb responsibilities belonging to another.

This separation preserves clarity throughout Quartermaster Edition.

## Reporting Style

Each Station communicates as a professional officer.

**Examples:**

| Station | Line |
|---|---|
| Executive Officer | *Operations Standing By.* |
| Quartermaster | *Warehouse Inventory Available.* |
| Flight Commander | *Standing Watch.* |
| Yeoman | *Recent Fleet Activity.* |

Language remains calm. Professional. Military. Confident.

Never conversational. Never comedic. Never theatrical.

## Navigation Philosophy

The navigation tree represents reporting relationships.

It is not organized alphabetically.

It is not organized chronologically.

It is not organized technically.

It is organized according to the Commander's operational workflow.

```
Commander
    ↓
Executive Officer
    ↓
Quartermaster
    ↓
Flight Commander
    ↓
Yeoman
```

Future Stations should be inserted only where their operational authority
naturally belongs.

## Officer Identity

Quartermaster Edition does not use animated assistants.

There are no avatars.

No chatbots.

No artificial personalities.

The officers exist through:

- compartment identity
- operational language
- workflow ownership
- reporting structure
- consistent terminology

The software itself becomes the crew.

## Future Opportunities

This architecture naturally supports future systems including:

- Daily Officer Briefings
- VoiceAttack integration
- Operational notifications
- Mission packages
- Organization management
- Fleet command hierarchy
- Squadron operations
- Organization logistics

All future systems should identify the Station responsible for presenting
new information.

## Relationship to ADR-004

ADR-004 defines: **How the flagship feels.**

ADR-005 defines: **Who operates the flagship.**

Both documents together establish Quartermaster Edition's architectural
identity.

Future UX proposals should reference both ADRs before introducing new
interaction patterns.

## Chief Architect Directive

Strategic Fleet Manager is no longer designed as traditional software.

Beginning with Quartermaster Edition, the Commander experiences the
application through the chain of command.

Every Station exists to reduce cognitive load by presenting information
through clearly defined operational responsibility.

When introducing future features, the first architectural question shall
be:

> "Which officer owns this responsibility?"

Only after answering that question should implementation begin.

## Commander Acceptance Criteria

Before certifying this ADR, verify that it satisfies the following:

- The command hierarchy feels natural to a military organization.
- Every existing compartment has a clear operational owner.
- No Station has overlapping authority with another.
- The reporting structure reinforces Commander workflow rather than
  software navigation.
- ADR-004 (ship) and ADR-005 (crew) complement one another without
  redundancy.
- The document provides a durable foundation for future Quartermaster
  Edition work rather than prescribing implementation details.

---

## Chief Architect's Closing Note

Commander...

I genuinely believe we'll look back at ADR-004 and ADR-005 as the two
documents that defined Strategic Fleet Manager's identity.

One gave us the flagship.

The other gave us the crew.

From this point forward, we won't simply ask, "Where does this feature
belong?"

We'll ask:

> "Who reports this information to the Commander?"

And that single question will quietly guide every future design decision
we make.
