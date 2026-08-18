/**
 * Hazır insan avatarlarının web kopyası. Kaynak çizim
 * `mobile/src/components/avatars/CartoonAvatar.tsx` — path'ler oradan birebir
 * taşındı; anahtar listesi `backend/src/utils/avatars.js` ile aynı.
 *
 * Üçüncü bir kopya olduğunun farkındayız: admin ayrı bir web uygulaması ve
 * react-native-svg bileşenlerini kullanamıyor. Yüzler değişirse üç dosya da
 * birlikte güncellenmeli (bkz. docs/NOTLAR.md).
 */

type Variant = {
  bg: string;
  skin: string;
  hair: string;
  style: string;
  shirt: string;
  glasses?: boolean;
  beard?: boolean;
  moustache?: boolean;
  earrings?: boolean;
  freckles?: boolean;
};

const SKIN = { light: '#F5D6BE', medium: '#E8BE9A', tan: '#D2A077', deep: '#A9714B' };
const HAIR = {
  black: '#2B2620',
  darkBrown: '#4A342A',
  brown: '#6E4B32',
  chestnut: '#8C5A3C',
  blond: '#C9954A',
  grey: '#9A9A96',
  auburn: '#7A3B2E',
};
const BG = {
  peach: '#FCE3D6',
  mint: '#D7EEE2',
  sky: '#D9E8F5',
  lilac: '#E5DDF2',
  sand: '#F3E7C9',
};
const SHIRT = {
  brand: '#F47A4A',
  teal: '#3E8E8A',
  navy: '#41597A',
  plum: '#7A4A6B',
  olive: '#6E7A45',
};

/* prettier-ignore */
const VARIANTS: Record<string, Variant> = {
  f1: { bg: BG.peach, skin: SKIN.light, hair: HAIR.darkBrown, style: 'long', shirt: SHIRT.teal, earrings: true },
  f2: { bg: BG.mint, skin: SKIN.medium, hair: HAIR.black, style: 'bun', shirt: SHIRT.brand },
  f3: { bg: BG.sky, skin: SKIN.tan, hair: HAIR.black, style: 'ponytail', shirt: SHIRT.navy, freckles: true },
  f4: { bg: BG.lilac, skin: SKIN.light, hair: HAIR.blond, style: 'curly', shirt: SHIRT.plum, glasses: true },
  f5: { bg: BG.sand, skin: SKIN.medium, hair: HAIR.chestnut, style: 'bob', shirt: SHIRT.olive },
  f6: { bg: BG.peach, skin: SKIN.deep, hair: HAIR.black, style: 'afro', shirt: SHIRT.teal, earrings: true },
  f7: { bg: BG.mint, skin: SKIN.tan, hair: HAIR.brown, style: 'braids', shirt: SHIRT.navy },
  f8: { bg: BG.sky, skin: SKIN.light, hair: HAIR.auburn, style: 'headscarf', shirt: SHIRT.plum },
  f9: { bg: BG.lilac, skin: SKIN.medium, hair: HAIR.grey, style: 'short', shirt: SHIRT.brand, glasses: true },
  f10: { bg: BG.sand, skin: SKIN.deep, hair: HAIR.darkBrown, style: 'long', shirt: SHIRT.olive, glasses: true },
  m1: { bg: BG.sky, skin: SKIN.light, hair: HAIR.darkBrown, style: 'short', shirt: SHIRT.navy },
  m2: { bg: BG.peach, skin: SKIN.medium, hair: HAIR.black, style: 'buzz', shirt: SHIRT.brand, beard: true },
  m3: { bg: BG.mint, skin: SKIN.tan, hair: HAIR.black, style: 'quiff', shirt: SHIRT.teal, moustache: true },
  m4: { bg: BG.sand, skin: SKIN.light, hair: HAIR.blond, style: 'sidePart', shirt: SHIRT.olive, glasses: true },
  m5: { bg: BG.lilac, skin: SKIN.deep, hair: HAIR.black, style: 'curly', shirt: SHIRT.plum },
  m6: { bg: BG.sky, skin: SKIN.medium, hair: HAIR.grey, style: 'bald', shirt: SHIRT.navy, moustache: true, glasses: true },
  m7: { bg: BG.peach, skin: SKIN.tan, hair: HAIR.brown, style: 'beanie', shirt: SHIRT.brand, beard: true },
  m8: { bg: BG.mint, skin: SKIN.light, hair: HAIR.auburn, style: 'short', shirt: SHIRT.teal, freckles: true },
  m9: { bg: BG.sand, skin: SKIN.deep, hair: HAIR.black, style: 'buzz', shirt: SHIRT.olive },
  m10: { bg: BG.lilac, skin: SKIN.medium, hair: HAIR.darkBrown, style: 'sidePart', shirt: SHIRT.plum, beard: true },
};

