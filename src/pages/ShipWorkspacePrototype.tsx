import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ShipWheel,
  ChevronDown,
  ChevronRight,
  Rocket,
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
} from 'lucide-react'
import { useFleetStore, type TargetOverrideInput } from '../store/useFleetStore'
import Badge, { statusTone } from '../components/Badge'
import ComponentAssignmentLabel from '../components/ComponentAssignmentLabel'
import ReadinessBar, { colorFor } from '../components/ReadinessBar'
import ShipHeroFrame from '../components/ShipHeroFrame'
import { resolveShipImage } from '../utils/resolveShipImage'
import { resolveShipStockRoleFocus, resolveShipEntityClass } from '../utils/shipIdentityLine'
import { getConfigurableSlotsForShip, type ConfigurableSlotRuntimeRecord } from '../generated/configurableSlots'
import { catalogComponentsByEntityClass, resolveComponentByEntityClass } from '../generated/componentCatalog'
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
    if (!hp.sourceItemPortName) return undefined
    const candidates = configurableSlotsByKey.get(slotKey(hp.sourceParentItemPortName, hp.sourceItemPortName))
    return candidates?.length === 1 ? candidates[0] : undefined
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
  function newTargetOptionsFor(hp: Hardpoint): TargetComponentOption[] {
    const seen = new Set<string>()
    const options: TargetComponentOption[] = []
    function addPinned(item: string | undefined, entityClass: string | undefined, label?: string) {
      if (!item || seen.has(item)) return
      seen.add(item)
      options.push({ item, path: item, entityClass, label })
    }
    addPinned('—', undefined, 'Intentional Empty (—)')
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
    function appendSwapGroupOptions(pathPrefix: string): void {
      const slot = configurableSlotFor(hp)
      for (const entityClass of slot?.eligibleComponents ?? []) {
        if (seen.has(entityClass)) continue
        const resolution = resolveComponentByEntityClass(entityClass)
        if (resolution.status !== 'resolved') continue
        const { displayName, size } = resolution.record
        if (seen.has(displayName)) continue
        seen.add(displayName)
        options.push({ item: displayName, path: `${pathPrefix} → ${displayName}`, entityClass, label: `${displayName} — S${size}` })
      }
    }

    // SW-013C.2B (Objective 3) — "Compatibility must be driven only by
    // certified relationships. Never by: size alone / category alone /
    // manufacturer / display name." A Module port's factory component
    // deliberately has no entry in CATEGORY_TO_PORT_TYPE (see
    // src/generated/componentCatalog.ts), so the generic full-catalog
    // sweep below naturally offers it nothing — that omission IS the
    // compatibility gate, not an oversight. The one legitimate source of
    // Module alternatives is the certified swap-group eligible-component
    // list.
    //
    // SW-013C.2D (Objective 5) — EMP and Quantum Dampener/Interdiction
    // ports get the exact same treatment for the exact same reason:
    // neither DataCore category (EMP, QuantumInterdictionGenerator) has a
    // CATEGORY_TO_PORT_TYPE entry either, so the generic sweep below would
    // already offer them nothing — this just makes the swap-group-only
    // posture explicit and, where a real confirmed group exists (the
    // Avenger Warlock's EMP port genuinely has one — AEGS_EMP_Device_S4 /
    // AEGS_EMP_Sentinel_S4), actually surfaces it. A port with no
    // confirmed group (Guardian Qi's Quantum Dampener, the Mantis's QED)
    // simply offers no alternatives today — never a fabricated one, and
    // never a schema change if a future generator run discovers a group
    // for one of them.
    if (hp.type === 'Module' || hp.type === 'EMP' || hp.type === 'Quantum Dampener') {
      appendSwapGroupOptions(hp.type)
      return options
    }

    // SW-013C.2D (Objectives 3/4) — a rack PARENT port (Missile Rack) is
    // the one case where "swap-group-only" must NOT be the universal rule:
    // most ships' rack ports (e.g. the Hornet Ghost's own — see SW-008C's
    // regression test) have no confirmed swap group at all, and have
    // always relied on the broad generic size/category sweep below to
    // offer cross-ship rack alternatives — a real, deliberate, tested
    // feature this mission must not regress. But when a port's own
    // confirmed swap group DOES exist (the Eclipse's `hardpoint_torpedorack`
    // — a genuine, tag-derived `Eclipse_BombRack` group), it is the
    // authoritative answer and the generic sweep must defer to it
    // entirely: `MRCK_S09_AEGS_Retaliator_Fore`/`_Rear` share the Eclipse's
    // own rack's exact DataCore category (MissileLauncher/MissileRack) AND
    // exact catalog size (S9 — the accepted torpedo class, not a
    // rack-family identifier), so the generic sweep below could never
    // distinguish "Eclipse's own rack family" from "any other ship's S9
    // torpedo rack" — confirmed the literal root cause of "Retaliator rack
    // selectable on Eclipse." Deriving the distinction from whether a
    // confirmed group EXISTS (not from ship identity) means this applies
    // to any future ship whose rack port gets its own confirmed group,
    // never an `if (ship === 'Eclipse')` special case.
    if (hp.type === 'Missile Rack') {
      const slot = configurableSlotFor(hp)
      if (slot?.eligibleComponents?.length) {
        appendSwapGroupOptions(hp.type)
        return options
      }
      // No confirmed group for this specific rack port — fall through to
      // the generic sweep below, unchanged from before this mission.
    }

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
      const desired = desiredTargets[hp.slotLabel] ?? hp.targetItem
      const isEdited = desired !== hp.targetItem
      const desiredEntityClass = isEdited ? desiredTargetEntityClasses[hp.slotLabel] : hp.targetEntityClass
      const availability = calculateComponentAvailability(desired, hangarItems, installedLoadouts, reservations, desiredEntityClass)
      const logistics = derivePortLogistics(hp, reservations, hangarItems, installedLoadouts)

      // SW-008A (Objective 6) — a real selection always replaces the slot's
      // entry outright; returning to the port's own Current Target removes
      // the entry entirely (not merely a no-op value) so Pending Change
      // detection — untouched below, still exactly `desired !== hp.targetItem`
      // — has nothing left to count for this slot.
      function commitNewTarget(value: string, entityClass: string | undefined) {
        setDesiredTargets((prev) => {
          const next = { ...prev }
          if (value === hp.targetItem) delete next[hp.slotLabel]
          else next[hp.slotLabel] = value
          return next
        })
        setDesiredTargetEntityClasses((prev) => {
          const next = { ...prev }
          if (value === hp.targetItem) delete next[hp.slotLabel]
          else next[hp.slotLabel] = entityClass
          return next
        })
      }

      return (
        <>
          <td className="px-4 py-2 text-muted">
            <ComponentAssignmentLabel value={hp.installedItem} />
          </td>
          <td className="px-4 py-2 text-muted/80">
            <ComponentAssignmentLabel value={hp.targetItem} />
          </td>
          <td className="px-4 py-2">
            <TargetComponentPicker
              id={`new-target-${hp.id}`}
              value={desired}
              onChange={commitNewTarget}
              options={newTargetOptionsFor(hp)}
              ariaLabel={`New target for ${formatHardpointLabel(hp.slotLabel)}`}
              showFullIdentity
            />
          </td>
          <td className="px-4 py-2">
            <Badge tone={availability.availableQuantity > 0 ? 'success' : 'muted'}>{availability.availableQuantity} Available</Badge>
          </td>
          <td className="px-4 py-2">
            <Badge tone={logistics === 'Reserved' ? 'cyan' : 'muted'}>{logistics}</Badge>
          </td>
          <td className="px-4 py-2">
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
          <td className="px-4 py-2 text-muted">
            <ComponentAssignmentLabel value={hp.installedItem} />
          </td>
          <td className="px-4 py-2 text-cyan/90">
            <ComponentAssignmentLabel value={hp.targetItem} />
          </td>
          <td className="px-4 py-2 text-muted">{availability.ownedQuantity}</td>
          <td className="px-4 py-2">
            <Badge tone={availability.availableQuantity > 0 ? 'success' : 'muted'}>{availability.availableQuantity} Available</Badge>
          </td>
          <td className="px-4 py-2">
            <div className="flex items-center gap-3">
              {hp.targetItem && hp.targetItem !== '—' && (
                <button
                  onClick={() => setExpandedInstallRowId(isRowExpanded ? null : hp.id)}
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
        <td className="px-4 py-2 text-muted/70">
          <ComponentAssignmentLabel value={hp.factoryItem} />
        </td>
        <td className="px-4 py-2 text-muted">
          <ComponentAssignmentLabel value={hp.installedItem} />
        </td>
        <td className="px-4 py-2 text-cyan/90">
          <ComponentAssignmentLabel value={hp.targetItem} />
        </td>
        <td className="px-4 py-2">
          <Badge tone={statusTone(hp.status)}>{hp.status}</Badge>
        </td>
      </>
    )
  }

  function renderInstallDisclosure(hp: Hardpoint): ReactNode {
    const hint = hintFor(hp)
    return (
      <tr key={`${hp.id}-install-detail`} className="bg-black/20">
        <td colSpan={lensColumnCount} className="px-5 py-3">
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
      const rows: ReactNode[] = [
        <tr key={hp.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
          <td className={`px-4 py-2 whitespace-nowrap ${hp.isStructural ? 'text-white/70 font-semibold uppercase tracking-wide text-xs' : 'text-white font-medium'}`}>
            <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-1.5">
              <CategoryIcon size={13} className="text-muted/50 shrink-0" aria-hidden="true" />
              {formatHardpointLabel(hp.slotLabel)}
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
          <td className="px-4 py-2 text-muted whitespace-nowrap">
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
    <div className="space-y-6">
      {/* PAGE IDENTITY — deliberately lightweight: title, one-line
          functional description, and Ship Selection (a workspace-level
          action, not ship-state). No ship-state of any kind lives here.
          SW-013B (Objective 1/5) — the "Prototype" badge is removed: this
          is now the canonical, primary ship-management surface (Ship
          Workspace Promotion), not an experimental page — the label was
          no longer accurate. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Ship Management</h1>
          <p className="text-sm text-muted mt-1">Assess readiness, configure loadouts, and manage installed components.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* SW-011A (Objective 4) — Developer Mode: local, unpersisted
              toggle gating raw Configurable Slot diagnostic detail. Off by
              default; an ordinary Commander never needs to know it
              exists. */}
          <button
            onClick={() => setDeveloperMode((v) => !v)}
            title="Developer Mode — show raw Configurable Slot diagnostics"
            className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest border rounded-lg px-2.5 py-1.5 transition-colors ${
              developerMode ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-white/10 text-muted hover:border-white/25 hover:text-white'
            }`}
          >
            <Code2 size={12} /> Developer Mode
          </button>
          {/* SW-013B (Objective 2) — "Preserve Legacy Access." Ship
              Workspace is now the primary destination, so this is the one
              place a Commander who arrived here needs a discoverable path
              back to Ship Detail for familiarity/comparison/regression
              investigation — replacing Loadout Manager's own former
              "View in Ship Detail" link, which now points here instead
              (Objective 4). Only rendered once a real ship is selected;
              omitted entirely on the blank workspace state. */}
          {ship && (
            <Link
              to={`/ship/${ship.id}`}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest border border-white/10 text-muted hover:border-white/25 hover:text-white rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <Rocket size={12} /> View in Ship Detail
            </Link>
          )}
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
          Ship Systems Workspace below adapts to intent. */}
      <div data-testid="ship-operational-banner" className="panel overflow-hidden relative">
        <div ref={bannerSentinelRef} />

        {!ship ? (
          <div className="p-10 flex flex-col items-center justify-center text-center gap-2">
            <ShipWheel size={28} className="text-cyan/50 mb-2" />
            <h2 className="font-display font-bold text-white text-lg uppercase tracking-widest">Select a Ship</h2>
            <p className="text-sm text-muted max-w-sm">Choose a fleet vessel above to open its workspace.</p>
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
                                className="w-full flex items-center gap-1.5 px-5 py-3 text-left text-cyan/80 font-semibold uppercase tracking-wide text-xs hover:bg-white/[0.03] transition-colors"
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
