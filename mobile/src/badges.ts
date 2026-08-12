import type { BadgeTier, UserBadges } from './api/users';

export const BADGE_LABELS: Record<keyof UserBadges, Record<BadgeTier, string>> = {
  feeder: {
    bronze: 'Bronz Besleyici',
    silver: 'Gümüş Besleyici',
    gold: 'Altın Besleyici',
    diamond: 'Elmas Besleyici',
  },
  water: {
    bronze: 'Bronz Sucu',
    silver: 'Gümüş Sucu',
    gold: 'Altın Sucu',
    diamond: 'Elmas Sucu',
  },
  registrar: {
    bronze: 'Bronz Kaydedici',
    silver: 'Gümüş Kaydedici',
    gold: 'Altın Kaydedici',
    diamond: 'Elmas Kaydedici',
  },
};

export const CATEGORY_LABELS: Record<keyof UserBadges, string> = {
  feeder: 'Mama',
  water: 'Su',
  registrar: 'Hayvan Kaydetme',
};

export const TIER_EMOJI: Record<BadgeTier, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  diamond: '💎',
};

export const NEXT_TIER_THRESHOLD: Record<BadgeTier | 'none', number> = {
  none: 1,
  bronze: 7,
  silver: 30,
  gold: 365,
  diamond: Infinity,
};

export const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'diamond'];

export const TIER_REQUIREMENT_DAYS: Record<BadgeTier, number> = {
  bronze: 1,
  silver: 7,
  gold: 30,
  diamond: 365,
};

const CATEGORY_ACTIONS: Record<keyof UserBadges, string> = {
  feeder: 'mama bıraktığınızda',
  water: 'su bıraktığınızda',
  registrar: 'yeni bir hayvan kaydettiğinizde',
};

export function tierDescription(category: keyof UserBadges, tier: BadgeTier): string {
  const days = TIER_REQUIREMENT_DAYS[tier];
  const action = CATEGORY_ACTIONS[category];
  if (days === 1) {
    return `İlk kez ${action} kazanılır.`;
  }
  return `${days} gün üst üste ${action} kazanılır.`;
}

export const BADGE_CATEGORIES: (keyof UserBadges)[] = ['feeder', 'water', 'registrar'];
