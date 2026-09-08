import { distanceBetween, metersPerPixel } from '../src/map/geo';
import {
  layoutStacks,
  STACK_ANCHOR_PX,
  STACK_FAN_PX,
  STACK_PICK_PX,
  STACK_SEAT_PX,
} from '../src/map/stacks';

const spot = { lat: 40.9905, lng: 29.0277 };
const zoom = 18;
const mpp = metersPerPixel(zoom, spot.lat);
const east = (m: number) => ({
  lat: spot.lat,
  lng: spot.lng + (m / (6371000 * Math.cos((spot.lat * Math.PI) / 180))) * (180 / Math.PI),
});

describe('layoutStacks', () => {
  it('leaves items that do not overlap where they are', () => {
    const far = east(STACK_PICK_PX * mpp * 3);
    const placed = layoutStacks(
      [
        { id: 'care-1', at: spot },
        { id: 'animal-1', at: far },
      ],
      zoom
    );
    expect(placed[0].drawAt).toEqual(spot);
    expect(placed[0].spot).toBeNull();
    expect(placed[1].drawAt).toEqual(far);
  });

  it('fans overlapping items around their spot at the seat radius, in id order', () => {
    const near = east(STACK_PICK_PX * mpp * 0.5);
    const placed = layoutStacks(
      [
        { id: 'care-2', at: near },
        { id: 'animal-1', at: spot },
        { id: 'care-1', at: spot },
      ],
      zoom
    );
    for (const p of placed) {
      expect(p.spot).not.toBeNull();
      expect(distanceBetween(p.spot!, p.drawAt)).toBeCloseTo(STACK_FAN_PX * mpp, 0);
    }
    // All three share one spot (the centroid) and sit at distinct seats.
    const seats = placed.map((p) => `${p.drawAt.lat.toFixed(7)},${p.drawAt.lng.toFixed(7)}`);
    expect(new Set(seats).size).toBe(3);
    // Seat 0 (12 o'clock) goes to the smallest id: 'animal-1' sits due north.
    const animal = placed.find((p) => p.id === 'animal-1')!;
    expect(animal.drawAt.lat).toBeGreaterThan(animal.spot!.lat);
    expect(Math.abs(animal.drawAt.lng - animal.spot!.lng)).toBeLessThan(1e-9);
  });

  it('chains: an item near a member of a stack joins the stack', () => {
    const a = spot;
    const b = east(STACK_PICK_PX * mpp * 0.9);
    const c = east(STACK_PICK_PX * mpp * 1.8);
    const placed = layoutStacks(
      [
        { id: 'care-1', at: a },
        { id: 'care-2', at: b },
        { id: 'care-3', at: c },
      ],
      zoom
    );
    expect(placed.every((p) => p.spot !== null)).toBe(true);
  });

  it('centres a stack on the user dot when it sits under it, without moving the dot', () => {
    const near = east(STACK_ANCHOR_PX * mpp * 0.5);
    const placed = layoutStacks(
      [
        { id: 'care-1', at: near },
        { id: 'care-2', at: near },
      ],
      zoom,
      [spot]
    );
    for (const p of placed) {
      expect(distanceBetween(p.spot!, spot)).toBeLessThan(0.01);
      expect(distanceBetween(p.drawAt, spot)).toBeCloseTo(STACK_FAN_PX * mpp, 0);
    }
  });

  it('steps a lone item off the user dot', () => {
    const placed = layoutStacks([{ id: 'care-1', at: spot }], zoom, [spot]);
    expect(placed[0].spot).not.toBeNull();
    expect(placed[0].drawAt.lat).toBeGreaterThan(spot.lat);
    expect(distanceBetween(placed[0].drawAt, spot)).toBeCloseTo(STACK_FAN_PX * mpp, 0);
  });

  it('is zoom-aware: 20 m apart is one stack at zoom 14 and two markers at zoom 18', () => {
    const items = [
      { id: 'care-1', at: spot },
      { id: 'care-2', at: east(20) },
    ];
    expect(layoutStacks(items, 14).every((p) => p.spot !== null)).toBe(true);
    expect(layoutStacks(items, 18).every((p) => p.spot === null)).toBe(true);
  });

  it('widens the ring so the seats of a big stack stay apart', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `care-${i + 10}`, at: spot }));
    const placed = layoutStacks(items, zoom);
    const radius = distanceBetween(placed[0].spot!, placed[0].drawAt) / mpp;
    expect(radius).toBeGreaterThan(STACK_FAN_PX);
    // Neighbouring seats are at least STACK_SEAT_PX apart (chord ≈ arc here).
    const gap = distanceBetween(placed[0].drawAt, placed[1].drawAt) / mpp;
    expect(gap).toBeGreaterThanOrEqual(STACK_SEAT_PX * 0.98);
  });
});
