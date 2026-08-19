import { HeartBurst } from 'pati-web';

/**
 * Mama/su bırakılınca hayvan avatarından yükselen kalpler. Konumu mutlak
 * (x,y) piksel; kart içinde bir avatar yer tutucusunun üstüne yerleştirildi.
 * Animasyon 1,5 sn'de biter — canlı görmek için kartı yenile.
 */
export const AvatarUstunde = () => (
  <div style={{ position: 'relative', width: 200, height: 140 }}>
    <div style={{ position: 'absolute', left: 82, top: 84, width: 36, height: 36, borderRadius: 18, background: 'var(--brand-tint)', border: '2px solid var(--surface)' }} />
    <HeartBurst x={100} y={102} />
  </div>
);
