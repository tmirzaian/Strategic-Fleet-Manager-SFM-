import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ShipWheel,
  ChevronDown,
  ChevronRight,
  Plus,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  ListChecks,
  Wrench as WrenchIcon,
  RotateCcw,
  Package,
  Maximize2,
  Minimize2,
  ArrowDownToLine,
  Layers,
  Code2,
  Trash2,
  X,
  ArrowRightLeft,
  PackagePlus,
} from 'lucide-react'
import { useFleetStore, DEV_SEED_FLEET_ENABLED, type TargetOverrideInput } from '../store/useFleetStore'
import Badge, { statusTone } from '../components/Badge'
import ComponentAssignmentLabel from '../components/ComponentAssignmentLabel'
import ReadinessBar, { colorFor } from '../components/ReadinessBar'
import ShipHeroFrame from '../components/ShipHeroFrame'
import { resolveShipManagementIllustration } from '../config/assets'
import { resolveShipImage } from '../utils/resolveShipImage'
import { resolveShipStockRoleFocus, resolveShipEntityClass } from '../utils/shipIdentityLine'
import { getConfigurableSlotsForShip, type ConfigurableSlotRuntimeRecord } from '../generated/configurableSlots'
import { catalogComponentsByEntityClass, catalogComponentsByName, resolveComponentByEntityClass } from '../generated/componentCatalog'
import { deriveInstallCandidates, type BorrowInstallCandidate } from '../utils/installCandidates'
import { buildPortTree, derivePortLogistics, type PortTreeNode } from '../utils/portTree'
import { groupPortTree } from '../utils/portTreeGrouping'
import { withMissileRackAggregation, makeMissileAggregateRow, type DisplayHardpoint } from '../utils/missileRackAggregation'
import { componentCategoryIcon } from '../utils/componentCategoryIcon'
import { calculateBuildProgress } from '../utils/buildProgress'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { deriveFleetBuildState } from '../utils/fleetBuildState'
import { formatHardpointLabel } from '../utils/hardpointLabelPresentation'
import { TOP_LEVEL_GROUP_ORDER, legacyPortGroupLabel } from '../utils/commanderSystemTaxonomy'
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

/** SW-002's five-tier Component Selection Priority — reference-only text;
 * tiers 1/2/3 are backed by real data via describeAcquisitionHint, tiers
 * 4/5 are honest labels for workflows this prototype doesn't implement
 * (inventory writes, full catalog browsing) rather than fabricated ones. */
const COMPONENT_SELECTION_TIERS = [
  'Available Inventory — highest priority, immediately actionable',
  'Reserved Components — available, with a reservation-impact warning',
  'Installed On Other Ships — Borrow Intelligence, Commander chooses whether to transfer',
  'Add Newly Acquired Component — looted, purchased, crafted, or NPC acquired',
  'Remaining Compatible Components — reference list (see Loadout Manager for the full catalog)',
] as const

/** A "critical" decision row is either a real diagnostic (Invalid Target)
 * or a genuinely missing assignment — invalid targets always sort first
 * (SW-002 Phase 4: "priority should place invalid/incompatible
 * configuration ahead of ordinary missing items"). Both sets come
 * straight from `hp.status`, the same field `calculateBuildProgress`
 * itself partitions internally — never an independently redefined rule. */
export function criticalHardpointsInPriorityOrder(hardpoints: Hardpoint[]): Hardpoint[] {
  const invalid = hardpoints.filter((h) => h.status === 'Invalid Target')
  const missing = hardpoints.filter((h) => h.status === 'Missing')
  return [...invalid, ...missing]
}

/** SW-002 Revision B (Part 2) — "do not allow non-actionable information
 * to dominate the summary." Ranks a Missing hardpoint's own acquisition
 * hint by the approved priority order (Available in Inventory > Available
 * to Reserve > Borrow Available > Purchase Required), purely for display
 * ordering — never a new eligibility rule, never changes which hardpoints
 * qualify as decisions, only which of them a Commander sees first. */
