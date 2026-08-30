/**
 * The badge vocabulary and helpers. This file is deliberately **pure
 * TypeScript**: no import reaching react-native or axios, because the web
 * client (`web/`) uses it directly via the `@mobile/badges` alias. That's
 * why the types are defined here; `api/users.ts` and `components/badges`
 * import from here.
 */
import { CAT_PATTERNS, DOG_PATTERNS } from './taxonomy';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

/** The symbol at the medallion's center; arrives from the server as `badge.symbol`. */
export type BadgeSymbolName =
  | 'food'
  | 'water'
  | 'register'
  | 'comment'
  | 'health'
  | 'vaccine'
  | 'paw';

// Badges are derived on the server; the client keeps no fixed list, so a
// new badge type requires no mobile change.
export interface Badge {
  key: string;
  label: string;
  unit: string;
  value: number;
  tier: BadgeTier | null;
  points: number;
  nextThreshold: number | null;
  symbol: BadgeSymbolName;
}

export const TIER_LABELS: Record<BadgeTier, string> = {
  bronze: 'Bronz',
  silver: 'Gümüş',
  gold: 'Altın',
  diamond: 'Elmas',
};

export const TIER_POINTS: Record<BadgeTier, number> = {
  bronze: 10,
  silver: 25,
  gold: 60,
  diamond: 150,
};

export const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'diamond'];

/**
 * Per-tier thresholds, mirrored from `backend/src/utils/badges.js` for
 * DISPLAY ONLY (the tier ladder in the badge catalog). Awarding always
 * happens server-side; if the backend values change, change these with them.
 */
export const STREAK_THRESHOLDS: Record<BadgeTier, number> = {
  bronze: 1,
  silver: 7,
  gold: 30,
  diamond: 365,
};
export const COUNT_THRESHOLDS: Record<BadgeTier, number> = {
  bronze: 1,
  silver: 5,
  gold: 20,
  diamond: 100,
};
export const COMMENT_THRESHOLDS: Record<BadgeTier, number> = {
  bronze: 1,
  silver: 10,
  gold: 50,
  diamond: 200,
};

/** Threshold table for a badge key (same mapping the backend applies). */
export function thresholdsFor(key: string): Record<BadgeTier, number> {
  const [group, name] = key.split(':');
  if (group === 'streak') return STREAK_THRESHOLDS;
  if (name === 'commenter') return COMMENT_THRESHOLDS;
  return COUNT_THRESHOLDS;
}

/**
 * One-line tier ladder for the catalog: every reachable tier with its
 * threshold, e.g. "Bronz 1 · Gümüş 7 · Altın 30 · Elmas 365 gün".
 */
export function tierLadderText(badge: Badge): string {
  const thresholds = thresholdsFor(badge.key);
  return `${TIER_ORDER.map((t) => `${TIER_LABELS[t]} ${thresholds[t]}`).join(' · ')} ${badge.unit}`;
}

/**
 * The full obtainable-badge catalog. The server only sends breed ("<Pattern>
 * Dostu") badges the user has started on, so browsing what exists needs the
 * missing ones synthesized client-side as locked zero-progress entries.
 * Display only — awarding stays on the server. Labels/keys mirror the
 * backend's `breedBadgeLabel` / `breed:` key format; free-text patterns earn
 * no badge there, so only listed patterns appear here.
 */
export function withCatalogPlaceholders(badges: Badge[]): Badge[] {
  const known = new Set(badges.map((b) => b.key));
  const placeholders: Badge[] = [...CAT_PATTERNS, ...DOG_PATTERNS]
    .filter((pattern) => !known.has(`breed:${pattern}`))
    .map((pattern) => ({
      key: `breed:${pattern}`,
      label: `${pattern} Dostu`,
      unit: 'hayvan',
      value: 0,
      tier: null,
      points: 0,
      nextThreshold: COUNT_THRESHOLDS.bronze,
      symbol: 'paw',
    }));
  return [...badges, ...placeholders];
}

// A badge's full name gains meaning with its tier: "Altın Tekir Dostu" (gold).
export function badgeTitle(badge: Badge): string {
  return badge.tier ? `${TIER_LABELS[badge.tier]} ${badge.label}` : badge.label;
}

/**
 * Symbol name from a badge key. The badge list already carries `symbol`;
 * this helper exists only for places that don't — the earned-badge moment
 * (`user_badge_awards`) is stored server-side without the symbol, since the
 * symbol is already implied by the badge type.
 */
export function symbolForKey(key: string): BadgeSymbolName {
  const [group, name] = key.split(':');
  if (group === 'breed') return 'paw';
  if (group === 'streak') {
    if (name === 'feeder') return 'food';
    if (name === 'water') return 'water';
    return 'register';
  }
  if (name === 'commenter') return 'comment';
  if (name === 'vaccinator') return 'vaccine';
  return 'health';
}

export type BadgeGroup = 'streak' | 'breed' | 'count';

export function badgeGroup(badge: Badge): BadgeGroup {
  const prefix = badge.key.split(':')[0];
  if (prefix === 'breed') return 'breed';
  if (prefix === 'streak') return 'streak';
  return 'count';
}

export const GROUP_LABELS: Record<BadgeGroup, string> = {
  streak: 'Süreklilik',
  breed: 'Desen Dostlukları',
  count: 'Katkı',
};

export const GROUP_DESCRIPTIONS: Record<BadgeGroup, string> = {
  streak: 'Üst üste kaç gün aksiyon aldığınıza göre kazanılır.',
  breed: 'Aynı tür/desenden kaç hayvan kaydettiğinize göre kazanılır.',
  count: 'Toplam katkı adedinize göre kazanılır.',
};

export function badgeProgressText(badge: Badge): string {
  if (badge.nextThreshold === null) {
    return `${badge.value} ${badge.unit} · en üst seviye`;
  }
  return `${badge.value} / ${badge.nextThreshold} ${badge.unit}`;
}

export function sortBadges(badges: Badge[]): Badge[] {
  // Earned first, then higher tier, then more progress.
  return [...badges].sort((a, b) => {
    const aTier = a.tier ? TIER_ORDER.indexOf(a.tier) : -1;
    const bTier = b.tier ? TIER_ORDER.indexOf(b.tier) : -1;
    if (aTier !== bTier) return bTier - aTier;
    return b.value - a.value;
  });
}
