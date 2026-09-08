import {
  distanceBetween,
  metersPerPixel,
  offsetMeters,
  segmentFeature,
} from '../src/map/geo';

// The fan and the shoulder rule are pixel rules turned into meters by
// these helpers; a wrong constant here would scale every stack.
describe('metersPerPixel', () => {
  it('is the Web Mercator ground resolution for 512 px tiles', () => {
    // 40 075 km / 512 px at zoom 0 on the equator.
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.517, 2);
    expect(metersPerPixel(1, 0)).toBeCloseTo(78271.517 / 2, 2);
    // Kadıköy at street zoom: about 22 cm per pixel.
    expect(metersPerPixel(18, 41)).toBeCloseTo(0.2254, 3);
  });
});

describe('offsetMeters / distanceBetween', () => {
  const kadikoy = { lat: 40.9905, lng: 29.0277 };

  it('moves a point by the requested meters, east and north', () => {
    const east = offsetMeters(kadikoy, 100, 0);
    const north = offsetMeters(kadikoy, 0, 100);
    expect(distanceBetween(kadikoy, east)).toBeCloseTo(100, 0);
    expect(distanceBetween(kadikoy, north)).toBeCloseTo(100, 0);
    expect(east.lat).toBeCloseTo(kadikoy.lat, 9);
    expect(north.lng).toBeCloseTo(kadikoy.lng, 9);
    expect(east.lng).toBeGreaterThan(kadikoy.lng);
    expect(north.lat).toBeGreaterThan(kadikoy.lat);
  });

  it('distance is symmetric and zero on the same point', () => {
    const b = { lat: 41.0, lng: 29.03 };
    expect(distanceBetween(kadikoy, kadikoy)).toBe(0);
    expect(distanceBetween(kadikoy, b)).toBeCloseTo(distanceBetween(b, kadikoy), 6);
  });
});

describe('segmentFeature', () => {
  it('is a two-point LineString from → to in [lng, lat] order', () => {
    const f = segmentFeature({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { id: 7 });
    expect(f.geometry.type).toBe('LineString');
    expect(f.geometry.coordinates).toEqual([
      [2, 1],
      [4, 3],
    ]);
    expect(f.properties).toEqual({ id: 7 });
  });
});
