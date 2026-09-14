import { describeLocationError, getCurrentLocation, isPermissionFailure } from './location';

/**
 * The one way into the add-animal form (owner decision, 2026-09-07, mobile
 * parity): the browser's location prompt fires the moment the button is
 * clicked, and without permission the form does not open — the record has
 * nowhere to land. Like mobile, only a missing permission refuses (denied,
 * an insecure origin, no geolocation at all); a transient failure (no fix
 * yet) lets the form open, and the save step retries.
 */
let inFlight = false;

export async function gateAddAnimal(navigate: (path: string) => void): Promise<string | null> {
  if (inFlight) return null;
  inFlight = true;
  try {
    await getCurrentLocation();
  } catch (err) {
    if (isPermissionFailure(err))
      return `${describeLocationError(err)} Konum olmadan hayvan eklenemez.`;
  } finally {
    inFlight = false;
  }
  navigate('/hayvanlar/yeni');
  return null;
}
