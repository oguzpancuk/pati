import {
  bumpLadderValue,
  headerBadges,
  setLadderValue,
  stepLadderText,
  stepNextText,
  stepProgressText,
  stepTierText,
  type AnimalBadgeStep,
} from './animalBadges';
import { COUNT_THRESHOLDS } from './badges';

const step = (over: Partial<AnimalBadgeStep>): AnimalBadgeStep => ({
  key: 'followed',
  label: 'Mahallenin Yıldızı',
  unit: 'takipçi',
  symbol: 'paw',
  tier: 'bronze',
  value: 3,
  nextThreshold: 5,
  thresholds: COUNT_THRESHOLDS,
  ...over,
});

describe('animal badge ladder wording', () => {
  test('the header shows the two highest tiers, ties in the server order', () => {
    const chips = headerBadges([
      { key: 'matched', tier: 'bronze' as const },
      { key: 'liked', tier: 'silver' as const },
      { key: 'followed', tier: 'bronze' as const },
      { key: 'cared', tier: 'gold' as const },
    ]);
    expect(chips.map((c) => c.key)).toEqual(['cared', 'liked']);
    expect(headerBadges([{ key: 'a', tier: 'bronze' as const }]).length).toBe(1);
  });

  test('progress and the distance to the next tier', () => {
    expect(stepProgressText(step({}))).toBe('3 / 5 takipçi');
    expect(stepNextText(step({}))).toBe('Gümüş kademesine 2 takipçi kaldı');
    expect(stepTierText(step({}))).toBe('Bronz');
  });

  test('an unearned step points at bronze', () => {
    const s = step({ tier: null, value: 0, nextThreshold: 1 });
    expect(stepTierText(s)).toBe('henüz kazanılmadı');
    expect(stepNextText(s)).toBe('Bronz kademesine 1 takipçi kaldı');
  });

  test('a diamond step has no next tier; a dropped count never goes negative', () => {
    const top = step({ tier: 'diamond', value: 140, nextThreshold: null });
    expect(stepProgressText(top)).toBe('140 takipçi · en üst kademe');
    expect(stepNextText(top)).toBeNull();
    expect(stepNextText(step({ tier: 'bronze', value: 9, nextThreshold: 5 }))).toBe(
      'Gümüş kademesine 0 takipçi kaldı'
    );
  });

  test('the optimistic bump moves one key and never below zero', () => {
    const ladder = [step({}), step({ key: 'cared', unit: 'bakıcı', value: 0 })];
    expect(bumpLadderValue(ladder, 'followed', 1).map((s) => s.value)).toEqual([4, 0]);
    expect(bumpLadderValue(ladder, 'cared', -1).map((s) => s.value)).toEqual([3, 0]);
    expect(setLadderValue(ladder, 'followed', 9).map((s) => s.value)).toEqual([9, 0]);
  });

  test('the ladder line lists every threshold with the unit', () => {
    expect(stepLadderText(step({}))).toBe('Bronz 1 · Gümüş 5 · Altın 20 · Elmas 100 takipçi');
  });
});
