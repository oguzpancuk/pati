import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { BadgeAward, fetchUnseenBadgeAwards, markBadgeAwardsSeen, WithNewBadges } from './api';
import { BadgeAwardModal } from './badges';

interface Value {
  /** Puan kazandıran bir isteğin yanıtındaki rozetleri kuyruğa alır. */
  celebrate: (response: WithNewBadges | null | undefined) => void;
  /** Kaçırılmış rozetleri (sekme kapalıyken kazanılmış) sunucudan çeker. */
  checkPending: () => Promise<void>;
}

const Ctx = createContext<Value>({ celebrate: () => {}, checkPending: async () => {} });
export const useBadgeAwards = () => useContext(Ctx);

/**
 * Rozet kutlamasını tek yerden yönetir (mobildeki BadgeAwardContext ile aynı
 * mantık): rozet birçok sayfadaki aksiyondan kazanılabildiği için popup
 * navigasyonun üstünde tek bir kuyruk.
 */
export function BadgeAwardProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<BadgeAward[]>([]);
  // Aynı rozet hem aksiyon yanıtından hem checkPending'den gelebilir.
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
      // İkincil özellik; ağ hatasında sessizce geç.
    }
  }, [enqueue]);

  const dismiss = useCallback(() => {
    setQueue((prev) => {
      const [shown, ...rest] = prev;
      // Görüldü işaretini beklemiyoruz: başarısız olursa rozet bir sonraki
      // açılışta tekrar gösterilir — kaybolmasından iyi.
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
