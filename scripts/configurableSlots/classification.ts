/**
 * SW-010B/SW-011A — Configurable Slot Classification.
 *
 * Extracted from `scripts/generateConfigurableSlotCertification.ts` so the
 * certification report and the Commander-facing runtime catalog
 * (`scripts/generateConfigurableSlotRuntimeCatalog.ts`, SW-011A) classify
 * every slot through the exact same rule, never two independently
 * maintained copies that could drift.
 *
 * Reuses ONE pre-existing, general-purpose mechanism
 * (`isNonPlayerVariantName`, already established and reviewed for an
 * unrelated purpose — Mission M-012's ship-catalog inclusion filter)
 * rather than inventing a new heuristic — per SW-010B's own constraint,
 * "no heuristic should be added solely to eliminate a single hull."
 */
import { isNonPlayerVariantName } from '../shipCatalog/playerVehicleTaxonomy'
import type { ConfigurableSlot } from './types'

export type SlotCategory = 'A-confirmed' | 'B-newly-discovered' | 'C-review-required' | 'D-rejected'

export interface SlotClassification {
  category: SlotCategory | null
  rejectionReason: string | null
}

/** The 5 swap-group identifiers SW-010A hand-verified live against real
 * DataCore evidence before the SW-010B certification sprint ever ran —
 * the only thing this constant is used for is Category A / Category B
 * split (has this exact group already been proven, or is the generalized
 * pipeline finding something new). It plays no role in discovery,
 * resolution, or merge — removing it would only change which category a
 * slot is labeled, never whether it's found. */
export const CONFIRMED_SWAP_GROUP_IDS = new Set(['$ANVL_Hornet_Mk2_Center', 'AEGS_Retaliator_Module_Front', 'AEGS_Retaliator_Module_Rear', '$RSI_Scorpius_Turret', '$ARGO_MOTH_MissileTurret'])

/**
 * The largest distinct-port-name span any SW-010A-confirmed swap group
 * exhibits on its own hull: the Argo MOTH's `$ARGO_MOTH_MissileTurret`
 * legitimately covers 2 ports (`hardpoint_turret_top` and
 * `turret_launcher` — a turret mount and its paired missile launcher,
 * live-verified as one real assembly). No confirmed group exceeds 2.
 * SW-010B's fleet sweep found a second, distinct false-positive pattern
 * the membership ceiling in `swapGroupResolver.ts` doesn't catch:
 * hull-IDENTITY tags (e.g. `ANVL_Hornet_F7A`, `RSI_Perseus`) reused as
 * the "relevant" tag for many structurally unrelated ports on the same
 * ship (armor + engine + six different thrusters, all under one tag) —
 * small enough in raw member count to clear the plausibility ceiling,
 * but not a real per-port swap-group signal. Unlike the membership
 * ceiling, this is NOT a data error (the tag co-membership is real) —
 * it's genuinely ambiguous provenance, so it routes to Category C
 * (Review Required) rather than being rejected or silently accepted.
 * Grounded in the one real proven precedent (2), applied uniformly to
 * any hull/tag, not tuned to exclude any specific one.
 */
export const MAX_CONFIRMED_PORT_SPAN_PER_HULL = 2

/**
 * Classifies one resolved `ConfigurableSlot` into A/B/C/D. An
 * `unresolved` slot (no swap-group tag found at all — the overwhelming
 * majority of ordinary, non-configurable ports) is never classified —
 * a slot with no swap group is not a discovery, it's the baseline, and
 * `category`/`rejectionReason` are both `null` for it.
 *
 * `portSpanForThisGroupOnThisHull` is the number of distinct port names
 * on THIS ship that resolved to the SAME `slot.swapGroupId` — the
 * caller (which has the whole ship's topology in hand) computes this,
 * since a single slot in isolation cannot know its own group's span.
 */
export function classifySlot(slot: ConfigurableSlot, portSpanForThisGroupOnThisHull: number): SlotClassification {
  if (slot.confidence === 'unresolved') return { category: null, rejectionReason: null }

  const noiseMember = slot.eligibleComponents.find(isNonPlayerVariantName)
  if (noiseMember) {
    return { category: 'D-rejected', rejectionReason: `Eligible set includes "${noiseMember}", which matches the established non-player-variant name taxonomy (AI/mission/test/wreck spawn markers) — not a real installable alternative.` }
  }

  if (slot.swapGroupId && CONFIRMED_SWAP_GROUP_IDS.has(slot.swapGroupId)) {
    return { category: 'A-confirmed', rejectionReason: null }
  }

  if (portSpanForThisGroupOnThisHull > MAX_CONFIRMED_PORT_SPAN_PER_HULL) {
    return {
      category: 'C-review-required',
      rejectionReason: `Tag "${slot.swapGroupId}" is the resolved swap group for ${portSpanForThisGroupOnThisHull} distinct ports on this hull — exceeds the largest confirmed real precedent (${MAX_CONFIRMED_PORT_SPAN_PER_HULL}, the MOTH turret+launcher pair). Likely a hull-identity tag reused across unrelated port roles, not a per-port swap family — needs human review, not auto-acceptance.`,
    }
  }

  const ambiguous = slot.diagnostics.some((d) => d.code === 'swap-group-shared-across-slots')
  if (slot.eligibleComponents.length > 1 && !ambiguous) {
    return { category: 'B-newly-discovered', rejectionReason: null }
  }

  return { category: 'C-review-required', rejectionReason: null }
}

/** Computes, for one ship's already-merged topology, how many distinct
 * port names each swapGroupId spans — the input `classifySlot` needs.
 * Pure, ship-scoped, no I/O. */
export function computePortSpansPerGroup(configurableSlots: ConfigurableSlot[]): Map<string, number> {
  const portsPerGroup = new Map<string, Set<string>>()
  for (const slot of configurableSlots) {
    if (!slot.swapGroupId) continue
    if (!portsPerGroup.has(slot.swapGroupId)) portsPerGroup.set(slot.swapGroupId, new Set())
    portsPerGroup.get(slot.swapGroupId)!.add(slot.portName)
  }
  const spans = new Map<string, number>()
  for (const [swapGroupId, ports] of portsPerGroup) spans.set(swapGroupId, ports.size)
  return spans
}
