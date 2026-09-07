import React, { useState } from 'react';
import { Image, View } from 'react-native';
import AnimalPatternAvatar from './avatars/AnimalPatternAvatar';
import { makeStyles } from '../theme';

interface Props {
  species: 'cat' | 'dog';
  breed?: string | null;
  size?: number;
  /** The face cut-out (`cover_thumb_url`); without one the pattern avatar shows. */
  photoUrl?: string | null;
}

/**
 * The animal's round "face": since P3 (owner decision, 2026-09-07) the
 * face cut out of its best photo by the server, when there is one; the
 * cartoon pattern avatar (avatars/AnimalPatternAvatar) stands in for
 * animals without a usable photo — and stays in the code for that. Photos
 * used to be avoided here because raw street photos were illegible in a
 * small circle; the cut-out is what makes them legible.
 */
export default function AnimalAvatar({ species, breed, size = 36, photoUrl }: Props) {
  const styles = useStyles();
  const inner = size - 4;
  // A cut-out that fails to load (file gone, offline) falls back to the
  // pattern avatar instead of an empty circle.
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = photoUrl && failed !== photoUrl;
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }]}>
      {showPhoto ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: inner, height: inner, borderRadius: inner / 2 }}
          onError={() => setFailed(photoUrl)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <AnimalPatternAvatar species={species} breed={breed} size={inner} />
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  // The white ring separates it from the map ground; the avatar brings its
  // own background color, so no extra fill.
  frame: {
    borderWidth: 2,
    borderColor: c.surface,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
}));
