import type React from 'react';
import { BadgeAwardModal } from 'pati-web';

/**
 * Modal `position: fixed` bir katman; kart kutusuna sığması için transformlu
 * bir sarmalayıcı (fixed öğeler transformlu ataya göre konumlanır) — 420×720
 * telefon çerçevesi, uygulamadaki görünümle aynı.
 */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', width: 420, height: 720, overflow: 'hidden', transform: 'translate(0,0)', background: 'var(--background)', borderRadius: 24 }}>
      {children}
    </div>
  );
}

const award = { id: 1, badgeKey: 'breed:Tekir', tier: 'gold' as const, label: 'Tekir Dostu', pointsAwarded: 60, pointsBefore: 94, pointsAfter: 154, rankBefore: 21, rankAfter: 12, levelBefore: 2, levelAfter: 3, createdAt: '2026-08-19T08:00:00Z' };

/** Yeni rozet: sıra yükseldi, seviye atlandı, sırada 2 rozet daha. */
export const SeviyeAtladi = () => (
  <Phone>
    <BadgeAwardModal award={award} remaining={2} onDismiss={() => {}} />
  </Phone>
);

/** İlk rozet: karşılaştıracak önceki sıra yok. */
export const IlkRozet = () => (
  <Phone>
    <BadgeAwardModal
      award={{ ...award, badgeKey: 'streak:feeder', tier: 'bronze', label: 'Mama Gönüllüsü', pointsAwarded: 10, pointsBefore: null, pointsAfter: 10, rankBefore: null, rankAfter: 88, levelBefore: 1, levelAfter: 1 }}
      remaining={0}
      onDismiss={() => {}}
    />
  </Phone>
);
