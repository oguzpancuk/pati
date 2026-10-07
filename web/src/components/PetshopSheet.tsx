import { linkLabel, PETSHOP_GLYPH_PATHS, telHref } from '@mobile/map/petshopMarker';
import type { Petshop } from '../api';

type Glyph = keyof typeof PETSHOP_GLYPH_PATHS;

function GlyphIcon({ name, size = 20 }: { name: Glyph; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PETSHOP_GLYPH_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * A tapped petshop pin's card (mobile's PetshopSheet): the listing's name and
 * whichever of address, phone, hours and link the admin entered. The phone
 * row dials, the link row opens the shop's page in a new tab.
 */
export function PetshopSheet({ shop, onClose }: { shop: Petshop; onClose: () => void }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="sheet petshop-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={shop.name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="petshop-head">
          <span className="chooser-icon">
            <GlyphIcon name="shop" size={22} />
          </span>
          <div className="grow">
            <div className="petshop-kind">petshop</div>
            <h2>{shop.name}</h2>
          </div>
        </div>

        {shop.address && (
          <div className="petshop-row">
            <span className="petshop-row-icon">
              <GlyphIcon name="address" />
            </span>
            <span className="petshop-row-text">{shop.address}</span>
          </div>
        )}
        {shop.opening_hours && (
          <div className="petshop-row">
            <span className="petshop-row-icon">
              <GlyphIcon name="clock" />
            </span>
            <span className="petshop-row-text">{shop.opening_hours}</span>
          </div>
        )}
        {shop.phone && (
          <a className="petshop-row action" href={telHref(shop.phone)}>
            <span className="petshop-row-icon">
              <GlyphIcon name="phone" />
            </span>
            <span className="petshop-row-text">{shop.phone}</span>
            <span className="petshop-row-cta">Ara</span>
          </a>
        )}
        {shop.website_url && (
          <a
            className="petshop-row action"
            href={shop.website_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="petshop-row-icon">
              <GlyphIcon name="link" />
            </span>
            <span className="petshop-row-text">{linkLabel(shop.website_url)}</span>
            <span className="petshop-row-cta">Aç</span>
          </a>
        )}

        <button className="btn ghost full" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}
