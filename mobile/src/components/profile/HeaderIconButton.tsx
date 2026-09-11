import React from 'react';
import { Pressable, View } from 'react-native';
import Text from '../ui/Text';
import { makeStyles, minTouch, radius, spacing } from '../../theme';

const BUTTON_SIZE = 40;
/** Grows the 40pt circle to `minTouch` without touching its neighbour's. */
const SLOP = (minTouch - BUTTON_SIZE) / 2;
const HIT_SLOP = { top: SLOP, bottom: SLOP, left: SLOP, right: SLOP } as const;

export type HeaderIconButtonProps = {
  /** Screen-reader label; the button itself carries only the glyph. */
  label: string;
  onPress: () => void;
  /** Drawn as a count badge when greater than zero (bell unread, requests). */
  count?: number;
  children: React.ReactNode;
};

/**
 * One of the round controls in the profile header's top-right row. The count
 * badge is the bell's old number, reused so the bell and the friends button
 * read as one family.
 */
export default function HeaderIconButton({
  label,
  onPress,
  count = 0,
  children,
}: HeaderIconButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label} (${count})` : label}
      // The circle stays 40 for the header's proportions; the touch target is
      // grown to the theme's 44 floor (layout.ts minTouch). Deliberately NOT
      // the shared `hitSlop` of 8: these sit spacing.sm apart, so 8 a side
      // would make neighbouring targets overlap and a near-miss would open the
      // wrong sheet. 2 a side is exactly 44 and still leaves a 4pt gap.
      hitSlop={HIT_SLOP}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {children}
      {count > 0 && (
        <View style={styles.count}>
          <Text variant="micro" style={styles.countText}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: c.brandTint },
  count: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brand,
    borderWidth: 1,
    borderColor: c.surface,
  },
  // micro's letter spacing adds trailing space after a lone digit and shoves
  // it off-centre; zeroed so the count sits in the middle.
  countText: { color: c.textOnBrand, lineHeight: 12, letterSpacing: 0 },
}));
