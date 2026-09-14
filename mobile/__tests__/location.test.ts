/**
 * The location rule (C2, owner batch 2026-09-14): every action asks the
 * platform before it can warn, and readers never ask. Pinned here:
 * - iOS: react-native-permissions' vocabulary is the trap — DENIED means
 *   "not determined", BLOCKED is the refusal.
 * - Android: FINE is requested together with COARSE (some Android 12
 *   releases ignore a FINE-only request without a dialog), and only FINE
 *   counts as a grant.
 * - `getCurrentLocation` requests before it touches the GPS;
 *   `getCurrentLocationIfPermitted` never requests.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import { check, request, RESULTS } from 'react-native-permissions';
import {
  ensureLocationPermission,
  getCurrentLocation,
  getCurrentLocationIfPermitted,
  hasLocationPermission,
  LocationPermissionError,
} from '../src/location';

// The library's own mock carries the real PERMISSIONS/RESULTS values, so a
// version bump that changes the vocabulary fails this test instead of
// passing on hand-copied strings (review finding).
jest.mock('react-native-permissions', () => ({
  ...jest.requireActual('react-native-permissions/mock'),
  check: jest.fn(),
  request: jest.fn(),
}));

const mockGetCurrentPosition = jest.fn();
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: { getCurrentPosition: (...args: unknown[]) => mockGetCurrentPosition(...args) },
}));

const mockedCheck = check as jest.MockedFunction<typeof check>;
const mockedRequest = request as jest.MockedFunction<typeof request>;

const { ACCESS_FINE_LOCATION: FINE, ACCESS_COARSE_LOCATION: COARSE } =
  PermissionsAndroid.PERMISSIONS;
const { GRANTED, DENIED, NEVER_ASK_AGAIN } = PermissionsAndroid.RESULTS;

// Untyped on purpose: RN types the answer as a record of every Android
// permission, and these tests only answer the two they request.
const spyRequestMultiple = (): jest.SpyInstance =>
  jest.spyOn(PermissionsAndroid, 'requestMultiple');

const fixAt = (latitude: number, longitude: number) => (ok: (p: unknown) => void) =>
  ok({ coords: { latitude, longitude } });

beforeEach(() => {
  Platform.OS = 'ios';
  mockedCheck.mockReset();
  mockedRequest.mockReset();
  mockGetCurrentPosition.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ensureLocationPermission (iOS)', () => {
  it('resolves without asking when the permission is granted', async () => {
    mockedCheck.mockResolvedValue(RESULTS.GRANTED);
    await expect(ensureLocationPermission()).resolves.toBeUndefined();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('asks when not determined yet and resolves on a grant', async () => {
    mockedCheck.mockResolvedValue(RESULTS.DENIED);
    mockedRequest.mockResolvedValue(RESULTS.GRANTED);
    await expect(ensureLocationPermission()).resolves.toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('throws the permission error when the sheet is refused', async () => {
    mockedCheck.mockResolvedValue(RESULTS.DENIED);
    mockedRequest.mockResolvedValue(RESULTS.BLOCKED);
    await expect(ensureLocationPermission()).rejects.toBeInstanceOf(LocationPermissionError);
  });

  // No sheet is possible here on iOS (request() would return the same
  // status without UI), so skipping the no-op call changes nothing visible.
  it.each([RESULTS.BLOCKED, RESULTS.UNAVAILABLE])(
    'throws without a request that could show nothing when the status is %s',
    async (status) => {
      mockedCheck.mockResolvedValue(status);
      await expect(ensureLocationPermission()).rejects.toBeInstanceOf(LocationPermissionError);
      expect(mockedRequest).not.toHaveBeenCalled();
    }
  );
});

describe('ensureLocationPermission (Android)', () => {
  let requestMultiple: jest.SpyInstance;

  beforeEach(() => {
    Platform.OS = 'android';
    requestMultiple = spyRequestMultiple();
  });

  it('requests FINE together with COARSE and resolves when FINE is granted', async () => {
    requestMultiple.mockResolvedValue({ [FINE]: GRANTED, [COARSE]: GRANTED });
    await expect(ensureLocationPermission()).resolves.toBeUndefined();
    expect(requestMultiple).toHaveBeenCalledTimes(1);
    expect(requestMultiple).toHaveBeenCalledWith([FINE, COARSE]);
  });

  it.each([DENIED, NEVER_ASK_AGAIN])('throws the permission error on %s', async (answer) => {
    requestMultiple.mockResolvedValue({ [FINE]: answer, [COARSE]: answer });
    await expect(ensureLocationPermission()).rejects.toBeInstanceOf(LocationPermissionError);
  });

  it('throws when only approximate was granted', async () => {
    requestMultiple.mockResolvedValue({ [FINE]: DENIED, [COARSE]: GRANTED });
    await expect(ensureLocationPermission()).rejects.toBeInstanceOf(LocationPermissionError);
  });

  it('asks again on every call — no stored answer decides', async () => {
    requestMultiple.mockResolvedValue({ [FINE]: NEVER_ASK_AGAIN, [COARSE]: NEVER_ASK_AGAIN });
    await expect(ensureLocationPermission()).rejects.toBeInstanceOf(LocationPermissionError);
    await expect(ensureLocationPermission()).rejects.toBeInstanceOf(LocationPermissionError);
    expect(requestMultiple).toHaveBeenCalledTimes(2);
  });
});

describe('getCurrentLocation asks before it reads', () => {
  it('Android: the request comes before the GPS, and a refusal never reaches it', async () => {
    Platform.OS = 'android';
    const order: string[] = [];
    const requestMultiple = spyRequestMultiple().mockImplementation(async () => {
      order.push('request');
      return { [FINE]: GRANTED, [COARSE]: GRANTED };
    });
    mockGetCurrentPosition.mockImplementation((ok: (p: unknown) => void) => {
      order.push('gps');
      fixAt(41, 29)(ok);
    });

    await expect(getCurrentLocation()).resolves.toEqual({ lat: 41, lng: 29 });
    expect(order).toEqual(['request', 'gps']);

    requestMultiple.mockResolvedValue({ [FINE]: NEVER_ASK_AGAIN, [COARSE]: NEVER_ASK_AGAIN });
    mockGetCurrentPosition.mockClear();
    await expect(getCurrentLocation()).rejects.toBeInstanceOf(LocationPermissionError);
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });

  it('iOS: the sheet is answered before the GPS starts its timeout', async () => {
    const order: string[] = [];
    mockedCheck.mockImplementation(async () => {
      order.push('check');
      return RESULTS.DENIED;
    });
    mockedRequest.mockImplementation(async () => {
      order.push('request');
      return RESULTS.GRANTED;
    });
    mockGetCurrentPosition.mockImplementation((ok: (p: unknown) => void) => {
      order.push('gps');
      fixAt(41, 29)(ok);
    });

    await expect(getCurrentLocation()).resolves.toEqual({ lat: 41, lng: 29 });
    expect(order).toEqual(['check', 'request', 'gps']);
  });

  it('iOS: a refused sheet is the permission error, with no GPS read', async () => {
    mockedCheck.mockResolvedValue(RESULTS.DENIED);
    mockedRequest.mockResolvedValue(RESULTS.BLOCKED);
    await expect(getCurrentLocation()).rejects.toBeInstanceOf(LocationPermissionError);
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });
});

describe('reading the permission never prompts', () => {
  it('hasLocationPermission reports the status without a request', async () => {
    mockedCheck.mockResolvedValue(RESULTS.DENIED);
    await expect(hasLocationPermission()).resolves.toBe(false);
    mockedCheck.mockResolvedValue(RESULTS.LIMITED);
    await expect(hasLocationPermission()).resolves.toBe(true);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('getCurrentLocationIfPermitted is null without the permission and never touches GPS', async () => {
    mockedCheck.mockResolvedValue(RESULTS.DENIED);
    await expect(getCurrentLocationIfPermitted()).resolves.toBeNull();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('getCurrentLocationIfPermitted reads the fix once granted, still without a request', async () => {
    mockedCheck.mockResolvedValue(RESULTS.GRANTED);
    mockGetCurrentPosition.mockImplementation(fixAt(41, 29));
    await expect(getCurrentLocationIfPermitted()).resolves.toEqual({ lat: 41, lng: 29 });
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('Android: getCurrentLocationIfPermitted checks and reads, and never requests', async () => {
    Platform.OS = 'android';
    const requestMultiple = spyRequestMultiple();
    const requestOne = jest.spyOn(PermissionsAndroid, 'request');
    const checkSpy = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);

    await expect(getCurrentLocationIfPermitted()).resolves.toBeNull();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();

    checkSpy.mockResolvedValue(true);
    mockGetCurrentPosition.mockImplementation(fixAt(41, 29));
    await expect(getCurrentLocationIfPermitted()).resolves.toEqual({ lat: 41, lng: 29 });

    expect(checkSpy).toHaveBeenCalledWith(FINE);
    expect(requestMultiple).not.toHaveBeenCalled();
    expect(requestOne).not.toHaveBeenCalled();
  });
});
