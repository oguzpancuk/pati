/**
 * The animal badge ladder (P7 item 3). Pure TypeScript like badges.ts —
 * the web client imports it through the `@mobile/animalBadges` alias, so
 * the Turkish wording exists once. The server sends every key with the
 * tier on record, the live count and the thresholds (`badgeLadder` on the
 * profile); this file words it and picks the chips the header shows.
 */
import { TIER_LABELS, TIER_ORDER, type BadgeSymbolName, type BadgeTier } from './badges';

export interface AnimalBadgeStep {
  key: string;
  label: string;
  unit: string;
  symbol: BadgeSymbolName;
  /** The tier on record, permanent; null below bronze. */
  tier: BadgeTier | null;
  /** The live count — may sit below the tier's threshold after unfollows/unlikes. */
  value: number;
  nextThreshold: number | null;
  thresholds: Record<BadgeTier, number>;
}

/** The chips the header shows: highest tier first, then the server's key order. */
export function headerBadges<T extends { tier: BadgeTier }>(badges: T[], count = 2): T[] {
  return badges
    .map((badge, index) => ({ badge, index }))
    .sort(
      (a, b) =>
        TIER_ORDER.indexOf(b.badge.tier) - TIER_ORDER.indexOf(a.badge.tier) || a.index - b.index
    )
    .slice(0, count)
    .map((entry) => entry.badge);
}

/**
 * The optimistic follow toggle moves the ladder's `followed` count with
 * the follower count, so a ladder opened right after the tap agrees with
 * the header; the server's profile replaces both on the next load.
 */
export function bumpLadderValue(
  ladder: AnimalBadgeStep[],
  key: string,
  delta: number
): AnimalBadgeStep[] {
  return ladder.map((step) =>
    step.key === key ? { ...step, value: Math.max(0, step.value + delta) } : step
  );
}

/** The server's count replaces the optimistic one once the toggle answers. */
export function setLadderValue(
  ladder: AnimalBadgeStep[],
  key: string,
  value: number
): AnimalBadgeStep[] {
  return ladder.map((step) => (step.key === key ? { ...step, value } : step));
}

/** "Gümüş" for an earned step; below bronze, that it is not earned yet. */
export function stepTierText(step: AnimalBadgeStep): string {
  return step.tier ? TIER_LABELS[step.tier] : 'henüz kazanılmadı';
}

/** "3 / 5 takipçi", or "120 takipçi · en üst kademe" at diamond. */
export function stepProgressText(step: AnimalBadgeStep): string {
  if (step.nextThreshold === null) return `${step.value} ${step.unit} · en üst kademe`;
  return `${step.value} / ${step.nextThreshold} ${step.unit}`;
}

/** "Gümüş kademesine 2 takipçi kaldı" — how far the next tier is; null at diamond. */
export function stepNextText(step: AnimalBadgeStep): string | null {
  if (step.nextThreshold === null) return null;
  const nextTier = TIER_ORDER[step.tier ? TIER_ORDER.indexOf(step.tier) + 1 : 0];
  const remaining = Math.max(0, step.nextThreshold - step.value);
  return `${TIER_LABELS[nextTier]} kademesine ${remaining} ${step.unit} kaldı`;
}

/** "Bronz 1 · Gümüş 5 · Altın 20 · Elmas 100 takipçi": the whole ladder. */
export function stepLadderText(step: AnimalBadgeStep): string {
  return `${TIER_ORDER.map((t) => `${TIER_LABELS[t]} ${step.thresholds[t]}`).join(' · ')} ${
    step.unit
  }`;
}
