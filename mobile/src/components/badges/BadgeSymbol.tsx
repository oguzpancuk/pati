import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import type { BadgeSymbolName, BadgeTier } from '../../badges';
import { tierColors } from '../../theme';

// Sembol adı saf `badges.ts` içinde tanımlı (web ile ortak); buradan yeniden
// dışa aktarılıyor.
export type { BadgeSymbolName } from '../../badges';

/**
 * Rozet madalyonu: dış halka + iç disk + ortada rozete özgü sembol.
 *
 * Emoji madalya (🥉🥈🥇💎) yerine buna geçildi. Emoji her cihazda farklı
 * çiziliyor, satır yüksekliğine oturmuyor ve rengi verilemiyor; rozetlerin
 * tamamı aynı ailenin parçası gibi görünmüyordu.
 *
 * Semboller bilinçli olarak `brand/Icon` ile aynı dilde: 24 birimlik kutu,
 * ince çizgi, yuvarlak uç. Madalyon 48 birimlik kutuda, sembol ortasına
 * 24'lük kutu olarak yerleştiriliyor.
 *
 * Sembol adı sunucudan geliyor (`badge.symbol`, bkz. backend/src/utils/badges.js);
 * yeni bir rozet türü eklenince iki tarafın da güncellenmesi gerekiyor.
 */
type Props = {
  symbol: BadgeSymbolName;
  /** null: henüz kazanılmamış rozet — gri madalyon çizilir. */
  tier: BadgeTier | null;
  size?: number;
};

export default function BadgeSymbol({ symbol, tier, size = 44 }: Props) {
  const palette = tierColors[tier ?? 'locked'];
  const glyph = GLYPHS[symbol] ?? GLYPHS.paw;

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Circle cx={24} cy={24} r={22} fill={palette.ring} />
      <Circle cx={24} cy={24} r={17.5} fill={palette.fill} />
      <G
        transform="translate(12 12)"
        stroke={palette.ink}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {glyph(palette.ink)}
      </G>
    </Svg>
  );
}

const GLYPHS: Record<BadgeSymbolName, (ink: string) => React.ReactNode> = {
  // Mama kabı: yandan görünüş, üstünde buhar değil "tane" izleri.
  food: () => (
    <>
      <Path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z" />
      <Path d="M7.5 8.5c0-1.4 1-1.9 1-2.9M12 8.5c0-1.4 1-1.9 1-2.9M16.5 8.5c0-1.4 1-1.9 1-2.9" />
    </>
  ),
  water: () => <Path d="M12 3.4s6.2 6.5 6.2 10.2a6.2 6.2 0 0 1-12.4 0C5.8 9.9 12 3.4 12 3.4Z" />,
  // Kayıt: haritaya yeni bir nokta eklemek. İğne + artı.
  register: () => (
    <>
      <Path d="M12 21s6.4-6 6.4-10.4a6.4 6.4 0 1 0-12.8 0C5.6 15 12 21 12 21Z" />
      <Path d="M12 7.6v5.4M9.3 10.3h5.4" />
    </>
  ),
  comment: () => (
    <Path d="M20.2 11.8a7.6 7.6 0 0 1-11.2 6.7L4 20l1.6-4.5a7.6 7.6 0 1 1 14.6-3.7Z" />
  ),
  health: () => (
    <>
      <Path d="M12 4 5.2 6.8v4.6c0 4.1 2.9 6.8 6.8 7.6 3.9-.8 6.8-3.5 6.8-7.6V6.8L12 4Z" />
      <Path d="M12 9v5M9.5 11.5h5" />
    </>
  ),
  // Şırınga: gövde çapraz, ucunda iğne, arkasında piston.
  vaccine: () => (
    <>
      <Path d="M8.4 15.6 15.6 8.4l4 4-7.2 7.2z" />
      <Path d="m10.4 17.6-4 4" />
      <Path d="m17.6 10.4 3.4-3.4" />
      <Path d="m19.2 5.9 2.9 2.9" />
      {/* Tek ölçek çizgisi: küçük boyutta iki çizgi lekeye dönüşüyor. */}
      <Path d="m11.6 12.4 1.8 1.8" />
    </>
  ),
  // Desen dostluğu rozetleri: pati. Dolu çizim, çizgi değil.
  paw: (ink) => (
    <G fill={ink} stroke="none">
      <Circle cx={6.4} cy={10.6} r={2.1} />
      <Circle cx={9.9} cy={7.2} r={2.2} />
      <Circle cx={14.1} cy={7.2} r={2.2} />
      <Circle cx={17.6} cy={10.6} r={2.1} />
      <Path d="M12 12.2c2.6 0 5 2.1 5 4.5 0 1.8-1.4 2.9-3 2.9-.9 0-1.4-.4-2-.4s-1.1.4-2 .4c-1.6 0-3-1.1-3-2.9 0-2.4 2.4-4.5 5-4.5Z" />
    </G>
  ),
};
