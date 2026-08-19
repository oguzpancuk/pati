import { LevelMark } from 'pati-web';

/** Seviye amblemi: yaprak sayısı seviyeyle büyür (3 + seviye). */
export const Seviyeler = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <LevelMark level={1} />
    <LevelMark level={3} />
    <LevelMark level={6} />
    <LevelMark level={10} />
  </div>
);

/** Sıralama kartındaki küçük hâli. */
export const Kucuk = () => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, color: 'var(--brand-dark)', fontSize: 13 }}>
    <LevelMark level={3} size={22} /> Seviye 3 · Düzenli Gönüllü
  </div>
);