function acquisitionRank(hint: AcquisitionHint): number {
  switch (hint.tone) {
    case 'success':
      return 0
    case 'warning':
      return 1
    case 'cyan':
      return 2
    default:
      return 3
  }
}

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
  const releaseReservationStore = useFleetStore((s) => s.releaseReservation)

  const sortedShips = [...ships].sort((a, b) => a.name.localeCompare(b.name))
  const ship = ships.find((s) => s.id === shipId)

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
  // Tier 2 (Reserved Components) — which candidate's "reassign" confirm
  // step is currently showing, keyed by `${hp.id}:${item}` so two
  // different candidates (or two different rows) never share state.
  const [reassignConfirmKey, setReassignConfirmKey] = useState<string | null>(null)
  // Tier 3 (Borrow From Another Ship) — same per-candidate confirm-step
  // pattern, keyed by `${hp.id}:${item}:${donorShipId}` (the same
  // component can be borrowable from more than one ship at once).
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

  // SW-013A (Objective 3) — Remove Installed Component. The one
  // deliberate exception to this page's own "never a dialog" convention:
  // a real confirm modal, not an inline disclosure, matching the existing
  // precedent for every other destructive/irreversible action already in
  // this codebase (Ship Detail's own LoadoutPortTree remove modal, its
  // "Remove from Fleet" confirmation, Loadout Manager's "Delete Loadout"
  // confirmation) — a Commander should never uninstall a real component
  // one accidental click away from a silent mutation.
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
  const activeBuild = shipBuilds.find((b) => b.isActive)
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
  const activeProgress = calculateBuildProgress(activeHardpoints)
  const activeBuildState = deriveFleetBuildState(activeBuild, activeProgress)
  const missingSummary = [...activeProgress.missingAssignments, ...activeProgress.upgradeOpportunities, ...activeProgress.invalidTargets]
  // Phase 4 — invalid targets are critical decisions too, sorted ahead of
  // ordinary missing items; both partitions are the same `hp.status`
  // check calculateBuildProgress already performs internally.
  const decisionHardpoints = criticalHardpointsInPriorityOrder(activeHardpoints)
  const decisionCount = decisionHardpoints.length

  // LOADOUT WORKFLOW / SYSTEMS WORKSPACE — the Loadout the Commander is
  // actually reviewing/managing; defaults to Active but is independent of
  // it from here down. Same canonical preparation as the banner (Phase 1:
  // "all three lenses consume the same prepared hardpoint set").
  const reviewedHardpointsRaw = hardpoints.filter((h) => h.buildId === reviewedBuild?.id)
  const reviewedHardpoints = ship ? prepareCanonicalHardpoints(ship.id, reviewedHardpointsRaw, fleetAssets) : []
  const reviewedProgress = calculateBuildProgress(reviewedHardpoints)

  // Change Status — derived from real local edits (SW-002's own
  // "Prototype interaction"), never a fixed placeholder. Applying
  // Changes / Changes Applied / Failed are future states this prototype
  // never enters (no backend mutation exists to apply).
  const pendingChangeCount = reviewedHardpoints.reduce((count, hp) => {
    const desired = desiredTargets[hp.slotLabel]
    return desired !== undefined && desired !== hp.targetItem ? count + 1 : count
  }, 0)
  const changeStatusLabel = pendingChangeCount > 0 ? `Pending Changes (${pendingChangeCount})` : 'No Pending Changes'

  const imageSrc = ship ? resolveShipImage({ id: ship.id, imageUrl: ship.imageUrl }) : undefined
  // EWO-062 — resolved once; undefined only if the illustration is ever
  // disabled again, in which case the empty state falls back to a plain
  // dark panel rather than a broken image (same contract every other
  // illustration resolver in this codebase already guarantees).
  const quartermasterBayEmptySrc = resolveShipManagementIllustration('quartermaster-bay-empty')
  const role = ship ? resolveShipStockRoleFocus(ship.id, fleetAssets) : undefined
  const identitySubtitle = ship ? (role ? `${ship.manufacturer} · ${role}` : ship.manufacturer) : ''

  function hintFor(hp: Hardpoint): AcquisitionHint {
    return describeAcquisitionHint({
      componentName: hp.targetItem,
      componentEntityClass: hp.targetEntityClass,
      currentShipId: ship!.id,
      currentBuildId: hp.buildId,
      currentSlotLabel: hp.slotLabel,
      hangarItems,
      installedLoadouts,
      reservations,
      ships,
    })
  }

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

  // SW-002 Revision B (Part 2) — the SAME decisionHardpoints list, just
  // reordered so actionable work (Available in Inventory / Available to
  // Reserve / Borrow Available) never gets buried behind a Purchase
  // Required item. Invalid Target rows stay first regardless (they need
  // resolution, not acquisition, and were already the top priority).
  // Feeds both the Priority Components strip and the Decision Summary —
  // one list, never two independently maintained ones.
  const prioritizedDecisions = ship
    ? [
        ...decisionHardpoints.filter((h) => h.status === 'Invalid Target'),
        ...decisionHardpoints
          .filter((h) => h.status === 'Missing')
          .map((h) => ({ hp: h, hint: hintFor(h) }))
          .sort((a, b) => acquisitionRank(a.hint) - acquisitionRank(b.hint))
          .map((x) => x.hp),
      ]
    : []

  // SW-002 Revision C (Part 1) — Decision Summary is Commander decision
  // intelligence, not a second readiness report or a shopping list: it
  // shows only what the Commander can actually DO right now. Invalid
  // Target rows stay (resolving one is a real, immediate action); a
  // Missing row whose own acquisition hint is "Purchase Required" (tone
  // 'muted' — acquisitionRank 3, the one non-actionable tier) is excluded
  // entirely — that fact is already conveyed by Readiness/"Missing: …"
  // and by the Priority Components strip (Part 2, unchanged), so
  // repeating it here would just be a second readiness report under a
  // different heading.
  const actionableDecisions = ship
    ? prioritizedDecisions.filter((hp) => hp.status === 'Invalid Target' || acquisitionRank(hintFor(hp)) < 3)
    : []
  const actionableCount = actionableDecisions.length
  const hasNonActionableGaps = decisionHardpoints.length > 0 && actionableCount === 0

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
  const lensColumnCount = commanderIntent === 'MANAGE_LOADOUT' ? 8 : commanderIntent === 'CHANGE_INSTALLED' ? 7 : 6

  function renderLensHeader() {
    if (commanderIntent === 'MANAGE_LOADOUT') {
      return (
        <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
          <th className="px-4 py-2.5 font-medium">Port</th>
          <th className="px-4 py-2.5 font-medium">Size / Type</th>
          <th className="px-4 py-2.5 font-medium">Installed</th>
          <th className="px-4 py-2.5 font-medium">Current Target</th>
          <th className="px-4 py-2.5 font-medium">New Target</th>
          <th className="px-4 py-2.5 font-medium">Availability</th>
          <th className="px-4 py-2.5 font-medium">Reservations</th>
          <th className="px-4 py-2.5 font-medium">Actions</th>
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
          <th className="px-4 py-2.5 font-medium">Inventory</th>
          <th className="px-4 py-2.5 font-medium">Availability</th>
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
      const availability = calculateComponentAvailability(desired, hangarItems, installedLoadouts, reservations, desiredEntityClass)
      const logistics = derivePortLogistics(hp, reservations, hangarItems, installedLoadouts)

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
          <td className="px-4 py-1.5 text-muted">
            <ComponentAssignmentLabel value={hp.installedItem} />
          </td>
          <td className="px-4 py-1.5 text-muted/80">
            <ComponentAssignmentLabel value={hp.targetItem} />
          </td>
          <td className="px-4 py-1.5">
            <TargetComponentPicker
              id={`new-target-${hp.id}`}
              value={desired}
              onChange={commitNewTarget}
              options={newTargetOptionsFor(hp)}
              ariaLabel={`New target for ${formatHardpointLabel(hp.slotLabel)}`}
              showFullIdentity
            />
          </td>
          <td className="px-4 py-1.5">
            <Badge tone={availability.availableQuantity > 0 ? 'success' : 'muted'}>{availability.availableQuantity} Available</Badge>
          </td>
          <td className="px-4 py-1.5">
            <Badge tone={logistics === 'Reserved' ? 'cyan' : 'muted'}>{logistics}</Badge>
          </td>
          <td className="px-4 py-1.5">
            {isEdited && (
              <button
                onClick={() => commitNewTarget(hp.factoryItem, hp.factoryEntityClass)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-cyan transition-colors"
                title="Restore factory target"
              >
                <RotateCcw size={12} /> Factory
              </button>
            )}
          </td>
        </>
      )
    }

    if (commanderIntent === 'CHANGE_INSTALLED') {
      const availability = calculateComponentAvailability(hp.targetItem, hangarItems, installedLoadouts, reservations, hp.targetEntityClass)
      const isRowExpanded = expandedInstallRowId === hp.id
      return (
        <>
          <td className="px-4 py-1.5 text-muted">
            <ComponentAssignmentLabel value={hp.installedItem} />
          </td>
          <td className="px-4 py-1.5 text-cyan/90">
            <ComponentAssignmentLabel value={hp.targetItem} />
          </td>
          <td className="px-4 py-1.5 text-muted">{availability.ownedQuantity}</td>
          <td className="px-4 py-1.5">
            <Badge tone={availability.availableQuantity > 0 ? 'success' : 'muted'}>{availability.availableQuantity} Available</Badge>
          </td>
          <td className="px-4 py-1.5">
            <div className="flex items-center gap-3">
              {hp.targetItem && hp.targetItem !== '—' && (
                <button
                  onClick={() => {
                    setExpandedInstallRowId(isRowExpanded ? null : hp.id)
                    setInstallNotice(null)
                    setReassignConfirmKey(null)
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

    // Lens 1 — Ship Assessment (default), read-only.
    return (
      <>
        <td className="px-4 py-1.5 text-muted/70">
          <ComponentAssignmentLabel value={hp.factoryItem} />
        </td>
        <td className="px-4 py-1.5 text-muted">
          <ComponentAssignmentLabel value={hp.installedItem} />
        </td>
        <td className="px-4 py-1.5 text-cyan/90">
          <ComponentAssignmentLabel value={hp.targetItem} />
        </td>
        <td className="px-4 py-1.5">
          <Badge tone={statusTone(hp.status)}>{hp.status}</Badge>
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
  // `resolveDestinationHardpoint` (the engine's own, unmodified gate —
  // src/engine/installation/installationEngine.ts) refuses to target a
  // port whose status is already 'OK' (installed === target === factory,
  // nothing outstanding) — a deliberate, pre-existing constraint this
  // mission does not touch. "Replace: Installed -> Different Component"
  // (a required certification scenario) therefore needs the port's own
  // TARGET updated to the newly chosen component FIRST — via the exact
  // same `saveMissionConfiguration` single-slot override Manage Loadout's
  // own Save already uses — so status becomes 'Missing'/'Upgrade
  // Available' and the install below is accepted. Skipped entirely when
  // the chosen item already matches the current target (the common "just
  // acquire what Manage Loadout already asked for" case), so this never
  // performs a redundant save.
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
    if (item !== hp.targetItem) {
      const retarget = saveMissionConfiguration({
        shipId: ship.id,
        name: reviewedBuild?.name ?? 'Loadout',
        startingState: 'EXISTING',
        existingBuildId: reviewedBuildId,
        targetOverrides: { [hp.slotLabel]: { targetItem: item, targetEntityClass: entityClass } },
        setActive: true,
        saveAsNew: false,
      })
      if (!retarget.success) {
        setInstallNotice({ tone: 'error', message: `Could not set ${item} as the target for ${formatHardpointLabel(hp.slotLabel)} — nothing was changed.` })
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
      setReassignConfirmKey(null)
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

  // Tier 2 — releases exactly the one blocking reservation the Commander
  // confirmed against, then attempts the install. If another blocking
  // reservation still exists (a component reserved by more than one other
  // Build), the candidate simply re-renders with that one still listed —
  // never a silent mass-release of every competing reservation at once.
  function performReassign(hp: Hardpoint, item: string, entityClass: string | undefined, reservationId: string, hangarItemId: string | undefined) {
    releaseReservationStore(reservationId)
    performInstall(hp, item, entityClass, hangarItemId)
  }

  // Tier 3 — composed from the two already-certified REMOVE/INSTALL
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
    const hint = hintFor(hp)
    const candidateOptions = newTargetOptionsFor(hp)
    const candidates = ship
      ? deriveInstallCandidates(candidateOptions, {
          currentShipId: ship.id,
          currentBuildId: reviewedBuildId,
          currentSlotLabel: hp.slotLabel,
          currentlyInstalledItem: hp.installedItem,
          hangarItems,
          installedLoadouts,
          reservations,
          ships,
          builds,
        })
      : { availableInventory: [], reserved: [], borrowable: [], remainingCompatible: [] }
    const newComponentOptions = candidateOptions.filter((o) => o.item !== '—')

    return (
      <tr key={`${hp.id}-install-detail`} className="bg-black/20">
        <td colSpan={lensColumnCount} className="px-5 py-3">
          {/* Preserved existing intelligence — the acquisition hint badge
              and the reference tier list stay exactly as before (SW-014A's
              own explicit "Information + Actions, not a replacement"
              requirement). Everything from here down is new. */}
          <div className="flex items-start gap-2 text-xs">
            <Badge tone={hint.tone}>{hint.label}</Badge>
            <span className="text-muted">{hint.detail}</span>
          </div>
          <div className="mt-2 text-[11px] text-muted/60 space-y-0.5">
            {COMPONENT_SELECTION_TIERS.map((tier, i) => (
              <div key={i}>
                {i + 1}. {tier}
              </div>
            ))}
          </div>

          {installNotice && (
            <div className={`mt-3 text-xs rounded-md px-3 py-2 border ${installNotice.tone === 'success' ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'}`}>
              {installNotice.message}
            </div>
          )}

          <div className="mt-3 space-y-3">
            {/* Tier 1 — Available Inventory. */}
            {candidates.availableInventory.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted/60 mb-1">Available Inventory</div>
                <div className="space-y-1">
                  {candidates.availableInventory.map((c) => (
                    <div key={c.item} className="flex items-center justify-between gap-2 bg-black/20 border border-white/10 rounded-md px-2.5 py-1.5">
                      <div className="min-w-0">
                        <div className="text-xs text-white truncate">{c.label}</div>
                        <div className="text-[10px] text-muted/60">{c.reservedForThisPort ? 'Reserved for this port' : `${c.quantity} Available`}</div>
                      </div>
                      <button
                        onClick={() => performInstall(hp, c.item, c.entityClass, c.hangarItemId)}
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-success hover:underline"
                      >
                        <Package size={12} /> Install
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tier 2 — Reserved Components. */}
            {candidates.reserved.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted/60 mb-1">Reserved Components</div>
                <div className="space-y-1">
                  {candidates.reserved.map((c) =>
                    c.blockingReservations.map((r) => {
                      const key = `${hp.id}:${c.item}:${r.id}`
                      const confirming = reassignConfirmKey === key
                      return (
                        <div key={key} className="bg-black/20 border border-warning/20 rounded-md px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs text-white truncate">{c.label}</div>
                              <div className="text-[10px] text-muted/60">Reserved for {r.shipName} — {r.buildName} ({formatHardpointLabel(r.slotLabel)})</div>
                            </div>
                            {!confirming && (
                              <button onClick={() => setReassignConfirmKey(key)} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-warning hover:underline">
                                <RotateCcw size={12} /> Reassign
                              </button>
                            )}
                          </div>
                          {confirming && (
                            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-warning/90">Reassigning releases the reservation for {r.shipName} — {r.buildName}. Continue?</span>
                              <div className="shrink-0 flex items-center gap-2">
                                <button onClick={() => setReassignConfirmKey(null)} className="text-muted hover:text-white">
                                  Cancel
                                </button>
                                <button onClick={() => performReassign(hp, c.item, c.entityClass, r.id, c.hangarItemId)} className="text-warning font-medium hover:underline">
                                  Confirm
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* Tier 3 — Borrow From Another Ship. */}
            {candidates.borrowable.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted/60 mb-1">Borrow From Another Ship</div>
                <div className="space-y-1">
                  {candidates.borrowable.map((c) => {
                    // Keyed by donor slotLabel too — the same component can
                    // legitimately be borrowable from more than one port on
                    // the same donor ship (e.g. a symmetric Left/Right pair).
                    const key = `${hp.id}:${c.item}:${c.shipId}:${c.slotLabel}`
                    const confirming = borrowConfirmKey === key
                    return (
                      <div key={key} className="bg-black/20 border border-cyan/20 rounded-md px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs text-white truncate">{c.label}</div>
                            <div className="text-[10px] text-muted/60">
                              Installed On: {c.shipName} — {formatHardpointLabel(c.slotLabel)} ({c.buildName})
                            </div>
                          </div>
                          {!confirming && (
                            <button onClick={() => setBorrowConfirmKey(key)} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline">
                              <ArrowRightLeft size={12} /> Transfer?
                            </button>
                          )}
                        </div>
                        {confirming && (
                          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-cyan/90">Transfer from {c.shipName} — this removes it there and installs it here.</span>
                            <div className="shrink-0 flex items-center gap-2">
                              <button onClick={() => setBorrowConfirmKey(null)} className="text-muted hover:text-white">
                                Cancel
                              </button>
                              <button onClick={() => performBorrow(hp, c)} className="text-cyan font-medium hover:underline">
                                Confirm Transfer
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tier 4 — Newly Acquired Component. */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted/60 mb-1">Newly Acquired Component</div>
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
                      Record &amp; Install
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNewComponentFormHpId(hp.id)
                    setNewComponentSelection({ item: '' })
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
                >
                  <PackagePlus size={12} /> Record New Component
                </button>
              )}
            </div>

            {/* Tier 5 — Remaining Compatible Components (reference only). */}
            {candidates.remainingCompatible.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted/60 mb-1">Remaining Compatible Components</div>
                <div className="text-[11px] text-muted/70 space-y-0.5">
                  {candidates.remainingCompatible.slice(0, 8).map((c) => (
                    <div key={c.item} className="truncate">
                      {c.label}
                    </div>
                  ))}
                  {candidates.remainingCompatible.length > 8 && (
                    <div className="text-muted/50">+{candidates.remainingCompatible.length - 8} more — see Loadout Manager for the full catalog.</div>
                  )}
                </div>
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
      // Phase 3 — critical diagnostics stay visible in every lens. Lens 1
      // already has its own dedicated Status column, so this inline badge
      // only renders in Lens 2/3 (which have no Status column at all),
      // avoiding a redundant duplicate badge in Lens 1.
      const showInlineDiagnostic = commanderIntent !== null && !hp.isStructural && hp.status !== 'OK'
      const CategoryIcon = componentCategoryIcon(hp)
      // SW-011A (Objective 1/2) — additive only: a row with no confident
      // configurable-slot match renders byte-identical to before this
      // sprint (Objective 5's non-configurable-ship regression guarantee).
      const configurableSlot = hp.isStructural ? undefined : configurableSlotFor(hp)
      const isInspectingConfigurableSlot = inspectedConfigurableSlotId === hp.id
      const dormantTopologyNotice = hp.isStructural ? undefined : dormantTopologyNoticeFor(hp)
      const rows: ReactNode[] = [
        <tr key={hp.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
          <td className={`px-4 py-1.5 whitespace-nowrap ${hp.isStructural ? 'text-white/70 font-semibold uppercase tracking-wide text-xs' : 'text-white font-medium'}`}>
            <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-1.5">
              <CategoryIcon size={13} className="text-muted/50 shrink-0" aria-hidden="true" />
              {formatHardpointLabel(hp.slotLabel)}
              {dormantTopologyNotice && (
                <span title={dormantTopologyNotice}>
                  <Badge tone="cyan">Additional Topology Pending</Badge>
                </span>
              )}
              {configurableSlot && (
                <button
                  onClick={() => setInspectedConfigurableSlotId(isInspectingConfigurableSlot ? null : hp.id)}
                  title={`Configurable Slot — ${configurableSlot.eligibleComponentCount} known alternative(s). Click to ${isInspectingConfigurableSlot ? 'hide' : 'view'} details.`}
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border transition-colors ${
                    isInspectingConfigurableSlot ? 'border-cyan/60 bg-cyan/15 text-cyan' : 'border-cyan/30 text-cyan/80 hover:border-cyan/60 hover:text-cyan'
                  }`}
                >
                  <Layers size={11} aria-hidden="true" /> Configurable
                </button>
              )}
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
          <td className="px-4 py-1.5 text-muted whitespace-nowrap">
            {hp.size} {hp.type}
          </td>
          {renderLensCells(hp)}
        </tr>,
      ]
      if (commanderIntent === 'CHANGE_INSTALLED' && expandedInstallRowId === hp.id) rows.push(renderInstallDisclosure(hp))
      if (configurableSlot && isInspectingConfigurableSlot) rows.push(renderConfigurableSlotDisclosure(hp, configurableSlot))
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
          occupies exactly this space before and after. Overlay text is
          the standardized EWO-061 label/title pair, vertically centered
          across the full hero, and nothing else (no icon, no
          description, no controls). */}
      <div data-testid="ship-operational-banner" className="panel overflow-hidden relative">
        <div ref={bannerSentinelRef} />

        {!ship ? (
          <div className={`relative overflow-hidden ${SHIP_MANAGEMENT_HERO_HEIGHT_CLASS}`}>
            {quartermasterBayEmptySrc ? (
              <img src={quartermasterBayEmptySrc} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
            ) : (
              <div className="absolute inset-0 bg-black/20" />
            )}
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Maintenance Bay Ready</p>
              <h2 className="text-2xl font-display font-bold text-white">Select a ship above to begin management.</h2>
            </div>
          </div>
        ) : (
          <>
            <div className="absolute top-3 right-3 z-10">{changeStatusBadge}</div>

            <ShipHeroFrame
              imageSrc={imageSrc}
              name={ship.name}
              manufacturer={ship.manufacturer}
              ownership={ship.ownership}
              activeBuildLabel={activeBuild?.name ?? '—'}
              subtitle={identitySubtitle}
              isMissionReady={activeBuildState === 'MISSION_READY'}
            />
            <div className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <ReadinessBar value={activeProgress.percentage} />
                  {missingSummary.length > 0 && (
                    <p data-testid="readiness-missing-summary" className="flex items-start gap-1.5 text-xs text-warning mt-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-2">Missing: {missingSummary.join(', ')}</span>
                    </p>
                  )}

                  {/* SW-002 Revision B (Part 1) — the SAME missing-
                      component list already shown above (Missing: …) and
                      in Decision Summary, just a richer visual — never a
                      second independent list. Prototype presentation is
                      [Placeholder]/name per component, matching the
                      approved mock exactly; no canonical component-image
                      resolver exists anywhere in this codebase (confirmed
                      by inspection — only src/constants/shipImage.ts, for
                      ship photography, not components), so this stays a
                      named placeholder, never a page-local image lookup
                      table. "View All" only appears when components are
                      actually hidden beyond the four shown, and only ever
                      scrolls to Ship Systems — it never expands the
                      banner. */}
                  {decisionCount > 0 && (
                    <div data-testid="priority-components-strip" className="flex flex-wrap items-start gap-2.5 mt-3">
                      {prioritizedDecisions.slice(0, 4).map((hp) => (
                        <div key={hp.id} title={hp.status === 'Invalid Target' ? (hp.invalidMessage ?? 'Incompatible target') : hp.targetItem} className="flex flex-col items-center gap-1 w-16">
                          <div
                            className={`w-12 h-12 rounded-lg border flex items-center justify-center ${
                              hp.status === 'Invalid Target' ? 'border-danger/40 bg-danger/10' : 'border-white/10 bg-black/20'
                            }`}
                          >
                            {hp.status === 'Invalid Target' ? <AlertOctagon size={16} className="text-danger" /> : <Package size={16} className="text-muted" />}
                          </div>
                          <span className="text-[10px] text-white/80 text-center truncate w-full">{hp.targetItem}</span>
                        </div>
                      ))}
                      {prioritizedDecisions.length > 4 && (
                        <button onClick={scrollToSystemsWorkspace} className="flex flex-col items-center gap-1 w-16 text-cyan group">
                          <div className="w-12 h-12 rounded-lg border border-dashed border-cyan/30 flex items-center justify-center group-hover:border-cyan/60 transition-colors">
                            <ArrowDownToLine size={16} />
                          </div>
                          <span className="text-[10px]">View All</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* Decision Intelligence (SW-002 Revision C, Part 1) — only
                    actionable Commander decisions: something the Commander
                    can do right now (resolve an incompatible target,
                    install from inventory, reserve, or borrow). Never a
                    second readiness report and never a shopping list — a
                    Missing item whose only path forward is a future
                    purchase is deliberately excluded here; Readiness and
                    the Priority Components strip already convey it. */}
                <div
                  data-testid="decision-summary"
                  className={`rounded-lg p-3.5 border ${actionableCount > 0 ? 'bg-warning/10 border-warning/30' : 'bg-black/20 border-white/5'}`}
                >
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Decision Summary</div>
                  <div className="flex items-center gap-2">
                    {actionableCount > 0 ? (
                      <AlertTriangle size={16} className="shrink-0 text-warning" />
                    ) : (
                      <CheckCircle2 size={16} className="shrink-0 text-success" />
                    )}
                    <span className="text-sm font-display font-bold leading-none text-white">
                      {actionableCount === 0
                        ? hasNonActionableGaps
                          ? 'No Immediate Actions'
                          : 'No Immediate Decisions'
                        : `${actionableCount} Immediate Decision${actionableCount === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  {/* SW-002 Revision C — the canonical empty state when
                      readiness gaps exist but none of them are actionable
                      right now (every one is Purchase Required). */}
                  {hasNonActionableGaps && <p className="text-xs text-muted mt-1.5">Remaining readiness gaps require future acquisition.</p>}
                  {actionableCount > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {actionableDecisions.slice(0, 4).map((hp) => {
                        if (hp.status === 'Invalid Target') {
                          return (
                            <div key={hp.id} className="flex items-center justify-between gap-2 text-xs" title={hp.invalidMessage}>
                              <span className="text-white truncate">Resolve {hp.targetItem}</span>
                              <Badge tone="invalid">Incompatible Target</Badge>
                            </div>
                          )
                        }
                        const hint = hintFor(hp)
                        return (
                          <div key={hp.id} className="flex items-center justify-between gap-2 text-xs" title={hint.detail}>
                            <span className="text-white truncate">Install {hp.targetItem}</span>
                            <Badge tone={hint.tone}>{hint.label}</Badge>
                          </div>
                        )
                      })}
                      {actionableDecisions.length > 4 && <div className="text-[11px] text-muted/70">+{actionableDecisions.length - 4} more</div>}
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
              are never conflated. */}
          <div className="panel p-4">
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
                const showSetActive = isReviewed && !build.isActive
                const accent = isReviewed ? colorFor(reviewedProgress.percentage) : undefined
                return (
                  <div key={build.id} className="inline-flex items-center">
                    <button
                      onClick={() => requestReviewedBuildSwitch(build.id)}
                      style={isReviewed ? { borderColor: accent, color: accent, backgroundColor: `${accent}1A` } : undefined}
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium transition-colors ${showSetActive ? 'rounded-l-full' : 'rounded-full'} ${
                        isReviewed ? `border-2 ${showSetActive ? 'border-r-0' : ''}` : 'border border-white/15 text-white/80 hover:text-white hover:border-white/35 hover:bg-white/5'
                      }`}
                    >
                      {build.name}
                      {build.kind === 'FACTORY' && <Badge tone="cyan">Factory</Badge>}
                      {build.isActive && <Badge tone="success">Active</Badge>}
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

          {/* COMMANDER INTENT — exactly two cards (SW-002 terminology).
              Operational Review is the page's own default state, not a
              selectable option. Borrow Intelligence has no top-level
              presence — it surfaces contextually inside Change Installed
              Components' Install/Change disclosure only. */}
          <div className="panel p-4">
            <h3 className="text-xs uppercase tracking-widest text-muted mb-3">What do you want to change?</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {(
                [
                  { key: 'MANAGE_LOADOUT' as const, icon: ListChecks, description: 'Modify the desired configuration — target shield, weapons, doctrine, intentional empty slots, future build, restore factory target.' },
                  { key: 'CHANGE_INSTALLED' as const, icon: WrenchIcon, description: 'Modify the physical ship — install, replace, remove, restore target, install an upgrade, looted, purchased, or crafted component.' },
                ] as const
              ).map(({ key, icon: Icon, description }) => {
                const isSelected = commanderIntent === key
                return (
                  <button
                    key={key}
                    onClick={() => setCommanderIntent(isSelected ? null : key)}
                    aria-pressed={isSelected}
                    className={`text-left rounded-lg border px-4 py-3.5 transition-colors ${
                      isSelected ? 'bg-cyan/15 border-cyan/40' : 'border-white/10 hover:border-white/25 hover:bg-white/5'
                    }`}
                  >
                    <div className={`flex items-center gap-2 font-display font-bold ${isSelected ? 'text-cyan' : 'text-white'}`}>
                      <Icon size={16} /> {COMMANDER_INTENT_LABEL[key]}
                    </div>
                    <p className="text-xs text-muted mt-1.5">{description}</p>
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
                <table className="w-full text-sm">
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
          hidden beneath it. */}
      {ship && commanderIntent === 'MANAGE_LOADOUT' && pendingChangeCount > 0 && (
        <>
          <div className="h-20" aria-hidden="true" />
          <div
            data-testid="persistent-save-bar"
            className="fixed inset-x-0 md:left-64 bottom-0 z-10 border-t border-cyan/30 bg-bg/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.35)] px-6 md:px-10 py-3"
          >
            <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
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
