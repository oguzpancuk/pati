import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Ellipse, G, Path } from 'react-native-svg';
import { palette } from '../../theme';

export type LogoProps = {
  size?: number;
  /** Pati rengi. */
  color?: string;
  /** Ana yastığın içindeki kalbin rengi. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * pati logosu: dört parmak yastığı, ana yastık ise içinde kalp olan bir harita
 * pini. Marka kimliğindeki iki kullanımı da karşılıyor:
 *   <Logo />                                       krem zeminde turuncu
 *   <Logo color="#fff" accent={palette.brand} />   turuncu zeminde beyaz
 *
 * SVG olarak çizildi ki her boyutta net kalsın (sekme ikonu 24px, açılış
 * ekranı 160px) ve renk tek prop'la değişebilsin.
 */
export default function Logo({
  size = 64,
  color = palette.brand,
  accent = palette.background,
  style,
}: LogoProps) {
  return (
    <View style={style}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* Parmak yastıkları — dıştakiler yana yatık, içtekiler daha büyük */}
        <G fill={color}>
          <Ellipse cx={16} cy={42} rx={9} ry={12} transform="rotate(-22 16 42)" />
          <Ellipse cx={37} cy={26} rx={9.5} ry={13} transform="rotate(-8 37 26)" />
          <Ellipse cx={63} cy={26} rx={9.5} ry={13} transform="rotate(8 63 26)" />
          <Ellipse cx={84} cy={42} rx={9} ry={12} transform="rotate(22 84 42)" />
        </G>

        {/* Ana yastık = harita pini */}
        <Path
          d="M50 97 C40 81 29 75 29 66 A21 21 0 1 1 71 66 C71 75 60 81 50 97 Z"
          fill={color}
        />

        {/* Pinin içindeki kalp */}
        <Path
          d="M50 73 C50 73 38.5 65.5 38.5 58.6 C38.5 54.4 41.6 51.6 45.2 51.6 C47.5 51.6 49.2 52.9 50 54.2 C50.8 52.9 52.5 51.6 54.8 51.6 C58.4 51.6 61.5 54.4 61.5 58.6 C61.5 65.5 50 73 50 73 Z"
          fill={accent}
        />
      </Svg>
    </View>
  );
}
