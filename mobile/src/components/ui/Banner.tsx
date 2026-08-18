import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Text from './Text';
import { palette, radius, spacing } from '../../theme';

type Tone = 'info' | 'success' | 'danger' | 'warning' | 'brand';

export type BannerProps = {
  tone?: Tone;
  emoji?: string;
  title: string;
  description?: string;
  /** Sağ tarafa buton vb. koymak için. */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const TONES: Record<Tone, { bg: string; bar: string; fg: string }> = {
  info: { bg: palette.infoSoft, bar: palette.info, fg: palette.onInfo },
  success: { bg: palette.successSoft, bar: palette.success, fg: palette.onSuccess },
  danger: { bg: palette.dangerSoft, bar: palette.danger, fg: palette.onDanger },
  warning: { bg: palette.warningSoft, bar: palette.warning, fg: palette.onWarning },
  brand: { bg: palette.brandSoft, bar: palette.brand, fg: palette.brandDark },
};

/** Ekran içi durum kutusu: hata mesajı, "bu bölgede mama yok" uyarısı vb. */
export default function Banner({
  tone = 'info',
  emoji,
  title,
  description,
  trailing,
  style,
}: BannerProps) {
  const t = TONES[tone];
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

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    paddingLeft: spacing.md,
    overflow: 'hidden',
  },
  // Sol kenardaki renkli şerit; tonu tek bakışta belli ediyor.
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  emoji: { fontSize: 20, lineHeight: 26, marginRight: spacing.md },
  textCol: { flex: 1 },
  desc: { marginTop: 2, opacity: 0.9 },
  trailing: { marginLeft: spacing.md },
});
