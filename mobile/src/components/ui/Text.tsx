import React from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextProps as RNTextProps,
  StyleProp,
  TextStyle,
} from 'react-native';
import {
  useTheme,
  type as typeScale,
  VARIANT_COLOR,
  type ColorName,
  type TypeVariant,
} from '../../theme';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  /** Palet adı. Varyantın varsayılan rengini ezer. */
  color?: ColorName;
  center?: boolean;
  style?: StyleProp<TextStyle>;
};

/**
 * Uygulamadaki tüm yazılar bu bileşenden geçsin: fontFamily'yi ve temaya bağlı
 * rengi tek yerde veriyoruz. Böylece marka fontu bir dosyada değiştirilebiliyor
 * ve hiçbir ekranda sistem fontu ya da sabit renk unutulmuş olmuyor.
 */
export default function Text({ variant = 'body', color, center, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const base = typeScale[variant];

  // Çağıran `fontSize`'ı ezip `lineHeight` vermediyse varyantın satır
  // yüksekliğini de düşürüyoruz. Aksi hâlde ikisi birbirinden kopuyor ve
  // yazı satır kutusuna sığmayınca iOS harfleri kırpıyor (46 punto yazı,
  // varyanttan gelen 22 punto satır → kelime yarıdan kesiliyordu).
  const override = StyleSheet.flatten(style) as TextStyle | undefined;
  const sizeOverridden = override?.fontSize !== undefined && override?.lineHeight === undefined;

  return (
    <RNText
      {...rest}
      style={[
        base,
        sizeOverridden ? { lineHeight: undefined } : null,
        { color: colors[color ?? VARIANT_COLOR[variant]] },
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}
