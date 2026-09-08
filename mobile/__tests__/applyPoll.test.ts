import { applyPoll, Message, MessagesPage } from '../src/api/messages';

// The poll contract both clients rely on (web copies applyPoll verbatim):
// the cursor never moves on send, so a poll may bring back the echo of an
// own message next to a reply sent just before it, and admin deletions of
// messages already on screen arrive as `deleted` refs.

const sender = (id: number) => ({ id, name: `u${id}`, avatar_url: null });

function msg(id: number, senderId: number, body = `m${id}`): Message {
  return {
    id,
    conversationId: 1,
    sender: sender(senderId),
    body,
    deleted: false,
    deletedBySender: null,
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
    const next = applyPoll(
      current,
      page({ deleted: [{ id: 2, deletedBySender: false }] })
    );
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
});
