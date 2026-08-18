import React from 'react';
import { View } from 'react-native';
import AnimalPatternAvatar from './avatars/AnimalPatternAvatar';
import { makeStyles } from '../theme';

interface Props {
  species: 'cat' | 'dog';
  breed?: string | null;
  size?: number;
}

/**
 * Hayvanın yuvarlak "yüzü": her yerde (harita, listeler, yorumlar) tür/desene
 * göre çizilen karikatür avatar. Fotoğraf bilerek kullanılmıyor — sokak
 * fotoğrafları küçük yuvarlakta çoğu zaman seçilemiyordu ve her hayvanın
 * görünümü fotoğraf kalitesine göre değişiyordu. Fotoğraflar profildeki
 * galeride duruyor; avatar ise desenin tutarlı temsili (bkz.
 * avatars/AnimalPatternAvatar).
 */
export default function AnimalAvatar({ species, breed, size = 36 }: Props) {
  const styles = useStyles();
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }]}>
      <AnimalPatternAvatar species={species} breed={breed} size={size - 4} />
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  // Beyaz halka haritada zeminden ayrışmak için; avatar kendi zemin rengini
  // getirdiği için ekstra dolgu yok.
  frame: {
    borderWidth: 2,
    borderColor: c.surface,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
}));
