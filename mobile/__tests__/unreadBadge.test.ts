jest.mock('../src/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

import { apiClient } from '../src/api/client';
import { fetchUnreadMessageCount, markConversationRead } from '../src/api/messages';

// The tab badge re-reads the unread count the moment a conversation screen
// is left, which is the same breath in which that conversation announced
// itself read. The two calls are a race at the server, and the badge loses
// it whenever the read is still on the wire: it then shows messages the user
// has already read until the next minute's tick (review finding). The count
// therefore waits for a read in flight — that is what these tests pin.

const mocked = apiClient as unknown as { get: jest.Mock; post: jest.Mock };

/** A promise whose settling this test controls, standing in for the request. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every already-queued microtask run, without settling anything new. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mocked.get.mockReset();
  mocked.post.mockReset();
  mocked.get.mockResolvedValue({ data: { unreadCount: 0 } });
});

describe('fetchUnreadMessageCount', () => {
  it('waits for a mark-read still in flight before asking the server', async () => {
    const read = deferred<unknown>();
    mocked.post.mockReturnValue(read.promise);

    const marking = markConversationRead(7);
    const counting = fetchUnreadMessageCount();
    await flush();
    // The read has not landed yet, so the server would still answer with the
    // old number: nothing may have been asked.
    expect(mocked.get).not.toHaveBeenCalled();

    read.resolve({ data: {} });
    await marking;
    expect(await counting).toBe(0);
    expect(mocked.get).toHaveBeenCalledTimes(1);
  });

  it('still reads the count when the mark-read failed', async () => {
    const read = deferred<unknown>();
    mocked.post.mockReturnValue(read.promise);
    mocked.get.mockResolvedValue({ data: { unreadCount: 3 } });

    const marking = markConversationRead(7).catch(() => {});
    const counting = fetchUnreadMessageCount();
    read.reject(new Error('offline'));
    await marking;

    expect(await counting).toBe(3);
  });

  it('asks straight away when no read is running', async () => {
    mocked.get.mockResolvedValue({ data: { unreadCount: 2 } });
    expect(await fetchUnreadMessageCount()).toBe(2);
    expect(mocked.get).toHaveBeenCalledWith('/messages/unread-count');
  });
});
