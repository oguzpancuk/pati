import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleProp, TextStyle } from 'react-native';
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
  return (
    <RNText
      {...rest}
      style={[
        typeScale[variant],
        { color: colors[color ?? VARIANT_COLOR[variant]] },
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}
