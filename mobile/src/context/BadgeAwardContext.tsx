import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  BadgeAward,
  fetchUnseenBadgeAwards,
  markBadgeAwardsSeen,
  WithNewBadges,
} from '../api/users';
import BadgeAwardModal from '../components/BadgeAwardModal';

interface BadgeAwardContextValue {
  /** Puan kazandıran bir isteğin yanıtındaki rozetleri kuyruğa alır. */
  celebrate: (response: WithNewBadges | null | undefined) => void;
  /** Kaçırılmış rozetleri (uygulama kapanmış olabilir) sunucudan çeker. */
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
 * Rozet kutlama popup'ını tek bir yerden yönetir. Rozet birden fazla ekrandaki
 * aksiyondan kazanılabildiği için (mama bırakma, hayvan ekleme, yorum, sağlık
 * kaydı) popup'ı her ekrana ayrı ayrı koymak yerine navigasyonun üstünde tek bir
 * kuyruk tutuyoruz.
 */
export function BadgeAwardProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<BadgeAward[]>([]);
  // Aynı rozetin iki kez kuyruğa girmesini engeller: aksiyon yanıtından gelen
  // rozet, hemen ardından checkPending ile de gelebiliyor.
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
      // Kutlama popup'ı ikincil bir özellik; ağ hatasında sessizce geçiyoruz.
    }
  }, [enqueue]);

  const dismissCurrent = useCallback(() => {
    setQueue((prev) => {
      const [shown, ...rest] = prev;
      if (shown) {
        // Görüldü işaretini beklemiyoruz: başarısız olursa rozet bir sonraki
        // açılışta tekrar gösterilir, bu kaybolmasından iyidir.
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
