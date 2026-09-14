/**
 * "Bu o — eşleştir" on a match hit: the sighting first, then the photos
 * taken for the flow go into that animal's gallery through the same
 * token-first upload as a new animal's (owner batch 2026-09-14, B1). Before
 * B1 the confirm sent only the sighting and the photos were dropped. The
 * same holds for a viewer who already is a carer of a candidate that is not
 * a hit, and one confirm runs at a time (B1 follow-up).
 *
 * The screen's own logic runs; everything around it (the design system,
 * the camera, the network, the location) is a stand-in.
 */
import React from 'react';
import { Alert, Pressable } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AddAnimalScreen from '../src/screens/AddAnimalScreen';
import * as animalsApi from '../src/api/animals';

jest.mock('../src/api/animals', () => ({
  addAnimalPhoto: jest.fn(),
  createAnimal: jest.fn(),
  matchAnimals: jest.fn(),
  reportSighting: jest.fn(),
}));

jest.mock('../src/photoCapture', () => ({
  capturePhoto: jest.fn(async () => ({
    status: 'ok',
    photos: [{ uri: 'file:///shot-1.jpg', type: 'image/jpeg', fileName: 'shot-1.jpg' }],
  })),
  SaveToGalleryRow: () => null,
}));

jest.mock('../src/location', () => {
  class LocationPermissionError extends Error {}
  return {
    LocationPermissionError,
    alertLocationPermission: jest.fn(),
    ensureLocationPermission: jest.fn(async () => undefined),
    getCurrentLocation: jest.fn(async () => ({ lat: 40.99, lng: 29.03 })),
  };
});

jest.mock('../src/context/BadgeAwardContext', () => ({
  useBadgeAwards: () => ({ celebrate: jest.fn() }),
}));

jest.mock('../src/components/AnimalAvatar', () => () => null);
jest.mock('../src/components/brand', () => ({ Icon: () => null }));

jest.mock('../src/theme', () => {
  // why: any style or colour key resolves to something; the test reads none.
  const anything: any = new Proxy({}, { get: () => anything });
  return {
    makeStyles: () => () => anything,
    useTheme: () => ({ colors: anything }),
    radius: anything,
    spacing: anything,
  };
});

// Plain host components with the props the screen passes: a label to find
// and an onPress to call. why `any`: only those props are read.
jest.mock('../src/components/ui', () => {
  const { Pressable: P, Text: T, View: V } = require('react-native');
  const R = require('react');
  const Pass = ({ children }: any) => R.createElement(V, null, children);
  return {
    Banner: () => null,
    Button: ({ title, onPress, disabled }: any) =>
      R.createElement(
        P,
        { onPress, disabled, accessibilityLabel: title },
        R.createElement(T, null, title)
      ),
    Card: ({ children, onPress }: any) =>
      R.createElement(P, { onPress, accessibilityLabel: 'candidate' }, children),
    Chip: ({ label, onPress }: any) =>
      R.createElement(
        P,
        { onPress, accessibilityLabel: `chip:${label}` },
        R.createElement(T, null, label)
      ),
    ChoiceField: () => null,
    Input: () => null,
    LoadingState: ({ label }: any) => R.createElement(T, null, label),
    MULTI_CHOICE_SEPARATOR: ', ',
    MultiChoiceField: () => null,
    Screen: Pass,
    Text: ({ children }: any) => R.createElement(T, null, children),
  };
});

const api = animalsApi as jest.Mocked<typeof animalsApi>;
// why `as any` on the API answers below: they carry only the fields the
// screen reads, not the full response types.
const candidate = {
  id: 42,
  species: 'cat',
  name: 'Pamuk',
  breed: null,
  color: null,
  cover_thumb_url: null,
  distance_meters: 12,
  similarity: 'high',
  similarity_reasons: ['photo_same'],
  matchHit: true,
};

function press(tree: ReactTestRenderer, label: string) {
  const target = tree.root.find(
    (node) => node.type === Pressable && node.props.accessibilityLabel === label
  );
  return act(async () => {
    await target.props.onPress();
  });
}

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 40; i += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
  throw new Error('condition never held');
}

const candidateCards = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.type === Pressable && n.props.accessibilityLabel === 'candidate')
    .length;

/** Form → one camera shot → match (one candidate) → the results list. */
async function reachResults(matchHit: boolean) {
  const navigation = {
    replace: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    goBack: jest.fn(),
  };
  api.matchAnimals.mockResolvedValue({
    candidates: [{ ...candidate, matchHit }],
    radiusMeters: 1000,
    photoChecked: true,
    photoTokens: ['token-1'],
  } as any);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AddAnimalScreen navigation={navigation} route={{ params: undefined }} />);
  });
  await press(tree, 'chip:Kedi');
  await press(tree, 'Fotoğraf çek');
  await press(tree, 'Hayvanı kaydet');
  // The matching screen holds for MIN_MATCHING_MS before the results.
  await waitFor(() => candidateCards(tree) > 0);
  return { tree, navigation };
}

/** The profile's "Bu o" brings the screen back with these params. */
function returnFromProfile(
  tree: ReactTestRenderer,
  navigation: object,
  params: { confirmedAnimalId?: number; confirmedSighting?: boolean }
) {
  return act(async () => {
    tree.update(<AddAnimalScreen navigation={navigation} route={{ params }} />);
  });
}

/**
 * The confirm returns from the profile. `sighting` is the profile's verdict
 * (a hit, or the viewer already a carer); `matchHit` the server's.
 */
