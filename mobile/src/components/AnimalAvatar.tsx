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
 * The animal's round "face": a cartoon avatar drawn from species/pattern,
 * used everywhere (map, lists, comments). Photos are deliberately not used —
 * street photos were rarely legible in a small circle, and each animal's
 * look depended on photo quality. Photos live in the profile gallery; the
 * avatar is the pattern's consistent representation (see
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
