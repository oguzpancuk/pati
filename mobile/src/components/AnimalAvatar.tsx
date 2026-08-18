import React from 'react';
import { Image, View } from 'react-native';
import Icon from './brand/Icon';
import { makeStyles, useTheme } from '../theme';

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
  const styles = useStyles();
  const { colors } = useTheme();
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
      <Icon
        name="paw"
        size={size * 0.58}
        color={species === 'cat' ? colors.brand : colors.brandDark}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  avatar: {
    borderWidth: 2,
    borderColor: c.surface,
    backgroundColor: c.brandTint,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
}));
