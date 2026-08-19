/**
 * pati logosunun web (düz SVG) üreticisi: dört parmak yastığı + içinde kalp
 * olan harita-pini ana yastık. Kaynak çizim `mobile/src/components/brand/Logo.tsx`
 * — yol değişirse iki dosya birlikte güncellenmeli (uygulama ikonu da aynı
 * yollardan üretiliyor: `mobile/scripts/generate-icons.mjs`).
 */
export function logoSvg(size = 64, color = '#F47A4A', accent = '#FFF3E7'): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">` +
    `<g fill="${color}">` +
    '<ellipse cx="16" cy="42" rx="9" ry="12" transform="rotate(-22 16 42)"/>' +
    '<ellipse cx="37" cy="26" rx="9.5" ry="13" transform="rotate(-8 37 26)"/>' +
    '<ellipse cx="63" cy="26" rx="9.5" ry="13" transform="rotate(8 63 26)"/>' +
    '<ellipse cx="84" cy="42" rx="9" ry="12" transform="rotate(22 84 42)"/>' +
    '</g>' +
    `<path d="M50 97 C40 81 29 75 29 66 A21 21 0 1 1 71 66 C71 75 60 81 50 97 Z" fill="${color}"/>` +
    `<path d="M50 73 C50 73 38.5 65.5 38.5 58.6 C38.5 54.4 41.6 51.6 45.2 51.6 C47.5 51.6 49.2 52.9 50 54.2 C50.8 52.9 52.5 51.6 54.8 51.6 C58.4 51.6 61.5 54.4 61.5 58.6 C61.5 65.5 50 73 50 73 Z" fill="${accent}"/>` +
    '</svg>'
  );
}
