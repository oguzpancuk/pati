import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { BadgeAward, fetchUnseenBadgeAwards, markBadgeAwardsSeen, WithNewBadges } from './api';
import { BadgeAwardModal } from './badges';

interface Value {
  /** Queues the badges found in a point-earning request's response. */
  celebrate: (response: WithNewBadges | null | undefined) => void;
  /** Fetches missed badges (earned while the tab was closed) from the server. */
  checkPending: () => Promise<void>;
}

const Ctx = createContext<Value>({ celebrate: () => {}, checkPending: async () => {} });
export const useBadgeAwards = () => useContext(Ctx);

/**
 * Manages the badge celebration from one place (same logic as mobile's
 * BadgeAwardContext): badges can be earned from actions on many pages, so
 * the popup is a single queue above navigation.
 */
export function BadgeAwardProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<BadgeAward[]>([]);
  // The same badge can arrive both from an action response and from checkPending.
  const queued = useRef<Set<number>>(new Set());

  const enqueue = useCallback((awards: BadgeAward[]) => {
    const fresh = awards.filter((a) => !queued.current.has(a.id));
    if (!fresh.length) return;
    fresh.forEach((a) => queued.current.add(a.id));
    setQueue((prev) => [...prev, ...fresh]);
  }, []);

  const celebrate = useCallback(
    (response: WithNewBadges | null | undefined) => {
      if (response?.newBadges?.length) enqueue(response.newBadges);
    },
    [enqueue]
  );

  const checkPending = useCallback(async () => {
    try {
      enqueue(await fetchUnseenBadgeAwards());
    } catch {
      // Secondary feature; skip silently on network errors.
    }
  }, [enqueue]);

  const dismiss = useCallback(() => {
    setQueue((prev) => {
      const [shown, ...rest] = prev;
      // We don't await the seen-mark: if it fails, the badge shows again on
      // the next launch — better than losing it.
      if (shown) markBadgeAwardsSeen([shown.id]).catch(() => {});
      return rest;
    });
  }, []);

  const value = useMemo(() => ({ celebrate, checkPending }), [celebrate, checkPending]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <BadgeAwardModal
        award={queue[0] ?? null}
        remaining={Math.max(0, queue.length - 1)}
        onDismiss={dismiss}
      />
    </Ctx.Provider>
  );
}
