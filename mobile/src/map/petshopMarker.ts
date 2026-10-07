/**
 * The petshop marker (owner, 2026-10-07: petshops appear on the map): an
 * orange pin with a white storefront, so a shop never reads as a care record
 * (round, green ring) or an animal (an avatar in a white disc). It points at
 * its spot from above — the icon is anchored at the pin's tip.
 *
 * Like careMarkers.ts, mobile pre-renders it with
 * scripts/generate-care-markers.mjs (→ ./markers/) and web rasterises the
 * SVG at runtime; both use the same image key. Imported by web through the
 * `@mobile` alias without mobile's node_modules — no imports here.
 * The colors duplicate theme/colors.ts (`brand`, `surface`); the glyph
 * paths are mirrored in components/brand/Icon (shop, phone, clock, link):
 * change one, change the other.
 */

export type PetshopTheme = 'light' | 'dark';

export const PETSHOP_THEMES: PetshopTheme[] = ['light', 'dark'];

/** The pin's box in points / CSS pixels; the tip is the bottom centre. */
export const PETSHOP_MARKER_WIDTH = 34;
export const PETSHOP_MARKER_HEIGHT = 42;

/**
 * Shops show from city scale on. Below it a nationwide map would be a
 * scatter of orange pins over the care markers, and nobody picks a shop
 * from a country view. Shared by both clients, and the fetch waits for it
 * too, so a world view does not ask for every listing.
 */
export const PETSHOP_MIN_ZOOM = 11;

/** Stroked 24-unit paths, same style as the Icon set. */
export const PETSHOP_GLYPH_PATHS = {
  // Icon's `pin`, its dot written as a path.
  address: [
    'M12 21c0 0 7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z',
    'M12 7.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z',
  ],
  shop: [
    'M4.2 9.6 5.6 4.4h12.8l1.4 5.2',
    'M4.2 9.6a1.95 1.95 0 0 0 3.9 0 1.95 1.95 0 0 0 3.9 0 1.95 1.95 0 0 0 3.9 0 1.95 1.95 0 0 0 3.9 0',
    'M5.6 11.6v8h12.8v-8',
    'M10.2 19.6v-4.4h3.6v4.4',
  ],
  phone: [
    'M8.6 4.2 6 4.6c-.9.2-1.6 1-1.5 2 .6 6.9 6 12.3 12.9 12.9 1 .1 1.8-.6 2-1.5l.4-2.6-3.7-1.6-1.8 2a11 11 0 0 1-4.1-4.1l2-1.8-1.6-3.7Z',
  ],
  clock: ['M12 4.4a7.6 7.6 0 1 0 0 15.2 7.6 7.6 0 0 0 0-15.2Z', 'M12 8v4.2l2.8 1.8'],
  link: [
    'M10.4 13.6a3.6 3.6 0 0 0 5.1 0l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1 1',
    'M13.6 10.4a3.6 3.6 0 0 0-5.1 0L5.9 13a3.6 3.6 0 0 0 5.1 5.1l1-1',
  ],
} as const;

const PIN_COLORS: Record<PetshopTheme, { pin: string; edge: string; glyph: string }> = {
  light: { pin: '#E05E2B', edge: '#FFFFFF', glyph: '#FFFFFF' },
  dark: { pin: '#F9824E', edge: '#161412', glyph: '#FFFFFF' },
};

/** The image key both clients use in the symbol layer's icon-image. */
export function petshopMarkerKey(theme: PetshopTheme): string {
  return `petshop-${theme}`;
}

const GLYPH_SCALE = 0.72;

/** The marker as a plain SVG string (transparent ground). */
export function petshopMarkerSvg(theme: PetshopTheme): string {
  const c = PIN_COLORS[theme];
  const w = PETSHOP_MARKER_WIDTH;
  const h = PETSHOP_MARKER_HEIGHT;
  const mid = w / 2;
  // A round head of radius 15 centred 17 from the top, narrowing to the tip
  // at the bottom edge.
  const r = 15;
  const cy = 17;
  const pin =
    `M${mid} ${h - 1.5}` +
    `C${mid - 3} ${h - 7} ${mid - r} ${cy + 9} ${mid - r} ${cy}` +
    `A${r} ${r} 0 1 1 ${mid + r} ${cy}` +
    `C${mid + r} ${cy + 9} ${mid + 3} ${h - 7} ${mid} ${h - 1.5}Z`;
  const offset = 12 * GLYPH_SCALE;
  const glyph = PETSHOP_GLYPH_PATHS.shop.map((d) => `<path d="${d}"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<path d="${pin}" fill="${c.pin}" stroke="${c.edge}" stroke-width="2" stroke-linejoin="round"/>` +
    `<g transform="translate(${mid - offset} ${
      cy - offset
    }) scale(${GLYPH_SCALE})" fill="none" stroke="${
      c.glyph
    }" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>` +
    '</svg>'
  );
}

/** A `tel:` link for a listed phone: its digits, and a leading plus if any. */
export function telHref(phone: string): string {
  const plus = phone.trim().startsWith('+') ? '+' : '';
  return `tel:${plus}${phone.replace(/\D/g, '')}`;
}

/**
 * The link as the card prints it: no scheme, no `www.`, no trailing slash
 * ("instagram.com/modapet"). The tap still opens the full address.
 */
export function linkLabel(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}
