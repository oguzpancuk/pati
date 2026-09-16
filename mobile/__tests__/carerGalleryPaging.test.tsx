/**
 * The carer gallery shows every animal by scrolling alone (owner,
 * 2026-09-15): no "tümünü gör" card, the next page requested by the list's
 * own end-reached. Someone else's profile is rendered, so the wiring from
 * the profile's first three animals to the paging is what runs; the design
 * system and the network are stand-ins.
 *
 * FlatList's end-reached is called directly: that RN fires it when a short
 * first page does not fill the strip is VirtualizedList's job (an unfilled
 * strip is within the threshold), and the simulator's check.
 */
import React from 'react';
import { FlatList, Pressable, Text as RNText } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import PublicProfileScreen from '../src/screens/PublicProfileScreen';
import * as usersApi from '../src/api/users';
import type { AnimalPage, ProfileAnimal, PublicProfile } from '../src/api/users';

jest.mock('../src/api/users', () => ({
  fetchUserProfile: jest.fn(),
  fetchUserAnimals: jest.fn(),
  acceptFriendRequest: jest.fn(),
  removeFriendship: jest.fn(),
  sendFriendRequest: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const R = require('react');
  return {
    // why `any`: the stand-in only calls the callback on mount.
    useFocusEffect: (effect: any) => R.useEffect(() => effect(), [effect]),
  };
});

jest.mock('../src/theme', () => {
  // why: any style or colour key resolves to something; the test reads none.
  const anything: any = new Proxy({}, { get: () => anything });
  return {
    makeStyles: () => () => anything,
    radius: anything,
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
    useTheme: () => ({ name: 'light', colors: anything }),
  };
});

// why `any`: only children reach the host components.
jest.mock('../src/components/ui', () => {
  const { Text: T, View: V } = require('react-native');
  const R = require('react');
  const Pass = ({ children }: any) => R.createElement(V, null, children);
  return {
    Button: () => null,
    Card: Pass,
    LoadingState: () => null,
    Screen: Pass,
    SectionHeader: () => null,
    Text: ({ children }: any) => R.createElement(T, null, children),
  };
});

// The friendship button's handlers are the screen's reload path.
// why `any`: the stand-in keeps whatever the screen hands it.
let mockFriendship: any = null;
jest.mock('../src/components/profile', () => ({
  BadgeBlock: () => null,
  HeaderIconButton: () => null,
  FriendshipButton: (props: any) => {
    mockFriendship = props;
    return null;
  },
  ProfileHeader: ({ actions }: any) => actions ?? null,
  ProfileStats: () => null,
  CarerGallery: jest.requireActual('../src/components/profile/CarerGallery').default,
  useCaredAnimals: jest.requireActual('../src/components/profile/useCaredAnimals').useCaredAnimals,
}));
jest.mock('../src/components/AnimalAvatar', () => () => null);
// The header's "⋯" disc and its report sheet: not what this test is about.
jest.mock('../src/components/brand', () => ({ Icon: () => null }));
jest.mock('../src/components/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('../src/components/DemoChip', () => () => null);
jest.mock('../src/components/BadgeCatalogModal', () => () => null);
jest.mock('../src/components/LevelBar', () => () => null);
jest.mock('../src/components/RecentComments', () => () => null);

const api = usersApi as jest.Mocked<typeof usersApi>;

const animal = (id: number): ProfileAnimal => ({
  id,
  species: id % 2 ? 'cat' : 'dog',
  name: `Hayvan ${id}`,
  breed: null,
  created_at: '2026-09-01T10:00:00.000Z',
  cover_photo_url: null,
});

/** The animals at [from, to), as the server orders them. */
const range = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from) }, (_, i) => animal(from + i));

