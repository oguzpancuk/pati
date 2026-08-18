import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Text from './Text';
import { palette, radius, spacing } from '../../theme';

type Tone = 'neutral' | 'brand' | 'success' | 'danger' | 'warning' | 'info';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: Tone;
  /** Yazının solundaki küçük öge (emoji, ikon). */
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: palette.surface, fg: palette.textMuted, border: palette.border },
  brand: { bg: palette.brandSoft, fg: palette.brandDark, border: palette.brandSoft },
  success: { bg: palette.successSoft, fg: palette.onSuccess, border: palette.successSoft },
  danger: { bg: palette.dangerSoft, fg: palette.onDanger, border: palette.dangerSoft },
  warning: { bg: palette.warningSoft, fg: palette.onWarning, border: palette.warningSoft },
  info: { bg: palette.infoSoft, fg: palette.onInfo, border: palette.infoSoft },
};

/**
 * Hem filtre düğmesi (onPress + selected) hem de salt okunur etiket olarak
 * kullanılıyor. Seçiliyken dolu turuncu, değilken beyaz.
 */
export default function Chip({ label, selected, onPress, tone = 'neutral', leading, style }: ChipProps) {
  const t = TONES[tone];
  const box: StyleProp<ViewStyle> = [
    styles.base,
    { backgroundColor: t.bg, borderColor: t.border },
    selected && { backgroundColor: palette.brand, borderColor: palette.brand },
    style,
  ];
  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <Text
        variant="captionStrong"
        style={{ color: selected ? palette.textOnBrand : t.fg }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  if (!onPress) {
    return <View style={box}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [box, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.md,
  },
  leading: { marginRight: spacing.xs + 1 },
  pressed: { opacity: 0.75 },
});
