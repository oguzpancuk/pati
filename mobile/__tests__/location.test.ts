/**
 * The iOS status mapping of the add-animal gate (owner rule, 2026-09-07):
 * a screen only reads the permission, the gate asks exactly when the user
 * has not been asked yet, and a refusal of any kind is the one error the
 * Settings alert answers. react-native-permissions' iOS vocabulary is the
 * trap this pins: DENIED means "not determined", BLOCKED is the refusal.
 */
import { Platform } from 'react-native';
import { check, request, RESULTS } from 'react-native-permissions';
import {
  ensureLocationPermission,
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

beforeEach(() => {
  Platform.OS = 'ios';
  mockedCheck.mockReset();
  mockedRequest.mockReset();
  mockGetCurrentPosition.mockReset();
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

  it.each([RESULTS.BLOCKED, RESULTS.UNAVAILABLE])(
    'throws without asking again when the status is %s',
    async (status) => {
      mockedCheck.mockResolvedValue(status);
      await expect(ensureLocationPermission()).rejects.toBeInstanceOf(LocationPermissionError);
      expect(mockedRequest).not.toHaveBeenCalled();
    }
  );
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
  });

  it('getCurrentLocationIfPermitted reads the fix once granted', async () => {
    mockedCheck.mockResolvedValue(RESULTS.GRANTED);
    mockGetCurrentPosition.mockImplementation((ok: (p: unknown) => void) =>
      ok({ coords: { latitude: 41, longitude: 29 } })
    );
    await expect(getCurrentLocationIfPermitted()).resolves.toEqual({ lat: 41, lng: 29 });
  });
});