function profile(animalCount: number): PublicProfile {
  return {
    id: 42,
    name: 'Ayşe',
    avatar_url: null,
    created_at: '2026-01-01T10:00:00.000Z',
    stats: {} as PublicProfile['stats'], // why: the stand-in stats never read it
    badges: [],
    points: { total: 0 } as PublicProfile['points'],
    level: null as unknown as PublicProfile['level'], // why: LevelBar is a stand-in
    featuredBadges: [],
    rank: null,
    animals: range(0, Math.min(3, animalCount)),
    animalCount,
    friendCount: 0,
    recentComments: [],
    commentCount: 0,
    friendshipStatus: 'none',
    friendshipId: null,
    blocked: false,
  };
}

/** A page request the test resolves by hand. */
function deferred() {
  let resolve!: (page: AnimalPage) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<AnimalPage>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let mounted: ReactTestRenderer | null = null;

beforeEach(() => {
  // Reset, not clear: a once-value one test left unconsumed must not answer
  // the next test's request.
  jest.resetAllMocks();
});

afterEach(() => {
  if (mounted) act(() => mounted!.unmount());
  mounted = null;
});

async function render(animalCount: number) {
  api.fetchUserProfile.mockResolvedValue(profile(animalCount));
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <PublicProfileScreen navigation={{ push: jest.fn() }} route={{ params: { userId: 42 } }} />
    );
  });
  mounted = tree;
  return tree;
}

const strip = (tree: ReactTestRenderer) => tree.root.findByType(FlatList);
const loadedIds = (tree: ReactTestRenderer) =>
  (strip(tree).props.data as ProfileAnimal[]).map((a) => a.id);
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(RNText).map((t) => [t.props.children].flat().join(''));

async function endReached(tree: ReactTestRenderer) {
  await act(async () => {
    strip(tree).props.onEndReached({ distanceFromEnd: 0 });
  });
}

