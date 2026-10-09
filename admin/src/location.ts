// The location fields of the admin forms (petshops, targeted ads): what an
// admin pastes, read back as a point. Shared so both forms take the same
// inputs, Google Maps links included.

/**
 * "40.9875, 29.027", "40.9875 29.027" or a Google Maps address. A place
 * link carries the place itself as "!3d40.9875!4d29.027"; its
 * "@40.98,29.02," is only the camera, shifted to make room for the side
 * panel, so it is the fallback (review finding). Null when nothing like a
 * coordinate pair is there; the server checks the ranges.
 */
export function parseLocation(text: string): { lat: number; lng: number } | null {
  const place = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const camera = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const pair =
    place ?? camera ?? text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!pair) return null;
  return { lat: Number(pair[1]), lng: Number(pair[2]) };
}
