/**
 * The camera is the only photo door in add-animal and "bakım ver" (C1). On
 * Android the manifest declares CAMERA, and react-native-image-picker refuses
 * launchCamera for an app that has not been granted it — without ever asking.
 * These pin that capturePhoto asks first, never opens the camera after a
 * refusal, and answers the refusal itself (with the Settings way back) instead
 * of handing the caller the library's English error.
 */
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { capturePhoto, setSaveToGallery } from '../src/photoCapture';

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

const mockedLaunchCamera = launchCamera as jest.MockedFunction<typeof launchCamera>;
const shot = { assets: [{ uri: 'file:///shot.jpg', type: 'image/jpeg', fileName: 'shot.jpg' }] };

let checkSpy: jest.SpyInstance;
let requestSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  Platform.OS = 'android';
  // Above API 28 the gallery copy needs no permission, so the only request
  // in play is the camera's.
  Object.defineProperty(Platform, 'Version', { get: () => 34, configurable: true });
  setSaveToGallery(true);
  mockedLaunchCamera.mockReset();
  mockedLaunchCamera.mockResolvedValue(shot as never);
  checkSpy = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  requestSpy = jest.spyOn(PermissionsAndroid, 'request');
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('capturePhoto on Android', () => {
  it('asks for CAMERA before the camera opens and returns the shot on a grant', async () => {
    const order: string[] = [];
    requestSpy.mockImplementation(async () => {
      order.push('request');
      return PermissionsAndroid.RESULTS.GRANTED;
    });
    mockedLaunchCamera.mockImplementation((async () => {
      order.push('camera');
      return shot;
    }) as never);

    const outcome = await capturePhoto();

    expect(requestSpy).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      expect.anything()
    );
    expect(order).toEqual(['request', 'camera']);
    expect(outcome).toEqual({ status: 'ok', photos: [shot.assets[0]] });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not ask again when CAMERA is already granted', async () => {
    checkSpy.mockResolvedValue(true);
    const outcome = await capturePhoto();
    expect(requestSpy).not.toHaveBeenCalled();
    expect(mockedLaunchCamera).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('ok');
  });

  it.each(['denied', 'never_ask_again'])(
    'never opens the camera after %s and explains it with a Settings button',
    async (answer) => {
      requestSpy.mockResolvedValue(answer);
      const outcome = await capturePhoto();

      expect(mockedLaunchCamera).not.toHaveBeenCalled();
      // Cancelled, not error: the caller must not stack its own
      // "Fotoğraf alınamadı" on top of the explanation.
      expect(outcome).toEqual({ status: 'cancelled' });
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, , buttons] = alertSpy.mock.calls[0];
      expect(title).toBe('Kamera izni gerekli');
      expect((buttons as { text: string }[]).map((b) => b.text)).toContain('Ayarları aç');
    }
  );
});

describe('capturePhoto on iOS', () => {
  it('leaves the camera permission to the system picker', async () => {
    Platform.OS = 'ios';
    const outcome = await capturePhoto();
    expect(checkSpy).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
    expect(mockedLaunchCamera).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('ok');
  });
});