describe('the carer gallery', () => {
  it('is one horizontal strip without a scroll bar or a show-more control', async () => {
    const tree = await render(36);
    const list = strip(tree);
    expect(list.props.horizontal).toBe(true);
    expect(list.props.showsHorizontalScrollIndicator).toBe(false);
    expect(list.props.onEndReachedThreshold).toBeGreaterThan(0);
    expect(loadedIds(tree)).toEqual([0, 1, 2]);
    expect(texts(tree).join(' ')).not.toMatch(/tümünü gör/);
    // The tail says how many are still coming, and is not a button.
    expect(texts(tree)).toContain('+33');
    const buttons = tree.root.findAll(
      (n) => n.type === Pressable && n.props.accessibilityRole === 'button'
    );
    expect(buttons).toHaveLength(3);
  });

  it('pages through every animal as the end comes near, one request at a time', async () => {
    const first = deferred();
    api.fetchUserAnimals.mockReturnValueOnce(first.promise);
    const tree = await render(36);

    await endReached(tree);
    // End-reached can fire again before the page lands; that is not a second request.
    await endReached(tree);
    expect(api.fetchUserAnimals).toHaveBeenCalledTimes(1);
    expect(api.fetchUserAnimals).toHaveBeenLastCalledWith(42, 20, 3);
    expect(texts(tree)).toContain('yükleniyor…');

    await act(async () => first.resolve({ animals: range(3, 23), total: 36 }));
    expect(loadedIds(tree)).toEqual(range(0, 23).map((a) => a.id));
    expect(texts(tree)).toContain('+13');

    api.fetchUserAnimals.mockResolvedValueOnce({ animals: range(23, 36), total: 36 });
    await endReached(tree);
    expect(api.fetchUserAnimals).toHaveBeenLastCalledWith(42, 20, 23);
    expect(loadedIds(tree)).toHaveLength(36);
    expect(strip(tree).props.ListFooterComponent).toBeNull();

    await endReached(tree);
    expect(api.fetchUserAnimals).toHaveBeenCalledTimes(2);
  });

  it('asks nothing when the profile already brought them all', async () => {
    const tree = await render(2);
    await endReached(tree);
    expect(api.fetchUserAnimals).not.toHaveBeenCalled();
    expect(strip(tree).props.ListFooterComponent).toBeNull();
  });

  it('drops a page that was on its way when the profile reloaded, and asks again', async () => {
    const stale = deferred();
    api.fetchUserAnimals.mockReturnValueOnce(stale.promise);
    const tree = await render(36);
    await endReached(tree);

    // A friendship action reloads the profile, and the list starts over. The
    // strip comes back just as long, so nothing would tell the list to fire
    // end-reached again: the gallery's request is repeated for it.
    const fresh = deferred();
    api.fetchUserAnimals.mockReturnValueOnce(fresh.promise);
    api.sendFriendRequest.mockResolvedValueOnce(undefined);
    await act(async () => mockFriendship.onAdd());
    expect(api.fetchUserProfile).toHaveBeenCalledTimes(2);
    expect(api.fetchUserAnimals).toHaveBeenCalledTimes(2);
    expect(api.fetchUserAnimals).toHaveBeenLastCalledWith(42, 20, 3);

    // The page asked for against the old list must not land on the new one.
    await act(async () => stale.resolve({ animals: range(3, 23), total: 36 }));
    expect(loadedIds(tree)).toEqual([0, 1, 2]);
    expect(texts(tree)).toContain('yükleniyor…');

    await act(async () => fresh.resolve({ animals: range(3, 23), total: 36 }));
    expect(loadedIds(tree)).toEqual(range(0, 23).map((a) => a.id));
    expect(texts(tree)).not.toContain('yükleniyor…');

    // A reload after a page that was served asks for nothing by itself.
    api.sendFriendRequest.mockResolvedValueOnce(undefined);
    await act(async () => mockFriendship.onAdd());
    expect(loadedIds(tree)).toEqual([0, 1, 2]);
    expect(api.fetchUserAnimals).toHaveBeenCalledTimes(2);
  });

  it('retries a failed page when the profile reloads', async () => {
    api.fetchUserAnimals.mockRejectedValueOnce(new Error('offline'));
    const tree = await render(36);
    await endReached(tree);
    expect(texts(tree)).toContain('tekrar dene');

    api.fetchUserAnimals.mockResolvedValueOnce({ animals: range(3, 23), total: 36 });
    api.sendFriendRequest.mockResolvedValueOnce(undefined);
    await act(async () => mockFriendship.onAdd());
    expect(api.fetchUserAnimals).toHaveBeenCalledTimes(2);
    expect(loadedIds(tree)).toHaveLength(23);
    expect(texts(tree)).not.toContain('tekrar dene');
  });

  it('turns the tail into a retry when a page fails, and the retry asks again', async () => {
    api.fetchUserAnimals.mockRejectedValueOnce(new Error('offline'));
    const tree = await render(36);
    await endReached(tree);

    const retry = tree.root.find(
      (n) =>
        n.type === Pressable &&
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Yüklenemedi')
    );
    expect(texts(tree)).toContain('tekrar dene');

    api.fetchUserAnimals.mockResolvedValueOnce({ animals: range(3, 23), total: 36 });
    await act(async () => retry.props.onPress());
    expect(api.fetchUserAnimals).toHaveBeenLastCalledWith(42, 20, 3);
    expect(loadedIds(tree)).toHaveLength(23);
    expect(texts(tree)).not.toContain('tekrar dene');
  });

  it('stops asking when a page brings nothing new', async () => {
    // Animals left the list between the count and the page, which still
    // reports the old count; believing it would ask for this page forever.
    api.fetchUserAnimals.mockResolvedValue({ animals: [], total: 36 });
    const tree = await render(36);
    await endReached(tree);
    expect(strip(tree).props.ListFooterComponent).toBeNull();
    await endReached(tree);
    expect(api.fetchUserAnimals).toHaveBeenCalledTimes(1);
  });
});
