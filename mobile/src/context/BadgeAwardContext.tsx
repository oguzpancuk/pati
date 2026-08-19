import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  BadgeAward,
  fetchUnseenBadgeAwards,
  markBadgeAwardsSeen,
  WithNewBadges,
} from '../api/users';
import BadgeAwardModal from '../components/BadgeAwardModal';

interface BadgeAwardContextValue {
  /** Queues the badges found in a point-earning request's response. */
  celebrate: (response: WithNewBadges | null | undefined) => void;
  /** Fetches missed badges (the app may have been closed) from the server. */
  checkPending: () => Promise<void>;
}

const BadgeAwardContext = createContext<BadgeAwardContextValue>({
  celebrate: () => {},
  checkPending: async () => {},
});

export function useBadgeAwards() {
  return useContext(BadgeAwardContext);
}

/**
 * Manages the badge celebration popup from one place. Badges can be earned
 * from actions on several screens (leaving food, adding an animal,
 * commenting, health records), so instead of a popup per screen we keep a
 * single queue above navigation.
 */
export function BadgeAwardProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<BadgeAward[]>([]);
  // Prevents the same badge queuing twice: a badge from an action response
  // can arrive again right after via checkPending.
  const queuedIds = useRef<Set<number>>(new Set());

  const enqueue = useCallback((awards: BadgeAward[]) => {
    const fresh = awards.filter((a) => !queuedIds.current.has(a.id));
    if (fresh.length === 0) return;
    fresh.forEach((a) => queuedIds.current.add(a.id));
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
      // The celebration popup is a secondary feature; skip silently on network errors.
    }
  }, [enqueue]);

  const dismissCurrent = useCallback(() => {
    setQueue((prev) => {
      const [shown, ...rest] = prev;
      if (shown) {
        // We don't await the seen-mark: if it fails the badge shows again on
        // the next launch, which beats losing it.
        markBadgeAwardsSeen([shown.id]).catch(() => {});
      }
      return rest;
    });
  }, []);

  const value = useMemo(() => ({ celebrate, checkPending }), [celebrate, checkPending]);

  return (
    <BadgeAwardContext.Provider value={value}>
      {children}
      <BadgeAwardModal
        award={queue[0] ?? null}
        remaining={Math.max(0, queue.length - 1)}
        onDismiss={dismissCurrent}
      />
    </BadgeAwardContext.Provider>
  );
}
