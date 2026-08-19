import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import { makeStyles, spacing, useTheme, type Palette } from '../../theme';

export type TagTone = 'success' | 'warning' | 'danger' | 'neutral' | 'brand';

export type TagProps = {
  label: string;
  tone?: TagTone;
  style?: StyleProp<ViewStyle>;
};

function toneColor(c: Palette, tone: TagTone) {
  switch (tone) {
    case 'success':
      return { dot: c.success, text: c.onSuccess };
    case 'warning':
      return { dot: c.warning, text: c.onWarning };
    case 'danger':
      return { dot: c.danger, text: c.onDanger };
    case 'brand':
      return { dot: c.brand, text: c.brand };
    default:
      return { dot: c.textSubtle, text: c.textMuted };
  }
}

/**
 * A status tag: a colored dot + lowercase colored text — no filled pill
 * (handoff 3c). Filled status pills fought with the primary button for
 * attention; a dot states the state without shouting.
 */
export default function Tag({ label, tone = 'neutral', style }: TagProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = toneColor(colors, tone);

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text variant="captionStrong" style={{ color: t.text }} numberOfLines={1}>
        {label.toLocaleLowerCase('tr-TR')}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.sm - 2,
  },
}));
