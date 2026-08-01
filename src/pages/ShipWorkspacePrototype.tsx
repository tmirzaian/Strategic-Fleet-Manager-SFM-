import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ShipWheel,
  ChevronDown,
  ChevronRight,
  Plus,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Wrench as WrenchIcon,
  RotateCcw,
  Package,
  Maximize2,
  Minimize2,
  Layers,
  Code2,
  Trash2,
  X,
  ArrowRightLeft,
  PackagePlus,
} from 'lucide-react'
import { useFleetStore, DEV_SEED_FLEET_ENABLED, type TargetOverrideInput } from '../store/useFleetStore'
import { selectActiveShips, isActiveShip } from '../utils/fleetLifecycle'
import Badge, { statusTone } from '../components/Badge'
import ComponentAssignmentLabel from '../components/ComponentAssignmentLabel'
import ReadinessBar, { colorFor } from '../components/ReadinessBar'
import ShipHeroFrame from '../components/ShipHeroFrame'
import EditFleetAssetModal from '../components/EditFleetAssetModal'
import { resolveShipManagementIllustration } from '../config/assets'
import { useResolvedShipImage } from '../utils/useResolvedShipImage'
import { resolveShipStockRoleFocus, resolveShipEntityClass } from '../utils/shipIdentityLine'
import { getConfigurableSlotsForShip, type ConfigurableSlotRuntimeRecord } from '../generated/configurableSlots'
import { catalogComponentsByEntityClass, catalogComponentsByName, resolveComponentByEntityClass } from '../generated/componentCatalog'
import { deriveInstallCandidates, type BorrowInstallCandidate } from '../utils/installCandidates'
import { buildPortTree, type PortTreeNode } from '../utils/portTree'
import { groupPortTree } from '../utils/portTreeGrouping'
import { withMissileRackAggregation, makeMissileAggregateRow, type DisplayHardpoint } from '../utils/missileRackAggregation'
import { componentCategoryIcon } from '../utils/componentCategoryIcon'
import { buildFleetPriorityOptions } from '../utils/fleetPriority'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { formatHardpointLabel } from '../utils/hardpointLabelPresentation'
import { TOP_LEVEL_GROUP_ORDER, legacyPortGroupLabel } from '../utils/commanderSystemTaxonomy'
import { buildShipManagementSummary, resolveOperationalReviewStatus, resolveNewTargetStatus, STATUS_PILL, type ShipManagementSummaryContext } from '../utils/shipManagementSummary'
import { describeAcquisitionHint, type AcquisitionHint } from '../utils/componentAcquisitionHint'
import { prepareCanonicalHardpoints, makeHardpointChildSlotRow } from '../utils/canonicalHardpointPreparation'
import { withComponentOwnedChildSlots } from '../utils/componentOwnedSlots'
import { isComponentSelectableForPort } from '../data/componentCatalog'
import { fullComponentCatalog } from '../utils/fullComponentCatalog'
import TargetComponentPicker, { type TargetComponentOption } from '../components/TargetComponentPicker'
import type { Hardpoint } from '../types'

/**
 * EWO-062A (Part A) — the operational banner's hero footprint, shared by
 * both the empty state (Quartermaster Bay artwork) and, conceptually, the
 * selected-ship state (`ShipHeroFrame`'s own `data-testid="ship-hero-
 * image-area"` region) — one named token instead of two independently
 * hard-coded class strings that could silently drift apart again. The
 * desktop tier (343px) matches the selected-ship header's measured
 * rendered footprint at the 1320px-wide reference desktop viewport;
 * `h-44` at narrower widths reuses `ShipHeroFrame`'s own existing mobile
 * value unchanged.
 */
const SHIP_MANAGEMENT_HERO_HEIGHT_CLASS = 'h-44 sm:h-[343px]'

/**
 * Commander Intent — SW-002 replaces the SW-001 prototype terminology.
 * "Operational Review" remains the page's own default/background state,
 * not a selectable option. Selecting an intent is local UI state only.
 */
type CommanderIntent = 'MANAGE_LOADOUT' | 'CHANGE_INSTALLED'
const COMMANDER_INTENT_LABEL: Record<CommanderIntent, string> = {
  MANAGE_LOADOUT: 'Manage Loadout',
  CHANGE_INSTALLED: 'Change Installed Components',
}

/** EWO-067 (Part D) / EWO-067A (Part C) — one concise operational
 * statement per workstation (the middle typography tier, between the
 * large title and the smaller supporting description) plus a compact
 * supporting description. EWO-067A tightens both to read as fragments
 * ("Target loadout • doctrine • mission builds") rather than full
 * sentences — "Typography should become the primary visual feature,"
 * so the copy itself now carries more of the premium feel that EWO-067's
 * background artwork used to. */
const COMMANDER_INTENT_STATEMENT: Record<CommanderIntent, string> = {
  MANAGE_LOADOUT: "Configure this ship's preferred configuration.",
  CHANGE_INSTALLED: 'Modify the physical ship.',
}
const COMMANDER_INTENT_DESCRIPTION: Record<CommanderIntent, string> = {
  MANAGE_LOADOUT: 'Target loadout • doctrine • mission builds',
  CHANGE_INSTALLED: 'Install, replace, remove or borrow physical components.',
}
/** EWO-067 (Part E) — a subtle workstation identifier in each card's
 * upper-right corner, consistent with this app's existing small
 * uppercase/letter-spaced section-label language (e.g. the page's own
 * "SHIP MANAGEMENT" header eyebrow). EWO-067A (Part E) explicitly
 * retains this unchanged — it already does its job. */
const COMMANDER_INTENT_WORKSTATION_LABEL: Record<CommanderIntent, string> = {
  MANAGE_LOADOUT: 'Loadout Workstation',
  CHANGE_INSTALLED: 'Maintenance Bay',
}

/** EWO-065 (Part C) — the Hero's "Missing: …" text shows exact component
 * names up to this count before falling back to an inline "View All" text
 * link; chosen to comfortably fit the Hero's own two-line clamp at this
 * text's actual size/column width without the link appearing prematurely
 * on a still-short list. */
const MISSING_SUMMARY_VISIBLE_LIMIT = 6

// EWO-071 (Part A) — the numbered "SW-002 Component Selection Priority"
// instructional block that used to render here (Reserved Components /
// Available Inventory / Add Newly Acquired Component / Installed On Other
// Ships / Remaining Compatible Components) documented implementation
// behavior rather than helping the Commander make the immediate decision.
// Removed outright, no replacement paragraph — the four canonical group
// headings in `renderInstallDisclosure` now carry that meaning directly.

/** EWO-064 (Part C) — the Commander-facing verb for a Decision Summary
 * row, matched to the same acquisition tone `acquisitionRank` (in
 * shipManagementSummary.ts) already ranks by. */
function decisionActionVerb(hint: AcquisitionHint): string {
  switch (hint.tone) {
    case 'warning':
      return 'Reassign'
    case 'success':
      return 'Install'
    case 'cyan':
      return 'Borrow'
    default:
      return 'Record'
  }
}

// EWO-063 (Part C) — `criticalHardpointsInPriorityOrder` and the
// acquisition-rank/hint/availability calculations that used to live here
// (and the standalone `hintFor` closure below) all moved into
// `src/utils/shipManagementSummary.ts`'s `buildShipManagementSummary` —
// the one authoritative calculation the Hero, Decision Summary,
// notification icons, Missing Components, and Availability badges all
// now read from, rather than five independently hand-maintained
// expressions. Re-exported unchanged so existing test imports still
// resolve.
export { criticalHardpointsInPriorityOrder } from '../utils/shipManagementSummary'

/**
 * Beta 2.0 structural prototype (Commander Sea Trials, SW-002 Revision A).
 * Deliberately an orchestration shell: reads Ship Detail's and Loadout
 * Manager's existing data and components (same store, same canonical
 * hardpoint preparation pipeline, same Build Progress engine, same
 * inventory-accounting/reservation/compatibility authorities, same Ship
 * Image Resolver, same manufacturer-logo and ship-role resolvers) but
 * never becomes a new domain authority, and introduces no persistence or
 * backend mutation. Ship Detail and Loadout Manager are both untouched
 * and remain the real, save-capable workflows.
 *
 * SW-002 Revision A — per the architecture/data-lineage audit, both the
 * Active and Reviewed hardpoint sets are now prepared through
 * `prepareCanonicalHardpoints` (the exact same canonical-overlay +
 * component-owned-child-slot pipeline Ship Detail uses) before anything
 * else touches them — `hardpoints.filter(h => h.buildId === X)` is only
 * ever the raw INPUT to that preparation, never the final UI authority.
 *
 * Engineering Guidance (SW-002, Chief Architect): the three lenses below
 * are not three screens — they are one continuous conversation with the
 * same ship. Switching intent never remounts anything, never resets
 * scroll position, and never discards local Commander edits (desired-
 * target changes and taxonomy expansion state survive an intent switch;
 * only a different Ship/Loadout selection clears them) — the banner stays
 * the anchor throughout.
 */
