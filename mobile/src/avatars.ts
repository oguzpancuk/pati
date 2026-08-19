/**
 * Definition of the built-in cartoon avatars. Shares the key list with
 * `backend/src/utils/avatars.js` — if one changes, so must the other.
 *
 * The key sits in the user's `avatar_url` field as `pati-avatar:f3`; the
 * reason is explained in the server file (a tagged union in one column).
 *
 * The faces are **derived** from a few parameters rather than 20 separate
 * image files: skin, hair color, hairstyle, details like glasses/beard, and
 * a background color. App size doesn't grow, and a new face is one line.
 */

export const AVATAR_PREFIX = 'pati-avatar:';

export type HairStyle =
  | 'long'
  | 'bun'
  | 'ponytail'
  | 'curly'
  | 'bob'
  | 'braids'
  | 'afro'
  | 'headscarf'
  | 'short'
  | 'buzz'
  | 'bald'
  | 'quiff'
  | 'sidePart'
  | 'beanie';

export type AvatarVariant = {
  key: string;
  /** For splitting tabs on the picker screen. The face itself already differs. */
  group: 'female' | 'male';
  bg: string;
  skin: string;
  hair: string;
  style: HairStyle;
  shirt: string;
  glasses?: boolean;
  beard?: boolean;
  moustache?: boolean;
  earrings?: boolean;
  freckles?: boolean;
};

// Skin and hair tones were picked from the range common in Turkey; drawing
// 20 faces with a single skin tone represented no one.
const SKIN = {
  light: '#F5D6BE',
  medium: '#E8BE9A',
  tan: '#D2A077',
  deep: '#A9714B',
};

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

/** 10 women + 10 men. Keys keep pointing at the same face even if the order changes. */
export const AVATAR_VARIANTS: AvatarVariant[] = [
  {
    key: 'f1',
    group: 'female',
    bg: BG.peach,
    skin: SKIN.light,
    hair: HAIR.darkBrown,
    style: 'long',
    shirt: SHIRT.teal,
    earrings: true,
  },
  {
    key: 'f2',
    group: 'female',
    bg: BG.mint,
    skin: SKIN.medium,
    hair: HAIR.black,
    style: 'bun',
    shirt: SHIRT.brand,
  },
  {
    key: 'f3',
    group: 'female',
    bg: BG.sky,
    skin: SKIN.tan,
    hair: HAIR.black,
    style: 'ponytail',
    shirt: SHIRT.navy,
    freckles: true,
  },
  {
    key: 'f4',
    group: 'female',
    bg: BG.lilac,
    skin: SKIN.light,
    hair: HAIR.blond,
    style: 'curly',
    shirt: SHIRT.plum,
    glasses: true,
  },
  {
    key: 'f5',
    group: 'female',
    bg: BG.sand,
    skin: SKIN.medium,
    hair: HAIR.chestnut,
    style: 'bob',
    shirt: SHIRT.olive,
  },
  {
    key: 'f6',
    group: 'female',
    bg: BG.peach,
    skin: SKIN.deep,
    hair: HAIR.black,
    style: 'afro',
    shirt: SHIRT.teal,
    earrings: true,
  },
  {
    key: 'f7',
    group: 'female',
    bg: BG.mint,
    skin: SKIN.tan,
    hair: HAIR.brown,
    style: 'braids',
    shirt: SHIRT.navy,
  },
  {
    key: 'f8',
    group: 'female',
    bg: BG.sky,
    skin: SKIN.light,
    hair: HAIR.auburn,
    style: 'headscarf',
    shirt: SHIRT.plum,
  },
  {
    key: 'f9',
    group: 'female',
    bg: BG.lilac,
    skin: SKIN.medium,
    hair: HAIR.grey,
    style: 'short',
    shirt: SHIRT.brand,
    glasses: true,
  },
  {
    key: 'f10',
    group: 'female',
    bg: BG.sand,
    skin: SKIN.deep,
    hair: HAIR.darkBrown,
    style: 'long',
    shirt: SHIRT.olive,
    glasses: true,
  },

  {
    key: 'm1',
    group: 'male',
    bg: BG.sky,
    skin: SKIN.light,
    hair: HAIR.darkBrown,
    style: 'short',
    shirt: SHIRT.navy,
  },
  {
    key: 'm2',
    group: 'male',
    bg: BG.peach,
    skin: SKIN.medium,
    hair: HAIR.black,
    style: 'buzz',
    shirt: SHIRT.brand,
    beard: true,
  },
  {
    key: 'm3',
    group: 'male',
    bg: BG.mint,
    skin: SKIN.tan,
    hair: HAIR.black,
    style: 'quiff',
    shirt: SHIRT.teal,
    moustache: true,
  },
  {
    key: 'm4',
    group: 'male',
    bg: BG.sand,
    skin: SKIN.light,
    hair: HAIR.blond,
    style: 'sidePart',
    shirt: SHIRT.olive,
    glasses: true,
  },
  {
    key: 'm5',
    group: 'male',
    bg: BG.lilac,
    skin: SKIN.deep,
    hair: HAIR.black,
    style: 'curly',
    shirt: SHIRT.plum,
  },
  {
    key: 'm6',
    group: 'male',
    bg: BG.sky,
    skin: SKIN.medium,
    hair: HAIR.grey,
    style: 'bald',
    shirt: SHIRT.navy,
    moustache: true,
    glasses: true,
  },
  {
    key: 'm7',
    group: 'male',
    bg: BG.peach,
    skin: SKIN.tan,
    hair: HAIR.brown,
    style: 'beanie',
    shirt: SHIRT.brand,
    beard: true,
  },
  {
    key: 'm8',
    group: 'male',
    bg: BG.mint,
    skin: SKIN.light,
    hair: HAIR.auburn,
    style: 'short',
    shirt: SHIRT.teal,
    freckles: true,
  },
  {
    key: 'm9',
    group: 'male',
    bg: BG.sand,
    skin: SKIN.deep,
    hair: HAIR.black,
    style: 'buzz',
    shirt: SHIRT.olive,
  },
  {
    key: 'm10',
    group: 'male',
    bg: BG.lilac,
    skin: SKIN.medium,
    hair: HAIR.darkBrown,
    style: 'sidePart',
    shirt: SHIRT.plum,
    beard: true,
  },
];

const BY_KEY = new Map(AVATAR_VARIANTS.map((v) => [v.key, v]));

/** Does `avatar_url` point at a built-in avatar? */
export function isAvatarKey(value: string | null | undefined): boolean {
  return !!value && value.startsWith(AVATAR_PREFIX);
}

/** `pati-avatar:f3` → the f3 variant. Null for unrecognized keys. */
export function variantFromValue(value: string | null | undefined): AvatarVariant | null {
  if (!isAvatarKey(value)) return null;
  return BY_KEY.get(value!.slice(AVATAR_PREFIX.length)) ?? null;
}