async function confirmHit(matchHit = true, sighting = matchHit) {
  const { tree, navigation } = await reachResults(matchHit);
  await returnFromProfile(tree, navigation, {
    confirmedAnimalId: 42,
    confirmedSighting: sighting,
  });
  await waitFor(() => navigation.replace.mock.calls.length > 0);
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('a hit confirm reports the sighting, then adds the photo by its token, then opens the profile', async () => {
  const order: string[] = [];
  api.reportSighting.mockImplementation(async () => {
    order.push('sighting');
    return {} as any;
  });
  api.addAnimalPhoto.mockImplementation(async () => {
    order.push('photo');
    return {} as any;
  });
  const navigation = await confirmHit();
  expect(api.reportSighting).toHaveBeenCalledWith(42, 40.99, 29.03);
  expect(api.addAnimalPhoto).toHaveBeenCalledTimes(1);
  expect(api.addAnimalPhoto).toHaveBeenCalledWith(42, { photoToken: 'token-1' });
  expect(order).toEqual(['sighting', 'photo']);
  expect(navigation.replace).toHaveBeenCalledWith('AnimalProfile', { animalId: 42 });
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('an expired token falls back to the file itself', async () => {
  api.reportSighting.mockResolvedValue({} as any);
  api.addAnimalPhoto
    .mockRejectedValueOnce({
      response: { data: { code: 'photoTokenInvalid', error: 'süresi doldu' } },
    })
    .mockResolvedValueOnce({} as any);
  await confirmHit();
  expect(api.addAnimalPhoto).toHaveBeenCalledTimes(2);
  expect(api.addAnimalPhoto).toHaveBeenLastCalledWith(
    42,
    expect.objectContaining({ uri: 'file:///shot-1.jpg' })
  );
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('a photo that fails still lands on the profile, with the reason', async () => {
  api.reportSighting.mockResolvedValue({} as any);
  api.addAnimalPhoto.mockRejectedValue({ response: { data: { error: 'Depo şu an kapalı.' } } });
  const navigation = await confirmHit();
  expect(Alert.alert).toHaveBeenCalledWith(
    'Fotoğraflar eklenemedi',
    'Depo şu an kapalı. Fotoğrafı daha sonra profilden ekleyebilirsin.'
  );
  expect(navigation.replace).toHaveBeenCalledWith('AnimalProfile', { animalId: 42 });
});

test('a refused sighting (the hit expired) says so, uploads nothing and opens the profile', async () => {
  api.reportSighting.mockRejectedValue({ response: { data: { code: 'carersOnly' } } });
  const navigation = await confirmHit();
  expect(api.addAnimalPhoto).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    'Eşleşmenin süresi doldu',
    'Bakıcısı olmak için profilden “bakım ver” ile yeni bir fotoğraf çek.'
  );
  expect(navigation.replace).toHaveBeenCalledWith('AnimalProfile', { animalId: 42 });
  // The user is told before the profile replaces the screen.
  expect((Alert.alert as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    navigation.replace.mock.invocationCallOrder[0]
  );
});

test('a confirm the profile marks as a sighting without a hit (an existing carer) adds the photo too', async () => {
  api.reportSighting.mockResolvedValue({} as any);
  api.addAnimalPhoto.mockResolvedValue({} as any);
  const navigation = await confirmHit(false, true);
  expect(api.reportSighting).toHaveBeenCalledWith(42, 40.99, 29.03);
  expect(api.addAnimalPhoto).toHaveBeenCalledWith(42, { photoToken: 'token-1' });
  expect(navigation.replace).toHaveBeenCalledWith('AnimalProfile', { animalId: 42 });
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('a sighting that fails for another reason says so and gives the results back', async () => {
  api.reportSighting.mockRejectedValue({ response: { data: { error: 'Sunucu hatası.' } } });
  const { tree, navigation } = await reachResults(true);
  await returnFromProfile(tree, navigation, { confirmedAnimalId: 42, confirmedSighting: true });
  await waitFor(() => (Alert.alert as jest.Mock).mock.calls.length > 0);
  expect(Alert.alert).toHaveBeenCalledWith('Güncellenemedi', 'Sunucu hatası.');
  await waitFor(() => candidateCards(tree) > 0);
  expect(api.addAnimalPhoto).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalled();
});

test('a second confirm while the first is still saving sends nothing', async () => {
  let finishSighting!: () => void;
  api.reportSighting.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSighting = () => resolve({} as any);
      })
  );
  api.addAnimalPhoto.mockResolvedValue({} as any);
  const { tree, navigation } = await reachResults(true);
  await returnFromProfile(tree, navigation, { confirmedAnimalId: 42, confirmedSighting: true });
  await waitFor(() => api.reportSighting.mock.calls.length === 1);
  // Busy: the candidates are gone, so none can be opened and confirmed again.
  expect(candidateCards(tree)).toBe(0);
  expect(tree.root.findAll((n) => n.props.children === 'Kaydediliyor…').length).toBeGreaterThan(0);
  // A second confirm arrives anyway (the params cleared, then set anew).
  await returnFromProfile(tree, navigation, {});
  await returnFromProfile(tree, navigation, { confirmedAnimalId: 42, confirmedSighting: true });
  expect(api.reportSighting).toHaveBeenCalledTimes(1);
  expect(navigation.replace).not.toHaveBeenCalled();
  await act(async () => {
    finishSighting();
  });
  await waitFor(() => navigation.replace.mock.calls.length > 0);
  expect(api.reportSighting).toHaveBeenCalledTimes(1);
  expect(api.addAnimalPhoto).toHaveBeenCalledTimes(1);
  expect(navigation.replace).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('without a hit the confirm sends nothing at all', async () => {
  const navigation = await confirmHit(false);
  expect(api.reportSighting).not.toHaveBeenCalled();
  expect(api.addAnimalPhoto).not.toHaveBeenCalled();
  expect(navigation.replace).toHaveBeenCalledWith('AnimalProfile', { animalId: 42 });
});
