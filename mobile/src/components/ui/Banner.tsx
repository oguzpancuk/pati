import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import { makeStyles, radius, spacing, useTheme, type Palette } from '../../theme';

type Tone = 'info' | 'success' | 'danger' | 'warning' | 'brand';

export type BannerProps = {
  tone?: Tone;
  emoji?: string;
  title: string;
  description?: string;
  /** For placing a button etc. on the right. */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

function toneColors(c: Palette, tone: Tone) {
  switch (tone) {
    case 'success':
      return { bg: c.successSoft, bar: c.success, fg: c.onSuccess };
    case 'danger':
      return { bg: c.dangerSoft, bar: c.danger, fg: c.onDanger };
    case 'warning':
      return { bg: c.warningSoft, bar: c.warning, fg: c.onWarning };
    case 'brand':
      return { bg: c.brandSoft, bar: c.brand, fg: c.brandDark };
    default:
      return { bg: c.infoSoft, bar: c.info, fg: c.onInfo };
  }
}

/** In-screen status box: error messages, "no food in this area" warnings, etc. */
export default function Banner({
  tone = 'info',
  emoji,
  title,
  description,
  trailing,
  style,
}: BannerProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }, style]}>
      <View style={[styles.bar, { backgroundColor: t.bar }]} />
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <View style={styles.textCol}>
        <Text variant="bodyStrong" style={{ color: t.fg }}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" style={[styles.desc, { color: t.fg }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    paddingLeft: spacing.md,
    overflow: 'hidden',
  },
  // The colored strip on the left edge; reveals the tone at a glance.
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  emoji: { fontSize: 20, lineHeight: 26, marginRight: spacing.md },
  textCol: { flex: 1 },
  desc: { marginTop: 2, opacity: 0.9 },
  trailing: { marginLeft: spacing.md },
}));
