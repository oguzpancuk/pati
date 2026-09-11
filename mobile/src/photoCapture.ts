import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { LIBRARY_PICKER } from './photoPicker';
import type { PhotoAsset } from './api/care';

/**
 * Taking a photo inside the app, in one place (demo item 9).
 *
 * Every capture used to pass `saveToPhotos: false`, so a photo taken for a
 * care record or a new animal existed only inside pati and vanished from
 * the user's own phone. It is now a preference — **on by default**, because
 * that is what a camera is expected to do — with a visible toggle beside
 * the photo slots so it is a choice rather than a surprise. The preference
 * lives in AsyncStorage, so it survives a restart and is the same in every
 * flow that captures.
 *
 * When the OS refuses to let us add to the library, the capture still
 * happens: the toggle turns itself off, the user is told in Turkish, and
 * the photo is taken without being saved. Losing the photo would be a much
 * worse answer than not copying it to the gallery.
 */

const SAVE_TO_GALLERY_KEY = 'photoCapture.saveToGallery';

/** Owner decision: a camera that quietly keeps nothing is the surprise. */
const SAVE_TO_GALLERY_DEFAULT = true;

/** One wording for the toggle, so the screens that draw it cannot drift. */
export const SAVE_TO_GALLERY_LABEL = 'Çektiklerimi galeriye de kaydet';

export type CaptureOutcome =
  | { status: 'ok'; photos: PhotoAsset[] }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

// The preference is read once and then kept in memory: a capture must not
// wait on storage, and every mounted toggle has to see the value change
// when a refused permission turns it off.
let saveToGallery = SAVE_TO_GALLERY_DEFAULT;
let loaded: Promise<void> | null = null;
// Set the moment anyone decides: a read still in flight must not land on
// top of a choice made while it was running.
let decided = false;
const listeners = new Set<(on: boolean) => void>();

function ensureLoaded(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(SAVE_TO_GALLERY_KEY)
      .then((stored) => {
        if (!decided && stored !== null) saveToGallery = stored === '1';
      })
      // An unreadable store is not a reason to change the answer: the
      // default stands and the next write repairs it.
      .catch(() => {});
  }
  return loaded;
}

/** Turn the preference on or off and remember it. */
export function setSaveToGallery(on: boolean): void {
  decided = true;
  saveToGallery = on;
  for (const listener of listeners) listener(on);
  AsyncStorage.setItem(SAVE_TO_GALLERY_KEY, on ? '1' : '0').catch(() => {});
}

/**
 * The toggle's state. Every mounted toggle follows the same value, which is
 * what lets a refused permission switch them all off at once.
 */
export function useSaveToGallery(): { on: boolean; set: (on: boolean) => void } {
  const [on, setOn] = useState(saveToGallery);
  useEffect(() => {
    let alive = true;
    const listener = (next: boolean) => {
      if (alive) setOn(next);
    };
    listeners.add(listener);
    ensureLoaded().then(() => listener(saveToGallery));
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);
  return { on, set: setSaveToGallery };
}

function refuse() {
  setSaveToGallery(false);
  Alert.alert(
    'Galeriye kaydedilemiyor',
    'Telefon, fotoğrafları galeriye eklememize izin vermedi. "' +
      SAVE_TO_GALLERY_LABEL +
      '" kapatıldı; fotoğrafın yine de çekildi. İzni verdikten sonra bu ayarı tekrar açabilirsin.'
  );
}

/**
 * Android 9 and older write the copy through shared storage, which is a
 * runtime permission; 10+ goes through MediaStore and needs none.
 * react-native-image-picker only CHECKS that permission (it answers
 * `permission` without ever asking), so the asking is ours — the manifest
 * declares it with `maxSdkVersion="28"` for exactly this window.
 */
async function canAddToGallery(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version !== 'number' || Platform.Version > 28) return true;
  const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  if (await PermissionsAndroid.check(permission)) return true;
  const answer = await PermissionsAndroid.request(permission, {
    title: 'Galeriye kaydetme izni',
    message: 'Çektiğin fotoğrafların telefonunun galerisine de kaydedilmesi için izin gerekiyor.',
    buttonPositive: 'İzin ver',
    buttonNegative: 'Vazgeç',
  });
  return answer === PermissionsAndroid.RESULTS.GRANTED;
}

function toAssets(assets: { uri?: string; type?: string; fileName?: string }[]): PhotoAsset[] {
  return assets
    .filter((a): a is { uri: string; type?: string; fileName?: string } => !!a.uri)
    .map((a) => ({ uri: a.uri, type: a.type, fileName: a.fileName }));
}

/**
 * Take one photo with the camera, saving it to the gallery when the
 * preference says so.
 */
export async function capturePhoto(): Promise<CaptureOutcome> {
  try {
    await ensureLoaded();
    let save = saveToGallery;
    if (save && !(await canAddToGallery())) {
      refuse();
      save = false;
    }

    let result = await launchCamera({ mediaType: 'photo', saveToPhotos: save });
    // The picker refused over the same permission (its own check, or an iOS
    // version that gates the camera on it): drop the copy and take the
    // photo anyway rather than losing the capture.
    if (save && result.errorCode === 'permission') {
      refuse();
      result = await launchCamera({ mediaType: 'photo', saveToPhotos: false });
    }
    // Simulators have no camera; the gallery stands in during development
    // (the same fallback the map's drop flow uses). Never on a device.
    if (__DEV__ && result.errorCode === 'camera_unavailable') {
      result = await launchImageLibrary(LIBRARY_PICKER);
    }

    if (result.didCancel) return { status: 'cancelled' };
    const photos = toAssets(result.assets ?? []);
    if (photos.length === 0) {
      return {
        status: 'error',
        message: result.errorMessage ?? result.errorCode ?? 'Bilinmeyen hata',
      };
    }
    return { status: 'ok', photos };
  } catch (err: any) {
    return { status: 'error', message: err?.message ?? 'Bilinmeyen hata' };
  }
}

/**
 * Pick photos already on the phone. Nothing is saved anywhere — they are
 * where the user keeps them — so the preference plays no part here.
 */
export async function pickPhotos(selectionLimit?: number): Promise<CaptureOutcome> {
  try {
    const result = await launchImageLibrary(
      selectionLimit === undefined ? LIBRARY_PICKER : { ...LIBRARY_PICKER, selectionLimit }
    );
    if (result.didCancel) return { status: 'cancelled' };
    const photos = toAssets(result.assets ?? []);
    if (photos.length === 0) {
      return {
        status: 'error',
        message: result.errorMessage ?? result.errorCode ?? 'Bilinmeyen hata',
      };
    }
    return { status: 'ok', photos };
  } catch (err: any) {
    return { status: 'error', message: err?.message ?? 'Bilinmeyen hata' };
  }
}
