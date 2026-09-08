import { viewportBounds, WORLD_SPAN_DEG } from '../src/map/viewport';

const WORLD = { minLng: -180, maxLng: 180 };

describe('viewportBounds', () => {
  it('passes a street-scale viewport through unchanged', () => {
    expect(viewportBounds([29.04, 41.0], [29.01, 40.98])).toEqual({
      minLat: 40.98,
      maxLat: 41.0,
      minLng: 29.01,
      maxLng: 29.04,
    });
  });

  it('answers the whole world for a viewport that spans most of the globe', () => {
    const wide = viewportBounds([180, 79], [-159, -67]);
    expect(wide).toMatchObject(WORLD);
    expect(viewportBounds([147, 70], [-107, -60])).toMatchObject(WORLD);
    // Just under the threshold keeps the corners.
    expect(viewportBounds([WORLD_SPAN_DEG - 100.1, 40], [-100, 20])).toMatchObject({
      minLng: -100,
      maxLng: WORLD_SPAN_DEG - 100.1,
    });
  });

  it('answers the whole world for an antimeridian-crossing or unwrapped viewport', () => {
    // MapLibre reports 159…199 for a viewport centred on lng 179.
    expect(viewportBounds([199, 20], [159, 10])).toMatchObject(WORLD);
    expect(viewportBounds([-160, 20], [-220, 10])).toMatchObject(WORLD);
    // east <= west (already wrapped by the engine).
    expect(viewportBounds([-170, 20], [170, 10])).toMatchObject(WORLD);
  });

  it('clamps latitude to the Mercator range and orders the corners', () => {
    const b = viewportBounds([29.04, 91], [29.01, -91]);
    expect(b.maxLat).toBe(85);
    expect(b.minLat).toBe(-85);
    const flipped = viewportBounds([29.04, 40.98], [29.01, 41.0]);
    expect(flipped.minLat).toBeLessThan(flipped.maxLat);
  });

  it('survives a non-finite corner', () => {
    expect(viewportBounds([NaN, 41], [29.01, 40.98])).toMatchObject(WORLD);
  });
});