function backHair(style: string, hair: string, fabric: string): string {
  switch (style) {
    case 'long':
      return `<path d="M15 30c0-11 7.6-17 17-17s17 6 17 17v18H15z" fill="${hair}"/>`;
    case 'bob':
      return `<path d="M16 30c0-10 7-16 16-16s16 6 16 16v10H16z" fill="${hair}"/>`;
    case 'afro':
      return `<circle cx="32" cy="26" r="20" fill="${hair}"/>`;
    case 'ponytail':
      return `<path d="M46 22c5 2 6.5 8 5 14s-5 8-7 7 1-4 1.6-8-1.6-8-2.6-10z" fill="${hair}"/><circle cx="47" cy="22" r="4" fill="${hair}"/>`;
    case 'braids':
      return `<rect x="13" y="26" width="6" height="20" rx="3" fill="${hair}"/><rect x="45" y="26" width="6" height="20" rx="3" fill="${hair}"/>`;
    case 'bun':
      return `<circle cx="32" cy="9" r="6.5" fill="${hair}"/>`;
    case 'headscarf':
      return `<path d="M13 32c0-12 8.6-19 19-19s19 7 19 19v20H13z" fill="${fabric}"/>`;
    default:
      return '';
  }
}

function frontHair(style: string, hair: string, fabric: string): string {
  switch (style) {
    case 'bald':
      return '';
    case 'buzz':
      return `<path d="M18.6 27c0-8.4 6-13.4 13.4-13.4S45.4 18.6 45.4 27c-2-5.6-6.6-8.6-13.4-8.6S20.6 21.4 18.6 27Z" fill="${hair}"/>`;
    case 'short':
      return `<path d="M17.6 28c0-9.6 6.4-15 14.4-15s14.4 5.4 14.4 15c-2.6-6.4-7.4-8.8-14.4-8.8S20.2 21.6 17.6 28Z" fill="${hair}"/>`;
    case 'quiff':
      return `<path d="M17.6 29c0-10.4 6.6-16.4 14.4-16.4 4.6 0 8.4 2 10.8 5.6 1.6 2.4-.4 4-2.4 2.6-3.4-2.4-8.4-2.4-12.4.6-3.6 2.6-6.6 4.6-10.4 7.6Z" fill="${hair}"/>`;
    case 'sidePart':
      return `<path d="M17.6 28c0-9.6 6.4-15 14.4-15s14.4 5.4 14.4 15c-1.4-5.4-4.6-8-9-9-4.4-1-9.6.6-12.8 3.6-2.8 2.6-5 4.6-7 5.4Z" fill="${hair}"/>`;
    case 'curly':
      return `<g fill="${hair}"><circle cx="21" cy="22" r="5.4"/><circle cx="27" cy="17.4" r="6"/><circle cx="34.5" cy="16.6" r="6.2"/><circle cx="41.5" cy="20.4" r="5.6"/><circle cx="44.5" cy="26" r="4.4"/><circle cx="18.5" cy="27" r="4.4"/></g>`;
    case 'afro':
      return '';
    case 'beanie':
      return `<circle cx="32" cy="7.5" r="3.6" fill="${fabric}"/><path d="M17.4 24c0-9 6.6-14.6 14.6-14.6S46.6 15 46.6 24z" fill="${fabric}"/><rect x="16" y="21.6" width="32" height="5" rx="2.5" fill="${fabric}"/><rect x="16" y="21.6" width="32" height="5" rx="2.5" fill="#00000026"/>`;
    case 'headscarf':
      return `<path fill-rule="evenodd" d="M32 10c16 0 19 12 19 22s-5 18-19 18-19-8-19-18 3-22 19-22Z M32 20c10 0 13 6 13 13 0 8-6 13-13 13s-13-5-13-13c0-7 3-13 13-13Z" fill="${fabric}"/><circle cx="15.5" cy="41" r="3.4" fill="${fabric}"/>`;
    case 'bun':
    case 'ponytail':
    case 'braids':
      return `<path d="M17.6 27.5c0-9.6 6.4-15 14.4-15s14.4 5.4 14.4 15c-2.6-6.6-7.4-9.2-14.4-9.2s-11.8 2.6-14.4 9.2Z" fill="${hair}"/>`;
    case 'long':
    case 'bob':
      return `<path d="M16.6 28.5c0-10.4 6.8-16 15.4-16s15.4 5.6 15.4 16c-2.8-7-8-9.8-15.4-9.8s-12.6 2.8-15.4 9.8Z" fill="${hair}"/>`;
    default:
      return '';
  }
}

