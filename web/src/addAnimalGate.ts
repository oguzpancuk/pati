import { describeLocationError, getCurrentLocation } from './location';

/**
 * The one way into the add-animal form (owner decision, 2026-09-07, mobile
 * parity): the browser's location prompt fires the moment the button is
 * clicked, and without a location the form does not open — the record
 * has nowhere to land. Returns the reason to show when it refuses.
 */
export async function gateAddAnimal(navigate: (path: string) => void): Promise<string | null> {
  try {
    await getCurrentLocation();
  } catch (err) {
    return `${describeLocationError(err)} Konum olmadan hayvan eklenemez.`;
  }
  navigate('/hayvanlar/yeni');
  return null;
}
