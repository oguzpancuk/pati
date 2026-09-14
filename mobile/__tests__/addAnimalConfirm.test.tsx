/**
 * "Bu o — eşleştir" on a match hit: the sighting first, then the photos
 * taken for the flow go into that animal's gallery through the same
 * token-first upload as a new animal's (owner batch 2026-09-14, B1). Before
 * B1 the confirm sent only the sighting and the photos were dropped.
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

/** Form → one camera shot → match (one hit) → the confirm returns from the profile. */
async function confirmHit(matchHit = true) {
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
  await waitFor(
    () => tree.root.findAll((n) => n.props.accessibilityLabel === 'candidate').length > 0
  );
  await act(async () => {
    tree.update(
      <AddAnimalScreen
        navigation={navigation}
        route={{ params: { confirmedAnimalId: 42, confirmedMatchHit: matchHit } }}
      />
    );
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

test('a refused sighting (the hit expired) uploads nothing and opens the profile', async () => {
  api.reportSighting.mockRejectedValue({ response: { data: { code: 'carersOnly' } } });
  const navigation = await confirmHit();
  expect(api.addAnimalPhoto).not.toHaveBeenCalled();
  expect(navigation.replace).toHaveBeenCalledWith('AnimalProfile', { animalId: 42 });
});

test('without a hit the confirm sends nothing at all', async () => {
  const navigation = await confirmHit(false);
  expect(api.reportSighting).not.toHaveBeenCalled();
  expect(api.addAnimalPhoto).not.toHaveBeenCalled();
  expect(navigation.replace).toHaveBeenCalledWith('AnimalProfile', { animalId: 42 });
});
