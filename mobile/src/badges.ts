import type { Badge, BadgeTier } from './api/users';

export const TIER_EMOJI: Record<BadgeTier, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  diamond: '💎',
};

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

// Rozetin tam adı kademesiyle birlikte anlam kazanıyor: "Altın Tekir Avcısı".
export function badgeTitle(badge: Badge): string {
  return badge.tier ? `${TIER_LABELS[badge.tier]} ${badge.label}` : badge.label;
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
  breed: 'Cins Avcılığı',
  count: 'Katkı',
};

export const GROUP_DESCRIPTIONS: Record<BadgeGroup, string> = {
  streak: 'Üst üste kaç gün aksiyon aldığınıza göre kazanılır.',
  breed: 'Aynı cinsten kaç hayvan kaydettiğinize göre kazanılır.',
  count: 'Toplam katkı adedinize göre kazanılır.',
};

export function badgeProgressText(badge: Badge): string {
  if (badge.nextThreshold === null) {
    return `${badge.value} ${badge.unit} · en üst seviye`;
  }
  return `${badge.value} / ${badge.nextThreshold} ${badge.unit}`;
}

export function sortBadges(badges: Badge[]): Badge[] {
  // Kazanılanlar önce, sonra kademesi yüksek olan, sonra ilerlemesi çok olan.
  return [...badges].sort((a, b) => {
    const aTier = a.tier ? TIER_ORDER.indexOf(a.tier) : -1;
    const bTier = b.tier ? TIER_ORDER.indexOf(b.tier) : -1;
    if (aTier !== bTier) return bTier - aTier;
    return b.value - a.value;
  });
}
