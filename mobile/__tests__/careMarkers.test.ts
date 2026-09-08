import {
  careMarkerKey,
  careMarkerSvg,
  careMarkerVariants,
  RING_STEPS,
  ringStep,
} from '../src/map/careMarkers';

describe('ringStep', () => {
  it('maps the server weight onto 1..RING_STEPS, rounding up', () => {
    expect(ringStep(1)).toBe(RING_STEPS);
    expect(ringStep(0.95)).toBe(RING_STEPS);
    expect(ringStep(0.5)).toBe(5);
    expect(ringStep(0.41)).toBe(5);
    expect(ringStep(0.4)).toBe(4);
    expect(ringStep(0.01)).toBe(1);
  });

  it('never shows an empty ring for a listed record', () => {
    expect(ringStep(0)).toBe(1);
    expect(ringStep(-1)).toBe(1);
    expect(ringStep(NaN)).toBe(1);
    expect(ringStep(2)).toBe(RING_STEPS);
  });
});

describe('careMarkerSvg', () => {
  it('draws a full ring for the last step and an arc for the others', () => {
    const full = careMarkerSvg('food', RING_STEPS, 'light');
    expect(full).not.toContain('<path d="M22 3A');
    // The track, the remaining ring and the disc are three circles.
    expect(full.match(/<circle /g)).toHaveLength(3);

    const half = careMarkerSvg('water', 5, 'dark');
    // At exactly half the arc ends at 6 o'clock with the small-arc flag.
    expect(half).toContain('A19 19 0 0 1 22.000 41.000');
    const mostly = careMarkerSvg('water', 8, 'dark');
    expect(mostly).toContain('A19 19 0 1 1');
  });

  it('carries the type glyph and the theme colors', () => {
    expect(careMarkerSvg('food', 3, 'light')).toContain('M3.5 11.5h17');
    expect(careMarkerSvg('water', 3, 'light')).toContain('M12 3.4s6.2');
    expect(careMarkerSvg('food', 3, 'light')).toContain('#34A853');
    expect(careMarkerSvg('food', 3, 'dark')).toContain('#4CC46B');
  });
});

describe('careMarkerVariants', () => {
  it('lists every type × step × theme once, keyed like the layer expression', () => {
    const variants = careMarkerVariants();
    expect(variants).toHaveLength(2 * RING_STEPS * 2);
    expect(new Set(variants.map((v) => v.key)).size).toBe(variants.length);
    expect(variants.map((v) => v.key)).toContain(careMarkerKey('water', 7, 'dark'));
    expect(careMarkerKey('food', 1, 'light')).toBe('care-food-1-light');
  });
});
