import { viewportBoxes, WORLD_SPAN_DEG } from '../src/map/viewport';

const WORLD = { minLng: -180, maxLng: 180 };

describe('viewportBoxes', () => {
  it('passes a street-scale viewport through as one box', () => {
    expect(viewportBoxes([29.04, 41.0], [29.01, 40.98])).toEqual([
      { minLat: 40.98, maxLat: 41.0, minLng: 29.01, maxLng: 29.04 },
    ]);
  });

  it('answers the whole world only for a viewport that spans most of the globe', () => {
    expect(viewportBoxes([180, 79], [-159, -67])).toEqual([{ minLat: -67, maxLat: 79, ...WORLD }]);
    expect(viewportBoxes([147, 70], [-107, -60])[0]).toMatchObject(WORLD);
    // Just under the threshold keeps the corners.
    const near = viewportBoxes([WORLD_SPAN_DEG - 100.1, 40], [-100, 20]);
    expect(near).toHaveLength(1);
    expect(near[0]).toMatchObject({ minLng: -100, maxLng: WORLD_SPAN_DEG - 100.1 });
  });

  it('splits an antimeridian-crossing viewport into two boxes instead of asking for the world', () => {
    // MapLibre reports 159…199 for a viewport centred on lng 179.
    expect(viewportBoxes([199, 20], [159, 10])).toEqual([
      { minLat: 10, maxLat: 20, minLng: 159, maxLng: 180 },
      { minLat: 10, maxLat: 20, minLng: -180, maxLng: -161 },
    ]);
    // The same viewport reported on the negative side.
    expect(viewportBoxes([-161, 20], [-201, 10])).toEqual([
      { minLat: 10, maxLat: 20, minLng: 159, maxLng: 180 },
      { minLat: 10, maxLat: 20, minLng: -180, maxLng: -161 },
    ]);
  });

  it('clamps latitude to the Mercator range and orders the corners', () => {
    const [b] = viewportBoxes([29.04, 91], [29.01, -91]);
    expect(b.maxLat).toBe(85);
    expect(b.minLat).toBe(-85);
    const [flipped] = viewportBoxes([29.04, 40.98], [29.01, 41.0]);
    expect(flipped.minLat).toBeLessThan(flipped.maxLat);
  });

  it('answers the world for any non-finite corner, latitude included', () => {
    expect(viewportBoxes([NaN, 41], [29.01, 40.98])[0]).toMatchObject(WORLD);
    expect(viewportBoxes([29.04, NaN], [29.01, 40.98])[0]).toMatchObject(WORLD);
    expect(viewportBoxes([29.04, 41], [29.01, Infinity])[0]).toMatchObject(WORLD);
  });
});
