import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import Gradient from '../brand/Gradient';
import { makeStyles, radius, spacing, useTheme, type Palette } from '../../theme';

type Tone = 'neutral' | 'brand' | 'success' | 'danger' | 'warning' | 'info';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: Tone;
  /** Small element left of the label (emoji, icon). */
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

function toneColors(c: Palette, tone: Tone) {
  switch (tone) {
    case 'brand':
      return { bg: c.brandTint, fg: c.brand, border: c.brandSoft };
    case 'success':
      return { bg: c.successSoft, fg: c.onSuccess, border: c.successSoft };
    case 'danger':
      return { bg: c.dangerSoft, fg: c.onDanger, border: c.dangerSoft };
    case 'warning':
      return { bg: c.warningSoft, fg: c.onWarning, border: c.warningSoft };
    case 'info':
      return { bg: c.infoSoft, fg: c.onInfo, border: c.infoSoft };
    default:
      return { bg: c.surface, fg: c.textMuted, border: c.borderStrong };
  }
}

/**
 * Used both as a filter button (onPress + selected) and a read-only label.
 * The selected state is one of the four places the gradient is allowed;
 * unselected chips are white with a hairline.
 */
export default function Chip({
  label,
  selected,
  onPress,
  tone = 'neutral',
  leading,
  style,
}: ChipProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  const box: StyleProp<ViewStyle> = [
    styles.base,
    { backgroundColor: t.bg, borderColor: t.border },
    selected && { backgroundColor: 'transparent', borderColor: 'transparent' },
    style,
  ];
  const content = (
    <>
      {selected ? <Gradient radius={radius.pill} /> : null}
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <Text
        variant="captionStrong"
        style={{ color: selected ? colors.textOnBrand : t.fg }}
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

const useStyles = makeStyles(() => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    overflow: 'hidden',
  },
  leading: { marginRight: spacing.xs + 1 },
  pressed: { opacity: 0.75 },
}));
