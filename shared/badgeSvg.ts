/**
 * Rozet madalyonu ve seviye ambleminin web (düz SVG) üreticileri.
 *
 * Kaynak çizimler `mobile/src/components/badges/{BadgeSymbol,LevelMark}.tsx`
 * — glyph ya da geometri değişirse iki taraf birlikte güncellenmeli. Kademe
 * renkleri `mobile/src/theme/colors.ts` → `tierColors` ile birebir aynı.
 */

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';
export type BadgeSymbolName =
  | 'food'
  | 'water'
  | 'register'
  | 'comment'
  | 'health'
  | 'vaccine'
  | 'paw';

export const TIER_COLORS: Record<BadgeTier | 'locked', { ring: string; fill: string; ink: string }> = {
  bronze: { ring: '#B87333', fill: '#F0D6BC', ink: '#7A4A1E' },
  silver: { ring: '#9AA5B1', fill: '#E6EAEF', ink: '#59636D' },
  gold: { ring: '#D9A520', fill: '#FBEEC4', ink: '#8A6408' },
  diamond: { ring: '#4FB0C6', fill: '#D9F1F7', ink: '#1F6B7D' },
  locked: { ring: '#C4C9CF', fill: '#EFF1F3', ink: '#8B9198' },
};

// 24 birimlik kutuda, ince çizgi, yuvarlak uç — brand/Icon ile aynı dil.
const GLYPHS: Record<BadgeSymbolName, (ink: string) => string> = {
  food: () =>
    '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z"/>' +
    '<path d="M7.5 8.5c0-1.4 1-1.9 1-2.9M12 8.5c0-1.4 1-1.9 1-2.9M16.5 8.5c0-1.4 1-1.9 1-2.9"/>',
  water: () => '<path d="M12 3.4s6.2 6.5 6.2 10.2a6.2 6.2 0 0 1-12.4 0C5.8 9.9 12 3.4 12 3.4Z"/>',
  register: () =>
    '<path d="M12 21s6.4-6 6.4-10.4a6.4 6.4 0 1 0-12.8 0C5.6 15 12 21 12 21Z"/>' +
    '<path d="M12 7.6v5.4M9.3 10.3h5.4"/>',
  comment: () =>
    '<path d="M20.2 11.8a7.6 7.6 0 0 1-11.2 6.7L4 20l1.6-4.5a7.6 7.6 0 1 1 14.6-3.7Z"/>',
  health: () =>
    '<path d="M12 4 5.2 6.8v4.6c0 4.1 2.9 6.8 6.8 7.6 3.9-.8 6.8-3.5 6.8-7.6V6.8L12 4Z"/>' +
    '<path d="M12 9v5M9.5 11.5h5"/>',
  vaccine: () =>
    '<path d="M8.4 15.6 15.6 8.4l4 4-7.2 7.2z"/>' +
    '<path d="m10.4 17.6-4 4"/>' +
    '<path d="m17.6 10.4 3.4-3.4"/>' +
    '<path d="m19.2 5.9 2.9 2.9"/>' +
    '<path d="m11.6 12.4 1.8 1.8"/>',
  paw: (ink) =>
    `<g fill="${ink}" stroke="none">` +
    '<circle cx="6.4" cy="10.6" r="2.1"/><circle cx="9.9" cy="7.2" r="2.2"/>' +
    '<circle cx="14.1" cy="7.2" r="2.2"/><circle cx="17.6" cy="10.6" r="2.1"/>' +
    '<path d="M12 12.2c2.6 0 5 2.1 5 4.5 0 1.8-1.4 2.9-3 2.9-.9 0-1.4-.4-2-.4s-1.1.4-2 .4c-1.6 0-3-1.1-3-2.9 0-2.4 2.4-4.5 5-4.5Z"/>' +
    '</g>',
};

/** Rozet madalyonu: dış halka + iç disk + ortada sembol. tier null → gri (kilitli). */
export function badgeSymbolSvg(symbol: BadgeSymbolName, tier: BadgeTier | null, size = 44): string {
  const p = TIER_COLORS[tier ?? 'locked'];
  const glyph = (GLYPHS[symbol] ?? GLYPHS.paw)(p.ink);
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">` +
    `<circle cx="24" cy="24" r="22" fill="${p.ring}"/>` +
    `<circle cx="24" cy="24" r="17.5" fill="${p.fill}"/>` +
    `<g transform="translate(12 12)" stroke="${p.ink}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none">${glyph}</g>` +
    '</svg>'
  );
}

/**
 * Seviye amblemi: yaprak sayısı `3 + seviye` olan rozet + ortada marka dolgulu
 * disk + rakam. Rakam SVG içinde `<text>` — sayfanın yazı tipini alsın diye
 * font-family inherit.
 */
export function levelMarkSvg(
  level: number,
  size = 44,
  colors: { brand: string; brandTint: string; textOnBrand: string } = {
    brand: '#F47A4A',
    brandTint: '#FFF0E7',
    textOnBrand: '#FFFFFF',
  }
): string {
  const petals = 3 + Math.max(1, level);
  const steps = petals * 2;
  const pts: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 23 : 18.5;
    pts.push(`${(24 + r * Math.cos(angle)).toFixed(2)},${(24 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">` +
    `<polygon points="${pts.join(' ')}" fill="${colors.brandTint}"/>` +
    `<circle cx="24" cy="24" r="16" fill="${colors.brand}"/>` +
    `<text x="24" y="24" text-anchor="middle" dominant-baseline="central" font-family="inherit" font-weight="800" font-size="19" fill="${colors.textOnBrand}">${level}</text>` +
    '</svg>'
  );
}
