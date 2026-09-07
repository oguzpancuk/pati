import {
  alertLocationPermission,
  ensureLocationPermission,
  LocationPermissionError,
} from './location';

/**
 * The one way into the add-animal form (owner decision, 2026-09-07): the
 * location permission is asked the moment the button is tapped, and
 * without it the form does not open — a record without a location is not
 * a record, so there is nothing to fill in yet. The undetermined state
 * gets the native prompt right here; a denial gets the Settings alert.
 * Any other failure (GPS off, a timeout) lets the form open — the save
 * step retries the fix and handles it.
 */
let inFlight = false;

export async function openAddAnimal(navigation: { navigate: (screen: 'AddAnimal') => void }) {
  // A second tap while the sheet is up must not queue a second prompt or
  // a second navigation.
  if (inFlight) return;
  inFlight = true;
  try {
    await ensureLocationPermission();
  } catch (err) {
    if (err instanceof LocationPermissionError) {
      alertLocationPermission();
      return;
    }
  } finally {
    inFlight = false;
  }
  navigation.navigate('AddAnimal');
}
