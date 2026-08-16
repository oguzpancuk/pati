import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

interface Props {
  species: 'cat' | 'dog';
  photoUrl?: string | null;
  size?: number;
}

// Hayvanın profil fotoğrafını yuvarlak olarak gösterir; fotoğraf yoksa türüne
// göre bir emoji ile aynı yuvarlak çerçeveyi korur (haritada boş kutu görünmesin).
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
      <Text style={{ fontSize: size * 0.5 }}>{species === 'cat' ? '🐱' : '🐶'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
