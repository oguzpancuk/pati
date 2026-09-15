/**
 * The animal profile's comment composer is chat content (owner, 2026-09-15):
 * it sits in the scroll view after the comments and scrolls away with the
 * page, where it used to be a bar pinned under the page. The screen asks the
 * scroll view for the iOS keyboard inset, and it scrolls to the end, where
 * the composer shows, when its field takes focus on iOS, again once the iOS
 * keyboard has shown while the field has focus, and after a sent comment has
 * been rendered. The match review's decision bar stays pinned. With the
 * animal's report moved to the header's flag (owner, 2026-09-15), the
 * composer is the last thing on the page.
 *
 * The screen's own logic runs; the design system, the map, the network and
 * the contexts around it are stand-ins. What iOS does with the inset and the
 * scroll is the simulator's check, not something jest can observe.
 */
import React from 'react';
import { EmitterSubscription, Keyboard, Platform, Pressable, TextInput } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import AnimalProfileScreen from '../src/screens/AnimalProfileScreen';
import * as animalsApi from '../src/api/animals';

const mockScrollToEnd = jest.fn();

jest.mock('../src/api/animals', () => ({
  addAnimalComment: jest.fn(),
  addHealthRecord: jest.fn(),
  addVaccination: jest.fn(),
  fetchAnimal: jest.fn(),
  fetchAnimalComments: jest.fn(),
  followAnimal: jest.fn(),
  markHealthRecordRecovered: jest.fn(),
  reopenHealthRecord: jest.fn(),
  unfollowAnimal: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const R = require('react');
  return {
    // why `any`: the stand-in only calls the callback on mount.
    useFocusEffect: (effect: any) => R.useEffect(() => effect(), [effect]),
  };
});

jest.mock('@maplibre/maplibre-react-native', () => ({
  Camera: () => null,
  MapView: () => null,
  MarkerView: () => null,
}));
jest.mock('../src/map/styles', () => ({ mapStyles: {} }));

jest.mock('../src/components/AdBanner', () => () => null);
jest.mock('../src/components/AnimalAvatar', () => () => null);
jest.mock('../src/components/AnimalBadgeLadderModal', () => () => null);
jest.mock('../src/components/AnimalLocationSheet', () => () => null);
jest.mock('../src/components/DemoChip', () => () => null);
jest.mock('../src/components/badges', () => ({ BadgeSymbol: () => null }));
jest.mock('../src/components/brand', () => ({ Icon: () => null }));
// The report links mark where they are; the sheet shows whether it is open.
jest.mock('../src/components/ReportSheet', () => {
  const { View: V } = require('react-native');
  const R = require('react');
  // why `any`: only targetType and visible are read.
  return {
    __esModule: true,
    default: ({ targetType }: any) => R.createElement(V, { testID: `report:${targetType}` }),
    ReportSheet: ({ targetType, visible }: any) =>
      R.createElement(V, { testID: `reportSheet:${targetType}`, visible }),
  };
});

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7 } }) }));
jest.mock('../src/context/BadgeAwardContext', () => ({
  useBadgeAwards: () => ({ celebrate: jest.fn() }),
}));

jest.mock('../src/theme', () => {
  // why: any style or colour key resolves to something; the test reads none.
  const anything: any = new Proxy({}, { get: () => anything });
  return {
    fonts: anything,
    makeStyles: () => () => anything,
    radius: anything,
    // Real numbers: the photo tile size is arithmetic on these.
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
    useTheme: () => ({ name: 'light', colors: anything }),
  };
});

// Plain host components with the props the screen passes. Screen is a View
// marked `screen` that hands the screen a scroll view whose scrollToEnd is
// recorded. why `any`: only those props are read.
jest.mock('../src/components/ui', () => {
  const { Pressable: P, Text: T, View: V } = require('react-native');
  const R = require('react');
  const Pass = ({ children }: any) => R.createElement(V, null, children);
  const Nothing = () => null;
  return {
    Avatar: Nothing,
    Button: ({ title, onPress, disabled }: any) =>
      R.createElement(
        P,
        { onPress, disabled, accessibilityLabel: title },
        R.createElement(T, null, title)
      ),
    Card: Pass,
    Chip: ({ label, onPress }: any) =>
      R.createElement(
        P,
        { onPress, accessibilityLabel: `chip:${label}` },
        R.createElement(T, null, label)
      ),
    ChoiceField: Nothing,
    Input: Nothing,
    LoadingState: Nothing,
    LoadMoreButton: Nothing,
    Screen: ({ children, scrollRef, ...props }: any) => {
      R.useImperativeHandle(scrollRef, () => ({ scrollToEnd: mockScrollToEnd }));
      return R.createElement(V, { ...props, testID: 'screen' }, children);
    },
    SectionHeader: Nothing,
    Tag: Nothing,
    Text: ({ children, onPress }: any) => R.createElement(T, { onPress }, children),
  };
});

const api = animalsApi as jest.Mocked<typeof animalsApi>;