const AVATAR_PREFIX = 'pati-avatar:';
let clipCounter = 0;

/** `pati-avatar:f3` biçimindeki değer için SVG işaretlemesi; tanınmazsa null. */
export function patiAvatarSvg(avatarUrl: string | null, size = 34): string | null {
  if (!avatarUrl || !avatarUrl.startsWith(AVATAR_PREFIX)) return null;
  const v = VARIANTS[avatarUrl.slice(AVATAR_PREFIX.length)];
  if (!v) return null;

  const id = `pati-admin-clip-${(clipCounter += 1)}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" role="img">
  <defs><clipPath id="${id}"><circle cx="32" cy="32" r="32"/></clipPath></defs>
  <g clip-path="url(#${id})">
    <rect width="64" height="64" fill="${v.bg}"/>
    ${backHair(v.style, v.hair, v.shirt)}
    <rect x="27.5" y="38" width="9" height="12" rx="4.5" fill="${v.skin}"/>
    <path d="M10 64c0-9.4 9.8-15 22-15s22 5.6 22 15z" fill="${v.shirt}"/>
    <circle cx="16" cy="32" r="3" fill="${v.skin}"/>
    <circle cx="48" cy="32" r="3" fill="${v.skin}"/>
    ${v.earrings ? `<circle cx="16" cy="35.5" r="1.6" fill="${v.shirt}"/><circle cx="48" cy="35.5" r="1.6" fill="${v.shirt}"/>` : ''}
    <ellipse cx="32" cy="29" rx="14.5" ry="16.5" fill="${v.skin}"/>
    ${v.freckles ? `<g fill="#00000022"><circle cx="24.5" cy="33" r="0.9"/><circle cx="27.5" cy="34.5" r="0.9"/><circle cx="39.5" cy="33" r="0.9"/><circle cx="36.5" cy="34.5" r="0.9"/></g>` : ''}
    <g stroke="#3A2E27" stroke-width="1.5" stroke-linecap="round" fill="none">
      <path d="M22.5 24.5c1.6-1.2 3.8-1.2 5.4 0"/>
      <path d="M36.1 24.5c1.6-1.2 3.8-1.2 5.4 0"/>
      <path d="M31 31.5v3.2"/>
      <path d="M28 38.6c2.4 2 5.6 2 8 0"/>
    </g>
    <circle cx="25.6" cy="29" r="1.9" fill="#3A2E27"/>
    <circle cx="38.4" cy="29" r="1.9" fill="#3A2E27"/>
    ${v.moustache ? `<path d="M27 36.4c2.4-1.6 7.6-1.6 10 0" stroke="${v.hair}" stroke-width="2.6" stroke-linecap="round" fill="none"/>` : ''}
    ${v.beard ? `<path d="M18.4 31c0 9.4 6 15.6 13.6 15.6S45.6 40.4 45.6 31c0 6-3 8.2-6 9.2-2.4.8-4.6.9-7.6.9s-5.2-.1-7.6-.9c-3-1-6-3.2-6-9.2Z" fill="${v.hair}"/>` : ''}
    ${frontHair(v.style, v.hair, v.shirt)}
    ${v.glasses ? `<g stroke="#3A2E27" stroke-width="1.4" fill="none"><circle cx="25.6" cy="29" r="4.6"/><circle cx="38.4" cy="29" r="4.6"/><path d="M30.2 29h3.6"/><path d="M21 28.2 17.6 27M43 28.2l3.4-1.2"/></g>` : ''}
  </g>
</svg>`;
}
