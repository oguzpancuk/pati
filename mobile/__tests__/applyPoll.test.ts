import { applyPoll, Message, MessagesPage, quoteOf, withDeleted } from '../src/api/messages';

// The poll contract both clients rely on (web copies applyPoll verbatim):
// the cursor never moves on send, so a poll may bring back the echo of an
// own message next to a reply sent just before it, and admin deletions of
// messages already on screen arrive as `deleted` refs.

const sender = (id: number) => ({ id, name: `u${id}`, avatar_url: null });
// A quote names its sender without the avatar.
const quoted = (id: number) => ({ id, name: `u${id}` });

function msg(id: number, senderId: number, body = `m${id}`): Message {
  return {
    id,
    conversationId: 1,
    sender: sender(senderId),
    body,
    deleted: false,
    deletedBySender: null,
    replyTo: null,
    createdAt: `2026-09-08T10:00:${String(id).padStart(2, '0')}.000Z`,
  };
}

const page = (overrides: Partial<MessagesPage>): MessagesPage => ({
  messages: [],
  deleted: [],
  hasMore: false,
  now: '2026-09-08T10:01:00.000Z',
  ...overrides,
});

describe('applyPoll', () => {
  it('appends new messages and skips the echo of an already-shown one', () => {
    const current = [msg(1, 1), msg(2, 2)];
    const next = applyPoll(current, page({ messages: [msg(2, 2), msg(3, 1)] }));
    expect(next.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('keeps id order when a reply sent before an own message arrives after it', () => {
    // Own message 10 was appended optimistically; the reply 9 was sent first
    // but is only learned on the poll (the finding that motivated this).
    const current = [msg(8, 2), msg(10, 1)];
    const next = applyPoll(current, page({ messages: [msg(9, 2), msg(10, 1)] }));
    expect(next.map((m) => m.id)).toEqual([8, 9, 10]);
  });

  it('blanks a deleted message it holds and records who deleted it', () => {
    const current = [msg(1, 1), msg(2, 2)];
    const next = applyPoll(current, page({ deleted: [{ id: 2, deletedBySender: false }] }));
    expect(next[1]).toMatchObject({ id: 2, body: null, deleted: true, deletedBySender: false });
    expect(next[0].deleted).toBe(false);
  });

  it('leaves an already-deleted message alone when the deletion is reported again', () => {
    const already: Message = { ...msg(2, 2), body: null, deleted: true, deletedBySender: true };
    const next = applyPoll([already], page({ deleted: [{ id: 2, deletedBySender: true }] }));
    expect(next[0]).toBe(already);
  });

  it('ignores a deletion for a message it does not hold', () => {
    const next = applyPoll([msg(1, 1)], page({ deleted: [{ id: 99, deletedBySender: null }] }));
    expect(next.map((m) => m.id)).toEqual([1]);
  });

  it('blanks the quote of a message whose source the poll reports deleted', () => {
    const reply: Message = { ...msg(3, 1), replyTo: quoteOf(msg(2, 2, 'kaynak')) };
    const next = applyPoll(
      [msg(2, 2, 'kaynak'), reply],
      page({ deleted: [{ id: 2, deletedBySender: true }] })
    );
    expect(next[0].deleted).toBe(true);
    expect(next[1].replyTo).toEqual({ id: 2, sender: quoted(2), excerpt: null, deleted: true });
    // The reply itself is untouched.
    expect(next[1]).toMatchObject({ id: 3, body: 'm3', deleted: false });
  });

  it('blanks a quote even when the source is no longer in the list', () => {
    const reply: Message = { ...msg(3, 1), replyTo: quoteOf(msg(2, 2, 'kaynak')) };
    const next = withDeleted([reply], [{ id: 2, deletedBySender: false }]);
    expect(next[0].replyTo?.deleted).toBe(true);
    expect(next[0].replyTo?.excerpt).toBeNull();
  });

  it('withDeleted returns the same array for an empty list of deletions', () => {
    const current = [msg(1, 1)];
    expect(withDeleted(current, [])).toBe(current);
  });
});

describe('quoteOf', () => {
  it('folds whitespace and cuts at 120 characters with an ellipsis, like the server', () => {
    const q = quoteOf(msg(5, 2, `  a  b\n${'x'.repeat(200)}`));
    expect(q.excerpt).toHaveLength(121);
    expect(q.excerpt?.startsWith('a b x')).toBe(true);
    expect(q.excerpt?.endsWith('…')).toBe(true);
    expect(q).toMatchObject({ id: 5, sender: { id: 2, name: 'u2' }, deleted: false });
  });

  it('keeps a short body whole', () => {
    expect(quoteOf(msg(5, 2, 'selam')).excerpt).toBe('selam');
  });

  it('carries no excerpt for a deleted source', () => {
    const q = quoteOf({ ...msg(5, 2), body: null, deleted: true, deletedBySender: true });
    expect(q).toEqual({ id: 5, sender: quoted(2), excerpt: null, deleted: true });
  });
});
