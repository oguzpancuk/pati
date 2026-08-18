import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Text from './Text';
import { palette, radius } from '../../theme';

export type AvatarProps = {
  uri?: string | null;
  /** Fotoğraf yoksa baş harf üretmek için. */
  name?: string | null;
  size?: number;
  /** Kenarlık rengi — ör. bakım durumuna göre yeşil/kırmızı. */
  ring?: string;
  style?: StyleProp<ViewStyle>;
};

/** Yuvarlak profil görseli; fotoğraf yoksa marka renginde baş harf. */
export default function Avatar({ uri, name, size = 44, ring, style }: AvatarProps) {
  const box: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: radius.pill,
      backgroundColor: palette.brandSoft,
      borderWidth: ring ? 2 : 0,
      borderColor: ring,
    },
    styles.center,
    style,
  ];

  if (uri) {
    return (
      <View style={box}>
        <Image source={{ uri }} style={styles.image} />
      </View>
    );
  }

  const initial = (name || '?').trim().charAt(0).toLocaleUpperCase('tr-TR');
  return (
    <View style={box}>
      <Text style={{ fontSize: size * 0.4, color: palette.brandDark }} variant="bodyStrong">
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
