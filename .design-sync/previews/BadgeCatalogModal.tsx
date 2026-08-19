import type React from 'react';
import { BadgeCatalogModal } from 'pati-web';

/**
 * Modal `position: fixed` bir katman; kart kutusuna sığması için transformlu
 * bir sarmalayıcı (fixed öğeler transformlu ataya göre konumlanır) — 420×720
 * telefon çerçevesi, uygulamadaki alt-sayfa görünümüyle aynı.
 */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', width: 420, height: 720, overflow: 'hidden', transform: 'translate(0,0)', background: 'var(--background)', borderRadius: 24 }}>
      {children}
    </div>
  );
}

const badges = [
  { key: 'streak:feeder', label: 'Mama Gönüllüsü', unit: 'gün', value: 9, tier: 'silver' as const, points: 25, nextThreshold: 30, symbol: 'food' as const },
  { key: 'streak:water', label: 'Su Gönüllüsü', unit: 'gün', value: 2, tier: 'bronze' as const, points: 10, nextThreshold: 7, symbol: 'water' as const },
  { key: 'breed:Tekir', label: 'Tekir Dostu', unit: 'kayıt', value: 5, tier: 'gold' as const, points: 60, nextThreshold: 10, symbol: 'paw' as const },
  { key: 'count:commenter', label: 'Takip Gönüllüsü', unit: 'yorum', value: 7, tier: 'bronze' as const, points: 10, nextThreshold: 10, symbol: 'comment' as const },
  { key: 'count:vaccinator', label: 'Aşı Takipçisi', unit: 'aşı', value: 0, tier: null, points: 0, nextThreshold: 1, symbol: 'vaccine' as const },
];

/** Kendi profilinde: öne çıkacak 3 rozeti seçme modu. */
export const SecimModu = () => (
  <Phone>
    <BadgeCatalogModal open onClose={() => {}} badges={badges} selectable featuredKeys={['breed:Tekir']} onSaveFeatured={() => {}} />
  </Phone>
);

/** Başkasının profilinde: salt görüntüleme. */
export const SaltGoruntule = () => (
  <Phone>
    <BadgeCatalogModal open onClose={() => {}} badges={badges} />
  </Phone>
);
