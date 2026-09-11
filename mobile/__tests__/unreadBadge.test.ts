jest.mock('../src/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

import { apiClient } from '../src/api/client';
import {
  fetchUnreadMessageCount,
  markConversationRead,
  subscribeUnreadMessageCount,
} from '../src/api/messages';

// The tab badge and the conversation screen used to race: the badge re-read
// the count on its own clock the moment the conversation was left, which is
// the same breath in which that conversation announced itself read, and the
// server answered whichever arrived first. The badge now FOLLOWS the read —
// every mark-read answers with the caller's new total, computed by the
// server in the request that stamped last_read_at — so there is no second
// number to disagree with. That is what these tests pin.

const mocked = apiClient as unknown as { get: jest.Mock; post: jest.Mock };

beforeEach(() => {
  mocked.get.mockReset();
  mocked.post.mockReset();
  mocked.get.mockResolvedValue({ data: { unreadCount: 0 } });
});

describe('markConversationRead', () => {
  it('publishes the total the read earned, without a second request', async () => {
    mocked.post.mockResolvedValue({ data: { read: true, unreadCount: 2 } });
    const seen: number[] = [];
    const stop = subscribeUnreadMessageCount((count) => seen.push(count));

    await expect(markConversationRead(7)).resolves.toBe(2);

    expect(seen).toEqual([2]);
    expect(mocked.post).toHaveBeenCalledWith('/messages/conversations/7/read');
    // The count came back with the read; nothing may have been asked for it.
    expect(mocked.get).not.toHaveBeenCalled();
    stop();
  });

  it('publishes nothing when the read failed', async () => {
    mocked.post.mockRejectedValue(new Error('offline'));
    const seen: number[] = [];
    const stop = subscribeUnreadMessageCount((count) => seen.push(count));

    await expect(markConversationRead(7)).rejects.toThrow('offline');

    expect(seen).toEqual([]);
    stop();
  });

  it('publishes nothing when the answer carries no count', async () => {
    // An older server, or a body we could not read: the badge keeps the
    // number it has rather than dropping to a guess.
    mocked.post.mockResolvedValue({ data: { read: true } });
    const seen: number[] = [];
    const stop = subscribeUnreadMessageCount((count) => seen.push(count));

    await expect(markConversationRead(7)).resolves.toBeNull();

    expect(seen).toEqual([]);
    stop();
  });

  it('stops delivering once the subscriber is gone', async () => {
    mocked.post.mockResolvedValue({ data: { read: true, unreadCount: 1 } });
    const seen: number[] = [];
    subscribeUnreadMessageCount((count) => seen.push(count))();

    await markConversationRead(7);

    expect(seen).toEqual([]);
  });
});

describe('fetchUnreadMessageCount', () => {
  it('asks the server for the total', async () => {
    mocked.get.mockResolvedValue({ data: { unreadCount: 3 } });
    expect(await fetchUnreadMessageCount()).toBe(3);
    expect(mocked.get).toHaveBeenCalledWith('/messages/unread-count');
  });
});
