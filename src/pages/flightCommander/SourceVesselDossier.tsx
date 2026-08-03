import { Link } from 'react-router-dom'
import type { ShipDefinition } from '../../types'
import type { TargetIntelligenceSourceShip } from '../../utils/factoryLoadoutTargetIntelligence'
import { CANONICAL_STABLE_CATEGORY_KEYS, CANONICAL_COMPONENT_CATEGORY_LABEL, CANONICAL_COMPONENT_CATEGORY_ICON } from '../../utils/componentCategoryIcon'
import { describeComponentIdentity } from '../../utils/flightCommanderComponentIdentity'
import { resolveShipImage } from '../../utils/resolveShipImage'
import ShipImage from '../../components/ShipImage'
import QuartermasterGlyphFrame from './QuartermasterGlyphFrame'

/**
 * EWO-108 (Part G/H/J) — a compact tactical dossier for one source vessel,
 * replacing the certified EWO-104 table row. Reading order is fixed per
 * Part G: Source Vessel -> Useful Factory Equipment -> Required By
 * Commander Fleet. No new intelligence computation lives here — every
 * value is read straight off the resolver's/presentation layer's own
 * output (`TargetIntelligenceSourceShip`) or the static `ShipDefinition`
 * catalog (identity metadata only: image, manufacturer, classification).
 *
 * Part H — image authority: `resolveShipImage` is called with the
 * `ShipDefinition`'s own `id`/`imageUrl`/`image` fields only.
 * `ShipDefinition` ("Catalog/game data describing a ship model. Never
 * implies ownership.") structurally cannot carry a Commander's per-owned-
 * instance custom photo — that lives exclusively on the separate `Ship`/
 * `FleetAsset` types, never touched here — so a custom Commander image
 * cannot leak into generic NPC source-vessel intelligence by construction,
 * not by convention.
 */
export default function SourceVesselDossier({ ship, definition }: { ship: TargetIntelligenceSourceShip; definition: ShipDefinition | undefined }) {
  const imageSrc = definition ? resolveShipImage({ id: definition.id, imageUrl: definition.imageUrl, image: definition.image }) : undefined

  return (
    <div className="bg-black/25 border border-white/10 rounded-md p-3" data-testid={`dossier-${ship.shipDefinitionId}`}>
      {/* Source Vessel identity row. EWO-108 (Part O) — `flex-wrap` lets
          the category-glyph strip drop to its own line at narrow widths
          instead of forcing horizontal overflow (confirmed via live
          390px-viewport measurement); at `sm:` and up it stays a single
          row, unchanged from the desktop-first design intent. */}
      <div className="flex flex-wrap items-center gap-3">
        <ShipImage
          src={imageSrc}
          image={definition?.image}
          alt={ship.displayName}
          className="w-12 h-12 shrink-0 rounded-sm overflow-hidden border border-white/10 relative"
          overlay={false}
        />
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-semibold leading-tight truncate">{ship.displayName}</p>
          {/* Part G.3/G.4 — manufacturer and role only when the canonical
              ShipDefinition already carries them; `role` is the plain
              display-string field (distinct from the structured
              `classification.rsiRoles[]`, which has no single canonical
              short label to show here without inventing one). */}
          {(definition?.manufacturer || definition?.role) && (
            <p className="text-[11px] text-muted/80 leading-tight truncate">{[definition?.manufacturer, definition?.role].filter(Boolean).join(' • ')}</p>
          )}
        </div>
        {/* Compact category-match indicators. EWO-108 (Part O) — no fixed
            offset here: when this wraps to its own line at narrow widths
            it simply starts at the card's own left edge, which measured
            safer against horizontal overflow than trying to visually
            align it under the name column with a fixed margin. */}
        <div className="flex gap-1 shrink-0">
          {CANONICAL_STABLE_CATEGORY_KEYS.map((key) => (
            <QuartermasterGlyphFrame
              key={key}
              Icon={CANONICAL_COMPONENT_CATEGORY_ICON[key]}
              label={CANONICAL_COMPONENT_CATEGORY_LABEL[key]}
              matched={ship.categoriesPresent.includes(key)}
              size="sm"
            />
          ))}
        </div>
      </div>

      {/* Useful Factory Equipment -> Required By Commander Fleet. */}
      <div className="mt-2.5 pl-[60px] space-y-2">
        {ship.matches.map((m) => {
          const identity = describeComponentIdentity(m.componentName, m.componentEntityClass, m.category)
          return (
            <div key={`${m.componentEntityClass ?? ''}-${m.componentName}`}>
              <p className="text-white text-xs font-semibold leading-tight">{m.componentName}</p>
              {identity && <p className="text-[10.5px] text-muted/75 leading-tight">{identity}</p>}
              {m.affected.map((a) => (
                <p key={`${a.shipId}-${a.buildId}`} className="text-[11px] text-muted/90 leading-tight">
                  <span className="text-cyan/70">Needed:</span>{' '}
                  <Link to={a.deepLink.path} className="text-cyan hover:text-cyan/80">
                    {a.shipName}
                  </Link>{' '}
                  &bull; {a.buildName} &times;{a.quantity}
                </p>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
