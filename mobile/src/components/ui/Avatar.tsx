import React from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import CartoonAvatar from '../avatars/CartoonAvatar';
import { variantFromValue } from '../../avatars';
import { makeStyles, radius, useTheme } from '../../theme';

export type AvatarProps = {
  uri?: string | null;
  /** Fotoğraf yoksa baş harf üretmek için. */
  name?: string | null;
  size?: number;
  /** Kenarlık rengi — ör. bakım durumuna göre yeşil/kırmızı. */
  ring?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Yuvarlak profil görseli. Üç durum var ve üçü de `uri` alanından okunuyor:
 * yüklenmiş fotoğraf, seçilmiş hazır avatar (`pati-avatar:` önekli) ya da
 * hiçbiri — o zaman baş harf. Önekin neden `avatar_url` içinde durduğu
 * src/avatars.ts ve backend/src/utils/avatars.js içinde anlatıldı.
 */
export default function Avatar({ uri, name, size = 44, ring, style }: AvatarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const box: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: radius.pill,
      backgroundColor: colors.brandSoft,
      borderWidth: ring ? 2 : 0,
      borderColor: ring,
    },
    styles.center,
    style,
  ];

  const variant = variantFromValue(uri);
  if (variant) {
    return (
      <View style={box}>
        <CartoonAvatar variant={variant} size={size} />
      </View>
    );
  }

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
      <Text
        variant="bodyStrong"
        // lineHeight boyutla birlikte veriliyor; yalnız fontSize ezilse
        // varyantın 22 punto satırı büyük harfi kırpardı.
        style={{ fontSize: size * 0.4, lineHeight: size * 0.5, color: colors.brandDark }}
      >
        {initial}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
}));