function comment(id: number, body: string) {
  return {
    id,
    body,
    created_at: '2026-09-15T12:00:00Z',
    health_record_id: null,
    user_id: 8,
    user_name: 'Ayşe',
    avatar_url: null,
    user_is_demo: false,
    health_record_type: null,
    health_record_description: null,
  };
}

// why `as any` on the API answers: they carry only the fields the screen
// reads, not the full response types.
const animal = {
  id: 51840,
  species: 'cat',
  name: 'Pamuk',
  breed: 'Tekir',
  color: null,
  markings: null,
  is_demo: false,
  cover_thumb_url: null,
  location: { type: 'Point', coordinates: [29.03, 40.99] },
  location_updated_at: '2026-09-14T12:56:00Z',
  photos: [],
  vaccinations: [],
  // An open record, so the composer also has its chip row.
  healthRecords: [
    {
      id: 3,
      record_type: 'illness',
      description: 'Uyuz',
      status: 'in_treatment',
      vet_verified: false,
      recorded_by: 7,
      recorded_by_name: 'B1 Bakıcı',
      comment_count: 0,
    },
  ],
  carers: [{ id: 7, name: 'B1 Bakıcı', avatar_url: null, is_demo: false }],
  badges: [],
  badgeLadder: [],
  isCarer: true,
  isFollowing: true,
  followerCount: 1,
  carerCount: 1,
};

const BEFORE = [
  comment(1, 'mama bıraktım'),
  comment(2, 'su tazelendi'),
  comment(3, 'kabı yıkadım'),
];
const SENT = comment(4, 'akşam yine uğradım');

let sent = false;
// The keyboard listeners the screen registered, by event type.
let keyboardListeners: Record<string, () => void>;
const removeKeyboardListener = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  sent = false;
  keyboardListeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventType, listener) => {
    keyboardListeners[eventType] = listener as () => void;
    // why: the screen only calls remove(); a real EmitterSubscription needs
    // an emitter this test has no use for.
    return { remove: removeKeyboardListener } as unknown as EmitterSubscription;
  });
  api.fetchAnimal.mockResolvedValue(animal as any);
  api.fetchAnimalComments.mockImplementation(async () =>
    sent
      ? ({ comments: [...BEFORE.slice(1), SENT], total: 4 } as any)
      : ({ comments: BEFORE, total: 3 } as any)
  );
  api.addAnimalComment.mockImplementation(async () => {
    sent = true;
    return SENT as any;
  });
});

afterEach(() => {
  // Also puts back Platform.OS where a case replaced it.
  jest.restoreAllMocks();
});

let navigation: { setOptions: jest.Mock; navigate: jest.Mock; push: jest.Mock };

async function render(params: object = {}) {
  navigation = { setOptions: jest.fn(), navigate: jest.fn(), push: jest.fn() };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <AnimalProfileScreen
        navigation={navigation}
        route={{ params: { animalId: 51840, ...params } }}
      />
    );
  });
  return tree;
}

/** What the header's right slot shows now: the last headerRight handed over. */
function headerRight(): ReactTestRenderer | null {
  const calls = navigation.setOptions.mock.calls.filter(([o]) => 'headerRight' in o);
  const element = calls[calls.length - 1]?.[0].headerRight();
  if (!element) return null;
  let header!: ReactTestRenderer;
  act(() => {
    header = create(element);
  });
  return header;
}

const reportSheetOpen = (tree: ReactTestRenderer) =>
  tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'reportSheet:animal').props
    .visible;

const screenOf = (tree: ReactTestRenderer) =>
  tree.root.find((n) => n.props.testID === 'screen' && typeof n.type === 'string');

const composerInputs = (node: ReactTestInstance) =>
  node.findAll((n) => n.type === TextInput && n.props.placeholder === 'Yorum yaz…');

const hasText = (tree: ReactTestRenderer, text: string) =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === text).length > 0;

