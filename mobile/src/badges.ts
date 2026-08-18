/**
 * Rozet sözlüğü ve yardımcıları. Bu dosya bilerek **saf TypeScript**: react-native
 * ya da axios'a uzanan hiçbir import yok, çünkü web istemcisi (`web/`) bunu
 * `@mobile/badges` alias'ıyla doğrudan kullanıyor. Tipler bu yüzden burada
 * tanımlı; `api/users.ts` ve `components/badges` buradan alıyor.
 */
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

/** Madalyonun ortasındaki sembol; sunucudan `badge.symbol` olarak geliyor. */
export type BadgeSymbolName =
  | 'food'
  | 'water'
  | 'register'
  | 'comment'
  | 'health'
  | 'vaccine'
  | 'paw';

// Rozetler sunucuda türetiliyor; istemci sabit bir liste tutmuyor ki yeni bir
// rozet türü eklendiğinde mobil tarafta değişiklik gerekmesin.
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

// Rozetin tam adı kademesiyle birlikte anlam kazanıyor: "Altın Tekir Dostu".
export function badgeTitle(badge: Badge): string {
  return badge.tier ? `${TIER_LABELS[badge.tier]} ${badge.label}` : badge.label;
}

/**
 * Rozet anahtarından sembol adı. Rozet listesi `symbol` alanını zaten
 * taşıyor; bu yardımcı yalnızca onu taşımayan yerler için gerekiyor —
 * kazanılan rozetin anı (`user_badge_awards`) sunucuda kaydedilirken sembol
 * saklanmıyor, çünkü sembol rozetin türünden zaten belli.
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
  // Kazanılanlar önce, sonra kademesi yüksek olan, sonra ilerlemesi çok olan.
  return [...badges].sort((a, b) => {
    const aTier = a.tier ? TIER_ORDER.indexOf(a.tier) : -1;
    const bTier = b.tier ? TIER_ORDER.indexOf(b.tier) : -1;
    if (aTier !== bTier) return bTier - aTier;
    return b.value - a.value;
  });
}
