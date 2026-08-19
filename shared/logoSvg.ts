/**
 * The pati logo (studio aesthetic): four toe pads + a map pin with a heart
 * cutout. Geometry taken verbatim from the design handoff
 * (docs/design/studio-aesthetic-handoff.md — viewBox 0 0 120 130).
 *
 * The fill defaults to the vertical orange gradient (#F4581C→#F9A052);
 * pass `color` where a flat color is needed. The heart cutout ALWAYS fills
 * with the background color (`accent`) — a CSS variable works too, e.g.
 * `var(--background)`.
 *
 * Note: the mobile Logo.tsx still has the old geometry; use this file as
 * the reference when mobile moves to the studio aesthetic.
 */
export function logoSvg(size = 64, color?: string, accent = 'var(--background)'): string {
  const height = Math.round((size * 130) / 120);
  const fill = color ?? 'url(#patiLogoGrad)';
  // Multiple logos on one page collide on the <defs> id, but the content is
  // identical so the browser uses the first; the visual result is unchanged.
  const defs = color
    ? ''
    : '<defs><linearGradient id="patiLogoGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#F4581C"/><stop offset="1" stop-color="#F9A052"/>' +
      '</linearGradient></defs>';
  return (
    `<svg width="${size}" height="${height}" viewBox="0 0 120 130" aria-hidden="true">` +
    defs +
    `<g fill="${fill}">` +
    '<ellipse cx="18" cy="47" rx="12.5" ry="16.5" transform="rotate(-24 18 47)"/>' +
    '<ellipse cx="44" cy="25" rx="12.5" ry="17.5" transform="rotate(-9 44 25)"/>' +
    '<ellipse cx="76" cy="25" rx="12.5" ry="17.5" transform="rotate(9 76 25)"/>' +
    '<ellipse cx="102" cy="47" rx="12.5" ry="16.5" transform="rotate(24 102 47)"/>' +
    '<path d="M60 48C76.6 48 90 61.4 90 78c0 18-22 38-30 44-8-6-30-26-30-44 0-16.6 13.4-30 30-30z"/>' +
    '</g>' +
    `<path d="M60 90c-13-9-17-15.5-17-21 0-5.2 3.8-9 8.6-9 3.4 0 6.6 2 8.4 5 1.8-3 5-5 8.4-5 4.8 0 8.6 3.8 8.6 9 0 5.5-4 12-17 21z" fill="${accent}"/>` +
    '</svg>'
  );
}