describe('the animal profile comment composer', () => {
  it('sits in the scroll view after the last comment, as the last thing on the page', async () => {
    const tree = await render();
    const screen = screenOf(tree);
    const [input] = composerInputs(screen);
    expect(input).toBeDefined();
    // Nothing outside the scroll view offers a second composer.
    expect(composerInputs(tree.root)).toHaveLength(1);

    const order = tree.root.findAll(() => true);
    const lastComment = tree.root.find(
      (n) => typeof n.type === 'string' && n.props.children === 'kabı yıkadım'
    );
    expect(order.indexOf(lastComment)).toBeLessThan(order.indexOf(input));
    // No report link for the animal is left in the page; the last child of
    // the scroll view is the composer.
    expect(
      tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'report:animal')
    ).toHaveLength(0);
    const children = screen.children as ReactTestInstance[];
    expect(children[children.length - 1].findAll((n) => n === input)).toHaveLength(1);

    // The record chips ride along, and a tap on one keeps the keyboard.
    const chip = screen.find(
      (n) => n.type === Pressable && n.props.accessibilityLabel === 'chip:genel'
    );
    let chipRow: ReactTestInstance | null = chip.parent;
    while (chipRow && chipRow.props.horizontal !== true) chipRow = chipRow.parent;
    expect(chipRow?.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('asks the scroll view for the keyboard inset', async () => {
    const tree = await render();
    expect(screenOf(tree).props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('scrolls to the end after the sent comment has been rendered', async () => {
    const tree = await render();
    let newCommentShown: boolean | null = null;
    mockScrollToEnd.mockImplementation(() => {
      newCommentShown = hasText(tree, SENT.body);
    });
    const [input] = composerInputs(tree.root);
    await act(async () => {
      input.props.onChangeText(SENT.body);
    });
    const send = tree.root.find(
      (n) => n.type === Pressable && n.props.accessibilityLabel === 'Gönder'
    );
    await act(async () => {
      await send.props.onPress();
    });

    expect(api.addAnimalComment).toHaveBeenCalledWith(51840, SENT.body, undefined);
    expect(mockScrollToEnd).toHaveBeenCalledTimes(1);
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });
    expect(newCommentShown).toBe(true);
    expect(composerInputs(screenOf(tree))[0].props.value).toBe('');
  });

  it('does not scroll when the send fails', async () => {
    api.addAnimalComment.mockRejectedValue(new Error('ağ yok'));
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    const tree = await render();
    const [input] = composerInputs(tree.root);
    await act(async () => {
      input.props.onChangeText('deneme');
    });
    const send = tree.root.find(
      (n) => n.type === Pressable && n.props.accessibilityLabel === 'Gönder'
    );
    await act(async () => {
      await send.props.onPress();
    });
    expect(alert).toHaveBeenCalled();
    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });

  it('scrolls to the end when the field takes focus on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const tree = await render();
    const [input] = composerInputs(tree.root);
    await act(async () => {
      input.props.onFocus();
    });
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('scrolls to the end again once the iOS keyboard has shown over the focused field', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const tree = await render();
    const didShow = keyboardListeners.keyboardDidShow;
    expect(didShow).toBeDefined();

    // A keyboard for something else (a modal's field) leaves the page alone.
    act(() => didShow());
    expect(mockScrollToEnd).not.toHaveBeenCalled();

    // The field took focus before the keyboard came up: the focus-time
    // scroll ran without the inset, so the did-show one has to run too.
    const [input] = composerInputs(tree.root);
    await act(async () => {
      input.props.onFocus();
    });
    mockScrollToEnd.mockClear();
    act(() => didShow());
    expect(mockScrollToEnd).toHaveBeenCalledTimes(1);
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });

    // Once the field lets go, a later keyboard is not the composer's.
    await act(async () => {
      input.props.onBlur();
    });
    mockScrollToEnd.mockClear();
    act(() => didShow());
    expect(mockScrollToEnd).not.toHaveBeenCalled();

    act(() => tree.unmount());
    expect(removeKeyboardListener).toHaveBeenCalled();
  });

  it('leaves a focused field to the window resize on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const tree = await render();
    const [input] = composerInputs(tree.root);
    expect(input.props.onFocus).toBeUndefined();
    expect(keyboardListeners.keyboardDidShow).toBeUndefined();
  });

  it('keeps the match review decision pinned outside the scroll view, with no composer', async () => {
    const tree = await render({ matchReview: true, matchHit: true });
    expect(composerInputs(tree.root)).toHaveLength(0);
    const back = tree.root.find(
      (n) => n.type === Pressable && n.props.accessibilityLabel === 'Geri dön'
    );
    const inScreen = screenOf(tree).findAll((n) => n === back);
    expect(inScreen).toHaveLength(0);
  });
});

describe('the animal profile report action', () => {
  it('is a flag in the header that opens the animal report sheet', async () => {
    const tree = await render();
    expect(reportSheetOpen(tree)).toBe(false);
    const header = headerRight();
    const flag = header!.root.find(
      (n) => n.type === Pressable && n.props.accessibilityLabel === 'Şikayet et'
    );
    await act(async () => {
      flag.props.onPress();
    });
    expect(reportSheetOpen(tree)).toBe(true);
    // The per-comment links stay in the chat.
    expect(
      tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'report:comment')
    ).toHaveLength(BEFORE.length);
  });

  it('is not offered before the profile has loaded', async () => {
    api.fetchAnimal.mockReturnValue(new Promise(() => {}));
    await render();
    expect(headerRight()).toBeNull();
  });

  it('opens on its own for the ?report=1 deep link', async () => {
    const tree = await render({ report: true });
    expect(reportSheetOpen(tree)).toBe(true);
  });

  it('is hidden in match review, with the other secondary actions', async () => {
    const tree = await render({ matchReview: true, matchHit: true, report: true });
    expect(headerRight()).toBeNull();
    expect(reportSheetOpen(tree)).toBe(false);
  });
});
