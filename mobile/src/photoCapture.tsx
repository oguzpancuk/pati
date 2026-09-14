import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleProp,
  Switch,
  ViewStyle,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { LIBRARY_PICKER } from './photoPicker';
import type { PhotoAsset } from './api/care';
import { Text } from './components/ui';
import { makeStyles, minTouch, spacing, useTheme } from './theme';

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
 * happens: the photo is taken without being saved, and only then does the
 * toggle turn itself off and the user get told in Turkish. That order
 * matters — both refusal paths fire before the camera has opened, so a
 * notice raised at the refusal would be claiming a photo that does not exist
 * yet. Losing the photo would be a much worse answer than not copying it to
 * the gallery.
 */

const SAVE_TO_GALLERY_KEY = 'photoCapture.saveToGallery';

/** Owner decision: a camera that quietly keeps nothing is the surprise. */
const SAVE_TO_GALLERY_DEFAULT = true;

/** One wording for the toggle, so the screens that draw it cannot drift. */
export const SAVE_TO_GALLERY_LABEL = 'Çektiklerimi galeriye de kaydet';

export type CaptureOutcome =
  | { status: 'ok'; photos: PhotoAsset[] }
  // No photo, and nothing left for the caller to say: the user backed out,
  // or the helper has already explained a refused camera itself.
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
 * what lets a refused permission switch them all off at once. Screens draw
 * it through `SaveToGalleryRow`; this hook is for anything that needs the
 * value itself.
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

/**
 * The toggle as it is drawn beside a photo slot, in one place: the three
 * screens that capture (add-animal, bakım ver, the map's food/water drop)
 * mount this and cannot drift apart in wording or in behaviour.
 *
 * The whole ROW is the touch target, which is what carries it over DESIGN
 * §3's 44 pt floor — an iOS Switch is ~31 pt tall and the caption ~17 pt, so
 * the gap between them and the few points above and below the wording used
 * to hit nothing and the preference silently did not change.
 */
export function SaveToGalleryRow({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useRowStyles();
  const { colors } = useTheme();
  const { on, set } = useSaveToGallery();
  return (
    <Pressable
      style={[styles.row, style]}
      onPress={() => set(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={SAVE_TO_GALLERY_LABEL}
    >
      <Switch
        value={on}
        onValueChange={set}
        style={styles.switch}
        trackColor={{ true: colors.brand, false: colors.border }}
        ios_backgroundColor={colors.border}
        // The row already announces itself as the switch; the control inside
        // it must not be a second stop for a screen reader.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text variant="caption" style={styles.label}>
        {SAVE_TO_GALLERY_LABEL}
      </Text>
    </Pressable>
  );
}

const useRowStyles = makeStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: minTouch,
  },
  // React Native lays an iOS Switch out at the classic 51 pt, but iOS 26
  // draws the control 63 pt wide from the same origin, so the knob ran over
  // the gap and into the label. Reserving the wider box keeps the gap on
  // every iOS; older systems just get a little more of it.
  switch: Platform.OS === 'ios' ? { width: 63 } : {},
  label: { flex: 1 },
}));

/**
 * Told AFTER the capture, never before it: the alert is about a photo that
 * exists, and both refusal paths fire before the camera has been opened.
 * Announcing it early claimed a photo had been taken when none had, and on
 * Android it put a dialog on screen at the moment the camera activity was
 * launching over it.
 */
function noteGalleryRefused() {
  Alert.alert(
    'Galeriye kaydedilemedi',
    'Telefon, fotoğrafları galeriye eklememize izin vermedi. "' +
      SAVE_TO_GALLERY_LABEL +
      '" kapatıldı; fotoğrafın galeriye kopyalanmadı ama uygulamada duruyor. ' +
      'İzni verdikten sonra bu ayarı tekrar açabilirsin.'
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

/**
 * Android only. The manifest declares CAMERA, and an app that declares it may
 * not fire the camera intent until the user has granted it:
 * react-native-image-picker checks and answers `others` with an English
 * sentence before any camera opens (ImagePickerModuleImpl.launchCamera,
 * Utils.isCameraPermissionFulfilled) — it never asks. With the library door
 * gone from add-animal (C1) that refusal was the end of the road, so the
 * asking is ours, right before the camera. iOS needs nothing here:
 * UIImagePickerController raises the system camera sheet itself.
 */
async function canUseCamera(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
  if (await PermissionsAndroid.check(permission)) return true;
  const answer = await PermissionsAndroid.request(permission, {
    title: 'Kamera izni',
    message: 'Hayvanın fotoğrafını o an uygulamanın içinden çekebilmen için kamera izni gerekiyor.',
    buttonPositive: 'İzin ver',
    buttonNegative: 'Vazgeç',
  });
  return answer === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * A refusal must not look like a broken button, and after "bir daha sorma"
 * the request above shows nothing at all — Settings is the only way back,
 * so the alert leads there (the same shape as the location alert).
 */
function alertCameraRefused() {
  Alert.alert(
    'Kamera izni gerekli',
    'Fotoğraflar uygulamanın içinden çekiliyor; bunun için kamera izni gerekli. İzni Ayarlar’dan verebilirsin.',
    [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Ayarları aç', onPress: () => Linking.openSettings() },
    ]
  );
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
    // The camera before the gallery: a user who refuses the camera must not
    // first be asked about saving a photo that will never be taken.
    if (!(await canUseCamera())) {
      alertCameraRefused();
      return { status: 'cancelled' };
    }
    await ensureLoaded();
    let save = saveToGallery;
    // Set only once we KNOW it was the gallery that was refused, and acted on
    // only once a photo exists.
    let galleryRefused = false;

    if (save && !(await canAddToGallery())) {
      // Unambiguous: we asked for WRITE_EXTERNAL_STORAGE ourselves.
      galleryRefused = true;
      save = false;
    }

    let result = await launchCamera({ mediaType: 'photo', saveToPhotos: save });
    if (save && result.errorCode === 'permission') {
      // `permission` does not say WHICH permission. Android answers it only
      // for the gallery write (ImagePickerModuleImpl.launchCamera checks
      // WRITE_EXTERNAL_STORAGE on SDK ≤ 28 and answers `others` for a denied
      // camera), but iOS routes a camera denial through the same code
      // whenever it checks at all. So the RETRY is the discriminator: drop
      // the copy and ask again — a gallery refusal goes through, a camera
      // refusal refuses again and falls out to the error below with nothing
      // claimed about the gallery.
      save = false;
      result = await launchCamera({ mediaType: 'photo', saveToPhotos: false });
      galleryRefused = result.errorCode !== 'permission';
    }
    // Simulators have no camera; the gallery stands in during development
    // (the same fallback the map's drop flow uses). Never in a release
    // build, where `__DEV__` is false: the flows that capture (food/water
    // drop, add-animal, bakım ver) have no library door on a device.
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
    if (galleryRefused) {
      setSaveToGallery(false);
      noteGalleryRefused();
    }
    return { status: 'ok', photos };
  } catch (err: any) {
    return { status: 'error', message: err?.message ?? 'Bilinmeyen hata' };
  }
}
