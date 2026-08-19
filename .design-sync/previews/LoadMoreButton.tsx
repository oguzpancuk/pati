import { LoadMoreButton } from 'pati-web';

/** Profildeki "bakım verdiğim hayvanlar" listesinin altında: kaç kayıt daha var. */
export const KalanKayit = () => <LoadMoreButton remaining={12} onClick={() => {}} />;

/** Sohbette en yeniden geriye: farklı etiket. */
export const OncekiYorumlar = () => (
  <LoadMoreButton remaining={29} label="Önceki yorumları yükle" onClick={() => {}} />
);

/** Yükleniyor durumu: pasif, metin değişir. */
export const Yukleniyor = () => <LoadMoreButton remaining={12} loading onClick={() => {}} />;
