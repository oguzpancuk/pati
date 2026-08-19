import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Text from './ui/Text';
import { makeStyles, radius, spacing } from '../theme';

export type Stat = {
  /** The large numeral (or a short value like "38."). */
  value: string;
  /** The lowercase micro label under it. */
  label: string;
  onPress?: () => void;
};

type Props = {
  stats: Stat[];
  style?: StyleProp<ViewStyle>;
};

/**
 * The stat strip (handoff 3d): one card holding three cells separated by
 * vertical hairlines — the profile's numbers at a glance. Cells can be
 * tappable (the rank cell opens the leaderboard); the strip replaces the
 * separate rank card that used to sit under the header.
 */
export default function StatStrip({ stats, style }: Props) {
  const styles = useStyles();

  return (
    <View style={[styles.strip, style]}>
      {stats.map((stat, index) => {
        const content = (
          <>
            {/* Long values ("372. / 1204") shrink instead of truncating to "3…". */}
            <Text variant="stat" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {stat.value}
            </Text>
            <Text variant="micro" style={styles.label} numberOfLines={1}>
              {stat.label.toLocaleLowerCase('tr-TR')}
            </Text>
          </>
        );
        const cellStyle = [styles.cell, index > 0 && styles.divider];

        return stat.onPress ? (
          <Pressable
            key={stat.label}
            onPress={stat.onPress}
            style={({ pressed }) => [cellStyle, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            {content}
          </Pressable>
        ) : (
          <View key={stat.label} style={cellStyle}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  strip: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  cell: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  divider: { borderLeftWidth: 1, borderLeftColor: c.border },
  label: { marginTop: 2 },
  pressed: { opacity: 0.7 },
}));
