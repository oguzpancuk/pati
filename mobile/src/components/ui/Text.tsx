import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleProp, TextStyle } from 'react-native';
import { palette, type as typeScale, TypeVariant } from '../../theme';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  /** Palet adı. Varyantın kendi rengini ezer. */
  color?: keyof typeof palette;
  center?: boolean;
  style?: StyleProp<TextStyle>;
};

/**
 * Uygulamadaki tüm yazılar bu bileşenden geçsin: fontFamily'yi tek yerde
 * veriyoruz, böylece marka fontu bir dosyada değiştirilebiliyor ve hiçbir
 * ekranda sistem fontu unutulmuş olmuyor.
 */
export default function Text({
  variant = 'body',
  color,
  center,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      {...rest}
      style={[
        typeScale[variant],
        color ? { color: palette[color] } : null,
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}
