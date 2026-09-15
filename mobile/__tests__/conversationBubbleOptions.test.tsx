/**
 * A tap on a message bubble opens its options (owner, 2026-09-15): reply,
 * delete for your own message or as a group admin, report for someone
 * else's. The long press that used to be the only way still opens them. A
 * tap on the quote inside a reply jumps to its source instead; a deleted
 * placeholder and a system line offer nothing.
 *
 * The screen's own logic runs; the design system, the network and the
 * contexts around it are stand-ins. The props are called directly, so what
 * this proves is which handler each Pressable carries — that RN hands a tap
 * on the quote to the inner Pressable alone is the responder system's job,
 * and the simulator's check.
 */
import React from 'react';
import { Alert, AlertButton, FlatList, Pressable } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import ConversationScreen from '../src/screens/ConversationScreen';
import * as messagesApi from '../src/api/messages';
import type { ConversationDetail, Message } from '../src/api/messages';

jest.mock('../src/api/messages', () => ({
  ...jest.requireActual('../src/api/messages'),
  deleteMessage: jest.fn(),
  fetchConversation: jest.fn(),
  fetchMessages: jest.fn(),
  markConversationRead: jest.fn(),
  reportMessage: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const R = require('react');
  return {
    // why `any`: the stand-in only calls the callback on mount.
    useFocusEffect: (effect: any) => R.useEffect(() => effect(), [effect]),
  };
});

const ME = 7;
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7 } }) }));
jest.mock('../src/components/brand', () => ({ Icon: () => null }));

jest.mock('../src/theme', () => {
  // why: any style or colour key resolves to something; the test reads none.
  const anything: any = new Proxy({}, { get: () => anything });
  return {
    fonts: anything,
    hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
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
  const Nothing = () => null;
  return {
    Avatar: Nothing,
    Button: Nothing,
    Chip: Nothing,
    KeyboardInsetView: ({ children }: any) => R.createElement(V, null, children),
    LoadingState: Nothing,
    Text: ({ children }: any) => R.createElement(T, null, children),
  };
});

const api = messagesApi as jest.Mocked<typeof messagesApi>;

const person = (id: number, name: string) => ({ id, name, avatar_url: null });

function msg(
  id: number,
  senderId: number | null,
  body: string | null,
  extra: Partial<Message> = {}
) {
  return {
    id,
    conversationId: 1,
    kind: 'user',
    sender: senderId === ME ? person(ME, 'Ben') : senderId ? person(senderId, 'Ayşe') : null,
    body,
    deleted: false,
    deletedBySender: null,
    replyTo: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    ...extra,
  } as Message;
}

const MESSAGES: Message[] = [
  msg(1, 8, 'mama bıraktım'),
  msg(2, ME, 'teşekkürler', {
    replyTo: { id: 1, sender: { id: 8, name: 'Ayşe' }, excerpt: 'mama bıraktım', deleted: false },
  }),
  msg(3, 8, null, { deleted: true, deletedBySender: true }),
  msg(4, null, 'Ayşe gruba yeni üye ekledi: Can', { kind: 'system' }),
];

function detail(overrides: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: 1,
    kind: 'direct',
    name: 'Ayşe',
    role: 'member',
    createdBy: ME,
    createdAt: '2026-09-01T10:00:00.000Z',
    otherUser: person(8, 'Ayşe'),
    canSend: true,
    members: [],
    ...overrides,
  };
}

let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  api.fetchConversation.mockResolvedValue(detail());
  api.fetchMessages.mockResolvedValue({
    messages: MESSAGES,
    deleted: [],
    hasMore: false,
    now: '2026-09-15T10:00:01.000Z',
  });
  api.markConversationRead.mockResolvedValue(undefined as any); // why: the screen ignores the answer
});

let mounted: ReactTestRenderer | null = null;

afterEach(() => {
  // The screen's poll timer goes with it.
  if (mounted) act(() => mounted!.unmount());
  mounted = null;
  jest.restoreAllMocks();
});

