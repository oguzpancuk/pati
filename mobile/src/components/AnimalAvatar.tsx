import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Icon from './brand/Icon';
import { palette } from '../theme';

interface Props {
  species: 'cat' | 'dog';
  photoUrl?: string | null;
  size?: number;
}

// Hayvanın profil fotoğrafını yuvarlak olarak gösterir; fotoğraf yoksa aynı
// yuvarlak çerçeveyi koruyan bir pati ikonu çizilir (haritada boş kutu
// görünmesin). Emoji yerine ikon: her cihazda aynı çiziliyor ve marka rengini
// alabiliyor.
export default function AnimalAvatar({ species, photoUrl, size = 36 }: Props) {
  const frame = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={[styles.avatar, frame]} />;
  }

  return (
    <View style={[styles.avatar, styles.placeholder, frame]}>
      <Icon name="paw" size={size * 0.58} color={species === 'cat' ? palette.brand : palette.brandDark} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderWidth: 2,
    borderColor: palette.surface,
    backgroundColor: palette.brandTint,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
