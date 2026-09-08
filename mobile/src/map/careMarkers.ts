/**
 * The care marker: a food bowl or a water drop inside a green ring that
 * empties clockwise as the record's window runs out (owner idea,
 * 2026-09-08 — "a ring that depletes, like a reversed loading spinner").
 * The ring is screen-constant, not geographic: the 100 m coverage radius
 * still drives the status/notification logic, the map just stops painting
 * it. Both types wear the same green; the glyph tells them apart.
 *
 * MapLibre cannot draw a partial arc, so the ring is quantised into
 * RING_STEPS images per type and theme. Mobile pre-renders them with
 * scripts/generate-care-markers.mjs (→ ./markers/), web rasterises the SVG
 * at runtime into map.addImage; both pick the image with the same key.
 *
 * Like geo.ts this file is imported by web through the `@mobile` alias and
 * compiled without mobile's node_modules — no imports, not even type-only
 * ones. The glyph paths duplicate components/brand/Icon (food, water) and
 * the colors duplicate theme/colors.ts: change one, change the other.
 */

export type CareType = 'food' | 'water';
export type CareTheme = 'light' | 'dark';

export const CARE_TYPES: CareType[] = ['food', 'water'];
export const CARE_THEMES: CareTheme[] = ['light', 'dark'];

/** Ring resolution: 10 % per step. Steps run 1..RING_STEPS (a listed record
 * is always inside its window, so an empty ring never appears). */
export const RING_STEPS = 10;

/** Image size in points / CSS pixels. The ring needs breathing room around
 * the disc, hence larger than the 36 pt animal avatar. */
export const CARE_MARKER_SIZE = 44;

/** Icons shrink toward country zoom so a city's records read as a
 * scattering rather than a green blob. Linear between these two stops. */
export const CARE_MARKER_ZOOM_SMALL = 11;
export const CARE_MARKER_SCALE_SMALL = 0.5;
export const CARE_MARKER_ZOOM_FULL = 15;

/** The Icon component's food/water paths (24-unit viewBox, stroked). */
export const CARE_GLYPH_PATHS: Record<CareType, string[]> = {
  food: [
    'M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z',
    'M7.5 8.5c0-1.4 1-1.9 1-2.9M12 8.5c0-1.4 1-1.9 1-2.9M16.5 8.5c0-1.4 1-1.9 1-2.9',
  ],
  water: ['M12 3.4s6.2 6.5 6.2 10.2a6.2 6.2 0 0 1-12.4 0C5.8 9.9 12 3.4 12 3.4Z'],
};

// theme/colors.ts: success / surface / borderStrong per theme.
const MARKER_COLORS: Record<CareTheme, { ring: string; disc: string; edge: string }> = {
  light: { ring: '#34A853', disc: '#FFFFFF', edge: '#F3E4D4' },
  dark: { ring: '#4CC46B', disc: '#161412', edge: '#363028' },
};

/**
 * The server's `weight` (1 = just dropped, 0 = window over) as a ring step.
 * Ceil, so a record keeps its last sliver until the server drops it.
 */
export function ringStep(weight: number): number {
  const w = Number.isFinite(weight) ? Math.min(Math.max(weight, 0), 1) : 0;
  return Math.max(1, Math.min(RING_STEPS, Math.ceil(w * RING_STEPS)));
}

/** The image key both clients use in the symbol layer's icon-image. */
export function careMarkerKey(type: CareType, step: number, theme: CareTheme): string {
  return `care-${type}-${step}-${theme}`;
}

export interface CareMarkerVariant {
  key: string;
  type: CareType;
  step: number;
  theme: CareTheme;
}

/** Every image the map may ask for: 2 types × RING_STEPS × 2 themes. */
export function careMarkerVariants(): CareMarkerVariant[] {
  const variants: CareMarkerVariant[] = [];
  for (const theme of CARE_THEMES) {
    for (const type of CARE_TYPES) {
      for (let step = 1; step <= RING_STEPS; step += 1) {
        variants.push({ key: careMarkerKey(type, step, theme), type, step, theme });
      }
    }
  }
  return variants;
}

const RING_RADIUS = 19;
const RING_WIDTH = 3;
const DISC_RADIUS = 15;
const GLYPH_SCALE = 0.8;

/**
 * The marker as a plain SVG string (CARE_MARKER_SIZE square, transparent
 * ground). The ring's remaining share starts at 12 o'clock and runs
 * clockwise; the faint full ring behind it is the track.
 */
export function careMarkerSvg(type: CareType, step: number, theme: CareTheme): string {
  const c = MARKER_COLORS[theme];
  const size = CARE_MARKER_SIZE;
  const mid = size / 2;
  const share = Math.min(Math.max(step, 0), RING_STEPS) / RING_STEPS;

  let remaining: string;
  if (share >= 1) {
    remaining = `<circle cx="${mid}" cy="${mid}" r="${RING_RADIUS}" fill="none" stroke="${c.ring}" stroke-width="${RING_WIDTH}"/>`;
  } else if (share <= 0) {
    remaining = '';
  } else {
    const angle = share * 2 * Math.PI;
    const endX = (mid + RING_RADIUS * Math.sin(angle)).toFixed(3);
    const endY = (mid - RING_RADIUS * Math.cos(angle)).toFixed(3);
    const largeArc = share > 0.5 ? 1 : 0;
    remaining = `<path d="M${mid} ${
      mid - RING_RADIUS
    }A${RING_RADIUS} ${RING_RADIUS} 0 ${largeArc} 1 ${endX} ${endY}" fill="none" stroke="${
      c.ring
    }" stroke-width="${RING_WIDTH}" stroke-linecap="round"/>`;
  }

  const glyphOffset = mid - 12 * GLYPH_SCALE;
  const glyph = CARE_GLYPH_PATHS[type].map((d) => `<path d="${d}"/>`).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${mid}" cy="${mid}" r="${RING_RADIUS}" fill="none" stroke="${c.ring}" stroke-opacity="0.22" stroke-width="${RING_WIDTH}"/>` +
    remaining +
    `<circle cx="${mid}" cy="${mid}" r="${DISC_RADIUS}" fill="${c.disc}" stroke="${c.edge}" stroke-width="1"/>` +
    `<g transform="translate(${glyphOffset} ${glyphOffset}) scale(${GLYPH_SCALE})" fill="none" stroke="${c.ring}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>` +
    '</svg>'
  );
}