async function render() {
  const navigation = { setOptions: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ConversationScreen navigation={navigation} route={{ params: { conversationId: 1 } }} />
    );
  });
  mounted = tree;
  return tree;
}

/** The bubble Pressable whose accessibility label starts with this: who wrote it, then the text. */
const bubble = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (n) =>
      n.type === Pressable &&
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith(label)
  );

const quoteIn = (node: ReactTestInstance) =>
  node.find((n) => n.type === Pressable && n.props.accessibilityLabel === 'Alıntılanan mesaja git');

/** The button titles of the last options alert. */
const options = () => {
  expect(alert).toHaveBeenCalledTimes(1);
  const [title, , buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
  expect(title).toBe('Mesaj');
  return buttons.map((b) => b.text);
};

describe('a message bubble', () => {
  it("opens someone else's options on a tap: reply and report", async () => {
    const tree = await render();
    const b = bubble(tree, 'Ayşe: mama bıraktım');
    expect(b.props.accessibilityRole).toBe('button');
    act(() => b.props.onPress());
    expect(options()).toEqual(['Yanıtla', 'Şikayet et', 'Vazgeç']);
  });

  it('opens your own options on a tap: reply and delete', async () => {
    const tree = await render();
    act(() => bubble(tree, 'Sen: ').props.onPress());
    expect(options()).toEqual(['Yanıtla', 'Sil', 'Vazgeç']);
  });

  it("gives a group admin the delete on someone else's message", async () => {
    api.fetchConversation.mockResolvedValue(
      detail({ kind: 'group', role: 'admin', otherUser: null })
    );
    const tree = await render();
    act(() => bubble(tree, 'Ayşe: mama bıraktım').props.onPress());
    expect(options()).toEqual(['Yanıtla', 'Sil', 'Şikayet et', 'Vazgeç']);
  });

  it('still opens the options on a long press', async () => {
    const tree = await render();
    act(() => bubble(tree, 'Ayşe: mama bıraktım').props.onLongPress());
    expect(options()).toEqual(['Yanıtla', 'Şikayet et', 'Vazgeç']);
  });

  it('jumps to the quoted message on a quote tap without opening the options', async () => {
    const tree = await render();
    const list = tree.root.findByType(FlatList).instance as FlatList<Message>;
    const scrollToIndex = jest.spyOn(list, 'scrollToIndex').mockImplementation(() => {});
    const reply = bubble(tree, 'Sen: ');
    act(() => quoteIn(reply).props.onPress());
    expect(alert).not.toHaveBeenCalled();
    // The inverted list holds the newest first: message 1 is the last row.
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 3, viewPosition: 0.5, animated: true });
  });

  it('reaches the options and the quote through accessibility actions', async () => {
    const tree = await render();
    const list = tree.root.findByType(FlatList).instance as FlatList<Message>;
    const scrollToIndex = jest.spyOn(list, 'scrollToIndex').mockImplementation(() => {});
    const reply = bubble(tree, 'Sen: ');
    expect(reply.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'activate',
      'quote',
    ]);
    act(() => reply.props.onAccessibilityAction({ nativeEvent: { actionName: 'quote' } }));
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    act(() => reply.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
    expect(options()).toEqual(['Yanıtla', 'Sil', 'Vazgeç']);
  });

  it('offers nothing on a deleted placeholder or a system line', async () => {
    const tree = await render();
    const deleted = bubble(tree, 'Ayşe: Bu mesaj silindi');
    expect(deleted.props.onPress).toBeUndefined();
    expect(deleted.props.onLongPress).toBeUndefined();
    expect(deleted.props.accessibilityRole).toBeUndefined();
    const systemPressables = tree.root.findAll(
      (n) =>
        n.type === Pressable &&
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.includes('gruba yeni üye')
    );
    expect(systemPressables).toHaveLength(0);
    // The system line still renders, as plain text.
    expect(
      tree.root.findAll(
        (n) => typeof n.type === 'string' && n.props.children === 'Ayşe gruba yeni üye ekledi: Can'
      )
    ).not.toHaveLength(0);
  });
});
