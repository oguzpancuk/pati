/**
 * Automatic fan-out of stacked map items (owner decision, 2026-09-08 —
 * P7 item 9): whenever care records and/or animal avatars would overlap
 * on screen they spread on a circle around their common spot, with a
 * spoke back to it, and the user's location dot stays put underneath.
 * No tap involved; the layout is recomputed for the current zoom.
 *
 * Pure geometry, no imports (web reads it through `@mobile`, like geo.ts):
 * the clients feed items with geographic positions, get displaced
 * positions back, and draw them however they draw (symbol layer, marker
 * views, DOM markers).
 */

type LatLng = { lat: number; lng: number };

export interface StackItem {
  /** Unique across kinds — the clients prefix (`care-12`, `animal-3`). */
  id: string;
  at: LatLng;
}

export interface PlacedItem extends StackItem {
  /** Where to draw it: the spot itself when alone, a fan seat when stacked. */
  drawAt: LatLng;
  /** The stack's spot when displaced (spoke origin), null when alone. */
  spot: LatLng | null;
}

/** Two items closer than this on screen are one stack. */
export const STACK_PICK_PX = 34;
/** Seat radius of the fan around the stack's spot. */
export const STACK_FAN_PX = 44;
/** An anchor (the user dot) closer than this joins a stack without moving. */
export const STACK_ANCHOR_PX = 24;
/** Minimum arc distance between two seats of one fan. */
export const STACK_SEAT_PX = 40;

const EARTH_RADIUS_M = 6371000;

function metersPerPixel(zoom: number, latitude: number): number {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom + 1);
}

function toPixels(p: LatLng, origin: LatLng, mpp: number): { x: number; y: number } {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x = (toRad(p.lng - origin.lng) * EARTH_RADIUS_M * Math.cos(toRad(origin.lat))) / mpp;
  const y = -(toRad(p.lat - origin.lat) * EARTH_RADIUS_M) / mpp;
  return { x, y };
}

function fromPixels(px: { x: number; y: number }, origin: LatLng, mpp: number): LatLng {
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat = origin.lat + toDeg((-px.y * mpp) / EARTH_RADIUS_M);
  const lng =
    origin.lng + toDeg((px.x * mpp) / (EARTH_RADIUS_M * Math.cos((origin.lat * Math.PI) / 180)));
  return { lat, lng };
}

/**
 * Groups items into stacks (single-link: anything within STACK_PICK_PX of
 * a member joins) and seats the members of every stack of two or more on
 * a circle around the stack's centroid, starting at 12 o'clock and going
 * clockwise. Anchors (the user dot) pull a nearby stack's centroid to
 * themselves so the fan surrounds the dot instead of sitting on it, but
 * are never moved and never returned.
 */
export function layoutStacks(
  items: StackItem[],
  zoom: number,
  anchors: LatLng[] = []
): PlacedItem[] {
  if (items.length === 0) return [];
  const origin = items[0].at;
  const mpp = metersPerPixel(zoom, origin.lat);
  const px = items.map((item) => toPixels(item.at, origin, mpp));

  // Union-find over pairwise screen distance.
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const dx = px[i].x - px[j].x;
      const dy = px[i].y - px[j].y;
      if (dx * dx + dy * dy <= STACK_PICK_PX * STACK_PICK_PX) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  items.forEach((_, i) => {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  });

  const anchorPx = anchors.map((a) => toPixels(a, origin, mpp));
  const placed: PlacedItem[] = items.map((item) => ({ ...item, drawAt: item.at, spot: null }));
  for (const members of groups.values()) {
    if (members.length < 2) {
      // A lone item still steps aside from the user dot it would cover.
      const i = members[0];
      const anchor = anchorPx.find(
        (a) => Math.hypot(a.x - px[i].x, a.y - px[i].y) <= STACK_ANCHOR_PX
      );
      if (anchor) {
        placed[i] = {
          ...items[i],
          drawAt: fromPixels({ x: anchor.x, y: anchor.y - STACK_FAN_PX }, origin, mpp),
          spot: fromPixels(anchor, origin, mpp),
        };
      }
      continue;
    }
    let cx = members.reduce((s, i) => s + px[i].x, 0) / members.length;
    let cy = members.reduce((s, i) => s + px[i].y, 0) / members.length;
    const anchor = anchorPx.find((a) => Math.hypot(a.x - cx, a.y - cy) <= STACK_ANCHOR_PX);
    if (anchor) {
      cx = anchor.x;
      cy = anchor.y;
    }
    const spot = fromPixels({ x: cx, y: cy }, origin, mpp);
    // Seats stay STACK_SEAT_PX apart along the circle: a big stack gets a
    // wider ring instead of members overlapping again.
    const radius = Math.max(STACK_FAN_PX, (members.length * STACK_SEAT_PX) / (2 * Math.PI));
    // Stable seating: by id, so a refetch does not shuffle the fan.
    const ordered = [...members].sort((a, b) => (items[a].id < items[b].id ? -1 : 1));
    ordered.forEach((i, seat) => {
      const angle = -Math.PI / 2 + (seat / ordered.length) * 2 * Math.PI;
      placed[i] = {
        ...items[i],
        drawAt: fromPixels(
          { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) },
          origin,
          mpp
        ),
        spot,
      };
    });
  }
  return placed;
}
