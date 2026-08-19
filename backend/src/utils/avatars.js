/**
 * Built-in cartoon avatars.
 *
 * ## Why they live in the `avatar_url` column
 * A user's picture is **one of two things**: an uploaded photo or a chosen
 * built-in avatar. Both answer the same question ("what do we draw for this
 * person") and can't both be valid at once — a tagged union, not two columns.
 *
 * So built-in avatars are written into the same column with a prefix:
 *
 *     avatar_url = 'https://.../uploads/123.jpg'   → uploaded photo
 *     avatar_url = 'pati-avatar:f3'                → built-in avatar
 *     avatar_url = NULL                            → initials
 *
 * This way none of the dozens of queries returning user pictures (comments,
 * friends, leaderboard, carers…) had to change. The single rule in return:
 * **never put `avatar_url` straight into `<img src>`** — check
 * `isAvatarKey()` first (mobile's `ui/Avatar` already does).
 *
 * The images aren't here: the server only knows the valid keys; drawing
 * happens client-side as SVG (mobile/src/avatars.ts).
 */

const AVATAR_PREFIX = 'pati-avatar:';

/** 10 female + 10 male. Keys are permanent: f3 is always the same face. */
const AVATAR_KEYS = [
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'm1',
  'm2',
  'm3',
  'm4',
  'm5',
  'm6',
  'm7',
  'm8',
  'm9',
  'm10',
];

const AVATAR_KEY_SET = new Set(AVATAR_KEYS);

function isAvatarKey(value) {
  return typeof value === 'string' && value.startsWith(AVATAR_PREFIX);
}

/** Returns the `pati-avatar:f3` form when valid, null otherwise. */
function avatarValueFor(key) {
  if (typeof key !== 'string') return null;
  const clean = key.trim();
  if (!AVATAR_KEY_SET.has(clean)) return null;
  return `${AVATAR_PREFIX}${clean}`;
}

module.exports = { AVATAR_PREFIX, AVATAR_KEYS, isAvatarKey, avatarValueFor };