export default function ShipWorkspacePrototype() {
  const { shipId } = useParams()
  const navigate = useNavigate()
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)
  const hangarItems = useFleetStore((s) => s.hangarItems)
  const installedLoadouts = useFleetStore((s) => s.installedLoadouts)
  const reservations = useFleetStore((s) => s.reservations)
  const saveMissionConfiguration = useFleetStore((s) => s.saveMissionConfiguration)
  const setActiveBuildStore = useFleetStore((s) => s.setActiveBuild)
  const setFleetPriorityStore = useFleetStore((s) => s.setFleetPriority)
  // SW-013A (Objective 3) — Remove Installed Component. The same shared
  // installation engine Ship Detail's own LoadoutPortTree already uses
  // (`executeInstallation`/`REMOVE`, via this one store action) — never a
  // second, parallel uninstall implementation.
  const removeComponentStore = useFleetStore((s) => s.removeComponent)
  const addLogEntry = useFleetStore((s) => s.addLogEntry)
  // SW-014A — Ship Workspace becomes another client of the SAME shared
  // installation engine every other install/reservation/hangar surface
  // already uses (`installComponent`/`addHangarItem`/`releaseReservation`)
  // — never a second, parallel install implementation.
  const installComponentStore = useFleetStore((s) => s.installComponent)
  const moveToShipStore = useFleetStore((s) => s.moveToShip)
  const addHangarItemStore = useFleetStore((s) => s.addHangarItem)

  // SW-015C (Deliverable 4) — active-only for every "which OTHER ship"
  // selector (the Select Ship dropdown, the install/borrow donor pool,
  // the Fleet Priority ranking options below) — but the direct `ship`
  // lookup just below stays unrestricted, so this page still works for
  // a retired vessel reached via direct link or the Retired view (that's
  // exactly where its own Fleet Registry "Return to Active Service"
  // control lives, inside Ship Settings).
  const activeShips = selectActiveShips(ships)
  const ship = ships.find((s) => s.id === shipId)
  // The currently-viewed ship stays in the dropdown even when retired
  // (labeled distinctly below) so the control never shows a blank/
  // mismatched selection while the rest of the page clearly renders a
  // specific vessel — reached via direct link or the Retired view, both
  // legitimate ways to land here on a retired ship.
  const sortedShips = [...activeShips, ...(ship && !isActiveShip(ship) ? [ship] : [])].sort((a, b) => a.name.localeCompare(b.name))

  // SW-011A (Objective 1) — the real DataCore entity class for the
  // currently viewed ship, when a deep-import record exists (undefined
  // for a hand-authored seed ship — see resolveShipEntityClass's own doc
  // comment). Only used to look up Commander-visible Configurable Slots;
  // never for display.
  const shipEntityClass = shipId ? resolveShipEntityClass(shipId, fleetAssets) : undefined

  // SW-011A (Objective 1/2) — every Commander-visible configurable slot
  // for this ship, grouped by (immediate parent's bare port name, own
  // bare port name). Bare `itemPortName` alone is not reliably unique per
  // ship — DataCore reuses generic sub-port names across sibling
  // assemblies (e.g. a left-wing and right-wing gimbal mount both having
  // a child named `hardpoint_class_2`, confirmed live during this
  // sprint's own verification). One level of parent context resolves
  // every such case; a row is only ever treated as a confident match when
  // EXACTLY ONE record shares its (parent, self) key — a genuine deeper
  // collision (the same bare name under an ALSO-repeated parent, e.g. the
  // Retaliator's 5 turret mounts) is treated as "no confident match,"
  // never a guess. See `Hardpoint.sourceParentItemPortName`'s own doc
  // comment for the full reasoning.
  function slotKey(parentPortName: string | null | undefined, portName: string): string {
    return `${parentPortName ?? ''}::${portName}`
  }

  const configurableSlotsByKey = useMemo(() => {
    const map = new Map<string, ConfigurableSlotRuntimeRecord[]>()
    for (const record of getConfigurableSlotsForShip(shipEntityClass)) {
      const key = slotKey(record.parentPortName, record.portName)
      const existing = map.get(key)
      if (existing) existing.push(record)
      else map.set(key, [record])
    }
    return map
  }, [shipEntityClass])

  function configurableSlotFor(hp: Hardpoint): ConfigurableSlotRuntimeRecord | undefined {
    const sourceItemPortName = hp.sourceItemPortName
    if (!sourceItemPortName) return undefined
    const sourceParentItemPortName = hp.sourceParentItemPortName
    const candidates = configurableSlotsByKey.get(slotKey(sourceParentItemPortName, sourceItemPortName))
    if (candidates?.length === 1) return candidates[0]
    // SW-013C.2G — a dormant port's own ship never occupies it, so it can
    // never earn a confirmed-slot entry of its own (that data is indexed
    // strictly per occupying ship) — see Port.dormantDonorShipEntityClass's
    // own doc comment. Falls back to the donor ship's own confirmed entry
    // for the identical (parent, self) port-name key — the SAME
    // authority, resolved through the ship that actually earned it.
    const donorShipEntityClass = hp.dormantDonorShipEntityClass
    if (hp.isDormant && donorShipEntityClass) {
      const donorCandidates = getConfigurableSlotsForShip(donorShipEntityClass).filter(
        (record) => slotKey(record.parentPortName, record.portName) === slotKey(sourceParentItemPortName, sourceItemPortName)
      )
      if (donorCandidates.length === 1) {
        const record = donorCandidates[0]
        // SW-013C.2G Amendment C — a confirmed swap group proves
        // components are interchangeable on SOME real ship; it does not
        // by itself prove every member is valid on THIS dormant port's
        // own ship/variant/family (see Hardpoint.dormantAllowedComponentEntityClasses's
        // own doc comment for the evidence model). When present, narrows
        // the donor's own full eligibleComponents list down to only the
        // independently-confirmed subset — never widens it.
        const allowList = hp.dormantAllowedComponentEntityClasses
        if (!allowList) return record
        const restricted = (record.eligibleComponents ?? []).filter((entityClass) => allowList.includes(entityClass))
        return { ...record, eligibleComponents: restricted, eligibleComponentCount: restricted.length }
      }
    }
    return undefined
  }

  // Prototype-only local state — a loadout picked here never touches
  // ship.activeBuildId or any store mutator. Re-baselines to the ship's
  // real Active Loadout (the required default) every time the selected
  // ship itself changes; the Commander must intentionally pick another.
  const [reviewedBuildId, setReviewedBuildId] = useState(ship?.activeBuildId ?? '')
  useEffect(() => {
    setReviewedBuildId(ship?.activeBuildId ?? '')
  }, [shipId, ship?.activeBuildId])

  const [commanderIntent, setCommanderIntent] = useState<CommanderIntent | null>(null)

  // SW-008A — Manage Loadout's local, unsaved New Target edits (renamed
  // from "Desired Target" — Commander-facing text only, this state's own
  // shape is unchanged). Still SW-002's own "Prototype interaction"
  // allowance, explicitly never persisted (Scope Protection: no
  // persistence, no backend mutation, no reservation/inventory/installed-
  // component change — Objective 4). Keyed by slotLabel; only ever reset
  // when the Ship or reviewed Loadout changes, never when the Commander
  // merely switches lenses — "Never Lose Commander Work." A slot's own
  // entry is removed entirely (not just set back to the original value)
  // whenever the Commander returns it to the port's real Current Target,
  // so `pendingChangeCount` below — unchanged by this mission, already
  // exactly `Object.keys(desiredTargets).length`-equivalent per row —
  // continues to correctly exclude it (Objective 6).
  const [desiredTargets, setDesiredTargets] = useState<Record<string, string>>({})
  // SW-008A — the chosen option's own resolved entityClass, parallel to
  // `desiredTargets`, so `calculateComponentAvailability` below can match
  // by real canonical identity instead of display-name-only once a New
  // Target has been picked from the compatible-options list (never
  // possible with the free-text field this replaces).
  const [desiredTargetEntityClasses, setDesiredTargetEntityClasses] = useState<Record<string, string | undefined>>({})
  useEffect(() => {
    setDesiredTargets({})
    setDesiredTargetEntityClasses({})
  }, [reviewedBuildId])

  // SW-013C.1 (Objective 5) — UI Truthfulness. Switching the reviewed
  // Loadout (the effect above) silently drops any unsaved New Target edits
  // with no warning of any kind — the exact "Commander cannot reliably
  // save a build" failure mode this job's live proof reproduced. A pill
  // click no longer switches immediately whenever a pending edit exists;
  // it stages the destination here and the Loadout panel renders an
  // inline confirm (never a modal — consistent with this page's own
  // convention) requiring an explicit "Discard & Switch" or "Cancel."
  const [pendingSwitchBuildId, setPendingSwitchBuildId] = useState<string | null>(null)

  // SW-013A (Objective 2) — tree expansion is a ship-topology concern, not
  // a per-Loadout one: the same ports/taxonomy groups exist regardless of
  // which Loadout is being reviewed, only the installed/target items
  // differ. Previously reset on every `reviewedBuildId` change, which
  // collapsed the Commander's expanded view on every loadout-pill switch
  // — real, avoidable friction, since switching loadouts on the SAME ship
  // is a one-click, extremely common operation. Now reset only when the
  // ship itself changes (a genuinely different port tree).
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Core Components']))
  useEffect(() => {
    setExpandedGroups(new Set(['Core Components']))
  }, [shipId])
  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  // Change Installed Components' inline "Install / Change" disclosure —
  // never a dialog (Scope Protection), just an inline detail row, the
  // same pattern MissionComposer's own expandedSlot already uses.
  const [expandedInstallRowId, setExpandedInstallRowId] = useState<string | null>(null)
  // SW-014A — the disclosure's own action feedback (success/error from the
  // last Install/Reassign/Borrow/Record attempt), scoped to whichever row
  // is currently expanded — reset whenever a different row opens so a
  // stale result from a previous row's action can never bleed into this
  // one. Never a toast/modal — inline, matching this page's own
  // established "never a dialog" convention.
  const [installNotice, setInstallNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  // Borrow group — same per-candidate confirm-step pattern, keyed by
  // `${hp.id}:${item}:${donorShipId}` (the same component can be
  // borrowable from more than one ship at once).
  const [borrowConfirmKey, setBorrowConfirmKey] = useState<string | null>(null)
  // Tier 4 (Newly Acquired Component) — the inline "record a new
  // component" form's own open/selection state, keyed per row.
  const [newComponentFormHpId, setNewComponentFormHpId] = useState<string | null>(null)
  const [newComponentSelection, setNewComponentSelection] = useState<{ item: string; entityClass?: string }>({ item: '' })

  // SW-011A (Objective 3) — Configurable Slot read-only inspection.
  // Same "never a dialog" inline-disclosure pattern as
  // expandedInstallRowId above, its own independent state so opening one
  // never affects the other. SW-011A (Objective 4) — Developer Mode is
  // local, unpersisted UI state (no store field, no new concept beyond
  // this page) gating raw diagnostic detail; off by default so an
  // ordinary Commander only ever sees the understandable "Needs Review"
  // indicator, never a raw diagnostic message.
  const [inspectedConfigurableSlotId, setInspectedConfigurableSlotId] = useState<string | null>(null)
  const [developerMode, setDeveloperMode] = useState(false)

  // EWO-064 (Part G) / EWO-071 (Part F) — the Borrow group is collapsed
  // by default within the Install/Change disclosure (a cross-ship
  // transfer is the biggest decision the ladder offers); only one install
  // disclosure is ever open at a time, so a single shared toggle (not a
  // per-row map) is sufficient — reset whenever a different row's
  // disclosure opens, below.
  const [borrowSectionOpen, setBorrowSectionOpen] = useState(false)

  // EWO-065 (Part A) — Ship Settings entry point, opened from the Hero's
  // top-left control; reuses the existing EditFleetAssetModal verbatim
  // (this mission establishes the access point only, not a modal redesign).
  const [editOpen, setEditOpen] = useState(false)

  // EWO-063 — Hero State Synchronization. Every one of these row-level
  // Change Installed Components states is keyed by a Hardpoint/candidate
  // id that is itself build-scoped, so switching ships already made a
  // stale key harmlessly match nothing on the new ship's own hardpoint
  // set — but a harmlessly-orphaned "open" disclosure/notice is still
  // stale UI state a Commander never asked to carry to a different ship.
  // Reset explicitly, alongside every other per-ship reset in this file,
  // rather than relying on the id-mismatch as an implicit safety net.
  useEffect(() => {
    setExpandedInstallRowId(null)
    setInstallNotice(null)
    setBorrowConfirmKey(null)
    setNewComponentFormHpId(null)
    setNewComponentSelection({ item: '' })
    setInspectedConfigurableSlotId(null)
    setBorrowSectionOpen(false)
    setEditOpen(false)
  }, [shipId])

  // EWO-064 (Part G) / EWO-071 (Part F) — a freshly-opened (or closed)
  // Install/Change disclosure always starts with Borrow collapsed, never
  // carrying over whichever state happened to be expanded on a
  // previously-reviewed row.
  useEffect(() => {
    setBorrowSectionOpen(false)
  }, [expandedInstallRowId])

  // SW-013A (Objective 3) — Remove Installed Component. The one
  // deliberate exception to this page's own "never a dialog" convention:
  // a real confirm modal, not an inline disclosure, matching the existing
  // precedent for every other destructive/irreversible action already in
  // this codebase (Ship Detail's own LoadoutPortTree remove modal,
  // Loadout Manager's "Delete Loadout" confirmation) — a Commander should
  // never uninstall a real component one accidental click away from a
  // silent mutation. (EWO-073 — the old "Remove from Fleet" confirmation
  // this comment used to also cite no longer exists; vessel removal is
  // now the reversible Fleet Registry Retire Vessel flow, SW-015C, which
  // is deliberately NOT irreversible/destructive and so isn't part of
  // this same precedent list.)
  const [removeTarget, setRemoveTarget] = useState<{ slotLabel: string; itemLabel: string } | null>(null)
  const [returnToHangar, setReturnToHangar] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  // SW-008D (Objective 6) — "Set as Active" now calls the real store
  // mutator (`setActiveBuild`); this notice reports the real outcome,
  // superseding SW-002 Revision A's "prototype only" placeholder. Reset
  // whenever the reviewed selection changes.
  const [setActiveNotice, setSetActiveNotice] = useState<string | null>(null)
  useEffect(() => {
    setSetActiveNotice(null)
  }, [reviewedBuildId])

  // SW-008D (Objectives 1/2) — Save/Discard feedback for Manage Loadout.
  // Reset whenever the reviewed Loadout changes so a stale message from a
  // previous Loadout never lingers after switching.
  const [saveNotice, setSaveNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  useEffect(() => {
    setSaveNotice(null)
  }, [reviewedBuildId])

  // SW-008D (Objective 3) — "+ New Loadout" inline creation form (never a
  // dialog — Scope Protection's established inline-disclosure pattern,
  // same as Change Installed Components' Install/Change row). Nothing is
  // written to the store until the Commander explicitly confirms; Cancel
  // simply resets this local state, leaving no partial record anywhere.
  type NewLoadoutSource = 'FACTORY' | 'ACTIVE' | 'EXISTING' | 'EMPTY'
  const [newLoadoutFormOpen, setNewLoadoutFormOpen] = useState(false)
  const [newLoadoutName, setNewLoadoutName] = useState('')
  const [newLoadoutSource, setNewLoadoutSource] = useState<NewLoadoutSource>('FACTORY')
  const [newLoadoutExistingId, setNewLoadoutExistingId] = useState('')
  const [newLoadoutError, setNewLoadoutError] = useState<string | null>(null)
  function resetNewLoadoutForm() {
    setNewLoadoutFormOpen(false)
    setNewLoadoutName('')
    setNewLoadoutSource('FACTORY')
    setNewLoadoutExistingId('')
    setNewLoadoutError(null)
  }
  // SW-013A (Objective 2) — a real state-preservation bug, not just a
  // missing convenience: this form's own "Copy an Existing Loadout"
  // dropdown holds a Build id scoped to whichever ship was selected when
  // the Commander opened it. Switching ships via the Ship dropdown while
  // this draft is open previously left that stale id in place — an
  // open-but-invalid reference into the OLD ship's builds. A genuinely
  // different ship is a genuinely different draft context, unlike a mere
  // Loadout-pill switch on the SAME ship (which intentionally does NOT
  // reset this — reviewing a different existing Loadout while composing a
  // new one is legitimate, in-progress Commander work).
  useEffect(() => {
    resetNewLoadoutForm()
  }, [shipId])

  // Sticky Context — hidden while the banner itself is in view; appears,
  // pinned, only once the Commander has scrolled past it. A zero-height
  // sentinel sits at the very top of the banner; once it scrolls above
  // the viewport the banner is no longer the true header, so the compact
  // echo takes over.
  const bannerSentinelRef = useRef<HTMLDivElement>(null)
  const systemsPanelRef = useRef<HTMLDivElement>(null)
  const [showStickyContext, setShowStickyContext] = useState(false)
  useEffect(() => {
    const el = bannerSentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setShowStickyContext(!entry.isIntersecting), { rootMargin: '-1px 0px 0px 0px', threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ship?.id])

  function scrollToSystemsWorkspace() {
    systemsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const shipBuilds = builds.filter((b) => b.shipId === ship?.id)
  // EWO-066A (Part A) — `ship.activeBuildId` is the one authoritative
  // source for "which Loadout is active" (see the `Ship` type); each
  // Build's own `isActive` boolean is a denormalized mirror that can
  // drift out of sync with it. Comparing against `activeBuildId`
  // directly guarantees exactly one build ever reads as active, by
  // construction, regardless of whether every `isActive` flag elsewhere
  // is correctly in sync.
  const activeBuild = shipBuilds.find((b) => b.id === ship?.activeBuildId)
  const reviewedBuild = shipBuilds.find((b) => b.id === reviewedBuildId) ?? activeBuild ?? shipBuilds[0]

  // SW-008D (Objective 1) — Save Changes. Objective 4: the exact same
  // `saveMissionConfiguration` authority MissionComposer's Loadout Manager
  // already uses — never a second, parallel persistence path. Only the
  // Commander's actual pending edits are passed as targetOverrides; every
  // untouched slot's current real Target is preserved automatically
  // (saveMissionConfiguration reads the reviewed Loadout's own current
  // rows as its baseline for `startingState: 'EXISTING'`). Updates the
  // SAME Build in place (existingBuildId, saveAsNew: false) — Current
  // Target, readiness, and child-slot regeneration (missile racks/mining
  // modules) all refresh for free once the store's real hardpoints change,
  // since every derived value on this page already reads from the store.
  function handleSaveChanges() {
    if (!ship || !reviewedBuild) return
    const targetOverrides: Record<string, TargetOverrideInput> = {}
    for (const [slotLabel, targetItem] of Object.entries(desiredTargets)) {
      targetOverrides[slotLabel] = { targetItem, targetEntityClass: desiredTargetEntityClasses[slotLabel] }
    }
    const outcome = saveMissionConfiguration({
      shipId: ship.id,
      name: reviewedBuild.name,
      startingState: 'EXISTING',
      existingBuildId: reviewedBuild.id,
      targetOverrides,
      setActive: false,
      saveAsNew: false,
    })
    if (outcome.success) {
      setDesiredTargets({})
      setDesiredTargetEntityClasses({})
      setSaveNotice({ tone: 'success', message: `"${reviewedBuild.name}" saved.` })
    } else {
      setSaveNotice({ tone: 'error', message: outcome.message ?? 'Could not save this Loadout.' })
    }
  }

  // SW-008D (Objective 2) — Discard Changes. Clears the local pending-edit
  // overlay only; nothing was ever written to the store while these edits
  // were pending (SW-008A's own local-editing-only guarantee), so there is
  // nothing to undo persistently — every New Target cell falls back to
  // reading the real Current Target the instant this state clears.
  function handleDiscardChanges() {
    setDesiredTargets({})
    setDesiredTargetEntityClasses({})
    setSaveNotice(null)
  }

  // SW-013C.1 (Objective 5) — the guarded entry point for changing which
  // Loadout is reviewed. Stages the switch behind an explicit confirm
  // whenever a pending New Target edit exists; switches immediately (the
  // prior, unguarded behavior) otherwise — a Commander who isn't mid-edit
  // sees no change at all.
  function requestReviewedBuildSwitch(nextBuildId: string) {
    if (nextBuildId === reviewedBuildId) return
    if (Object.keys(desiredTargets).length > 0) {
      setPendingSwitchBuildId(nextBuildId)
      return
    }
    setReviewedBuildId(nextBuildId)
  }
  function confirmDiscardAndSwitch() {
    if (!pendingSwitchBuildId) return
    setReviewedBuildId(pendingSwitchBuildId)
    setPendingSwitchBuildId(null)
  }
  function cancelPendingSwitch() {
    setPendingSwitchBuildId(null)
  }

  // SW-008D (Objective 3) — New Loadout creation, through the same shared
  // authority as Save above. "Active Loadout" as an initialize-from source
  // maps to cloning the ship's real active Build (startingState: 'EXISTING',
  // saveAsNew: true) — saveMissionConfiguration has no dedicated "ACTIVE"
  // starting state of its own, so this is the equivalent composition of
  // its existing, already-proven primitives, not a new persistence path.
  function handleCreateLoadout() {
    if (!ship) return
    const trimmedName = newLoadoutName.trim()
    if (!trimmedName) {
      setNewLoadoutError('Name the Loadout before creating it.')
      return
    }
    if (shipBuilds.some((b) => b.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      setNewLoadoutError(`"${trimmedName}" already exists — choose a different name.`)
      return
    }
    let params: { startingState: 'FACTORY' | 'EMPTY' | 'EXISTING'; existingBuildId?: string; saveAsNew?: boolean }
    if (newLoadoutSource === 'EMPTY') {
      params = { startingState: 'EMPTY' }
    } else if (newLoadoutSource === 'FACTORY') {
      params = { startingState: 'FACTORY' }
    } else if (newLoadoutSource === 'ACTIVE') {
      if (!activeBuild) {
        setNewLoadoutError('This Fleet Asset has no Active Loadout to initialize from.')
        return
      }
      params = { startingState: 'EXISTING', existingBuildId: activeBuild.id, saveAsNew: true }
    } else {
      if (!newLoadoutExistingId) {
        setNewLoadoutError('Select a Loadout to initialize from.')
        return
      }
      params = { startingState: 'EXISTING', existingBuildId: newLoadoutExistingId, saveAsNew: true }
    }
    const outcome = saveMissionConfiguration({
      shipId: ship.id,
      name: trimmedName,
      targetOverrides: {},
      setActive: false,
      ...params,
    })
    if (outcome.success && outcome.buildId) {
      resetNewLoadoutForm()
      setReviewedBuildId(outcome.buildId)
      setCommanderIntent('MANAGE_LOADOUT')
    } else {
      setNewLoadoutError(outcome.message ?? 'Could not create this Loadout.')
    }
  }

  // BANNER — always the ship's real Active Loadout ("Is this ship mission
  // ready?" is a fact about the ship, independent of whichever Loadout
  // the Commander happens to be reviewing below — "the ship never
  // changes, only the tools change"). SW-002 Revision A Phase 1: prepared
  // through the same canonical pipeline Ship Detail uses, not raw rows.
  const activeHardpointsRaw = hardpoints.filter((h) => h.buildId === activeBuild?.id)
  const activeHardpoints = ship ? prepareCanonicalHardpoints(ship.id, activeHardpointsRaw, fleetAssets) : []
  // LOADOUT WORKFLOW / SYSTEMS WORKSPACE — the Loadout the Commander is
  // actually reviewing/managing; defaults to Active but is independent of
  // it from here down. Same canonical preparation as the banner (Phase 1:
  // "all three lenses consume the same prepared hardpoint set").
  const reviewedHardpointsRaw = hardpoints.filter((h) => h.buildId === reviewedBuild?.id)
  const reviewedHardpoints = ship ? prepareCanonicalHardpoints(ship.id, reviewedHardpointsRaw, fleetAssets) : []

  // EWO-063 (Part C) — ONE authoritative calculation, not five
  // independent ones. EWO-064 (Part F) — `reviewedSummary` (not
  // `activeSummary`) is what powers the Hero, Decision Summary, Category
  // Demand Cards, and Missing Components: the Sticky Context Bar already
  // shows which Loadout is under review, so the Hero reflects that same
  // Loadout, not silently the ship's Active one underneath a header that
  // says something else. `activeSummary` still exists as the seed for
  // `reviewedSummary` when Reviewed and Active are the same Loadout (the
  // common case) — literally the same object, never a second,
  // independently-recomputed pass over identical data — and is otherwise
  // unused directly by this page.
  // EWO-088 — activeShips (SW-015C), not the raw fleet: the Tier-3 Borrow
  // hint this context feeds (via describeAcquisitionHint) must never treat
  // a retired ship as a real donor source.
  const summaryContext: ShipManagementSummaryContext = { shipId: ship?.id ?? '', build: activeBuild, hangarItems, installedLoadouts, reservations, ships: activeShips }
  const activeSummary = buildShipManagementSummary(activeHardpoints, summaryContext)
  const reviewedSummary = reviewedBuild?.id === activeBuild?.id ? activeSummary : buildShipManagementSummary(reviewedHardpoints, { ...summaryContext, build: reviewedBuild })

  // Change Status — derived from real local edits (SW-002's own
  // "Prototype interaction"), never a fixed placeholder. Applying
  // Changes / Changes Applied / Failed are future states this prototype
  // never enters (no backend mutation exists to apply).
  const pendingChangeCount = reviewedHardpoints.reduce((count, hp) => {
    const desired = desiredTargets[hp.slotLabel]
    return desired !== undefined && desired !== hp.targetItem ? count + 1 : count
  }, 0)
  const changeStatusLabel = pendingChangeCount > 0 ? `Pending Changes (${pendingChangeCount})` : 'No Pending Changes'

  // UX-005A (Deliverable 8) — layers the per-vessel custom-image tier on
  // top of `ship.imageUrl` (already the fully-resolved official/fallback
  // chain from materialization — see fleetAssetMaterializer.ts). Called
  // unconditionally per the Rules of Hooks; `ship?.id ?? ''` is a safe
  // no-op input when no ship is selected.
  const { src: imageSrc } = useResolvedShipImage(ship?.id ?? '', ship?.imageUrl)
  // EWO-062 — resolved once; undefined only if the illustration is ever
  // disabled again, in which case the empty state falls back to a plain
  // dark panel rather than a broken image (same contract every other
  // illustration resolver in this codebase already guarantees).
  const quartermasterBayEmptySrc = resolveShipManagementIllustration('quartermaster-bay-empty')
  const role = ship ? resolveShipStockRoleFocus(ship.id, fleetAssets) : undefined
  const identitySubtitle = ship ? (role ? `${ship.manufacturer} · ${role}` : ship.manufacturer) : ''

  // SW-008A Revision 1 — New Target is a configuration catalog ("what
  // should this build call for?"), not an inventory picker ("what can I
  // physically install right now?" — that remains Change Installed
  // Components' own, separate job). Eligibility is never restricted by
  // ownership: every component genuinely compatible with this exact
  // canonical port (by the same `isComponentSelectableForPort` authority
  // every other Target picker in this app already uses — never a second,
  // independently-derived rule set) is offered, whether the Commander owns
  // zero copies or a hundred. `fullComponentCatalog` (shared with
  // MissionComposer's own Loadout Manager Target picker — SW-008A Rev 1
  // extracted it into `src/utils/fullComponentCatalog.ts` for exactly this
  // reuse) is the one real-catalog source; inventory/reservation/ownership
  // state is surfaced separately, as the adjacent Availability/
  // Reservations columns already do — never used to fragment or narrow
  // this list.
  //
  // Approved option order (Objective 5): Intentional Empty first, then
  // Current Target, then Factory Target (when distinct), then Installed
  // (when distinct), then every remaining compatible catalog component in
  // alphabetical order — `fullComponentCatalog` is already alphabetically
  // sorted, so filtering it (after the four pinned entries are excluded by
  // the shared `seen` set) preserves that order for free. No duplicates:
  // every entry, pinned or catalog-sourced, passes through the same `seen`
  // gate.
  //
  // Intentional Empty is offered for every port this function is ever
  // called for — every non-structural (configurable) port. A structural
  // assembly row (a turret/mount preserved only to explain hierarchy) has
  // no target of its own at all and never reaches this function or renders
  // a picker; that is the one, already-documented exclusion (EWO-020's own
  // "structural rows carry no assignment" rule), not a new doctrine.
  // SW-013C.2F (Objective 3) — Retaliator Commander Messaging. A narrow,
  // individually-verified set of entity classes whose real, confirmed
  // DataCore record carries its own further child topology (SW-013C.2E's
  // own investigation: the Ordnance module's real `hardpoint_torpedo_launcher_fore`/
  // `_rear` rack-mount port) that SFM's current architecture cannot yet
  // materialize — a multi-category (Missile/Bomb/Rocket), size-range
  // (S3–S9) port shape no existing compatibility mechanism represents,
  // requiring a genuinely new capability (see SW-013C.2E's report). Rather
  // than silently showing an Ordnance module as if selecting it were
  // "complete" — which would be misleading, not merely incomplete — this
  // set drives a small, honest "Additional Topology Pending" badge (never
  // a fabricated child row, never a placeholder graphic). Generic
  // mechanism (a Set lookup), narrow evidence-gated data — exactly the
  // same posture as `CONFIRMED_MODULE_ENTITY_CLASSES`; extending it to a
  // future confirmed case never requires touching the rendering code
  // below, only this list.
  const DORMANT_TOPOLOGY_ENTITY_CLASSES = new Set(['AEGS_Retaliator_Module_Front_Bomber', 'AEGS_Retaliator_Module_Rear_Bomber'])

  function dormantTopologyNoticeFor(hp: Hardpoint): string | undefined {
    const currentEntityClass = hp.targetEntityClass ?? hp.installedEntityClass ?? hp.factoryEntityClass
    if (!currentEntityClass || !DORMANT_TOPOLOGY_ENTITY_CLASSES.has(currentEntityClass)) return undefined
    return 'This module contains additional topology (its own torpedo/bomb mount) that will be supported by a future topology engine. Not a failure — the module selection itself is fully saved.'
  }

  // SW-013C.2F (Objective 4) — Commander Label Cleanup, Phase 1. Generic
  // (not Retaliator-specific): strips a leading "{shipName} " prefix from
  // a component's real catalog display name ONLY for cosmetic display
  // purposes — the underlying committed value (`item`, what's actually
  // saved) is never touched. Any future ship whose own component names
  // redundantly repeat the ship's own name gets this for free; a ship
  // whose components don't (the overwhelming majority) renders byte-
  // identical to before this mission.
  function stripRedundantShipNamePrefix(displayName: string, shipName: string | undefined): string {
    if (!shipName) return displayName
    const prefix = `${shipName} `
    return displayName.startsWith(prefix) ? displayName.slice(prefix.length) : displayName
  }

  // SW-013C.2E (Objective 2/6) — the canonical display category for a
  // swap-group candidate, matching `fullComponentCatalog.ts`'s own
  // `categoryLabelFor` convention (translate DataCore's raw category to
  // the same Commander-facing vocabulary used everywhere else), but
  // sourced from this file's own small, evidence-gated swap-group
  // families rather than `CATEGORY_TO_PORT_TYPE` (deliberately excluded
  // there — see `appendSwapGroupOptions`'s own doc comment). Only the
  // categories a real swap-group branch can ever actually offer are
  // listed; an unrecognized category (should never happen given the
  // swap-group data these branches consume) falls back to the raw
  // DataCore string itself rather than fabricating a label.
  function swapGroupCategoryLabelFor(category: string): string {
    switch (category) {
      case 'Module':
        return 'Module'
      case 'EMP':
        return 'EMP'
      case 'QuantumInterdictionGenerator':
        return 'Quantum Dampener'
      case 'MissileLauncher':
        return 'Missile Rack'
      case 'BombLauncher':
        return 'Bomb Rack'
      // SW-013C.2F (Objective 1) — matches `compatibilityTypeFor`'s own
      // Turret/TurretBase fallback (VRF-002) and CATEGORY_TO_PORT_TYPE's
      // own mapping — the same canonical vocabulary every other turret-
      // shell component already reads as "Gimbal Mount".
      case 'Turret':
        return 'Gimbal Mount'
      default:
        return category
    }
  }

  function newTargetOptionsFor(hp: Hardpoint): TargetComponentOption[] {
    const seen = new Set<string>()
    const options: TargetComponentOption[] = []
    function addPinned(item: string | undefined, entityClass: string | undefined, label?: string) {
      if (!item || seen.has(item)) return
      seen.add(item)
      options.push({ item, path: item, entityClass, label })
    }
    addPinned('—', undefined, 'Intentional Empty (—)')

    // SW-013C.2F (Objective 2) — for a swap-group-only port, the
    // certified sweep runs BEFORE Current/Factory/Installed are pinned
    // (reversed from every other port type below), so that whichever of
    // those three happens to already be a certified swap-group member
    // (the overwhelmingly common case — a port's own factory/installed/
    // target item usually IS a member of its own swap group) gets the
    // SAME canonical "{name} — {category}, S{size}" label as every other
    // option, instead of showing up unlabeled (bare display name only).
    // Root cause of "Factory Device / Factory Device"-style ambiguity
    // (Commander Certification, Warlock EMP): REP-8 (the factory default,
    // previously pinned FIRST with no label at all) and REP-VS (a swap-
    // group option, already correctly labeled since SW-013C.2E) rendered
    // with visibly different formatting for what a Commander reasonably
    // expects to look like two parallel, comparable choices — not because
    // the data disagreed, but because only one of the two ever passed
    // through the canonical-label code path. `addPinned`'s own
    // already-seen guard (by display name) means a value that's a real
    // swap-group member is only ever added ONCE, by whichever branch
    // reaches it first — swapping the order is the entire fix; the
    // fallback pinning after this block still covers a target/factory/
    // installed value that ISN'T a swap-group member (legacy data, or a
    // free-text/unresolved value), exactly as before.
    const swapGroupOnlyType = hp.type === 'Module' || hp.type === 'EMP' || hp.type === 'Quantum Dampener'
    const swapGroupConditionalType = hp.type === 'Missile Rack' || hp.type === 'Gimbal Mount'
    const hasConfirmedGroup = swapGroupConditionalType && Boolean(configurableSlotFor(hp)?.eligibleComponents?.length)
    if (swapGroupOnlyType || hasConfirmedGroup) {
      appendSwapGroupOptions(hp.type)
      addPinned(hp.targetItem, hp.targetEntityClass)
      addPinned(hp.factoryItem, hp.factoryEntityClass)
      addPinned(hp.installedItem, hp.installedEntityClass)
      return options
    }

    addPinned(hp.targetItem, hp.targetEntityClass)
    addPinned(hp.factoryItem, hp.factoryEntityClass)
    addPinned(hp.installedItem, hp.installedEntityClass)

    // SW-013C.2B (Objective 3) / SW-013C.2D — appends every member of this
    // port's own certified swap-group (SW-011A's Configurable Slot
    // authority) as an option, tagged with `pathPrefix`. A member entity
    // class that doesn't resolve in the browser catalog is skipped, not
    // fabricated — see SW-013C.2B report's own documented gap
    // (UMNT_ANVL_S5_Rotodome_Mk2, present in generation-time data, absent
    // from the shipped runtime component catalog).
    //
    // SW-013C.2E (Objective 2/6) — `label` now follows the SAME canonical
    // convention `fullComponentCatalog.ts` already established for a
    // genuinely ambiguous name ("{name} — {category}, S{size}"), rather
    // than this branch's own ad hoc "{name} — S{size}" shape (missing the
    // category, and set unconditionally rather than only when a real
    // disambiguation need exists elsewhere in the app). `swapGroupCategoryLabelFor`
    // translates the CANDIDATE's own raw DataCore category — never the
    // destination port's type — matching `categoryLabelFor`'s own
    // candidate-centric convention exactly (relevant when the candidate's
    // category genuinely differs from the port's, e.g. a Bomb Rack
    // candidate on a Missile-Rack-typed port).
    function appendSwapGroupOptions(pathPrefix: string): void {
      const slot = configurableSlotFor(hp)
      for (const entityClass of slot?.eligibleComponents ?? []) {
        if (seen.has(entityClass)) continue
        const resolution = resolveComponentByEntityClass(entityClass)
        if (resolution.status !== 'resolved') continue
        const { displayName, size, category } = resolution.record
        if (seen.has(displayName)) continue
        seen.add(displayName)
        options.push({
          item: displayName,
          path: `${pathPrefix} → ${displayName}`,
          entityClass,
          // SW-013C.2F (Objective 4) — the LABEL only (never `item`, the
          // real committed value TargetComponentPicker always saves) drops
          // a leading "{Ship Name} " prefix when the real catalog display
          // name redundantly repeats it (the Retaliator's own module
          // family: "Retaliator Cargo Front Module" -> "Cargo Front
          // Module") — the "Ship: Retaliator" context is already shown at
          // the top of this exact page, so the repetition adds nothing.
          // "Front"/"Rear" is deliberately KEPT (unlike the work order's
          // own illustrative "Unladen Module" example, which would make
          // Front and Rear read identically) — Objective 4's own
          // overriding rule, "do not remove information needed for
          // clarity," wins over the shorter illustrative text.
          label: `${stripRedundantShipNamePrefix(displayName, ship?.name)} — ${swapGroupCategoryLabelFor(category)}, S${size}`,
        })
      }
    }

    // Every swap-group-only port (Module/EMP/Quantum Dampener always;
    // Missile Rack/Gimbal Mount when a confirmed group exists) already
    // returned above, before this point — see that block's own doc
    // comment for the full "why" (SW-013C.2B/SW-013C.2D/SW-013C.2F). What
    // remains below is the broad generic size/category sweep, used by
    // every other port type, and by Missile Rack/Gimbal Mount ports with
    // no confirmed group of their own (the overwhelming majority — e.g.
    // the Hornet Ghost's own rack/wing-weapon ports, SW-008C's own
    // regression) — unchanged from before this mission.
    for (const c of fullComponentCatalog) {
      if (seen.has(c.item)) continue
      if (isComponentSelectableForPort(c.item, hp.type, hp.size, { itemEntityClass: c.entityClass, destinationFactoryEntityClass: hp.factoryEntityClass })) {
        seen.add(c.item)
        options.push(c)
      }
    }
    return options
  }

  // EWO-063 (Part C) — the decision-intelligence rules live inside
  // `buildShipManagementSummary` itself, not re-derived here: the
  // Category Demand Cards read `reviewedSummary.categoryDemand` (full
  // unresolved demand) and the Decision Summary panel below reads
  // `reviewedSummary.actionableDecisions`/`actionableCount` (EWO-065B —
  // genuinely actionable only, excluding Purchase-Required catalog-only
  // gaps).

  // SW-007C — Commander Taxonomy Authority. Same `groupPortTree()` engine
  // Ship Detail's LoadoutPortTree calls, so top-level categories, category
  // order, and intra-group child order (Core Components, Utility) are
  // identical between the two pages by construction, not by two hand-
  // maintained tables staying in sync. The only Workspace-specific step is
  // pre-filling `groupLabel` for a port that doesn't carry the real
  // canonical signal (M80/Starlite's deliberately-unconverted CUSTOM
  // builds — SW-006) via `legacyPortGroupLabel`, so Workspace still offers
  // a category header for that data rather than an orphan row (Ship
  // Detail, by contrast, intentionally leaves it ungrouped — see
  // commanderSystemTaxonomy.ts's own doc comment). Nested PDC subgroups
  // (irrelevant to this page's own rendering) are flattened back to their
  // real port children rather than dropped.
  //
  // SW-007D — the same `withMissileRackAggregation` pass Ship Detail's
  // LoadoutPortTree runs, in the same position (before grouping), using
  // the same shared `makeMissileAggregateRow` factory: a rack's real per-
  // slot missile children collapse into the one row a Commander reasons
  // about ("4 × S1 Missile Slots"), never four identical peer rows. The
  // real children remain intact in the underlying canonical topology —
  // this only changes what's rendered.
  // SW-008C (Objective 3/5) — Draft Topology Regeneration. Manage
  // Loadout's New Target picker is local-editing-only (SW-008A): a pending
  // choice lives in `desiredTargets`/`desiredTargetEntityClasses`, never
  // written back into the store's real Hardpoint rows. `reviewedHardpoints`
  // (from `prepareCanonicalHardpoints`) therefore still carries the OLD
  // rack's real per-slot missile children — swapping a rack's New Target
  // updated the cell but left its stale child topology (count, size,
  // aggregation) attached, exactly the "MSD-341 -> MSD-322 still shows x4"
  // defect this mission reports.
  //
  // Fix: overlay each edited port's pending entityClass as
  // `previewTargetEntityClass` — the exact field `withComponentOwnedChildSlots`
  // already reads first (`currentEntityClassOf`, FTB-001B) to decide
  // whether a component-owned parent's children are stale — then re-run
  // that SAME shared regeneration function (never a second, simplified
  // reconstruction) before building the tree. This is the identical
  // mechanism MissionComposer's own live preview already relies on for
  // this exact "child-slot structure updates immediately" guarantee; Ship
  // Workspace was simply never wired to call it with its own pending edits.
  const draftHardpoints = useMemo(() => {
    const hasPendingEdit = Object.keys(desiredTargets).length > 0
    if (!hasPendingEdit) return reviewedHardpoints
    const overlaid = reviewedHardpoints.map((hp) => {
      if (desiredTargets[hp.slotLabel] === undefined) return hp
      return { ...hp, previewTargetEntityClass: desiredTargetEntityClasses[hp.slotLabel] }
    })
    return withComponentOwnedChildSlots(overlaid, makeHardpointChildSlotRow)
  }, [reviewedHardpoints, desiredTargets, desiredTargetEntityClasses])

  const commanderTree = useMemo(() => {
    const tree = buildPortTree<DisplayHardpoint>(draftHardpoints)
    const aggregated = withMissileRackAggregation<DisplayHardpoint>(tree, (h) => desiredTargets[h.slotLabel] ?? h.targetItem, makeMissileAggregateRow)
    const withGroupLabels: PortTreeNode<DisplayHardpoint>[] = aggregated.map((node) =>
      node.hardpoint.groupLabel ? node : { ...node, hardpoint: { ...node.hardpoint, groupLabel: legacyPortGroupLabel(node.hardpoint) } }
    )
    const displayTree = groupPortTree(withGroupLabels)
    function flattenPortNodes(nodes: typeof displayTree): PortTreeNode<DisplayHardpoint>[] {
      return nodes.flatMap((n) => (n.kind === 'port' ? [n.node] : flattenPortNodes(n.children)))
    }
    const buckets = new Map<string, PortTreeNode<DisplayHardpoint>[]>()
    for (const node of displayTree) {
      if (node.kind === 'group') buckets.set(node.label, flattenPortNodes(node.children))
    }
    return buckets
  }, [draftHardpoints, desiredTargets])

  const groupsWithContent = TOP_LEVEL_GROUP_ORDER.filter((group) => (commanderTree.get(group)?.length ?? 0) > 0)
  function expandAllGroups() {
    setExpandedGroups(new Set(groupsWithContent))
  }
  function collapseAllGroups() {
    setExpandedGroups(new Set())
  }

  // Adaptive Commander Lens (SW-002) — the underlying authority never
  // changes (same canonically-prepared PortTreeNode tree, same Hardpoint
  // fields); only which columns render does. Lens 1 (no intent selected)
  // is the read-only default; Lens 2/3 adapt column-for-column to the
  // work order's spec.
  // EWO-069 (Part B) — Manage Loadout consolidates its former separate
  // Availability + Reservations columns into one Status column, dropping
  // this lens from 8 columns to 7. EWO-069A (Part A) then retires the
  // Actions column outright (its one action relocates into the New
  // Target cell — see renderLensCells) — 7 columns down to 6. EWO-070
  // (Part E/F) — Change Installed Components' own former Inventory +
  // Availability columns are consolidated into one canonical Status
  // column (7 columns down to 6), the same treatment Manage Loadout
  // already received — all three lenses now share the same column count.
  const lensColumnCount = 6

  function renderLensHeader() {
    if (commanderIntent === 'MANAGE_LOADOUT') {
      return (
        <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
          <th className="px-4 py-2.5 font-medium">Port</th>
          <th className="px-4 py-2.5 font-medium">Size / Type</th>
          <th className="px-4 py-2.5 font-medium">Installed</th>
          <th className="px-4 py-2.5 font-medium">Current Target</th>
          <th className="px-4 py-2.5 font-medium">New Target</th>
          <th className="px-4 py-2.5 font-medium">Status</th>
        </tr>
      )
    }
    if (commanderIntent === 'CHANGE_INSTALLED') {
      return (
        <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
          <th className="px-4 py-2.5 font-medium">Port</th>
          <th className="px-4 py-2.5 font-medium">Size / Type</th>
          <th className="px-4 py-2.5 font-medium">Installed</th>
          <th className="px-4 py-2.5 font-medium">Target</th>
          <th className="px-4 py-2.5 font-medium">Status</th>
          <th className="px-4 py-2.5 font-medium">Actions</th>
        </tr>
      )
    }
    return (
      <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
        <th className="px-4 py-2.5 font-medium">Port</th>
        <th className="px-4 py-2.5 font-medium">Size / Type</th>
        <th className="px-4 py-2.5 font-medium">Factory</th>
        <th className="px-4 py-2.5 font-medium">Installed</th>
        <th className="px-4 py-2.5 font-medium">Target</th>
        <th className="px-4 py-2.5 font-medium">Status</th>
      </tr>
    )
  }

  function renderLensCells(hp: DisplayHardpoint): ReactNode {
    if (hp.isStructural) {
      return (
        <td colSpan={lensColumnCount - 2} className="px-4 py-2 text-muted/50">
          —
        </td>
      )
    }

    if (commanderIntent === 'MANAGE_LOADOUT') {
      // SW-013C.2F Amendment B — a payload-array aggregate row (missile
      // rack, bomb rack, or any future rack family sharing the same
      // `withMissileRackAggregation` mechanism) has no real Hardpoint of
      // its own — `hp.slotLabel` is the synthetic label (e.g. "Torpedorack
      // — Bomb"), and Amendment A's own `commitNewTarget` fan-out (below)
      // deliberately never writes an entry keyed by it, writing instead to
      // every real child slotLabel (`hp.missileAggregate.childSlotLabels`).
      // Reading `desiredTargets[hp.slotLabel]` here — the SAME synthetic
      // key the write side never populates — is therefore always
      // `undefined` for an aggregate row, so `desired` silently fell
      // through to `hp.targetItem` (the last-SAVED value) immediately
      // after every pending pick: the picker visibly "reverted" even
      // though the pending edit was correctly recorded (save already
      // worked, per Amendment A). Confirmed the live selection handler
      // was exactly the mismatch the Amendment B work order named: the
      // WRITE side treats an aggregate row as N real child rows; the READ
      // side was still treating it as if it were one real row keyed by
      // its own (nonexistent) slotLabel.
      //
      // Fix: for an aggregate row, resolve the pending value from its own
      // children's real slotLabels instead — `commitNewTarget`'s fan-out
      // always writes the identical value to every child in the same
      // state update, so any one child that has a pending entry speaks
      // for the whole rack. `hp.targetItem`/`hp.targetEntityClass`
      // themselves are left completely untouched (still the aggregate's
      // own correctly-computed last-SAVED baseline, from
      // `makeMissileAggregateRow` — see missileRackAggregation.ts) so
      // `isEdited` below still compares "pending" against "saved," not a
      // value against itself.
      const aggregateChildLabels = hp.missileAggregate?.childSlotLabels
      const pendingChildEntry = aggregateChildLabels?.find((label) => desiredTargets[label] !== undefined)
      const desired = aggregateChildLabels ? (pendingChildEntry !== undefined ? desiredTargets[pendingChildEntry] : hp.targetItem) : (desiredTargets[hp.slotLabel] ?? hp.targetItem)
      const isEdited = desired !== hp.targetItem
      const desiredEntityClass = !isEdited
        ? hp.targetEntityClass
        : aggregateChildLabels
          ? aggregateChildLabels.map((label) => desiredTargetEntityClasses[label]).find((ec) => ec !== undefined)
          : desiredTargetEntityClasses[hp.slotLabel]
      // EWO-069 (Part B/D/H/I) — replaces the former separate Availability
      // (`calculateComponentAvailability`) + Reservations (`derivePortLogistics`
      // — which read only the SAVED `hp.targetItem`, never the live
      // selection) columns with one live Status pill, computed against
      // `desired`/`desiredEntityClass` (whatever the Commander currently
      // has selected, edited or not) so it recalculates immediately on
      // every New Target change with no save/blur/refresh — the same
      // `describeAcquisitionHint` authority every other acquisition-tier
      // surface already reads, never a second one.
      const availability = calculateComponentAvailability(desired, hangarItems, installedLoadouts, reservations, desiredEntityClass)
      const liveHint = ship
        ? describeAcquisitionHint({
            componentName: desired,
            componentEntityClass: desiredEntityClass,
            currentShipId: ship.id,
            currentBuildId: reviewedBuildId,
            currentSlotLabel: hp.slotLabel,
            hangarItems,
            installedLoadouts,
            reservations,
            // EWO-088 — activeShips (SW-015C): a retired donor is never a
            // real Borrow Available source, same contract as the Hero/
            // Decision Summary's shared summaryContext just above.
            ships: activeShips,
          })
        : { tone: 'muted' as const, label: 'Purchase Required' as const, detail: '' }
      const newTargetStatus = resolveNewTargetStatus({ hp, desiredTargetItem: desired, desiredTargetEntityClass: desiredEntityClass, isEdited, hint: liveHint })
      const newTargetStatusPill = STATUS_PILL[newTargetStatus]
      // Part C — quantity belongs only with genuinely available unreserved
      // inventory; every other tier (including a real 0-available Missing
      // gap) shows its own canonical label alone, never "0 AVAILABLE."
      const newTargetStatusLabel =
        newTargetStatus === 'Available in Inventory' && availability.availableQuantity > 0
          ? `${availability.availableQuantity} ${newTargetStatusPill.compactLabel}`
          : newTargetStatusPill.compactLabel

      // SW-008A (Objective 6) — a real selection always replaces the slot's
      // entry outright; returning to the port's own Current Target removes
      // the entry entirely (not merely a no-op value) so Pending Change
      // detection — untouched below, still exactly `desired !== hp.targetItem`
      // — has nothing left to count for this slot.
      //
      // SW-013C.2F Amendment A (Finding 1) — mirrors MissionComposer.tsx's
      // own EWO-054 fan-out, previously never replicated here: a payload-
      // array aggregate row (missile rack or bomb rack) has no real
      // Hardpoint of its own — its `slotLabel` (e.g. "Torpedorack — Bomb")
      // is synthetic, standing in for N real per-slot children
      // ("Torpedorack — Bomb Slot 1"..."Slot 20"). Writing the Commander's
      // one selection to the aggregate's own synthetic label produced a
      // `targetOverrides` entry `saveMissionConfiguration` could never
      // resolve to a real port — confirmed the exact root cause of "Could
      // not save — 1 assignment(s) referenced a port that no longer
      // exists on this ship: Torpedorack — Bomb," which also silently
      // rolled back the parent rack's own pending swap (the whole save
      // transaction fails together, per saveMissionConfiguration's own
      // all-or-nothing contract — see its own "every recognized slot must
      // resolve" doc comment). Fixed identically to MissionComposer: the
      // one Commander selection fans out to every real child slotLabel
      // the aggregate stands in for, so saveMissionConfiguration's
      // existing per-slot materialization (unchanged) writes N identical
      // target assignments, same as if the Commander had set each slot
      // individually. Every non-aggregate row (the overwhelming majority)
      // still writes to exactly its own single slotLabel, unchanged.
      //
      // SW-013C.2F Amendment B — a rack swap regenerates its children with
      // fresh, POSITION-based slotLabels ("<rack> — Bomb Slot 1"..."N")
      // that can coincidentally match a PRIOR rack generation's own child
      // labels — "Slot 1" exists regardless of which rack geometry
      // produced it. Confirmed real: swapping a 20xS3 rack (a Thunderball
      // Bomb assigned to every slot) to a 1xS10 rack left the NEW S10
      // child's own picker showing the stale Thunderball selection —
      // `desiredTargets["Torpedorack — Bomb Slot 1"]` from the OLD
      // generation was never cleared, and the new generation's own first
      // child happens to reuse that exact same slotLabel. Whenever a
      // RACK's own target changes (never an aggregate row's own targets,
      // which this same function fans OUT to, never in), clear every
      // pending entry already recorded under that rack's own child-label
      // prefix first, so a fresh rack generation always starts clean — a
      // harmless no-op for every ordinary, childless port.
      function commitNewTarget(value: string, entityClass: string | undefined) {
        const targetSlotLabels = hp.missileAggregate?.childSlotLabels ?? [hp.slotLabel]
        const staleChildPrefix = hp.missileAggregate ? null : `${hp.slotLabel} — `
        setDesiredTargets((prev) => {
          const next = { ...prev }
          if (staleChildPrefix) for (const key of Object.keys(next)) if (key.startsWith(staleChildPrefix)) delete next[key]
          for (const slotLabel of targetSlotLabels) {
            if (!hp.missileAggregate && value === hp.targetItem) delete next[slotLabel]
            else next[slotLabel] = value
          }
          return next
        })
        setDesiredTargetEntityClasses((prev) => {
          const next = { ...prev }
          if (staleChildPrefix) for (const key of Object.keys(next)) if (key.startsWith(staleChildPrefix)) delete next[key]
          for (const slotLabel of targetSlotLabels) {
            if (!hp.missileAggregate && value === hp.targetItem) delete next[slotLabel]
            else next[slotLabel] = entityClass
          }
          return next
        })
      }

      return (
        <>
          <td className="px-4 py-1.5 text-muted max-w-0">
            <ComponentAssignmentLabel value={hp.installedItem} />
          </td>
          <td className="px-4 py-1.5 text-muted/80 max-w-0">
            <ComponentAssignmentLabel value={hp.targetItem} />
          </td>
          <td className="px-4 py-1.5">
            {/* EWO-069A (Part A) — the former standalone Actions column
                (only ever populated for an edited row, effectively blank
                seventh-column real estate the rest of the time) is
                retired outright; its one action (restore to factory
                target) relocates here, alongside the control it actually
                acts on, rather than reserving a whole column for it. */}
            <div className="space-y-1">
              <TargetComponentPicker
                id={`new-target-${hp.id}`}
                value={desired}
                onChange={commitNewTarget}
                options={newTargetOptionsFor(hp)}
                ariaLabel={`New target for ${formatHardpointLabel(hp.slotLabel)}`}
                showFullIdentity
                title={desired}
              />
              {isEdited && (
                <button
                  onClick={() => commitNewTarget(hp.factoryItem, hp.factoryEntityClass)}
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-cyan transition-colors"
                  title="Restore factory target"
                >
                  <RotateCcw size={11} /> Restore Factory Target
                </button>
              )}
            </div>
          </td>
          <td className="px-4 py-1.5 whitespace-nowrap">
            <Badge tone={newTargetStatusPill.tone}>{newTargetStatusLabel}</Badge>
          </td>
        </>
      )
    }

    if (commanderIntent === 'CHANGE_INSTALLED') {
      // EWO-063 (Part C) — reads the one precomputed summary rather than
      // recalculating; `reviewedSummary` always reflects whichever
      // Loadout this table is currently rendering (Active when no
      // different Loadout is under review).
      //
      // EWO-069A — pre-existing bug fix, discovered while re-verifying
      // this lens for Part D: `draftHardpoints` (this component's own
      // `commanderTree` source) additively materializes component-owned
      // child-slot rows via `withComponentOwnedChildSlots` — real,
      // Commander-visible rows (the SW-011A Configurable Slot feature's
      // own child ports) that never went through `reviewedSummary`'s own
      // per-hardpoint loop, since that loop only ever iterates
      // `reviewedHardpoints` (the pre-materialization array). The
      // resulting `.get(hp.id)` miss previously crashed this render
      // outright (`Cannot read properties of undefined`) the moment a
      // Commander expanded a group containing one and switched to this
      // lens. Recomputed live for exactly this case — the identical
      // `calculateComponentAvailability` call `reviewedSummary` itself
      // used to build the map in the first place, never a second
      // authority.
      const availability =
        reviewedSummary.availabilityByHardpointId.get(hp.id) ?? calculateComponentAvailability(hp.targetItem, hangarItems, installedLoadouts, reservations, hp.targetEntityClass)
      // EWO-070 (Part E/F) — the former separate Inventory (raw owned
      // quantity) + Availability ("N Available"/"—") columns are
      // consolidated into one canonical Status pill — the exact same
      // `resolveOperationalReviewStatus`/`STATUS_PILL` vocabulary
      // Operational Review already established (Part D — "the same
      // Commander-facing name/state for the same port," never a second,
      // lens-specific classification). Unlike Manage Loadout's own live
      // "New Target" status, this reads the SAVED `hp.targetItem` — there
      // is no pending, unsaved selection concept in this lens. Same
      // materialized-child-slot-row fallback as `availability` above.
      const hint = reviewedSummary.hintByHardpointId.get(hp.id)
      const changeInstalledStatus = resolveOperationalReviewStatus(hp, hint)
      const changeInstalledStatusPill = STATUS_PILL[changeInstalledStatus]
      const changeInstalledStatusLabel =
        changeInstalledStatus === 'Available in Inventory' && availability.availableQuantity > 0
          ? `${availability.availableQuantity} ${changeInstalledStatusPill.compactLabel}`
          : changeInstalledStatusPill.compactLabel
      const isRowExpanded = expandedInstallRowId === hp.id
      return (
        <>
          <td className="px-4 py-1.5 text-muted max-w-0">
            <ComponentAssignmentLabel value={hp.installedItem} />
          </td>
          <td className="px-4 py-1.5 text-cyan/90 max-w-0">
            <ComponentAssignmentLabel value={hp.targetItem} />
          </td>
          <td className="px-4 py-1.5 whitespace-nowrap">
            <Badge tone={changeInstalledStatusPill.tone}>{changeInstalledStatusLabel}</Badge>
          </td>
          <td className="px-4 py-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {hp.targetItem && hp.targetItem !== '—' && (
                <button
                  onClick={() => {
                    setExpandedInstallRowId(isRowExpanded ? null : hp.id)
                    setInstallNotice(null)
                    setBorrowConfirmKey(null)
                    setNewComponentFormHpId(null)
                    setNewComponentSelection({ item: '' })
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
                >
                  <Package size={12} /> Install / Change
                </button>
              )}
              {/* SW-013A (Objective 3) — Remove Installed Component. Same
                  guard LoadoutPortTree.tsx's own Remove action uses: a real
                  installed item, never a missile-aggregate row (which
                  represents N real slots at once — removing "one" of them
                  from an aggregate has no single unambiguous target). */}
              {!hp.missileAggregate && hp.installedItem && hp.installedItem !== '—' && (
                <button
                  onClick={() => {
                    setRemoveTarget({ slotLabel: hp.slotLabel, itemLabel: hp.installedItem })
                    setReturnToHangar(false)
                    setRemoveError(null)
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-danger transition-colors"
                  title="Remove Installed Component"
                >
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
          </td>
        </>
      )
    }

    // Lens 1 — Ship Assessment (default), read-only. EWO-068 (Part D) —
    // Factory/Installed/Target are constrained to their <colgroup> width
    // (Part C); ComponentAssignmentLabel already truncates its own
    // two-line name/classification treatment, it just needed a bounded
    // column to truncate against.
    //
    // EWO-068A (Part D) — the Status pill reads the SAME canonical
    // per-hardpoint fulfillment classification the Hero's own Decision
    // Summary already computes (`reviewedSummary.hintByHardpointId`),
    // never a second, independent grade/match resolver — `hp.status`
    // alone (installed-vs-target/factory identity) is never sufficient
    // on its own to decide the Commander-facing label.
    //
    // EWO-068B (Part A/D) — renders the COMPACT tree-table label/tone
    // from the one shared `STATUS_PILL` map ("OK"/"RESERVED"/"AVAILABLE"/
    // "UPGRADE"/"BORROW?"/"MISSING"/"INVALID"), never the Hero's own
    // longer wording — "Hero explains, Tables classify."
    const operationalStatus = resolveOperationalReviewStatus(hp, reviewedSummary.hintByHardpointId.get(hp.id))
    const statusPill = STATUS_PILL[operationalStatus]
    return (
      <>
        <td className="px-4 py-1.5 text-muted/70 max-w-0">
          <ComponentAssignmentLabel value={hp.factoryItem} />
        </td>
        <td className="px-4 py-1.5 text-muted max-w-0">
          <ComponentAssignmentLabel value={hp.installedItem} />
        </td>
        <td className="px-4 py-1.5 text-cyan/90 max-w-0">
          <ComponentAssignmentLabel value={hp.targetItem} />
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap">
          <Badge tone={statusPill.tone}>{statusPill.compactLabel}</Badge>
        </td>
      </>
    )
  }

  // SW-014A — every mutation below is a thin call into the SAME shared
  // installation engine every other install/reservation surface already
  // uses (installComponent/moveToShip/addHangarItem/releaseReservation,
  // all already certified — see
  // docs/SW-014A-Inline-Installed-Component-Workflow-Report.md). This
  // function's only job is translating a store result into the inline
  // `installNotice` feedback this page's own "never a dialog" convention
  // requires.
  //
  // EWO-070 (Part A/B) — CRITICAL FIX. "Manage Loadout owns desired
  // configuration. Change Installed Components owns physical ship
  // state." This function previously retargeted the reviewed Loadout to
  // whatever component was being installed (via `saveMissionConfiguration`)
  // whenever it differed from the current Target, silently overwriting the
  // Commander's own saved plan (real repro: Target Hemera, install
  // Crossfield -> Target silently became Crossfield too). That retarget
  // is deleted outright — this function must never call
  // `saveMissionConfiguration`/mutate `targetItem` under any circumstance.
  //
  // `resolveDestinationHardpoint` (the engine's own, unmodified gate —
  // src/engine/installation/installationEngine.ts, test 5: "an already-OK
  // slot (nothing to install into) is rejected") refuses to target a port
  // whose status is already 'OK' (installed === target, nothing
  // outstanding) — a deliberate, tested engine invariant this mission
  // does not touch, since it's shared by every other installation surface
  // (Ship Detail, Loadout Manager). "Replace: Installed -> Different
  // Component" (a required certification scenario) still needs to clear
  // that gate, but does so by REMOVING the port's current occupant first
  // (an ordinary, already-certified REMOVE — the same operation the
  // explicit Remove action already performs, returning the displaced
  // unit to Hangar so it is never lost) rather than retargeting: once
  // removed, `installedItem` no longer matches the UNCHANGED target, so
  // status is no longer 'OK' and the install below proceeds normally.
  // Skipped entirely when nothing is currently installed (nothing to
  // remove) or the port isn't currently 'OK' (the ordinary Missing/
  // Upgrade-Available case, which the gate already accepts).
  //
  // `hangarItemId`, when known (every real, owned candidate this page's
  // own tiers produce carries one — see `deriveInstallCandidates`), routes
  // through `moveToShip` rather than `installComponent`. This is required
  // for correct bookkeeping, not a style choice: `installComponent`'s own
  // `planHangarDecrement` only decrements Hangar stock when a matching
  // ACTIVE reservation already exists for this exact port; its "no
  // reservation, no hangarItemId" branch is a deliberate no-inventory-
  // bookkeeping no-op (EWO-029) — correct for Quick Update's free-text
  // flow (which never references a specific owned row) but wrong here,
  // where the row is already known. `moveToShip`'s own reservation lookup
  // still takes priority automatically when one applies (its own
  // `planHangarDecrement` call checks a matching reservation before ever
  // consulting `hangarItemId`), so passing a `hangarItemId` is always safe
  // even for the "reserved for this port" case.
  function performInstall(hp: Hardpoint, item: string, entityClass?: string, hangarItemId?: string) {
    if (!ship) return
    if (hp.status === 'OK' && hp.installedItem && hp.installedItem !== '—') {
      const clearResult = removeComponentStore(ship.id, hp.slotLabel, true, reviewedBuildId)
      if (!clearResult.matched) {
        setInstallNotice({ tone: 'error', message: `Could not remove ${hp.installedItem} from ${formatHardpointLabel(hp.slotLabel)} — nothing was changed.` })
        return
      }
    }
    const result = hangarItemId
      ? (() => {
          const r = moveToShipStore(hangarItemId, ship.id, hp.slotLabel)
          return { matched: r.success, blocked: undefined as 'reserved-elsewhere' | 'incompatible' | undefined, message: r.message }
        })()
      : installComponentStore(ship.id, item, hp.slotLabel, reviewedBuildId)
    if (result.matched) {
      addLogEntry({
        action: 'Installed component',
        shipName: ship.name,
        itemName: item,
        details: `Installed ${item} on ${ship.name} (${formatHardpointLabel(hp.slotLabel)})`,
      })
      setInstallNotice({ tone: 'success', message: `Installed ${item} on ${formatHardpointLabel(hp.slotLabel)}.` })
      setBorrowConfirmKey(null)
      setNewComponentFormHpId(null)
      setNewComponentSelection({ item: '' })
    } else if (result.blocked === 'reserved-elsewhere') {
      setInstallNotice({ tone: 'error', message: `${item} has no Available stock — the remaining unit(s) are reserved for a different Fleet Asset/Build.` })
    } else if (result.blocked === 'incompatible') {
      setInstallNotice({ tone: 'error', message: `${item} is not compatible with ${formatHardpointLabel(hp.slotLabel)}.` })
    } else {
      setInstallNotice({ tone: 'error', message: ('message' in result && result.message) || `Could not install ${item} — nothing was changed.` })
    }
  }

  // The live post-mutation lookup `performBorrow`/`performRecordAndInstall`
  // both need: after a REMOVE-to-Hangar or a fresh addHangarItem, the
  // resulting row's own id (neither store action returns one directly),
  // so the follow-up install can route through `moveToShip` too rather
  // than silently falling back to the no-bookkeeping `installComponent`
  // path.
  function resolveHangarItemId(item: string, entityClass?: string): string | undefined {
    const rows = useFleetStore.getState().hangarItems
    return (
      rows.find((h) => h.qty > 0 && entityClass && h.entityClass && h.entityClass === entityClass)?.id ??
      rows.find((h) => h.qty > 0 && h.name === item)?.id
    )
  }

  // Borrow — composed from the two already-certified REMOVE/INSTALL
  // operations (never the separate, still-deferred TRANSFER/moveComponentBetweenShips
  // path — see docs/SW-014A-Inline-Installed-Component-Workflow-Report.md
  // for why): returning the donor's component to Hangar first means the
  // destination install goes through the exact same compatibility/
  // reservation checks as every other Tier, and the Commander gets a real,
  // inspectable Hangar Inventory transaction in between rather than an
  // opaque ship-to-ship move.
  function performBorrow(hp: Hardpoint, candidate: BorrowInstallCandidate) {
    if (!ship) return
    const removeResult = removeComponentStore(candidate.shipId, candidate.slotLabel, true)
    if (!removeResult.matched) {
      setInstallNotice({ tone: 'error', message: `Could not remove ${candidate.item} from ${candidate.shipName} — nothing was changed.` })
      return
    }
    const donorShipName = candidate.shipName
    const hangarItemId = resolveHangarItemId(candidate.item, candidate.entityClass)
    const before = useFleetStore.getState().hardpoints.find((h) => h.buildId === reviewedBuildId && h.slotLabel === hp.slotLabel) ?? hp
    performInstall(before, candidate.item, candidate.entityClass, hangarItemId)
    const after = useFleetStore.getState().hardpoints.find((h) => h.buildId === reviewedBuildId && h.slotLabel === hp.slotLabel)
    if (after?.installedItem === candidate.item) {
      addLogEntry({
        action: 'Borrowed component',
        shipName: ship.name,
        itemName: candidate.item,
        details: `Transferred ${candidate.item} from ${donorShipName} (${formatHardpointLabel(candidate.slotLabel)}) to ${ship.name} (${formatHardpointLabel(hp.slotLabel)})`,
      })
      setInstallNotice({ tone: 'success', message: `Transferred ${candidate.item} from ${donorShipName} to ${formatHardpointLabel(hp.slotLabel)}.` })
    } else {
      // The donor's unit is now safely sitting in Hangar Inventory (the
      // REMOVE above already committed) — never lost, just not yet
      // installed. Tier 1 (Available Inventory) will offer it on the next
      // render since it's now real Hangar stock.
      setInstallNotice({ tone: 'error', message: `${candidate.item} was returned to Hangar from ${donorShipName}, but could not be installed on ${formatHardpointLabel(hp.slotLabel)} — install it from Available Inventory instead.` })
    }
  }

  // Tier 4 — "Record, Install, Persist, in one workflow" (equivalent to
  // Quick Update's own separate Add-to-Hangar + Install steps, composed
  // here into a single Commander action). `addHangarItem` merges into any
  // existing matching row rather than creating a duplicate (its own
  // existing behavior, unchanged) — never a second inventory-accounting
  // path.
  function performRecordAndInstall(hp: Hardpoint, item: string, entityClass?: string) {
    const entry = catalogComponentsByName.get(item)
    if (!entry) {
      setInstallNotice({ tone: 'error', message: `${item} is not a recognized catalog component.` })
      return
    }
    const resolvedEntityClass = entry.entityClass ?? entityClass
    addHangarItemStore({ name: item, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: resolvedEntityClass })
    const hangarItemId = resolveHangarItemId(item, resolvedEntityClass)
    performInstall(hp, item, resolvedEntityClass, hangarItemId)
  }

  function renderInstallDisclosure(hp: Hardpoint): ReactNode {
    const candidateOptions = newTargetOptionsFor(hp)
    const candidates = ship
      ? deriveInstallCandidates(candidateOptions, {
          currentShipId: ship.id,
          currentBuildId: reviewedBuildId,
          currentSlotLabel: hp.slotLabel,
          targetItem: hp.targetItem,
          targetEntityClass: hp.targetEntityClass,
          currentlyInstalledItem: hp.installedItem,
          currentlyInstalledEntityClass: hp.installedEntityClass,
          hangarItems,
          installedLoadouts,
          reservations,
          // SW-015C (Deliverable 4) — a retired vessel is never offered
          // as a "borrow from" donor source; its installed configuration
          // is preserved but not operationally available.
          ships: activeShips,
          builds,
        })
      : { reserved: [], available: [], upgrade: [], borrowable: [] }
    const newComponentOptions = candidateOptions.filter((o) => o.item !== '—')
    const borrowShipCount = new Set(candidates.borrowable.map((c) => c.shipId)).size

    // EWO-071 (Part I) / EWO-071A (Part D) — one shared compact row:
    // identity on the left, a small context line beneath (optionally a
    // second, dimmer line — EWO-071A's own "+N additional available"
    // secondary indicator for a Reserved row that also has extra free
    // stock), the Install action aligned right. Used by
    // Reserved/Available/Upgrade alike, and by the Record Newly Acquired
    // Component card below (same padding/corners/hover so it reads as
    // another acquisition option, not unrelated helper text); only the
    // accent color and context text differ per group.
    function candidateRow(c: { item: string; entityClass?: string; label: string; hangarItemId?: string }, context: string, borderClass: string, actionClass: string, secondaryContext?: string) {
      return (
        <div key={c.item} className={`flex items-center justify-between gap-2 bg-black/20 border ${borderClass} rounded-md px-2.5 py-1.5 hover:bg-white/5 transition-colors`}>
          <div className="min-w-0">
            <div className="text-xs text-white truncate">{c.label}</div>
            <div className="text-[10px] text-muted/60 truncate">{context}</div>
            {secondaryContext && <div className="text-[10px] text-muted/40 truncate">{secondaryContext}</div>}
          </div>
          <button onClick={() => performInstall(hp, c.item, c.entityClass, c.hangarItemId)} className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium ${actionClass} hover:underline`}>
            <Package size={12} /> Install
          </button>
        </div>
      )
    }

    return (
      <tr key={`${hp.id}-install-detail`} className="bg-black/20">
        <td colSpan={lensColumnCount} className="px-5 py-3">
          {installNotice && (
            <div className={`mb-3 text-xs rounded-md px-3 py-2 border ${installNotice.tone === 'success' ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'}`}>
              {installNotice.message}
            </div>
          )}

          {/* EWO-071 (Part B/H) — the smallest useful decision tree, in
              canonical priority order: RESERVED (already committed) >
              AVAILABLE (exact Target, genuinely free) > UPGRADE (a real
              incremental improvement over what's installed, moving toward
              the Target) > BORROW (a compatible unit on another ship,
              last resort — collapsed by default). A group with no
              candidates renders nothing at all, no reserved space. */}
          <div className="space-y-3">
            {candidates.reserved.length > 0 && (
              <div>
                <div className="mb-1">
                  <Badge tone={STATUS_PILL['Reserved For This Port'].tone}>{STATUS_PILL['Reserved For This Port'].compactLabel}</Badge>
                </div>
                <div className="space-y-1">
                  {candidates.reserved.map((c) =>
                    candidateRow(
                      c,
                      'Reserved for this port',
                      'border-cyan/20',
                      'text-cyan',
                      c.additionalAvailableQuantity ? `+${c.additionalAvailableQuantity} additional available` : undefined
                    )
                  )}
                </div>
              </div>
            )}

            {candidates.available.length > 0 && (
              <div>
                <div className="mb-1">
                  <Badge tone={STATUS_PILL['Available in Inventory'].tone}>{STATUS_PILL['Available in Inventory'].compactLabel}</Badge>
                </div>
                <div className="space-y-1">{candidates.available.map((c) => candidateRow(c, `${c.quantity} Available`, 'border-success/20', 'text-success'))}</div>
              </div>
            )}

            {/* EWO-071 (Part E) — the UPGRADE pill/header renders only when
                a genuine owned incremental improvement exists. */}
            {candidates.upgrade.length > 0 && (
              <div>
                <div className="mb-1">
                  <Badge tone={STATUS_PILL['Upgrade Available'].tone}>{STATUS_PILL['Upgrade Available'].compactLabel}</Badge>
                </div>
                <div className="space-y-1">
                  {candidates.upgrade.map((c) => candidateRow(c, [c.classificationLabel, `${c.quantity} Available`].filter(Boolean).join(' · '), 'border-gold/20', 'text-gold'))}
                </div>
              </div>
            )}

            {/* EWO-071B (Part C/D/E) — "Install New Component" is promoted
                to a first-class acquisition group of its own, NEW (cyan),
                with the exact same header/color/spacing/rhythm every other
                group has — "nothing appears as an orphaned hyperlink
                anymore." Always reachable regardless of what owned/
                reserved/borrowable data exists (renaming away from
                "Record" — the Commander is installing something they just
                looted, crafted, or purchased, not filing a record of it). */}
            <div>
              <div className="mb-1">
                <Badge tone="cyan">NEW</Badge>
              </div>
              {newComponentFormHpId === hp.id ? (
                <div className="bg-black/20 border border-white/10 rounded-md px-2.5 py-2 space-y-2">
                  <TargetComponentPicker
                    id={`new-component-${hp.id}`}
                    value={newComponentSelection.item}
                    onChange={(item, entityClass) => setNewComponentSelection({ item, entityClass })}
                    options={newComponentOptions}
                    ariaLabel={`New acquired component for ${formatHardpointLabel(hp.slotLabel)}`}
                    showFullIdentity
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setNewComponentFormHpId(null)}
                      className="flex-1 border border-white/15 text-white text-xs py-1.5 rounded-md hover:border-white/35 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!newComponentSelection.item}
                      onClick={() => performRecordAndInstall(hp, newComponentSelection.item, newComponentSelection.entityClass)}
                      className="flex-1 bg-cyan text-black font-semibold text-xs py-1.5 rounded-md hover:bg-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Install
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNewComponentFormHpId(hp.id)
                    setNewComponentSelection({ item: '' })
                  }}
                  className="w-full flex items-center justify-between gap-2 bg-black/20 border border-cyan/20 rounded-md px-2.5 py-1.5 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PackagePlus size={14} className="text-cyan shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-white truncate">Install New Component</div>
                      <div className="text-[10px] text-muted/60 truncate">Looted, purchased, or crafted.</div>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-cyan">Install →</span>
                </button>
              )}
            </div>

            {/* EWO-071 (Part F) — Borrow is the last resort and renders
                last, collapsed by default; deliberately neutral — never
                green/cyan/gold emphasis — since it represents a
                potentially disruptive fleet decision, not a
                recommendation. */}
            {candidates.borrowable.length > 0 && (
              <div>
                <button
                  onClick={() => setBorrowSectionOpen((v) => !v)}
                  className="w-full flex items-center gap-2 text-xs hover:text-white transition-colors"
                >
                  <Badge tone={STATUS_PILL['Borrow Available'].tone}>{STATUS_PILL['Borrow Available'].compactLabel}</Badge>
                  <span className="text-muted/70">
                    {borrowShipCount} ship{borrowShipCount === 1 ? '' : 's'} available
                  </span>
                  <span className="ml-auto text-muted/50">{borrowSectionOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                </button>
                {borrowSectionOpen && (
                  <div className="space-y-1 mt-1.5">
                    {candidates.borrowable.map((c) => {
                      // Keyed by donor slotLabel too — the same component can
                      // legitimately be borrowable from more than one port on
                      // the same donor ship (e.g. a symmetric Left/Right pair).
                      const key = `${hp.id}:${c.item}:${c.shipId}:${c.slotLabel}`
                      const confirming = borrowConfirmKey === key
                      return (
                        <div key={key} className="bg-black/20 border border-white/10 rounded-md px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs text-white truncate">{c.label}</div>
                              <div className="text-[10px] text-muted/60">
                                Installed on {c.shipName} — {formatHardpointLabel(c.slotLabel)}
                              </div>
                            </div>
                            {!confirming && (
                              <button onClick={() => setBorrowConfirmKey(key)} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-white hover:underline">
                                <ArrowRightLeft size={12} /> Transfer?
                              </button>
                            )}
                          </div>
                          {confirming && (
                            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-muted">Transfer from {c.shipName} — this removes it there and installs it here.</span>
                              <div className="shrink-0 flex items-center gap-2">
                                <button onClick={() => setBorrowConfirmKey(null)} className="text-muted hover:text-white">
                                  Cancel
                                </button>
                                <button onClick={() => performBorrow(hp, c)} className="text-white font-medium hover:underline">
                                  Confirm Transfer
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </td>
      </tr>
    )
  }

  // SW-011A (Objective 3) — read-only inspection. Exactly the 7 fields the
  // work order specifies, nothing more: Slot Name, Default Component,
  // Current Installed Component, Eligible Component Count, Swap Group
  // Identifier, Confidence Level, Source Authority. No editing control of
  // any kind (Explicit Non-Goals: "No editing controls").
  function renderConfigurableSlotDisclosure(hp: Hardpoint, slot: ConfigurableSlotRuntimeRecord): ReactNode {
    const defaultComponentLabel = slot.defaultComponentEntityClass ? (catalogComponentsByEntityClass.get(slot.defaultComponentEntityClass)?.displayName ?? slot.defaultComponentEntityClass) : '—'
    const needsReview = slot.category === 'C-review-required'
    return (
      <tr key={`${hp.id}-configurable-slot-detail`} className="bg-black/20">
        <td colSpan={lensColumnCount} className="px-5 py-3">
          <div className="flex items-center gap-2 text-xs mb-2">
            <Badge tone="cyan">Configurable Slot</Badge>
            {needsReview && (
              <span title={developerMode ? undefined : 'Engineering has not yet fully confirmed this slot’s alternatives — shown for visibility, not guaranteed complete.'}>
                <Badge tone="warning">Needs Review</Badge>
              </span>
            )}
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-muted/60 uppercase tracking-wide text-[10px]">Slot Name</dt>
              <dd className="text-white mt-0.5">{formatHardpointLabel(hp.slotLabel)}</dd>
            </div>
            <div>
              <dt className="text-muted/60 uppercase tracking-wide text-[10px]">Default Component</dt>
              <dd className="text-white mt-0.5">{defaultComponentLabel}</dd>
            </div>
            <div>
              <dt className="text-muted/60 uppercase tracking-wide text-[10px]">Current Installed Component</dt>
              <dd className="text-white mt-0.5">{hp.installedItem && hp.installedItem !== '—' ? hp.installedItem : 'None'}</dd>
            </div>
            <div>
              <dt className="text-muted/60 uppercase tracking-wide text-[10px]">Eligible Component Count</dt>
              <dd className="text-white mt-0.5">{slot.eligibleComponentCount}</dd>
            </div>
            <div>
              <dt className="text-muted/60 uppercase tracking-wide text-[10px]">Swap Group Identifier</dt>
              <dd className="text-white mt-0.5 font-mono text-[11px]">{slot.swapGroupId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted/60 uppercase tracking-wide text-[10px]">Confidence Level</dt>
              <dd className="text-white mt-0.5">{slot.confidence === 'tag-co-membership' ? 'Tag Co-Membership' : slot.confidence === 'confirmed-bidirectional' ? 'Confirmed' : 'Unresolved'}</dd>
            </div>
            <div>
              <dt className="text-muted/60 uppercase tracking-wide text-[10px]">Source Authority</dt>
              <dd className="text-white mt-0.5">{slot.sourceAuthority === 'geometry-and-configuration' ? 'Geometry + Configuration' : 'Configuration Only'}</dd>
            </div>
          </dl>
          {/* Objective 4 — raw diagnostics are Developer-Mode-only; an
              ordinary Commander sees the "Needs Review" badge above and
              nothing more technical than that. */}
          {developerMode && slot.diagnostics.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-muted/70 space-y-1">
              <div className="text-muted/50 uppercase tracking-wide text-[10px] mb-1">Developer Mode — Raw Diagnostics</div>
              {slot.diagnostics.map((d, i) => (
                <div key={i} className={d.severity === 'warning' ? 'text-warning/80' : ''}>
                  {d.message}
                </div>
              ))}
            </div>
          )}
        </td>
      </tr>
    )
  }

  function renderLensRows(nodes: PortTreeNode<DisplayHardpoint>[], depth: number): ReactNode[] {
    return nodes.flatMap((node) => {
      const hp = node.hardpoint
      // Phase 3 — critical diagnostics originally stayed visible in every
      // lens, since Lens 2/3 had no Status column of their own. EWO-069
      // (Part E) retired this inline badge for Manage Loadout once it
      // gained a live Status column (the exact redundant restatement Part
      // E named by example — "Left Cooler / UPGRADE AVAILABLE" when the
      // row already shows Status). EWO-070 (Part E/F) — Change Installed
      // Components now has the identical canonical Status column, so the
      // same reasoning retires this badge there too; no lens still shows
      // it (kept as a named constant, not deleted, in case a future lens
      // genuinely lacks its own Status column again).
      const showInlineDiagnostic = false
      const CategoryIcon = componentCategoryIcon(hp)
      const dormantTopologyNotice = hp.isStructural ? undefined : dormantTopologyNoticeFor(hp)
      const rows: ReactNode[] = [
        <tr key={hp.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
          <td className={`px-4 py-1.5 ${hp.isStructural ? 'text-white/70 font-semibold uppercase tracking-wide text-xs' : 'text-white font-medium'}`}>
            {/* EWO-068 (Part D/E) — Port permits wrapping rather than
                truncation (a Commander needs the full port name), so
                indentation is capped at 4 levels rather than growing
                without bound: hierarchy beyond that depth still reads via
                the same icon/connector language, but never keeps eating
                into the column's own fixed width (Part C's <colgroup>). */}
            <div style={{ paddingLeft: Math.min(depth, 4) * 16 }} className="flex flex-wrap items-center gap-1.5">
              <CategoryIcon size={13} className="text-muted/50 shrink-0" aria-hidden="true" />
              <span className="break-words">{formatHardpointLabel(hp.slotLabel)}</span>
              {dormantTopologyNotice && (
                <span title={dormantTopologyNotice}>
                  <Badge tone="cyan">Additional Topology Pending</Badge>
                </span>
              )}
              {/* EWO-068 (Part B) — the Configurable Slot badge is
                  workflow-facing implementation metadata (swap-group
                  identifier, confidence level, source authority): it
                  doesn't help a Commander read Factory/Installed/Target/
                  Status, so it's retired from the read-only Operational
                  Review lens (commanderIntent === null). EWO-069A (Part
                  D) then retired it from Manage Loadout too, once that
                  lens gained its own live Status column. EWO-070 (Part D)
                  — explicit, direct reversal of EWO-069A's own decision
                  to keep it in Change Installed Components: "Do not
                  render CONFIGURABLE or other capability metadata," full
                  stop, no lens carve-out. Never rendered in any lens now.
                  The underlying `configurableSlot` lookup (`configurableSlotFor`)
                  itself is untouched and still available to selector
                  logic — only every trigger's visibility is retired. */}
              {hp.missileAggregate && <Badge tone="cyan">×{hp.missileAggregate.quantity}</Badge>}
              {hp.missileAggregate?.inconsistent && (
                <span title={hp.invalidMessage}>
                  <Badge tone="invalid">Inconsistent — Select Missile</Badge>
                </span>
              )}
              {hp.missileAggregate?.countMismatch && (
                <span title={`Canonical capacity is ${hp.missileAggregate.quantity}, but ${hp.missileAggregate.childSlotLabels.length} slot(s) are materialized — reported, not auto-resolved.`}>
                  <Badge tone="warning">Count Mismatch</Badge>
                </span>
              )}
              {showInlineDiagnostic && (
                <span title={hp.invalidMessage ?? hp.status}>
                  <Badge tone={statusTone(hp.status)}>{hp.status}</Badge>
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-1.5 text-muted truncate" title={`${hp.size} ${hp.type}`}>
            {hp.size} {hp.type}
          </td>
          {renderLensCells(hp)}
        </tr>,
      ]
      if (commanderIntent === 'CHANGE_INSTALLED' && expandedInstallRowId === hp.id) rows.push(renderInstallDisclosure(hp))
      // EWO-070 (Part D) — the Configurable Slot disclosure's own trigger
      // badge is retired in every lens now (no lens carve-out remains —
      // see the badge's own comment above), so `isInspectingConfigurableSlot`
      // can never become true and this disclosure is unreachable. Left
      // deliberately unrendered rather than deleted outright — the
      // underlying inspection panel itself is untouched infrastructure a
      // future mission could re-surface elsewhere.
      rows.push(...renderLensRows(node.children, depth + 1))
      return rows
    })
  }

  const selectShip = (
    <div className="flex items-center gap-2 flex-wrap">
      <label htmlFor="workspace-ship-select" className="text-[11px] uppercase tracking-widest text-muted flex items-center gap-1.5 whitespace-nowrap">
        <ShipWheel size={13} /> Ship
      </label>
      <select
        id="workspace-ship-select"
        value={shipId ?? ''}
        onChange={(e) => (e.target.value ? navigate(`/ship-workspace/${e.target.value}`) : navigate('/ship-workspace'))}
        className="min-w-[220px] border-2 border-cyan/40 focus:border-cyan"
      >
        <option value="">Select a ship…</option>
        {sortedShips.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.lifecycleStatus === 'retired' ? ' (Retired)' : ''}
          </option>
        ))}
      </select>
    </div>
  )

  const changeStatusBadge = <Badge tone={pendingChangeCount > 0 ? 'warning' : 'success'}>{changeStatusLabel}</Badge>
  const lensTitle =
    commanderIntent === 'MANAGE_LOADOUT' ? 'Manage Loadout' : commanderIntent === 'CHANGE_INSTALLED' ? 'Change Installed Components' : 'Ship Assessment'
  const lensDescription =
    commanderIntent === 'MANAGE_LOADOUT'
      ? 'Modify the desired configuration for this Loadout — target changes only, nothing physically installed yet.'
      : commanderIntent === 'CHANGE_INSTALLED'
        ? 'Modify the physical ship — one unified Install / Change action per port, sourced from inventory, reservations, or another ship.'
        : 'Organized the way a Commander thinks about a ship, not by raw port hierarchy.'

  return (
    <div className="space-y-4">
      {/* PAGE IDENTITY — deliberately lightweight: label, title, and Ship
          Selection (a workspace-level action, not ship-state). No
          ship-state of any kind lives here. SW-013B (Objective 1/5) — the
          "Prototype" badge is removed: this is now the canonical, primary
          ship-management surface (Ship Workspace Promotion), not an
          experimental page — the label was no longer accurate.
          EWO-061 — Operational Header Standardization (§30): the small
          section label (matching the Sidebar/EWO-060's "Ship Management")
          sits above one large operational title, the same pattern every
          other page uses; the prior functional-description paragraph is
          dropped — the Readiness bar, Decision Summary, and "What do you
          want to change?" actions immediately below already communicate
          the page's purpose. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Ship Management</p>
          <h1 className="text-2xl font-display font-bold text-white">What does this ship need?</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* SW-011A (Objective 4) — Developer Mode: local, unpersisted
              toggle gating raw Configurable Slot diagnostic detail.
              EWO-062A (Part C) — must not render at all in the ordinary
              Commander experience, including a packaged Beta launched via
              "Start Strategic Fleet Manager.bat" (which runs `npm run
              dev`, so `import.meta.env.DEV` alone would still be true for
              a real Commander — see DEV_SEED_FLEET_ENABLED's own doc
              comment in useFleetStore.ts). Gated on that exact same
              established local-developer flag instead: a real Commander
              session never mounts this button at all, not merely a
              disabled/dimmed one. */}
          {DEV_SEED_FLEET_ENABLED && (
            <button
              onClick={() => setDeveloperMode((v) => !v)}
              title="Developer Mode — show raw Configurable Slot diagnostics"
              className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest border rounded-lg px-2.5 py-1.5 transition-colors ${
                developerMode ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-white/10 text-muted hover:border-white/25 hover:text-white'
              }`}
            >
              <Code2 size={12} /> Developer Mode
            </button>
          )}
          {/* EWO-062A (Part C) — "View in Ship Detail" is retired from
              Ship Management's header: the legacy Ship Detail page (and
              its route) remains internally intact for direct/deep-link
              access, but Ship Management no longer advertises or routes
              a Commander back into it (SW-013B's original "Preserve
              Legacy Access" rationale is superseded by this mission). */}
          {selectShip}
        </div>
      </div>

      {/* STICKY CONTEXT — a compact/collapsed echo of the banner, hidden
          while the full banner is in view; appears, pinned, only once the
          Commander scrolls past it. Never a second header. */}
      {ship && showStickyContext && (
        <div
          data-testid="sticky-context-bar"
          className="sticky top-0 z-30 -mx-6 md:-mx-10 px-6 md:px-10 py-2.5 bg-bg/95 backdrop-blur-sm border-b border-cyan/20 shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="uppercase tracking-widest text-muted/70">Ship</span>
              <span className="font-display font-bold text-white">{ship.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="uppercase tracking-widest text-muted/70">Loadout</span>
              <span className="font-display font-bold text-white">{reviewedBuild?.name ?? '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="uppercase tracking-widest text-muted/70">Intent</span>
              <span className="font-display font-bold text-white">{commanderIntent ? COMMANDER_INTENT_LABEL[commanderIntent] : 'Operational Review'}</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="uppercase tracking-widest text-muted/70">Change Status</span>
              {changeStatusBadge}
            </div>
          </div>
        </div>
      )}

      {/* SHIP OPERATIONAL BANNER — the true operational header. Answers
          "Is this ship mission ready?" from the ship's real Active
          Loadout alone, and stays the Commander's anchor while the
          Ship Systems Workspace below adapts to intent.
          EWO-062/EWO-062A — the empty state (no ship selected) is the
          permanent Quartermaster Bay illustration, not a generic callout:
          full-bleed background art sized via SHIP_MANAGEMENT_HERO_HEIGHT_
          CLASS to match the selected-ship header's own rendered footprint
          (1320x343 at the reference desktop viewport), so selecting a
          ship causes no layout shift — the hero-sized region already
          occupies exactly this space before and after.
          EWO-095A — the label/title pair now renders inside the same
          glyph/card treatment every other empty state uses (Mission
          Control/Fleet Dashboard/Hangar Inventory's "No Vessels
          Assigned"/"No Inventory Recorded" cards), still vertically
          centered across the full hero. The old full-plate `bg-black/50`
          wash is gone — legibility now comes from the card's own
          semi-opaque graphite background + backdrop-blur, exactly like
          those other empty states, so the Quartermaster Bay artwork
          itself renders crisp and unobscured behind it. */}
      <div data-testid="ship-operational-banner" className="panel overflow-hidden relative">
        <div ref={bannerSentinelRef} />

        {!ship ? (
          <div className={`relative overflow-hidden ${SHIP_MANAGEMENT_HERO_HEIGHT_CLASS}`}>
            {quartermasterBayEmptySrc ? (
              <img src={quartermasterBayEmptySrc} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
            ) : (
              <div className="absolute inset-0 bg-black/20" />
            )}
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="panel lg:bg-panel/55 lg:backdrop-blur-md p-8 flex flex-col items-center text-center gap-2 max-w-md">
                <WrenchIcon size={24} className="text-muted/60 mb-1" />
                <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Maintenance Bay Ready</p>
                <h2 className="text-2xl font-display font-bold text-white">Select a ship above to begin management.</h2>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="absolute top-3 right-3 z-10">{changeStatusBadge}</div>

            {/* EWO-063 — `key={ship.id}` forces React to fully unmount and
                remount ShipHeroFrame (and its child ShipImage) whenever the
                selected ship changes, rather than reusing the same
                component instance across ships. All of this page's own
                readiness/missing/decision-summary values below are already
                computed fresh every render (never useMemo'd against a
                stale dependency), so this key is a defense-in-depth
                guarantee for the Hero's own internal image-presentation
                state (ShipHeroFrame's `mode`, ShipImage's load/fallback
                state) specifically — the one piece of Hero state that
                lives inside a child component rather than being derived
                fresh on every ShipWorkspacePrototype render. */}
            <ShipHeroFrame
              key={ship.id}
              imageSrc={imageSrc}
              name={ship.name}
              manufacturer={ship.manufacturer}
              ownership={ship.ownership}
              activeBuildLabel={activeBuild?.name ?? '—'}
              subtitle={identitySubtitle}
              onOpenSettings={() => setEditOpen(true)}
              // EWO-065A (Part C) — supporting text is exactly "Ship Name
              // — Reviewed Loadout Name," nothing else: readiness is
              // already conveyed by the 100% bar, the green glyph, and
              // zero Immediate Decisions, so "Mission Ready" here would
              // be redundant. Never ownership/manufacturer/role — those
              // already live on the identity subtitle line above.
              quartermasterSeal={
                reviewedSummary.isFullyCompletedCustomLoadout
                  ? { headline: 'QUARTERMASTER CERTIFIED', detail: `${ship.name} — ${reviewedBuild?.name ?? 'Custom Loadout'}` }
                  : null
              }
            />
            {/* EWO-064 — "Sticky Header owns context, Hero owns action."
                Every value in this block now reads `reviewedSummary`
                (Part F): the Sticky Context Bar above is already the
                single source of truth for WHICH Loadout is under review
                ("Ship / Reviewed Loadout / Intent / Pending Changes"),
                so the Hero shows operational state for that SAME
                Loadout — Readiness, Missing Components, the Priority
                Components strip, and Decision Summary — rather than
                silently reflecting the ship's Active Loadout underneath
                a header that says something else. No architectural
                change (Part H): `reviewedSummary` already existed
                (EWO-063) and is literally the same object as
                `activeSummary` whenever Reviewed and Active are the same
                Loadout — only which one feeds the Hero has changed. */}
            <div className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <ReadinessBar value={reviewedSummary.progress.percentage} />
                  {/* EWO-065 (Part C) — the exact-name summary is
                      retained (precise detail a Commander can act on
                      immediately), but now caps at
                      MISSING_SUMMARY_VISIBLE_LIMIT names and appends a
                      plain inline text link — never a tile, badge, or
                      icon — only when real names are hidden beyond it.
                      Ordinary <button> (not an anchor) since it scrolls
                      within the page rather than navigating; already
                      keyboard-focusable/activatable by default. */}
                  {reviewedSummary.missingSummary.length > 0 && (
                    <p data-testid="readiness-missing-summary" className="flex items-start gap-1.5 text-xs text-warning mt-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-2">
                        Missing: {reviewedSummary.missingSummary.slice(0, MISSING_SUMMARY_VISIBLE_LIMIT).join(', ')}
                        {reviewedSummary.missingSummary.length > MISSING_SUMMARY_VISIBLE_LIMIT && (
                          <>
                            …{' '}
                            <button type="button" onClick={scrollToSystemsWorkspace} className="text-cyan hover:underline font-medium">
                              View All
                            </button>
                          </>
                        )}
                      </span>
                    </p>
                  )}

                  {/* EWO-065 (Part B) — retires the per-component Priority
                      strip in favor of compact category-level demand
                      cards, modeled on Mission Control's Quartermaster
                      Report visual language: the SAME canonical taxonomy/
                      icon/order (`buildCategoryDemand` inside
                      shipManagementSummary.ts, reusing
                      componentCategoryIcon.ts's resolver verbatim — Part D
                      — never a second classification table), glyph +
                      outstanding count + category label, nothing more.
                      These are informational only (Part H) — never a
                      click target, never a duplicate of the Decision
                      Summary's own per-item action list. Demand-driven
                      visibility (Part B): a category with zero outstanding
                      targets renders no card at all, so this region
                      collapses to nothing (no reserved empty height) once
                      every category clears.

                      EWO-065A (Part A) — sized and colored to visibly
                      belong to the same card family as Mission Control's
                      own Quartermaster Report `ActionCard`s: the `panel`
                      surface + `border-l-[3px]` cyan accent edge, a
                      tinted icon housing, and count-first typography —
                      proportionally smaller (not a literal `ActionCard`
                      reuse, since these are always non-interactive/
                      hover-free here, unlike Mission Control's clickable
                      filter cards) but unmistakably the same family. Cyan
                      only, deliberately — a category's color never
                      encodes which category it is, only that it's an
                      operational demand card (unlike Mission Control's
                      own complete/incomplete accent switch, which this
                      surface has no equivalent state for). */}
                  {reviewedSummary.categoryDemand.length > 0 && (
                    <div data-testid="category-demand-cards" className="grid grid-cols-4 gap-2 mt-3">
                      {reviewedSummary.categoryDemand.map((cat) => {
                        const CategoryIcon = cat.icon
                        return (
                          <div key={cat.key} className="panel border-l-[3px] border-l-cyan p-2.5 flex items-center gap-2.5 min-w-0" title={`${cat.count} outstanding — ${cat.label}`}>
                            <div className="w-7 h-7 rounded-lg bg-cyan/10 flex items-center justify-center shrink-0">
                              <CategoryIcon size={15} className="text-cyan" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-lg font-display font-bold leading-none text-cyan">{cat.count}</div>
                              <div className="text-[10px] uppercase tracking-widest text-muted mt-0.5 truncate">{cat.label}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {/* EWO-065B — Decision Summary now lists only
                    `actionableDecisions`: Invalid Target rows (always
                    immediately actionable — pick a different compatible
                    target) plus Missing/Upgrade Available rows whose
                    acquisition hint is NOT Purchase Required. Restores
                    the distinction EWO-064 (Part C) had collapsed —
                    "Missing tells the Commander what the build lacks;
                    Immediate Decisions tells them what they can do about
                    it right now." A catalog-only gap (nothing reserved,
                    available, upgradeable, or borrowable) never
                    generates a "Record {item}" line here — Record Newly
                    Acquired Component remains available as an explicit
                    workflow entry point inside Change Installed
                    Components' own disclosure, just never an automatic
                    standing recommendation. "No Immediate Decisions" is
                    correct whenever nothing is genuinely actionable, even
                    while real Purchase-Required demand remains (visible
                    instead via Missing text and the category cards,
                    which still read the FULL `decisionHardpoints` set).

                    EWO-065A (Part B) — a non-zero Decision Summary is a
                    Quartermaster operational recommendation (go install/
                    reassign/borrow something), not a warning about an
                    unsafe condition — it reads in Quartermaster Gold
                    (`gold`), never `warning` (Caution Yellow), per the
                    semantic split documented in §37. The genuinely-empty
                    "No Immediate Decisions" state is unchanged — still
                    the calm green `CheckCircle2` treatment. */}
                <div data-testid="decision-summary" className={`rounded-lg p-3.5 border ${reviewedSummary.actionableCount > 0 ? 'bg-gold/10 border-gold/30' : 'bg-black/20 border-white/5'}`}>
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Decision Summary</div>
                  <div className="flex items-center gap-2">
                    {reviewedSummary.actionableCount > 0 ? (
                      <AlertTriangle size={16} className="shrink-0 text-gold" />
                    ) : (
                      <CheckCircle2 size={16} className="shrink-0 text-success" />
                    )}
                    <span className={`text-sm font-display font-bold leading-none ${reviewedSummary.actionableCount > 0 ? 'text-gold' : 'text-white'}`}>
                      {reviewedSummary.actionableCount === 0
                        ? 'No Immediate Decisions'
                        : `${reviewedSummary.actionableCount} Immediate Decision${reviewedSummary.actionableCount === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  {reviewedSummary.actionableCount > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {reviewedSummary.actionableDecisions.slice(0, 4).map((hp) => {
                        if (hp.status === 'Invalid Target') {
                          return (
                            <div key={hp.id} className="flex items-center justify-between gap-2 text-xs" title={hp.invalidMessage}>
                              <span className="text-white truncate">Resolve {hp.targetItem}</span>
                              <Badge tone="invalid">Incompatible Target</Badge>
                            </div>
                          )
                        }
                        const hint = reviewedSummary.hintByHardpointId.get(hp.id)!
                        return (
                          <div key={hp.id} className="flex items-center justify-between gap-2 text-xs" title={hint.detail}>
                            <span className="text-white truncate">
                              {decisionActionVerb(hint)} {hp.targetItem}
                            </span>
                            <Badge tone={hint.tone}>{hint.label}</Badge>
                          </div>
                        )
                      })}
                      {reviewedSummary.actionableDecisions.length > 4 && <div className="text-[11px] text-muted/70">+{reviewedSummary.actionableDecisions.length - 4} more</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {ship && (
        <>
          {/* LOADOUT WORKFLOW — above Commander Intent. Default reviewed
              Loadout is the ship's real Active Loadout; the Commander
              must intentionally pick a different one. ACTIVE and Reviewed
              are never conflated.

              EWO-066 (Part A) — the Safety Capsule splits into two
              coordinated zones sharing one panel: Loadout (~2/3 width)
              and Fleet Priority (~1/3 width, right of a vertical
              divider — renamed from "Ship Priority" in EWO-066A Part B).
              Loadout keeps every behavior it already had — nothing here
              changes except where it sits. */}
          <div className="panel p-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <h3 className="text-xs uppercase tracking-widest text-muted mb-3">Loadout</h3>
                <div className="flex flex-wrap gap-2 items-center">
              {shipBuilds.map((build) => {
                const isReviewed = reviewedBuild?.id === build.id
                // SW-002 Revision B (Part 3) — "Set Active" visually
                // belongs to the reviewed loadout's own pill (reusing the
                // established pill language) instead of a detached action
                // floating in the section header. SW-008D (Objective 6):
                // now a real activation — Reviewed and Active stay
                // distinct concepts (selecting a loadout, i.e. clicking
                // the pill itself, still never activates it), but "Set
                // Active" itself genuinely changes the ship's real Active
                // Loadout.
                // EWO-066A (Part A) — compare against `ship.activeBuildId`
                // directly (the one authoritative field — see `activeBuild`'s
                // own doc comment above), never the per-build `isActive`
                // mirror: "One ship. One active Loadout. One ACTIVE badge,"
                // guaranteed by construction rather than by every build's
                // own flag happening to stay in sync.
                const isActiveBuild = build.id === ship?.activeBuildId
                const showSetActive = isReviewed && !isActiveBuild
                const accent = isReviewed ? colorFor(reviewedSummary.progress.percentage) : undefined
                return (
                  <div key={build.id} className="inline-flex items-center">
                    <button
                      onClick={() => requestReviewedBuildSwitch(build.id)}
                      style={isReviewed ? { borderColor: accent, color: accent, backgroundColor: `${accent}1A` } : undefined}
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium transition-colors ${showSetActive ? 'rounded-l-full' : 'rounded-full'} ${
                        isReviewed ? `border-2 ${showSetActive ? 'border-r-0' : ''}` : 'border border-white/15 text-white/80 hover:text-white hover:border-white/35 hover:bg-white/5'
                      }`}
                    >
                      {/* EWO-066 (Part B) — the capsule itself already
                          communicates this is the factory configuration;
                          a build named literally "Factory Loadout" plus a
                          second redundant "Factory" badge read as "Factory
                          Loadout • Factory." One simplified label instead —
                          "Factory," plainly, with only the real ACTIVE
                          badge (never a second Factory badge) when it
                          applies. Every other build keeps its own real name. */}
                      {build.kind === 'FACTORY' ? 'Factory' : build.name}
                      {isActiveBuild && <Badge tone="success">Active</Badge>}
                      {/* SW-013C.1 (Objective 5) — UI Truthfulness: the reviewed
                          pill itself carries the draft-state fact, not just the
                          Save/Discard buttons below the table, so it's visible
                          before the Commander ever reaches for another pill. */}
                      {isReviewed && pendingChangeCount > 0 && <Badge tone="warning">Unsaved</Badge>}
                    </button>
                    {showSetActive && (
                      <button
                        onClick={() => {
                          setActiveBuildStore(ship.id, build.id)
                          setSetActiveNotice(`"${build.name}" is now the Active Loadout.`)
                        }}
                        title="Set this Loadout as the ship's real Active Loadout"
                        style={{ borderColor: accent, color: accent }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-r-full border-2 text-xs font-medium hover:bg-white/5 transition-colors"
                      >
                        Set Active
                      </button>
                    )}
                  </div>
                )
              })}
              {!newLoadoutFormOpen && (
                <button
                  type="button"
                  onClick={() => setNewLoadoutFormOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border border-dashed border-cyan/30 text-cyan/70 hover:text-cyan hover:border-cyan/50 hover:bg-cyan/5 transition-colors"
                >
                  <Plus size={12} /> New Loadout
                </button>
              )}
            </div>
            {setActiveNotice && <p className="text-[11px] text-muted/70 mt-2">{setActiveNotice}</p>}

            {/* SW-013C.1 (Objective 5) — UI Truthfulness. A persistent,
                unmissable status line for draft state — distinct from the
                Save/Discard buttons themselves, which only appear inside
                the Manage Loadout lens below and are easy to not notice as
                meaningfully different from ordinary page chrome. */}
            {pendingChangeCount > 0 && !pendingSwitchBuildId && (
              <p className="text-[11px] text-warning mt-2">
                Unsaved changes — {pendingChangeCount} target{pendingChangeCount === 1 ? '' : 's'} pending on &ldquo;{reviewedBuild?.name}&rdquo;. Save or Discard before switching Loadouts.
              </p>
            )}

            {/* SW-013C.1 (Objective 5) — the guarded switch's inline
                confirm. Never a modal (this page's own convention) — a
                Commander must explicitly choose Discard & Switch or
                Cancel; the pill click that triggered this never silently
                switches on its own. */}
            {pendingSwitchBuildId && (
              <div className="mt-2 p-3 rounded-lg border border-warning/30 bg-warning/5 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11px] text-warning">
                  &ldquo;{reviewedBuild?.name}&rdquo; has {pendingChangeCount} unsaved target{pendingChangeCount === 1 ? '' : 's'}. Switching Loadouts now discards{' '}
                  {pendingChangeCount === 1 ? 'it' : 'them'} — this cannot be undone.
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={confirmDiscardAndSwitch}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-warning/15 text-warning border border-warning/40 hover:bg-warning/25 transition-colors"
                  >
                    Discard &amp; Switch
                  </button>
                  <button
                    type="button"
                    onClick={cancelPendingSwitch}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-muted hover:text-white hover:border-white/25 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* SW-008D (Objective 3) — inline creation form, never a
                dialog. Nothing persists until "Create Loadout" is clicked;
                Cancel discards this local form state only. */}
            {newLoadoutFormOpen && (
              <div className="mt-3 p-3 rounded-lg border border-cyan/20 bg-cyan/5 space-y-3">
                <div>
                  <label htmlFor="new-loadout-name" className="block text-[11px] uppercase tracking-widest text-muted mb-1">
                    Loadout Name
                  </label>
                  <input
                    id="new-loadout-name"
                    value={newLoadoutName}
                    onChange={(e) => setNewLoadoutName(e.target.value)}
                    className="w-full max-w-sm text-sm"
                    placeholder="e.g. Skirmish Build"
                  />
                </div>
                <div>
                  <span className="block text-[11px] uppercase tracking-widest text-muted mb-1">Initialize From</span>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: 'FACTORY' as const, label: 'Factory Loadout' },
                        { key: 'ACTIVE' as const, label: 'Active Loadout' },
                        { key: 'EXISTING' as const, label: 'Existing Loadout' },
                        { key: 'EMPTY' as const, label: 'Empty' },
                      ] as const
                    ).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setNewLoadoutSource(key)}
                        aria-pressed={newLoadoutSource === key}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          newLoadoutSource === key ? 'border-cyan/50 text-cyan bg-cyan/10' : 'border-white/15 text-white/80 hover:text-white hover:border-white/35'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {newLoadoutSource === 'EXISTING' && (
                    <select
                      aria-label="Existing Loadout to initialize from"
                      value={newLoadoutExistingId}
                      onChange={(e) => setNewLoadoutExistingId(e.target.value)}
                      className="mt-2 text-sm"
                    >
                      <option value="">Select a Loadout…</option>
                      {shipBuilds.map((build) => (
                        <option key={build.id} value={build.id}>
                          {build.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {newLoadoutError && <p className="text-[11px] text-danger">{newLoadoutError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={handleCreateLoadout} className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-cyan/15 text-cyan border border-cyan/40 hover:bg-cyan/25 transition-colors">
                    Create Loadout
                  </button>
                  <button type="button" onClick={resetNewLoadoutForm} className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-muted hover:text-white hover:border-white/25 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
              </div>

              {/* EWO-066A (Part B/C) — Fleet Priority (renamed from "Ship
                  Priority": this edits the ship's POSITION WITHIN the
                  fleet, not an intrinsic property of the ship itself).
                  The dropdown shows the fleet's real current order
                  ("1 • Corsair," "2 • Ghost Mk II," …) rather than
                  anonymous numbers — "Priority 1" alone never answers
                  "relative to what?" (see fleetPriority.ts's own
                  `buildFleetPriorityOptions` doc comment). Selecting an
                  occupied position reorders the fleet immediately, no
                  confirmation — the Commander picked a specific existing
                  ship's slot, so the outcome is never a surprise (Part D).
                  Priority is fleet metadata only — selecting a value here
                  never touches readiness, inventory, reservations, or
                  component logic. */}
              <div className="md:border-l md:border-white/10 md:pl-4">
                <h3 className="text-xs uppercase tracking-widest text-muted mb-3">Fleet Priority</h3>
                <select
                  aria-label="Fleet Priority"
                  value={ship.priority === null ? 'UNPRIORITIZED' : String(ship.priority)}
                  onChange={(e) => {
                    const value = e.target.value
                    setFleetPriorityStore(ship.id, value === 'UNPRIORITIZED' ? null : Number(value))
                  }}
                  disabled={!isActiveShip(ship)}
                  className="w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {buildFleetPriorityOptions(activeShips, ship.id).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {/* SW-015C (Deliverable 4) — a retired vessel is excluded
                    from active Priority Actions/ranking entirely; its
                    last value is preserved on the record (never nulled by
                    retirement) but not editable here until recommissioned. */}
                {!isActiveShip(ship) && <p className="text-[11px] text-muted mt-1.5">Retired vessels don't participate in active Fleet Priority.</p>}
              </div>
            </div>
          </div>

          {/* COMMANDER INTENT — exactly two cards (SW-002 terminology).
              Operational Review is the page's own default state, not a
              selectable option. Borrow Intelligence has no top-level
              presence — it surfaces contextually inside Change Installed
              Components' Install/Change disclosure only.

              EWO-067 — "Operational Workstations," not buttons: the
              Design Principle this mission asks Engineering to carry
              forward is that every future Ship Management workflow
              should begin by entering one of these two, so their visual
              treatment reinforces that mental model (a dedicated console
              a Commander steps into) rather than merely inviting a
              click.

              EWO-067A — supersedes EWO-067's own background artwork
              (blueprint grid, diagonal hatch, large watermark glyphs):
              "Premium through typography, spacing, lighting, and
              materials — not decorative graphics." A darker internal
              surface, a thin top accent line, and the restrained
              existing `shadow-glow` hover language now carry the
              premium feel copy and spacing used to share with busy
              artwork — quieter, so the Ship Header stays the page's one
              cinematic moment (Part G/H: these are timeless placeholders
              until the future Quartermaster Edition's own cinematic
              workstation artwork arrives, not a competing visual system).
              Visual enhancement only (Part H, both missions) — the
              underlying element is still exactly the same real <button>,
              onClick/aria-pressed/keyboard behavior byte-for-byte
              unchanged; only what's layered on top of it changed. */}
          <div className="panel p-4">
            <h3 className="text-xs uppercase tracking-widest text-muted mb-3">What do you want to change?</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {(
                [
                  { key: 'MANAGE_LOADOUT' as const, icon: ListChecks },
                  { key: 'CHANGE_INSTALLED' as const, icon: WrenchIcon },
                ] as const
              ).map(({ key, icon: Icon }) => {
                const isSelected = commanderIntent === key
                return (
                  <button
                    key={key}
                    onClick={() => setCommanderIntent(isSelected ? null : key)}
                    aria-pressed={isSelected}
                    className={`group relative overflow-hidden text-left rounded-lg border px-4 py-3.5 bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-200 ${
                      isSelected ? 'border-cyan/40 shadow-glow' : 'border-white/10 hover:-translate-y-0.5 hover:border-cyan/30 hover:shadow-glow'
                    }`}
                  >
                    {/* Part D — the one restrained accent: a thin
                        holographic line along the top edge, brightening
                        on hover/selection — replaces EWO-067's own
                        radial "internal lighting" wash and large
                        watermark glyph with a single quiet detail. */}
                    <div
                      className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan/60 via-cyan/20 to-transparent transition-opacity duration-200 ${
                        isSelected ? 'opacity-100' : 'opacity-40 group-hover:opacity-90'
                      }`}
                    />
                    {/* Part E — the workstation identifier, small/letter-
                        spaced/low-emphasis, consistent with this page's
                        own section-label language (the h3 above it).
                        Explicitly retained unchanged from EWO-067. */}
                    <span className="absolute top-3 right-3.5 text-[9px] uppercase tracking-[0.15em] text-muted/50 font-mono">
                      {COMMANDER_INTENT_WORKSTATION_LABEL[key]}
                    </span>

                    {/* Part C — typography-first hierarchy: large title,
                        one concise operational statement, smaller
                        supporting description. No background artwork —
                        the copy itself is now the primary visual feature. */}
                    <div
                      className={`flex items-center gap-2 font-display font-bold text-base transition-colors duration-200 ${
                        isSelected ? 'text-cyan' : 'text-white group-hover:text-cyan/90'
                      }`}
                    >
                      <Icon size={18} aria-hidden="true" /> {COMMANDER_INTENT_LABEL[key]}
                    </div>
                    <p className="text-xs text-white/80 font-medium mt-1.5">{COMMANDER_INTENT_STATEMENT[key]}</p>
                    <p className="text-[11px] text-muted mt-1">{COMMANDER_INTENT_DESCRIPTION[key]}</p>
                  </button>
                )
              })}
            </div>
            {/* SW-002 Revision C (Part 4) — collapsed to a single inline
                guidance sentence (was a 3-line block in Revision B).
                Same helper sizing/typography (text-[11px]); only the
                "Operational Review" lead-in gets the reserved
                Quartermaster-gold accent (tailwind.config.js's `gold`
                token — "restricted command/advisory authority only"). One
                line, no added vertical whitespace beyond the section gap. */}
            {commanderIntent === null && (
              <p className="mt-3 text-[11px] text-muted/70">
                <span className="text-gold font-display font-bold uppercase tracking-widest">Operational Review</span> — Reviewing current ship status. Select an
                action above when you&rsquo;re ready to make changes.
              </p>
            )}
          </div>

          {/* ADAPTIVE SHIP SYSTEMS WORKSPACE (SW-002) — one continuous
              conversation with the same ship: the same Commander taxonomy
              and the same expand/collapse state survive an intent switch;
              only the lens (columns + Actions) adapts. Presentation-only
              regrouping of the reviewed Loadout's real, canonically-
              prepared port tree — never the raw Star Citizen category
              hierarchy. */}
          <div ref={systemsPanelRef} className="panel overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-display font-semibold text-white">{lensTitle}</h3>
                <p className="text-xs text-muted mt-1">{lensDescription}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* SW-008D (Objectives 1/2) — Save/Discard only apply to
                    Manage Loadout's own pending New Target edits; shown
                    only when there's something to act on. */}
                {commanderIntent === 'MANAGE_LOADOUT' && pendingChangeCount > 0 && (
                  <>
                    <button
                      onClick={handleSaveChanges}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan bg-cyan/10 hover:bg-cyan/20 border border-cyan/40 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={handleDiscardChanges}
                      className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Discard Changes
                    </button>
                  </>
                )}
                {reviewedHardpoints.length > 0 && (
                  <>
                    <button onClick={expandAllGroups} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-3 py-1.5 transition-colors">
                      <Maximize2 size={12} /> Expand All
                    </button>
                    <button onClick={collapseAllGroups} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-3 py-1.5 transition-colors">
                      <Minimize2 size={12} /> Collapse All
                    </button>
                  </>
                )}
              </div>
            </div>
            {saveNotice && commanderIntent === 'MANAGE_LOADOUT' && (
              <p className={`px-5 pt-3 text-xs ${saveNotice.tone === 'success' ? 'text-success' : 'text-danger'}`}>{saveNotice.message}</p>
            )}
            {reviewedHardpoints.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted">No port data configured for this Loadout yet.</div>
            ) : (
              <div className="overflow-x-auto">
                {/* EWO-068 (Part C) — the read-only Operational Review lens
                    (commanderIntent === null, 6 columns) gets a fixed table
                    layout with an explicit <colgroup>, so its own width is
                    never dictated by content. EWO-068A (Part F) widened
                    Status from 13% to 25% for the Hero-length labels
                    EWO-068B then replaced with compact ones ("RESERVED"/
                    "AVAILABLE"/"UPGRADE"/"BORROW?"/"MISSING"/"INVALID" —
                    none longer than 9 characters), letting EWO-068B (Part
                    E) shrink Status back to 10% and give Port/Size-Type/
                    Target the reclaimed width — live-measured against the
                    actual rendered "AVAILABLE" pill (the longest approved
                    compact label) rather than estimated from character
                    count. EWO-069 (Part G) extended the identical
                    table-fixed + <colgroup> treatment to Manage Loadout
                    (its own former Availability + Reservations columns
                    consolidated into one Status column). EWO-069A (Part
                    A/B) then retired Manage Loadout's own orphaned
                    Actions column outright (7 columns down to 6 — its one
                    action relocated into the New Target cell, see
                    renderLensCells) and rejustified the remaining six.
                    EWO-069B (Part C) — one final Commander-readability
                    pass: Port/Installed/Current Target were all truncating
                    more aggressively than necessary while New Target had
                    room to spare, so New Target gives back width (29% ->
                    23%) to Port (18% -> 22%), Installed (14% -> 16%), and
                    Current Target (14% -> 16%) — Status stays unchanged
                    (15%, already correctly compact) and Size/Type stays
                    compact (10% -> 8%, never flagged as an issue) — live-
                    measured against a real long component name rather
                    than assumed. EWO-070 (Part E/F) — Change Installed
                    Components gets the identical table-fixed + <colgroup>
                    treatment last: its own former Inventory + Availability
                    columns consolidated into one canonical Status column
                    (7 columns down to 6), Actions retained (this is the
                    physical-work lens). All three lenses now share one
                    six-column layout philosophy. */}
                <table className="w-full text-sm table-fixed">
                  {commanderIntent === null && (
                    <colgroup>
                      <col className="w-[33%]" />
                      <col className="w-[12%]" />
                      <col className="w-[15%]" />
                      <col className="w-[15%]" />
                      <col className="w-[15%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                  )}
                  {commanderIntent === 'MANAGE_LOADOUT' && (
                    <colgroup>
                      <col className="w-[22%]" />
                      <col className="w-[8%]" />
                      <col className="w-[16%]" />
                      <col className="w-[16%]" />
                      <col className="w-[23%]" />
                      <col className="w-[15%]" />
                    </colgroup>
                  )}
                  {commanderIntent === 'CHANGE_INSTALLED' && (
                    <colgroup>
                      <col className="w-[22%]" />
                      <col className="w-[12%]" />
                      <col className="w-[18%]" />
                      <col className="w-[18%]" />
                      <col className="w-[13%]" />
                      <col className="w-[17%]" />
                    </colgroup>
                  )}
                  <thead>{renderLensHeader()}</thead>
                  <tbody>
                    {TOP_LEVEL_GROUP_ORDER.map((group) => {
                      const nodes = commanderTree.get(group)
                      if (!nodes || nodes.length === 0) return null
                      const isExpanded = expandedGroups.has(group)
                      return (
                        <Fragment key={group}>
                          <tr className="border-b border-white/5 bg-white/[0.015] hover:bg-white/[0.03]">
                            <td colSpan={lensColumnCount} className="p-0">
                              <button
                                onClick={() => toggleGroup(group)}
                                className="w-full flex items-center gap-1.5 px-5 py-2.5 text-left text-cyan/80 font-semibold uppercase tracking-wide text-xs hover:bg-white/[0.03] transition-colors"
                              >
                                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                {group}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && renderLensRows(nodes, 0)}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        {/* SW-013A (Objective 3) — Remove Installed Component confirm modal.
            Mirrors LoadoutPortTree.tsx's own modal exactly (Remove -> optional
            "Return removed component to Hangar" -> Save), the one deliberate
            exception to this page's "never a dialog" convention — see the
            removeTarget state declaration above for why. Nested inside this
            `{ship && (...)}` block so `ship` is known non-null here without
            a non-null assertion. */}
        {removeTarget && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setRemoveTarget(null)}>
            <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display font-semibold text-white">Remove "{removeTarget.itemLabel}"?</h3>
                <button onClick={() => setRemoveTarget(null)} className="text-muted hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-muted mb-4">Removing from {formatHardpointLabel(removeTarget.slotLabel)}. This clears the Installed assignment for the reviewed Loadout.</p>
              <label className="flex items-center gap-2 text-sm text-white cursor-pointer mb-4">
                <input type="checkbox" checked={returnToHangar} onChange={(e) => setReturnToHangar(e.target.checked)} className="accent-cyan" />
                Return removed component to Hangar
              </label>
              {removeError && <p className="text-xs text-danger mb-3">{removeError}</p>}
              <div className="flex gap-2">
                <button onClick={() => setRemoveTarget(null)} className="flex-1 border border-white/15 text-white text-sm py-2 rounded-lg hover:border-white/35 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const result = removeComponentStore(ship.id, removeTarget.slotLabel, returnToHangar, reviewedBuildId)
                    if (result.matched) {
                      addLogEntry({
                        action: returnToHangar ? 'Removed component to Hangar' : 'Removed component',
                        shipName: ship.name,
                        itemName: result.itemName,
                        details: `Removed ${result.itemName} from ${ship.name} (${removeTarget.slotLabel})${returnToHangar ? ' — returned to Hangar' : ''}`,
                      })
                      setRemoveTarget(null)
                    } else {
                      setRemoveError('Could not remove this component.')
                    }
                  }}
                  className="flex-1 bg-danger text-white font-semibold text-sm py-2 rounded-lg hover:bg-danger/90 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EWO-065 (Part A) — Ship Settings, opened from the Hero's
            top-left control. Reuses EditFleetAssetModal exactly as Ship
            Detail's own "Edit" button already does — this mission
            establishes the Ship Management access point only, not a
            modal redesign. */}
        {editOpen && <EditFleetAssetModal ship={ship} onClose={() => setEditOpen(false)} />}
        </>
      )}

      {/* SW-013C.2D (Objective 1) — Persistent Workspace Save Actions.
          Commander testing found the existing Save/Discard controls (in
          the Systems Workspace panel header above) scroll out of the
          viewport once a Commander edits a child port deep in a long
          table — the Commander then has to scroll back up to commit.
          This bar is a SECOND, always-visible entry point to the exact
          same handlers (handleSaveChanges/handleDiscardChanges) and the
          exact same pending-edit state (desiredTargets) SW-008D already
          established — never a parallel save path. `fixed` (not
          `sticky`) so it stays pinned to the viewport regardless of
          table scroll position; the trailing spacer div reserves real
          document height for it so it never permanently covers the
          table's own last rows. Rendered only while there is something
          to act on (Manage Loadout intent + at least one pending
          target) — hidden entirely otherwise, matching every other
          conditional control on this page (e.g. the panel-header
          Save/Discard buttons it doesn't replace, only supplements).
          z-10 — deliberately BELOW TargetComponentPicker's dropdown
          popover (z-20), so a New Target picker opened on a row near the
          bottom of the viewport always renders above this bar, never
          hidden beneath it.

          EWO-069B (Part E/F) — this bar previously used `inset-x-0
          md:left-64` with no right-edge constraint of its own, so on a
          wide viewport its visible background/border spanned all the
          way to the browser's own right edge — well past App.tsx's own
          `<main className="... max-w-[1400px]">`, the exact container
          Hero/Loadout/Workspace cards/Ship Assessment all render inside.
          `md:max-w-[1400px]` now caps the bar itself at the identical
          width, left-aligned from the same `md:left-64` sidebar offset
          (Sidebar.tsx's own real `w-64`) — so it terminates exactly
          where the Ship Workspace's own content does, never past it,
          and the left navigation panel stays visually untouched. The
          inner wrapper's own `max-w-[1400px] mx-auto` is now redundant
          (the outer element already caps at that width) and is dropped
          in favor of matching `<main>`'s own horizontal padding
          (`px-6 md:px-10`, already present) directly. */}
      {ship && commanderIntent === 'MANAGE_LOADOUT' && pendingChangeCount > 0 && (
        <>
          <div className="h-20" aria-hidden="true" />
          <div
            data-testid="persistent-save-bar"
            className="fixed inset-x-0 md:left-64 md:max-w-[1400px] bottom-0 z-10 border-t border-cyan/30 bg-bg/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.35)] px-6 md:px-10 py-3"
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <Badge tone="warning">
                  {pendingChangeCount} Pending Change{pendingChangeCount === 1 ? '' : 's'}
                </Badge>
                <span className="text-muted text-xs hidden sm:inline">on &ldquo;{reviewedBuild?.name}&rdquo;</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveChanges}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-bg bg-cyan hover:bg-cyan/90 border border-cyan rounded-lg px-4 py-2 transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={handleDiscardChanges}
                  className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-4 py-2 transition-colors"
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
